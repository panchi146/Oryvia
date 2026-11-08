# Changed files — Stage1 Fixes Audit

All paths are relative to C:\Users\phamv\Oryvia-Clean. New source identity remains Oryvia 1.0.0 / com.panchi146.oryvia. No original source file was deleted.

## Current audit fixes, compared with the pre-fix Stage1 snapshot

34 files added/modified, including reports/manifest. Patch 04 contains the 23 application/test/workflow files; handoff docs and generated inventories/manifest are separate. Protected UI/assets: 133 files have identical SHA-256. Installer App.tsx changes only its completion heading after CRLF normalization.

| Status | File |
|---|---|
| Modified | `.github/workflows/release.yml` |
| Added | `AUDIT_FIXES_REPORT.md` |
| Modified | `CHANGELOG_MIGRATION.md` |
| Modified | `docs/ISSUE_LOG.md` |
| Modified | `install_safety.rs` |
| Modified | `installer-app/src-tauri/src/commands.rs` |
| Modified | `installer-app/src-tauri/src/registry.rs` |
| Modified | `installer-app/src-tauri/src/uninstall.rs` |
| Modified | `installer-app/src/App.tsx` |
| Added | `installer/build/cleanup.ps1` |
| Modified | `installer/build/installer.nsh` |
| Added | `installer/build/ownership.ps1` |
| Added | `migration/04-audit-fixes.patch` |
| Added | `migration/audit-fixes-before-sha256.json` |
| Added | `migration/audit-fixes-review.json` |
| Modified | `migration/CHANGED_FILES.md` |
| Modified | `migration/ROLLBACK.md` |
| Modified | `migration/VALIDATION.md` |
| Modified | `ORYVIA_README.md` |
| Modified | `SOURCE_MANIFEST.sha256` |
| Modified | `src-tauri/src/main.rs` |
| Modified | `src-tauri/src/native_uninstall.rs` |
| Modified | `src-tauri/src/uninstall_registry.rs` |
| Added | `src-tauri/src/update_policy.rs` |
| Modified | `src-tauri/src/updater.rs` |
| Added | `src/i18n/native-uninstall.json` |
| Modified | `src/i18n/translations.ts` |
| Modified | `src/settings/AboutTab.tsx` |
| Modified | `src/settings/useSettings.ts` |
| Modified | `src/updater.ts` |
| Added | `tests/install-safety.test.mjs` |
| Added | `tests/install-safety.test.ps1` |
| Modified | `tests/migration.test.mjs` |
| Added | `tests/updater-local.test.mjs` |

## Cumulative changes from supplied Nectar Custom

131 added/modified source/handoff files. This table includes original branding assets individually. Original dependency locks and application identifiers remain unchanged by the audit-fix step.

