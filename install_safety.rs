//! Conservative adaptation of Nectar 1.9.1 remove_app_files_command.
//! A folder name is never proof of ownership. Never recursively remove it.
use std::path::Path;

pub const APP_FILES: &[&str] = &["oryvia.exe", "uninstall.exe", ".install-scope"];
pub const LEGAL_DIR: &str = "oryvia-legal";
pub const LEGAL_FILES: &[&str] = &["LICENSE", "NOTICE", ".legal-scope"];
pub const LEGAL_SCOPE_FILE: &str = ".legal-scope";

#[allow(dead_code)]
pub const LICENSE_TEXT: &str = include_str!("LICENSE");
#[allow(dead_code)]
pub const NOTICE_TEXT: &str = include_str!("NOTICE");

#[allow(dead_code)]
pub fn is_oryvia_license(content: &str) -> bool {
    content.contains("GNU GENERAL PUBLIC LICENSE") && content.contains("Version 3, 29 June 2007")
}

#[allow(dead_code)]
pub fn is_oryvia_notice(content: &str) -> bool {
    content.contains("Oryvia — modified version of Nectar and Bloom") && content.contains("Panchi146")
}

#[allow(dead_code)]
pub fn is_reparse_point_or_link(path: &Path) -> bool {
    if let Ok(meta) = std::fs::symlink_metadata(path) {
        if meta.file_type().is_symlink() {
            return true;
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if meta.file_attributes() & 0x400 != 0 {
                return true;
            }
        }
    }
    false
}

#[allow(dead_code)]
pub fn is_owned_legal_dir(dir: &Path, expected_scope: &str) -> bool {
    let legal_dir = dir.join(LEGAL_DIR);
    if !legal_dir.is_dir() || is_reparse_point_or_link(&legal_dir) {
        return false;
    }
    let scope_marker = legal_dir.join(LEGAL_SCOPE_FILE);
    if !scope_marker.is_file() || is_reparse_point_or_link(&scope_marker) {
        return false;
    }
    let Ok(marker_content) = std::fs::read_to_string(&scope_marker) else {
        // Read errors or locked files must never be inferred as ownership!
        return false;
    };
    if marker_content.trim() != expected_scope {
        return false;
    }
    let Ok(entries) = std::fs::read_dir(&legal_dir) else {
        return false;
    };
    for entry in entries {
        let Ok(entry) = entry else { return false; };
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if !LEGAL_FILES.iter().any(|&f| f.eq_ignore_ascii_case(&name_str)) {
            // Contains foreign or unverified file. Never claim ownership.
            return false;
        }
        if !entry.path().is_file() || is_reparse_point_or_link(&entry.path()) {
            return false;
        }
    }
    let lic = legal_dir.join("LICENSE");
    if lic.exists() {
        let Ok(content) = std::fs::read_to_string(&lic) else { return false; };
        if !is_oryvia_license(&content) { return false; }
    }
    let not = legal_dir.join("NOTICE");
    if not.exists() {
        let Ok(content) = std::fs::read_to_string(&not) else { return false; };
        if !is_oryvia_notice(&content) { return false; }
    }
    true
}

#[allow(dead_code)] // Only the custom installer calls this shared installer routine.
pub fn write_license_files(dir: &Path, all_users: bool) -> Result<(), String> {
    validate_dir(dir)?;
    let expected_scope = if all_users { "all-users" } else { "user" };
    let legal_dir = dir.join(LEGAL_DIR);

    if legal_dir.exists() {
        if is_reparse_point_or_link(&legal_dir) {
            return Err("The oryvia-legal path is a reparse point or symbolic link".into());
        }
        if !legal_dir.is_dir() {
            return Err("The oryvia-legal path conflicts with an existing file".into());
        }
        if !is_owned_legal_dir(dir, expected_scope) {
            return Err("The target directory contains an unverified or conflicting 'oryvia-legal' folder".into());
        }
    } else {
        std::fs::create_dir(&legal_dir)
            .map_err(|e| format!("Cannot create oryvia-legal directory: {e}"))?;
    }

    let license_path = legal_dir.join("LICENSE");
    let notice_path = legal_dir.join("NOTICE");
    let scope_path = legal_dir.join(LEGAL_SCOPE_FILE);

    std::fs::write(&license_path, LICENSE_TEXT)
        .map_err(|e| format!("Cannot write LICENSE: {e}"))?;
    std::fs::write(&notice_path, NOTICE_TEXT)
        .map_err(|e| format!("Cannot write NOTICE: {e}"))?;
    std::fs::write(&scope_path, expected_scope)
        .map_err(|e| format!("Cannot write .legal-scope: {e}"))?;

    Ok(())
}

