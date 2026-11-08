
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::{
    MessageBoxW, IDYES, MB_ICONINFORMATION, MB_ICONQUESTION, MB_OK, MB_TOPMOST, MB_YESNO, SW_SHOWNORMAL,
};
use windows::core::PCWSTR;

use crate::uninstall_registry::{
    desktop_dir, legacy_start_menu_dir, start_menu_programs_dir, wide,
};

const TITLE: &str = "Oryvia";

// Native uninstall runs before webviews exist. Reuse the same i18n resource
// and persisted language key as the Main App, without initializing Tauri UI.
fn native_text(key: &str) -> String {
    let language = std::env::var_os("APPDATA")
        .and_then(|base| std::fs::read_to_string(PathBuf::from(base).join("com.panchi146.oryvia").join("settings.json")).ok())
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|settings| settings.get("nectar-language").and_then(|value| value.as_str()).map(str::to_owned))
        .filter(|language| language == "vi").unwrap_or_else(|| "en".to_string());
    let messages: serde_json::Value = serde_json::from_str(include_str!("../../src/i18n/native-uninstall.json")).unwrap_or_default();
    messages[&language][key].as_str().unwrap_or(key).to_string()
}

pub fn requested() -> bool {
    let by_arg = std::env::args().skip(1).any(|a| a == "--uninstall");
    let by_name = std::env::current_exe()
        .ok()
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_lowercase()))
        .is_some_and(|n| n == "uninstall.exe");
    by_arg || by_name
}

fn message(text: &str, flags: windows::Win32::UI::WindowsAndMessaging::MESSAGEBOX_STYLE) -> windows::Win32::UI::WindowsAndMessaging::MESSAGEBOX_RESULT {
    let text_w = wide(text);
    let title_w = wide(TITLE);
    unsafe { MessageBoxW(None, PCWSTR(text_w.as_ptr()), PCWSTR(title_w.as_ptr()), flags | MB_TOPMOST) }
}

pub fn report_registration_conflict(error: &str) {
    message(&format!("{}\n\n{error}", native_text("uninstall.registration.unverified")), MB_OK | MB_ICONINFORMATION);
}

pub fn is_elevated() -> bool {
    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION::default();
        let mut size = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            Some(&mut elevation as *mut _ as *mut _),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut size,
        )
        .is_ok();
        let _ = CloseHandle(token);
        ok && elevation.TokenIsElevated != 0
    }
}

fn relaunch_elevated(exe: &Path) -> bool {
    let exe_w: Vec<u16> = exe.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let verb_w = wide("runas");
    let args_w = wide("--uninstall");
    let result = unsafe {
        ShellExecuteW(None, PCWSTR(verb_w.as_ptr()), PCWSTR(exe_w.as_ptr()), PCWSTR(args_w.as_ptr()), None, SW_SHOWNORMAL)
    };
    (result.0 as isize) > 32
}

pub fn restore_taskbar_if_left_hidden() {
    let Ok(appdata) = std::env::var("APPDATA") else { return };
    let flag: PathBuf = Path::new(&appdata).join("com.panchi146.oryvia").join("taskbar_hidden.flag");
    if flag.exists() {
        crate::utils::set_taskbar_visibility(true, true);
        let _ = std::fs::remove_file(&flag);
    }
}

fn remove_shortcuts(all_users: bool, install_dir: &Path) {
    let mut lnks = Vec::new();
    if let Some(d) = start_menu_programs_dir(all_users) { lnks.push(d.join("Oryvia.lnk")); }
    if let Some(d) = legacy_start_menu_dir(all_users) { lnks.push(d.join("Oryvia.lnk")); }
    if let Some(d) = desktop_dir(all_users) { lnks.push(d.join("Oryvia.lnk")); }
    for lnk in lnks {
        crate::install_safety::remove_owned_shortcut(&lnk, install_dir);
    }
}


pub fn run() {
    let Ok(exe) = std::env::current_exe() else { return };
    let Some(install_dir) = exe.parent().map(Path::to_path_buf) else { return };

    let Some(all_users) = crate::install_safety::scope(&install_dir) else {
        message("Uninstall refused: missing or invalid install marker.", MB_OK | MB_ICONINFORMATION);
        return;
    };

    if all_users && !is_elevated() {
        if !relaunch_elevated(&exe) {
            message("Oryvia was installed for all users, so uninstalling it needs administrator permission.", MB_OK | MB_ICONINFORMATION);
        }
        return;
    }

    if message(
        "Uninstall Oryvia?\n\nThis removes the app and its shortcuts. Your settings are kept in case you reinstall.",
        MB_YESNO | MB_ICONQUESTION,
    ) != IDYES
    {
        return;
    }

    let validated = crate::install_safety::registration_check(&install_dir, all_users)
        .and_then(|_| crate::install_safety::remove_app_files_command(&install_dir, std::process::id()).map(|_| ()));
    match validated {
        Ok(()) => (),
        Err(error) => {
            report_registration_conflict(&error);
            return;
        }
    };

    if let Err(error) = crate::install_safety::stop_installed_app(&install_dir) {
        message(&error, MB_OK | MB_ICONINFORMATION); return;
    }
    restore_taskbar_if_left_hidden();
    remove_shortcuts(all_users, &install_dir);
    crate::install_safety::remove_taskbar_shortcuts(&install_dir);
    let spawned = crate::install_safety::schedule_cleanup(&install_dir, std::process::id());

    if let Err(error) = spawned {
        message(
            &format!("{}\n\n{}\n\n{}", native_text("uninstall.cleanup.scheduleFailed"), install_dir.display(), error),
            MB_OK | MB_ICONINFORMATION,
        );
        return;
    }
    message(&native_text("uninstall.cleanup.scheduled"), MB_OK | MB_ICONINFORMATION);
}