| Status | File |
|---|---|
| Modified | `.github/workflows/release.yml` |
| Added | `AUDIT_FIXES_REPORT.md` |
| Added | `branding/oryvia-source.png` |
| Modified | `bun.lock` |
| Modified | `calendar.html` |
| Added | `CHANGELOG_MIGRATION.md` |
| Modified | `dock.html` |
| Modified | `docs/ISSUE_LOG.md` |
| Modified | `index.html` |
| Added | `install_safety.rs` |
| Modified | `installer-app/index.html` |
| Modified | `installer-app/package-lock.json` |
| Modified | `installer-app/package.json` |
| Added | `installer-app/public/oryvia.png` |
| Modified | `installer-app/scripts/build-payload.ps1` |
| Modified | `installer-app/src-tauri/build.rs` |
| Modified | `installer-app/src-tauri/Cargo.lock` |
| Modified | `installer-app/src-tauri/Cargo.toml` |
| Modified | `installer-app/src-tauri/icons/128x128.png` |
| Modified | `installer-app/src-tauri/icons/128x128@2x.png` |
| Modified | `installer-app/src-tauri/icons/32x32.png` |
| Modified | `installer-app/src-tauri/icons/icon.ico` |
| Modified | `installer-app/src-tauri/src/commands.rs` |
| Modified | `installer-app/src-tauri/src/known_folders.rs` |
| Modified | `installer-app/src-tauri/src/main.rs` |
| Modified | `installer-app/src-tauri/src/payload.rs` |
| Modified | `installer-app/src-tauri/src/registry.rs` |
| Modified | `installer-app/src-tauri/src/uninstall.rs` |
| Modified | `installer-app/src-tauri/tauri.conf.json` |
| Modified | `installer-app/src/App.tsx` |
| Added | `installer/build/cleanup.ps1` |
| Modified | `installer/build/installer.nsh` |
| Added | `installer/build/ownership.ps1` |
| Added | `migration/01-uninstall-safety.patch` |
| Added | `migration/02-updater-release.patch` |
| Added | `migration/03-oryvia-branding.patch` |
| Added | `migration/04-audit-fixes.patch` |
| Added | `migration/audit-fixes-before-sha256.json` |
| Added | `migration/audit-fixes-review.json` |
| Added | `migration/baseline-sha256.json` |
| Added | `migration/CHANGED_FILES.md` |
| Added | `migration/ROLLBACK.md` |
| Added | `migration/safety-sha256.json` |
| Added | `migration/VALIDATION.md` |
| Added | `NOTICE` |
| Added | `ORYVIA_README.md` |
| Modified | `package-lock.json` |
| Modified | `package.json` |
| Added | `public/oryvia.png` |
| Modified | `scripts/bump-version.mjs` |
| Modified | `scripts/release.ps1` |
| Modified | `settings.html` |
| Added | `SOURCE_MANIFEST.sha256` |
| Modified | `src-tauri/Cargo.lock` |
| Modified | `src-tauri/Cargo.toml` |
| Modified | `src-tauri/icons/1024x1024.png` |
| Modified | `src-tauri/icons/128x128.png` |
| Modified | `src-tauri/icons/128x128@2x.png` |
| Modified | `src-tauri/icons/256x256.png` |
| Modified | `src-tauri/icons/32x32.png` |
| Modified | `src-tauri/icons/32x32@2x.png` |
| Modified | `src-tauri/icons/512x512.png` |
| Modified | `src-tauri/icons/64x64.png` |
| Modified | `src-tauri/icons/android/mipmap-anydpi-v26/ic_launcher.xml` |
| Modified | `src-tauri/icons/android/mipmap-hdpi/ic_launcher_foreground.png` |
| Modified | `src-tauri/icons/android/mipmap-hdpi/ic_launcher_round.png` |
| Modified | `src-tauri/icons/android/mipmap-hdpi/ic_launcher.png` |
| Modified | `src-tauri/icons/android/mipmap-mdpi/ic_launcher_foreground.png` |
| Modified | `src-tauri/icons/android/mipmap-mdpi/ic_launcher_round.png` |
| Modified | `src-tauri/icons/android/mipmap-mdpi/ic_launcher.png` |
| Modified | `src-tauri/icons/android/mipmap-xhdpi/ic_launcher_foreground.png` |
| Modified | `src-tauri/icons/android/mipmap-xhdpi/ic_launcher_round.png` |
| Modified | `src-tauri/icons/android/mipmap-xhdpi/ic_launcher.png` |
| Modified | `src-tauri/icons/android/mipmap-xxhdpi/ic_launcher_foreground.png` |
| Modified | `src-tauri/icons/android/mipmap-xxhdpi/ic_launcher_round.png` |
| Modified | `src-tauri/icons/android/mipmap-xxhdpi/ic_launcher.png` |
| Modified | `src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher_foreground.png` |
| Modified | `src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher_round.png` |
| Modified | `src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher.png` |
| Modified | `src-tauri/icons/android/values/ic_launcher_background.xml` |
| Modified | `src-tauri/icons/icon.icns` |
| Modified | `src-tauri/icons/icon.ico` |
| Modified | `src-tauri/icons/icon.png` |
| Modified | `src-tauri/icons/ios/AppIcon-20x20@1x.png` |
| Modified | `src-tauri/icons/ios/AppIcon-20x20@2x-1.png` |
| Modified | `src-tauri/icons/ios/AppIcon-20x20@2x.png` |
| Modified | `src-tauri/icons/ios/AppIcon-20x20@3x.png` |
| Modified | `src-tauri/icons/ios/AppIcon-29x29@1x.png` |
| Modified | `src-tauri/icons/ios/AppIcon-29x29@2x-1.png` |
| Modified | `src-tauri/icons/ios/AppIcon-29x29@2x.png` |
| Modified | `src-tauri/icons/ios/AppIcon-29x29@3x.png` |
| Modified | `src-tauri/icons/ios/AppIcon-40x40@1x.png` |
| Modified | `src-tauri/icons/ios/AppIcon-40x40@2x-1.png` |
| Modified | `src-tauri/icons/ios/AppIcon-40x40@2x.png` |
| Modified | `src-tauri/icons/ios/AppIcon-40x40@3x.png` |
| Modified | `src-tauri/icons/ios/AppIcon-512@2x.png` |
| Modified | `src-tauri/icons/ios/AppIcon-60x60@2x.png` |
| Modified | `src-tauri/icons/ios/AppIcon-60x60@3x.png` |
| Modified | `src-tauri/icons/ios/AppIcon-76x76@1x.png` |
| Modified | `src-tauri/icons/ios/AppIcon-76x76@2x.png` |
| Modified | `src-tauri/icons/ios/AppIcon-83.5x83.5@2x.png` |
| Modified | `src-tauri/icons/Square107x107Logo.png` |
| Modified | `src-tauri/icons/Square142x142Logo.png` |
| Modified | `src-tauri/icons/Square150x150Logo.png` |
| Modified | `src-tauri/icons/Square284x284Logo.png` |
| Modified | `src-tauri/icons/Square30x30Logo.png` |
| Modified | `src-tauri/icons/Square310x310Logo.png` |
| Modified | `src-tauri/icons/Square44x44Logo.png` |
| Modified | `src-tauri/icons/Square71x71Logo.png` |
| Modified | `src-tauri/icons/Square89x89Logo.png` |
| Modified | `src-tauri/icons/StoreLogo.png` |
| Modified | `src-tauri/src/commands.rs` |
| Modified | `src-tauri/src/diagnostics.rs` |
| Modified | `src-tauri/src/main.rs` |
| Modified | `src-tauri/src/native_uninstall.rs` |
| Modified | `src-tauri/src/services.rs` |
| Modified | `src-tauri/src/uninstall_registry.rs` |
| Added | `src-tauri/src/update_policy.rs` |
| Modified | `src-tauri/src/updater.rs` |
| Modified | `src-tauri/tauri.conf.json` |
| Modified | `src/Dock.tsx` |
| Added | `src/i18n/native-uninstall.json` |
| Modified | `src/i18n/translations.ts` |
| Modified | `src/settings/AboutTab.tsx` |
| Modified | `src/settings/useSettings.ts` |
| Modified | `src/updater.ts` |
| Added | `tests/install-safety.test.mjs` |
| Added | `tests/install-safety.test.ps1` |
| Added | `tests/migration.test.mjs` |
| Added | `tests/updater-local.test.mjs` |
| Added | `tests/version-bump.test.mjs` |

