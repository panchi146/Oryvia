use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use windows::Win32::System::Com::{CoCreateInstance, CoTaskMemFree, IPersistFile, CLSCTX_ALL, STGM};
use windows::Win32::UI::Shell::{
    ExtractIconExW, IShellItem, IShellLinkW, SHCreateItemFromParsingName, SHGetNameFromIDList, ShellLink,
    SIGDN_DESKTOPABSOLUTEPARSING, SIGDN_NORMALDISPLAY,
};
use windows::Win32::UI::WindowsAndMessaging::DestroyIcon;
use windows::core::{Interface, PCWSTR};

use crate::types::AppInfo;
use crate::utils::{icon_to_base64, resolve_shortcut};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn taskbar_dir() -> Option<PathBuf> {
    let appdata = std::env::var("APPDATA").ok()?;
    Some(Path::new(&appdata).join(r"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"))
}

fn lnk_files() -> Vec<PathBuf> {
    let Some(dir) = taskbar_dir() else { return Vec::new() };
    let Ok(read) = std::fs::read_dir(dir) else { return Vec::new() };
    read.filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("lnk")))
        .collect()
}

fn taskband_favorites() -> Option<Vec<u8>> {
    let out = std::process::Command::new("reg")
        .args(["query", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband", "/v", "Favorites"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let hex = text.lines().find(|l| l.contains("REG_BINARY"))?.split("REG_BINARY").nth(1)?.trim().to_string();
    (0..hex.len() / 2).map(|i| u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).ok()).collect()
}

fn find_bytes(hay: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() { return None; }
    hay.windows(needle.len()).position(|w| w == needle)
}

fn extract_packaged_pins_from_blob(blob: &[u8]) -> Vec<(usize, String, String)> {
    let mut pins = Vec::new();
    let mut seen_aumids = std::collections::HashSet::new();

    let mut i = 0;
    while i + 4 <= blob.len() {
        if &blob[i..i + 4] == b"APPS" {
            let end = (i + 2500).min(blob.len());
            let slice = &blob[i..end];

            let mut strings: Vec<(usize, String)> = Vec::new();
            let mut j = 0;
            while j + 2 <= slice.len() {
                let code = u16::from_le_bytes([slice[j], slice[j + 1]]);
                if (32..=126).contains(&code) {
                    let start = j;
                    while j + 2 <= slice.len() {
                        let c = u16::from_le_bytes([slice[j], slice[j + 1]]);
                        if (32..=126).contains(&c) {
                            j += 2;
                        } else {
                            break;
                        }
                    }
                    let utf16_chars: Vec<u16> = slice[start..j]
                        .chunks_exact(2)
                        .map(|c| u16::from_le_bytes([c[0], c[1]]))
                        .collect();
                    if let Ok(text) = String::from_utf16(&utf16_chars) {
                        if text.len() >= 2 {
                            strings.push((i + start, text));
                        }
                    }
                } else {
                    j += 2;
                }
            }

            // Find AUMID candidate
            let mut found_aumid: Option<String> = None;
            for (_, s) in &strings {
                if s.contains('!')
                    && !s.starts_with('!')
                    && !s.ends_with('!')
                    && !s.contains('\\')
                    && !s.contains('/')
                    && !s.contains(' ')
                    && !s.contains(':')
                    && s.len() >= 8
                    && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' || c == '!')
                {
                    found_aumid = Some(s.clone());
                    break;
                }
            }

            if let Some(aumid) = found_aumid {
                if !seen_aumids.contains(&aumid) {
                    seen_aumids.insert(aumid.clone());

                    // Find DisplayName candidate
                    let mut display_name = aumid.clone();
                    for (_, s) in &strings {
                        let t = s.trim();
                        if t == aumid { continue; }
                        let lower = t.to_lowercase();
                        if lower.ends_with(".png") || lower.ends_with(".ico") || lower.ends_with(".jpg") { continue; }
                        if lower.contains("\\windowsapps\\") { continue; }
                        if t == "UserPinned" || t == "SystemPinned" || t.starts_with("1SPS") { continue; }
                        if t.chars().all(|c| c.is_ascii_digit() || c == '.' || c == '_') { continue; }
                        if t.len() >= 2 {
                            display_name = t.to_string();
                            break;
                        }
                    }

                    pins.push((i, aumid, display_name));
                }
            }
        }
        i += 1;
    }
    pins
}

unsafe fn resolve_packaged_app(aumid: &str, fallback_name: &str) -> Option<AppInfo> {
    let parsing_name = format!("shell:AppsFolder\\{}", aumid);
    let wide: Vec<u16> = parsing_name.encode_utf16().chain(std::iter::once(0)).collect();
    let shell_item: Result<IShellItem, _> = SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None);

    let name = match shell_item {
        Ok(ref item) => {
            if let Ok(name_ptr) = item.GetDisplayName(SIGDN_NORMALDISPLAY) {
                let s = String::from_utf16_lossy(PCWSTR(name_ptr.0).as_wide());
                CoTaskMemFree(Some(name_ptr.0 as *const _));
                if !s.trim().is_empty() { s } else { fallback_name.to_string() }
            } else {
                fallback_name.to_string()
            }
        }
        Err(_) => {
            if !fallback_name.trim().is_empty() && fallback_name != aumid {
                fallback_name.to_string()
            } else {
                return None;
            }
        }
    };

    Some(AppInfo {
        name,
        path: aumid.to_string(),
        icon: None,
        is_running: false,
        hwnd: None,
        executable: None,
        all_hwnds: None,
        args: None,
    })
}

