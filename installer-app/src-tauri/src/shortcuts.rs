use std::path::Path;
use windows::Win32::System::Com::{CoCreateInstance, IPersistFile, CLSCTX_ALL};
use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
use windows::core::{Interface, PCWSTR};

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn create_shortcut(
    lnk_path: &Path,
    target: &Path,
    args: &str,
    icon: &Path,
    description: &str,
) -> windows::core::Result<()> {
    unsafe {
        let shell_link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_ALL)?;

        let target_w = wide(&target.to_string_lossy());
        shell_link.SetPath(PCWSTR(target_w.as_ptr()))?;

        if !args.is_empty() {
            let args_w = wide(args);
            shell_link.SetArguments(PCWSTR(args_w.as_ptr()))?;
        }

        if let Some(dir) = target.parent() {
            let dir_w = wide(&dir.to_string_lossy());
            shell_link.SetWorkingDirectory(PCWSTR(dir_w.as_ptr()))?;
        }

        let icon_w = wide(&icon.to_string_lossy());
        shell_link.SetIconLocation(PCWSTR(icon_w.as_ptr()), 0)?;

        let desc_w = wide(description);
        shell_link.SetDescription(PCWSTR(desc_w.as_ptr()))?;

        let persist_file: IPersistFile = shell_link.cast()?;
        let lnk_w = wide(&lnk_path.to_string_lossy());
        persist_file.Save(PCWSTR(lnk_w.as_ptr()), true)?;
    }
    Ok(())
}
/// Serialize through an exclusively created scratch directory, never through a
/// user shortcut. Remove only the exact scratch file and empty directory.
pub fn shortcut_bytes(target: &Path) -> Result<Vec<u8>, String> {
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let dir = std::env::temp_dir().join(format!("oryvia-link-{}-{nonce}", std::process::id()));
    crate::install_safety::validate_dir(&dir)?;
    std::fs::create_dir(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("Oryvia.lnk");
    // spawn_blocking worker threads do not inherit the UI thread's COM apartment.
    let initialized = unsafe { windows::Win32::System::Com::CoInitializeEx(None, windows::Win32::System::Com::COINIT_APARTMENTTHREADED) };
    let result = if initialized.is_err() { Err(format!("Cannot initialize shortcut COM: {initialized:?}")) } else {
        let result = create_shortcut(&path, target, "", target, "Oryvia").map_err(|e| e.to_string()).and_then(|_| std::fs::read(&path).map_err(|e| e.to_string()));
        unsafe { windows::Win32::System::Com::CoUninitialize(); }
        result
    };
    let cleanup = if path.exists() { std::fs::remove_file(&path) } else { Ok(()) }.and_then(|_| std::fs::remove_dir(&dir));
    cleanup.map_err(|e| format!("Shortcut scratch retained at {}: {e}", dir.display()))?;
    result
}