## Current follow-up: Custom retry, F:\Oryvia-Source (2026-11-08)

The lists above describe historical migrations, including their original C: workspace. This follow-up modifies only:

- installer-app/src-tauri/src/uninstall.rs — validated retry pipeline and precise Main execution errors.
- installer-app/src-tauri/Cargo.toml — enable existing windows GDI APIs for monitor geometry; no dependency version change.
- taskbar_restore.rs (new) — minimal missing-Main taskbar recovery; keep Settings and retain recovery marker on failure.
- installer-app/src-tauri/src/uninstall_tests.rs (new) — actual Custom pipeline fixtures with persisted registry abstraction and locked file.
- scripts/package-source-audit.ps1 (new) — reproducible source packaging, all-entry and manifest verification.
- AUDIT_FIXES_REPORT.md, CHANGELOG_MIGRATION.md, migration/VALIDATION.md, migration/CHANGED_FILES.md, docs/ISSUE_LOG.md — current evidence and remaining E2E limits.
- migration/custom-uninstall-retry-review.json (generated) — changed inventory/protected SHA-256 comparison with pre-edit snapshot.
- SOURCE_MANIFEST.sha256 (regenerated) — current source package inventory, excluding its own hash.

No application source file removed. install_safety.rs, cleanup.ps1, ownership.ps1, NSIS hooks and native fallback are unchanged. Main/Installer UI, Main services/settings, icons, identity, license and notice are unchanged. The protected-file hash assertion is enforced by the packaging script; exact counts are in the generated review and adjacent package verification.