unsafe fn store_item_path(lnk: &Path) -> Option<String> {
    let shell_link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_ALL).ok()?;
    let persist: IPersistFile = shell_link.cast().ok()?;
    let wide: Vec<u16> = lnk.to_string_lossy().encode_utf16().chain(std::iter::once(0)).collect();
    persist.Load(PCWSTR(wide.as_ptr()), STGM(0)).ok()?;

    let pidl = shell_link.GetIDList().ok()?;
    let name = SHGetNameFromIDList(pidl, SIGDN_DESKTOPABSOLUTEPARSING).ok();
    CoTaskMemFree(Some(pidl as *const _));
    let name = name?;
    let s = String::from_utf16_lossy(PCWSTR(name.0).as_wide());
    CoTaskMemFree(Some(name.0 as *const _));

    let lower = s.to_lowercase();
    lower.strip_prefix("shell:appsfolder\\").map(|_| format!("shell:AppsFolder\\{}", &s["shell:AppsFolder\\".len()..]))
}

fn effective_target(target: &str, args: &str) -> String {
    if target.to_lowercase().ends_with("\\update.exe") && args.to_lowercase().contains("--processstart") {
        let exe_name = args
            .split_whitespace()
            .skip_while(|a| !a.eq_ignore_ascii_case("--processStart"))
            .nth(1)
            .map(|s| s.trim_matches('"').to_string());
        if let (Some(exe_name), Some(root)) = (exe_name, Path::new(target).parent()) {
            let mut dirs: Vec<PathBuf> = std::fs::read_dir(root)
                .into_iter()
                .flatten()
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.is_dir() && p.file_name().is_some_and(|n| n.to_string_lossy().starts_with("app-")))
                .collect();
            let version = |p: &PathBuf| -> Vec<u32> {
                p.file_name()
                    .map(|n| n.to_string_lossy().trim_start_matches("app-").split('.').filter_map(|s| s.parse().ok()).collect())
                    .unwrap_or_default()
            };
            dirs.sort_by_key(version);
            if let Some(found) = dirs.iter().rev().map(|d| d.join(&exe_name)).find(|p| p.exists()) {
                return found.to_string_lossy().to_string();
            }
        }
    }
    target.to_string()
}

fn is_explorer_pin(lnk: &Path) -> bool {
    let needle: Vec<u8> = "Microsoft.Windows.Explorer".encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    std::fs::read(lnk).ok().is_some_and(|b| find_bytes(&b, &needle).is_some())
}

