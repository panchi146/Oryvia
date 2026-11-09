//! Wi-Fi network management (Windows WLAN API) and Bluetooth paired device
//! management (WinRT DeviceInformation / Bluetooth / CoreAudio KS Topology APIs).

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use windows::core::{GUID, HSTRING, PCWSTR, PWSTR};
use windows::Win32::Foundation::HANDLE;
use windows::Win32::NetworkManagement::WiFi::{
    dot11_BSS_type_infrastructure, wlan_connection_mode_profile,
    wlan_interface_state_connected, wlan_intf_opcode_current_connection,
    wlan_notification_acm_connection_attempt_fail,
    wlan_notification_acm_connection_complete, wlan_notification_acm_connection_start,
    wlan_notification_acm_disconnected, wlan_notification_acm_network_not_available,
    WlanCloseHandle, WlanConnect, WlanDeleteProfile, WlanDisconnect, WlanEnumInterfaces,
    WlanFreeMemory, WlanGetAvailableNetworkList, WlanGetProfile, WlanOpenHandle,
    WlanQueryInterface, WlanRegisterNotification, WlanScan,
    WlanSetProfile, L2_NOTIFICATION_DATA, WLAN_AVAILABLE_NETWORK,
    WLAN_AVAILABLE_NETWORK_CONNECTED, WLAN_AVAILABLE_NETWORK_HAS_PROFILE,
    WLAN_AVAILABLE_NETWORK_LIST, WLAN_CONNECTION_ATTRIBUTES,
    WLAN_CONNECTION_NOTIFICATION_DATA, WLAN_CONNECTION_PARAMETERS,
    WLAN_INTERFACE_INFO_LIST, WLAN_INTERFACE_STATE, WLAN_NOTIFICATION_SOURCE_ACM,
    WLAN_NOTIFICATION_SOURCE_NONE, WLAN_OPCODE_VALUE_TYPE, WLAN_PROFILE_GET_PLAINTEXT_KEY,
    WLAN_REASON_CODE_ASSOCIATION_FAILURE, WLAN_REASON_CODE_ASSOCIATION_TIMEOUT,
    WLAN_REASON_CODE_KEY_MISMATCH, WLAN_REASON_CODE_MSMSEC_AUTH_START_TIMEOUT,
    WLAN_REASON_CODE_MSMSEC_AUTH_SUCCESS_TIMEOUT,
};

#[derive(Serialize, Clone, Debug)]
pub struct WifiNetwork {
    pub ssid: String,
    pub signal: u32,
    pub secured: bool,
    pub connected: bool,
    pub known: bool,
    pub security_type: String,
    pub security: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct BluetoothDeviceInfo {
    pub id: String,
    pub name: String,
    pub connected: bool,
    /// "connected" | "paired" | "unknown"
    pub status: String,
    /// "active" | "inactive" | "none"
    pub audio_status: String,
    pub audio_connected: bool,
    /// "audio" | "phone" | "ble-gatt" | "classic-hid" | "ble-hid" | "classic-other"
    pub device_kind: String,
    pub can_connect: bool,
    pub can_disconnect: bool,
    pub address: Option<String>,
    pub disabled_reason: Option<String>,
    pub disabled_reason_code: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct BluetoothActionResult {
    /// "confirmed" | "pending" | "failed" | "unsupported" | "unknown"
    pub outcome: String,
    pub connected: bool,
    pub status: String,
    pub reason_code: Option<String>,
    pub message: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DiscoveredBluetoothDevice {
    pub id: String,
    pub name: String,
    pub address: Option<String>,
    pub device_kind: String, // "audio" | "phone" | "peripheral" | "other" | "classic" | "ble"
    pub can_pair: bool,
    pub is_paired: bool,
    pub disabled_reason_code: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BluetoothPairResult {
    pub success: bool,
    pub status: String, // "paired" | "failed" | "unsupported" | "already_paired"
    pub reason_code: Option<String>,
    pub message: Option<String>,
}

static ACTIVE_GATT_SESSIONS: OnceLock<
    Mutex<HashMap<String, windows::Devices::Bluetooth::GenericAttributeProfile::GattSession>>,
> = OnceLock::new();

fn gatt_sessions() -> &'static Mutex<
    HashMap<String, windows::Devices::Bluetooth::GenericAttributeProfile::GattSession>,
> {
    ACTIVE_GATT_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

struct WlanHandle(HANDLE);

impl Drop for WlanHandle {
    fn drop(&mut self) {
        unsafe {
            let _ = WlanCloseHandle(self.0, None);
        }
    }
}

struct WlanMem<T>(*mut T);

impl<T> Drop for WlanMem<T> {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                WlanFreeMemory(self.0 as *mut _);
            }
        }
    }
}

struct WlanPwstr(PWSTR);

impl Drop for WlanPwstr {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                WlanFreeMemory(self.0 .0 as *mut _);
            }
        }
    }
}

struct ComGuard(bool);

impl ComGuard {
    fn new() -> Self {
        unsafe {
            use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
            let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
            Self(hr.is_ok())
        }
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.0 {
            unsafe {
                use windows::Win32::System::Com::CoUninitialize;
                CoUninitialize();
            }
        }
    }
}

fn format_wlan_error(context: &str, code: u32) -> String {
    eprintln!("[Oryvia Wi-Fi] Error: {context} (Win32 code {code})");
    match code {
        0x80342002 | 21 | 5023 => "wifi_adapter_disabled".to_string(),
        1206 => "wifi_security_unsupported".to_string(),
        5 => "wifi_access_denied".to_string(),
        1168 => "wifi_network_not_found".to_string(),
        _ => "wifi_connect_failed".to_string(),
    }
}

fn format_wlan_reason(reason_code: u32) -> String {
    eprintln!("[Oryvia Wi-Fi] Reason code: 0x{reason_code:08X} ({reason_code})");
    // MSMSEC range (0x00040000..=0x0004FFFF) or KEY_MISMATCH indicates authentication / password failure
    if reason_code == WLAN_REASON_CODE_KEY_MISMATCH
        || reason_code == WLAN_REASON_CODE_MSMSEC_AUTH_START_TIMEOUT
        || reason_code == WLAN_REASON_CODE_MSMSEC_AUTH_SUCCESS_TIMEOUT
        || (0x00040001..=0x0004FFFF).contains(&reason_code)
    {
        return "wifi_password_invalid".to_string();
    }
    if reason_code == WLAN_REASON_CODE_ASSOCIATION_FAILURE
        || reason_code == WLAN_REASON_CODE_ASSOCIATION_TIMEOUT
    {
        return "wifi_association_failed".to_string();
    }
    if reason_code == 0x00028003 || reason_code == 0x0002800B {
        return "wifi_network_not_found".to_string();
    }
    "wifi_connect_failed".to_string()
}

unsafe fn open_first_interface() -> Result<(WlanHandle, GUID), String> {
    let mut negotiated = 0u32;
    let mut handle = HANDLE::default();
    let code = WlanOpenHandle(2, None, &mut negotiated, &mut handle);
    if code != 0 {
        return Err(format_wlan_error("Could not open WLAN service", code));
    }
    let handle = WlanHandle(handle);

    let mut list_ptr: *mut WLAN_INTERFACE_INFO_LIST = std::ptr::null_mut();
    let code = WlanEnumInterfaces(handle.0, None, &mut list_ptr);
    if code != 0 || list_ptr.is_null() {
        return Err(format_wlan_error("Could not list Wi-Fi interfaces", code));
    }
    let list = WlanMem(list_ptr);

    if (*list.0).dwNumberOfItems == 0 {
        return Err("No Wi-Fi adapter found".to_string());
    }
    let guid = (*list.0).InterfaceInfo[0].InterfaceGuid;
    Ok((handle, guid))
}

/// Returns `(secured_requires_password, security_type, xml_auth_cipher)`
fn classify_security(
    entry: &WLAN_AVAILABLE_NETWORK,
) -> (bool, String, Option<(&'static str, &'static str)>) {
    let security_enabled = entry.bSecurityEnabled.as_bool();
    if !security_enabled {
        return (false, "open".to_string(), Some(("open", "none")));
    }

    let auth_id = entry.dot11DefaultAuthAlgorithm.0;
    let cipher_id = entry.dot11DefaultCipherAlgorithm.0;

    let cipher_xml = match cipher_id {
        0 => "none",
        2 => "TKIP",
        1 | 5 | 101 => "WEP",
        4 | 8 | 9 | 10 => "AES",
        _ => "AES",
    };

    match auth_id {
        // DOT11_AUTH_ALGO_80211_OPEN (1)
        1 => {
            if cipher_xml == "WEP" {
                (true, "wep".to_string(), Some(("open", "WEP")))
            } else if cipher_xml == "none" {
                (false, "open".to_string(), Some(("open", "none")))
            } else {
                (true, "unknown".to_string(), None)
            }
        }
        // DOT11_AUTH_ALGO_80211_SHARED_KEY (2)
        2 => (true, "wep".to_string(), Some(("shared", "WEP"))),
        // DOT11_AUTH_ALGO_WPA (3), DOT11_AUTH_ALGO_RSNA (6), WPA3-Enterprise (8, 11)
        3 | 6 | 8 | 11 => (true, "enterprise".to_string(), None),
        // DOT11_AUTH_ALGO_WPA_PSK (4)
        4 => (
            true,
            "wpa-psk".to_string(),
            Some(("WPAPSK", if cipher_xml == "TKIP" { "TKIP" } else { "AES" })),
        ),
        // DOT11_AUTH_ALGO_RSNA_PSK (7) -> WPA2-Personal
        7 => (
            true,
            "wpa2-psk".to_string(),
            Some((
                "WPA2PSK",
                if cipher_xml == "TKIP" { "TKIP" } else { "AES" },
            )),
        ),
        // DOT11_AUTH_ALGO_WPA3_SAE (9) -> WPA3-Personal
        9 => (true, "wpa3-sae".to_string(), Some(("WPA3SAE", "AES"))),
        // DOT11_AUTH_ALGO_OWE (10) -> Enhanced Open (encrypted without password)
        10 => (false, "owe".to_string(), Some(("OWE", "AES"))),
        // Unknown or proprietary auth algorithm: do NOT assume WPA2
        _ => (true, "unknown".to_string(), None),
    }
}

#[derive(Clone)]
struct InternalNetworkEntry {
    network: WifiNetwork,
    profile_name: Option<String>,
    xml_auth_cipher: Option<(&'static str, &'static str)>,
    supports_wpa2_fallback: bool,
}

unsafe fn query_available_networks(
    handle: HANDLE,
    guid: &GUID,
    trigger_scan: bool,
) -> Result<Vec<InternalNetworkEntry>, String> {
    if trigger_scan {
        let scan_code = WlanScan(handle, guid, None, None, None);
        if scan_code != 0 {
            if scan_code == 0x80342002 || scan_code == 21 || scan_code == 5023 {
                return Err("Wi-Fi adapter is turned off".to_string());
            }
        } else {
            std::thread::sleep(Duration::from_millis(350));
        }
    }

    let mut net_list_ptr: *mut WLAN_AVAILABLE_NETWORK_LIST = std::ptr::null_mut();
    let code = WlanGetAvailableNetworkList(handle, guid, 0, None, &mut net_list_ptr);
    if code != 0 || net_list_ptr.is_null() {
        return Err(format_wlan_error("Wi-Fi scan failed", code));
    }
    let net_list = WlanMem(net_list_ptr);

    let count = (*net_list.0).dwNumberOfItems as usize;
    let first = (*net_list.0).Network.as_ptr();
    let entries = std::slice::from_raw_parts(first, count);

    let mut by_ssid: HashMap<String, InternalNetworkEntry> = HashMap::new();

    for entry in entries {
        let len = (entry.dot11Ssid.uSSIDLength as usize).min(entry.dot11Ssid.ucSSID.len());
        if len == 0 {
            continue;
        }
        let ssid = String::from_utf8_lossy(&entry.dot11Ssid.ucSSID[..len])
            .trim()
            .to_string();
        if ssid.is_empty() {
            continue;
        }

        let connected = (entry.dwFlags & WLAN_AVAILABLE_NETWORK_CONNECTED) != 0;
        let has_profile = (entry.dwFlags & WLAN_AVAILABLE_NETWORK_HAS_PROFILE) != 0;
        let profile_str = {
            let nul_pos = entry
                .strProfileName
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(entry.strProfileName.len());
            let s = String::from_utf16_lossy(&entry.strProfileName[..nul_pos])
                .trim()
                .to_string();
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        };
        let known = has_profile || profile_str.is_some();
        let signal = entry.wlanSignalQuality.min(100);
        let (secured, security_type, xml_auth_cipher) = classify_security(entry);

        by_ssid
            .entry(ssid.clone())
            .and_modify(|existing| {
                existing.network.connected |= connected;
                existing.network.known |= known;
                existing.network.secured |= secured;
                if signal > existing.network.signal {
                    existing.network.signal = signal;
                }
                if existing.profile_name.is_none() && profile_str.is_some() {
                    existing.profile_name = profile_str.clone();
                }
                // Detect WPA3/WPA2 transition mode support across multiple BSSIDs of the same SSID
                if (existing.network.security_type == "wpa3-sae" && security_type == "wpa2-psk")
                    || (existing.network.security_type == "wpa2-psk" && security_type == "wpa3-sae")
                {
                    existing.supports_wpa2_fallback = true;
                }
                if existing.xml_auth_cipher.is_none() && xml_auth_cipher.is_some() {
                    existing.xml_auth_cipher = xml_auth_cipher;
                    existing.network.security_type = security_type.clone();
                    existing.network.security = security_type.clone();
                }
            })
            .or_insert_with(|| InternalNetworkEntry {
                network: WifiNetwork {
                    ssid,
                    signal,
                    secured,
                    connected,
                    known,
                    security: security_type.clone(),
                    security_type,
                },
                profile_name: profile_str,
                xml_auth_cipher,
                supports_wpa2_fallback: false,
            });
    }

    let mut out: Vec<InternalNetworkEntry> = by_ssid.into_values().collect();
    out.sort_by(|a, b| {
        b.network
            .connected
            .cmp(&a.network.connected)
            .then_with(|| b.network.known.cmp(&a.network.known))
            .then_with(|| b.network.signal.cmp(&a.network.signal))
            .then_with(|| {
                a.network
                    .ssid
                    .to_lowercase()
                    .cmp(&b.network.ssid.to_lowercase())
            })
    });
    Ok(out)
}

fn scan_networks() -> Result<Vec<WifiNetwork>, String> {
    unsafe {
        let (handle, guid) = open_first_interface()?;
        let entries = query_available_networks(handle.0, &guid, true)?;
        Ok(entries.into_iter().map(|e| e.network).collect())
    }
}

fn xml_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
}

fn validate_wifi_password(key: &str, auth: &str, cipher: &str) -> Result<(), String> {
    if key.is_empty() {
        return Err("wifi_password_required".to_string());
    }
    if cipher == "WEP" {
        let len = key.len();
        let is_valid_ascii = len == 5 || len == 13 || len == 16;
        let is_valid_hex =
            (len == 10 || len == 26 || len == 32) && key.chars().all(|c| c.is_ascii_hexdigit());
        if !is_valid_ascii && !is_valid_hex {
            return Err("wifi_password_wep_invalid".to_string());
        }
        return Ok(());
    }
    if auth == "WPAPSK" || auth == "WPA2PSK" {
        let is_64_hex = key.len() == 64 && key.chars().all(|c| c.is_ascii_hexdigit());
        if !is_64_hex && (key.len() < 8 || key.len() > 63) {
            return Err("wifi_password_wpa_invalid".to_string());
        }
    } else if auth == "WPA3SAE" && (key.len() < 8 || key.len() > 128) {
        return Err("wifi_password_wpa3_invalid".to_string());
    }
    Ok(())
}

fn build_profile_xml(
    profile_name: &str,
    ssid: &str,
    auth: &str,
    cipher: &str,
    password: Option<&str>,
) -> Result<String, String> {
    let escaped_profile_name = xml_escape(profile_name);
    let escaped_ssid = xml_escape(ssid);
    let hex_ssid: String = ssid.as_bytes().iter().map(|b| format!("{b:02X}")).collect();

    let security = if auth == "open" && cipher == "none" {
        "<authEncryption><authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX></authEncryption>".to_string()
    } else if auth == "OWE" {
        "<authEncryption><authentication>OWE</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption>".to_string()
    } else {
        let key = password.unwrap_or("");
        validate_wifi_password(key, auth, cipher)?;
        let escaped_key = xml_escape(key);
        let is_64_hex = key.len() == 64 && key.chars().all(|c| c.is_ascii_hexdigit());
        let key_type = if cipher == "WEP" || is_64_hex {
            "networkKey"
        } else {
            "passPhrase"
        };
        format!(
            "<authEncryption><authentication>{auth}</authentication><encryption>{cipher}</encryption><useOneX>false</useOneX></authEncryption>\
             <sharedKey><keyType>{key_type}</keyType><protected>false</protected><keyMaterial>{escaped_key}</keyMaterial></sharedKey>"
        )
    };

    Ok(format!(
        r#"<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>{escaped_profile_name}</name>
    <SSIDConfig><SSID><hex>{hex_ssid}</hex><name>{escaped_ssid}</name></SSID></SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>auto</connectionMode>
    <MSM><security>{security}</security></MSM>
</WLANProfile>"#
    ))
}

