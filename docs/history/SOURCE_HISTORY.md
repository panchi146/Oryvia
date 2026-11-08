> **Current project: Oryvia, maintained by Panchi146.** This historical baseline audit is retained for provenance; see [Oryvia documentation](../architecture/ORYVIA_README.md), [CHANGELOG_MIGRATION.md](CHANGELOG_MIGRATION.md), and [NOTICE](../../NOTICE) for the current identity and licensing.

# NECTAR CUSTOM SOURCE HISTORY & AUDIT REPORT FOR CHATGPT
> **Mục đích tài liệu:** Báo cáo chi tiết nguồn gốc mã nguồn, đối chiếu tính năng và kiểm toán kỹ thuật dành cho ChatGPT / AI Assistant để làm căn cứ tái khởi động dự án **Oryvia** từ nền tảng Nectar sạch, ổn định và đầy đủ tính năng tùy biến nhất.
> **Ngày đóng gói:** 07/11/2026  
> **Người thực hiện:** Antigravity (Google DeepMind)  
> **File lưu trữ xuất ra:** `C:\Users\phamv\Desktop\Nectar-Custom-Source-For-ChatGPT.zip`

---

## 1. Bản nguồn được chọn & Căn cứ xác minh (Selected Baseline)

- **Phiên bản được chọn:** `Nectar Backup 25 (Stable Control Center & Settings Improvements)`
- **Mã commit Git:** `4b937bc569a71952b263bca0d5e22c25ea76bd66` (nhánh `backup-25`)
- **Thời gian commit:** `2026-11-02 23:45:16 +07:00`
- **Tình trạng file gốc:** Khớp 100% cấu trúc và nội dung 228 file mã nguồn với file lưu trữ gốc `C:\Users\phamv\Nectar-Source-Backup-25.zip` (được tạo ngày 02/11/2026 lúc 23:45:43, chỉ 27 giây sau commit).
- **Lý do lựa chọn:**
  1. Đây là mốc commit Backup hoàn thiện, ổn định nhất được xác thực chính thức trong toàn bộ chuỗi phát triển Nectar Custom (từ `Backup 01` đến `Backup 25`).
  2. Chứa trọn vẹn và ổn định tất cả các chức năng người dùng yêu cầu: Control Center (12 nút), Dynamic Island (co giãn mượt mà, không đường nối), Animation (Zero-render Visualizer, Ambient Glow GPU), Click-through hoàn chỉnh (chống kẹt chuột trên Task Manager), và hệ thống đa ngôn ngữ song ngữ Tiếng Việt / Tiếng Anh.
  3. Hoàn toàn sạch sẽ, không bị ảnh hưởng bởi các đoạn code thử nghiệm chưa hoàn tất hoặc lỗi phát sinh trong đợt refactor kết nối/đổi tên sau này.

---

## 2. Khảo sát & Đối chiếu với `Backup 24` (`Nectar-Source-Backup-24.zip`)

Người dùng đặc biệt yêu cầu kiểm tra bản `Nectar-Source-Backup-24.zip`. Kết quả rà soát toàn bộ hệ thống lưu trữ (ổ C:, D:, F:, Desktop, Downloads, Documents, Recycle Bin) cho thấy:
- **Không tồn tại file nén vật lý có tên chính xác `Nectar-Source-Backup-24.zip`** trên máy tính.
- **Tuy nhiên, trong Git repository (`c:\Users\phamv\Nectar`), tồn tại nhánh `backup-24`** tại commit `1c964c4974a9396e16ebbc02553ed16940a7305a` ("Backup 24 - Stable Music Memory & Windows Interaction"), commit ngày `02/11/2026 21:48:01`.
- **Mối quan hệ giữa Backup 24 và Backup 25:**
  - Backup 25 được commit sau Backup 24 đúng **1 giờ 57 phút** trong cùng buổi tối ngày 02/11/2026.
  - Backup 25 chỉ thực hiện đúng **8 file tinh chỉnh** kế thừa trực tiếp từ Backup 24 mà không xóa bỏ hay thay đổi cấu trúc cốt lõi nào:
    1. `SETTINGS.md`: Cập nhật mô tả cài đặt mặc định.
    2. `src-tauri/src/commands.rs`: Đồng bộ giá trị mặc định dock enabled (`false`).
    3. `src-tauri/src/monitors.rs`: Đồng bộ logic hiển thị dock khi khởi động monitor.
    4. `src-tauri/src/services.rs`: Bảo vệ hành vi dock theo cấu hình.
    5. `src/App.css`: Khóa chuẩn kích thước Control Center `580px × 312px`, tinh chỉnh flex layout chống tràn viền.
    6. `src/App.tsx`: Hoàn thiện render Control Center và loại trừ sự kiện cuộn.
    7. `src/Overlay.tsx`: Đồng bộ hóa trigger HUD cạnh màn hình (Volume Edge / Brightness Edge) với cấu hình settings.
    8. `src/settings/useSettings.ts`: Cập nhật các thông số mặc định tối ưu: `collapsedWidth = 110` (trước đó là 140), `springBounciness = 40`, `animationSpeed = 75`, `dockEnabled = false`, `swapHudSides = true`.
