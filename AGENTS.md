> **Current project: Oryvia, maintained by Panchi146.** See [ORYVIA_README.md](docs/architecture/ORYVIA_README.md) and [NOTICE](NOTICE) for current identity and licensing.

# Oryvia (Nectar foundation) — AI Programming Guidelines & Operating Rules

> **Dành cho:** Tất cả các AI Coding Assistants (Google Antigravity, Gemini, Claude, Cursor, v.v.) làm việc trên codebase Nectar.  
> **Nguyên tắc cốt lõi:** Tuyệt đối không gây hồi quy (regression), không gây giật lag (CPU/RAM spikes), không chặn chuột các ứng dụng Windows khác, và bảo toàn chức năng cũ.

---

## 1. Quy tắc Khởi đầu & Tiếp cận Mã nguồn

1. **Đọc `PROJECT_SPEC.md` trước tiên:**
   - Trước khi thực hiện nhiệm vụ lớn, refactor, hoặc sửa module chưa quen, bắt buộc đọc kỹ [PROJECT_SPEC.md](docs/development/PROJECT_SPEC.md) để nắm cấu trúc và các khu vực nhạy cảm.
2. **Kiểm tra code thực tế tại thời điểm hiện tại:**
   - Không suy đoán hoặc giả định dựa trên trí nhớ. Luôn dùng công cụ đọc code thực tế để xác minh kiểu dữ liệu, tên hàm, state và logic.
3. **Phạm vi tác động tối thiểu:**
   - Chỉ sửa đúng file cần thiết theo yêu cầu. Không format lại toàn bộ file hoặc refactor lan man.
4. **Bảo tồn tính toàn vẹn chức năng cũ:**
   - Tuyệt đối không xóa, thay thế hoặc làm hỏng các tính năng đang hoạt động.
   - Không tự ý thay đổi giá trị mặc định của các cài đặt cũ trong `useSettings.ts` hoặc `settings.json`.

---

## 2. Kỷ luật Git & An toàn Dữ liệu

1. **Tuyệt đối không can thiệp Git tự động:**
   - KHÔNG tự ý chạy các lệnh thay đổi lịch sử hoặc trạng thái Git: `git commit`, `git reset`, `git checkout`, `git switch`, `git merge`, `git rebase`, `git stash`, `git restore`.
   - Giữ nguyên các mốc commit Backup hiện có (`Backup 01` đến `Backup 20`...).
2. **Không chạy lệnh phá hủy dữ liệu:**
   - Nghiêm cấm chạy các lệnh xóa file diện rộng (`rm -rf`, `Remove-Item -Recurse -Force`, `git clean -fd`) khi chưa có lệnh rõ ràng từ người dùng.
3. **Bảo vệ file nhạy cảm và file ngoài luồng:**
   - Không ghi mật khẩu, token hay API keys vào file cấu hình hay tài liệu.
   - Không can thiệp vào các file untracked có sẵn trong working tree (ví dụ: `src (2).zip`).

---

## 3. Quy chuẩn Hiệu năng & Dynamic Island

1. **Chống lag & Giảm tải CPU/RAM:**
   - **Tránh IPC dư thừa:** Tuyệt đối không gọi `invoke()` trong thân render chính của component. Chỉ gọi trong event handler hoặc `useEffect` có dependency rõ ràng.
   - **Tránh trùng lặp Listener:** Mọi `listen()` của Tauri phải được unlisten khi component unmount. Luôn tham khảo mẫu dùng `useRef` trong `useSettingsSync.ts`.
   - **Tối ưu hóa i18n:** Luôn dùng `useI18n()` từ `src/i18n/index.ts` (zero-IPC qua `useSyncExternalStore`). Tuyệt đối không đưa IPC vào luồng đọc ngôn ngữ.
   - **Throttle sự kiện:** Các sự kiện chuột, resize, scroll liên tục bắt buộc dùng `useTrailingThrottle` hoặc `requestAnimationFrame` và chỉ gửi IPC khi dữ liệu thực sự thay đổi.
2. **Bảo toàn cơ chế Click-Through Windows:**
   - Vùng trong suốt của cửa sổ `main` (`1920x420`) bắt buộc phải duy trì cờ `set_ignore_cursor_events: true`.
   - Mọi thay đổi vị trí/kích thước Dynamic Island phải gửi tọa độ cho Rust qua `update_notch_rect`.
   - **CẢNH BÁO:** Không bao giờ thêm thẻ HTML toàn màn hình có `pointer-events: auto` vào cửa sổ `main` vì sẽ chặn sạch chuột của các app Windows phía sau!
3. **Bảo toàn tương tác người dùng:**
   - Giữ nguyên luồng xử lý: Hover (trì hoãn theo delay), Click (mở rộng tức thì), Soft Bounce (khi tắt expand on hover), và Wheel (chuyển chế độ).
   - Khi chỉnh sửa `handleWheel`, bắt buộc bảo toàn điều kiện loại trừ: `target.closest('.cal-scroll')` và `target.closest('.shortcuts-scroll-area')`.
4. **Không nhầm lẫn thí nghiệm cũ:**
   - Kiến trúc Dynamic Island ổn định hiện tại dùng CSS/Framer Motion border-radius. Không thêm lại các thử nghiệm SVG góc lõm (SVG ear corners) đã bị loại bỏ vì gây lỗi đồ họa và giật lag.

---

## 4. Quy chuẩn Giao diện & Đa ngôn ngữ (i18n)

