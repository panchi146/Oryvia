use super::*;
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::process::ExitStatusExt;

fn fixture() -> PathBuf {
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("oryvia-custom-retry-{}-{nonce} ' & $() [x]", std::process::id()));
    std::fs::create_dir(&dir).unwrap();
    for (name, text) in [(".install-scope", "user"), ("oryvia.exe", "fixture"), ("uninstall.exe", "fixture"), ("settings.json", "keep"), ("foreign.exe", "keep")] {
        std::fs::write(dir.join(name), text).unwrap();
    }
    let legal = dir.join(crate::install_safety::LEGAL_DIR);
    std::fs::create_dir(&legal).unwrap();
    std::fs::write(legal.join("LICENSE"), crate::install_safety::LICENSE_TEXT).unwrap();
    std::fs::write(legal.join("NOTICE"), crate::install_safety::NOTICE_TEXT).unwrap();
    std::fs::write(legal.join(crate::install_safety::LEGAL_SCOPE_FILE), "user").unwrap();
    dir
}
fn clean(dir: &Path) {
    let legal = dir.join(crate::install_safety::LEGAL_DIR);
    if legal.exists() {
        for entry in std::fs::read_dir(&legal).unwrap() { std::fs::remove_file(entry.unwrap().path()).unwrap(); }
        let _ = std::fs::remove_dir(&legal);
    }
    for entry in std::fs::read_dir(dir).unwrap() {
        let p = entry.unwrap().path();
        if p.is_dir() {
            for sub in std::fs::read_dir(&p).unwrap() { std::fs::remove_file(sub.unwrap().path()).unwrap(); }
            let _ = std::fs::remove_dir(&p);
        } else {
            let _ = std::fs::remove_file(&p);
        }
    }
    let _ = std::fs::remove_dir(dir);
}
fn literal(path: &Path) -> String { format!("'{}'", path.display().to_string().replace('\'', "''")) }
fn powershell(dir: &Path, text: &str) -> bool {
    let script = dir.join("fixture.ps1");
    std::fs::write(&script, format!("\u{feff}{text}")).unwrap();
    let output = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script).creation_flags(CREATE_NO_WINDOW).output().unwrap();
    if !output.status.success() { eprintln!("{}{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr)); }
    output.status.success()
}
// Only external effects are substituted. Registration still uses the real
// ownership functions and cleanup runs the actual assembled production helper.
struct Fixture {
    foreign: bool, fail_spawn: bool, ran_main: usize, fallback: usize, scheduled: usize,
}
impl Fixture {
    fn new() -> Self { Self { foreign: false, fail_spawn: false, ran_main: 0, fallback: 0, scheduled: 0 } }
    fn store(&self, dir: &Path) -> String {
        let registered = if self.foreign { dir.join("foreign-copy") } else { dir.to_path_buf() };
        format!(r#"
$d = @{{ Uninstall = @{{ InstallLocation = {registered}; UninstallString = ('"' + (Join-Path {registered} 'uninstall.exe') + '" --uninstall') }}; Product = @{{ '' = {registered} }}; Run = @{{}}; Approved = @{{}} }}
$state = Join-Path {dir} 'registry.clixml'
if (Test-Path -LiteralPath $state) {{ $d = Import-Clixml -LiteralPath $state }}
$d | Export-Clixml -LiteralPath $state
$store = @{{
 Exists = {{ param($b) $d[$b].Count -gt 0 }}
 Read = {{ param($b,$n) $d[$b][$n] }}
 DeleteTree = {{ param($b) $d[$b].Clear(); $d | Export-Clixml -LiteralPath $state; [IO.File]::WriteAllText((Join-Path {dir} ($b + '.finalized')), 'done') }}
 DeleteValue = {{ param($b,$n) [void]$d[$b].Remove($n) }}
}};
"#, registered=literal(&registered), dir=literal(dir))
    }
}
impl Operations for Fixture {
    fn registration(&mut self, dir: &Path, _: bool) -> Result<(), String> {
        let text = format!("{}\n$ErrorActionPreference='Stop'; {}\nAssert-OryviaRegistrationWritable $store {}", include_str!("../../../installer/build/ownership.ps1"), self.store(dir), literal(dir));
        if powershell(dir, &text) { Ok(()) } else { Err("registration conflict".into()) }
    }
    fn stop(&mut self, _: &Path) -> Result<(), String> { Ok(()) }
    fn restore(&mut self, exe: &Path) -> Result<(), String> {
        let main = &mut self.ran_main;
        let fallback = &mut self.fallback;
        restore_with(exe, |_| { *main += 1; Ok(std::process::ExitStatus::from_raw(0)) }, || { *fallback += 1; Ok(()) })
    }
    fn shortcuts(&mut self, _: &Path, _: &[PathBuf]) {}
    fn schedule(&mut self, dir: &Path) -> Result<(), String> {
        self.scheduled += 1;
        if self.fail_spawn {
            return crate::install_safety::schedule_cleanup_with_program(dir, 0, &dir.join("missing-powershell.exe"));
        }
        let command = crate::install_safety::remove_app_files_command(dir, 0)?;
        let factory = "$store = New-OryviaRegistryStore $false;";
        assert_eq!(command.matches(factory).count(), 1);
        let command = command.replace(factory, &self.store(dir))
            .replace("-BeforeDelete $beforeDelete -Finalize $finalize;", &format!("-BeforeDelete $beforeDelete -Finalize $finalize -LogPath {};", literal(&dir.join("cleanup.log"))))
            .replace("-BeforeDelete $beforeDelete -Finalize $finalize", "-BeforeDelete $beforeDelete -Finalize $finalize -Attempts 1");
        // A scheduled helper may report incomplete AFTER the parent returned.
        let _completed = powershell(dir, &command);
        Ok(())
    }
}
#[test]
fn custom_registration_locked_uninstaller_missing_main_retry_uses_entry_pipeline() {
    let dir = fixture();
    let mut ops = Fixture::new();
    let lock = std::fs::OpenOptions::new().read(true).share_mode(0).open(dir.join("uninstall.exe")).unwrap();
    uninstall_with(&dir, false, &[], &mut ops).unwrap();
    assert_eq!(ops.ran_main, 1);
    assert!(!dir.join("oryvia.exe").exists());
    assert!(dir.join("uninstall.exe").exists());
    assert_eq!(crate::install_safety::scope(&dir), Some(false));
    assert!(!dir.join("Uninstall.finalized").exists());
    assert!(powershell(&dir, "if ((Import-Clixml -LiteralPath (Join-Path $PSScriptRoot 'registry.clixml')).Uninstall.Count -eq 0) { exit 1 }"));
    drop(lock);
    // Retry the SAME pipeline called by start_uninstall, not direct cleanup.
    uninstall_with(&dir, false, &[], &mut ops).unwrap();
    assert_eq!((ops.ran_main, ops.fallback, ops.scheduled), (1, 1, 2));
    for name in ["oryvia.exe", "uninstall.exe", ".install-scope"] { assert!(!dir.join(name).exists(), "{name}"); }
    assert!(!dir.join(crate::install_safety::LEGAL_DIR).exists());
    assert!(dir.join("Uninstall.finalized").exists());
    assert!(dir.join("Product.finalized").exists());
    assert!(powershell(&dir, "if ((Import-Clixml -LiteralPath (Join-Path $PSScriptRoot 'registry.clixml')).Uninstall.Count -ne 0) { exit 1 }"));
    for name in ["settings.json", "foreign.exe"] { assert_eq!(std::fs::read_to_string(dir.join(name)).unwrap(), "keep"); }
    clean(&dir);
}
#[test]
fn existing_main_normal_pipeline_and_helper_spawn_failure_are_retryable() {
    let dir = fixture();
    let mut ops = Fixture::new();
    ops.fail_spawn = true;
    assert!(uninstall_with(&dir, false, &[], &mut ops).unwrap_err().contains("did not start"));
    for name in ["oryvia.exe", "uninstall.exe", ".install-scope"] { assert!(dir.join(name).exists()); }
    assert!(dir.join(crate::install_safety::LEGAL_DIR).exists());
    assert!(!dir.join("Uninstall.finalized").exists());
    ops.fail_spawn = false;
    uninstall_with(&dir, false, &[], &mut ops).unwrap();
    assert_eq!((ops.ran_main, ops.fallback), (2, 0));
    assert!(!dir.join(".install-scope").exists());
    clean(&dir);
}
#[test]
fn invalid_marker_scope_and_foreign_registration_reject_before_restore() {
    let dir = fixture();
    let mut ops = Fixture::new();
    for marker in [None, Some("corrupt"), Some("all-users")] {
        let path = dir.join(".install-scope");
        let _ = std::fs::remove_file(&path);
        if let Some(text) = marker { std::fs::write(path, text).unwrap(); }
        assert!(uninstall_with(&dir, false, &[], &mut ops).is_err());
    }
    std::fs::write(dir.join(".install-scope"), "user").unwrap();
    ops.foreign = true;
    assert!(uninstall_with(&dir, false, &[], &mut ops).is_err());
    assert_eq!((ops.ran_main, ops.fallback, ops.scheduled), (0, 0, 0));
    assert!(dir.join("oryvia.exe").exists());
    clean(&dir);
}
#[test]
fn restore_errors_are_not_treated_as_missing_main() {
    let dir = fixture();
    let exe = dir.join("oryvia.exe");
    for kind in [std::io::ErrorKind::PermissionDenied, std::io::ErrorKind::NotFound, std::io::ErrorKind::InvalidData] {
        assert!(restore_with(&exe, |_| Err(std::io::Error::from(kind)), || panic!("must not swallow execution errors")).is_err());
    }
    assert!(restore_with(&exe, |_| Ok(std::process::ExitStatus::from_raw(7)), || panic!("nonzero exit")).is_err());
    // Disappearance between inspection and CreateProcess also permits fallback.
    restore_with(&exe, |_| { std::fs::remove_file(&exe)?; Err(std::io::ErrorKind::NotFound.into()) }, || Ok(())).unwrap();
    assert!(restore_with(&exe, |_| panic!("missing main"), || Err("restore failed".into())).is_err());
    clean(&dir);
}

#[test]
fn missing_main_helper_spawn_failure_preserves_custom_retry() {
    let dir = fixture();
    std::fs::remove_file(dir.join("oryvia.exe")).unwrap();
    let mut ops = Fixture::new();
    ops.fail_spawn = true;
    assert!(uninstall_with(&dir, false, &[], &mut ops).is_err());
    assert!(dir.join("uninstall.exe").exists());
    assert_eq!(crate::install_safety::scope(&dir), Some(false));
    assert!(!dir.join("Uninstall.finalized").exists());
    ops.fail_spawn = false;
    uninstall_with(&dir, false, &[], &mut ops).unwrap();
    assert_eq!((ops.ran_main, ops.fallback), (0, 2));
    assert!(!dir.join(".install-scope").exists());
    clean(&dir);
}
