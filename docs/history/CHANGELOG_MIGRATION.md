# Oryvia Clean — Stage 1 + Audit Fixes

Cập nhật 2026-11-08: đã sửa startup ownership, retry cleanup/marker/registration, NSIS marker failure và trạng thái updater dùng cục bộ. Xem **AUDIT_FIXES_REPORT.md** để có bằng chứng, test và giới hạn mới nhất. Snapshot Stage1 được giữ riêng; patch 04 áp dụng sau các patch 01–03. Không triển khai production.

Nguồn nền: **Nectar Custom 1.4.1** do người dùng cung cấp. Nguồn tham khảo: **Nectar 1.9.1**. Nhận diện đích: **Oryvia 1.0.0**, `com.panchi146.oryvia`. Không lấy code từ Oryvia-Source cũ.

Đây là bản bàn giao source đã kiểm tra biên dịch và unit/regression tests; **chưa phải bản phát hành production và chưa xác nhận Windows install/update/uninstall E2E**.

## 1. Nguồn, cấu trúc và snapshot

Hai ZIP gốc được giữ nguyên:

| ZIP | SHA-256 |
|---|---|
| Nectar-Custom-Source-For-ChatGPT.zip | `e38f0ef464098a25285be06b45dc23de974d3d53b209de972cda591f1041a777` |
| Nectar-main_4.zip | `826353b8d069f00772385d034e3eb0a012aef7298bbdd59d0e0dd30b2a0a3172` |

Custom giải nén trực tiếp tại gốc; ZIP 1.9.1 có thư mục bao `Nectar-main`. Main App và Custom Installer là hai dự án React/Tauri riêng; NSIS vẫn là artifact của updater v2. Các manifest executable xác nhận Custom 1.4.1 và upstream 1.9.1. PROJECT_SPEC.md cũ tự ghi 1.4.3; đó là tài liệu kế thừa, không được dùng để suy ra version executable.

Đường dẫn `C:\Users\phamv\Oryvia-Clean` chưa tồn tại khi bắt đầu và đã được tạo mới. Có snapshot độc lập của baseline và bước an toàn trong vùng làm việc. `migration/baseline-sha256.json` và `migration/safety-sha256.json` lưu inventory tương ứng. Không sửa trạng thái Git của dự án cũ, không tạo commit tự động.

Ba nhóm thay đổi có patch riêng, thứ tự áp dụng:

1. `migration/01-uninstall-safety.patch`
2. `migration/02-updater-release.patch`
3. `migration/03-oryvia-branding.patch`

Đã áp dụng thử cả ba patch lên một bản sao sạch của Custom và so sánh kết quả với source đích: binary giống chính xác; text giống sau chuẩn hóa CRLF/LF. Các tài liệu bàn giao ngoài ba patch được liệt kê riêng trong `migration/CHANGED_FILES.md`. Hướng dẫn hoàn nguyên ở `migration/ROLLBACK.md`.

## 2. Audit theo chức năng và nguồn → đích

