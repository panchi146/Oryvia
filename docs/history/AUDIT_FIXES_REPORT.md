# Oryvia Clean — Stage1 Fixes Audit (2026-11-08)

Phạm vi: sửa source Oryvia 1.0.0 hiện có, giữ React/Tauri Custom Installer và updater v2 + NSIS. Không triển khai cập nhật production. Trạng thái: **Partially Resolved / source checks passed; Windows E2E còn chờ**.

## Snapshot và nguồn đối chiếu

Đã đọc AGENTS.md, PROJECT_SPEC.md, các mục liên quan trong ISSUE_LOG, CHANGELOG_MIGRATION và VALIDATION trước khi sửa; kiểm tra trực tiếp các file nguồn. Snapshot độc lập trước sửa: `work/fixes-20261108/Oryvia-Clean-before-fixes.zip` trong vùng làm việc của chat; SHA-256 `08ba7d8b3760abd4fe5cf5bb59726b3c79efbb5d3c9673fd6e2380299f2c9f48`. Không ghi đè backup hay ZIP gốc. ZIP Stage1 cũ trên Desktop vẫn có SHA-256 `76afb3df91e05e071dd8250d2ba2180450457a6886ea812d6495bcf072f62a32`.

Các patch 01–03 là lịch sử Stage1 ban đầu; patch 04 bổ sung sửa audit. Báo cáo, inventory và manifest được cập nhật riêng, không phải thay đổi Git state. Không commit, push, merge hoặc chạy release script.

## Lỗi đã xác nhận và sửa

| Lỗi thực tế trước sửa | File/hàm đã sửa và kết quả |
|---|---|
| Native dùng `wide("nectar")`; custom xóa Run theo tên `oryvia` mà không kiểm tra đích | `main.rs` dùng autostart Builder với `install_safety::STARTUP_NAME = "Oryvia"`; `ownership.ps1::Remove-OryviaOwnedStartup()` chỉ xóa Run khi command trỏ đúng `oryvia.exe` trong bản đang gỡ; re-read trước xóa. StartupApproved chỉ xóa sau khi có proof từ Run. Không thử nhiều tên, không chạm Nectar/profile khác. |
| Marker nằm chung vòng xóa với hai executable | `cleanup.ps1::Invoke-OryviaFileCleanup()` giữ marker tới khi cả hai executable đã biến mất và finalizer registry thành công. Executable mà registration trỏ tới được xóa cuối; nếu tệp kia bị khóa thì giữ executable đăng ký để thử lại. |
| Native/custom unregister trước khi spawn; spawn thất bại làm mất đường gỡ | Không unregister trong parent nữa. `schedule_cleanup_with_program()` tạo helper mới bằng create-new trong thư mục cài, có UTF-8 BOM, không đặt script nâng quyền trong TEMP dùng chung. Helper chờ parent thoát và mới dọn. Nếu không spawn được, registration/marker/executable còn nguyên và helper được giữ. |
| Chỉ còn marker/log khi finalizer registry lỗi sau xóa executable | Helper `.oryvia-uninstall-retry-<pid>-<nonce>.ps1` giữ lại khi thất bại; log ghi đường dẫn để thử lại kể cả khi executable không còn. Khi thành công helper chỉ xóa đúng file của chính nó. Không quét/xóa các helper cũ theo wildcard. |
| Fresh/heal ghi đè entry cùng scope của đường dẫn khác; native/custom xóa key không xác nhận ownership | `ownership.ps1::Assert-OryviaRegistrationWritable()`, `Test-OryviaRegistrationOwned()`, `Remove-OryviaOwnedRegistration()` dùng cùng adapter. Fresh kiểm tra trước payload và trước write; heal kiểm tra trước repair/write, log và thông báo native EN/VI khi từ chối. Helper kiểm tra lại trước mỗi vòng xóa và trước xóa registry. Cả InstallLocation và executable của UninstallString phải khớp. |
| NSIS không kiểm tra FileOpen/FileWrite/FileClose marker | `NSIS_HOOK_PREINSTALL` chạy cùng ownership guard trước khi template ghi entry; chặn marker sai scope và pending-file xung đột. POSTINSTALL ghi file mới, kiểm tra mở/ghi/đóng/đọc lại/đóng, rồi MoveFileExW thay thế cùng thư mục. Chỉ đăng ký native fallback và bỏ NSIS uninstaller sau khi marker đã xác minh. Failure: SetErrorLevel + Abort; giữ marker cũ hợp lệ, hoặc dọn entry vừa ghi chỉ khi ownership đúng và không còn marker hợp lệ. |
| Manual check Portable/Dev trả “up-to-date” trước khi phát hiện updater chưa cấu hình; một số nhánh done không giải phóng checking | `update_policy.rs`, `updater.rs` kiểm tra cấu hình trước installed guard. Background thiếu cấu hình trả `configured:false`/done trước khi vào checking, không mạng/không log lỗi lặp. Manual trả code `updater_not_configured`; `src/updater.ts`, useSettings và AboutTab ánh xạ sang trạng thái “Chưa cấu hình cập nhật”/“Updates are not configured”. Done giải phóng cả checking/downloading/installing. |
| Workflow bỏ version-bump test và Cargo tests | Workflow validation quyền `contents: read` chạy toàn bộ `tests/*.test.mjs` và Rust tests cả hai dự án; không thêm quyền publish. |
| Changelog gán sai nguồn SHA256SUMS | Đã xác nhận Nectar 1.9.1 **có** tạo SHA256SUMS.txt trong scripts/release.ps1 cho NSIS/portable/custom installer. Oryvia giữ ý tưởng đó và mở rộng phạm vi sang `.sig`, manifest/notes cùng guard repo/endpoint/key/output; phần checksum không được gán hoàn toàn là cơ chế mới của Oryvia. |