1. **Bắt buộc hỗ trợ song ngữ (English & Tiếng Việt):**
   - Mọi chuỗi hiển thị mới (nút bấm, nhãn, tooltip, thông báo lỗi, tiêu đề) BẮT BUỘC phải khai báo key trong `src/i18n/translations.ts` cho cả `en` và `vi`.
   - Không được hardcode chuỗi ký tự hiển thị trực tiếp trong JSX/TSX.
2. **Đồng bộ ngôn ngữ thiết kế:**
   - Tái sử dụng CSS variables trong `src/theme.ts` (`--nectar-bg`, `--nectar-accent`, `--nectar-text`, `--nectar-border`).
   - Tuân thủ phong cách kính mờ (Soft Light Glass) và ambient glow đồng bộ.

---

## 5. Quy chuẩn Viết Code & Dọn dẹp Tài nguyên

1. **Cleanup đầy đủ mọi tài nguyên:**
   - Mọi `setTimeout`, `setInterval`, `requestAnimationFrame`, `window.addEventListener`, và `listen` PHẢI có cleanup trong `useEffect`.
2. **Tái sử dụng code & Thư viện:**
   - Ưu tiên dùng các thư viện đã có trong `package.json` (`framer-motion`, `@dnd-kit`, `lucide-react`). Không cài thêm dependency nếu không thực sự cần thiết.
3. **Bảo tồn comments kỹ thuật:**
   - Giữ nguyên các comment giải thích kiến trúc hoặc mục đích logic cũ trong code.

---

## 6. Quy trình Báo cáo & Kiểm tra

1. **Kiểm tra biên dịch:**
   - Chạy `bun run tsc --noEmit` sau khi sửa code frontend để đảm bảo không có lỗi kiểu TypeScript.
2. **Không sửa mã nguồn khi chỉ được yêu cầu khảo sát hoặc viết tài liệu:**
   - Nếu phát hiện lỗi trong quá trình đọc code, chỉ ghi nhận vào báo cáo, KHÔNG tự ý sửa mã nguồn ứng dụng.
3. **Cấu trúc báo cáo chuẩn:**
   - **Danh sách file đã sửa:** Kèm đường dẫn chính xác.
   - **Lý do sửa:** Giải thích ngắn gọn mục đích kỹ thuật.
   - **Rủi ro tiềm ẩn (nếu có):** Nêu rõ các module liên quan có khả năng bị ảnh hưởng.
   - **Các bước kiểm thử đề xuất cho người dùng:** Hướng dẫn ngắn gọn cách kiểm tra trên ứng dụng thực tế.

---

## 7. Kỷ luật Nhật ký Kỹ thuật & Quản trị Lỗi (Issue Logging)

1. **Bắt buộc tra cứu tài liệu trước khi sửa lỗi:**
   - Trước mỗi tác vụ sửa lỗi (đặc biệt là Dynamic Island, Dock, Overlays và Animation), AI BẮT BUỘC phải đọc kỹ cả [PROJECT_SPEC.md](docs/development/PROJECT_SPEC.md) và các sự cố liên quan trong [docs/ISSUE_LOG.md](docs/ISSUE_LOG.md).
   - Xem kỹ danh sách các giải pháp đã thử nhưng thất bại trong nhật ký để tuyệt đối không lặp lại sai lầm cũ.
2. **Cập nhật nhật ký sau mỗi kết quả kiểm thử quan trọng:**
   - Khi một thử nghiệm mang lại kết quả (dù thành công hay thất bại), phải cập nhật kịp thời vào `docs/ISSUE_LOG.md`.
   - Nhật ký phải được lưu trực tiếp trong thư mục dự án Nectar (`docs/ISSUE_LOG.md`), không chỉ nằm trong nội dung cuộc trò chuyện ngắn hạn.
3. **Phân tách rạch ròi giả thuyết và kết luận:**
   - Luôn phân biệt rõ ràng: "Nguyên nhân đã xác nhận bằng thực nghiệm" và "Giả thuyết đang điều tra".
   - Nghiêm cấm ghi nhận giả thuyết thành kết luận chắc chắn. Không suy diễn hoặc tự tạo snapshot khi chưa có dữ liệu đo kiểm thực tế.
4. **Kỷ luật đánh giá trạng thái sửa lỗi:**
   - TUYỆT ĐỐI KHÔNG tự động tuyên bố đã sửa xong hoặc đánh dấu `Verified Fixed` nếu chưa có kiểm thử thực tế từ người dùng.
   - KHÔNG tự đánh dấu toàn bộ sự cố là `Verified Fixed` nếu chỉ một phần đã được kiểm thử thành công (phải ghi rõ trạng thái `Partially Resolved` kèm phạm vi đã kiểm chứng).
   - Khi người dùng xác nhận bản sửa thành công: Cập nhật trạng thái và ghi rõ phạm vi kiểm thử trong `docs/ISSUE_LOG.md`.
   - Khi một bản sửa thất bại: Lưu lại giải pháp đã thử cùng lý do thất bại để cảnh báo các lần sửa sau.
5. **Đồng bộ hóa kiến trúc:**
   - Khi một thay đổi kiến trúc hoặc luồng render/state đã được kiểm chứng và xác nhận thành công, AI có trách nhiệm cập nhật ngay vào [PROJECT_SPEC.md](docs/development/PROJECT_SPEC.md) để đảm bảo tài liệu luôn phản ánh đúng hệ thống thực tế.
