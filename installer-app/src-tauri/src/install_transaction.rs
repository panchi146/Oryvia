//! File transaction shared by the production installation pipeline and fixtures.
use std::{fs, io::Write, path::{Path, PathBuf}};

struct Entry { original: PathBuf, backup: Option<PathBuf>, created: bool, dirty: bool }
pub struct InstallTransaction { entries: Vec<Entry>, dirs: Vec<PathBuf>, staging: Option<PathBuf> }
impl InstallTransaction {
    pub fn new() -> Self { Self { entries: vec![], dirs: vec![], staging: None } }
    pub fn directory(&mut self, path: &Path) -> Result<(), String> {
        crate::install_safety::validate_dir(path)?;
        if path.exists() { return if path.is_dir() { Ok(()) } else { Err(format!("Not a directory: {}", path.display())) }; }
        if let Some(parent) = path.parent() { self.directory(parent)?; }
        fs::create_dir(path).map_err(|e| e.to_string())?;
        self.dirs.push(path.into()); Ok(())
    }
    fn check(path: &Path) -> Result<(), String> {
        crate::install_safety::validate_dir(path)?;
        match fs::symlink_metadata(path) {
            Ok(m) if !m.is_file() || crate::install_safety::is_reparse_point_or_link(path) => Err(format!("Not a plain file: {}", path.display())),
            Ok(_) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("Cannot inspect {}: {e}", path.display())),
        }
    }
    pub fn prepare(&mut self, root: &Path, path: &Path) -> Result<(), String> {
        Self::check(path)?;
        if self.entries.iter().any(|e| e.original == path) { return Ok(()); }
        let backup = if path.exists() {
            if self.staging.is_none() {
                let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
                let staging = root.join(format!(".oryvia-transaction-{}-{nonce}", std::process::id()));
                crate::install_safety::validate_dir(&staging)?;
                // Exclusive creation: never adopt a pre-existing directory, even on collision.
                fs::create_dir(&staging).map_err(|e| format!("Cannot create transaction {}: {e}", staging.display()))?;
                self.staging = Some(staging);
            }
            let backup = self.staging.as_ref().unwrap().join(format!("{}.bak", self.entries.len()));
            Self::check(&backup)?;
            let mut output = fs::OpenOptions::new().write(true).create_new(true).open(&backup).map_err(|e| e.to_string())?;
            // Track the exact newly created file even when copying fails halfway.
            self.entries.push(Entry { original: path.into(), backup: Some(backup.clone()), created: false, dirty: false });
            std::io::copy(&mut fs::File::open(path).map_err(|e| e.to_string())?, &mut output).map_err(|e| e.to_string())?;
            output.sync_all().map_err(|e| e.to_string())?;
            return Ok(());
        } else { None };
        self.entries.push(Entry { original: path.into(), backup, created: false, dirty: false }); Ok(())
    }
    pub fn write(&mut self, path: &Path, bytes: &[u8]) -> Result<(), String> {
        self.write_with(path, |file| file.write_all(bytes).map_err(|e| e.to_string()))
    }
    pub fn write_with(&mut self, path: &Path, write: impl FnOnce(&mut fs::File) -> Result<(), String>) -> Result<(), String> {
        Self::check(path)?;
        let entry = self.entries.iter_mut().find(|e| e.original == path).ok_or("Unprepared write")?;
        let mut file = if entry.backup.is_some() {
            fs::OpenOptions::new().write(true).open(path)
        } else {
            fs::OpenOptions::new().write(true).create_new(true).open(path)
        }.map_err(|e| format!("Cannot open {}: {e}", path.display()))?;
        entry.created = entry.backup.is_none();
        entry.dirty = true;
        file.set_len(0).map_err(|e| e.to_string())?;
        write(&mut file)?;
        file.sync_all().map_err(|e| format!("Cannot flush {}: {e}", path.display()))
    }
    pub fn finish(mut self, rollback: bool) -> Result<(), String> {
        let mut errors = vec![];
        for entry in self.entries.iter_mut().rev() {
            let result = (|| -> Result<(), String> {
                if rollback && entry.dirty {
                    Self::check(&entry.original)?;
                    if let Some(backup) = &entry.backup {
                        Self::check(backup)?;
                        fs::copy(backup, &entry.original).map_err(|e| format!("Restore {} failed; backup retained at {}: {e}", entry.original.display(), backup.display()))?;
                    } else if entry.created {
                        fs::remove_file(&entry.original).map_err(|e| format!("Remove {}: {e}", entry.original.display()))?;
                    }
                }
                if let Some(backup) = &entry.backup {
                    Self::check(backup)?;
                    fs::remove_file(backup).map_err(|e| format!("Backup retained {}: {e}", backup.display()))?;
                }
                Ok(())
            })();
            if let Err(e) = result {
                errors.push(match &entry.backup {
                    Some(backup) => format!("{e}; original {}; backup retained at {}", entry.original.display(), backup.display()),
                    None => e,
                });
            }
        }
        if let Some(staging) = &self.staging {
            if let Err(e) = crate::install_safety::validate_dir(staging).and_then(|_| fs::remove_dir(staging).map_err(|e| e.to_string())) {
                errors.push(format!("Transaction retained at {}: {e}", staging.display()));
            }
        }
        if rollback {
            for dir in self.dirs.iter().rev() {
                if let Err(e) = crate::install_safety::validate_dir(dir).and_then(|_| fs::remove_dir(dir).map_err(|e| e.to_string())) { errors.push(format!("Directory retained {}: {e}", dir.display())); }
            }
        }
        if errors.is_empty() { Ok(()) } else { Err(errors.join("; ")) }
    }
}