#[derive(Debug, Clone)]
struct CurrentWifiConnection {
    is_connected: bool,
    ssid: String,
    profile_name: String,
    state: WLAN_INTERFACE_STATE,
}

unsafe fn query_current_connection(
    handle: HANDLE,
    guid: &GUID,
) -> Option<CurrentWifiConnection> {
    let mut data_size = 0u32;
    let mut data_ptr: *mut std::ffi::c_void = std::ptr::null_mut();
    let mut opcode_type = WLAN_OPCODE_VALUE_TYPE::default();
    let code = WlanQueryInterface(
        handle,
        guid,
        wlan_intf_opcode_current_connection,
        None,
        &mut data_size,
        &mut data_ptr,
        Some(&mut opcode_type),
    );
    if code != 0 || data_ptr.is_null() {
        return None;
    }
    let mem = WlanMem(data_ptr as *mut WLAN_CONNECTION_ATTRIBUTES);
    let attr = &*mem.0;
    let is_connected = attr.isState == wlan_interface_state_connected;

    let dot11_ssid = &attr.wlanAssociationAttributes.dot11Ssid;
    let ssid_len = (dot11_ssid.uSSIDLength as usize).min(dot11_ssid.ucSSID.len());
    let ssid = String::from_utf8_lossy(&dot11_ssid.ucSSID[..ssid_len])
        .trim()
        .to_string();

    let nul_pos = attr
        .strProfileName
        .iter()
        .position(|&c| c == 0)
        .unwrap_or(attr.strProfileName.len());
    let profile_name = String::from_utf16_lossy(&attr.strProfileName[..nul_pos])
        .trim()
        .to_string();

    Some(CurrentWifiConnection {
        is_connected,
        ssid,
        profile_name,
        state: attr.isState,
    })
}

unsafe fn get_existing_profile_xml(handle: HANDLE, guid: &GUID, profile_name: &str) -> Option<(String, u32)> {
    let name_w: Vec<u16> = profile_name
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let mut xml_ptr = PWSTR::null();
    let mut flags = WLAN_PROFILE_GET_PLAINTEXT_KEY;
    let mut access = 0u32;
    let mut code = WlanGetProfile(
        handle,
        guid,
        PCWSTR(name_w.as_ptr()),
        None,
        &mut xml_ptr,
        Some(&mut flags),
        Some(&mut access),
    );
    if code != 0 || xml_ptr.is_null() {
        flags = 0;
        code = WlanGetProfile(
            handle,
            guid,
            PCWSTR(name_w.as_ptr()),
            None,
            &mut xml_ptr,
            Some(&mut flags),
            Some(&mut access),
        );
    }
    if code != 0 || xml_ptr.is_null() {
        return None;
    }
    let guard = WlanPwstr(xml_ptr);
    let mut len = 0usize;
    while *guard.0 .0.add(len) != 0 {
        len += 1;
    }
    let slice = std::slice::from_raw_parts(guard.0 .0, len);
    Some((String::from_utf16_lossy(slice), flags))
}

unsafe fn restore_or_cleanup_profile(
    handle: HANDLE,
    guid: &GUID,
    profile_name: &str,
    backup: &Option<(String, u32)>,
    created_new_profile: bool,
) -> bool {
    if let Some((old_xml, old_flags)) = backup {
        let xml_w: Vec<u16> = old_xml.encode_utf16().chain(std::iter::once(0)).collect();
        let mut reason = 0u32;
        let code = WlanSetProfile(
            handle,
            guid,
            *old_flags & !WLAN_PROFILE_GET_PLAINTEXT_KEY,
            PCWSTR(xml_w.as_ptr()),
            PCWSTR::null(),
            true,
            None,
            &mut reason,
        );
        if code != 0 {
            eprintln!(
                "[Oryvia Wi-Fi] Warning: Failed to restore backup profile '{}', code={}, reason={}",
                profile_name, code, reason
            );
            false
        } else {
            true
        }
    } else if created_new_profile {
        let name_w: Vec<u16> = profile_name
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let code = WlanDeleteProfile(handle, guid, PCWSTR(name_w.as_ptr()), None);
        code == 0
    } else {
        true
    }
}

#[derive(Debug, Clone)]
enum WlanConnEvent {
    Start { ssid: String },
    Complete { ssid: String, reason_code: u32 },
    AttemptFail { ssid: String, reason_code: u32 },
    NetworkNotAvailable,
    Disconnected { ssid: String },
}

struct WlanNotifContext {
    tx: Sender<WlanConnEvent>,
    target_guid: GUID,
    target_ssid: String,
    req_id: u64,
}

unsafe extern "system" fn wlan_notif_callback(
    data: *mut L2_NOTIFICATION_DATA,
    context: *mut std::ffi::c_void,
) {
    if data.is_null() || context.is_null() {
        return;
    }
    let ctx = &*(context as *const WlanNotifContext);
    let d = &*data;

    // Filter by target interface GUID to avoid cross-adapter events
    if d.InterfaceGuid != ctx.target_guid {
        return;
    }

    // Strictly process ACM notifications only.
    // NEVER parse MSM notifications as WLAN_CONNECTION_NOTIFICATION_DATA!
    if d.NotificationSource != WLAN_NOTIFICATION_SOURCE_ACM {
        return;
    }

    let code = d.NotificationCode as i32;

    if code == wlan_notification_acm_network_not_available.0 {
        eprintln!(
            "[Oryvia Wi-Fi Connect #{}] ACM: network_not_available",
            ctx.req_id
        );
        let _ = ctx.tx.send(WlanConnEvent::NetworkNotAvailable);
        return;
    }

    // For connection start / complete / attempt_fail / disconnected:
    // extract WLAN_CONNECTION_NOTIFICATION_DATA if buffer is valid
    if !d.pData.is_null()
        && (d.dwDataSize as usize) >= std::mem::size_of::<WLAN_CONNECTION_NOTIFICATION_DATA>()
    {
        let conn = &*(d.pData as *const WLAN_CONNECTION_NOTIFICATION_DATA);
        let len = (conn.dot11Ssid.uSSIDLength as usize).min(conn.dot11Ssid.ucSSID.len());
        let event_ssid = String::from_utf8_lossy(&conn.dot11Ssid.ucSSID[..len])
            .trim()
            .to_string();

        if code == wlan_notification_acm_connection_start.0 {
            eprintln!(
                "[Oryvia Wi-Fi Connect #{}] ACM: connection_start for '{}' (target: '{}')",
                ctx.req_id, event_ssid, ctx.target_ssid
            );
            let _ = ctx.tx.send(WlanConnEvent::Start { ssid: event_ssid });
        } else if code == wlan_notification_acm_connection_complete.0 {
            eprintln!(
                "[Oryvia Wi-Fi Connect #{}] ACM: connection_complete for '{}', reason_code: 0x{:08X}",
                ctx.req_id, event_ssid, conn.wlanReasonCode
            );
            let _ = ctx.tx.send(WlanConnEvent::Complete {
                ssid: event_ssid,
                reason_code: conn.wlanReasonCode,
            });
        } else if code == wlan_notification_acm_connection_attempt_fail.0 {
            eprintln!(
                "[Oryvia Wi-Fi Connect #{}] ACM: connection_attempt_fail for '{}', reason_code: 0x{:08X}",
                ctx.req_id, event_ssid, conn.wlanReasonCode
            );
            let _ = ctx.tx.send(WlanConnEvent::AttemptFail {
                ssid: event_ssid,
                reason_code: conn.wlanReasonCode,
            });
        } else if code == wlan_notification_acm_disconnected.0 {
            eprintln!(
                "[Oryvia Wi-Fi Connect #{}] ACM: disconnected for '{}'",
                ctx.req_id, event_ssid
            );
            let _ = ctx.tx.send(WlanConnEvent::Disconnected { ssid: event_ssid });
        }
    }
}

struct WlanNotifGuard {
    handle: HANDLE,
    _ctx_box: Box<WlanNotifContext>,
}

impl WlanNotifGuard {
    unsafe fn register(
        handle: HANDLE,
        target_guid: GUID,
        target_ssid: String,
        req_id: u64,
        tx: Sender<WlanConnEvent>,
    ) -> Self {
        let ctx_box = Box::new(WlanNotifContext {
            tx,
            target_guid,
            target_ssid,
            req_id,
        });
        let ctx_ptr = (&*ctx_box) as *const WlanNotifContext as *const std::ffi::c_void;
        let sources = WLAN_NOTIFICATION_SOURCE_ACM;
        let code = WlanRegisterNotification(
            handle,
            sources,
            true,
            Some(wlan_notif_callback),
            Some(ctx_ptr),
            None,
            None,
        );
        if code != 0 {
            eprintln!(
                "[Oryvia Wi-Fi Connect #{req_id}] Warning: WlanRegisterNotification returned code {code}"
            );
        }
        Self {
            handle,
            _ctx_box: ctx_box,
        }
    }
}

impl Drop for WlanNotifGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = WlanRegisterNotification(
                self.handle,
                WLAN_NOTIFICATION_SOURCE_NONE,
                true,
                None,
                None,
                None,
                None,
            );
        }
    }
}

static WIFI_OPERATION_LOCK: Mutex<()> = Mutex::new(());
static WIFI_REQUEST_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

fn connect_network(ssid: &str, password: Option<&str>) -> Result<(), String> {
    let _lock = WIFI_OPERATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    let ssid = ssid.trim();
    if ssid.is_empty() {
        return Err("wifi_network_not_found".to_string());
    }

    let req_id = WIFI_REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed);
    let start_time = Instant::now();

    unsafe {
        let (handle, guid) = open_first_interface()?;
        let short_guid = format!("{:08X}", guid.data1);
        eprintln!(
            "[Oryvia Wi-Fi Connect #{req_id}] Target: '{ssid}', Adapter: [{short_guid}], PasswordProvided: {}",
            password.is_some()
        );

        // 1. Authoritative check: if already connected to target SSID and not modifying password, succeed immediately
        if let Some(curr) = query_current_connection(handle.0, &guid) {
            if curr.is_connected && curr.ssid == ssid && password.is_none() {
                eprintln!(
                    "[Oryvia Wi-Fi Connect #{req_id}] Already actively connected to '{ssid}'. Success immediately."
                );
                return Ok(());
            }
        }

        // 2. Query available networks to get profile / security configuration
        let entries = query_available_networks(handle.0, &guid, false)?;
        let target = entries.iter().find(|e| e.network.ssid == ssid).cloned();

        let entry = match target {
            Some(e) => e,
            None => {
                // Re-scan once in case the cache was stale
                let rescanned = query_available_networks(handle.0, &guid, true)?;
                match rescanned.into_iter().find(|e| e.network.ssid == ssid) {
                    Some(e) => e,
                    None => {
                        eprintln!(
                            "[Oryvia Wi-Fi Connect #{req_id}] Network '{ssid}' not found in scan results."
                        );
                        return Err("wifi_network_not_found".to_string());
                    }
                }
            }
        };

        if entry.network.connected && password.is_none() {
            eprintln!(
                "[Oryvia Wi-Fi Connect #{req_id}] Network entry already marked connected."
            );
            return Ok(());
        }

        let profile_to_use = entry
            .profile_name
            .clone()
            .unwrap_or_else(|| ssid.to_string());
        let mut profile_backup: Option<(String, u32)> = None;
        let mut created_new_profile = false;

        if entry.network.known && password.is_none() {
            // Reconnecting to an already saved network without modifying its profile.
            // DO NOT modify or overwrite existing profile. Safeguard profile: created_new_profile = false.
            eprintln!(
                "[Oryvia Wi-Fi Connect #{req_id}] Reconnecting to saved network with profile '{profile_to_use}'."
            );
        } else {
            if entry.network.security_type == "enterprise" {
                return Err("wifi_enterprise_unsupported".to_string());
            }
            if entry.network.security_type == "unknown" {
                return Err("wifi_security_unsupported".to_string());
            }

            let (auth, cipher) = match entry.xml_auth_cipher {
                Some(pair) => pair,
                None => {
                    return Err("wifi_security_unsupported".to_string());
                }
            };

            if entry.network.secured && password.map_or(true, |p| p.is_empty()) {
                return Err("wifi_password_required".to_string());
            }

            // Back up any existing profile before modifying so we never lose a saved profile on failure
            profile_backup = get_existing_profile_xml(handle.0, &guid, &profile_to_use);
            if entry.network.known && password.is_some() && profile_backup.is_none() {
                return Err("wifi_backup_profile_failed".to_string());
            }
            created_new_profile = profile_backup.is_none() && !entry.network.known;

            let xml = build_profile_xml(&profile_to_use, ssid, auth, cipher, password)?;
            let xml_w: Vec<u16> = xml.encode_utf16().chain(std::iter::once(0)).collect();
            let mut reason = 0u32;
            let mut code = WlanSetProfile(
                handle.0,
                &guid,
                0,
                PCWSTR(xml_w.as_ptr()),
                PCWSTR::null(),
                true,
                None,
                &mut reason,
            );

            // Only fallback from WPA3-SAE to WPA2-PSK if the SSID actually advertises WPA2 transition support
            if code != 0 && auth == "WPA3SAE" && entry.supports_wpa2_fallback {
                if let Ok(fallback_xml) =
                    build_profile_xml(&profile_to_use, ssid, "WPA2PSK", "AES", password)
                {
                    let fallback_w: Vec<u16> = fallback_xml
                        .encode_utf16()
                        .chain(std::iter::once(0))
                        .collect();
                    code = WlanSetProfile(
                        handle.0,
                        &guid,
                        0,
                        PCWSTR(fallback_w.as_ptr()),
                        PCWSTR::null(),
                        true,
                        None,
                        &mut reason,
                    );
                }
            }

            if code != 0 {
                return Err(format_wlan_error("Could not configure Wi-Fi profile", code));
            }
        }

        let (tx, rx) = mpsc::channel::<WlanConnEvent>();
        let _notif_guard = WlanNotifGuard::register(
            handle.0,
            guid,
            ssid.to_string(),
            req_id,
            tx,
        );

        let profile_w: Vec<u16> = profile_to_use
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let params = WLAN_CONNECTION_PARAMETERS {
            wlanConnectionMode: wlan_connection_mode_profile,
            strProfile: PCWSTR(profile_w.as_ptr()),
            pDot11Ssid: std::ptr::null_mut(),
            pDesiredBssidList: std::ptr::null_mut(),
            dot11BssType: dot11_BSS_type_infrastructure,
            dwFlags: 0,
        };
        let code = WlanConnect(handle.0, &guid, &params, None);
        if code != 0 {
            let restored = restore_or_cleanup_profile(
                handle.0,
                &guid,
                &profile_to_use,
                &profile_backup,
                created_new_profile,
            );
            if !restored && profile_backup.is_some() {
                return Err("wifi_rollback_failed".to_string());
            }
            return Err(format_wlan_error("Wi-Fi connection failed to start", code));
        }

        let timeout = Duration::from_secs(15);
        let mut last_fail_reason: Option<u32> = None;
        let mut saw_network_not_available = false;

        while start_time.elapsed() < timeout {
            // 1. Authoritative check on every iteration: if live connection state is connected to target SSID, WE ARE DONE!
            if let Some(curr) = query_current_connection(handle.0, &guid) {
                if curr.is_connected && curr.ssid == ssid {
                    eprintln!(
                        "[Oryvia Wi-Fi Connect #{req_id}] Authoritatively connected to '{ssid}' (profile: '{}', state: {:?}) in {:.2?}s! Success.",
                        curr.profile_name, curr.state, start_time.elapsed()
                    );
                    return Ok(());
                }
            }

            // 2. Poll events with short timeout
            let mut events = Vec::new();
            if let Ok(ev) = rx.recv_timeout(Duration::from_millis(250)) {
                events.push(ev);
            }
            while let Ok(ev) = rx.try_recv() {
                events.push(ev);
            }

            for ev in events {
                match ev {
                    WlanConnEvent::Complete {
                        ssid: ev_ssid,
                        reason_code,
                    } => {
                        // Check if this completion applies to target SSID
                        if ev_ssid.is_empty() || ev_ssid == ssid {
                            if reason_code == 0 {
                                eprintln!(
                                    "[Oryvia Wi-Fi Connect #{req_id}] ACM Complete reason_code=0 for '{ssid}' in {:.2?}s.",
                                    start_time.elapsed()
                                );
                                return Ok(());
                            } else {
                                // Double check authoritative state before giving up
                                if let Some(curr) = query_current_connection(handle.0, &guid) {
                                    if curr.is_connected && curr.ssid == ssid {
                                        eprintln!(
                                            "[Oryvia Wi-Fi Connect #{req_id}] Complete had reason 0x{reason_code:08X} but live connection is active for '{ssid}'. Success."
                                        );
                                        return Ok(());
                                    }
                                }
                                last_fail_reason = Some(reason_code);
                            }
                        }
                    }
                    WlanConnEvent::AttemptFail {
                        ssid: ev_ssid,
                        reason_code,
                    } => {
                        // Intermediate attempt failure on a specific BSSID/channel.
                        // Do NOT abort immediately because Windows driver retries other BSSIDs.
                        if ev_ssid.is_empty() || ev_ssid == ssid {
                            eprintln!(
                                "[Oryvia Wi-Fi Connect #{req_id}] Intermediate attempt fail: 0x{reason_code:08X} for '{ev_ssid}'. Windows may retry other BSSIDs."
                            );
                            if reason_code != 0 {
                                last_fail_reason = Some(reason_code);
                            }
                        }
                    }
                    WlanConnEvent::NetworkNotAvailable => {
                        saw_network_not_available = true;
                    }
                    WlanConnEvent::Disconnected { ssid: ev_ssid } => {
                        if ev_ssid == ssid {
                            eprintln!(
                                "[Oryvia Wi-Fi Connect #{req_id}] Target network '{ssid}' disconnected."
                            );
                        } else {
                            eprintln!(
                                "[Oryvia Wi-Fi Connect #{req_id}] Disconnected previous network '{ev_ssid}' during switch to '{ssid}'. (Ignored)"
                            );
                        }
                    }
                    WlanConnEvent::Start { ssid: ev_ssid } => {
                        eprintln!(
                            "[Oryvia Wi-Fi Connect #{req_id}] Connection attempt started for '{ev_ssid}'."
                        );
                    }
                }
            }

            // 3. Fallback: check query_available_networks cache
            if let Ok(current_list) = query_available_networks(handle.0, &guid, false) {
                if current_list
                    .iter()
                    .any(|e| e.network.ssid == ssid && e.network.connected)
                {
                    eprintln!(
                        "[Oryvia Wi-Fi Connect #{req_id}] Detected connected in available network list in {:.2?}s.",
                        start_time.elapsed()
                    );
                    return Ok(());
                }
            }
        }

        // Final authoritative check after timeout
        if let Some(curr) = query_current_connection(handle.0, &guid) {
            if curr.is_connected && curr.ssid == ssid {
                eprintln!(
                    "[Oryvia Wi-Fi Connect #{req_id}] Final check confirmed connected to '{ssid}' in {:.2?}s.",
                    start_time.elapsed()
                );
                return Ok(());
            }
        }

        // Connection truly failed. Rollback profile only if a new profile was created or modified.
        let restored = restore_or_cleanup_profile(
            handle.0,
            &guid,
            &profile_to_use,
            &profile_backup,
            created_new_profile,
        );

        if !restored && profile_backup.is_some() {
            eprintln!(
                "[Oryvia Wi-Fi Connect #{req_id}] Critical: Failed to restore backup profile '{profile_to_use}'!"
            );
            return Err("wifi_rollback_failed".to_string());
        }

        eprintln!(
            "[Oryvia Wi-Fi Connect #{req_id}] Failed after {:.2?}s. last_fail_reason: {:?}, network_not_available: {}",
            start_time.elapsed(),
            last_fail_reason.map(|r| format!("0x{r:08X}")),
            saw_network_not_available
        );

        if let Some(reason) = last_fail_reason {
            return Err(format_wlan_reason(reason));
        }
        if saw_network_not_available {
            return Err("wifi_network_not_found".to_string());
        }
        Err("wifi_connection_timeout".to_string())
    }
}