- **Kết luận:** Bản `Backup 25` chính là bản đóng gói chính thức, hoàn thiện hơn của `Backup 24`. Lựa chọn Backup 25 là bảo đảm tính toàn vẹn 100% của Backup 24 cùng các sửa lỗi giao diện quan trọng.

---

## 3. Đối chiếu Toàn diện với Nectar Gốc (Upstream kua8/Nectar `v1.4.1` - `62c2324`)

So với bản Nectar gốc ban đầu của tác giả `kua8` (upstream commit `62c2324`):
- **Quy mô thay đổi:** 51 file thay đổi, **+12,538 dòng code mới**, **-1,955 dòng code cũ**.
- **Các cải tiến & chức năng đã bổ sung:**

### A. Trung tâm Điều khiển (Control Center)
- Xây dựng bảng điều khiển 12 nút chức năng (Wi-Fi, Bluetooth, Mute, Do Not Disturb, Night Light, Dark Mode, Settings, Shortcuts, Calendar, Music, Taskbar Pins, v.v.).
- Kích thước chuẩn cố định `580px × 312px`, không bị co giãn hay biến dạng.
- Phong cách kính mờ **Soft Light Glass** sang trọng, độ trong suốt cao kết hợp ambient glow đồng bộ.

### B. Dynamic Island & Chuyển động (Animations)
- **Kiến trúc Candidate D (Single Shell):** Khắc phục triệt để lỗi đường viền nứt subpixel giữa phần thân đảo và hai góc bo cong. Không dùng SVG ear corners gây lỗi đồ họa, dùng border-radius CSS/Framer Motion nguyên bản.
- **Tương tác trực quan:**
  - Chuyển chế độ bằng con lăn chuột (Mouse Wheel navigation) với bộ lọc loại trừ sự kiện cuộn lịch (`.cal-scroll`) và danh sách phím tắt (`.shortcuts-scroll-area`).
  - Hiệu ứng Soft Bounce khi rê chuột (khi tắt tính năng tự động mở rộng lúc hover).
  - Mở rộng tức thì khi click chuột.
- **Zero-Render Audio Visualizer Engine:**
  - Thay thế toàn bộ React `useState` và Framer Motion allocations trong vòng lặp phát nhạc.
  - Sử dụng `requestAnimationFrame` lerp (`diff * 0.32`) tác động trực tiếp vào DOM `style.transform`.
  - Giảm số lần component re-render từ 169,200 lần (trong 30 phút) xuống **đúng 1 lần duy nhất** khi mount.
  - Pacing IPC Backend Audio từ 94 Hz xuống ~30 Hz, giảm 68% tải IPC CPU.
- **Ambient Glow GPU Optimization:** Triệt tiêu hiện tượng lag giật do GPU liên tục tạo frame buffer object khi thay đổi filter blur. Cố định `blur(52px)` tĩnh và chỉ điều tiết độ sáng qua GPU alpha channel (`opacity`).

### C. Click-Through & Tương tác Windows
- Duy trì cửa sổ trong suốt `1920x420` với cờ `set_ignore_cursor_events: true`, chuột xuyên thấu 100% xuống các ứng dụng phía sau.
- **Khắc phục lỗi kẹt chuột Task Manager / Device Manager (INC-14):**
  - Do Windows UIPI chặn tin nhắn chuột từ ứng dụng Elevated sang ứng dụng Medium, thread mouse hook trước đây bị ngủ đông vô thời hạn (`std::thread::park()`).
  - Đã triển khai **Resilient Cursor Polling Fallback** với nhịp 25ms `park_timeout` kết hợp Win32 `GetCursorPos` trực tiếp từ Desktop Shared Memory (không bị UIPI chặn). Dynamic Island phản hồi chuột bình thường ngay cả khi đang thao tác trên Task Manager.
- Sửa lỗi viền hở (seams) trên HUD chỉnh Volume và Brightness hai bên màn hình (INC-04).

### D. Hệ thống Đa ngôn ngữ (i18n)
- Hỗ trợ song ngữ hoàn chỉnh: Tiếng Việt (`vi`) và Tiếng Anh (`en`).
- Từ điển tập trung trong `src/i18n/translations.ts` (~56 KB).
- Cơ chế zero-IPC thông qua `useSyncExternalStore` của React 18, không phát sinh bất kỳ lời gọi invoke nào khi đọc ngôn ngữ.

---

## 4. Khảo sát Thay đổi Sau Backup 25 (Working Tree `shortcuts-redo`)

Sau khi đóng gói Backup 25, trong working tree của nhánh `shortcuts-redo` (được ghi nhận trong `FINAL_REVIEW.md` ngày 04/11/2026), tác giả đã phát triển thêm:
1. **Wi-Fi Manager (`src-tauri/src/connections.rs`, `src/components/ConnectionsView.tsx`):**
   - Quét mạng qua Windows WLAN API ACM.
   - Hàm `query_current_connection()` đọc trực tiếp trạng thái kết nối từ kernel WLAN stack.
   - Hỗ trợ WPA2/WPA3-SAE/64-hex, cơ chế bảo vệ Keyboard Focus khi nhập mật khẩu Wi-Fi.