pub fn owned_size_kb(dir: &Path) -> u32 {
    let mut total = APP_FILES.iter().filter_map(|name| std::fs::symlink_metadata(dir.join(name)).ok())
        .filter(|meta| meta.is_file() && !meta.file_type().is_symlink())
        .fold(0u64, |sum, meta| sum.saturating_add(meta.len()));

    let legal_dir = dir.join(LEGAL_DIR);
    if let Some(all_users) = scope(dir) {
        let expected_scope = if all_users { "all-users" } else { "user" };
        if is_owned_legal_dir(dir, expected_scope) {
            for name in LEGAL_FILES {
                if let Ok(meta) = std::fs::symlink_metadata(legal_dir.join(name)) {
                    if meta.is_file() && !meta.file_type().is_symlink() {
                        total = total.saturating_add(meta.len());
                    }
                }
            }
        }
    }
    (total / 1024).min(u32::MAX as u64) as u32
}

pub fn scope(dir: &Path) -> Option<bool> {
    let marker = dir.join(".install-scope");
    let meta = std::fs::symlink_metadata(&marker).ok()?;
    if !meta.is_file() || meta.file_type().is_symlink() { return None; }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 { return None; }
    }
    match std::fs::read_to_string(marker).ok()?.trim() {
        "user" => Some(false),
        "all-users" => Some(true),
        _ => None,
    }
}

pub fn validate_dir(dir: &Path) -> Result<(), String> {
    if !dir.is_absolute() || dir.parent().is_none() {
        return Err("An absolute, non-root install directory is required".into());
    }
    for ancestor in dir.ancestors() {
        let metadata = match std::fs::symlink_metadata(ancestor) {
            Ok(meta) => Some(meta),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(format!("Cannot inspect {}: {e}", ancestor.display())),
        };
        if let Some(meta) = metadata {
            if ancestor != dir && !meta.is_dir() {
                return Err("An install path ancestor is not a directory".into());
            }
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if meta.file_attributes() & 0x400 != 0 {
                    return Err("Install paths through reparse points are not supported".into());
                }
            }
            if meta.file_type().is_symlink() {
                return Err("Install paths through links are not supported".into());
            }
        }
    }
    Ok(())
}

#[allow(dead_code)] // Only the custom installer calls this shared validation.
pub fn validate_install(dir: &Path, all_users: bool) -> Result<(), String> {
    validate_dir(dir)?;
    let expected_scope = if all_users { "all-users" } else { "user" };
    let legal_dir = dir.join(LEGAL_DIR);
    let legal_exists = match std::fs::symlink_metadata(&legal_dir) {
        Ok(_) => true,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => false,
        Err(e) => return Err(format!("Cannot inspect legal directory: {e}")),
    };

    if let Some(existing_scope) = scope(dir) {
        if existing_scope != all_users {
            return Err("Uninstall the existing installation before changing its scope".into());
        }
        if legal_exists {
            if is_reparse_point_or_link(&legal_dir) {
                return Err("The oryvia-legal directory is a reparse point or symbolic link".into());
            }
            if !legal_dir.is_dir() {
                return Err("The oryvia-legal path conflicts with an existing file".into());
            }
            if !is_owned_legal_dir(dir, expected_scope) {
                return Err("The existing oryvia-legal directory is unverified, corrupt, or contains foreign files".into());
            }
        }
    } else {
        if dir.join("oryvia.exe").exists() || dir.join("uninstall.exe").exists() {
            return Err("The selected directory contains conflicting files without an install marker".into());
        }
        if legal_exists {
            return Err("The selected directory contains an existing 'oryvia-legal' folder without an install marker".into());
        }
    }
    for name in APP_FILES {
        if let Ok(meta) = std::fs::symlink_metadata(dir.join(name)) {
            if !meta.is_file() || meta.file_type().is_symlink() {
                return Err("An application file conflicts with a directory or link".into());
            }
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if meta.file_attributes() & 0x400 != 0 {
                    return Err("An application file is a reparse point".into());
                }
            }
        }
    }
    Ok(())
}