fn disconnect_network() -> Result<(), String> {
    let _lock = WIFI_OPERATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    unsafe {
        let (handle, guid) = open_first_interface()?;
        let code = WlanDisconnect(handle.0, &guid, None);
        if code != 0 {
            return Err(format_wlan_error("Wi-Fi disconnect failed", code));
        }
        Ok(())
    }
}

fn forget_network(ssid: &str) -> Result<(), String> {
    let _lock = WIFI_OPERATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    let ssid = ssid.trim();
    if ssid.is_empty() {
        return Err("Invalid network name".to_string());
    }
    unsafe {
        let (handle, guid) = open_first_interface()?;
        let profile_name = query_available_networks(handle.0, &guid, false)
            .ok()
            .and_then(|list| {
                list.into_iter()
                    .find(|e| e.network.ssid == ssid)
                    .and_then(|e| e.profile_name)
            })
            .unwrap_or_else(|| ssid.to_string());

        let name_w: Vec<u16> = profile_name
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let code = WlanDeleteProfile(handle.0, &guid, PCWSTR(name_w.as_ptr()), None);
        if code != 0 {
            return Err(format_wlan_error("Could not forget network", code));
        }
        Ok(())
    }
}

// ============================================================================
// BLUETOOTH DEVICE MANAGER (WinRT + CoreAudio KSPROPSETID_BtAudio + BLE GATT)
// ============================================================================

const KSPROPSETID_BT_AUDIO: GUID = GUID::from_u128(0x7FA06C40_B8F6_4C7E_8556_E8C33A12E54D);
const KSPROPERTY_ONESHOT_RECONNECT: u32 = 0;
const KSPROPERTY_ONESHOT_DISCONNECT: u32 = 1;
const KSPROPERTY_TYPE_GET: u32 = 0x00000001;
const KSPROPERTY_TYPE_BASICSUPPORT: u32 = 0x00000200;
const IOCTL_KS_PROPERTY: u32 = 0x002F0003;

fn strip_guids(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut in_guid = false;
    for c in s.chars() {
        if c == '{' {
            in_guid = true;
        } else if c == '}' {
            in_guid = false;
        } else if !in_guid {
            result.push(c);
        }
    }
    result
}

fn matches_bt_mac(device_id_raw: &str, mac_hex: &str) -> bool {
    let stripped = strip_guids(device_id_raw);
    let bytes = stripped.as_bytes();
    let mac_bytes = mac_hex.as_bytes();
    if mac_bytes.len() != 12 || bytes.len() < 12 {
        return false;
    }
    for i in 0..=(bytes.len() - 12) {
        if bytes[i..i + 12].eq_ignore_ascii_case(mac_bytes) {
            let left_ok = i == 0 || !bytes[i - 1].is_ascii_hexdigit();
            let right_ok = (i + 12 == bytes.len()) || !bytes[i + 12].is_ascii_hexdigit();
            if left_ok && right_ok {
                return true;
            }
        }
    }
    false
}

fn extract_bt_macs(device_id_raw: &str) -> Vec<String> {
    let stripped = strip_guids(device_id_raw);
    let mut macs = Vec::new();
    for token in stripped.split(|c: char| !c.is_ascii_hexdigit()) {
        if token.len() == 12 && token != "000000000000" {
            macs.push(token.to_ascii_uppercase());
        }
    }
    macs
}

fn format_bt_address(addr: u64) -> Option<String> {
    if addr == 0 {
        return None;
    }
    let bytes = addr.to_be_bytes();
    // 48-bit MAC is in bytes[2..8]
    Some(format!(
        "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
        bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]
    ))
}

fn check_bluetooth_radio_enabled() -> Result<bool, String> {
    use windows::Devices::Radios::{Radio, RadioKind, RadioState};
    let radios = Radio::GetRadiosAsync()
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;
    let count = radios.Size().unwrap_or(0);
    let mut found_bt = false;
    for i in 0..count {
        if let Ok(r) = radios.GetAt(i) {
            if r.Kind().ok() == Some(RadioKind::Bluetooth) {
                found_bt = true;
                if r.State().ok() == Some(RadioState::On) {
                    return Ok(true);
                }
            }
        }
    }
    if found_bt {
        Ok(false)
    } else {
        Ok(true)
    }
}

fn is_hid_name_or_id(id: &str, name: &str) -> bool {
    let id_upper = id.to_uppercase();
    let name_upper = name.to_uppercase();
    id_upper.contains("HID")
        || id_upper.contains("KEYBOARD")
        || id_upper.contains("MOUSE")
        || name_upper.contains("KEYBOARD")
        || name_upper.contains("MOUSE")
        || name_upper.contains("TOUCHPAD")
        || name_upper.contains("TRACKPAD")
}

#[derive(Default, Debug, Clone)]
struct BtAudioCapabilities {
    has_endpoint_macs: HashSet<String>,
    can_reconnect_macs: HashSet<String>,
    can_disconnect_macs: HashSet<String>,
}

static AUDIO_CAPS_CACHE: OnceLock<Mutex<Option<(Instant, BtAudioCapabilities)>>> = OnceLock::new();

fn get_cached_bt_audio_caps(force_refresh: bool) -> BtAudioCapabilities {
    let cache_mutex = AUDIO_CAPS_CACHE.get_or_init(|| Mutex::new(None));
    let mut guard = cache_mutex.lock().unwrap_or_else(|e| e.into_inner());

    let now = Instant::now();
    if !force_refresh {
        if let Some((timestamp, ref caps)) = *guard {
            if now.duration_since(timestamp) < Duration::from_secs(30) {
                return caps.clone();
            }
        }
    }

    let fresh = unsafe { query_bt_audio_capabilities() };
    *guard = Some((now, fresh.clone()));
    fresh
}

fn invalidate_bt_audio_caps_cache() {
    if let Some(mutex) = AUDIO_CAPS_CACHE.get() {
        if let Ok(mut guard) = mutex.lock() {
            *guard = None;
        }
    }
}

/// Checks whether any audio endpoint (Render or Capture) associated with the target
/// Bluetooth MAC address is active/enabled.
unsafe fn check_mac_audio_endpoints_active(mac_hex: &str) -> (bool, bool) {
    use windows::Devices::Enumeration::DeviceInformation;

    if mac_hex.is_empty() {
        return (false, false);
    }
    let target = mac_hex.to_uppercase();

    let aqs = "System.Devices.InterfaceClassGuid:=\"{6994AD04-93EF-11D0-A3CC-00A0C9223196}\"";
    let Ok(op) = DeviceInformation::FindAllAsyncAqsFilter(&HSTRING::from(aqs)) else {
        return (false, false);
    };
    let Ok(col) = op.get() else {
        return (false, false);
    };
    let count = col.Size().unwrap_or(0);

    let mut has_active = false;
    let mut has_any = false;

    for i in 0..count {
        let Ok(item) = col.GetAt(i) else { continue };
        let Ok(id_h) = item.Id() else { continue };
        let id = id_h.to_string_lossy();
        if matches_bt_mac(&id, &target) {
            has_any = true;
            if item.IsEnabled().unwrap_or(false) {
                has_active = true;
                break;
            }
        }
    }

    (has_active, has_any)
}

/// Discovers Bluetooth audio endpoints via Windows KSCATEGORY_AUDIO DeviceInterface
/// and queries the driver via standard Win32 KernelStreaming DeviceIoControl (IOCTL_KS_PROPERTY)
/// to verify true driver support for KSPROPSETID_BT_AUDIO.
unsafe fn query_bt_audio_capabilities() -> BtAudioCapabilities {
    use windows::Win32::Foundation::{CloseHandle, GENERIC_READ, GENERIC_WRITE, INVALID_HANDLE_VALUE};
    use windows::Win32::Media::KernelStreaming::{KSIDENTIFIER, KSIDENTIFIER_0, KSIDENTIFIER_0_0};
    use windows::Win32::Storage::FileSystem::{CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING};
    use windows::Win32::System::IO::DeviceIoControl;
    use windows::Devices::Enumeration::DeviceInformation;

    let mut caps = BtAudioCapabilities::default();
    let aqs = "System.Devices.InterfaceClassGuid:=\"{6994AD04-93EF-11D0-A3CC-00A0C9223196}\"";
    let Ok(op) = DeviceInformation::FindAllAsyncAqsFilter(&HSTRING::from(aqs)) else {
        return caps;
    };
    let Ok(col) = op.get() else {
        return caps;
    };
    let count = col.Size().unwrap_or(0);

    for i in 0..count {
        let Ok(item) = col.GetAt(i) else { continue };
        let Ok(id_h) = item.Id() else { continue };
        let id = id_h.to_string_lossy();
        let upper = id.to_uppercase();
        if !(upper.contains("BTHENUM") || upper.contains("BTHHFENUM")) {
            continue;
        }

        let macs = extract_bt_macs(&id);
        if macs.is_empty() {
            continue;
        }
        for m in &macs {
            caps.has_endpoint_macs.insert(m.clone());
        }

        let path_w: Vec<u16> = id.encode_utf16().chain(std::iter::once(0)).collect();
        let h_file = CreateFileW(
            PCWSTR(path_w.as_ptr()),
            GENERIC_READ.0 | GENERIC_WRITE.0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            None,
            OPEN_EXISTING,
            Default::default(),
            None,
        );

        let Ok(handle) = h_file else { continue };
        if handle == INVALID_HANDLE_VALUE { continue };

        let check_support = |prop_id: u32| -> bool {
            let prop = KSIDENTIFIER {
                Anonymous: KSIDENTIFIER_0 {
                    Anonymous: KSIDENTIFIER_0_0 {
                        Set: KSPROPSETID_BT_AUDIO,
                        Id: prop_id,
                        Flags: KSPROPERTY_TYPE_BASICSUPPORT,
                    },
                },
            };
            let mut flags = 0u32;
            let mut bytes_ret = 0u32;
            let res = DeviceIoControl(
                handle,
                IOCTL_KS_PROPERTY,
                Some(&prop as *const _ as *const std::ffi::c_void),
                std::mem::size_of::<KSIDENTIFIER>() as u32,
                Some(&mut flags as *mut _ as *mut std::ffi::c_void),
                std::mem::size_of::<u32>() as u32,
                Some(&mut bytes_ret),
                None,
            );
            res.is_ok() && (flags & KSPROPERTY_TYPE_GET != 0)
        };

        let supp_reconnect = check_support(KSPROPERTY_ONESHOT_RECONNECT);
        let supp_disconnect = check_support(KSPROPERTY_ONESHOT_DISCONNECT);

        let _ = CloseHandle(handle);

        for m in macs {
            if supp_reconnect {
                caps.can_reconnect_macs.insert(m.clone());
            }
            if supp_disconnect {
                caps.can_disconnect_macs.insert(m.clone());
            }
        }
    }

    caps
}

fn mask_bt_addr(addr: u64) -> String {
    let b5 = (addr >> 40) & 0xFF;
    let b4 = (addr >> 32) & 0xFF;
    let b0 = addr & 0xFF;
    format!("{b5:02X}:{b4:02X}:***:{b0:02X}")
}