2. **Bluetooth Device Manager:**
   - Ngắt kết nối tầng vật lý Baseband ACL (`IOCTL_BTH_DISCONNECT_DEVICE = 0x0041000C`) trên radio handle `\\.\BthRadio0`.
   - WinRT AssociationEndpoint Watchers quét thiết bị ở gần (Nearby Discovery).
   - Ghép đôi Custom Pairing (hỗ trợ SSP Just Works cho tai nghe không dây).
   - Xóa bỏ nút ngắt âm thanh màu vàng riêng biệt.
3. **Dual Clock & Panel Order Config (`DualClock.tsx`, `PanelOrderConfig.tsx`).**

> [!WARNING]
> **LÝ DO KHÔNG GỘP WORKING TREE NÀY VÀO BẢN ĐÓNG GÓI CHÍNH:**
> Toàn bộ phần mã Wi-Fi/Bluetooth/Panel Order này chưa được đóng gói thành commit backup chính thức trong repo Nectar (vẫn là uncommitted working tree), và có phát sinh lỗi chẩn đoán thứ tự panel (`docs/PANEL_REORDER_DIAGNOSTIC.md`). Để tuân thủ nghiêm ngặt chỉ thị *"không tự ý ghép code, chọn bản đã chỉnh sửa đầy đủ nhất có thể xác minh"*, chúng tôi chọn **Backup 25** làm nền tảng sạch nhất. Nếu cần tham khảo code Wi-Fi/Bluetooth, ChatGPT có thể yêu cầu cung cấp tài liệu `FINAL_REVIEW.md` và file `connections.rs`.

---

## 5. Danh mục Thư mục & File Trong Gói Nguồn Này

Gói nguồn duy trì 100% cấu trúc dự án nguyên bản:
- `src/`: Giao diện React + TypeScript (App.tsx, Dock.tsx, Calendar.tsx, Overlay.tsx, Settings.tsx, hooks, i18n, components).
- `src-tauri/`: Mã backend Rust + Tauri 2 (main.rs, lib.rs, commands.rs, services.rs, monitors.rs, utils.rs, state.rs, updater.rs, audio_devices.rs, caldav.rs, Cargo.toml, tauri.conf.json).
- `installer-app/`: Trình cài đặt độc lập viết bằng Tauri 2 + React.
- `installer/`: Assets và script đóng gói NSIS cho Windows installer.
- `scripts/`: Scripts tiện ích (`bump-version.mjs`, `release.ps1`).
- `public/`: Icon, hình ảnh tài nguyên.
- `docs/`: Tài liệu kỹ thuật, logo, nhật ký sự cố chi tiết (`ISSUE_LOG.md`).
- Các file cấu hình gốc: `package.json`, `bun.lock`, `tsconfig.json`, `vite.config.ts`, `AGENTS.md`, `PROJECT_SPEC.md`, `SETTINGS.md`, `README.md`.

*(Đã loại trừ hoàn toàn: `node_modules`, `target`, `.git`, build artifacts, file rác, file tạm và dữ liệu nhạy cảm).*

---

## 6. Những Điểm Cần Lưu Ý Cho ChatGPT Khi Khởi Động Lại Dự Án Oryvia

Khi sử dụng gói mã nguồn này để khởi động lại dự án **Oryvia**:
1. **Định danh thương hiệu cũ:**
   - Mã nguồn trong gói vẫn giữ tên `nectar`, package name `nectar`, identifier `com.nectar.app`.
   - Các window labels: `main`, `dock`, `calendar`, `settings`, `overlay`.
2. **Cơ chế Tự Động Cập Nhật (Updater):**
   - Trong `src-tauri/tauri.conf.json` và `src-tauri/src/updater.rs`, endpoint updater đang trỏ tới repository gốc `kua8/Nectar`. Cần tắt hoặc cấu hình lại trước khi phát hành.
3. **Quy trình Khởi động lại Khuyến nghị:**
   - **Bước 1:** Đổi tên hiển thị (Product Name) và định danh gói (Bundle Identifier) sang `Oryvia` (`com.oryvia.app`) trong `package.json`, `Cargo.toml`, `tauri.conf.json`, `installer-app`.
   - **Bước 2:** Thay thế bộ icon thương hiệu (PNG, ICO, SVG) trong `src-tauri/icons/`, `installer-app/src-tauri/icons/`, `public/`.
   - **Bước 3:** Chạy `bun install`, `bun run tsc --noEmit` và `cargo check` để xác minh dự án biên dịch sạch 100%.
   - **Bước 4:** Lúc này mới tiến hành tích hợp bổ sung các tính năng nâng cao (như Wi-Fi / Bluetooth) nếu cần, dựa trên kiến trúc đã được kiểm toán.