// Hooks isolate payload/process, shortcut and registry side effects without duplicating
// the file pipeline in tests. A failing register hook must undo its partial writes.
pub trait InstallAdapter {
    fn payload(&mut self, output: &mut dyn Write) -> Result<(), String>;
    fn uninstaller(&mut self, output: &mut dyn Write) -> Result<(), String>;
    fn shortcuts(&mut self) -> Result<Vec<PathBuf>, String>;
    fn shortcut(&mut self, path: &Path) -> Result<Vec<u8>, String>;
    fn register(&mut self) -> Result<(), String>;
    fn restore_registration(&mut self) -> Result<(), String>;
    fn checkpoint(&mut self, _stage: &str, _path: &Path) -> Result<(), String> { Ok(()) }
}
pub fn install(root: &Path, all_users: bool, adapter: &mut impl InstallAdapter) -> Result<String, String> {
    crate::install_safety::validate_install(root, all_users)?;
    let mut tx = InstallTransaction::new();
    let mut registry_attempted = false;
    let result: Result<String, String> = (|| {
        tx.directory(root)?;
        let legal = root.join(crate::install_safety::LEGAL_DIR);
        // Validate before any owned legal content changes; backups live at root.
        let mut paths: Vec<PathBuf> = crate::install_safety::APP_FILES.iter().map(|n| root.join(n)).collect();
        paths.extend(crate::install_safety::LEGAL_FILES.iter().map(|n| legal.join(n)));
        let shortcuts = adapter.shortcuts()?;
        // Existing shortcuts are preserved: do not claim or overwrite foreign links.
        paths.extend(shortcuts.iter().filter(|p| !p.exists()).cloned());
        for path in &paths { adapter.checkpoint("prepare", path)?; tx.prepare(root, path)?; }
        tx.directory(&legal)?;
        let exe = root.join("oryvia.exe");
        tx.write_with(&exe, |output| adapter.payload(output))?;
        for (name, text) in [("LICENSE", crate::install_safety::LICENSE_TEXT), ("NOTICE", crate::install_safety::NOTICE_TEXT), (".legal-scope", if all_users { "all-users" } else { "user" })] {
            let path = legal.join(name);
            adapter.checkpoint("write", &path)?;
            tx.write(&path, text.as_bytes())?;
        }
        tx.write_with(&root.join("uninstall.exe"), |output| adapter.uninstaller(output))?;
        tx.write(&root.join(".install-scope"), if all_users { b"all-users" } else { b"user" })?;
        for path in shortcuts { if !path.exists() { tx.write(&path, &adapter.shortcut(&path)?)?; } }
        registry_attempted = true;
        adapter.register()?;
        Ok(exe.to_string_lossy().into_owned())
    })();
    match result {
        Ok(path) => { tx.finish(false).map_err(|e| format!("Installation completed; transaction cleanup incomplete: {e}"))?; Ok(path) }
        Err(error) => {
            let registry = if registry_attempted { adapter.restore_registration() } else { Ok(()) };
            let files = tx.finish(true);
            match (files, registry) {
                (Ok(()), Ok(())) => Err(format!("Installation failed: {error}. File/shortcut rollback completed; registration restored or untouched.")),
                (files, registry) => Err(format!("Installation failed: {error}. Rollback incomplete: files={files:?}; registration={registry:?}")),
            }
        }
    }
}

#[cfg(test)]
#[path = "install_transaction_tests.rs"]
mod tests;