| Nguồn Nectar 1.9.1 | Đích Oryvia | Quyết định |
|---|---|---|
| `installer-app/src-tauri/src/uninstall.rs::APP_FILES`, `remove_app_files_command()` | `install_safety.rs::APP_FILES`, `remove_app_files_command()`; custom `uninstall()` gọi module chung | Lấy cách xóa theo allowlist; điều chỉnh quoting, chỉ dùng LiteralPath, không fallback cmd/RunOnce |
| `src-tauri/src/native_uninstall.rs::APP_FILES`, `remove_app_files_command()` | Cùng module chung; native `run()` gọi trước mọi thao tác gỡ | Cả hai đường gỡ dùng cùng một chính sách |
| `is_dedicated_install_dir()` ở hai file trên, cùng `remove_dir_command()` của native | Không nhập | Tên thư mục chứa “nectar” không chứng minh quyền sở hữu; không có nhánh xóa thư mục đệ quy |
| `src-tauri/src/updater.rs::is_installed_copy()`, guard trong `install()` và `run_startup_check()` | Các hàm tương ứng trong `src-tauri/src/updater.rs` | Lấy ý tưởng kiểm tra bản đã cài; siết thành release build + đường dẫn không qua reparse point + marker hợp lệ; chặn cả manual install trên Dev/Portable |
| `src-tauri/src/updater.rs::channel_updater()`, release API, channel cache | Không nhập | Đây là tính năng stable/prerelease mới; không cần cho nhiệm vụ và phụ thuộc endpoint Nectar |
| `installer/build/installer.nsh` | Hooks hiện có được chỉnh có mục tiêu | Hai ZIP có hooks tương đương về chức năng; không có bản sửa an toàn mới để chép nguyên. Loại backup TEMP cố định và heuristic dung lượng uninstaller |
| `installer-app/src-tauri/src/commands.rs::run_agent_hooks()` | Không nhập | Tính năng agent mới không thuộc phạm vi |
| `installer-app/src/App.tsx` | Giữ wizard Custom | Chênh lệch 1.9.1 chủ yếu bắt buộc feedback ít nhất 10 ký tự; không nhập thay đổi hành vi này |
| `installer-app/src/App.css` | Không đổi byte | Hai nguồn giống nhau về CSS khi bỏ khác biệt xuống dòng |
| `scripts/release.ps1`, `scripts/bump-version.mjs` | Sửa script Custom hiện có | Đính chính audit: Nectar 1.9.1 đã có SHA256SUMS.txt cho NSIS, portable và Custom Installer. Oryvia mở rộng checksums sang .sig/manifest/notes và thêm guard repository/endpoint/key/output cùng chặn publish; không gán cơ chế checksum hoàn toàn là mới |

Các phần có sẵn ở Custom và được giữ: updater v2, kiểm tra định kỳ 24 giờ, chờ release đủ 24 giờ trước auto-install, cache theo phiên bản, `CHECK_LOCK`, `UPDATE_BUSY`, tiến độ tải qua `auto-update-status`, `/ALLUSERS`/`/CURRENTUSER` và `/D=...`, tránh silent install khi thiếu elevation, `cleanup_before_exit()` và khởi động lại do plugin/NSIS thực hiện. Không viết Custom Updater hay Bootstrapper mới.

## 3. Chi tiết sửa an toàn

- Cleanup xóa executable đăng ký cuối, chỉ xóa marker sau executable và finalizer registry. Helper retry create-new được giữ khi lỗi và tự xóa đúng file của mình khi thành công. Uninstall chỉ nhắm `oryvia.exe`, `uninstall.exe`, `.install-scope`; không xóa thư mục cài đặt, kể cả thư mục có tên Oryvia/Nectar và kể cả khi rỗng. Không có `Remove-Item -Recurse`, `rd /s` hoặc RunOnce chứa lệnh cmd.
- Chuỗi PowerShell dùng literal đã escape dấu nháy đơn. Không chèn đường dẫn do người dùng chọn vào chuỗi log có nội suy. Từ chối đường dẫn tương đối, gốc ổ đĩa và ancestor có symlink/reparse point. Khi xóa, bỏ qua directory và reparse entry.
- Marker scope chỉ chấp nhận đúng `user` hoặc `all-users`; marker thiếu/hỏng không tự coi thành per-user. Không tự nhận portable là installed chỉ vì nằm trong Program Files/LocalAppData. Bản cũ thiếu marker phải xử lý thủ công; không đoán phạm vi.
- Fresh install kiểm tra scope trước khi ghi. Từ chối đổi scope tại chỗ và từ chối tên tệp xung đột khi chưa có marker. Lỗi copy uninstaller/ghi scope được trả về thay vì bị bỏ qua. Không có rollback giao dịch cho phần payload đã giải nén nếu bước sau thất bại.
- Payload chỉ được chứa đúng một executable tên `oryvia.exe`; từ chối archive nhiều entry, thư mục, symlink và tên không khớp. Đây là cấu trúc payload mà script release đang đóng gói; không nhập tùy tiện payload phụ của 1.9.1.
- Dừng tiến trình bằng executable path của bản đang gỡ, loại trừ PID hiện tại; bỏ taskkill theo tên ảnh áp dụng cho mọi bản cài. Lỗi truy vấn/dừng tiến trình làm dừng gỡ thay vì tiếp tục mù quáng.
- Shortcut chỉ xóa khi COM TargetPath trỏ đến executable đang gỡ. Chỉ xử lý Start Menu/Desktop trong scope đã chọn và các taskbar shortcut của tài khoản hiện tại có target khớp; không quét/xóa profile khác. Hiệu lực unpin trong cache Explorer vẫn cần E2E.
- Custom Uninstaller gọi nhánh `--restore-taskbar-on-uninstall` của Main App trước khi dọn; native giữ cơ chế phục hồi qua `taskbar_hidden.flag`. Không xóa Settings.
- Hai bên dùng cùng một uninstall subkey theo productName Oryvia, cùng publisher và `CurrentUser` DWORD; ghi đúng HKCU/HKLM theo scope. Không tạo một uninstall key thứ hai để thay thế NSIS. Startup registry cleanup của custom được bổ sung tương ứng native.
- Tính EstimatedSize chỉ cộng các tệp trong allowlist, không duyệt đệ quy thư mục dùng chung hay đếm dữ liệu ứng dụng khác.
- Sau NSIS update, không khôi phục Custom Uninstaller cũ từ TEMP. Hook đăng ký **Main App hiện tại với `--uninstall`** làm native uninstaller, xóa QuietUninstallString cũ và ghi lại marker scope. Main App vẫn có cơ chế heal registration. Fresh Install vẫn là Custom Installer React/Tauri; native fallback sau update vốn đã có trong kiến trúc Custom. Không dùng heuristic kích thước để quyết định giữ binary cũ.

