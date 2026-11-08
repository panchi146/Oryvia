# Validation — Audit Fixes 2026-11-08

Source-only validation on Windows; no live installation, uninstall, UAC prompt or release script was run. See ../AUDIT_FIXES_REPORT.md for confirmed defects, changes and residual risks.

## Reproduce

```powershell
npm ci --ignore-scripts
npm --prefix installer-app ci --ignore-scripts
node node_modules/typescript/bin/tsc --noEmit
node installer-app/node_modules/typescript/bin/tsc --noEmit -p installer-app/tsconfig.json
cargo check --locked --offline --manifest-path src-tauri/Cargo.toml
cargo check --locked --offline --manifest-path installer-app/src-tauri/Cargo.toml
cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --bin oryvia
cargo test --locked --offline --manifest-path installer-app/src-tauri/Cargo.toml
node --test tests/*.test.mjs
```

Remove --offline only if dependencies need downloading. The test wrapper invokes Windows PowerShell with tests/install-safety.test.ps1. That suite uses a dictionary registry abstraction and isolated temporary files, including real FileShare.None locks; it does not call the production registry adapter. The assembled-helper Rust test injects only the registry factory before launching the actual helper as a UTF-8 BOM script. The actual adapter was separately smoke-tested read-only, with no account Registry writes.

## Actual results

- TypeScript Main/Installer: PASS/PASS.
- Cargo check locked/offline Main/Installer: PASS/PASS.
- Rust Main: 33 passed, 1 existing network test ignored; Installer: 4 passed.
- Node: 12 passed; its one PowerShell wrapper contains 7 behavior cases (do not double count).
- PowerShell syntax: PASS for ownership.ps1, cleanup.ps1, release.ps1, build-payload.ps1 and test fixture.
- NSIS hooks: minimal fixture compilation PASS, 0 warning. Fixture was never executed; this is not a full bundle or Windows E2E result.
- Main App.tsx/CSS, Dock, services, HUD/media, all existing icons, LICENSE and NOTICE: preserved against pre-fix snapshot. useSettings/AboutTab only update state/messages; Installer heading now says cleanup scheduled.

The original three patches reproduce the initial Stage1 source. The fourth patch adds the audit fixes; updated handoff documents and manifests are tracked separately in CHANGED_FILES.md. No Git state was modified. Cargo reported incremental hard-link fallback-to-copy warnings; no clean/cache deletion was performed. Debug installer payload placeholder and node_modules junctions used in the test workspace are excluded from delivery.

## Not run

Live Registry mutation, native visual E2E, NSIS marker write-failure in a real installer, alternate-admin/UAC, signed updater artifact, restart after update, production bundle/release. Reparse guards are retained/strengthened; no live Windows reparse E2E PASS is claimed. Registry/filesystem changes are not one transaction across processes; recovery failures must be tested in a VM. A failed helper stays at its logged path in the install directory for retry, with Settings and foreign files preserved.

Updater endpoint remains [] and public key remains empty. Background checks exit without networking/loading; manual checks report unconfigured in English/Vietnamese. No key, PAT or private-repository endpoint was created. The release guard remains and release.ps1 was not run.

## Follow-up validation — Custom retry, 2026-11-08, F:\Oryvia-Source

Status: Fix Implemented / fixture validation only; NOT Verified Fixed. Historical commands/results above refer to the earlier audit. Current checks:

| Check | Actual current result |
|---|---|
| Main `bun run tsc --noEmit` | PASS |
| Installer `node node_modules/typescript/bin/tsc --noEmit -p installer-app/tsconfig.json` | PASS |
| Main `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml` | PASS |
| Installer `cargo check --locked --offline --manifest-path installer-app/src-tauri/Cargo.toml -j 4` | PASS |
| Main `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --bin oryvia -j 4` | 33 PASS, 1 existing network test ignored |
| Installer `cargo test --locked --offline --manifest-path installer-app/src-tauri/Cargo.toml -j 4` | 10 PASS in initial run; final rerun after style/geometry code review recorded below |
| `node --test tests/*.test.mjs` | 12 PASS, 0 skipped; includes existing 7 PowerShell fixture cases |
| PowerShell parser: ownership, cleanup, install-safety.test, package-source-audit | PASS |

The new Rust fixture calls the same uninstall_with pipeline used by Custom uninstall(), first with uninstall.exe locked and Main present, then again with Main missing after unlocking. Actual shared helper and ownership functions run against isolated files and a persisted CLIXML registry abstraction. Registration/marker remain after incomplete cleanup and finalization removes them on retry. Main launch and taskbar Win32 effects are injected; they do not alter the account's Explorer/taskbar. Existing PowerShell tests cover native retry preservation and finalizer failure. Separate marker tests verify restoration failure keeps taskbar_hidden.flag and Settings stays byte-identical.

An initial installer-local tsc command could not find installer-app/node_modules/typescript/bin/tsc; using the already available root compiler passed. No npm install or lockfile mutation was needed. Debug Cargo generated its documented empty payload.zip placeholder, which is excluded from delivery; it is not a production installer. Incremental Cargo reported a hard-link fallback-to-copy warning after the edit; no cache cleaning was performed.

Code review removed the unused in-process saved-rectangle branch from the fallback and places alpha restoration before clearing WS_EX_LAYERED (that API requires the style). A post-style check retains the marker if flags remain. This is a source review correction, not an experimentally observed Explorer failure. No Main geometry/state code was modified.

Reproduce package verification (creates a new ZIP; no release/build script):

```powershell
powershell -NoProfile -File scripts/package-source-audit.ps1 -OutputDirectory F:\ -BaselineManifest F:\Oryvia-Before-Custom-Uninstall-Retry-20261108-011834.zip.manifest.json
```

The script enforces protected-file hashes, regenerates SOURCE_MANIFEST.sha256, excludes build/dependency/payload/key/archive files and verifies every ZIP entry against source SHA-256 plus every manifest entry. The adjacent .verification.json contains exact counts/hashes and .sha256 identifies the ZIP. The manifest omits itself. Historical inventories/patches are not rewritten to pretend they describe this follow-up.

Not run: installed-app/visual Windows E2E, live registry writes, live taskbar restoration, UAC/alternate-admin, signed updater/release, production installer. Endpoint [] and empty pubkey unchanged. User/VM checks should cover Custom locked-uninstaller retry, native fallback after NSIS update, real parked taskbar and multi-monitor restoration, current-account versus alternate-admin profile behavior, Settings/foreign files and marker/registration retention on permission failures. No final verified-fixed claim is made.

Final rerun after the style/geometry review: Installer Cargo check PASS; Installer Rust **10 PASS, 0 FAIL**. Current Main check/test and TypeScript/Node results remain as listed. Protected-file and all-entry package verification results are in migration/custom-uninstall-retry-review.json and the ZIP-adjacent .verification.json. No live Windows E2E claim.

Packaging tooling correction: the first Windows PowerShell 5.1 run failed to resolve ZipArchive. Added explicit System.IO.Compression assembly loading. The failed first ZIP is retained and the next run chooses a timestamp; use only the final ZIP with matching .sha256 and PASS .verification.json.