pub fn read_pins() -> Option<Vec<AppInfo>> {
    let files = lnk_files();
    let blob = taskband_favorites().unwrap_or_default();

    let mut keyed: Vec<(usize, std::time::SystemTime, AppInfo)> = Vec::new();
    let mut seen_paths = std::collections::HashSet::new();

    let total_lnk_found = files.len();
    let mut lnk_resolved = 0;
    let mut lnk_skipped = 0;

    // 1. Resolve .lnk files
    for lnk in files {
        let name = lnk.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        let lnk_str = lnk.to_string_lossy().to_string();

        let (path, executable, args) = if let Some((target, args)) = resolve_shortcut(&lnk_str) {
            let relaunched = effective_target(&target, &args) != target;
            let target = effective_target(&target, &args);
            let exe = Path::new(&target).file_name().map(|s| s.to_string_lossy().to_string());
            let args = (!relaunched && !args.trim().is_empty()).then_some(args);
            (target, exe, args)
        } else if is_explorer_pin(&lnk) {
            let windir = std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".to_string());
            (format!(r"{}\explorer.exe", windir), Some("explorer.exe".to_string()), None)
        } else if let Some(item) = unsafe { store_item_path(&lnk) } {
            (item, None, None)
        } else {
            lnk_skipped += 1;
            continue;
        };

        let file_name = lnk.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let utf16: Vec<u8> = file_name.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
        let pos = find_bytes(&blob, &utf16).unwrap_or(usize::MAX);
        let created = std::fs::metadata(&lnk).and_then(|m| m.created()).unwrap_or(std::time::UNIX_EPOCH);

        lnk_resolved += 1;
        keyed.push((pos, created, AppInfo {
            name,
            path,
            icon: None,
            is_running: false,
            hwnd: None,
            executable,
            all_hwnds: None,
            args,
        }));
    }

    // 2. Resolve Packaged/MSIX/UWP apps from blob
    let raw_packaged = extract_packaged_pins_from_blob(&blob);
    let total_packaged_found = raw_packaged.len();
    let mut packaged_resolved = 0;
    let mut packaged_skipped = 0;

    for (pos, aumid, fallback_name) in raw_packaged {
        if let Some(app) = unsafe { resolve_packaged_app(&aumid, &fallback_name) } {
            packaged_resolved += 1;
            keyed.push((pos, std::time::UNIX_EPOCH, app));
        } else {
            packaged_skipped += 1;
        }
    }

    // Sort by position in blob, then by creation time
    keyed.sort_by_key(|(pos, created, _)| (*pos, *created));

    // Deduplicate while preserving order
    let mut apps = Vec::new();
    let mut duplicates = 0;
    for (_, _, app) in keyed {
        let key = app.path.to_lowercase();
        if seen_paths.contains(&key) {
            duplicates += 1;
            continue;
        }
        seen_paths.insert(key);
        apps.push(app);
    }

    if cfg!(debug_assertions) {
        eprintln!(
            "[TASKBAR_PINS] Scan complete: {} .lnk found ({} resolved, {} skipped), {} packaged found ({} resolved, {} skipped), {} duplicates omitted, total valid pins: {}",
            total_lnk_found, lnk_resolved, lnk_skipped,
            total_packaged_found, packaged_resolved, packaged_skipped,
            duplicates, apps.len()
        );
    }

    if apps.is_empty() { None } else { Some(apps) }
}

fn pin_shortcuts() -> &'static Vec<(String, PathBuf)> {
    static PINS: OnceLock<Vec<(String, PathBuf)>> = OnceLock::new();
    PINS.get_or_init(|| {
        lnk_files()
            .into_iter()
            .filter_map(|lnk| {
                resolve_shortcut(&lnk.to_string_lossy()).map(|(t, args)| (effective_target(&t, &args).to_lowercase(), lnk))
            })
            .collect()
    })
}

fn expand_env(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('%') {
            Some(end) => {
                out.push_str(&std::env::var(&after[..end]).unwrap_or_default());
                rest = &after[end + 1..];
            }
            None => { out.push_str(&rest[start..]); rest = ""; break; }
        }
    }
    out.push_str(rest);
    out
}

unsafe fn shortcut_custom_icon(lnk: &Path) -> Option<String> {
    let shell_link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_ALL).ok()?;
    let persist: IPersistFile = shell_link.cast().ok()?;
    let wide: Vec<u16> = lnk.to_string_lossy().encode_utf16().chain(std::iter::once(0)).collect();
    persist.Load(PCWSTR(wide.as_ptr()), STGM(0)).ok()?;

    let mut buf = [0u16; 260];
    let mut index = 0i32;
    shell_link.GetIconLocation(&mut buf, &mut index).ok()?;
    let loc = String::from_utf16_lossy(&buf).trim_matches(char::from(0)).to_string();
    if loc.trim().is_empty() { return None; }
    let loc = expand_env(&loc);
    if !Path::new(&loc).exists() { return None; }

    let loc_w: Vec<u16> = loc.encode_utf16().chain(std::iter::once(0)).collect();
    let mut large = windows::Win32::UI::WindowsAndMessaging::HICON::default();
    let n = ExtractIconExW(PCWSTR(loc_w.as_ptr()), index, Some(&mut large), None, 1);
    if n == 0 || large.is_invalid() { return None; }
    let icon = icon_to_base64(large);
    let _ = DestroyIcon(large);
    icon
}

pub fn icon_for_target(target: &str) -> Option<String> {
    if target.to_lowercase().starts_with("shell:") { return None; }
    let lower = target.to_lowercase();
    let (_, lnk) = pin_shortcuts().iter().find(|(t, _)| *t == lower)?;
    unsafe { shortcut_custom_icon(lnk) }
}