## 4. Updater, build và phát hành

Tauri updater v2 giữ trách nhiệm so sánh semver và xác minh chữ ký trước cài đặt; không thêm comparator cho phép downgrade và không bỏ qua chữ ký. Đã đọc source dependency đã khóa `tauri-plugin-updater 2.10.1`: `check()` yêu cầu remote version lớn hơn current version, `download()` gọi `verify_signature()` trước khi chuyển sang install. `bundle.windows.allowDowngrades=false` bổ sung chặn downgrade ở NSIS. Chưa thử tải artifact thật với chữ ký đúng/sai.

Endpoint và public key Nectar đã được bỏ khỏi cấu hình chạy. Guard yêu cầu endpoint HTTPS và public key không rỗng, từ chối URL Nectar. **Updater hiện chưa thể tải/cài bản phát hành Oryvia cho đến khi cấu hình endpoint/public key riêng.** Đây là trạng thái chủ ý; không tạo khóa ký mới và không đọc/xuất private key. UI Dynamic Island/Settings vẫn dùng luồng hiện có; không thêm UI kênh cập nhật.

Script release yêu cầu repository rõ ràng, chặn `kua8/Nectar`, kiểm tra cấu hình updater và version trước build; không ghi đè thư mục release có sẵn, không push hoặc gọi GitHub Release. Workflow đổi thành validation chỉ có quyền read. Giữ pipeline: main executable → NSIS + `.sig` cho updater; main executable → payload ZIP → Custom Installer cho fresh install. Copy `.sig` ra cùng artifact, ghi `latest.json` với `windows-x86_64` và `windows-x86_64-nsis`, tạo `SHA256SUMS.txt`. DryRun là tham số tương thích; script hiện chỉ chuẩn bị artifact cục bộ và không publish dù giá trị này ra sao.

Version bumper sửa xử lý Cargo.lock CRLF và báo lỗi nếu không tìm thấy package; đồng bộ Main App và Installer. Payload builder dừng khi main build thất bại; release build của Installer từ chối payload thiếu/rỗng. Cargo check debug vẫn được phép tạo placeholder để kiểm tra compile; placeholder không đưa vào ZIP bàn giao.

Tham khảo cấu trúc hook/UNINSTKEY và thứ tự registration/postinstall từ [template Tauri CLI 2.11.4 đã khóa](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi). Đây là tham khảo template, không phải bằng chứng E2E của binary đóng gói.

## 5. Bảo toàn Custom và bước nhận diện

