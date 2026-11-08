# Review and rollback

The three patches are grouped as uninstall safety, updater/release, then identity. They were applied to an isolated copy of the supplied Custom source and compared with the resulting source. No Git commits, branches or history changes were made automatically.

On a fresh extraction of the Custom ZIP, apply in order from that source root:

```powershell
git apply --ignore-space-change --ignore-whitespace PATH_TO_MIGRATION/01-uninstall-safety.patch
git apply --ignore-space-change --ignore-whitespace PATH_TO_MIGRATION/02-updater-release.patch
git apply --ignore-space-change --ignore-whitespace PATH_TO_MIGRATION/03-oryvia-branding.patch
```

The original ZIP is the complete untouched baseline. `baseline-sha256.json` records its source files; `safety-sha256.json` records the pre-identity checkpoint. Patches include binary icon changes. CRLF/LF differences require the options above.

For rollback, first copy the current source to a separate backup. Check each reverse patch before applying, in order 03 → 02 → 01, using `git apply --check -R --ignore-space-change --ignore-whitespace ...`. Stop on conflicts; do not force/reset unrelated changes. Handoff documents, migration inventories and the patches themselves are additional delivery files, not part of the application patches. Reversing safety patches restores known unsafe old uninstall behavior; use for review, not for deployment.

## Audit fixes checkpoint

Patch 04-audit-fixes.patch applies after 01–03, to the initial Stage1 source. Back up before applying/reversing. It contains the audit source/test changes; handoff reports, CHANGED_FILES and SOURCE_MANIFEST are generated separately. The pre-fix workspace was independently snapshotted; its hash is in AUDIT_FIXES_REPORT.md. Check reverse patch 04 before reversing earlier patches. No Git commits/state changes were made. Reverting restores known unsafe behavior; do not deploy a rollback without review.
