# Oryvia / Panchi146 branding and licensing review — 2026-11-08

Status: source changes implemented; Windows user verification pending. NOT Verified Fixed.

## Confirmed by source inspection

The app and installer already used Oryvia product names, com.panchi146.oryvia
identifiers and Oryvia executables. Cargo authors still listed only kua8;
About credited Pham Van Khai, installer preview paths still used Nectar,
and GitHub issue templates sent users to upstream. The uninstaller fallback
also queried the Nectar uninstall subkey. LICENSE and NOTICE already existed.

## Changes and exact files

- src-tauri/Cargo.toml; installer-app/src-tauri/Cargo.toml: Panchi146 author,
  with explicit upstream credit retained; GPL-3.0-only unchanged.
- package.json; installer-app/package.json: Panchi146 author metadata.
- src/i18n/translations.ts: Panchi146 branding and EN/VI legal text.
- src/settings/AboutTab.tsx: expandable offline full LICENSE and NOTICE;
  Vite raw imports include these texts in the shipped settings bundle.
- src-tauri/tauri.conf.json: display publisher Panchi146; bundle.licenseFile
  points to the unchanged GPL text, using the installed Tauri schema.
- src-tauri/src/uninstall_registry.rs; installer-app/src-tauri/src/commands.rs:
  publisher display string only, with registry namespaces unchanged.
- src-tauri/src/commands.rs: Oryvia uninstall subkey and old product messages.
- src-tauri/src/caldav.rs; src-tauri/src/ics.rs: Oryvia HTTP user agent only;
  Windows Credential Manager service identifiers ("Nectar CalDAV" / "Nectar Calendar Link") and stored credentials are untouched.
- installer-app/src/lib/mock.ts: Oryvia preview paths/executable.
- .github/ISSUE_TEMPLATE/bug_report.yml;
  .github/ISSUE_TEMPLATE/feature_request.yml;
  .github/ISSUE_TEMPLATE/uninstall_feedback.yml: Oryvia product wording;
  issue links made repository-relative rather than inventing a public URL.
- scripts/release.ps1: portable ZIP also includes LICENSE and NOTICE.
- NOTICE; ORYVIA_README.md: Panchi146 modification attribution/date,
  upstream rights and corresponding-source distribution requirements.
- README.md; PROJECT_SPEC.md; installer-app/README.md: prepend a current
  project pointer while retaining historical upstream content below it.
- migration/branding-license-before.json: pre-edit LICENSE SHA-256.
- docs/BRANDING_LICENSE_REVIEW.md; docs/ISSUE_LOG.md: review and actual checks.

Generated output: dist/ refreshed by bun run build; no production installer
or payload ZIP was rebuilt, no installed copy or live registry was changed.
This directory has no Git repository; git status could not produce a diff.
No commit, checkout, reset, publication or Git history mutation was performed.

## Licensing basis and remaining distribution work

Upstream: https://github.com/kua8/Nectar
Actual upstream license: https://raw.githubusercontent.com/kua8/Nectar/main/LICENSE
GPLv3 sections 4 and 5 require preserved notices, the same license for the
covered modified work, and prominent modification notices with a relevant date.
Section 6 covers corresponding source when distributing object code.

Oryvia may carry Panchi146 branding and copyright for Panchi146's changes;
this does not transfer upstream copyright. Existing GPL-3.0-only declarations
were preserved. LICENSE was not edited. Its SHA-256 remains:
230184f60bae2feaf244f10a8bac053c8ff33a183bcc365b4d8b876d2b7f4809

Before distributing binaries, supply the complete corresponding source for
that exact Oryvia build, including modified files, required assets and
build/install scripts, with equivalent access at the binary download location
under section 6(d), or meet another applicable section 6 option. Merely linking
to unmodified Nectar does not supply the source of modified Oryvia. A public
Oryvia source URL and actual release/source pairing were not verified. The
release script still does not create a corresponding-source archive; the
publisher must provide and verify it before distributing binary artifacts.
Third-party notices must be retained; supplied penguin artwork rights have
not been independently verified. No blanket release-compliance claim is made.
Updater and feedback endpoints remain unconfigured as before.

## Actual checks

- Main TypeScript: bun run tsc --noEmit PASS.
- Installer TypeScript: root compiler with installer-app/tsconfig.json PASS.
- Main production frontend: bun run build PASS; generated Settings JS contains
  full GPL and NOTICE text.
- Existing Node regression suite: 12 PASS, 0 FAIL, including Windows fixture.
- LICENSE before/after SHA-256: identical.
- Added bundle/NSIS keys match installed Tauri config schema.
- Rust cargo check --locked --offline: Main PASS; Installer PASS. Only
  incremental-cache hard-link fallback warnings (copying instead).

One attempted Python edit failed before execution because the Windows Store
python alias could not start; changes were applied with Node instead. An
initial placement of licenseFile under NSIS was corrected to bundle.licenseFile
against the installed schema before final verification.

## User verification and residual risks

Open Settings → About in English and Vietnamese; confirm Panchi146, open the
legal section, and scroll through upstream credit and the complete GPL text.
Check that the footer fits the settings window at normal and enlarged scaling.
Build/install in an isolated Windows VM, check publisher and install/uninstall
entry, then exercise About uninstall with the expected Oryvia installation.
Do not use the existing payload.zip as evidence of the newly changed source:
installer artifacts must be rebuilt before release.

No changes to Dynamic Island render/state, Dock layout, animation, click-through,
settings defaults, IPC names, localStorage keys or credential service names.
Technical Nectar symbols and preserved upstream documents are intentional.
The changed uninstall fallback key has not been verified on a live installation;
existing ownership/security and UAC limitations still require Windows E2E.