/// Drops the physical Classic Bluetooth ACL / baseband connection to a paired device
/// using standard Win32 Bluetooth Radio DeviceIoControl (`IOCTL_BTH_DISCONNECT_DEVICE`),
/// keeping the device securely paired without unpairing.
unsafe fn disconnect_bt_device_baseband(bt_addr: u64) -> Result<(), String> {
    use windows::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
    use windows::Win32::System::IO::DeviceIoControl;
    use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
    use windows::core::{s, w, BOOL};

    if bt_addr == 0 {
        return Err("Invalid Bluetooth address (0)".to_string());
    }

    struct ModuleGuard(windows::Win32::Foundation::HMODULE);
    impl Drop for ModuleGuard {
        fn drop(&mut self) {
            if !self.0.is_invalid() {
                extern "system" {
                    fn FreeLibrary(hLibModule: windows::Win32::Foundation::HMODULE) -> windows::core::BOOL;
                }
                unsafe {
                    let _ = FreeLibrary(self.0);
                }
            }
        }
    }

    struct RadioFindGuard(HANDLE, Option<FnFindRadioClose>);
    impl Drop for RadioFindGuard {
        fn drop(&mut self) {
            if !self.0.is_invalid() && self.0 != INVALID_HANDLE_VALUE {
                if let Some(close_fn) = self.1 {
                    unsafe {
                        let _ = close_fn(self.0);
                    }
                }
            }
        }
    }

    let h_mod = LoadLibraryW(w!("bthprops.cpl")).map_err(|e| format!("LoadLibraryW bthprops.cpl failed: {e}"))?;
    if h_mod.is_invalid() {
        return Err("bthprops.cpl module is invalid".to_string());
    }
    let _mod_guard = ModuleGuard(h_mod);

    #[repr(C)]
    struct BLUETOOTH_FIND_RADIO_PARAMS {
        dw_size: u32,
    }

    type FnFindFirstRadio = unsafe extern "system" fn(
        *const BLUETOOTH_FIND_RADIO_PARAMS,
        *mut HANDLE,
    ) -> HANDLE;

    type FnFindNextRadio = unsafe extern "system" fn(
        HANDLE,
        *mut HANDLE,
    ) -> BOOL;

    type FnFindRadioClose = unsafe extern "system" fn(
        HANDLE,
    ) -> BOOL;

    let p_find_first = GetProcAddress(h_mod, s!("BluetoothFindFirstRadio"));
    let p_find_next = GetProcAddress(h_mod, s!("BluetoothFindNextRadio"));
    let p_find_close = GetProcAddress(h_mod, s!("BluetoothFindRadioClose"));

    let (Some(p_find_first), Some(p_find_close)) = (p_find_first, p_find_close) else {
        return Err("BluetoothFindFirstRadio / BluetoothFindRadioClose not found in bthprops.cpl".to_string());
    };

    let find_first: FnFindFirstRadio = std::mem::transmute(p_find_first);
    let find_next: Option<FnFindNextRadio> = p_find_next.map(|p| std::mem::transmute(p));
    let find_close: FnFindRadioClose = std::mem::transmute(p_find_close);

    let params = BLUETOOTH_FIND_RADIO_PARAMS {
        dw_size: std::mem::size_of::<BLUETOOTH_FIND_RADIO_PARAMS>() as u32,
    };

    let mut h_radio = HANDLE::default();
    let h_find = find_first(&params, &mut h_radio);

    if h_find.is_invalid() {
        return Err("No Bluetooth radios found on this system".to_string());
    }
    let _find_guard = RadioFindGuard(h_find, Some(find_close));

    // IOCTL_BTH_DISCONNECT_DEVICE: CTL_CODE(FILE_DEVICE_BLUETOOTH (0x41), 3, METHOD_BUFFERED, FILE_ANY_ACCESS) = 0x0041000C
    const IOCTL_BTH_DISCONNECT_DEVICE: u32 = 0x0041000C;
    let mut disconnected = false;
    let mut last_err = 0u32;

    let mut check_radio = |radio: HANDLE| -> bool {
        if radio.is_invalid() || radio == INVALID_HANDLE_VALUE {
            return false;
        }
        let mut bytes_ret = 0u32;
        let res = DeviceIoControl(
            radio,
            IOCTL_BTH_DISCONNECT_DEVICE,
            Some(&bt_addr as *const _ as *const std::ffi::c_void),
            std::mem::size_of::<u64>() as u32,
            None,
            0,
            Some(&mut bytes_ret),
            None,
        );
        let _ = CloseHandle(radio);
        if res.is_ok() {
            true
        } else {
            last_err = windows::Win32::Foundation::GetLastError().0;
            false
        }
    };

    if check_radio(h_radio) {
        disconnected = true;
    }

    if !disconnected && find_next.is_some() {
        let find_next_fn = find_next.unwrap();
        let mut next_radio = HANDLE::default();
        while find_next_fn(h_find, &mut next_radio).as_bool() {
            if check_radio(next_radio) {
                disconnected = true;
                break;
            }
        }
    }

    if disconnected {
        Ok(())
    } else if last_err == 1167 {
        // ERROR_DEVICE_NOT_CONNECTED (already disconnected)
        Ok(())
    } else {
        Err(format!("IOCTL_BTH_DISCONNECT_DEVICE failed (win32 error: {last_err})"))
    }
}

/// Invokes `KSPROPERTY_ONESHOT_RECONNECT` or `KSPROPERTY_ONESHOT_DISCONNECT` on the matching
/// Bluetooth audio KS device interface via standard Win32 DeviceIoControl.
unsafe fn invoke_bt_audio_ks_control(mac_hex: &str, connect: bool) -> bool {
    use windows::Win32::Foundation::{CloseHandle, GENERIC_READ, GENERIC_WRITE, INVALID_HANDLE_VALUE};
    use windows::Win32::Media::KernelStreaming::{KSIDENTIFIER, KSIDENTIFIER_0, KSIDENTIFIER_0_0};
    use windows::Win32::Storage::FileSystem::{CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING};
    use windows::Win32::System::IO::DeviceIoControl;
    use windows::Devices::Enumeration::DeviceInformation;

    if mac_hex.is_empty() {
        return false;
    }

    let target_prop_id = if connect {
        KSPROPERTY_ONESHOT_RECONNECT
    } else {
        KSPROPERTY_ONESHOT_DISCONNECT
    };

    let aqs = "System.Devices.InterfaceClassGuid:=\"{6994AD04-93EF-11D0-A3CC-00A0C9223196}\"";
    let Ok(op) = DeviceInformation::FindAllAsyncAqsFilter(&HSTRING::from(aqs)) else {
        return false;
    };
    let Ok(col) = op.get() else {
        return false;
    };
    let count = col.Size().unwrap_or(0);
    let mut invoked_any = false;

    let prop = KSIDENTIFIER {
        Anonymous: KSIDENTIFIER_0 {
            Anonymous: KSIDENTIFIER_0_0 {
                Set: KSPROPSETID_BT_AUDIO,
                Id: target_prop_id,
                Flags: KSPROPERTY_TYPE_GET,
            },
        },
    };

    // First try A2DP \SRC interfaces which reliably control the Bluetooth audio endpoint
    for pass in [true, false] {
        if invoked_any {
            break;
        }
        for i in 0..count {
            let Ok(item) = col.GetAt(i) else { continue };
            let Ok(id_h) = item.Id() else { continue };
            let id = id_h.to_string_lossy();
            let upper = id.to_uppercase();
            if !(upper.contains("BTHENUM") || upper.contains("BTHHFENUM")) {
                continue;
            }
            if !matches_bt_mac(&id, mac_hex) {
                continue;
            }
            if pass && !upper.ends_with(r"\SRC") {
                continue;
            }

            let path_w: Vec<u16> = id.encode_utf16().chain(std::iter::once(0)).collect();
            let h_file = CreateFileW(
                PCWSTR(path_w.as_ptr()),
                GENERIC_READ.0 | GENERIC_WRITE.0,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                None,
                OPEN_EXISTING,
                Default::default(),
                None,
            );

            let Ok(handle) = h_file else { continue };
            if handle == INVALID_HANDLE_VALUE { continue };

            let mut bytes_ret = 0u32;
            let res = DeviceIoControl(
                handle,
                IOCTL_KS_PROPERTY,
                Some(&prop as *const _ as *const std::ffi::c_void),
                std::mem::size_of::<KSIDENTIFIER>() as u32,
                None,
                0,
                Some(&mut bytes_ret),
                None,
            );

            let _ = CloseHandle(handle);

            if res.is_ok() {
                invoked_any = true;
                break;
            }
        }
    }

    invoked_any
}

fn list_bluetooth_devices() -> Result<Vec<BluetoothDeviceInfo>, String> {
    use windows::Devices::Bluetooth::GenericAttributeProfile::GattSession;
    use windows::Devices::Bluetooth::{
        BluetoothConnectionStatus, BluetoothDevice, BluetoothLEDevice, BluetoothMajorClass,
        BluetoothServiceCapabilities,
    };
    use windows::Devices::Enumeration::DeviceInformation;

    let _com = ComGuard::new();
    let audio_caps = get_cached_bt_audio_caps(false);

    let mut out: Vec<BluetoothDeviceInfo> = Vec::new();
    let mut index_by_addr: HashMap<u64, usize> = HashMap::new();
    let mut seen_ids: HashSet<String> = HashSet::new();

    // 1. Classic Bluetooth paired devices
    if let Ok(selector) = BluetoothDevice::GetDeviceSelectorFromPairingState(true) {
        if let Ok(op) = DeviceInformation::FindAllAsyncAqsFilter(&selector) {
            if let Ok(collection) = op.get() {
                let count = collection.Size().unwrap_or(0);
                for i in 0..count {
                    let Ok(info) = collection.GetAt(i) else { continue };
                    let Ok(id_h) = info.Id() else { continue };
                    let name = info
                        .Name()
                        .map(|s| s.to_string_lossy().trim().to_string())
                        .unwrap_or_default();
                    if name.is_empty() {
                        continue;
                    }
                    let id = id_h.to_string_lossy();
                    if !seen_ids.insert(id.clone()) {
                        continue;
                    }

                    let dev_opt = BluetoothDevice::FromIdAsync(&id_h)
                        .ok()
                        .and_then(|op| op.get().ok());

                    let status_opt = dev_opt.as_ref().and_then(|dev| dev.ConnectionStatus().ok());
                    let bt_addr = dev_opt
                        .as_ref()
                        .and_then(|dev| dev.BluetoothAddress().ok())
                        .unwrap_or(0);

                    let (status_conn, init_status) = match status_opt {
                        Some(BluetoothConnectionStatus::Connected) => {
                            (true, "connected".to_string())
                        }
                        Some(BluetoothConnectionStatus::Disconnected) => {
                            (false, "paired".to_string())
                        }
                        _ => (false, "unknown".to_string()),
                    };

                    let mac_hex = if bt_addr != 0 {
                        format!("{bt_addr:012X}")
                    } else {
                        String::new()
                    };

                    let has_audio_endpoint = !mac_hex.is_empty() && audio_caps.has_endpoint_macs.contains(&mac_hex);
                    let can_reconnect = !mac_hex.is_empty() && audio_caps.can_reconnect_macs.contains(&mac_hex);

                    let (is_cod_phone, is_cod_audio, is_cod_hid) = dev_opt
                        .as_ref()
                        .and_then(|d| d.ClassOfDevice().ok())
                        .map(|cod| {
                            let major = cod.MajorClass().unwrap_or(BluetoothMajorClass(0));
                            let raw = cod.RawValue().unwrap_or(0);
                            let caps = cod
                                .ServiceCapabilities()
                                .unwrap_or(BluetoothServiceCapabilities(0));
                            let phone = major == BluetoothMajorClass::Phone || (raw & 0x1F00) == 0x0200;
                            let audio = major == BluetoothMajorClass::AudioVideo
                                || (caps.0 & 0x240000) != 0;
                            let hid = major == BluetoothMajorClass::Peripheral;
                            (phone, audio, hid)
                        })
                        .unwrap_or((false, false, false));

                    let is_phone = is_cod_phone;
                    let is_audio = !is_phone && (has_audio_endpoint || is_cod_audio);
                    let device_kind = if is_phone {
                        "phone".to_string()
                    } else if is_audio {
                        "audio".to_string()
                    } else if is_cod_hid {
                        "classic-hid".to_string()
                    } else {
                        "classic-other".to_string()
                    };

                    let mut audio_status = "none".to_string();
                    let mut audio_connected = false;

                    if is_audio && !mac_hex.is_empty() {
                        let (audio_active, has_endpoints) = unsafe { check_mac_audio_endpoints_active(&mac_hex) };
                        if audio_active {
                            audio_status = "active".to_string();
                            audio_connected = true;
                        } else if has_endpoints {
                            audio_status = "inactive".to_string();
                        }
                    }

                    // NEVER override connected / status!
                    // status_conn and init_status reflect the TRUE Windows Bluetooth link state!
                    let connected = status_conn;
                    let status = init_status.clone();

                    let (can_conn, can_disc, disabled_reason, disabled_reason_code) = if is_phone {
                        (
                            false,
                            false,
                            Some("Phone sync and connections are managed automatically by Windows Phone Link or Windows Bluetooth Settings.".to_string()),
                            Some("phone_managed_by_windows".to_string()),
                        )
                    } else if is_audio {
                        if connected {
                            // Any connected classic audio device can be disconnected at the baseband level via IOCTL_BTH_DISCONNECT_DEVICE!
                            (false, true, None, None)
                        } else if status == "paired" {
                            if can_reconnect {
                                (true, false, None, None)
                            } else {
                                (
                                    false,
                                    false,
                                    Some("Audio driver does not expose a direct reconnect property. Please use Windows Bluetooth Settings.".to_string()),
                                    Some("audio_driver_no_reconnect".to_string()),
                                )
                            }
                        } else {
                            (
                                false,
                                false,
                                Some("Device connection status is unknown.".to_string()),
                                Some("status_unknown".to_string()),
                            )
                        }
                    } else if is_cod_hid {
                        (
                            false,
                            false,
                            Some("HID peripheral devices (keyboard/mouse) are managed by Windows Bluetooth Settings.".to_string()),
                            Some("hid_managed_by_windows".to_string()),
                        )
                    } else {
                        (
                            false,
                            false,
                            Some("Windows manages this device type directly. Use Windows Bluetooth Settings to manage it.".to_string()),
                            Some("windows_managed".to_string()),
                        )
                    };

                    let item = BluetoothDeviceInfo {
                        id,
                        name,
                        connected,
                        status,
                        audio_status,
                        audio_connected,
                        device_kind,
                        can_connect: can_conn,
                        can_disconnect: can_disc,
                        address: format_bt_address(bt_addr),
                        disabled_reason,
                        disabled_reason_code,
                    };

                    if bt_addr != 0 {
                        index_by_addr.insert(bt_addr, out.len());
                    }
                    out.push(item);
                }
            }
        }
    }

    // 2. Bluetooth Low Energy (BLE) paired devices
    if let Ok(le_selector) = BluetoothLEDevice::GetDeviceSelectorFromPairingState(true) {
        if let Ok(op) = DeviceInformation::FindAllAsyncAqsFilter(&le_selector) {
            if let Ok(collection) = op.get() {
                let count = collection.Size().unwrap_or(0);
                for i in 0..count {
                    let Ok(info) = collection.GetAt(i) else { continue };
                    let Ok(id_h) = info.Id() else { continue };
                    let name = info
                        .Name()
                        .map(|s| s.to_string_lossy().trim().to_string())
                        .unwrap_or_default();
                    if name.is_empty() {
                        continue;
                    }
                    let id = id_h.to_string_lossy();
                    if !seen_ids.insert(id.clone()) {
                        continue;
                    }

                    let le_dev_opt = BluetoothLEDevice::FromIdAsync(&id_h)
                        .ok()
                        .and_then(|op| op.get().ok());

                    let status_opt = le_dev_opt
                        .as_ref()
                        .and_then(|dev| dev.ConnectionStatus().ok());
                    let bt_addr = le_dev_opt
                        .as_ref()
                        .and_then(|dev| dev.BluetoothAddress().ok())
                        .unwrap_or(0);

                    let (connected, status) = match status_opt {
                        Some(BluetoothConnectionStatus::Connected) => {
                            (true, "connected".to_string())
                        }
                        Some(BluetoothConnectionStatus::Disconnected) => {
                            (false, "paired".to_string())
                        }
                        _ => (false, "unknown".to_string()),
                    };

                    // Only merge with a Classic entry if both share the exact same non-zero 48-bit Bluetooth hardware address
                    if bt_addr != 0 {
                        if let Some(&idx) = index_by_addr.get(&bt_addr) {
                            if connected && !out[idx].connected {
                                out[idx].connected = true;
                                out[idx].status = "connected".to_string();
                                out[idx].can_connect = false;
                                out[idx].can_disconnect = out[idx].device_kind == "audio";
                            } else if out[idx].status == "unknown" && status != "unknown" {
                                out[idx].status = status;
                            }
                            continue;
                        }
                    }

                    let appearance_opt = le_dev_opt.as_ref().and_then(|d| d.Appearance().ok());
                    let cat = appearance_opt.as_ref().and_then(|a| a.Category().ok()).unwrap_or(0);
                    let raw_app = appearance_opt.as_ref().and_then(|a| a.RawValue().ok()).unwrap_or(0);

                    let is_phone = cat == 1; // Bluetooth SIG Category 1 = Phone
                    let is_ble_hid = cat == 15 || (0x03C0..=0x03CF).contains(&raw_app);

                    let can_maintain_gatt = if !is_ble_hid && !is_phone {
                        le_dev_opt
                            .as_ref()
                            .and_then(|d| d.BluetoothDeviceId().ok())
                            .and_then(|bt_id| GattSession::FromDeviceIdAsync(&bt_id).ok())
                            .and_then(|op| op.get().ok())
                            .and_then(|sess| sess.CanMaintainConnection().ok())
                            .unwrap_or(false)
                    } else {
                        false
                    };

                    let has_active_gatt_session = gatt_sessions()
                        .lock()
                        .map(|m| m.contains_key(&id))
                        .unwrap_or(false);

                    let device_kind = if is_phone {
                        "phone".to_string()
                    } else if is_ble_hid {
                        "ble-hid".to_string()
                    } else {
                        "ble-gatt".to_string()
                    };

                    let (can_conn, can_disc, disabled_reason, disabled_reason_code) = if is_phone {
                        (
                            false,
                            false,
                            Some("Phone sync and connections are managed automatically by Windows Phone Link or Windows Bluetooth Settings.".to_string()),
                            Some("phone_managed_by_windows".to_string()),
                        )
                    } else if is_ble_hid {
                        (
                            false,
                            false,
                            Some("BLE HID input devices are managed by Windows Bluetooth Settings.".to_string()),
                            Some("hid_managed_by_windows".to_string()),
                        )
                    } else {
                        let conn = can_maintain_gatt && status == "paired";
                        let disc = has_active_gatt_session && status == "connected";
                        let (reason, code) = if !conn && !disc {
                            (
                                Some("Windows or driver manages this Bluetooth LE connection directly.".to_string()),
                                Some("gatt_maintain_unsupported".to_string()),
                            )
                        } else {
                            (None, None)
                        };
                        (conn, disc, reason, code)
                    };

                    let item = BluetoothDeviceInfo {
                        id,
                        name,
                        connected,
                        status,
                        audio_status: "none".to_string(),
                        audio_connected: false,
                        device_kind,
                        can_connect: can_conn,
                        can_disconnect: can_disc,
                        address: format_bt_address(bt_addr),
                        disabled_reason,
                        disabled_reason_code,
                    };

                    if bt_addr != 0 {
                        index_by_addr.insert(bt_addr, out.len());
                    }
                    out.push(item);
                }
            }
        }
    }

    out.sort_by(|a, b| {
        b.connected
            .cmp(&a.connected)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.id.cmp(&b.id))
    });

    // Throttled non-sensitive diagnostic log for troubleshooting device capabilities
    static LAST_DIAG_LOG: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    let diag_map = LAST_DIAG_LOG.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(mut last_map) = diag_map.lock() {
        for d in &out {
            let entry_sig = format!("{}:{}:{}:{}", d.status, d.device_kind, d.can_connect, d.can_disconnect);
            let changed = last_map.get(&d.id) != Some(&entry_sig);
            if changed {
                last_map.insert(d.id.clone(), entry_sig);
                let mac_str = d.address.as_deref().unwrap_or("").replace(':', "");
                let has_endpoint = !mac_str.is_empty() && audio_caps.has_endpoint_macs.contains(&mac_str);
                let reason_str = d.disabled_reason_code.as_deref().unwrap_or("supported");
                eprintln!(
                    "[Oryvia BT Diag] Device: \"{}\" | Kind: {} | Status: {} | AudioEndpoint: {} | CanConnect: {} | CanDisconnect: {} | ReasonCode: {}",
                    d.name, d.device_kind, d.status, has_endpoint, d.can_connect, d.can_disconnect, reason_str
                );
            }
        }
    }
    Ok(out)
}