fn ps_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

#[cfg(windows)]
pub fn stop_installed_app(dir: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let exe = ps_literal(&dir.join(APP_FILES[0]).to_string_lossy());
    let pid = std::process::id();
    let script = format!("$ErrorActionPreference = 'Stop'; try {{ \
        Get-CimInstance Win32_Process -Filter \"Name = 'oryvia.exe'\" | \
        Where-Object {{ $_.ExecutablePath -eq {exe} -and $_.ProcessId -ne {pid} }} | \
        ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop }} \
        }} catch {{ exit 1 }}");
    let status = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script])
        .creation_flags(0x0800_0000).status().map_err(|e| e.to_string())?;
    if status.success() { Ok(()) } else { Err("Unable to stop the installed application".into()) }
}

#[cfg(windows)]
pub fn remove_owned_shortcut(shortcut: &Path, dir: &Path) {
    use std::os::windows::process::CommandExt;
    let shortcut = ps_literal(&shortcut.to_string_lossy());
    let exe = ps_literal(&dir.join(APP_FILES[0]).to_string_lossy());
    let script = format!("$p = {shortcut}; if (Test-Path -LiteralPath $p -PathType Leaf) {{ \
        $shell = New-Object -ComObject WScript.Shell; \
        if ($shell.CreateShortcut($p).TargetPath -eq {exe}) {{ Remove-Item -LiteralPath $p -Force }} \
        }}");
    let _ = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script])
        .creation_flags(0x0800_0000).status();
}

#[cfg(windows)]
pub fn remove_taskbar_shortcuts(dir: &Path) {
    let Some(appdata) = std::env::var_os("APPDATA") else { return };
    let pinned = std::path::PathBuf::from(appdata)
        .join(r"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar");
    let Ok(entries) = std::fs::read_dir(pinned) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("lnk")) {
            remove_owned_shortcut(&path, dir);
        }
    }
}

pub const STARTUP_NAME: &str = "Oryvia";
const OWNERSHIP_SCRIPT: &str = include_str!("installer/build/ownership.ps1");
const CLEANUP_SCRIPT: &str = include_str!("installer/build/cleanup.ps1");

#[cfg(windows)]
pub fn registration_check(dir: &Path, all_users: bool) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let directory = ps_literal(&dir.to_string_lossy());
    let command = format!("{OWNERSHIP_SCRIPT}\n$ErrorActionPreference = 'Stop'; try {{ $store = New-OryviaRegistryStore {scope}; Assert-OryviaRegistrationWritable $store {directory} }} catch {{ Write-Output $_.Exception.Message; exit 1 }}",
        scope = if all_users { "$true" } else { "$false" });
    let output = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &command])
        .creation_flags(0x0800_0000).output().map_err(|e| e.to_string())?;
    if output.status.success() { Ok(()) } else {
        Err(format!("{}{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr)).trim().to_string())
    }
}

pub fn remove_app_files_command(dir: &Path, pid: u32) -> Result<String, String> {
    validate_dir(dir)?;
    let all_users = scope(dir).ok_or("Uninstall refused: missing or invalid install scope marker")?;
    let directory = ps_literal(&dir.to_string_lossy());
    let expected_scope = if all_users { "all-users" } else { "user" };
    let scope_arg = if all_users { "$true" } else { "$false" };
    let startup_name = ps_literal(STARTUP_NAME);
    // No registry is changed by the parent. The helper waits for exit, preserves
    // marker/registration on locked executables and checks ownership again.
    Ok(format!("{OWNERSHIP_SCRIPT}\n{CLEANUP_SCRIPT}\n\
        Wait-Process -Id {pid} -ErrorAction SilentlyContinue; \
        $ErrorActionPreference = 'Stop'; \
        $store = New-OryviaRegistryStore {scope_arg}; \
        $beforeDelete = {{ Assert-OryviaRegistrationWritable $store {directory}; $registered = & $store.Read 'Uninstall' 'UninstallString'; if (Test-OryviaCommandTarget $registered {directory} @('oryvia.exe')) {{ 'oryvia.exe' }} else {{ 'uninstall.exe' }} }}; \
        $finalize = {{ Remove-OryviaOwnedStartup $store {directory} {startup_name}; Remove-OryviaOwnedRegistration $store {directory} }}; \
        $ok = Invoke-OryviaFileCleanup -Directory {directory} -ExpectedScope '{expected_scope}' -BeforeDelete $beforeDelete -Finalize $finalize; \
        if (!$ok) {{ exit 1 }}; if ($PSCommandPath) {{ Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue }}"))
}

#[cfg(windows)]
pub fn schedule_cleanup_with_program(dir: &Path, pid: u32, program: &Path) -> Result<(), String> {
    use std::io::Write;
    use std::os::windows::process::CommandExt;
    let command = remove_app_files_command(dir, pid)?;
    // Retain the exact helper on failure so registry/ACL cleanup can be retried
    // even if both binaries were removed. Create-new never overwrites a file.
    // Program Files inherits protected ACLs; no script is placed in shared TEMP.
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?.as_nanos();
    let helper = dir.join(format!(".oryvia-uninstall-retry-{pid}-{nonce}.ps1"));
    let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&helper).map_err(|e| e.to_string())?;
    file.write_all(b"\xef\xbb\xbf").and_then(|_| file.write_all(command.as_bytes())).and_then(|_| file.sync_all())
        .map_err(|e| format!("Cannot persist retry helper; registration is unchanged: {e}"))?;
    drop(file);
    let spawn = |flags| std::process::Command::new(program)
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&helper)
        .current_dir(std::env::temp_dir()).creation_flags(flags).spawn();
    spawn(0x0800_0000 | 0x0100_0000).or_else(|_| spawn(0x0800_0000))
        .map(|_| ()).map_err(|e| format!("Cleanup helper did not start; files, marker and registration are retained. Retry helper: {}. {e}", helper.display()))
}

