//! Missing-Main uninstall recovery. Geometry adapted from src-tauri/src/utils.rs:
//! monitor_rects, taskbar_monitor and restore_tray_position (no saved rectangle).
//! Same uninstall policy as native_uninstall: show always-on-top, keep Settings.
use std::path::Path;
unsafe fn monitor_rects() -> Vec<(windows::Win32::Foundation::RECT, bool)> {
    use windows::Win32::Foundation::{LPARAM, RECT};
    use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO};

    unsafe extern "system" fn collect(hmon: HMONITOR, _: HDC, _: *mut RECT, lparam: LPARAM) -> windows::core::BOOL {
        let list = &mut *(lparam.0 as *mut Vec<(RECT, bool)>);
        let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if GetMonitorInfoW(hmon, &mut mi).as_bool() {
            list.push((mi.rcMonitor, mi.dwFlags & 1 != 0));
        }
        windows::core::BOOL(1)
    }
    let mut monitors: Vec<(RECT, bool)> = Vec::new();
    let _ = EnumDisplayMonitors(None, None, Some(collect), LPARAM(&mut monitors as *mut _ as isize));
    monitors
}

fn taskbar_monitor(monitors: &[(windows::Win32::Foundation::RECT, bool)], primary: bool, width: i32) -> Option<windows::Win32::Foundation::RECT> {
    if primary {
        monitors.iter().find(|(_, is_primary)| *is_primary).map(|(r, _)| *r)
    } else {
        monitors.iter().find(|(r, is_primary)| !*is_primary && r.right - r.left == width)
            .or_else(|| monitors.iter().find(|(_, is_primary)| !*is_primary))
            .map(|(r, _)| *r)
    }
}

unsafe fn restore_tray_position(hwnd: windows::Win32::Foundation::HWND, primary: bool) {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowRect, SetWindowPos, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER};

    let mut cur = RECT::default();
    let _ = GetWindowRect(hwnd, &mut cur);
    let (w, h) = (cur.right - cur.left, cur.bottom - cur.top);
    let monitors = monitor_rects();
    let inside_a_monitor = monitors.iter().any(|(m, _)| cur.left >= m.left && cur.top >= m.top && cur.right <= m.right && cur.bottom <= m.bottom);
    if inside_a_monitor { return; }

    if let Some(mon) = taskbar_monitor(&monitors, primary, w) {
        let _ = SetWindowPos(hwnd, None, mon.left, mon.bottom - h, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
    }
}


pub fn restore_current_user() -> Result<(), String> {
    let base = std::env::var_os("APPDATA").ok_or("Cannot locate current user's taskbar marker")?;
    let profile = std::path::PathBuf::from(base).join("com.panchi146.oryvia");
    crate::install_safety::validate_dir(&profile)?;
    restore_marker(&profile.join("taskbar_hidden.flag"), show_taskbars)
}

fn restore_marker(flag: &Path, show: impl FnOnce() -> Result<(), String>) -> Result<(), String> {
    use std::os::windows::fs::MetadataExt;
    match std::fs::symlink_metadata(flag) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(format!("Cannot inspect taskbar marker: {e}")),
        Ok(meta) if !meta.is_file() || meta.file_attributes() & 0x400 != 0 =>
            return Err("Taskbar marker is not a plain file".into()),
        Ok(_) => (),
    }
    show()?;
    std::fs::remove_file(flag).map_err(|e| format!("Cannot clear restored taskbar marker: {e}"))
}

fn show_taskbars() -> Result<(), String> {
    use windows::core::PCSTR;
    use windows::Win32::Foundation::{COLORREF, LPARAM};
    use windows::Win32::UI::Shell::{SHAppBarMessage, APPBARDATA, ABM_SETSTATE};
    use windows::Win32::UI::WindowsAndMessaging::*;
    unsafe {
        // ShowWindow's return reports previous visibility, not success.
        // ABM_SETSTATE also has no success return contract. Check geometry and
        // final visibility; retain the marker if Explorer cannot be restored.
        let mut abd = APPBARDATA { cbSize: std::mem::size_of::<APPBARDATA>() as u32, lParam: LPARAM(2), ..Default::default() };
        let primary = FindWindowA(PCSTR(c"Shell_TrayWnd".as_ptr().cast()), PCSTR::null()).map_err(|e| e.to_string())?;
        SHAppBarMessage(ABM_SETSTATE, &mut abd);
        for (hwnd, is_primary) in std::iter::once((primary, true)).chain(
            FindWindowA(PCSTR(c"Shell_SecondaryTrayWnd".as_ptr().cast()), PCSTR::null()).ok().map(|h| (h, false))) {
            let ex = GetWindowLongA(hwnd, GWL_EXSTYLE);
            let cleaned = ex & !(WS_EX_LAYERED.0 as i32) & !(WS_EX_TRANSPARENT.0 as i32);
            if cleaned != ex {
                // Alpha can only be set while WS_EX_LAYERED is still present.
                if ex & WS_EX_LAYERED.0 as i32 != 0 {
                    SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA).map_err(|e| e.to_string())?;
                }
                SetWindowLongA(hwnd, GWL_EXSTYLE, cleaned);
                if GetWindowLongA(hwnd, GWL_EXSTYLE) & (WS_EX_LAYERED.0 as i32 | WS_EX_TRANSPARENT.0 as i32) != 0 {
                    return Err("Taskbar style restoration failed; marker retained".into());
                }
            }
            restore_tray_position(hwnd, is_primary);
            let _ = ShowWindow(hwnd, SW_SHOW);
            let mut rect = windows::Win32::Foundation::RECT::default();
            GetWindowRect(hwnd, &mut rect).map_err(|e| e.to_string())?;
            if !IsWindowVisible(hwnd).as_bool() || !monitor_rects().iter().any(|(m, _)|
                rect.left >= m.left && rect.top >= m.top && rect.right <= m.right && rect.bottom <= m.bottom) {
                return Err("Taskbar restoration could not be confirmed; marker retained".into());
            }
        }
        let setting = c"TraySettings";
        let _ = SendMessageTimeoutA(HWND_BROADCAST, WM_SETTINGCHANGE, windows::Win32::Foundation::WPARAM(0),
            LPARAM(setting.as_ptr() as isize), SMTO_ABORTIFHUNG, 1000, None);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn marker_only_removed_after_success_and_settings_untouched() {
        let dir = std::env::temp_dir().join(format!("oryvia-taskbar-test-{}", std::process::id()));
        std::fs::create_dir(&dir).unwrap();
        let flag = dir.join("taskbar_hidden.flag");
        let settings = dir.join("settings.json");
        std::fs::write(&settings, "keep").unwrap();
        restore_marker(&flag, || panic!("no marker")).unwrap();
        std::fs::write(&flag, "abstate=1").unwrap();
        assert!(restore_marker(&flag, || Err("Explorer unavailable".into())).is_err());
        assert!(flag.exists());
        restore_marker(&flag, || Ok(())).unwrap();
        assert!(!flag.exists());
        assert_eq!(std::fs::read_to_string(&settings).unwrap(), "keep");
        std::fs::remove_file(settings).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
}