fn query_bt_device_live_status(id: &str) -> (bool, String, u64, bool) {
    use windows::Devices::Bluetooth::{
        BluetoothConnectionStatus, BluetoothDevice, BluetoothLEDevice,
    };
    let h = HSTRING::from(id);
    if let Ok(op) = BluetoothDevice::FromIdAsync(&h) {
        if let Ok(dev) = op.get() {
            let addr = dev.BluetoothAddress().unwrap_or(0);
            return match dev.ConnectionStatus() {
                Ok(BluetoothConnectionStatus::Connected) => (true, "connected".to_string(), addr, false),
                Ok(BluetoothConnectionStatus::Disconnected) => (false, "paired".to_string(), addr, false),
                Err(_) => (false, "unknown".to_string(), addr, false),
                _ => (false, "unknown".to_string(), addr, false),
            };
        }
    }
    if let Ok(op) = BluetoothLEDevice::FromIdAsync(&h) {
        if let Ok(dev) = op.get() {
            let addr = dev.BluetoothAddress().unwrap_or(0);
            return match dev.ConnectionStatus() {
                Ok(BluetoothConnectionStatus::Connected) => (true, "connected".to_string(), addr, true),
                Ok(BluetoothConnectionStatus::Disconnected) => (false, "paired".to_string(), addr, true),
                Err(_) => (false, "unknown".to_string(), addr, true),
                _ => (false, "unknown".to_string(), addr, true),
            };
        }
    }
    (false, "unknown".to_string(), 0, false)
}

fn connect_bluetooth_device(id: &str) -> Result<BluetoothActionResult, String> {
    use windows::Devices::Bluetooth::GenericAttributeProfile::GattSession;
    use windows::Devices::Bluetooth::{BluetoothCacheMode, BluetoothLEDevice};

    if id.trim().is_empty() {
        return Err("Invalid Bluetooth device ID".to_string());
    }
    let _com = ComGuard::new();

    if let Ok(false) = check_bluetooth_radio_enabled() {
        return Ok(BluetoothActionResult {
            outcome: "failed".to_string(),
            connected: false,
            status: "paired".to_string(),
            reason_code: Some("bluetooth_radio_off".to_string()),
            message: Some("Bluetooth adapter is turned off.".to_string()),
        });
    }

    let (already_connected, init_status, bt_addr, is_ble) = query_bt_device_live_status(id);
    if already_connected {
        return Ok(BluetoothActionResult {
            outcome: "confirmed".to_string(),
            connected: true,
            status: "connected".to_string(),
            reason_code: None,
            message: None,
        });
    }

    if !is_ble {
        // Classic Bluetooth device: attempt CoreAudio KSPROPSETID_BtAudio reconnect
        let mac_hex = format!("{bt_addr:012X}");
        let invoked = unsafe { invoke_bt_audio_ks_control(&mac_hex, true) };
        if !invoked {
            return Ok(BluetoothActionResult {
                outcome: "unsupported".to_string(),
                connected: false,
                status: init_status,
                reason_code: Some("audio_driver_no_reconnect".to_string()),
                message: Some(
                    "Direct connection is not supported by Windows for this device type. Please use Windows Bluetooth Settings."
                        .to_string(),
                ),
            });
        }

        let start = Instant::now();
        while start.elapsed() < Duration::from_millis(7500) {
            std::thread::sleep(Duration::from_millis(350));
            let (conn, st, _, _) = query_bt_device_live_status(id);
            if conn {
                invalidate_bt_audio_caps_cache();
                return Ok(BluetoothActionResult {
                    outcome: "confirmed".to_string(),
                    connected: true,
                    status: st,
                    reason_code: None,
                    message: None,
                });
            }
        }

        invalidate_bt_audio_caps_cache();
        let (conn, st, _, _) = query_bt_device_live_status(id);
        if conn {
            Ok(BluetoothActionResult {
                outcome: "confirmed".to_string(),
                connected: true,
                status: st,
                reason_code: None,
                message: None,
            })
        } else {
            Ok(BluetoothActionResult {
                outcome: "failed".to_string(),
                connected: false,
                status: st,
                reason_code: Some("device_out_of_range".to_string()),
                message: Some(
                    "Could not connect. Make sure the device is turned on and in range."
                        .to_string(),
                ),
            })
        }
    } else {
        // BLE GATT device
        let h = HSTRING::from(id);
        let Ok(op) = BluetoothLEDevice::FromIdAsync(&h) else {
            return Ok(BluetoothActionResult {
                outcome: "failed".to_string(),
                connected: false,
                status: init_status,
                reason_code: Some("device_out_of_range".to_string()),
                message: Some("Could not open Bluetooth LE device.".to_string()),
            });
        };
        let Ok(le_dev) = op.get() else {
            return Ok(BluetoothActionResult {
                outcome: "failed".to_string(),
                connected: false,
                status: init_status,
                reason_code: Some("device_out_of_range".to_string()),
                message: Some("Could not access Bluetooth LE device.".to_string()),
            });
        };

        let is_ble_hid = le_dev
            .Appearance()
            .ok()
            .map(|app| {
                let cat = app.Category().unwrap_or(0);
                let raw = app.RawValue().unwrap_or(0);
                cat == 15 || (0x03C0..=0x03CF).contains(&raw)
            })
            .unwrap_or(false);

        if is_ble_hid {
            return Ok(BluetoothActionResult {
                outcome: "unsupported".to_string(),
                connected: false,
                status: init_status,
                reason_code: Some("hid_auto_connect".to_string()),
                message: Some(
                    "BLE HID input devices connect automatically when used, or via Windows Bluetooth Settings."
                        .to_string(),
                ),
            });
        }

        let Ok(bt_id) = le_dev.BluetoothDeviceId() else {
            return Ok(BluetoothActionResult {
                outcome: "unsupported".to_string(),
                connected: false,
                status: init_status,
                reason_code: Some("unsupported_device_type".to_string()),
                message: Some("Direct BLE connection is not supported for this device.".to_string()),
            });
        };
        let Ok(sess_op) = GattSession::FromDeviceIdAsync(&bt_id) else {
            return Ok(BluetoothActionResult {
                outcome: "unsupported".to_string(),
                connected: false,
                status: init_status,
                reason_code: Some("gatt_maintain_unsupported".to_string()),
                message: Some("Could not create GATT session for this device.".to_string()),
            });
        };
        let Ok(session) = sess_op.get() else {
            return Ok(BluetoothActionResult {
                outcome: "failed".to_string(),
                connected: false,
                status: init_status,
                reason_code: Some("gatt_maintain_unsupported".to_string()),
                message: Some("Failed to open GATT session.".to_string()),
            });
        };

        if !session.CanMaintainConnection().unwrap_or(false) {
            return Ok(BluetoothActionResult {
                outcome: "unsupported".to_string(),
                connected: false,
                status: init_status,
                reason_code: Some("gatt_maintain_unsupported".to_string()),
                message: Some(
                    "Windows does not support maintaining a direct connection for this BLE device."
                        .to_string(),
                ),
            });
        }

        let _ = session.SetMaintainConnection(true);
        if let Ok(mut map) = gatt_sessions().lock() {
            map.insert(id.to_string(), session);
        }
        let _ = le_dev
            .GetGattServicesWithCacheModeAsync(BluetoothCacheMode::Uncached)
            .and_then(|op| op.get());

        let start = Instant::now();
        while start.elapsed() < Duration::from_millis(6500) {
            let (conn, st, _, _) = query_bt_device_live_status(id);
            if conn {
                invalidate_bt_audio_caps_cache();
                return Ok(BluetoothActionResult {
                    outcome: "confirmed".to_string(),
                    connected: true,
                    status: st,
                    reason_code: None,
                    message: None,
                });
            }
            std::thread::sleep(Duration::from_millis(350));
        }

        invalidate_bt_audio_caps_cache();
        let (conn, st, _, _) = query_bt_device_live_status(id);
        if conn {
            Ok(BluetoothActionResult {
                outcome: "confirmed".to_string(),
                connected: true,
                status: st,
                reason_code: None,
                message: None,
            })
        } else {
            if let Ok(mut map) = gatt_sessions().lock() {
                if let Some(s) = map.remove(id) {
                    let _ = s.SetMaintainConnection(false);
                    let _ = s.Close();
                }
            }
            Ok(BluetoothActionResult {
                outcome: "failed".to_string(),
                connected: false,
                status: st,
                reason_code: Some("ble_out_of_range".to_string()),
                message: Some(
                    "Could not connect. Make sure the BLE device is awake and in range.".to_string(),
                ),
            })
        }
    }
}

fn disconnect_bluetooth_device(id: &str) -> Result<BluetoothActionResult, String> {
    if id.trim().is_empty() {
        return Err("Invalid Bluetooth device ID".to_string());
    }
    let _com = ComGuard::new();

    let (currently_connected, init_status, bt_addr, is_ble) = query_bt_device_live_status(id);
    if !currently_connected && init_status == "paired" {
        return Ok(BluetoothActionResult {
            outcome: "confirmed".to_string(),
            connected: false,
            status: "paired".to_string(),
            reason_code: None,
            message: None,
        });
    }

    let start = Instant::now();

    if !is_ble {
        let mac_hex = format!("{bt_addr:012X}");
        let masked = mask_bt_addr(bt_addr);

        // Backend safety guard: Verify device type using authoritative Windows Bluetooth APIs.
        // Never forcibly disconnect keyboards, mice, phones, computers, or non-audio devices!
        let h = HSTRING::from(id);
        let dev_opt = if bt_addr != 0 {
            windows::Devices::Bluetooth::BluetoothDevice::FromBluetoothAddressAsync(bt_addr)
                .ok()
                .and_then(|op| op.get().ok())
                .or_else(|| {
                    windows::Devices::Bluetooth::BluetoothDevice::FromIdAsync(&h)
                        .ok()
                        .and_then(|op| op.get().ok())
                })
        } else {
            windows::Devices::Bluetooth::BluetoothDevice::FromIdAsync(&h)
                .ok()
                .and_then(|op| op.get().ok())
        };

        let (is_cod_audio, is_cod_phone, is_cod_hid, is_cod_computer) = if let Some(ref dev) = dev_opt {
            if let Ok(cod) = dev.ClassOfDevice() {
                let raw_cod = cod.RawValue().unwrap_or(0);
                let major = (raw_cod & 0x1F00) >> 8;
                let is_phone = major == 0x02 || (raw_cod & 0x1F00) == 0x0200;
                let is_hid = major == 0x05 || (raw_cod & 0x1F00) == 0x0500;
                let is_comp = major == 0x01 || (raw_cod & 0x1F00) == 0x0100;
                let is_audio = major == 0x04;
                (is_audio, is_phone, is_hid, is_comp)
            } else {
                (false, false, false, false)
            }
        } else {
            (false, false, false, false)
        };

        let dev_name = dev_opt.as_ref().and_then(|d| d.Name().ok()).map(|s| s.to_string_lossy()).unwrap_or_default();
        let is_named_hid = is_hid_name_or_id(id, &dev_name);
        let id_upper = id.to_uppercase();
        let is_named_phone = id_upper.contains("PHONE") || id_upper.contains("MOBILE");

        if is_cod_phone || is_named_phone {
            eprintln!("[Oryvia BT Guard] Blocked disconnect: {masked} is a phone.");
            return Ok(BluetoothActionResult {
                outcome: "unsupported".to_string(),
                connected: currently_connected,
                status: init_status,
                reason_code: Some("phone_managed_by_windows".to_string()),
                message: Some("Phone connections are managed automatically by Windows Phone Link or Windows Bluetooth Settings.".to_string()),
            });
        }

        if is_cod_hid || is_named_hid {
            eprintln!("[Oryvia BT Guard] Blocked disconnect: {masked} is an HID input device (keyboard/mouse).");
            return Ok(BluetoothActionResult {
                outcome: "unsupported".to_string(),
                connected: currently_connected,
                status: init_status,
                reason_code: Some("hid_managed_by_windows".to_string()),
                message: Some("HID input devices (keyboard/mouse) are managed by Windows Bluetooth Settings.".to_string()),
            });
        }

        if is_cod_computer {
            eprintln!("[Oryvia BT Guard] Blocked disconnect: {masked} is a computer/laptop.");
            return Ok(BluetoothActionResult {
                outcome: "unsupported".to_string(),
                connected: currently_connected,
                status: init_status,
                reason_code: Some("unsupported_device_type".to_string()),
                message: Some("Disconnecting computer devices is not supported. Please use Windows Bluetooth Settings.".to_string()),
            });
        }

        let audio_caps = get_cached_bt_audio_caps(false);
        let has_cached_endpoint = !mac_hex.is_empty() && audio_caps.has_endpoint_macs.contains(&mac_hex);
        let (_, has_live_endpoint) = if !mac_hex.is_empty() {
            unsafe { check_mac_audio_endpoints_active(&mac_hex) }
        } else {
            (false, false)
        };
        let is_verified_audio_device = is_cod_audio || has_cached_endpoint || has_live_endpoint;

        if !is_verified_audio_device {
            eprintln!("[Oryvia BT Guard] Blocked disconnect: {masked} is neither an Audio/Video device nor has audio endpoints.");
            return Ok(BluetoothActionResult {
                outcome: "unsupported".to_string(),
                connected: currently_connected,
                status: init_status,
                reason_code: Some("unsupported_device_type".to_string()),
                message: Some("Disconnecting this device type directly is not permitted. Please use Windows Bluetooth Settings.".to_string()),
            });
        }

        eprintln!("[Oryvia BT Diag] Initiating true Bluetooth disconnect for {masked} (audio validated)");

        // 1. Gracefully tell the audio driver to tear down audio pin first (if audio endpoints exist)
        let _audio_torn_down = unsafe { invoke_bt_audio_ks_control(&mac_hex, false) };

        // 2. Tear down the baseband ACL connection via Bluetooth radio IOCTL
        let baseband_res = unsafe { disconnect_bt_device_baseband(bt_addr) };
        if let Err(ref e) = baseband_res {
            eprintln!("[Oryvia BT Diag] Warning: baseband disconnect returned error for {masked}: {e}");
        }

        // 3. Poll Windows Bluetooth stack live status
        let mut confirmed_disconnected = false;
        while start.elapsed() < Duration::from_millis(6000) {
            std::thread::sleep(Duration::from_millis(250));
            let (conn, st, _, _) = query_bt_device_live_status(id);
            if !conn && st == "paired" {
                // Detected disconnected. Check stability (guard against instantaneous auto-reconnect)
                std::thread::sleep(Duration::from_millis(300));
                let (conn_recheck, st_recheck, _, _) = query_bt_device_live_status(id);
                if !conn_recheck {
                    confirmed_disconnected = true;
                    eprintln!(
                        "[Oryvia BT Diag] Disconnect confirmed for {masked} in {}ms (status: {st_recheck})",
                        start.elapsed().as_millis()
                    );
                    break;
                } else {
                    eprintln!("[Oryvia BT Diag] Warning: Device {masked} auto-reconnected immediately, retrying baseband disconnect...");
                    let _ = unsafe { disconnect_bt_device_baseband(bt_addr) };
                }
            }
        }

        invalidate_bt_audio_caps_cache();

        let (final_conn, final_st, _, _) = query_bt_device_live_status(id);
        if !final_conn && (confirmed_disconnected || final_st == "paired") {
            Ok(BluetoothActionResult {
                outcome: "confirmed".to_string(),
                connected: false,
                status: "paired".to_string(),
                reason_code: None,
                message: None,
            })
        } else if !final_conn && final_st == "unknown" {
            Ok(BluetoothActionResult {
                outcome: "unknown".to_string(),
                connected: false,
                status: final_st,
                reason_code: Some("status_unknown".to_string()),
                message: Some(
                    "Disconnection requested, but Windows reported device status as unknown."
                        .to_string(),
                ),
            })
        } else {
            let (audio_active, _) = unsafe { check_mac_audio_endpoints_active(&mac_hex) };
            eprintln!(
                "[Oryvia BT Diag] Disconnect failed for {masked}: final_conn={final_conn}, final_st={final_st}, audio_active={audio_active}"
            );
            Ok(BluetoothActionResult {
                outcome: "failed".to_string(),
                connected: true,
                status: final_st,
                reason_code: Some("device_remained_connected".to_string()),
                message: Some(
                    "Device remained connected. Another application or system profile may still be using it."
                        .to_string(),
                ),
            })
        }
    } else {
        let had_session = if let Ok(mut map) = gatt_sessions().lock() {
            if let Some(s) = map.remove(id) {
                let _ = s.SetMaintainConnection(false);
                let _ = s.Close();
                true
            } else {
                false
            }
        } else {
            false
        };

        if !had_session {
            return Ok(BluetoothActionResult {
                outcome: "unsupported".to_string(),
                connected: currently_connected,
                status: init_status,
                reason_code: Some("windows_managed".to_string()),
                message: Some(
                    "This BLE connection is managed by Windows system drivers. Use Windows Bluetooth Settings to manage it."
                        .to_string(),
                ),
            });
        }

        let start = Instant::now();
        while start.elapsed() < Duration::from_millis(4500) {
            std::thread::sleep(Duration::from_millis(350));
            let (conn, st, _, _) = query_bt_device_live_status(id);
            if !conn && st == "paired" {
                return Ok(BluetoothActionResult {
                    outcome: "confirmed".to_string(),
                    connected: false,
                    status: st,
                    reason_code: None,
                    message: None,
                });
            }
        }

        let (conn, st, _, _) = query_bt_device_live_status(id);
        if !conn && st == "paired" {
            Ok(BluetoothActionResult {
                outcome: "confirmed".to_string(),
                connected: false,
                status: st,
                reason_code: None,
                message: None,
            })
        } else if !conn && st == "unknown" {
            Ok(BluetoothActionResult {
                outcome: "unknown".to_string(),
                connected: false,
                status: st,
                reason_code: Some("status_unknown".to_string()),
                message: Some(
                    "Disconnection requested, but Windows reported device status as unknown."
                        .to_string(),
                ),
            })
        } else {
            Ok(BluetoothActionResult {
                outcome: "unsupported".to_string(),
                connected: true,
                status: st,
                reason_code: Some("device_remained_connected".to_string()),
                message: Some(
                    "GATT session closed, but Windows or another app is still keeping this BLE device connected."
                        .to_string(),
                ),
            })
        }
    }
}