Đã đối chiếu hash với ZIP gốc: `src/App.tsx`, `src/App.css`, `src/Overlay.tsx`, `src/Overlay.css`, `src/theme.ts`, `installer-app/src/App.css` **không đổi byte**. Control Center vẫn 580 × 312; hover delay, click mở tức thì, loại trừ cuộn `.cal-scroll`/`.shortcuts-scroll-area`, animation, Audio Visualizer và cơ chế cursor polling/click-through giữ nguyên. `services.rs` chỉ đổi một chuỗi nhận dạng executable để Dock tiếp tục lọc chính app sau đổi tên. Dock chỉ đổi nhận dạng executable/tên app và đường dẫn ảnh logo. Không thay sizing/animation. Riêng useSettings/AboutTab có thay đổi có mục tiêu để hiển thị trạng thái updater chưa cấu hình và giải phóng loading; không thay defaults hoặc layout.

Tên, version, identifiers, executable, mutex/event, registry, thư mục mặc định, tray label, giá trị dịch EN/VI và logo được đổi trong bước riêng. Giữ tên IPC, CSS variables/classes và các key `nectar-*` để tránh làm hỏng Settings. Namespace dữ liệu Oryvia mới tách khỏi Nectar; không tự sao chép dữ liệu cá nhân từ bản cài cũ. Settings của Oryvia không bị xóa trong update/uninstall.

Người dùng đã chọn **ảnh chim cánh cụt vừa đính kèm**. Đã xuất icon bằng Tauri icon CLI; không tạo tranh/icon khác. Nguồn ảnh giữ ở `branding/oryvia-source.png`; icons Windows/macOS/mobile và ảnh dùng trong About/Dock/Installer tương ứng. LICENSE GPL-3.0-only giữ nguyên byte; thêm NOTICE ghi công Nectar/kua8. README/PROJECT_SPEC/SOURCE_HISTORY gốc được giữ làm tài liệu upstream/lịch sử, không phải mô tả nhận diện production mới.

Feedback form cũ không được gửi tới repo Nectar. Nút Send feedback hiện disabled do chưa có Oryvia feedback endpoint; bố cục không đổi. Cần cấu hình endpoint riêng nếu muốn bật lại. Không tự đặt URL production hoặc địa chỉ nhận thư.

## 6. Kết quả kiểm thử

| Hạng mục | Kết quả thực tế |
|---|---|
| TypeScript Main App `tsc --noEmit` | PASS |
| TypeScript Installer `tsc --noEmit` | PASS |
| Cargo check Main App, locked/offline | PASS |
| Cargo check Installer, locked/offline | PASS |
| Cargo test Main App, binary oryvia | **33 PASS, 0 FAIL, 1 IGNORED** (`real_public_feeds` sẵn có cần mạng) |
| Cargo test Installer | **4 PASS, 0 FAIL** |
| Node migration/version/ownership/updater regression tests | **12 PASS, 0 FAIL**; gồm wrapper 7 PowerShell behavior cases |
| Xóa tệp trong sandbox Windows, đường dẫn có `'`, `&`, `$()`, `[]` | PASS; foreign executable và settings.json còn nguyên; thư mục vẫn tồn tại |
| Parser PowerShell cho release/build-payload scripts | PASS |
| NSIS hooks trong compile fixture tối giản | PASS cú pháp; 0 warning ở fixture audit fixes; chưa full bundle/E2E |
| Áp dụng lại 3 patch trên source sạch | PASS theo nội dung; text so sánh có chuẩn hóa CRLF/LF |
| Installer 620 × 560 / wizard / CSS / animation | PASS đối chiếu cấu hình/source; chưa chạy visual/native E2E |
| Chữ ký artifact, UAC, registry thật, restart sau update | NOT RUN |

Có cảnh báo môi trường Cargo incremental hard-link phải chuyển sang copy; các command vẫn exit 0. Lượt cài npm đầu trong sandbox bị lỗi DNS/npm exit handler; đã cài lại thành công với quyền network cần thiết, giữ lockfile. Không coi lỗi môi trường ban đầu là một lỗi source đã sửa.

