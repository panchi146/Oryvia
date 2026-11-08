use windows::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER,
    HKEY_LOCAL_MACHINE, KEY_WRITE, REG_DWORD, REG_OPTION_NON_VOLATILE, REG_SZ,
};
use windows::core::PCWSTR;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

const UNINSTALL_SUBKEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Oryvia";

pub struct UninstallInfo<'a> {
    pub display_name: &'a str,
    pub display_icon: &'a str,
    pub display_version: &'a str,
    pub publisher: &'a str,
    pub install_location: &'a str,
    pub uninstall_string: &'a str,
    pub estimated_size_kb: u32,
}

pub fn write_uninstall_entry(all_users: bool, info: &UninstallInfo) -> windows::core::Result<()> {
    crate::install_safety::registration_check(std::path::Path::new(info.install_location), all_users)
        .map_err(|error| windows::core::Error::new(windows::core::HRESULT(0x80070005u32 as i32), error))?;
    unsafe {
        let root = if all_users { HKEY_LOCAL_MACHINE } else { HKEY_CURRENT_USER };
        let subkey_w = wide(UNINSTALL_SUBKEY);
        let mut hkey = HKEY::default();

        RegCreateKeyExW(
            root,
            PCWSTR(subkey_w.as_ptr()),
            Some(0),
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_WRITE | windows::Win32::System::Registry::KEY_WOW64_64KEY,
            None,
            &mut hkey,
            None,
        )
        .ok()?;

        let key = Key(hkey);
        let result = (|| -> windows::core::Result<()> {
        set_string(hkey, "DisplayName", info.display_name)?;
        set_string(hkey, "DisplayIcon", info.display_icon)?;
        set_string(hkey, "DisplayVersion", info.display_version)?;
        set_string(hkey, "Publisher", info.publisher)?;
        set_string(hkey, "InstallLocation", info.install_location)?;
        set_string(hkey, "UninstallString", info.uninstall_string)?;
        set_dword(hkey, "NoModify", 1)?;
        set_dword(hkey, "NoRepair", 1)?;
        set_dword(hkey, "CurrentUser", u32::from(!all_users))?;
        set_dword(hkey, "EstimatedSize", info.estimated_size_kb)?;

        Ok(())
        })();
        drop(key);
        result?;
    }
    Ok(())
}

unsafe fn set_string(hkey: HKEY, name: &str, value: &str) -> windows::core::Result<()> {
    let name_w = wide(name);
    let value_w = wide(value);
    let bytes = std::slice::from_raw_parts(value_w.as_ptr() as *const u8, value_w.len() * 2);
    RegSetValueExW(hkey, PCWSTR(name_w.as_ptr()), Some(0), REG_SZ, Some(bytes)).ok()
}

unsafe fn set_dword(hkey: HKEY, name: &str, value: u32) -> windows::core::Result<()> {
    let name_w = wide(name);
    let bytes = value.to_le_bytes();
    RegSetValueExW(hkey, PCWSTR(name_w.as_ptr()), Some(0), REG_DWORD, Some(&bytes)).ok()
}


// Snapshot only values this writer changes, including their exact raw types.
// Other values/subkeys remain untouched during recovery.
const WRITTEN_VALUES: &[&str] = &["DisplayName", "DisplayVersion", "Publisher", "InstallLocation", "UninstallString", "DisplayIcon", "NoModify", "NoRepair", "CurrentUser", "EstimatedSize"];
pub struct RegistrationSnapshot { all_users: bool, existed: bool, values: Vec<(&'static str, Option<(windows::Win32::System::Registry::REG_VALUE_TYPE, Vec<u8>)>)> }
struct Key(HKEY);
impl Drop for Key { fn drop(&mut self) { unsafe { let _ = RegCloseKey(self.0); } } }
impl RegistrationSnapshot {
    pub fn capture(all_users: bool) -> Result<Self, String> {
        use windows::Win32::{System::Registry::*, Foundation::ERROR_FILE_NOT_FOUND};
        let mut snapshot = Self { all_users, existed: false, values: vec![] };
        unsafe {
            let root = if all_users { HKEY_LOCAL_MACHINE } else { HKEY_CURRENT_USER };
            let mut handle = HKEY::default();
            let status = RegOpenKeyExW(root, PCWSTR(wide(UNINSTALL_SUBKEY).as_ptr()), Some(0), KEY_READ | KEY_WOW64_64KEY, &mut handle);
            if status == ERROR_FILE_NOT_FOUND { return Ok(snapshot); }
            status.ok().map_err(|e| e.to_string())?;
            let key = Key(handle); snapshot.existed = true;
            for &name in WRITTEN_VALUES {
                let name_w = wide(name); let mut kind = REG_VALUE_TYPE::default(); let mut size = 0;
                let status = RegQueryValueExW(key.0, PCWSTR(name_w.as_ptr()), None, Some(&mut kind), None, Some(&mut size));
                if status == ERROR_FILE_NOT_FOUND { snapshot.values.push((name, None)); continue; }
                status.ok().map_err(|e| e.to_string())?;
                let mut bytes = vec![0; size as usize];
                RegQueryValueExW(key.0, PCWSTR(name_w.as_ptr()), None, Some(&mut kind), Some(bytes.as_mut_ptr()), Some(&mut size)).ok().map_err(|e| e.to_string())?;
                bytes.truncate(size as usize); snapshot.values.push((name, Some((kind, bytes))));
            }
        }
        Ok(snapshot)
    }
    pub fn restore(&self) -> Result<(), String> {
        use windows::Win32::{System::Registry::*, Foundation::ERROR_FILE_NOT_FOUND};
        unsafe {
            let root = if self.all_users { HKEY_LOCAL_MACHINE } else { HKEY_CURRENT_USER };
            let mut handle = HKEY::default();
            RegCreateKeyExW(root, PCWSTR(wide(UNINSTALL_SUBKEY).as_ptr()), Some(0), PCWSTR::null(), REG_OPTION_NON_VOLATILE, KEY_WRITE | KEY_READ | KEY_WOW64_64KEY, None, &mut handle, None).ok().map_err(|e| e.to_string())?;
            let key = Key(handle);
            let mut errors = vec![];
            for &name in WRITTEN_VALUES {
                let prior = self.values.iter().find(|v| v.0 == name).and_then(|v| v.1.as_ref());
                let status = if let Some((kind, bytes)) = prior {
                    RegSetValueExW(key.0, PCWSTR(wide(name).as_ptr()), Some(0), *kind, Some(bytes))
                } else { RegDeleteValueW(key.0, PCWSTR(wide(name).as_ptr())) };
                if status != ERROR_FILE_NOT_FOUND { if let Err(e) = status.ok() { errors.push(format!("{name}: {e}")); } }
            }
            if !self.existed && errors.is_empty() {
                // Delete only an empty key; never delete a tree or foreign values.
                let mut values = 0; let mut subkeys = 0;
                RegQueryInfoKeyW(key.0, None, None, None, Some(&mut subkeys), None, None, Some(&mut values), None, None, None, None).ok().map_err(|e| e.to_string())?;
                drop(key);
                if values == 0 && subkeys == 0 { RegDeleteKeyExW(root, PCWSTR(wide(UNINSTALL_SUBKEY).as_ptr()), KEY_WOW64_64KEY.0, Some(0)).ok().map_err(|e| e.to_string())?; }
            }
            if errors.is_empty() { Ok(()) } else { Err(errors.join("; ")) }
        }
    }
}
