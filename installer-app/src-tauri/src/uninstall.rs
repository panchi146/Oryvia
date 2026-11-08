use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};

#[path = "../../../taskbar_restore.rs"]
mod taskbar_restore;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

// This is the entry-point pipeline, with OS effects injected only by tests.
trait Operations {
    fn registration(&mut self, dir: &Path, all_users: bool) -> Result<(), String>;
    fn stop(&mut self, dir: &Path) -> Result<(), String>;
    fn restore(&mut self, exe: &Path) -> Result<(), String>;
    fn shortcuts(&mut self, dir: &Path, shortcuts: &[PathBuf]);
    fn schedule(&mut self, dir: &Path) -> Result<(), String>;
}
struct Windows;
impl Operations for Windows {
    fn registration(&mut self, dir: &Path, all_users: bool) -> Result<(), String> {
        crate::install_safety::registration_check(dir, all_users)
    }
    fn stop(&mut self, dir: &Path) -> Result<(), String> { crate::install_safety::stop_installed_app(dir) }
    fn restore(&mut self, exe: &Path) -> Result<(), String> {
        restore_with(exe, |exe| std::process::Command::new(exe)
            .arg("--restore-taskbar-on-uninstall").creation_flags(CREATE_NO_WINDOW).status(),
            taskbar_restore::restore_current_user)
    }
    fn shortcuts(&mut self, dir: &Path, shortcuts: &[PathBuf]) {
        for s in shortcuts { crate::install_safety::remove_owned_shortcut(s, dir); }
        crate::install_safety::remove_taskbar_shortcuts(dir);
    }
    fn schedule(&mut self, dir: &Path) -> Result<(), String> {
        crate::install_safety::schedule_cleanup(dir, std::process::id())
    }
}

fn main_present(exe: &Path) -> Result<bool, String> {
    match std::fs::symlink_metadata(exe) {
        Ok(meta) => {
            use std::os::windows::fs::MetadataExt;
            if !meta.is_file() || meta.file_attributes() & 0x400 != 0 {
                return Err("Main executable is not a plain file".into());
            }
            Ok(true)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(format!("Cannot inspect main executable: {e}")),
    }
}

fn restore_with(exe: &Path,
    run: impl FnOnce(&Path) -> std::io::Result<std::process::ExitStatus>,
    fallback: impl FnOnce() -> Result<(), String>) -> Result<(), String> {
    if !main_present(exe)? { return fallback(); }
    match run(exe) {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => Err(format!("Could not restore taskbar: main exited with {status}")),
        // A missing DLL/interpreter also produces NotFound. Only an independently
        // confirmed missing executable permits recovery without Main.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && !main_present(exe)? => fallback(),
        Err(e) => Err(format!("Could not restore taskbar: {e}")),
    }
}

fn uninstall_with(install_dir: &Path, all_users: bool, shortcuts: &[PathBuf], ops: &mut impl Operations) -> Result<(), String> {
    crate::install_safety::validate_dir(install_dir)?;
    if crate::install_safety::scope(install_dir) != Some(all_users) {
        return Err("Uninstall refused: missing, invalid or mismatched install scope marker".into());
    }
    ops.registration(install_dir, all_users)?;
    crate::install_safety::remove_app_files_command(install_dir, std::process::id())?;
    ops.stop(install_dir)?;
    ops.restore(&install_dir.join(crate::install_safety::APP_FILES[0]))?;
    ops.shortcuts(install_dir, shortcuts);
    ops.schedule(install_dir)
}

pub fn uninstall(install_dir: &Path, all_users: bool, shortcuts: &[PathBuf]) -> Result<(), String> {
    uninstall_with(install_dir, all_users, shortcuts, &mut Windows)
}

#[cfg(test)]
#[path = "uninstall_tests.rs"]
mod tests;