2026-11-08 footer follow-up: at user request, About now displays only
“Made with ❤️ Panchi146”, with Panchi146 opening https://github.com/panchi146
in the external browser. The expandable legal text and raw imports were
removed from About; earlier offline-About statements above describe the
previous implementation and are superseded. Based on inspection of the Settings /
About interface in Bloom 3.10.1 (`src/settings/AboutTab.tsx`), Nectar 1.9.4
(`src/settings/AboutTab.tsx`), and the Nectar Custom 1.4.1 baseline, that specific
interface displayed an About box with version and author links rather than
interactive legal notices. Under GPLv3 section 5(d) (“if the Program has interactive
interfaces that do not display Appropriate Legal Notices, your work need not make
them do so”), keeping the About footer concise while shipping LICENSE and NOTICE
in source, NSIS, and portable distributions aligns with upstream practice for that interface.

## 2026-11-08 Comprehensive Personalization Audit Pass

Additional remaining product-identity items identified and updated:
- `src/settings/DockTab.tsx`: Start button default icon preset updated from `/nectar.png` ("Nectar") to `/oryvia.png` ("Oryvia") to match `Dock.tsx` (`resolveStartIcon`).
- `src/settings/useSettings.ts` & `src/i18n/translations.ts`: Settings export/import dialog titles moved to bilingual i18n keys (`settings.about.export.dialogTitle`, `settings.about.import.dialogTitle` in EN/VI) and default export filename updated to `oryvia-settings.json`.
- `src/Overlay.tsx` & `tests/migration.test.mjs`: Updated the two splash/updater logo references (lines 988 and 1020) from `/nectar.png` (`alt="Nectar"`) to `/oryvia.png` (`alt="Oryvia"`) while keeping `migration/baseline-sha256.json` immutable and enforcing a byte-for-byte normalized baseline check in `tests/migration.test.mjs`.
- `installer/assets/header.bmp` (`150x57`) & `installer/assets/sidebar.bmp` (`164x314`): Rebuilt 24-bit NSIS bitmaps on `#0B0D13` background using `branding/oryvia-source.png` to replace the upstream mascot.
- `NOTICE`, `ORYVIA_README.md`, `src-tauri/Cargo.toml`, `installer-app/src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `installer-app/src-tauri/tauri.conf.json`, `src-tauri/src/drag_drop.rs`: Recorded the full `Bloom (Sehajveer Singh) → Nectar (kua8 and contributors) → Oryvia (Panchi146)` provenance chain, copyright notices (`Copyright © 2026 Sehajveer Singh` in Bloom `tauri.conf.json`), executable metadata, and OLE `IDropTarget` adaptation credit.
- `installer-app/src-tauri/src/commands.rs`, `install_safety.rs`, `installer/build/cleanup.ps1`, `installer/build/installer.nsh`: Custom Installer embeds and writes `LICENSE` and `NOTICE` upon installation via `install_safety::write_license_files`, NSIS installs `LICENSE` and `NOTICE` via `installer.nsh`, and cleanup routines remove them upon clean uninstall while preserving `settings.json` and foreign files.
- `src/settings/CalendarSyncPage.tsx`: Nextcloud ICS instructions (EN/VI) updated from "Nectar" to "Oryvia".
- `src/components/DragTestWindow.tsx` & `src/components/ShortcutsBar.tsx`: Dev drag-test window title updated to "Oryvia Drag Test (DEV)".
- `src-tauri/src/services.rs`: Window enumeration and foreground overlap filters now match both `"Oryvia"` / `"oryvia"` / `"Oryvia Dock"` and legacy `"Nectar"` / `"nectar"` / `"Nectar Dock"` so Oryvia's own windows are never misclassified as external apps.
- `index.html`, `dock.html`, `settings.html`, `calendar.html`, `overlay.html`, `installer-app/index.html`: Standardized favicons to `<link rel="icon" type="image/png" href="/oryvia.png" />` and updated `overlay.html` title to `Oryvia Overlay`.
- `src-tauri/Cargo.toml`: Added crate description `"Oryvia desktop island and dock for Windows, derived from Nectar"` (matching `installer-app/src-tauri/Cargo.toml`).
- `AGENTS.md`, `SETTINGS.md`, `SOURCE_HISTORY.md`: Added current-project header notes clarifying that the current project is Oryvia maintained by Panchi146 (`%APPDATA%\com.panchi146.oryvia\`) while retaining historical/upstream content and `nectar-*` technical keys.

Remaining asset / distribution notes:
- `public/nectar.png` is retained only as an unused legacy asset file on disk; active app, dock, overlay, and installer views all reference `/oryvia.png` or `icon.png`.
- Portable ZIP (`scripts/release.ps1`), Custom Installer (`installer-app`), and NSIS (`installer.nsh`) are all configured to supply both `LICENSE` and `NOTICE` to installed/extracted directories; `scripts/release.ps1` does not automatically emit a Corresponding Source archive alongside binary releases; when distributing binaries publicly, Corresponding Source for the exact Oryvia build must be provided under GPLv3 section 6.

Verification rerun:
- `bun run tsc --noEmit`: PASS
- `node node_modules/typescript/bin/tsc --noEmit -p installer-app/tsconfig.json`: PASS
- `bun run build`: PASS
- `cargo check --locked --offline` (Main & Installer): PASS
- `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --bin oryvia`: 33 PASS, 0 FAIL, 1 IGNORED
- `cargo test --locked --offline --manifest-path installer-app/src-tauri/Cargo.toml`: 10 PASS, 0 FAIL
- `node --test tests/*.test.mjs`: 12 PASS, 0 FAIL
Status remains: Implemented / source & test verified; pending user Windows E2E verification (NOT Verified Fixed).