## Startup và registry: bằng chứng, chính sách

Source dependency đã khóa `tauri-plugin-autostart 2.5.1` lấy app name từ `app.package_info().name` nếu không override. Tauri codegen 2.6.3 lấy PackageInfo.name từ productName, hiện là **Oryvia**; auto-launch 0.5.0 ghi đúng tên này vào HKCU Run và StartupApproved. Việc override Builder cùng hằng số chỉ làm hợp đồng rõ ràng, không đoán tên cũ. auto-launch ở cấu hình args rỗng hiện ghi raw full path; matcher hỗ trợ exact raw path này và quoted executable có arguments, không dùng prefix match.

Ownership dùng GetFullPath, chuẩn hóa slash, dấu nháy bao InstallLocation, `.`/`..`, dạng extended-path thông thường và so sánh không phân biệt hoa/thường. UninstallString phải nhắm chính `oryvia.exe` hoặc `uninstall.exe` trong directory đã xác minh; tên sản phẩm/marker riêng lẻ không đủ. Dữ liệu key thiếu/không rõ hoặc registry read lỗi dẫn tới từ chối, không tự nhận là key trống. Product install-location key chỉ bị xóa nếu default value cũng thuộc đường dẫn này. Subkey vẫn duy nhất: `Software\Microsoft\Windows\CurrentVersion\Uninstall\Oryvia` trong đúng HKCU/HKLM scope; adapter dùng Registry64, không duyệt các profile khác.

Không mở rộng thành trình quản lý nhiều bản cài. Đường dẫn tương đương qua 8.3/file-id không được tự đoán; trường hợp không xác minh được sẽ bị từ chối an toàn. Đây là compare-before-mutate, không phải giao dịch nguyên tử xuyên mọi Registry/filesystem/process; không tuyên bố chống attacker có quyền ghi vào thư mục hoặc thắng race giữa các tiến trình.

## NSIS: template đúng phiên bản và giới hạn