## 7. Giới hạn và kiểm thử Windows còn lại

- Chưa cài/gỡ trên tài khoản Windows chính; chưa tạo production installer; chưa push/merge/tạo Release; không sửa Oryvia-Source, ZIP gốc hay backup cũ; không cargo clean/xóa Cargo cache.
- Phải chạy ma trận trong VM/tài khoản test: per-user/all-users, UAC chấp thuận/hủy/alternate-admin, thư mục riêng/dùng chung, Unicode/spaces, file bị khóa, marker hỏng, junction/symlink; kiểm tra foreign files và settings trước/sau.
- Phải chạy fresh Custom Installer → NSIS update đã ký → restart → native uninstall; xác nhận chỉ một entry cho cùng scope, đúng InstallLocation, version, shortcut và dữ liệu settings.
- Phải thử downgrade/same-version/invalid signature, mất mạng, hai yêu cầu cập nhật, UAC bị hủy và app shutdown giữa download/install. Chữ ký do plugin xử lý nhưng chưa được kiểm chứng bằng artifact Oryvia thực.
- Phạm vi/ownership dựa trên marker hợp lệ và allowlist của payload đã kiểm soát; không phải bằng chứng mật mã về provenance của từng file. Không claim chống attacker có quyền ghi vào thư mục cài. Vẫn có khoảng thời gian giữa validate path và delayed cleanup; không claim chống junction swap có chủ ý.
- Cleanup chạy sau khi uninstaller thoát; UI hiện chỉ báo đã lên lịch, không báo gỡ hoàn tất. Marker, registration và executable đăng ký được giữ khi tệp kia khóa; helper retry được giữ nếu finalization lỗi. File còn khóa được ghi vào `%TEMP%\oryvia-uninstall-pending.log`; không có RunOnce tự xóa toàn thư mục. Registry/shortcut cleanup còn có thao tác best-effort; cần thử lỗi quyền thực tế.
- Alternate-admin UAC có thể trỏ HKCU/APPDATA tới tài khoản admin thay vì người khởi tạo. Không quét/xóa profile khác. Cần E2E để chốt startup/taskbar/shortcut của người dùng gốc; Explorer có thể còn cache pin.
- Giữ Settings luôn; không bổ sung lựa chọn xóa Settings mới. Bản cài không có main executable có thể cần dọn thủ công vì Custom Uninstaller dùng main để phục hồi taskbar.
- Updater và feedback endpoint chưa cấu hình; bản source này chưa đủ điều kiện phát hành cho người dùng cuối. Không tạo khóa mới trong nhiệm vụ.

Danh sách đầy đủ file thay đổi: **`migration/CHANGED_FILES.md`**. Kiểm tra môi trường và lệnh tái lập: **`migration/VALIDATION.md`**. Hash/package verification của ZIP nằm ở tệp bàn giao bên cạnh ZIP để tránh vòng lặp hash tự tham chiếu.

## 2026-11-08 follow-up — Custom uninstall retry (current F:\Oryvia-Source)

Fix Implemented / fixture validated; user Windows E2E pending. The previous missing-Main/manual-cleanup limitation is superseded: Custom entry-point logic validates path, marker scope and registry ownership, then restores through Main if present or current-user marker-based Win32 recovery only if Main is confirmed missing. Other execution failures and nonzero exit status stop clearly. taskbar_hidden.flag is retained on fallback restoration failure; Settings are never changed. Existing native fallback, cleanup order, helper retention and finalizer/marker policy remain unchanged.

Added regression retries the actual Custom pipeline after a real locked uninstall.exe caused Main removal, with persisted isolated registration and actual assembled cleanup helper. Installer Rust 10 PASS; Node 12 PASS (including existing 7 PowerShell cases); TypeScript Main/Installer PASS. See migration/VALIDATION.md for final Cargo results and AUDIT_FIXES_REPORT.md for test seams/limitations. Protected frontend, main backend, resources, configuration identity and cleanup/native paths are hashed against the pre-edit snapshot in migration/custom-uninstall-retry-review.json. Source package tooling verifies every entry and manifest; no production release/updater configuration was changed.