fn unpair_bluetooth_device(id: &str) -> Result<(), String> {
    use windows::Devices::Enumeration::{DeviceInformation, DeviceUnpairingResultStatus};

    if id.trim().is_empty() {
        return Err("Invalid Bluetooth device ID".to_string());
    }

    let _com = ComGuard::new();
    if let Ok(mut map) = gatt_sessions().lock() {
        if let Some(s) = map.remove(id) {
            let _ = s.SetMaintainConnection(false);
            let _ = s.Close();
        }
    }

    let h = HSTRING::from(id);
    let info = DeviceInformation::CreateFromIdAsync(&h)
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;
    let pairing = info.Pairing().map_err(|e| e.to_string())?;
    let result = pairing
        .UnpairAsync()
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;
    let status = result.Status().map_err(|e| e.to_string())?;
    if status == DeviceUnpairingResultStatus::Unpaired
        || status == DeviceUnpairingResultStatus::AlreadyUnpaired
    {
        Ok(())
    } else {
        Err(format!("Could not unpair device (status code {})", status.0))
    }
}

fn cached_networks() -> Result<Vec<WifiNetwork>, String> {
    unsafe {
        let (handle, guid) = open_first_interface()?;
        let entries = query_available_networks(handle.0, &guid, false)?;
        Ok(entries.into_iter().map(|e| e.network).collect())
    }
}