Main CLI trong package-lock là **2.11.4**. Đã tham khảo [template tag tauri-cli-v2.11.4](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi), đặc biệt việc ghi registration trước POSTINSTALL và UNINSTKEY theo PRODUCTNAME. Vì vậy failure branch không giả định registration chưa tồn tại; nó gọi cùng ownership-checked recovery.

Fixture NSIS tối giản đã compile với hooks thật và script ownership được nhúng: **PASS cú pháp, 0 warning**. Không chạy fixture, không build full bundle, không thử write-failure trên NSIS thật. Khi quyền registry khiến recovery thất bại, installer vẫn Abort và hiển thị chi tiết; không thể khẳng định rollback toàn bộ giao dịch đã thành công. Cần VM để xác minh các failure stage thực tế và trạng thái Add/Remove Programs.

## Kiểm thử đã chạy

| Kiểm tra | Kết quả |
|---|---|
| TypeScript Main + Installer | PASS / PASS |
| Cargo check --locked --offline Main + Installer | PASS / PASS |
| Cargo test Main, binary oryvia | 33 PASS, 0 FAIL, 1 IGNORED (`real_public_feeds` sẵn có cần mạng) |
| Cargo test Installer | 4 PASS, 0 FAIL |
| Node toàn bộ tests/*.test.mjs | 12 PASS, 0 FAIL |
| PowerShell behavior suite qua Windows PowerShell | 7 case PASS, nằm trong wrapper Node; không cộng trùng với 12 tests Node |
| PowerShell parser | PASS cho ownership, cleanup, release, build-payload và fixture test |
| Registry adapter smoke | PASS read-only; không ghi Registry tài khoản thật |
| NSIS fixture | PASS cú pháp, 0 warning; chưa full bundle/E2E |

Behavior suite dùng Registry abstraction/in-memory store và thư mục tạm: startup Oryvia đúng/sai đích, giữ Nectar và orphan approval; registration A/B cả hai scope mô phỏng; path Unicode/spaces/quotes/case/slash; executable khóa thật bằng FileShare.None; giữ marker, registered retry executable và registration rồi retry; marker thiếu/hỏng/sai scope; lỗi finalizer; marker-failure recovery không xóa key foreign. Rust tests thử helper không tồn tại và chạy helper ghép đầy đủ với store factory giả lập (không gọi Registry thật), gồm UTF-8 Unicode path và tự xóa đúng helper sau thành công. Node thử các transition updater và thông báo EN/VI, cùng version-bump CRLF.

Đã gặp hai lỗi test trong quá trình triển khai: closure fixture PowerShell không nhìn thấy helper function, và test source-string cũ vẫn tìm guard ở Rust sau khi chuyển guard sang script chung. Đã sửa fixture và đường kiểm tra, không bỏ các guard. Các bộ kiểm thử cuối đều chạy lại thành công. Có cảnh báo môi trường Cargo hard-link chuyển sang copy; không cargo clean/xóa cache. Placeholder payload chỉ dùng debug compile, không đưa vào source ZIP. Junction node_modules chỉ dùng ở thư mục thử nghiệm, bị loại khỏi bàn giao.

## Phần giữ nguyên

Không đổi version/identifier/icon/LICENSE/NOTICE. Main App.tsx/App.css, toàn bộ layout/animation Dynamic Island, services.rs/cursor polling, Dock, HUD/Media và CSS Installer giữ nguyên hash so với snapshot trước sửa. Control Center 580 × 312; wizard 620 × 560, scope/folder/shortcut options giữ nguyên. Installer App.tsx chỉ đổi heading hoàn tất sang “File cleanup scheduled”; useSettings/AboutTab chỉ đổi trạng thái/thông báo updater, không đổi defaults hoặc bố cục. Các thông báo native mới dùng cùng JSON EN/VI được nhập vào hệ thống i18n và đọc language key `nectar-language` khi chưa có webview.

## Windows/UAC còn phải kiểm chứng

- Chưa cài/gỡ trên tài khoản chính, chưa live Registry mutation, chưa UAC/alternate-admin E2E, chưa signed update/restart test. Chưa đánh dấu Verified Fixed.
- Alternate-admin có thể chuyển HKCU/APPDATA sang tài khoản admin; không quét profile khác để suy đoán người khởi tạo. Startup/approval của tài khoản gốc cần VM xác minh; sai ownership thì giữ nguyên.
- Phải thử toàn tuyến Custom Install → NSIS update → native fallback; Per-user/All-users; UAC hủy/chấp thuận; khóa main/uninstaller; mất quyền marker/registry; reparse/junction và Explorer pin cache. Các guard reparse có trong code; không coi là Windows reparse E2E PASS.
- Helper retry lưu trong directory cài với ACL kế thừa, create-new không ghi đè; directory dùng chung phải có ACL phù hợp. Retry all-users cần đúng quyền admin. Nếu marker bị thay/hỏng hoặc helper bị sửa, không chạy mù quáng; kiểm tra log/snapshot. Thư mục và helper thất bại cũ không bị xóa hàng loạt.
- Endpoint vẫn `[]`, public key vẫn `""`; không tạo key/PAT/URL cho repo private. Release script guard giữ nguyên và **không được chạy trong nhiệm vụ này**.

## Nếu sau này muốn cập nhật qua repo private

Cần tác vụ riêng để cung cấp repo/chiến lược truy cập artifact, chuẩn bị signing key của Oryvia trong kho bí mật CI và chỉ nhúng public key vào app. Không nhúng PAT dài hạn vào source/executable; chọn dịch vụ phân phối có xác thực/credential ngắn hạn hoặc luồng tải thủ công phù hợp với repo private. Sau đó mới cấu hình endpoint HTTPS, manifest, NSIS + signature và kiểm thử toàn tuyến trên VM trước khi mở auto-install. Không thực hiện các bước production đó ở đây.

Xem `migration/CHANGED_FILES.md` để có danh sách file đầy đủ; `migration/VALIDATION.md` để tái lập. PACKAGE_VERIFICATION/DELIVERY_LOCATIONS và SHA-256 của ZIP nằm ngoài ZIP, tránh vòng lặp tự tham chiếu.

## Follow-up: Custom Uninstaller retry after Main removal — 2026-11-08

This section supersedes the earlier missing-Main/manual-recovery limitation. Status: Fix Implemented / fixture-validated; Windows E2E and user verification pending. NOT Verified Fixed.

### Confirmed defect and repair

`installer-app/src-tauri/src/uninstall.rs::uninstall` previously unconditionally launched `oryvia.exe --restore-taskbar-on-uninstall`. The cleanup helper can correctly preserve a locked registered Custom `uninstall.exe` while deleting Main, leaving that entry point unable to get past restoration on retry. The old code also accepted a nonzero Main exit status.

The actual Custom command now calls a small injectable `uninstall_with` pipeline: validate absolute non-reparse directory, exact marker/requested scope and registration; stop the owned Main process; restore; remove owned shortcuts; schedule the same helper. `restore_with` uses symlink_metadata rather than exists(): only confirmed NotFound permits the fallback. Access errors, invalid/reparse Main files, nonzero exit status and launch failure while Main still exists are explicit failures. A launch-time NotFound is rechecked to distinguish a disappearing executable from a missing loader/DLL.

`taskbar_restore.rs` adapts the minimum Main recovery geometry (`monitor_rects`, `taskbar_monitor`, `restore_tray_position`) and its uninstall policy: show always-on-top, clear lingering transparent/layered styles, move a parked taskbar back onto its monitor and notify Explorer. It uses only the current account's plain `taskbar_hidden.flag`; no Settings writes, profile enumeration or deletion. It verifies visibility/position and retains the flag on restoration failure. Marker filesystem protocol is tested with an injected shell effect; live Explorer restoration is NOT tested here. The new GDI feature uses the existing windows dependency; no new dependency or version/lockfile change.

`install_safety.rs`, cleanup.ps1, ownership.ps1, native_uninstall.rs and NSIS hooks remain unchanged. Registered executable-last cleanup continues to protect native fallback if the other executable is locked. Marker deletion remains after both executable paths disappear and finalizer succeeds; helper-spawn errors preserve retry state. UI still reports scheduling only. No recursive deletion, shell fallback or RunOnce was added.

### Actual checks and limits

- Main and Installer TypeScript PASS. Main: `bun run tsc --noEmit`; Installer: `node node_modules/typescript/bin/tsc --noEmit -p installer-app/tsconfig.json`. The initial installer-local compiler command failed because installer-app/node_modules is absent; root compiler resolves the existing shared dependencies successfully.
- Installer Rust: **10 PASS**, including the required two-pass Custom entry-pipeline regression with a real Windows FileShare.None lock on uninstall.exe. Fixture registration persists in an isolated CLIXML store between processes, uses the actual ownership functions and assembled cleanup helper, and is checked retained after the first attempt and removed after retry. It does not substitute a direct cleanup call for retrying the Custom pipeline.
- Other new cases: existing Main path, nonzero restore/permission/NotFound-with-present-Main errors, Main disappearing during launch, missing/invalid/mismatched scope, foreign registration rejection before restore, helper spawn failure with both present and missing Main, taskbar marker retention on failure, Settings/foreign file preservation.
- Node: **12 PASS**, including the existing PowerShell wrapper's **7 behavior cases**. Existing native-registration locked-uninstaller and finalizer-failure cases remain covered. Cargo check Main PASS; remaining current results are recorded in VALIDATION.md after completion.
- No production installer, installed-account mutation, live taskbar alteration, UAC, alternate-admin or full Windows installation/uninstallation E2E was run. Main launch/shell operations are injected in fixture tests. All-users under alternate credentials still operates in the elevated account's APPDATA/HKCU; no guess or cross-profile recovery was added. Multi-monitor/Explorer policy needs VM/user checks.

### Delivery and preservation

Current workspace is F:\Oryvia-Source; it contains Main, installer-app, installer, scripts and tests, but has no .git directory. Read-only `git status --short` returned not-a-repository; no Git mutation was attempted. Pre-edit source snapshot: F:\Oryvia-Before-Custom-Uninstall-Retry-20261108-011834.zip with adjacent per-file baseline manifest; no prior backup overwritten.

`migration/custom-uninstall-retry-review.json` records SHA-256 equality of protected current files against that pre-edit snapshot. `scripts/package-source-audit.ps1` builds a create-new source ZIP, excludes dependencies/builds/generated payloads/archives/key files, generates SOURCE_MANIFEST.sha256, then reopens and hashes EVERY ZIP entry and validates the complete manifest. Adjacent .sha256 and .verification.json report exact package hashes/counts. SOURCE_MANIFEST excludes its own hash to avoid self-reference. Historical migration inventories remain historical.

VM/user follow-up: Custom per-user/all-users uninstall with visible/parked taskbars and secondary monitor; repeat with locked uninstaller then unlock/reopen; verify Settings/foreign files, registration and marker before/after; test UAC cancel/alternate-admin and Explorer unavailable. Also verify native uninstall after NSIS update still works. Do not label Verified Fixed before corresponding user confirmation.

Final follow-up compilation: Cargo check Main/Installer PASS/PASS; Rust Main 33 PASS + 1 existing network test ignored; Rust Installer final rerun 10 PASS/0 FAIL after style/geometry review. Both TypeScript checks and all 12 Node tests PASS. PowerShell parser 4/4 PASS. Status remains pending user/VM Windows E2E. The only Cargo warning in the final rerun is incremental hard-link fallback to file copying.