#[cfg(windows)]
pub fn schedule_cleanup(dir: &Path, pid: u32) -> Result<(), String> {
    schedule_cleanup_with_program(dir, pid, Path::new("powershell.exe"))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("install-safety-{}-{:?}", std::process::id(), std::thread::current().id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }
    #[test]
    fn invalid_scope_is_not_per_user() {
        let dir = fixture();
        std::fs::write(dir.join(".install-scope"), "unexpected").unwrap();
        assert_eq!(scope(&dir), None);
        assert!(remove_app_files_command(&dir, 1).is_err());
        std::fs::remove_file(dir.join(".install-scope")).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
    #[test]
    fn only_owned_literal_files_no_recursive_or_shell_fallback() {
        let dir = fixture();
        std::fs::write(dir.join(".install-scope"), "user").unwrap();
        let command = remove_app_files_command(&dir, 123).unwrap();
        assert!(command.contains("-LiteralPath"));
        assert!(!command.contains("-Recurse"));
        assert!(!command.contains("cmd /c"));
        assert!(!command.contains("RunOnce"));
        assert!(command.contains("PSIsContainer"));
        assert!(command.contains("ReparsePoint"));
        assert_eq!(ps_literal("a'&$()[]"), "'a''&$()[]'");
        assert!(validate_install(&dir, true).is_err());
        std::fs::remove_file(dir.join(".install-scope")).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }

    #[test]
    #[cfg(windows)]
    fn helper_spawn_failure_preserves_retryable_files_and_marker() {
        let dir = fixture();
        std::fs::write(dir.join(".install-scope"), "user").unwrap();
        std::fs::write(dir.join("oryvia.exe"), "fixture").unwrap();
        let result = schedule_cleanup_with_program(&dir, 0, &dir.join("missing-helper.exe"));
        assert!(result.is_err());
        assert_eq!(scope(&dir), Some(false));
        assert!(dir.join("oryvia.exe").is_file());
        let helpers: Vec<_> = std::fs::read_dir(&dir).unwrap().flatten()
            .filter(|entry| entry.file_name().to_string_lossy().starts_with(".oryvia-uninstall-retry-")).collect();
        assert_eq!(helpers.len(), 1);
        for helper in helpers { std::fs::remove_file(helper.path()).unwrap(); }
        std::fs::remove_file(dir.join("oryvia.exe")).unwrap();
        std::fs::remove_file(dir.join(".install-scope")).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }

    #[test]
    #[cfg(windows)]
    fn assembled_unicode_helper_runs_with_an_in_memory_registry_only() {
        use std::os::windows::process::CommandExt;
        let base = fixture();
        let dir = base.join("Oryvia thử '& $() [x]");
        std::fs::create_dir(&dir).unwrap();
        std::fs::write(dir.join(".install-scope"), "user").unwrap();
        std::fs::write(dir.join("oryvia.exe"), "fixture").unwrap();
        std::fs::write(dir.join("uninstall.exe"), "fixture").unwrap();
        let legal = dir.join(LEGAL_DIR);
        std::fs::create_dir(&legal).unwrap();
        std::fs::write(legal.join("LICENSE"), LICENSE_TEXT).unwrap();
        std::fs::write(legal.join("NOTICE"), NOTICE_TEXT).unwrap();
        std::fs::write(legal.join(LEGAL_SCOPE_FILE), "user").unwrap();
        // A foreign LICENSE at root must be preserved untouched!
        std::fs::write(dir.join("LICENSE"), "foreign gpl at root").unwrap();
        std::fs::write(dir.join("settings.json"), "keep").unwrap();
        let command = remove_app_files_command(&dir, 0).unwrap();
        let production_factory = "$store = New-OryviaRegistryStore $false;";
        assert_eq!(command.matches(production_factory).count(), 1);
        // Only the store factory is injected. Execute the actual assembled
        // helper, marker protocol and finalizer without touching HKCU/HKLM.
        let command = command.replace(production_factory,
            "$store = @{ Exists = { param($branch) $false }; Read = { param($branch, $name) $null }; DeleteTree = { throw 'Unexpected fixture delete' }; DeleteValue = { throw 'Unexpected fixture delete' } };");
        let helper = dir.join("fixture-helper.ps1");
        let mut bytes = vec![0xef, 0xbb, 0xbf];
        bytes.extend_from_slice(command.as_bytes());
        std::fs::write(&helper, bytes).unwrap();
        let result = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(&helper).creation_flags(0x0800_0000).output().unwrap();
        assert!(result.status.success(), "{}{}", String::from_utf8_lossy(&result.stdout), String::from_utf8_lossy(&result.stderr));
        for name in [".install-scope", "oryvia.exe", "uninstall.exe", "fixture-helper.ps1"] { assert!(!dir.join(name).exists(), "{name}"); }
        assert!(!legal.exists(), "oryvia-legal folder remained");
        assert_eq!(std::fs::read_to_string(dir.join("LICENSE")).unwrap(), "foreign gpl at root");
        assert_eq!(std::fs::read_to_string(dir.join("settings.json")).unwrap(), "keep");
        std::fs::remove_file(dir.join("LICENSE")).unwrap();
        std::fs::remove_file(dir.join("settings.json")).unwrap();
        std::fs::remove_dir(dir).unwrap();
        std::fs::remove_dir(base).unwrap();
    }

    #[test]
    fn write_license_files_creates_exact_legal_structure() {
        let dir = fixture();
        // Root foreign documents must not block installation
        std::fs::write(dir.join("LICENSE"), "foreign root doc").unwrap();
        write_license_files(&dir, false).unwrap();
        let legal = dir.join(LEGAL_DIR);
        assert_eq!(std::fs::read_to_string(legal.join("LICENSE")).unwrap(), LICENSE_TEXT);
        assert_eq!(std::fs::read_to_string(legal.join("NOTICE")).unwrap(), NOTICE_TEXT);
        assert_eq!(std::fs::read_to_string(legal.join(LEGAL_SCOPE_FILE)).unwrap(), "user");
        assert!(is_owned_legal_dir(&dir, "user"));
        assert!(!is_owned_legal_dir(&dir, "all-users"));
        assert_eq!(std::fs::read_to_string(dir.join("LICENSE")).unwrap(), "foreign root doc");
        std::fs::remove_file(legal.join("LICENSE")).unwrap();
        std::fs::remove_file(legal.join("NOTICE")).unwrap();
        std::fs::remove_file(legal.join(LEGAL_SCOPE_FILE)).unwrap();
        std::fs::remove_dir(legal).unwrap();
        std::fs::remove_file(dir.join("LICENSE")).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
}