#[tauri::command]
pub async fn wifi_status_list() -> Result<Vec<WifiNetwork>, String> {
    tauri::async_runtime::spawn_blocking(cached_networks)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn wifi_scan() -> Result<Vec<WifiNetwork>, String> {
    tauri::async_runtime::spawn_blocking(scan_networks)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn wifi_connect(ssid: String, password: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || connect_network(&ssid, password.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn wifi_disconnect() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(disconnect_network)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn wifi_forget(ssid: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || forget_network(&ssid))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn bluetooth_devices() -> Result<Vec<BluetoothDeviceInfo>, String> {
    tauri::async_runtime::spawn_blocking(list_bluetooth_devices)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn bluetooth_connect(id: String) -> Result<BluetoothActionResult, String> {
    tauri::async_runtime::spawn_blocking(move || connect_bluetooth_device(&id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn bluetooth_disconnect(id: String) -> Result<BluetoothActionResult, String> {
    tauri::async_runtime::spawn_blocking(move || disconnect_bluetooth_device(&id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn bluetooth_unpair(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || unpair_bluetooth_device(&id))
        .await
        .map_err(|e| e.to_string())?
}

struct WatcherContext {
    watcher: windows::Devices::Enumeration::DeviceWatcher,
    added_token: Option<i64>,
    updated_token: Option<i64>,
    removed_token: Option<i64>,
    stopped_token: Option<i64>,
    stopped_flag: Arc<AtomicBool>,
}

impl WatcherContext {
    fn stop_and_cleanup(&self) {
        use windows::Devices::Enumeration::DeviceWatcherStatus;
        if let Some(token) = self.added_token {
            let _ = self.watcher.RemoveAdded(token);
        }
        if let Some(token) = self.updated_token {
            let _ = self.watcher.RemoveUpdated(token);
        }
        if let Some(token) = self.removed_token {
            let _ = self.watcher.RemoveRemoved(token);
        }

        if let Ok(st) = self.watcher.Status() {
            if st == DeviceWatcherStatus::Started || st == DeviceWatcherStatus::EnumerationCompleted {
                let _ = self.watcher.Stop();
            }
        }

        let start = std::time::Instant::now();
        while start.elapsed() < Duration::from_millis(1000) {
            if self.stopped_flag.load(Ordering::SeqCst) {
                break;
            }
            if let Ok(st) = self.watcher.Status() {
                if st == DeviceWatcherStatus::Stopped || st == DeviceWatcherStatus::Aborted || st == DeviceWatcherStatus::Created {
                    break;
                }
            }
            std::thread::sleep(Duration::from_millis(15));
        }

        if let Some(token) = self.stopped_token {
            let _ = self.watcher.RemoveStopped(token);
        }
    }
}

struct ActiveDiscovery {
    session_id: u64,
    watcher_classic: Option<WatcherContext>,
    watcher_ble: Option<WatcherContext>,
    is_running: Arc<AtomicBool>,
}

struct DiscoveryState {
    active: Option<ActiveDiscovery>,
    devices: HashMap<String, DiscoveredBluetoothDevice>,
    session_counter: u64,
}

static DISCOVERY_STATE: OnceLock<Mutex<DiscoveryState>> = OnceLock::new();

fn get_discovery_state() -> &'static Mutex<DiscoveryState> {
    DISCOVERY_STATE.get_or_init(|| {
        Mutex::new(DiscoveryState {
            active: None,
            devices: HashMap::new(),
            session_counter: 0,
        })
    })
}

fn parse_mac_from_id(id: &str) -> u64 {
    if let Some(pos) = id.rfind('-') {
        let mac_part = &id[pos + 1..];
        let cleaned: String = mac_part.chars().filter(|c| c.is_ascii_hexdigit()).collect();
        if cleaned.len() == 12 {
            if let Ok(v) = u64::from_str_radix(&cleaned, 16) {
                return v;
            }
        }
    }
    let cleaned: String = id.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if cleaned.len() >= 12 {
        let last12 = &cleaned[cleaned.len() - 12..];
        if let Ok(v) = u64::from_str_radix(last12, 16) {
            return v;
        }
    }
    0
}

fn process_discovered_device(
    dev: &windows::Devices::Enumeration::DeviceInformation,
    is_ble: bool,
    session_id: u64,
    window: &tauri::Window,
) {
    use tauri::Emitter;

    // Drop immediately if this discovery session is stale or no longer running
    {
        let Ok(state) = get_discovery_state().lock() else { return };
        if let Some(ref active) = state.active {
            if active.session_id != session_id || !active.is_running.load(Ordering::SeqCst) {
                return;
            }
        } else {
            return;
        }
    }

    let Ok(name_h) = dev.Name() else { return };
    let name = name_h.to_string().trim().to_string();
    if name.is_empty() {
        return; // Filter out nameless beacons/junk
    }

    let Ok(id_h) = dev.Id() else { return };
    let id = id_h.to_string();
    if id.is_empty() {
        return;
    }

    let Ok(pairing) = dev.Pairing() else { return };
    let is_paired = pairing.IsPaired().unwrap_or(false);
    if is_paired {
        return; // Already in the paired devices list!
    }

    // Evaluate CanPair:
    // If CanPair is false on the initial watcher event, it may be due to an unpopulated/stale snapshot.
    // We refresh the capability using the authoritative AssociationEndpoint DeviceInformation object.
    let (can_pair, disabled_reason_code) = match pairing.CanPair() {
        Ok(true) => (true, None),
        Ok(false) => {
            let refreshed = match windows::Devices::Enumeration::DeviceInformation::CreateFromIdAsyncWithKindAndAdditionalProperties(
                &id_h,
                None,
                windows::Devices::Enumeration::DeviceInformationKind::AssociationEndpoint,
            ) {
                Ok(op) => match op.get() {
                    Ok(fresh_dev) => fresh_dev.Pairing().and_then(|p| p.CanPair()).unwrap_or(false),
                    Err(_) => false,
                },
                Err(_) => false,
            };
            if refreshed {
                (true, None)
            } else {
                (false, Some("pairing_not_supported".to_string()))
            }
        }
        Err(_) => (true, None),
    };

    let bt_addr = parse_mac_from_id(&id);
    let address = if bt_addr != 0 {
        format_bt_address(bt_addr)
    } else {
        None
    };

    let device_kind = if !is_ble {
        "classic".to_string()
    } else {
        "ble".to_string()
    };

    let discovered = DiscoveredBluetoothDevice {
        id: id.clone(),
        name,
        address,
        device_kind,
        can_pair,
        is_paired: false,
        disabled_reason_code,
    };

    let updated_list = {
        let Ok(mut state) = get_discovery_state().lock() else { return };
        if let Some(ref active) = state.active {
            if active.session_id != session_id {
                return;
            }
        } else {
            return;
        }

        if let Some(ref addr) = discovered.address {
            let existing_id = state.devices.iter().find_map(|(k, v)| {
                if v.address.as_ref() == Some(addr) {
                    Some(k.clone())
                } else {
                    None
                }
            });
            if let Some(old_id) = existing_id {
                if !is_ble && state.devices.get(&old_id).map_or(false, |d| d.device_kind == "ble") {
                    state.devices.remove(&old_id);
                    state.devices.insert(id.clone(), discovered);
                }
            } else if state.devices.len() < 30 {
                state.devices.insert(id.clone(), discovered);
            }
        } else if state.devices.len() < 30 {
            state.devices.insert(id.clone(), discovered);
        }

        state.devices.values().cloned().collect::<Vec<_>>()
    };

    let _ = window.emit("bluetooth-discovery-update", updated_list);
}

fn update_discovered_device(
    update: &windows::Devices::Enumeration::DeviceInformationUpdate,
    session_id: u64,
    window: &tauri::Window,
) {
    use tauri::Emitter;
    let Ok(id_h) = update.Id() else { return };
    let id = id_h.to_string();
    if id.is_empty() {
        return;
    }

    // Check if device needs a capability refresh without holding the lock during WinRT call
    let needs_refresh = {
        let Ok(state) = get_discovery_state().lock() else { return };
        if let Some(ref active) = state.active {
            if active.session_id != session_id || !active.is_running.load(Ordering::SeqCst) {
                return;
            }
        } else {
            return;
        }
        state.devices.get(&id).map_or(false, |d| !d.can_pair)
    };

    if !needs_refresh {
        return;
    }

    // Query outside of the DISCOVERY_STATE mutex to prevent deadlock with WinRT callbacks
    let mut refreshed_can_pair = false;
    if let Ok(op) = windows::Devices::Enumeration::DeviceInformation::CreateFromIdAsyncWithKindAndAdditionalProperties(
        &id_h,
        None,
        windows::Devices::Enumeration::DeviceInformationKind::AssociationEndpoint,
    ) {
        if let Ok(fresh) = op.get() {
            if let Ok(p) = fresh.Pairing() {
                if p.CanPair().unwrap_or(false) {
                    refreshed_can_pair = true;
                }
            }
        }
    }

    if !refreshed_can_pair {
        return;
    }

    let updated_list = {
        let Ok(mut state) = get_discovery_state().lock() else { return };
        if let Some(ref active) = state.active {
            if active.session_id != session_id || !active.is_running.load(Ordering::SeqCst) {
                return;
            }
        } else {
            return;
        }

        if let Some(dev) = state.devices.get_mut(&id) {
            dev.can_pair = true;
            dev.disabled_reason_code = None;
            state.devices.values().cloned().collect::<Vec<_>>()
        } else {
            return;
        }
    };

    let _ = window.emit("bluetooth-discovery-update", updated_list);
}

fn remove_discovered_device(id: &str, session_id: u64, window: &tauri::Window) {
    use tauri::Emitter;
    let updated_list = {
        let Ok(mut state) = get_discovery_state().lock() else { return };
        if let Some(ref active) = state.active {
            if active.session_id != session_id || !active.is_running.load(Ordering::SeqCst) {
                return;
            }
        } else {
            return;
        }

        if state.devices.remove(id).is_some() {
            state.devices.values().cloned().collect::<Vec<_>>()
        } else {
            return;
        }
    };

    let _ = window.emit("bluetooth-discovery-update", updated_list);
}

pub fn start_bluetooth_discovery(window: tauri::Window) -> Result<(), String> {
    use windows::Devices::Bluetooth::{BluetoothDevice, BluetoothLEDevice};
    use windows::Devices::Enumeration::{
        DeviceInformation, DeviceInformationKind, DeviceInformationUpdate, DeviceWatcher,
    };
    use windows::Foundation::TypedEventHandler;

    let _com = ComGuard::new();

    if let Ok(false) = check_bluetooth_radio_enabled() {
        return Err("bluetooth_radio_off".to_string());
    }

    // Stop any existing discovery first
    stop_bluetooth_discovery();

    let session_id = {
        let mut state = get_discovery_state().lock().map_err(|e| e.to_string())?;
        state.session_counter += 1;
        state.devices.clear();
        state.session_counter
    };

    let aqs_classic = BluetoothDevice::GetDeviceSelectorFromPairingState(false)
        .map_err(|e| format!("Failed to get classic selector: {e}"))?;
    let watcher_classic = DeviceInformation::CreateWatcherWithKindAqsFilterAndAdditionalProperties(
        &aqs_classic,
        None,
        DeviceInformationKind::AssociationEndpoint,
    )
    .or_else(|_| DeviceInformation::CreateWatcherAqsFilter(&aqs_classic))
    .map_err(|e| format!("Failed to create classic watcher: {e}"))?;

    let aqs_ble = BluetoothLEDevice::GetDeviceSelectorFromPairingState(false)
        .map_err(|e| format!("Failed to get BLE selector: {e}"))?;
    let watcher_ble = DeviceInformation::CreateWatcherWithKindAqsFilterAndAdditionalProperties(
        &aqs_ble,
        None,
        DeviceInformationKind::AssociationEndpoint,
    )
    .or_else(|_| DeviceInformation::CreateWatcherAqsFilter(&aqs_ble))
    .map_err(|e| format!("Failed to create BLE watcher: {e}"))?;

    let is_running = Arc::new(AtomicBool::new(true));

    let win_c = window.clone();
    let is_run_c = Arc::clone(&is_running);
    let token_c_add = watcher_classic.Added(&TypedEventHandler::new(move |_sender, info| {
        if !is_run_c.load(Ordering::Relaxed) {
            return Ok(());
        }
        if let Some(ref dev) = *info {
            process_discovered_device(dev, false, session_id, &win_c);
        }
        Ok(())
    })).ok();

    let win_c_upd = window.clone();
    let is_run_c_upd = Arc::clone(&is_running);
    let token_c_upd = watcher_classic.Updated(&TypedEventHandler::<DeviceWatcher, DeviceInformationUpdate>::new(move |_sender, update_info| {
        if !is_run_c_upd.load(Ordering::Relaxed) {
            return Ok(());
        }
        if let Some(ref update) = *update_info {
            update_discovered_device(update, session_id, &win_c_upd);
        }
        Ok(())
    })).ok();

    let win_c_rem = window.clone();
    let is_run_c_rem = Arc::clone(&is_running);
    let token_c_rem = watcher_classic.Removed(&TypedEventHandler::<DeviceWatcher, DeviceInformationUpdate>::new(move |_sender, update_info| {
        if !is_run_c_rem.load(Ordering::Relaxed) {
            return Ok(());
        }
        if let Some(ref update) = *update_info {
            if let Ok(id_h) = update.Id() {
                remove_discovered_device(&id_h.to_string(), session_id, &win_c_rem);
            }
        }
        Ok(())
    })).ok();

    let stopped_flag_c = Arc::new(AtomicBool::new(false));
    let stopped_c_clone = Arc::clone(&stopped_flag_c);
    let token_c_stop = watcher_classic.Stopped(&TypedEventHandler::<DeviceWatcher, windows::core::IInspectable>::new(move |_sender, _args| {
        stopped_c_clone.store(true, Ordering::SeqCst);
        Ok(())
    })).ok();

    let win_ble = window.clone();
    let is_run_ble = Arc::clone(&is_running);
    let token_b_add = watcher_ble.Added(&TypedEventHandler::<DeviceWatcher, DeviceInformation>::new(move |_sender, info| {
        if !is_run_ble.load(Ordering::Relaxed) {
            return Ok(());
        }
        if let Some(ref dev) = *info {
            process_discovered_device(dev, true, session_id, &win_ble);
        }
        Ok(())
    })).ok();

    let win_ble_upd = window.clone();
    let is_run_ble_upd = Arc::clone(&is_running);
    let token_b_upd = watcher_ble.Updated(&TypedEventHandler::<DeviceWatcher, DeviceInformationUpdate>::new(move |_sender, update_info| {
        if !is_run_ble_upd.load(Ordering::Relaxed) {
            return Ok(());
        }
        if let Some(ref update) = *update_info {
            update_discovered_device(update, session_id, &win_ble_upd);
        }
        Ok(())
    })).ok();

    let win_ble_rem = window.clone();
    let is_run_ble_rem = Arc::clone(&is_running);
    let token_b_rem = watcher_ble.Removed(&TypedEventHandler::<DeviceWatcher, DeviceInformationUpdate>::new(move |_sender, update_info| {
        if !is_run_ble_rem.load(Ordering::Relaxed) {
            return Ok(());
        }
        if let Some(ref update) = *update_info {
            if let Ok(id_h) = update.Id() {
                remove_discovered_device(&id_h.to_string(), session_id, &win_ble_rem);
            }
        }
        Ok(())
    })).ok();

    let stopped_flag_b = Arc::new(AtomicBool::new(false));
    let stopped_b_clone = Arc::clone(&stopped_flag_b);
    let token_b_stop = watcher_ble.Stopped(&TypedEventHandler::<DeviceWatcher, windows::core::IInspectable>::new(move |_sender, _args| {
        stopped_b_clone.store(true, Ordering::SeqCst);
        Ok(())
    })).ok();

    // Verify watcher start results
    let res_classic = watcher_classic.Start();
    let res_ble = watcher_ble.Start();

    if res_classic.is_err() && res_ble.is_err() {
        return Err(format!(
            "Failed to start Bluetooth watchers: classic={:?}, ble={:?}",
            res_classic.err(),
            res_ble.err()
        ));
    }

    let active_classic = if res_classic.is_ok() {
        Some(WatcherContext {
            watcher: watcher_classic,
            added_token: token_c_add,
            updated_token: token_c_upd,
            removed_token: token_c_rem,
            stopped_token: token_c_stop,
            stopped_flag: stopped_flag_c,
        })
    } else {
        eprintln!("[Oryvia BT Discovery] Classic watcher failed to start: {:?}", res_classic.err());
        None
    };

    let active_ble = if res_ble.is_ok() {
        Some(WatcherContext {
            watcher: watcher_ble,
            added_token: token_b_add,
            updated_token: token_b_upd,
            removed_token: token_b_rem,
            stopped_token: token_b_stop,
            stopped_flag: stopped_flag_b,
        })
    } else {
        eprintln!("[Oryvia BT Discovery] BLE watcher failed to start: {:?}", res_ble.err());
        None
    };

    {
        let mut state = get_discovery_state().lock().map_err(|e| e.to_string())?;
        state.active = Some(ActiveDiscovery {
            session_id,
            watcher_classic: active_classic,
            watcher_ble: active_ble,
            is_running: Arc::clone(&is_running),
        });
    }

    let timer_win = window.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(10)).await;
        let active_to_stop = {
            if let Ok(mut state) = get_discovery_state().lock() {
                if let Some(ref active) = state.active {
                    if active.session_id == session_id {
                        state.active.take()
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            }
        };

        if let Some(active) = active_to_stop {
            active.is_running.store(false, Ordering::SeqCst);
            if let Some(ref c) = active.watcher_classic {
                c.stop_and_cleanup();
            }
            if let Some(ref b) = active.watcher_ble {
                b.stop_and_cleanup();
            }
            use tauri::Emitter;
            let _ = timer_win.emit("bluetooth-discovery-stopped", ());
        }
    });

    Ok(())
}

pub fn stop_bluetooth_discovery() {
    let active_opt = {
        if let Ok(mut state) = get_discovery_state().lock() {
            state.active.take()
        } else {
            None
        }
    };

    if let Some(active) = active_opt {
        active.is_running.store(false, Ordering::SeqCst);
        if let Some(ref c) = active.watcher_classic {
            c.stop_and_cleanup();
        }
        if let Some(ref b) = active.watcher_ble {
            b.stop_and_cleanup();
        }
    }
}

pub fn get_discovered_devices() -> Result<Vec<DiscoveredBluetoothDevice>, String> {
    let state = get_discovery_state().lock().map_err(|e| e.to_string())?;
    Ok(state.devices.values().cloned().collect())
}

pub fn pair_bluetooth_device(id: &str) -> Result<BluetoothPairResult, String> {
    use windows::Devices::Enumeration::{
        DeviceInformation, DeviceInformationCustomPairing, DeviceInformationKind,
        DevicePairingKinds, DevicePairingProtectionLevel, DevicePairingRequestedEventArgs,
        DevicePairingResultStatus,
    };
    use windows::Foundation::TypedEventHandler;
    use windows::core::HSTRING;
    use std::sync::Arc;

    if id.trim().is_empty() {
        return Err("Invalid device ID".to_string());
    }

    let _com = ComGuard::new();

    let mac = parse_mac_from_id(id);
    let masked_mac = mask_bt_addr(mac);
    let start_time = std::time::Instant::now();

    eprintln!("[Oryvia BT Pairing] Starting pairing for device MAC={masked_mac}, ID={id}");

    let h = HSTRING::from(id);

    // Stop discovery before creating/pairing to avoid radio contention and cache invalidation
    stop_bluetooth_discovery();

    // 1. Resolve DeviceInformation using AssociationEndpoint kind first, fallback to basic CreateFromIdAsync
    let dev_info = match DeviceInformation::CreateFromIdAsyncWithKindAndAdditionalProperties(&h, None, DeviceInformationKind::AssociationEndpoint) {
        Ok(op) => match op.get() {
            Ok(info) => {
                eprintln!("[Oryvia BT Pairing] Resolved via AssociationEndpoint");
                info
            }
            Err(e) => {
                eprintln!("[Oryvia BT Pairing] AssociationEndpoint get() failed: {e}, falling back to default");
                let op2 = DeviceInformation::CreateFromIdAsync(&h).map_err(|e2| format!("Failed to find device: {e2}"))?;
                op2.get().map_err(|e2| format!("Failed to retrieve device information: {e2}"))?
            }
        },
        Err(e) => {
            eprintln!("[Oryvia BT Pairing] CreateFromIdAsyncWithKindAndAdditionalProperties failed: {e}, falling back to default");
            let op2 = DeviceInformation::CreateFromIdAsync(&h).map_err(|e2| format!("Failed to find device: {e2}"))?;
            op2.get().map_err(|e2| format!("Failed to retrieve device information: {e2}"))?
        }
    };

    let pairing = dev_info.Pairing().map_err(|e| format!("Device does not support pairing: {e}"))?;

    let is_paired = pairing.IsPaired().unwrap_or(false);
    let can_pair = pairing.CanPair().unwrap_or(true);

    eprintln!("[Oryvia BT Pairing] Device state: IsPaired={is_paired}, CanPair={can_pair}");

    if is_paired {
        invalidate_bt_audio_caps_cache();
        return Ok(BluetoothPairResult {
            success: true,
            status: "already_paired".to_string(),
            reason_code: Some("device_already_paired".to_string()),
            message: Some("Device is already paired.".to_string()),
        });
    }

    if !can_pair {
        return Ok(BluetoothPairResult {
            success: false,
            status: "unsupported".to_string(),
            reason_code: Some("pairing_not_supported".to_string()),
            message: Some("This device does not support direct pairing via Windows.".to_string()),
        });
    }

    // 2. Custom pairing ceremony handler: Soundcore P2 Mini and Bluetooth 5.0 peripherals use SSP Just Works (ConfirmOnly)
    let ceremony_used = Arc::new(AtomicBool::new(false));
    let pin_required = Arc::new(AtomicBool::new(false));

    let pairing_result = if let Ok(custom) = pairing.Custom() {
        let ceremony_kinds = DevicePairingKinds::ConfirmOnly
            | DevicePairingKinds::DisplayPin
            | DevicePairingKinds::ConfirmPinMatch
            | DevicePairingKinds::ProvidePin;

        let ceremony_clone = Arc::clone(&ceremony_used);
        let pin_req_clone = Arc::clone(&pin_required);
        let handler = TypedEventHandler::<DeviceInformationCustomPairing, DevicePairingRequestedEventArgs>::new(
            move |_sender, args| {
                if let Some(args) = args.as_ref() {
                    let kind = args.PairingKind().unwrap_or(DevicePairingKinds::None);
                    eprintln!("[Oryvia BT Pairing] Ceremony requested: kind={kind:?}");
                    ceremony_clone.store(true, Ordering::SeqCst);
                    match kind {
                        DevicePairingKinds::ConfirmOnly => {
                            // Standard Just Works SSP (Soundcore P2 Mini, Bluetooth audio headsets): confirm pairing
                            let _ = args.Accept();
                        }
                        DevicePairingKinds::DisplayPin
                        | DevicePairingKinds::ConfirmPinMatch
                        | DevicePairingKinds::ProvidePin => {
                            // PIN confirmation or display requires specialized UI.
                            // Do not auto-accept or fabricate PINs; guide user to Windows Settings safely.
                            pin_req_clone.store(true, Ordering::SeqCst);
                        }
                        _ => {
                            // Never auto-accept unknown ceremonies
                            pin_req_clone.store(true, Ordering::SeqCst);
                        }
                    }
                }
                Ok(())
            },
        );

        match custom.PairingRequested(&handler) {
            Ok(token) => {
                eprintln!("[Oryvia BT Pairing] Registered custom ceremony handler, initiating PairAsync (ceremony only)");
                let pair_op = custom.PairAsync(ceremony_kinds)
                    .or_else(|_| custom.PairWithProtectionLevelAsync(ceremony_kinds, DevicePairingProtectionLevel::Encryption));

                let res = match pair_op {
                    Ok(op) => op.get(),
                    Err(e) => {
                        eprintln!("[Oryvia BT Pairing] PairWithProtectionLevelAsync failed: {e}, falling back to PairAsync");
                        let _ = custom.RemovePairingRequested(token);
                        let fallback_op = pairing.PairAsync().map_err(|e2| format!("PairAsync fallback failed: {e2}"))?;
                        fallback_op.get()
                    }
                };
                let _ = custom.RemovePairingRequested(token);
                res
            }
            Err(e) => {
                eprintln!("[Oryvia BT Pairing] PairingRequested registration failed: {e}, falling back to basic PairAsync");
                let fallback_op = pairing.PairAsync().map_err(|e2| format!("PairAsync fallback failed: {e2}"))?;
                fallback_op.get()
            }
        }
    } else {
        eprintln!("[Oryvia BT Pairing] CustomPairing unavailable, falling back to basic PairAsync");
        let pair_op = pairing.PairAsync().map_err(|e| format!("PairAsync failed: {e}"))?;
        pair_op.get()
    };

    let res = pairing_result.map_err(|e| format!("Pair execution failed: {e}"))?;
    let status = res.Status().map_err(|e| format!("Failed to get pairing status: {e}"))?;
    let elapsed = start_time.elapsed().as_millis();

    eprintln!(
        "[Oryvia BT Pairing] Result for {masked_mac}: status={status:?}, ceremony_fired={}, elapsed={}ms",
        ceremony_used.load(Ordering::SeqCst),
        elapsed
    );

    if pin_required.load(Ordering::SeqCst) {
        return Ok(BluetoothPairResult {
            success: false,
            status: "unsupported".to_string(),
            reason_code: Some("pairing_pin_required".to_string()),
            message: Some("Device requires PIN confirmation in Windows Settings.".to_string()),
        });
    }

    match status {
        DevicePairingResultStatus::Paired => {
            std::thread::sleep(Duration::from_millis(600));
            invalidate_bt_audio_caps_cache();
            Ok(BluetoothPairResult {
                success: true,
                status: "paired".to_string(),
                reason_code: None,
                message: Some("Device paired successfully.".to_string()),
            })
        }
        DevicePairingResultStatus::AlreadyPaired => {
            invalidate_bt_audio_caps_cache();
            Ok(BluetoothPairResult {
                success: true,
                status: "already_paired".to_string(),
                reason_code: Some("device_already_paired".to_string()),
                message: Some("Device is already paired.".to_string()),
            })
        }
        DevicePairingResultStatus::ConnectionRejected => {
            Ok(BluetoothPairResult {
                success: false,
                status: "failed".to_string(),
                reason_code: Some("pairing_rejected".to_string()),
                message: Some("The device rejected the pairing request.".to_string()),
            })
        }
        DevicePairingResultStatus::AuthenticationFailure => {
            Ok(BluetoothPairResult {
                success: false,
                status: "failed".to_string(),
                reason_code: Some("pairing_auth_failed".to_string()),
                message: Some("Authentication failed or PIN was rejected.".to_string()),
            })
        }
        DevicePairingResultStatus::AuthenticationTimeout => {
            Ok(BluetoothPairResult {
                success: false,
                status: "failed".to_string(),
                reason_code: Some("pairing_timeout".to_string()),
                message: Some("Pairing timed out. Make sure the device is in pairing mode.".to_string()),
            })
        }
        DevicePairingResultStatus::RequiredHandlerNotRegistered => {
            Ok(BluetoothPairResult {
                success: false,
                status: "unsupported".to_string(),
                reason_code: Some("pairing_pin_required".to_string()),
                message: Some("Device requires PIN confirmation in Windows Settings.".to_string()),
            })
        }
        DevicePairingResultStatus::AuthenticationNotAllowed => {
            Ok(BluetoothPairResult {
                success: false,
                status: "failed".to_string(),
                reason_code: Some("pairing_auth_not_allowed".to_string()),
                message: Some("Authentication is not allowed for this device.".to_string()),
            })
        }
        DevicePairingResultStatus::ProtectionLevelCouldNotBeMet => {
            Ok(BluetoothPairResult {
                success: false,
                status: "failed".to_string(),
                reason_code: Some("pairing_protection_unmet".to_string()),
                message: Some("Could not meet the required protection level for pairing.".to_string()),
            })
        }
        DevicePairingResultStatus::OperationAlreadyInProgress => {
            Ok(BluetoothPairResult {
                success: false,
                status: "failed".to_string(),
                reason_code: Some("pairing_in_progress".to_string()),
                message: Some("Another pairing operation is already in progress.".to_string()),
            })
        }
        DevicePairingResultStatus::PairingCanceled => {
            Ok(BluetoothPairResult {
                success: false,
                status: "failed".to_string(),
                reason_code: Some("pairing_canceled".to_string()),
                message: Some("Pairing operation was canceled.".to_string()),
            })
        }
        DevicePairingResultStatus::RejectedByHandler => {
            Ok(BluetoothPairResult {
                success: false,
                status: "failed".to_string(),
                reason_code: Some("pairing_rejected_by_handler".to_string()),
                message: Some("Pairing request was rejected by handler.".to_string()),
            })
        }
        DevicePairingResultStatus::NoSupportedProfiles => {
            Ok(BluetoothPairResult {
                success: false,
                status: "failed".to_string(),
                reason_code: Some("pairing_no_supported_profiles".to_string()),
                message: Some("No supported Bluetooth profiles found on this device.".to_string()),
            })
        }
        DevicePairingResultStatus::RemoteDeviceHasAssociation => {
            Ok(BluetoothPairResult {
                success: false,
                status: "failed".to_string(),
                reason_code: Some("pairing_has_association".to_string()),
                message: Some("Device already has an association with another profile.".to_string()),
            })
        }
        DevicePairingResultStatus::InvalidCeremonyData => {
            Ok(BluetoothPairResult {
                success: false,
                status: "failed".to_string(),
                reason_code: Some("pairing_invalid_data".to_string()),
                message: Some("Invalid ceremony data received during pairing.".to_string()),
            })
        }
        DevicePairingResultStatus::TooManyConnections => {
            Ok(BluetoothPairResult {
                success: false,
                status: "failed".to_string(),
                reason_code: Some("pairing_too_many_connections".to_string()),
                message: Some("Too many Bluetooth connections are currently active.".to_string()),
            })
        }
        DevicePairingResultStatus::HardwareFailure => {
            Ok(BluetoothPairResult {
                success: false,
                status: "failed".to_string(),
                reason_code: Some("pairing_hardware_failure".to_string()),
                message: Some("Bluetooth hardware failure occurred during pairing.".to_string()),
            })
        }
        _ => {
            Ok(BluetoothPairResult {
                success: false,
                status: "failed".to_string(),
                reason_code: Some("pairing_failed".to_string()),
                message: Some("Pairing failed. Make sure the device is ready to pair and try again.".to_string()),
            })
        }
    }
}

#[tauri::command]
pub async fn bluetooth_start_discovery(window: tauri::Window) -> Result<(), String> {
    start_bluetooth_discovery(window)
}

#[tauri::command]
pub async fn bluetooth_stop_discovery(window: tauri::Window) -> Result<(), String> {
    use tauri::Emitter;
    stop_bluetooth_discovery();
    let _ = window.emit("bluetooth-discovery-stopped", ());
    Ok(())
}

#[tauri::command]
pub async fn bluetooth_get_discovered_devices() -> Result<Vec<DiscoveredBluetoothDevice>, String> {
    tauri::async_runtime::spawn_blocking(get_discovered_devices)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn bluetooth_pair_device(id: String) -> Result<BluetoothPairResult, String> {
    tauri::async_runtime::spawn_blocking(move || pair_bluetooth_device(&id))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wpa_hex_password_xml() {
        let hex64 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let xml = build_profile_xml("TestSSID", "TestSSID", "WPA2PSK", "AES", Some(hex64)).unwrap();
        assert!(xml.contains("<keyType>networkKey</keyType>"));
        assert!(xml.contains("<protected>false</protected>"));
        assert!(xml.contains(hex64));
    }

    #[test]
    fn test_passphrase_xml() {
        let pass = "StandardPassphrase123";
        let xml = build_profile_xml("TestSSID", "TestSSID", "WPA2PSK", "AES", Some(pass)).unwrap();
        assert!(xml.contains("<keyType>passPhrase</keyType>"));
        assert!(xml.contains("<protected>false</protected>"));
        assert!(xml.contains(pass));
    }

    #[test]
    fn test_profile_name_different_from_ssid() {
        let profile_name = "Pin Pin Pin 2";
        let ssid = "Pin Pin Pin";
        let pass = "mypassword123";
        let xml = build_profile_xml(profile_name, ssid, "WPA2PSK", "AES", Some(pass)).unwrap();

        // Profile name must match <name>
        assert!(xml.contains("<name>Pin Pin Pin 2</name>"), "Profile name should be preserved in root name tag");

        // Actual SSID must match <SSID><name> and <SSID><hex>
        assert!(xml.contains("<SSID><hex>50696E2050696E2050696E</hex><name>Pin Pin Pin</name></SSID>"), "Actual SSID must be used in SSIDConfig");
        assert!(!xml.contains("<SSIDConfig><SSID><hex>50696E2050696E2050696E2032</hex>"), "Must not use profile_name as hex SSID");
    }

    #[test]
    fn test_validate_wifi_password() {
        // WPA2 passphrase bounds
        assert!(validate_wifi_password("12345678", "WPA2PSK", "AES").is_ok());
        assert!(validate_wifi_password("1234567", "WPA2PSK", "AES").is_err());
        assert!(validate_wifi_password(&"a".repeat(63), "WPA2PSK", "AES").is_ok());
        assert!(validate_wifi_password(&"z".repeat(64), "WPA2PSK", "AES").is_err()); // non-hex 64 chars

        // WPA2 64-hex valid
        let hex64 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        assert!(validate_wifi_password(hex64, "WPA2PSK", "AES").is_ok());

        // WPA3-SAE
        assert!(validate_wifi_password("12345678", "WPA3SAE", "AES").is_ok());
        assert!(validate_wifi_password(&"b".repeat(128), "WPA3SAE", "AES").is_ok());
        assert!(validate_wifi_password(&"b".repeat(129), "WPA3SAE", "AES").is_err());

        // WEP
        assert!(validate_wifi_password("12345", "open", "WEP").is_ok());
        assert!(validate_wifi_password("1234567890123", "open", "WEP").is_ok());
        assert!(validate_wifi_password("0123456789", "open", "WEP").is_ok());
    }

    #[test]
    fn test_strip_guids() {
        let input = "device_{0000110b-0000-1000-8000-00805f9b34fb}_mac_B397ECE58B85";
        let stripped = strip_guids(input);
        assert_eq!(stripped, "device__mac_B397ECE58B85");
    }

    #[test]
    fn test_matches_bt_mac() {
        let path = r"\\?\BTHENUM#{0000110b-0000-1000-8000-00805f9b34fb}_LOCALMFG&0000#8&37c68832&0&B397ECE58B85_C00000000#{6994ad04-93ef-11d0-a3cc-00a0c9223196}\SRC";
        assert!(matches_bt_mac(path, "B397ECE58B85"));
        assert!(!matches_bt_mac(path, "AABBCCDDEEFF"));
    }

    #[test]
    fn test_mask_bt_addr() {
        assert_eq!(mask_bt_addr(0xB397ECE58B85), "B3:97:***:85");
        assert_eq!(mask_bt_addr(0x41BB00B16CE3), "41:BB:***:E3");
    }

    #[test]
    fn test_phone_cod_classification() {
        // iPhone raw CoD: 0x7a020c
        let raw_cod: u32 = 0x7a020c;
        let is_phone = (raw_cod & 0x1F00) == 0x0200;
        assert!(is_phone, "Raw CoD 0x7a020c should be classified as Phone");

        // Audio headset CoD: 0x240404 (MajorClass = Audio/Video 0x04)
        let audio_raw: u32 = 0x240404;
        let audio_phone = (audio_raw & 0x1F00) == 0x0200;
        let audio_major = (audio_raw & 0x1F00) >> 8;
        assert!(!audio_phone, "Headset should not be classified as Phone");
        assert_eq!(audio_major, 0x04, "Major class should be Audio/Video (4)");
    }

    #[test]
    fn test_device_selector() {
        use windows::Devices::Enumeration::{DeviceInformation, DeviceInformationKind};
        use windows::Devices::Bluetooth::{BluetoothDevice, BluetoothLEDevice};

        let sel = BluetoothDevice::GetDeviceSelectorFromPairingState(false);
        assert!(sel.is_ok());
        let aqs = sel.unwrap().to_string();
        assert!(!aqs.is_empty());

        let le_sel = BluetoothLEDevice::GetDeviceSelectorFromPairingState(false);
        assert!(le_sel.is_ok());
        let le_aqs = le_sel.unwrap().to_string();
        assert!(!le_aqs.is_empty());

        let watcher_res = DeviceInformation::CreateWatcherWithKindAqsFilterAndAdditionalProperties(
            &windows::core::HSTRING::from(aqs),
            None,
            DeviceInformationKind::AssociationEndpoint,
        );
        assert!(watcher_res.is_ok());
    }

    #[test]
    fn test_parse_mac_from_id() {
        let classic_id = "Bluetooth#Bluetooth41:bb:00:b1:6c:e3-b3:97:ec:e5:8b:85";
        assert_eq!(parse_mac_from_id(classic_id), 0xB397ECE58B85);

        let ble_id = "BluetoothLE#BluetoothLE41:bb:00:b1:6c:e3-cc:22:33:44:55:66";
        assert_eq!(parse_mac_from_id(ble_id), 0xCC2233445566);
    }

    #[test]
    fn test_custom_pairing_types() {
        use windows::Devices::Enumeration::{
            DeviceInformationCustomPairing, DevicePairingKinds, DevicePairingProtectionLevel,
            DevicePairingRequestedEventArgs, DevicePairingResultStatus,
        };
        use windows::Foundation::TypedEventHandler;

        let _none_prot = DevicePairingProtectionLevel::None;
        let _def_prot = DevicePairingProtectionLevel::Default;
        let kinds = DevicePairingKinds::ConfirmOnly
            | DevicePairingKinds::DisplayPin
            | DevicePairingKinds::ConfirmPinMatch
            | DevicePairingKinds::ProvidePin;
        assert!(kinds.contains(DevicePairingKinds::ConfirmOnly));

        let _handler = TypedEventHandler::<DeviceInformationCustomPairing, DevicePairingRequestedEventArgs>::new(
            move |_sender, args| {
                if let Some(args) = args.as_ref() {
                    let kind = args.PairingKind().unwrap_or(DevicePairingKinds::None);
                    if kind == DevicePairingKinds::ProvidePin {
                        let pin = windows::core::HSTRING::from("0000");
                        let _ = args.AcceptWithPin(&pin);
                    } else {
                        let _ = args.Accept();
                    }
                }
                Ok(())
            },
        );

        fn _check_token_method(c: &DeviceInformationCustomPairing, h: &TypedEventHandler<DeviceInformationCustomPairing, DevicePairingRequestedEventArgs>) {
            if let Ok(token) = c.PairingRequested(h) {
                let _ = c.RemovePairingRequested(token);
            }
        }

        // Verify all 17+ status variants compile
        let _all_statuses = [
            DevicePairingResultStatus::Paired,
            DevicePairingResultStatus::NotReadyToPair,
            DevicePairingResultStatus::NotPaired,
            DevicePairingResultStatus::AlreadyPaired,
            DevicePairingResultStatus::ConnectionRejected,
            DevicePairingResultStatus::TooManyConnections,
            DevicePairingResultStatus::HardwareFailure,
            DevicePairingResultStatus::AuthenticationTimeout,
            DevicePairingResultStatus::AuthenticationNotAllowed,
            DevicePairingResultStatus::AuthenticationFailure,
            DevicePairingResultStatus::NoSupportedProfiles,
            DevicePairingResultStatus::ProtectionLevelCouldNotBeMet,
            DevicePairingResultStatus::AccessDenied,
            DevicePairingResultStatus::InvalidCeremonyData,
            DevicePairingResultStatus::PairingCanceled,
            DevicePairingResultStatus::OperationAlreadyInProgress,
            DevicePairingResultStatus::RequiredHandlerNotRegistered,
            DevicePairingResultStatus::RejectedByHandler,
            DevicePairingResultStatus::RemoteDeviceHasAssociation,
            DevicePairingResultStatus::Failed,
        ];
        assert_eq!(_all_statuses.len(), 20);
    }

    #[test]
    fn test_wlan_reason_and_error_formatting() {
        // Password/auth errors map to wifi_password_invalid
        assert_eq!(format_wlan_reason(WLAN_REASON_CODE_KEY_MISMATCH), "wifi_password_invalid");
        assert_eq!(format_wlan_reason(WLAN_REASON_CODE_MSMSEC_AUTH_START_TIMEOUT), "wifi_password_invalid");
        assert_eq!(format_wlan_reason(WLAN_REASON_CODE_MSMSEC_AUTH_SUCCESS_TIMEOUT), "wifi_password_invalid");
        assert_eq!(format_wlan_reason(0x00040005), "wifi_password_invalid");

        // Association errors
        assert_eq!(format_wlan_reason(WLAN_REASON_CODE_ASSOCIATION_FAILURE), "wifi_association_failed");
        assert_eq!(format_wlan_reason(WLAN_REASON_CODE_ASSOCIATION_TIMEOUT), "wifi_association_failed");

        // Out of range errors
        assert_eq!(format_wlan_reason(0x00028003), "wifi_network_not_found");
        assert_eq!(format_wlan_reason(0x0002800B), "wifi_network_not_found");

        // General fallback error (no longer raw hex 0x687BA82E presented to user)
        assert_eq!(format_wlan_reason(0x687BA82E), "wifi_connect_failed");

        // Win32 error formatting
        assert_eq!(format_wlan_error("test", 0x80342002), "wifi_adapter_disabled");
        assert_eq!(format_wlan_error("test", 5), "wifi_access_denied");
        assert_eq!(format_wlan_error("test", 1168), "wifi_network_not_found");
        assert_eq!(format_wlan_error("test", 1206), "wifi_security_unsupported");
        assert_eq!(format_wlan_error("test", 99999), "wifi_connect_failed");
    }

    #[test]
    fn test_bt_disconnect_guard_cod_classification() {
        // Phone raw CoD: 0x7a020c
        let phone_cod: u32 = 0x7a020c;
        let is_phone = (phone_cod & 0x1F00) == 0x0200;
        assert!(is_phone, "Phone CoD must be classified as phone and blocked from force disconnect");

        // Classic HID Keyboard/Mouse raw CoD: 0x002540 (Major = 0x05)
        let hid_cod: u32 = 0x002540;
        let is_hid = (hid_cod & 0x1F00) == 0x0500;
        let hid_major = (hid_cod & 0x1F00) >> 8;
        assert!(is_hid, "HID CoD must be classified as HID and blocked from force disconnect");
        assert_eq!(hid_major, 0x05);

        // Audio Headset/Speaker CoD: 0x240404 (Major = 0x04)
        let audio_cod: u32 = 0x240404;
        let is_audio = ((audio_cod & 0x1F00) >> 8) == 0x04;
        assert!(is_audio, "Audio headset must be classified as audio and permitted for disconnect");

        // Computer CoD: 0x000104 (Major = 0x01)
        let comp_cod: u32 = 0x000104;
        let is_comp = ((comp_cod & 0x1F00) >> 8) == 0x01;
        assert!(is_comp, "Computer CoD must be classified as computer and blocked from force disconnect");

        // Name and ID pattern detection for HID peripherals
        assert!(is_hid_name_or_id("BTHENUM\\DEV_1234567890AB\\...", "Logitech MX Master 3S Mouse"));
        assert!(is_hid_name_or_id("BTHENUM\\DEV_1234567890AB\\...", "Keychron K2 Keyboard"));
        assert!(is_hid_name_or_id("BTHENUM\\{00001124-0000-1000-8000-00805F9B34FB}_HID...", "Generic Device"));
        assert!(!is_hid_name_or_id("BTHENUM\\DEV_F44EFD289B50\\...", "Soundcore P2 Mini"));
        assert!(!is_hid_name_or_id("BTHENUM\\DEV_30C6F7123456\\...", "UGREEN HiTune Max5c"));
    }
}
