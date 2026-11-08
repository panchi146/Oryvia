# Oryvia 1.0.0 — Technical Architecture & Foundation Notes

> **Notice:** This document serves as a technical architecture, licensing provenance, and migration reference for Oryvia. For the primary user introduction, features, installation, and build guide, see the official [README.md](../../README.md) (English) and [README.vi.md](../readme/README.vi.md) (Tiếng Việt).

This source is based on the user's Nectar Custom 1.4.1 foundation, with selected safety fixes adapted from Nectar 1.9.1 and ongoing hardening by Panchi146. Read [CHANGELOG_MIGRATION.md](../history/CHANGELOG_MIGRATION.md) and [PROJECT_SPEC.md](../development/PROJECT_SPEC.md) for architectural details.

Main app identity: `com.panchi146.oryvia`. Installer identity: `com.panchi146.oryvia.installer`. The chosen penguin artwork is preserved in `branding/oryvia-source.png`. See [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE) for attribution.

## Packaging & Updater Architecture

- **Fresh Installs:** Use the React/Tauri Custom Installer (`Oryvia-Setup-1.0.0.exe`), which features transactional installation, automatic rollback on write failures, and explicit per-user / all-users installation modes.
- **Portable Edition:** Provided as `oryvia-1.0.0-portable-windows-x64.zip`, running directly without modifying system registry or program folders.
- **Tauri Updater v2 & NSIS:** Retained for background/manual self-updates (`Oryvia_1.0.0_x64-setup.exe`). The official public key and endpoint are configured in `src-tauri/tauri.conf.json`, and review artifacts are signed using the maintainer's Minisign Ed25519 key. The live N → N+1 online update pipeline is planned for validation with the 1.0.1 release.
- **Authenticode Distinction:** Application binaries are currently unsigned with respect to commercial Microsoft Authenticode certificates (`NotSigned`).

Tests and reproduction commands: [migration/VALIDATION.md](../../migration/VALIDATION.md). Review/rollback patches: [migration/ROLLBACK.md](../../migration/ROLLBACK.md). Complete change inventory: [migration/CHANGED_FILES.md](../../migration/CHANGED_FILES.md). Audit fixes are documented in [AUDIT_FIXES_REPORT.md](../history/AUDIT_FIXES_REPORT.md) and [docs/ISSUE_LOG.md](../ISSUE_LOG.md).

## Identity, Provenance & License

Oryvia is maintained by **Panchi146** (`https://github.com/panchi146`), derived from **Nectar** by **kua8 and contributors** (`https://github.com/kua8/Nectar`), which in turn forked **Bloom** by **Sehajveer Singh (`sehaz`)** (`https://github.com/SehajveerSingh2005/bloom`).

Oryvia modifications are maintained by Panchi146 (dated 2026-11-08); existing upstream notices (`Copyright © 2026 Sehajveer Singh` in Bloom's `tauri.conf.json`, neutral upstream Nectar attribution by kua8 and contributors) remain intact. The covered work remains **GPL-3.0-only**, with no warranty as specified in [LICENSE](../../LICENSE). [NOTICE](../../NOTICE) records the full `Bloom → Nectar → Oryvia` provenance chain and the modification date (`2026-11-08`).

Settings → About footer displays `Made with ❤️ Panchi146`, where `Panchi146` opens `https://github.com/panchi146` in the external browser. Based on inspection of the Settings / About interface in Bloom 3.10.1 (`src/settings/AboutTab.tsx`), Nectar 1.9.4 (`src/settings/AboutTab.tsx`), and the Nectar Custom 1.4.1 baseline, that specific interface displayed an About box with version and author links rather than interactive legal notices. Under GPLv3 section 5(d), keeping the About footer concise while providing full [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE) across Portable, Custom Installer, and NSIS packages aligns with upstream practice for that interface.

For binary distribution, provide corresponding Oryvia source for the exact build, including modifications, build/install scripts and required assets, at the same download location with equivalent access (GPLv3 section 6(d)), or meet another applicable section 6 option. Upstream source alone is not sufficient. Preserve third-party notices; the user has confirmed holding the rights to use the supplied penguin artwork for Oryvia.

2026-11-08 footer follow-up: at user request, About displays `Made with ❤️ Panchi146`, with Panchi146 opening `https://github.com/panchi146` in the external browser. LICENSE, NOTICE and packaging license configuration remain unchanged.
