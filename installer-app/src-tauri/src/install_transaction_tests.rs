use super::*;
use std::os::windows::fs::OpenOptionsExt;
struct Fixture { root: PathBuf, link: PathBuf, fail: Option<(&'static str, &'static str)>, lock: Option<fs::File>, registry: String, prior: String, fail_registry: bool }
impl Fixture {
    fn new(upgrade: bool) -> Self {
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("oryvia-pipeline-{}-{nonce}", std::process::id()));
        fs::create_dir(&root).unwrap();
        fs::write(root.join("settings.json"), b"settings unchanged").unwrap();
        fs::write(root.join("foreign.txt"), b"foreign unchanged").unwrap();
        let link = root.join("fixture.lnk");
        if upgrade {
            fs::write(root.join("oryvia.exe"), b"old executable").unwrap();
            fs::write(root.join("uninstall.exe"), b"old uninstaller").unwrap();
            fs::write(root.join(".install-scope"), b"user").unwrap();
            crate::install_safety::write_license_files(&root, false).unwrap();
            fs::write(root.join("oryvia-legal/LICENSE"), format!("{}\nold legal bytes", crate::install_safety::LICENSE_TEXT)).unwrap();
            fs::write(root.join("oryvia-legal/NOTICE"), format!("{}\nold notice bytes", crate::install_safety::NOTICE_TEXT)).unwrap();
            fs::write(root.join("oryvia-legal/.legal-scope"), b"user\r\n").unwrap();
            fs::write(&link, b"old shortcut").unwrap();
        }
        Self { root, link, fail: None, lock: None, registry: "old registration".into(), prior: "old registration".into(), fail_registry: false }
    }
    fn run(&mut self) -> Result<String, String> { install(&self.root.clone(), false, self) }
    fn unchanged(&self) {
        assert_eq!(fs::read(self.root.join("settings.json")).unwrap(), b"settings unchanged");
        assert_eq!(fs::read(self.root.join("foreign.txt")).unwrap(), b"foreign unchanged");
        assert_eq!(self.registry, self.prior);
    }
    fn staging(&self) -> Vec<PathBuf> { fs::read_dir(&self.root).unwrap().map(|e| e.unwrap().path()).filter(|p| p.file_name().unwrap().to_string_lossy().starts_with(".oryvia-transaction-")).collect() }
}
impl InstallAdapter for Fixture {
    fn payload(&mut self, output: &mut dyn Write) -> Result<(), String> { output.write_all(b"new executable").map_err(|e| e.to_string())?; if self.fail == Some(("payload", "oryvia.exe")) { Err("injected partial extraction".into()) } else { Ok(()) } }
    fn uninstaller(&mut self, output: &mut dyn Write) -> Result<(), String> { output.write_all(b"new uninstaller").map_err(|e| e.to_string()) }
    fn shortcuts(&mut self) -> Result<Vec<PathBuf>, String> { Ok(vec![self.link.clone()]) }
    fn shortcut(&mut self, _: &Path) -> Result<Vec<u8>, String> { Ok(b"new shortcut".to_vec()) }
    fn register(&mut self) -> Result<(), String> { self.registry = "new registration".into(); if self.fail_registry { Err("injected partial registry write".into()) } else { Ok(()) } }
    fn restore_registration(&mut self) -> Result<(), String> { if self.fail == Some(("registry-restore", "denied")) { return Err("injected registry restore access denied".into()); } self.registry = self.prior.clone(); Ok(()) }
    fn checkpoint(&mut self, stage: &str, path: &Path) -> Result<(), String> {
        if self.fail == Some(("race", "LICENSE")) && stage == "write" && path.ends_with("LICENSE") { fs::write(path, b"foreign arrival").unwrap(); }
        if stage == "write" {
            assert!(fs::read_dir(self.root.join("oryvia-legal")).unwrap().all(|e| crate::install_safety::LEGAL_FILES.contains(&e.unwrap().file_name().to_str().unwrap())));
        }
        if self.fail == Some((stage, path.file_name().unwrap().to_str().unwrap())) {
            if stage == "prepare" || stage == "write" {
                self.lock = Some(fs::OpenOptions::new().read(true).share_mode(0).open(path).map_err(|e| e.to_string())?);
                return Ok(());
            }
        }
        if self.fail == Some(("rollback-lock", "oryvia.exe")) && stage == "write" && path.ends_with("NOTICE") {
            self.lock = Some(fs::OpenOptions::new().read(true).share_mode(0).open(self.root.join("oryvia.exe")).unwrap());
            return Err("injected failure with locked executable".into());
        }
        Ok(())
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.lock.take();
        // Exact fixture paths only. Failed recovery evidence is deliberately retained.
        for name in ["oryvia.exe", "uninstall.exe", ".install-scope", "settings.json", "foreign.txt", "fixture.lnk"] { let _ = fs::remove_file(self.root.join(name)); }
        for name in crate::install_safety::LEGAL_FILES { let _ = fs::remove_file(self.root.join(crate::install_safety::LEGAL_DIR).join(name)); }
        let _ = fs::remove_dir(self.root.join(crate::install_safety::LEGAL_DIR));
        let _ = fs::remove_dir(&self.root);
    }
}
#[test]
fn valid_upgrade_pipeline_and_fresh_install() {
    for upgrade in [false, true] {
        let mut f = Fixture::new(upgrade); f.run().unwrap();
        assert_eq!(fs::read(f.root.join("oryvia.exe")).unwrap(), b"new executable");
        assert_eq!(fs::read(&f.link).unwrap(), if upgrade { &b"old shortcut"[..] } else { &b"new shortcut"[..] });
        assert!(crate::install_safety::is_owned_legal_dir(&f.root, "user"));
        assert!(f.staging().is_empty());
        assert_eq!(fs::read(f.root.join("settings.json")).unwrap(), b"settings unchanged");
    }
}
#[test]
fn preparation_failure_cleans_only_own_backups_then_retry() {
    let mut f = Fixture::new(true);
    f.fail = Some(("prepare", "NOTICE"));
    let error = f.run().unwrap_err(); assert!(error.contains("rollback completed"), "{error}");
    f.lock.take(); f.unchanged(); assert!(f.staging().is_empty());
    assert_eq!(fs::read(f.root.join("oryvia.exe")).unwrap(), b"old executable");
    f.fail = None; f.run().unwrap();
}
#[test]
fn legal_write_failures_restore_exact_files_and_retry() {
    for name in ["LICENSE", "NOTICE"] {
        let mut f = Fixture::new(true); f.fail = Some(("write", name));
        let error = f.run().unwrap_err(); assert!(error.contains("rollback completed"), "{error}");
        f.lock.take(); f.unchanged();
        assert_eq!(fs::read(f.root.join("oryvia.exe")).unwrap(), b"old executable");
        assert_eq!(fs::read(f.root.join("uninstall.exe")).unwrap(), b"old uninstaller");
        assert_eq!(fs::read(&f.link).unwrap(), b"old shortcut");
        assert_eq!(fs::read(f.root.join("oryvia-legal/LICENSE")).unwrap(), format!("{}\nold legal bytes", crate::install_safety::LICENSE_TEXT).as_bytes());
        assert_eq!(fs::read(f.root.join("oryvia-legal/NOTICE")).unwrap(), format!("{}\nold notice bytes", crate::install_safety::NOTICE_TEXT).as_bytes());
        assert_eq!(fs::read(f.root.join("oryvia-legal/.legal-scope")).unwrap(), b"user\r\n");
        assert!(f.staging().is_empty()); f.fail = None; f.run().unwrap();
    }
}
#[test]
fn locked_rollback_reports_retained_backup_then_recovery_and_retry() {
    let mut f = Fixture::new(true); f.fail = Some(("rollback-lock", "oryvia.exe"));
    let error = f.run().unwrap_err(); assert!(error.contains("Rollback incomplete"), "{error}");
    assert!(error.contains("backup retained at"), "{error}"); f.lock.take();
    let staging = f.staging(); assert_eq!(staging.len(), 1);
    let backups: Vec<_> = fs::read_dir(&staging[0]).unwrap().map(|e| e.unwrap().path()).collect(); assert_eq!(backups.len(), 1);
    assert_eq!(fs::read(&backups[0]).unwrap(), b"old executable");
    // Explicit recovery using the reported backup, after resolving the file lock.
    fs::copy(&backups[0], f.root.join("oryvia.exe")).unwrap(); fs::remove_file(&backups[0]).unwrap(); fs::remove_dir(&staging[0]).unwrap();
    f.unchanged(); f.fail = None; f.run().unwrap();
}
#[test]
fn partial_registry_failure_restores_files_shortcuts_and_registration() {
    for upgrade in [false, true] {
        let mut f = Fixture::new(upgrade); f.fail_registry = true;
        let error = f.run().unwrap_err(); assert!(error.contains("rollback completed"), "{error}");
        f.unchanged(); assert!(f.staging().is_empty());
        if upgrade { assert_eq!(fs::read(&f.link).unwrap(), b"old shortcut"); } else { assert!(!f.link.exists()); assert!(!f.root.join("oryvia.exe").exists()); }
        f.fail_registry = false; f.run().unwrap();
    }
}
#[test]
fn partial_extraction_uses_the_same_rollback_pipeline() {
    for upgrade in [false, true] {
        let mut f = Fixture::new(upgrade); f.fail = Some(("payload", "oryvia.exe"));
        let error = f.run().unwrap_err(); assert!(error.contains("rollback completed"), "{error}");
        f.unchanged(); assert!(f.staging().is_empty());
        if upgrade { assert_eq!(fs::read(f.root.join("oryvia.exe")).unwrap(), b"old executable"); } else { assert!(!f.root.join("oryvia.exe").exists()); }
        f.fail = None; f.run().unwrap();
    }
}
#[test]
fn a_file_arriving_after_preparation_is_never_claimed_or_deleted() {
    let mut f = Fixture::new(false); f.fail = Some(("race", "LICENSE"));
    let error = f.run().unwrap_err(); assert!(error.contains("Rollback incomplete"), "{error}");
    assert_eq!(fs::read(f.root.join("oryvia-legal/LICENSE")).unwrap(), b"foreign arrival");
    assert!(!f.root.join("oryvia.exe").exists()); f.unchanged();
}
#[test]
fn unrelated_transaction_looking_directory_is_preserved() {
    let mut f = Fixture::new(true);
    let foreign = f.root.join(".oryvia-transaction-existing");
    fs::create_dir(&foreign).unwrap(); fs::write(foreign.join("0.bak"), b"foreign backup").unwrap();
    f.run().unwrap(); assert_eq!(fs::read(foreign.join("0.bak")).unwrap(), b"foreign backup");
    fs::remove_file(foreign.join("0.bak")).unwrap(); fs::remove_dir(foreign).unwrap();
}
#[test]
fn registry_restore_failure_is_reported_separately_from_file_recovery() {
    let mut f = Fixture::new(true); f.fail_registry = true; f.fail = Some(("registry-restore", "denied"));
    let error = f.run().unwrap_err(); assert!(error.contains("Rollback incomplete"), "{error}");
    assert!(error.contains("registry restore access denied"), "{error}");
    assert_eq!(fs::read(f.root.join("oryvia.exe")).unwrap(), b"old executable");
    assert_eq!(f.registry, "new registration"); assert!(f.staging().is_empty());
}
