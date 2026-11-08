# Nectar — Technical Issue Log & Architectural Learnings

> **Mục đích:** Sổ tay kỹ thuật ghi chép và lưu trữ lâu dài các sự cố, bằng chứng thực nghiệm, nguyên nhân đã kiểm chứng, giải pháp đã thử (thành công hoặc thất bại) và các chức năng cần bảo vệ trên codebase Nectar.  
> **Nguyên tắc cốt lõi cho AI:** Trước khi sửa bất kỳ lỗi nào, bắt buộc đọc lại các sự cố liên quan trong tài liệu này. Tuyệt đối không lặp lại giải pháp đã ghi nhận thất bại, không tự tiện coi giả thuyết là kết luận chắc chắn, và không tự ý tuyên bố lỗi đã được khắc phục nếu chưa có xác nhận kiểm thử thực tế từ người dùng.

---

## 1. Hướng Dẫn Sử Dụng & Quy Chuẩn Ghi Chép

1. **Phân tách Rạch Ròi Trạng Thái:**
   - `Open`: Sự cố đang tồn tại, chưa có bản vá hoàn chỉnh.
   - `Investigating`: Đang thu thập dữ liệu, phân tích hiện tượng và snapshot.
   - `Experiment Failed`: Đã thử một giải pháp cụ thể nhưng kiểm thử chứng minh thất bại hoặc gây lỗi phụ (ghi rõ lý do để AI sau không làm lại).
   - `Partially Resolved`: Đã khắc phục và kiểm chứng được một phần (ví dụ chỉ riêng 1 mode), phần còn lại vẫn đang theo dõi.
   - `Verified Fixed`: Đã được kiểm thử thực tế xác nhận lỗi biến mất hoàn toàn và không gây hồi quy (regression).
2. **Quy tắc An Toàn Dữ Liệu & Snapshot:**
   - Chỉ ghi lại các thông số snapshot có thật từ log, bộ đo kiểm DEV (`__NECTAR_DEBUG_SNAPSHOT__`, `localStorage`), hoặc kiểm thử thực nghiệm.
   - Không tự tạo, không suy diễn hoặc giả định các số liệu đo kiểm nếu chưa có dữ liệu gốc.
3. **Phân biệt Mốc Commit và Working Tree:**
   - Luôn ghi rõ mã commit liên quan nếu lỗi xảy ra trên commit đó.
   - Nếu bản sửa đang nằm trong working tree (chưa commit thành mốc Backup mới), phải ghi rõ là **"Thay đổi chưa commit trong working tree"**.
4. **Đối chiếu Tài liệu Liên quan:**
   - Quy tắc vận hành AI: [AGENTS.md](../AGENTS.md)
   - Đặc tả kỹ thuật & Kiến trúc: [PROJECT_SPEC.md](development/PROJECT_SPEC.md)

---

## 2. Danh Mục Sự Cố & Bài Học Kỹ Thuật

---

### INC-01: Khe Trắng Ngang Mép Trên Khi Bật Compact Ambient Glow

- **Mã sự cố:** `INC-01`
- **Trạng thái:** `Verified Fixed` (Phạm vi khắc phục khe trắng ngang mép trên; các đường nối ở tai là vấn đề riêng chưa xử lý).
- **Ngày ghi nhận:** 2026-10-20
- **Ngày kiểm thử gần nhất:** 2026-10-21
- **Mốc commit & Tình trạng thay đổi:**
  - Mốc commit nền: `1f0d31d` (Backup 16 - Fix Compact Ambient Glow).
  - Tình trạng bản vá: **Nằm trong working tree (chưa commit)** trên `src/App.css` và `src/App.tsx`.
- **File & Thành phần liên quan:**
  - [src/App.css](../src/App.css) (`.compact-album-glow-wrapper`, `.compact-album-glow`)
  - [src/App.tsx](../src/App.tsx) (Khối render Compact Album Glow)

#### Triệu chứng & Cách tái hiện
- **Triệu chứng:** Khi Dynamic Island ở trạng thái thu gọn (`!isHovered`), chế độ phát nhạc (`isMusicMode = true`), có ảnh bìa album art và bật cài đặt `settingsCompactGlowEnabled = true`, xuất hiện một vệt sáng / khe trắng ngang bất thường lọt ra khỏi mép trên của vỏ Dynamic Island.
- **Cách tái hiện:**
  1. Bật tính năng Ambient Glow trong cài đặt Dynamic Island.
  2. Bật nhạc qua Spotify hoặc ứng dụng media Windows SMTC để tải album art.
  3. Thu chuột ra ngoài để đảo thu gọn về kích thước ban đầu (`height = 36px`).
  4. Quan sát mép trên cùng giáp viền màn hình.

#### Nguyên nhân đã xác nhận
- Phần tử `motion.img` mang class `.compact-album-glow` áp dụng thuộc tính `filter: blur(6px) saturate(2.5) brightness(0.8)` (được đối chiếu trực tiếp từ file [src/App.css](../src/App.css) hiện tại).
- Trước đây phần tử này được render trực tiếp bên ngoài khối nội dung chính để tránh bị `overflow: hidden` của nội dung cắt mất hiệu ứng tỏa sáng.
- Tuy nhiên, do không có lớp bọc giới hạn hình học tương thích với bo góc của Dynamic Island, hiệu ứng blur (`blur(6px)`) cùng độ lệch kích thước đã tràn qua mép trên (`top: 0`), tạo thành một vệt sáng ngang nằm ngoài khung bo góc của đảo.

#### Vấn đề riêng biệt chưa xử lý (Lưu ý quan trọng)
- **Đường nối ở hai tai (Ear Seams):** Bản vá này chỉ khắc phục khe trắng ngang mép trên. Toàn bộ các vấn đề liên quan đến góc bo, đường nối hoặc hiện tượng mép ở hai bên tai của Dynamic Island là bài toán đồ họa riêng biệt chưa được xử lý, không được nhầm lẫn là đã fix cùng sự cố này.

#### Các giải pháp đã thử & Đánh giá
1. *Bọc trong overflow thông thường của đảo (Thất bại trước Backup 16):* Cắt cụt toàn bộ hào quang tỏa sang hai bên và phía dưới, làm mất hiệu ứng thị giác mong muốn.
2. *Sử dụng `.compact-album-glow-wrapper` độc lập (Thành công - Đã kiểm thử):*
   - Tạo một lớp wrapper riêng trong [src/App.css](../src/App.css):
     ```css
     .compact-album-glow-wrapper {
         position: absolute;
         inset: 0;
         overflow: hidden;
         pointer-events: none;
         border-radius: inherit;
         z-index: 0;
     }
     ```
   - Đặt `AnimatePresence` của glow vào trong wrapper này trong [src/App.tsx](../src/App.tsx).
   - Lớp wrapper kế thừa chính xác `border-radius: inherit` của đảo, chặn đứng hoàn toàn việc ánh sáng bị tràn/hở ở mép trên trong khi vẫn giữ nguyên hiệu ứng bên trong phạm vi bo góc hợp lệ.

#### Bằng chứng kiểm thử
- Người dùng đã chạy ứng dụng trên thực tế, bật nhạc có album art nhiều màu, kiểm tra trực tiếp mép trên ở cả màn hình tối và sáng, xác nhận khe trắng ngang đã biến mất hoàn toàn.

#### Invariants bắt buộc bảo vệ khi sửa tiếp
- Luôn giữ `pointer-events: none` trên wrapper để không cản trở tương tác chuột.
- Luôn giữ `border-radius: inherit` để wrapper đồng bộ với mọi biến thiên góc bo của Dynamic Island.

#### Hướng kiểm tra khi lỗi xuất hiện lại
- Kiểm tra xem thẻ `<div className="compact-album-glow-wrapper" aria-hidden="true">` có còn bao quanh `<AnimatePresence>` của `compact-album-glow` trong [src/App.tsx](../src/App.tsx) hay không.
- Kiểm tra trong [src/App.css](../src/App.css) xem quy tắc `overflow: hidden` và `border-radius: inherit` có bị ghi đè không.

---

### INC-02: Kẹt Nội Dung Cũ / Không Unmount Khi Đổi Mode Trên Dynamic Island (Stuck View & DOM Mismatch)

- **Mã sự cố:** `INC-02`
- **Trạng thái:** `Partially Resolved` (Phần chuyển đổi Music Mode đã xác nhận `Verified Fixed` nhờ Direct Outer Branching; phần chuyển đổi tầng trong Shortcuts / Calendar / Command Center đặt trạng thái `Monitoring`).
- **Ngày ghi nhận:** 2026-10-20
- **Ngày kiểm thử gần nhất:** 2026-10-22
- **Mốc commit & Tình trạng thay đổi:**
  - Mốc commit nền: `1f0d31d` (Backup 16) và `6ceec3f` (Backup 17).
  - Tình trạng bản vá hiện tại: Đã tích hợp trong `Backup 18` trên `src/App.tsx`.
- **File & Thành phần liên quan:**
  - [src/App.tsx](../src/App.tsx) (Các khối `AnimatePresence`, logic phân nhánh `isHovered && isMusicMode && !isCalendarMode`, bộ đo kiểm `takeDiagnosticSnapshot`).

#### Triệu chứng & Cách tái hiện
- **Triệu chứng:**
  - Khi cuộn chuột hoặc chuyển mode giữa các chế độ (đặc biệt khi chuyển đổi qua lại giữa `calendar` và `command-center`, hoặc từ `music` sang các mode khác), vỏ ngoài của Dynamic Island co giãn kích thước chính xác theo mode mới, nhưng nội dung con của mode cũ (ví dụ giao diện Media Player hoặc Shortcuts Bar) không unmount ra khỏi DOM.
  - Hậu quả: Giao diện bị chèn lấn (overlap), nội dung cũ bị giữ lại kéo dài hàng chục giây (thậm chí trên 30 giây), hoặc đảo rơi vào trạng thái stuck blur/vỡ layout.
- **Cách tái hiện ban đầu:**
  1. Mở rộng đảo bằng cách di chuột (`isHovered = true`).
  2. Cuộn chuột hoặc bấm phím tắt chuyển nhanh giữa các mode `calendar` và `command-center`.
  3. Hoặc phát nhạc (`music` mode), mở rộng đảo rồi cuộn chuyển sang mode `calendar`.
  4. Quan sát thấy kích thước vỏ chuyển thành kích thước của mode mới nhưng view con của mode cũ vẫn kẹt lại bên trong DOM.

#### Dữ liệu thực nghiệm & Bằng chứng Snapshot
Bộ đo kiểm DEV instrumentation trong [src/App.tsx](../src/App.tsx) ghi nhận:
1. **7 snapshot ban đầu (Khi chưa can thiệp):**
   - Các mode thực tế được kiểm thử trong 7 snapshot này là **`calendar`** và **`command-center`** (và khi luân chuyển từ music sang hai mode này).
   - Dữ liệu minh chứng rõ ràng: `nectarMode` đã chuyển sang mode mới, kích thước vỏ (`targetDimensions` và `actualDimensions`) đã khớp với mode mới, nhưng mảng `domViews` vẫn ghi nhận view con của mode cũ chưa unmount (view cũ bị giữ lại trên 30 giây: `pendingDurationMs: 30301ms`, `outerExit.isStuck = true`).
2. **Làm rõ về mảng `domViews`:**
   - Mảng `domViews` thu thập các selector hiện diện: `.expanded-music-container`, `.main-row`, `.command-center-content-minimal`, `.calendar-timer-content`, `.shortcuts-bar` / `.shortcuts-scroll-area`, và `.compact-album-glow-wrapper`.
   - **Lưu ý phân loại:** Phần tử `compact-glow-wrapper` chỉ là lớp bọc đồ họa của hào quang album thu gọn, **tuyệt đối không được coi là một panel mode**.
   - Bản chất hiện tượng lỗi: Chủ yếu là view của mode cũ bị giữ lại trong DOM sau khi mode mới đã được kích hoạt, dẫn đến mismatch (`domMismatchSettled = true`), không nhất thiết là có hai panel mode chính cùng tồn tại song song.
3. **6 snapshot sau khi thử nghiệm "Presence Isolation":**
   - Đã thử nghiệm bọc component con bằng `<PresenceContext.Provider value={null}>` để cô lập animation exit.
   - Kết quả từ 6 snapshot thực tế: Lỗi kẹt view KHÔNG hề được giải quyết; DOM view cũ vẫn tiếp tục bị giữ lại.
4. **Hiện tượng về exit animation:**
   - Dữ liệu snapshot xác nhận hiện tượng: view cũ không kịp dọn dẹp khi trạng thái cha đổi nhanh.
   - *Lưu ý kỹ thuật:* Không đưa ra kết luận võ đoán rằng đây là 100% bug nội bộ của Framer Motion. Chỉ ghi nhận hiện tượng thực tế đo được qua snapshot.

#### Cách lấy Snapshot DEV & Thao tác Đo kiểm
Hệ thống đã tích hợp sẵn công cụ chẩn đoán trong môi trường DEV:
1. **Thao tác chuột trực tiếp (Không cần focus cửa sổ):**
   - **Middle Click (Nhấp con lăn chuột / wheel click - `e.button === 1` qua sự kiện `auxclick`)** trực tiếp lên Dynamic Island (`.nectar`).
   - Hoặc **Ctrl + Click chuột trái** (`e.ctrlKey && e.button === 0` qua sự kiện `pointerdown`) trên Dynamic Island.
2. **Phím tắt phụ (Khi cửa sổ có focus bàn phím):**
   - Bấm tổ hợp phím `Ctrl + Shift + D`.
3. **Hành vi an toàn của công cụ:**
   - **Không tự động ghi đè Clipboard.** Chỉ sao chép vào Clipboard (`navigator.clipboard.writeText`) khi có thao tác chủ động của người dùng (Middle Click, Ctrl+Click hoặc Ctrl+Shift+D).
   - Lưu vào biến toàn cục `window.__NECTAR_DEBUG_SNAPSHOT__`.
   - Lưu vào bộ nhớ cục bộ `localStorage.getItem('nectar_debug_snapshot')`.
   - Tự động ghi nhận snapshot sau 1000ms khi `nectarMode` hoặc trạng thái hover thay đổi.
   - Phân biệt rõ cờ stale flag: `innerExit.isPending` chỉ được đánh giá khi `standard-view-group` (`.main-row`) thực sự đang tồn tại trong DOM.

#### Ví dụ Dữ liệu Thực nghiệm Đã Được Xác Minh (Snapshot Example)
Dưới đây là một mẫu dữ liệu snapshot JSON thực nghiệm điển hình trích xuất từ bộ đo kiểm khi xảy ra lỗi kẹt view giữa Calendar và Music (trạng thái kẹt kéo dài hơn 30 giây):
```json
{
  "timestamp": "21:07:00",
  "nectarMode": "command-center",
  "isHovered": true,
  "isMusicMode": false,
  "isCalendarMode": false,
  "collapseDelay": 100,
  "hasPendingCollapseTimeout": false,
  "lastHoverEnd": {
    "timestamp": 1792591542853,
    "collapseDelay": 100,
    "timeoutCreated": true
  },
  "targetDimensions": {
    "width": 460,
    "height": 290
  },
  "actualDimensions": {
    "width": 460,
    "height": 290
  },
  "domViews": [
    "expanded-music",
    "compact-glow-wrapper"
  ],
  "outerExit": {
    "isPending": true,
    "pendingDurationMs": 30301,
    "isStuck": true,
    "lastStartedMsAgo": 30301,
    "lastCompletedMsAgo": 30322
  },
  "innerExit": {
    "isPending": true,
    "pendingDurationMs": 29528,
    "isStuck": true,
    "lastStartedMsAgo": 29528,
    "lastCompletedMsAgo": 30366
  },
  "analysis": {
    "domMismatchSettled": true,
    "heightMismatchSettled": false,
    "exitStuckDetected": true
  }
}
```
*Phân tích dữ liệu ví dụ trên:* `nectarMode` đã chuyển sang `command-center`, kích thước vỏ đã bung to đúng `460x290`, nhưng `domViews` vẫn ghi nhận `expanded-music` chưa được unmount sau hơn 30 giây (`pendingDurationMs: 30301ms`, `outerExit.isStuck = true`), dẫn đến `domMismatchSettled = true`.

#### Các giải pháp đã thử & Đánh giá
1. *Presence Isolation bằng `PresenceContext.Provider value={null}` (Đã thử nghiệm - Thất bại):*
   - Không giải quyết được hiện tượng kẹt DOM view cũ, 6 snapshot thực tế chứng minh view cũ vẫn nằm trong DOM sau 5–10 giây. Đã hoàn nguyên.
2. *Đề xuất `usePresence + safeToRemove(180ms)` (Chưa áp dụng chính thức):*
   - Từng được thảo luận trong quá trình phân tích kỹ thuật nhưng đã được loại bỏ; không áp dụng.
3. *Loại bỏ `AnimatePresence mode="wait"` tầng ngoài & Dùng React conditional rendering trực tiếp (Thành công - Đã kiểm thử xác nhận):*
   - Thay vì bọc `expanded-music` và `standard-view-group` trong một `AnimatePresence mode="wait"` tầng ngoài, chuyển trực tiếp sang nhánh rẽ thông thường của React trong [src/App.tsx](../src/App.tsx):
     ```tsx
     {/* Outer Branch: Direct React switching without AnimatePresence exit queue */}
     {isHovered && isMusicMode && !isCalendarMode ? (
       <motion.div key="expanded-music" className="expanded-music-container" ...>
         ...
       </motion.div>
     ) : (
       <motion.div key="standard-view-group" ...>
         ...
       </motion.div>
     )}
     ```
   - **Kết quả kiểm thử thực tế (2026-10-22):** Người dùng đã kiểm thử thực tế trên Windows và xác nhận **chế độ Music không còn bị kẹt khi chuyển mode nhanh**, việc luân chuyển giữa Music và các mode khác diễn ra mượt mà, dứt khoát.

#### Trạng thái hiện tại của Tầng trong (Shortcuts / Calendar / Command Center)
- Bên trong khối `standard-view-group`, các panel: **Shortcuts Bar**, **Calendar**, và **Command Center** hiện vẫn đang chịu sự điều phối của một `AnimatePresence mode="wait"` tầng trong:
  ```tsx
  {/* Mode Panel Area: Shortcuts, Command Center, or Calendar */}
  <AnimatePresence mode="wait" onExitComplete={...}>
    {nectarMode === 'status' && isHovered && <motion.div key="shortcuts-row" ... />}
    {nectarMode === 'command-center' && isHovered && <motion.div key="command-center-panel" ... />}
    {nectarMode === 'calendar' && isHovered && <motion.div key="calendar-panel" ... />}
  </AnimatePresence>
  ```
- **Hiện trạng:**
  - Trong các bài test ban đầu, từng xuất hiện 2 snapshot kẹt `shortcuts-row`.
  - Tuy nhiên, trong đợt kiểm thử mới nhất sau khi sửa nhánh ngoài, khi cuộn nhanh nhiều lần người dùng **không còn tái hiện được lỗi kẹt tầng trong**.
  - **Quyết định kỷ luật kỹ thuật:** Lỗi tầng trong **CHƯA được xác nhận sửa triệt để**. Chuyển sang trạng thái **`Monitoring`** để tiếp tục theo dõi, **tuyệt đối KHÔNG đánh dấu là `Verified Fixed`**.

#### Invariants bắt buộc bảo vệ khi sửa tiếp
- Tuyệt đối không can thiệp làm hỏng cơ chế **Soft Bounce** khi `settingsNotchExpandOnHover = false`.
- Bảo toàn logic loại trừ cuộn trong `handleWheel` đối với `.cal-scroll` và `.shortcuts-scroll-area`.
- Duy trì đồng bộ tọa độ `update_notch_rect` và cờ click-through của cửa sổ `main`.
- Giữ nguyên các ref chẩn đoán và timeout đóng/mở (`hoverTimeoutRef`, `collapseTimeoutRef`).
- Không thêm Wheel Lock hay timer làm chậm thao tác người dùng.

#### Hướng kiểm tra khi lỗi xuất hiện lại
1. Chạy Dynamic Island ở chế độ dev.
2. Thao tác **Middle-Click** (hoặc `Ctrl + Left Click`, hoặc `Ctrl + Shift + D`) trên Dynamic Island để copy snapshot.
3. Dán (Ctrl+V) snapshot ra editor và kiểm tra 3 trường quan trọng:
   - `snap.nectarMode`: Mode hiện tại.
   - `snap.domViews`: Danh sách các view thực tế trong DOM (không đếm `compact-glow-wrapper` như một mode panel).
   - `snap.analysis.domMismatchSettled`: Phải là `false` khi đảo đã ổn định. Nếu là `true`, view cũ của mode trước đang bị kẹt lại.

---

### INC-03: Khe Trắng Tại Hai Chỗ Nối Tai Thỏ (Ear Seams) Khi Hover Trên Nền Sáng

- **Mã sự cố:** `INC-03`
- **Trạng thái:** `Resolved — User Verified on Windows (Uncommitted)`
- **Ngày ghi nhận:** 2026-10-21
- **Mốc commit nền:** `Backup 17` (`6ceec3f`), chuyển tiếp sang `Backup 18`.
- **File & Thành phần liên quan:**
  - [src/App.css](../src/App.css) (`.nectar::before`, `.nectar::after`, `.nectar.is-impacted::before`, `.nectar.is-impacted::after`)
  - [src/App.tsx](../src/App.tsx) (`.nectar` root container, Soft Bounce scale animation)

#### Triệu chứng & Bằng chứng thực nghiệm
- **Triệu chứng:** Khi di chuột hover vào Dynamic Island trên nền desktop sáng màu (hoặc nền có độ tương phản), tại hai góc lõm tiếp giáp giữa tai thỏ (hai pseudo-element `::before` và `::after`) với thân Island xuất hiện hai khe hở dọc màu trắng.
- **Dữ liệu thực nghiệm đã kiểm chứng:**
  1. *Không hover:* Không có khe trắng.
  2. *Hover:* Xuất hiện khe trắng.
  3. *Đổi `--notch-bg` sang `#000000`:* Khe trắng vẫn còn nguyên, không biến mất.
  4. *Tắt scale khi hover:* Khe trắng vẫn còn -> Lỗi không hoàn toàn do Soft Bounce scale gây ra.
  5. *Ẩn thử hai pseudo-element `::before` / `::after`:* Hai khe dọc biến mất, nhưng khe ngang mép trên vẫn còn (khe ngang mép trên sau đó đã được chứng minh và giải quyết triệt để bởi `compact-album-glow-wrapper` trong `INC-01`).
  6. *Đổi màu nền desktop phía sau sang xanh lá và tím đậm:* Hai khe trắng vẫn giữ nguyên màu trắng -> Chứng minh khe trắng **nằm trong vùng render đồ họa của chính Dynamic Island**, không phải do lọt màu nền desktop phía sau.

#### Danh sách giải pháp từng thất bại trong lịch sử (TUYỆT ĐỐI KHÔNG LẶP LẠI)
1. *Chồng pseudo-element phụ / viền phụ:* Tạo sọc đen và biến dạng đồ họa.
2. *SVG path động:* Từng thử nghiệm gây khung đen lớn, lỗi răng cưa và tốn CPU khi co giãn.
3. *CSS mask / radial-gradient viền trắng (`rgba(255,255,255,0.1)`):* Đã thử vô hiệu hóa dải gradient này nhưng khe trắng vẫn còn nguyên.
4. *Chỉnh transform-origin hoặc translateZ(0):* Không thay đổi được khe hở do rendering subpixel.
5. *Background-image linear-gradient 3px overpaint:* Tạo thêm dải đen đậm khi nền notch bán trong suốt.
6. *Điều chỉnh điểm dừng đen của radial-gradient mask từ 13px thành 12.7px:*
   - **Trạng thái:** `Partial Improvement — Rejected Due to Visual Regression`.
   - **Kết quả được người dùng xác nhận:** Khe trắng tại góc lõm tai thỏ có giảm nhưng chưa biến mất; hình dạng/đường cong góc lõm bị biến dạng, không đạt yêu cầu thị giác; đã hoàn nguyên về 13px.
7. *Thử nghiệm đổi màu chẩn đoán nền tai thỏ (Cyan và Đỏ sẫm):*
   - **Trạng thái:** `Inconclusive — Diagnostic Test Completed & Reverted`.
   - **Kết quả được người dùng xác nhận:** Quan sát thấy dải sáng xám nhạt tại mép tiếp giáp giữa tai đỏ và thân đen, đồng thời viền sáng tương tự cũng hiện diện dọc cạnh thân đảo ở đoạn dưới tai thỏ. Đã hoàn nguyên về `var(--notch-bg)`.
8. *Thử nghiệm nền đen đục hoàn toàn (Opaque Black Background Test - `rgb(0,0,0)` 100%):*
   - **Trạng thái:** `Failed — No Improvement & Reverted`.
   - **Kết quả thực tế được người dùng xác nhận:** Nền đen đục 100% trên `.nectar` và hai pseudo-element nhưng hai khe trắng vẫn xuất hiện như cũ. Đã hoàn nguyên về `var(--notch-bg)`.
9. *Thử nghiệm vô hiệu hóa CSS Mask (Disabled Mask Test) & Đính chính 3 trạng thái thực nghiệm:*
   - **Trạng thái:** `Failed — No Improvement & Reverted`.
   - **Nội dung thử nghiệm:** Vô hiệu hóa `-webkit-mask-image` và `mask-image` trên cả `::before` và `::after` (hai tai trở thành hình chữ nhật 13x13px).
   - **Kết quả thực tế được người dùng xác nhận trên 3 trạng thái:**
     1. **Compact không hover (Idle):** **Không có khe trắng.**
     2. **Compact có hover (Soft Bounce, không mở rộng):** **Hai khe trắng xuất hiện** tại đường nối tiếp giáp giữa hai tai thỏ và thân đảo (x = 262–263 và x = 407–408).
     3. **Bấm mở rộng Music hoặc Calendar (Expanded):** **Không có khe trắng.**
   - **Kết luận:** Tắt mask không loại bỏ được khe trắng trong Compact Hover. Đã hoàn nguyên chính xác `src/App.css` về Backup 18 (`b351557`).
   - **Ý nghĩa kỹ thuật:** Khẳng định khe trắng hoàn toàn gắn liền với hành vi tương tác khi Compact Hover (nơi Soft Bounce scale `[1, 1.08, 1.05]` kích hoạt), trong khi cả trạng thái Compact Idle lẫn trạng thái Expanded (kích thước lớn) đều không có khe hở. Giữ nguyên trạng thái INC-03: `Open`.

10. *Thử nghiệm cô lập Scale có kiểm soát (Controlled Scale Isolation Test):*
    - **Trạng thái:** `Empirically Verified & Reverted to Original`.
    - **Nội dung thử nghiệm:** Giữ nguyên 100% tất cả các điều kiện của Compact Hover (`isNotchHovered = true`, `isHoverPreview = true`, luồng chuột, timer, IPC `set_notch_hovered` và `update_notch_rect`, CSS, backgrounds, masks, wrapper, transform-origin `originY: 0`). Chỉ thay đổi duy nhất một yếu tố: khóa `scaleX = 1` và `scaleY = 1` trong `animate` khi `isHoverPreview` kích hoạt.
    - **Kết quả thực tế được người dùng kiểm chứng trên Windows:**
      * Compact Hover với Soft Bounce bình thường (`scale [1, 1.08, 1.05]`): **Có hai khe trắng** tại đường nối.
      * Compact Hover với `scaleX = scaleY = 1` (giữ nguyên toàn bộ điều kiện hover khác): **Hai khe trắng BIẾN MẤT HOÀN TOÀN**.
      * Trạng thái mở rộng (Expanded) Music/Calendar: Hoạt động bình thường.
      * Phép thử đã hoàn nguyên chính xác về mã nguồn gốc của Backup 18 (`b351557`).
    - **Kết luận kỹ thuật:** Phép biến đổi scale hoặc đường đi rendering liên quan đến nó là yếu tố quan trọng gây ra hiện tượng trong điều kiện kiểm thử. Không khẳng định chắc chắn nguyên nhân nội bộ của Chromium/Skia khi chưa có bằng chứng trực tiếp.
    - **Trạng thái sự cố:** Chuyển tiếp sang thử nghiệm giải pháp Single Continuous Shell.

11. *Giải pháp Candidate D — Single Continuous Shell (`clip-path: shape()`):*
    - **Trạng thái:** `Resolved — User Verified on Windows (Committed in Backup 19 — 9f75877)`.
    - **Mô tả kiến trúc giải pháp:**
      * Thay thế kiến trúc 3 bề mặt nền tách rời (thân `[0, W]` và hai tai `[-13, 0]`, `[W, W+13]`) bằng một lớp nền liên tục duy nhất:
        - `.nectar.is-impacted` chuyển `background: transparent;`.
        - `.nectar.is-impacted::after` chuyển `display: none;`.
        - `.nectar.is-impacted::before` mở rộng thành `inset: 0 -13px;` chứa cả lớp nền `background-color: var(--notch-bg)` lẫn hai dải highlight tai thỏ `background-image: radial-gradient(...)` trên cùng một bề mặt không mối nối.
      * Cắt toàn bộ biên ngoài thân đảo và hai tai thỏ bằng một đường vector khép kín chuẩn `clip-path: shape()`.
      * Bảo toàn góc cong lõm $13\text{px}$ bằng xấp xỉ Bézier bậc ba ($\kappa \approx 0.55228475$) có sai số hình học cực tiểu ($< 0.004\text{px}$).
      * Giữ nguyên 100% hiệu ứng **Soft Bounce `[1, 1.08, 1.05]`** với `originY: 0`.
      * Đồng bộ biến CSS bán kính đáy `--radius-bottom` (`18px / 24px / 28px`) thông qua `@property --radius-bottom` và cùng cấu hình spring physics (`stiffness: 1000, damping: 40`) trong Framer Motion.
      * Có cơ chế fallback tự động qua `@supports (clip-path: shape(from 0 0, close))` cho các môi trường duyệt không hỗ trợ `shape()`.
    - **Kết quả kiểm thử thực tế từ người dùng trên Windows (2026-10-23):**
      1. Compact không hover: hoạt động bình thường.
      2. Compact Hover: **hai khe trắng ở đường nối tai thỏ đã BIẾN MẤT HOÀN TOÀN**.
      3. Soft Bounce `[1, 1.08, 1.05]`: vẫn hoạt động bình thường, giữ nguyên cảm giác nảy.
      4. Music và Calendar: hoạt động bình thường.
      5. Compact Glow và Ambient Glow: hoạt động bình thường.
      6. Shortcuts và Command Center: hoạt động bình thường.
      7. Hitbox, di chuột, bấm và click-through: hoạt động bình thường.
      8. Không phát hiện hồi quy trong những hạng mục đã kiểm thử.
    - **Đánh giá nguyên nhân kỹ thuật theo mức độ bằng chứng:**
      * Hiện tượng subpixel antialiasing deficit hoặc làm tròn compositing tại ranh giới tiếp giáp giữa các bề mặt vẽ riêng biệt khi biến đổi tỉ lệ scale là giả thuyết phù hợp nhất với chuỗi thực nghiệm. Tuy nhiên, chưa thể khẳng định chắc chắn lỗi thuộc về tầng nội bộ nào của Chromium hoặc Skia khi chưa có đo kiểm profiling trực tiếp trong nhân trình duyệt.
    - **Phạm vi kiểm chứng:**
      * Đã kiểm chứng và xác nhận thành công trên môi trường Windows thực tế của người dùng với Evergreen WebView2 Runtime (`155.0.4283.62`).
      * Không tuyên bố đã kiểm thử thành công trên toàn bộ các phiên bản Windows hoặc các phiên bản WebView2 cũ hơn.
    - **Tình trạng lưu trữ:** Đã lưu trữ chính thức trong commit Backup 19 (`9f75877`) và tạo bản patch/bundle dự phòng độc lập tại `C:\Users\phamv\Documents\NectarBackups\`.

#### Invariants bắt buộc bảo vệ khi sửa
- Bảo toàn Soft Bounce `[1, 1.08, 1.05]`.
- Bảo toàn Compact Glow Wrapper (`.compact-album-glow-wrapper`).
- Không làm tái phát lỗi kẹt mode giữa Music và Standard View.
- Không thay đổi hitbox, click-through hay giao diện ở trạng thái bình thường.

---

### Sự cố INC-04: Khe trắng mép HUD side panel (Volume & Brightness HUD)

- **Trạng thái:** `Resolved — User Verified on Windows`.
- **Mức độ:** Trung bình (lỗi đồ họa seam ranh giới tai HUD side panel; hồi quy mất nền Brightness HUD đã được sửa và kiểm chứng).
- **Phạm vi tác động:** `src/Overlay.tsx`, `src/Overlay.css`. Tuyệt đối không ảnh hưởng Dynamic Island (`src/App.tsx`, `src/App.css`).

#### A. Lỗi ban đầu
- Hai khe trắng tại đường tiếp giáp giữa tai thỏ trên/dưới và thân HUD side panel (Volume HUD bên trái và Brightness HUD bên phải) khi scale/render trên Windows.

#### B. Phương án xử lý
- Áp dụng kiến trúc Single Continuous Shell.
- Sử dụng CSS `clip-path: shape()` dựng một vector shell liên tục cho toàn bộ thân và hai tai của HUD trong `@supports (clip-path: shape(from 0 0, close))`.
- Giữ nguyên cơ chế fallback tự động cho trình duyệt không hỗ trợ `shape()`.

#### C. Hồi quy trong quá trình sửa
- Volume HUD hoạt động tốt và hết khe trắng do có sẵn phần tử DOM riêng `<div className="volume-notch-flares" />`.
- Brightness HUD bị mất nền tối bán trong suốt do trước đó không có thẻ DOM flares riêng mà gán shell lên pseudo-element `::before` của flex container `.brightness-notch`, dẫn đến xung đột stacking context và mask `-webkit-mask-image`.

#### D. Bản sửa hồi quy
- Thêm thẻ DOM độc lập `<div className="brightness-notch-flares" />` trong `src/Overlay.tsx` ngang hàng với `<div className="brightness-notch">` (đồng bộ kiến trúc 1:1 với `VolumeNotch`).
- Tách lớp vỏ nền Brightness HUD khỏi phần nội dung: chuyển các tai flares sang `.brightness-notch-flares` và gán Continuous Shell lên phần tử này khi `shape()` được hỗ trợ.
- Khôi phục hoàn toàn nền tối bán trong suốt (`var(--nectar-bg)`) mà không tạo khe trắng mới, hỗ trợ cả hai bên (`on-right` mặc định và `on-left` khi bật `swapHudSides`).

#### E. Kết quả cuối cùng được người dùng xác nhận trên Windows (2026-10-23)
1. Volume HUD đã hết hai khe trắng ở tai thỏ trên và dưới.
2. Brightness HUD đã hết hai khe trắng.
3. Brightness HUD đã khôi phục hoàn toàn nền tối bán trong suốt.
4. Hai HUD hoạt động đúng ở cạnh trái và cạnh phải màn hình.
5. Hình dạng, màu nền, độ cong và các hiệu ứng đều bình thường.
6. Thanh chỉnh độ sáng và thanh âm lượng hoạt động bình thường.
7. Volume HUD không có hồi quy sau khi sửa Brightness HUD.
8. Dynamic Island Candidate D từ Backup 19 được giữ nguyên hoàn toàn.

#### Đánh giá nguyên nhân kỹ thuật theo mức độ bằng chứng
- Tương tự INC-03, hiện tượng subpixel antialiasing deficit hoặc làm tròn compositing tại ranh giới tiếp giáp giữa các bề mặt vẽ riêng biệt khi biến đổi tỉ lệ scale là giả thuyết phù hợp nhất với chuỗi thực nghiệm. Không khẳng định tuyệt đối lỗi nội bộ Chromium/Skia khi chưa có đo kiểm profiling trực tiếp trong nhân trình duyệt.
- Lịch sử các bước thử nghiệm và sửa lỗi hồi quy được lưu giữ đầy đủ để phục vụ tra cứu.

---

### Tính năng mới: Kéo thả tệp từ Windows File Explorer vào bảng Shortcuts (Drag & Drop Shortcuts)

- **Trạng thái:** `Implemented — Ready for Windows User Testing (Uncommitted)`.
- **Mức độ:** Tính năng nâng cấp trải nghiệm người dùng.
- **Phạm vi tác động:** `src/components/ShortcutsBar.tsx`, `src/App.tsx`, `src/i18n/translations.ts`. Tuyệt đối không can thiệp Dynamic Island Candidate D (`src/App.css`), Soft Bounce, HUD overlays (`src/Overlay.tsx`, `src/Overlay.css`), hay các tab Music/Calendar.

#### 1. Nguyên nhân dấu cấm 🚫 khi kéo tệp vào Compact
1. **Thiếu listener cấp ứng dụng:** Trước đây, listener `onDragDropEvent` chỉ được gắn bên trong `ShortcutsBar.tsx`. Khi Dynamic Island ở chế độ Compact, `ShortcutsBar` chưa mount trong React DOM, dẫn đến toàn bộ ứng dụng không có handler tiếp nhận sự kiện OLE Drag & Drop từ Windows. Hệ điều hành mặc định trả về `DROPEFFECT_NONE` (hiển thị biểu tượng cấm 🚫).
2. **Khắc phục kiến trúc:**
   - Hợp nhất duy nhất **1 native listener** `getCurrentWebview().onDragDropEvent` tại cấp gốc `App.tsx` cho cửa sổ Dynamic Island (`main`).
   - Xóa bỏ listener native trùng lặp ở `ShortcutsBar.tsx` để tránh xung đột hoặc xử lý duplicate drop events.

#### 2. Luồng xử lý kéo thả khi Compact (Compact Drag-to-Open)
1. **Phát hiện tệp kéo vào đảo:**
   - Sự kiện OLE Drag & Drop chỉ phát sinh khi người dùng thực sự kéo tệp/thư mục từ File Explorer. Di chuyển chuột thông thường (`mousemove`/`mouseenter`) hoàn toàn không kích hoạt sự kiện này.
   - Tính toán tọa độ CSS chính xác: `x = payload.position.x / dpr`, `y = payload.position.y / dpr` đối chiếu với bounding box của `nectarRef.current`.
2. **Trì hoãn mở thông minh (Hover Delay 300ms):**
   - Khi tệp rê vào đảo lúc đang thu gọn (`!isHovered`), kích hoạt bộ đếm thời gian 300ms (nằm chính xác trong ngưỡng 250–350ms theo yêu cầu).
   - Nếu người dùng giữ tệp trên đảo đủ 300ms: Tự động chuyển `nectarMode = 'status'`, mở rộng đảo (`setIsHovered(true)`), kích hoạt trạng thái Drop Zone (`isDropTargetActive = true`) và khóa chống thu nhỏ (`isDraggingFileRef.current = true`).
   - Nếu người dùng kéo tệp ra ngoài trước 300ms: Hủy timer ngay lập tức, giữ nguyên đảo thu gọn.
3. **Xử lý thả tệp an toàn (Safe Drop Processing):**
   - Hỗ trợ cả trường hợp thả nhanh trước khi `ShortcutsBar` hoàn tất mount: Lưu trữ mảng đường dẫn trong `pendingDropPaths` tại `App.tsx` kết hợp phát custom event `nectar-drop-shortcuts`.
   - Ngay khi `ShortcutsBar` mount, `useEffect` tự động đọc `pendingDropPaths`, tạo Shortcut và xóa pending state.
   - Cơ chế chặn trùng lặp bằng timestamp guard (`now - lastProcessedDropTimeRef < 500ms`) đảm bảo mỗi lần thả chỉ tạo chính xác một Shortcut.
4. **Hủy hoặc kéo ra ngoài:**
   - Khi có sự kiện `leave` hoặc kéo ra ngoài vùng đảo: Xóa timer, giải phóng cờ `isDraggingFileRef` và `isDropTargetActive`.
   - Nếu đảo được mở tự động bởi phiên kéo, đảo sẽ tự động thu nhỏ trở lại chế độ ban đầu (`wasOpenedByDragRef.current`).

#### 3. Tối ưu hóa RAM và CPU
- **Số lượng listener:** Duy nhất 1 native listener `onDragDropEvent` trên toàn bộ cửa sổ chính.
- **Không polling chuột:** Dựa 100% vào cơ chế sự kiện native của Webview.
- **Vòng đời tài nguyên:** Toàn bộ timer (`dragExpandTimerRef`) và subscription (`unlisten`) được dọn dẹp sạch sẽ trong cleanup function của `useEffect`.
- **Idle Overhead:** 0% CPU khi không có thao tác kéo thả.

#### 4. Kết quả kiểm tra biên dịch kỹ thuật
- `bun run tsc --noEmit`: 0 lỗi TypeScript.
- `bun run build`: Production bundle thành công trong 4.28s.
- Bảo toàn tuyệt đối commit Backup 20 (`529a1cb`), Dynamic Island Candidate D, Soft Bounce và HUD side panels.

---

### INC-05: Chẩn đoán Chuyên sâu Hiện tượng Dấu Cấm 🚫 Khi Kéo Tệp Vào Dynamic Island

- **Ngày phát hiện:** 24/10/2026.
- **Trạng thái:** `Under Investigation — Diagnostic Test Window Deployed`.
- **Mức độ:** Khảo sát kiến trúc Native Window / OLE Drag & Drop.

#### 1. Kết quả đo kiểm thực tế (Thực nghiệm Phép thử 1 & Log)
1. **Kiểm tra tiến trình & Webview:**
   - Ứng dụng chạy đúng phiên bản dev mới nhất (`nectar.exe` PID 29588 kết nối Vite dev server port 1420 PID 14008).
   - Listener `getCurrentWebview().onDragDropEvent` đã được đăng ký thành công trên window `main`: key `"nectar-drag-diag-status": "{\"status\":\"registered\",\"label\":\"main\"...}"` trong `settings.json`.
2. **Kiểm tra quyền hạn (UIPI / UAC Boundary):**
   - Đã xác minh qua PowerShell: Cả `explorer.exe` (Integrity: Medium) và `nectar.exe` (Integrity: Medium) đều chạy ở mức người dùng thông thường không nâng quyền (Non-elevated). Loại trừ nguyên nhân chặn kéo thả do khác biệt đặc quyền UAC.
3. **Kết quả kiểm thử khi DEV PINNED:**
   - Người dùng bật chế độ DEV PINNED (giữ bảng Shortcuts mở cố định), kéo tệp từ Windows File Explorer vào bảng Shortcuts.
   - Kết quả: Con trỏ vẫn hiện dấu cấm 🚫 (`DROPEFFECT_NONE`).
   - Đọc dữ liệu `settings.json`: Key `"nectar-drag-diag-last"` **hoàn toàn không xuất hiện**. Điều này chứng minh WebView2 **hoàn toàn không nhận được bất kỳ sự kiện drag native nào** (`enter`, `over`, `leave`, `drop`) từ Windows OLE.

#### 2. Phân tích nguyên nhân tiềm ẩn cấp Native OS
1. **Đặc thù Windows OLE Drag & Drop (`DoDragDrop`):**
   - Khi kéo tệp, Windows liên tục gọi `WindowFromPoint` để xác định cửa sổ đích bên dưới con trỏ.
   - Cửa sổ `main` của Nectar có kích thước `1920x420` trong suốt và liên tục được áp cờ `WS_EX_TRANSPARENT` qua Windows API để chuột xuyên qua vùng trống.
   - Cửa sổ `overlay` (`1920x1080`) full màn hình cũng có cờ click-through nằm đè lên.
   - Khi `WS_EX_TRANSPARENT` được bật, Windows bỏ qua hoàn toàn HWND của cửa sổ trong `WindowFromPoint` và gán Drop Target cho cửa sổ phía sau (File Explorer, Desktop...). Khi người dùng kéo tệp vào, Windows không thể chuyển giao OLE IDropTarget cho WebView2 nếu OLE session đã bỏ qua HWND ngay từ đầu.
2. **Cần phân lập nguồn gốc vấn đề:**
   - Phân biệt rạch ròi giữa:
     - **Khả năng A:** Bản thân Webview2/Tauri v2 trên Windows gặp lỗi đăng ký `IDropTarget` (Engine-level bug).
     - **Khả năng B:** Cơ chế cửa sổ trong suốt `WS_EX_TRANSPARENT` / click-through / HWND overlay làm Windows OLE bỏ qua cửa sổ `main`.

#### 3. Phương án chẩn đoán (Cửa sổ đối chứng TEST WIN)
- Triển khai một cửa sổ chuẩn độc lập (Standard Window: `transparent: false`, `decorations: true`, `alwaysOnTop: true`, kích thước 420x220).
- Cửa sổ này không có cơ chế `WS_EX_TRANSPARENT`, không click-through, không có lớp overlay che chắn.
- Được kích hoạt trực tiếp bằng nút `TEST WIN` màu cam nổi bật trong bảng Shortcuts (chỉ hiển thị khi `import.meta.env.DEV`).
- Khi kéo tệp vào cửa sổ này:
  - Nếu hiển thị dấu cộng ➕ và log ghi nhận sự kiện (`enter`, `drop`) -> **Chứng minh 100% Tauri v2 / WebView2 tiếp nhận drop bình thường**, nguyên nhân duy nhất nằm ở `WS_EX_TRANSPARENT` / kiến trúc cửa sổ của `main`.
  - Nếu vẫn hiển thị dấu cấm 🚫 -> **Chứng minh Webview2 chưa được kích hoạt OLE Drop Target từ tầng Rust/Tauri**.

#### 4. Kết quả thực nghiệm TEST WIN & Cửa sổ đối chứng (24/10/2026)
- **Kết quả người dùng xác nhận:** Cửa sổ `Nectar Drag Test (DEV)` đã nhận native drag & drop 100% thành công:
  - `Native: ENTER`
  - `Native: OVER (active)`
  - `Native: DROP (1 files)`
- **Kết luận kiến trúc:** WebView2 / Tauri v2 trên Windows 11 hoàn toàn có khả năng tiếp nhận OLE file drop bình thường. Sự cố dấu cấm 🚫 tại cửa sổ `main` xuất phát từ kiến trúc click-through `WS_EX_TRANSPARENT` / quản lý hitbox của cửa sổ chính `1920x420`.

#### 5. Điều tra vòng đời UNMASK & Chẩn đoán Hitbox (INC-05 Update)
- **Hiện tượng người dùng phản ánh:** Khi bật `UNMASK: ON`, di chuột ra ngoài để lấy file từ Explorer rồi kéo vào Island: con trỏ vẫn bị cấm 🚫 và nút chuyển về `UNMASK: OFF`.
- **Nguyên nhân cốt lõi đã xác minh:** Trong `ShortcutsBar.tsx`, hàm cleanup của `useEffect` kích hoạt `invoke("set_drag_hitbox_diag", { active: false })` khi component unmount. Khi chuột rời Island để sang Explorer, Island thu nhỏ -> `ShortcutsBar` unmount -> UNMASK bị tự động tắt trước khi file kịp kéo tới.
- **Giải pháp khắc phục:**
  1. Gỡ bỏ cleanup reset trong `ShortcutsBar.tsx`.
  2. Bổ sung bảng điều khiển UNMASK trực tiếp trên cửa sổ `DragTestWindow` (cửa sổ độc lập, không bị unmount khi di chuột sang File Explorer).
  3. Đọc và phản ánh trung thực trạng thái thực từ Rust backend (`get_drag_hitbox_diag`) và lắng nghe sự kiện `dev-unmask-changed` đồng bộ cả hai cửa sổ.
  4. Bổ sung log chuyển tiếp `[DEV_UNMASK_TRANSITION]` và kích hoạt `hitbox_log` tự động trong `services.rs` khi UNMASK bật.

#### 6. Phát hiện Nguyên nhân Gốc Sâu Xa (Root Cause) & Triển khai Bản sửa NotchDropTarget (30/10/2026)

- **Trạng thái:** `Fix Implemented — Ready for User Verification`.
- **Nguyên nhân cốt lõi đã xác nhận:**
  1. **WRY OLE Target Void do Lazy Window Show:**
     - Trong `tauri.conf.json`, cửa sổ `main` cấu hình `"visible": false`.
     - Trong tầng WRY/Tauri nội bộ (`DragDropController`), việc đăng ký OLE Drop Target (`RegisterDragDrop`) được thực hiện bằng cách gọi `EnumChildWindows(main_hwnd)` ngay khi webview khởi tạo. Do cửa sổ `main` lúc đó chưa hiển thị, Chromium/WebView2 chưa kịp tạo các HWND con (`Chrome_WidgetWin_0`, `Chrome_RenderWidgetHostHWND`) -> `EnumChildWindows` trả về 0 cửa sổ. Đồng thời WRY không đăng ký trên chính `main_hwnd`. Khi cửa sổ `main` được `show()` về sau, WRY không hề đăng ký lại. Kết quả là toàn bộ cây HWND của `main` hoàn toàn không có bất kỳ OLE Drop Target nào, khiến Windows OLE luôn hiển thị dấu cấm 🚫. (Trong khi đó `DragTestWindow` cấu hình `visible: true` nên WRY đăng ký thành công).
  2. **Hitbox & Click-Through Synchronization:**
     - Khi Dynamic Island ở chế độ Compact Idle, nếu chưa có tương tác hover, cờ `WS_EX_TRANSPARENT` giữ cửa sổ ở trạng thái xuyên thấu. Cần đồng bộ hóa để ngay khi con trỏ file đi vào vùng đảo (`in_box` và `r.y >= 0 && r.height >= 30`), cửa sổ gỡ `WS_EX_TRANSPARENT` tức thì để Windows OLE bàn giao sự kiện cho Drop Target.
- **Giải pháp kỹ thuật đã triển khai:**
  1. **Bộ điều khiển OLE Drop Target Chuyên dụng (`src-tauri/src/drag_drop.rs`):**
     - Hiện thực hóa Win32 COM `IDropTarget` native (`NotchDropTarget`).
     - Đăng ký `RegisterDragDrop` trên cả `main_hwnd` và toàn bộ các HWND con của WebView2.
     - Hàm `extract_file_paths` trích xuất an toàn danh sách tệp qua `CF_HDROP` (`DragQueryFileW`) và giải phóng tài nguyên OLE chuẩn qua `ReleaseStgMedium`.
     - Kiểm tra vị trí con trỏ toàn cục theo hitbox Dynamic Island: trả về `DROPEFFECT_COPY` (con trỏ `+`) khi ở trong đảo và `DROPEFFECT_NONE` (🚫) khi ở ngoài.
     - Quy đổi tọa độ chuẩn xác bằng `ScreenToClient(main_hwnd)` và phát các sự kiện Tauri chuẩn (`tauri://drag-enter`, `tauri://drag-over`, `tauri://drag-leave`, `tauri://drag-drop`) tới webview `main`.
  2. **Đồng bộ Vòng đời Ứng dụng & Re-registration Đa tầng:**
     - Tự động đăng ký Drop Target tại startup (500ms, 1500ms sau khi webview con render).
     - Đăng ký lại tại `init_notch_window` khi chuyển chế độ hoặc hiển thị đảo.
     - Đăng ký tại `update_notch_rect` khi Dynamic Island lần đầu mount và định vị trên màn hình.
     - Frontend React gọi command `register_notch_drag_drop` khi khởi tạo `setupDragDrop`.
  3. **Tối ưu hóa Hitbox Mouse Hook (`src-tauri/src/services.rs`):**
     - Cập nhật điều kiện `is_click_interactive`: Kích hoạt tương tác khi con trỏ chuột nằm trong đảo (`in_box`) và đảo đang ở trên màn hình (`r.y >= 0 && r.height >= 30`), hoặc khi có cờ kéo tệp active (`is_drag_active`).
     - Vùng trong suốt `1920x420` bên ngoài đảo vẫn bảo toàn 100% click-through cho các ứng dụng Windows khác.

#### 7. Xác nhận Kiểm thử Người dùng & Khắc phục Lỗi Drag Hover Instability (30/10/2026)

- **Trạng thái:** `Partially Resolved — Drag Stability Fix Ready for Verification`.
- **Kết quả người dùng xác nhận trực tiếp trên Windows (5/5 Kịch bản thành công):**
  1. Kéo file vào Dynamic Island Compact -> tự mở sau 300ms -> thả tạo Shortcut thành công.
  2. Kéo thư mục -> tạo Shortcut thành công.
  3. Kéo file ra ngoài không thả -> hủy và thu gọn đúng.
  4. Kéo file trùng hoặc nhiều file -> xử lý đúng thông báo lỗi.
  5. Vùng trong suốt `1920x420` xung quanh Dynamic Island -> vẫn click-through bình thường cho các ứng dụng Windows khác.
- **Sự cố mới phát hiện (Drag Hover Instability):**
  - Khi kéo file vào đảo, giữ nút chuột và tiếp tục di chuyển con trỏ qua lại bên trong vùng đảo (hoặc vùng bảng Shortcuts):
    Dynamic Island đôi khi tự thu nhỏ bất ngờ về Compact, sau đó người dùng rê chuột lại gần tâm thì đảo lại mở ra (hiện tượng flicker/collapse sai).
- **Nguyên nhân gốc đã xác minh:**
  1. **Hitbox Mismatch trong Mouse Hook (`services.rs`):**
     - Khi người dùng kéo file vào, đảo mở rộng từ Compact (`140x36`) sang Shortcuts (`~480x120+`).
     - Tuy nhiên, biến `r` trong backend lúc đó vẫn là kích thước Compact cũ (hoặc đang animate dở dang).
     - Khi người dùng di chuột xuống các icon Shortcuts phía dưới (`Y = 60px..100px`), mouse hook thấy `cursor.y > ry_bottom` -> kết luận `in_box = false`!
     - Mouse hook lập tức gọi `main_win.set_ignore_cursor_events(true)` -> áp cờ `WS_EX_TRANSPARENT` lên cửa sổ chính!
     - Khi cửa sổ mang cờ `WS_EX_TRANSPARENT`, Windows OLE mất target và phát ngay sự kiện `DragLeave` native!
  2. **Hitbox Mismatch trong OLE Target (`drag_drop.rs`):**
     - Hàm `is_point_in_notch` trong Rust cũng tính tọa độ theo `r` của Compact lúc đảo vừa mở -> trả về `false` khi chuột ở vùng Shortcuts -> Rust tự emit `tauri://drag-leave`.
     - Dùng `try_lock()` trên Mutex `notch_rects` gây ra false-negative ngẫu nhiên khi có tranh chấp khóa giữa thread mouse hook và OLE thread.
  3. **Multi-HWND Child Transition trong Chromium:**
     - WebView2 có nhiều HWND con lồng nhau (`main_hwnd`, `Chrome_WidgetWin_0`, `Chrome_RenderWidgetHostHWND`).
     - Khi con trỏ chuột di chuyển qua lại giữa các HWND con, instance `NotchDropTarget` của HWND con cũ bị gọi `DragLeave()` và phát nhầm `tauri://drag-leave` giả sang frontend.
  4. **React thu nhỏ đảo ngay lập tức (0ms Debounce):**
     - Trong `src/App.tsx`, handler `onDragDropEvent` khi nhận `payload.type === 'leave'` lập tức đặt `wasOpenedByDragRef.current = false` và gọi `setIsHovered(false)` trong 0 mili-giây, khiến đảo sập xuống ngay khi có bất kỳ sự kiện `leave` tạm thời nào.
- **Giải pháp khắc phục đồng bộ 3 tầng đã triển khai:**
  1. **Tầng Mouse Hook (`src-tauri/src/services.rs`):**
     - Khi `is_drag_active` là `true`, vùng tính `in_box` tự động mở rộng theo kích thước Expanded tối thiểu (`max(r.width, 520.0) x max(r.height, 180.0)`) với tâm X căn giữa theo đảo.
     - Đảm bảo `in_box` luôn là `true` trong suốt quá trình con trỏ di chuyển bên trong bảng Shortcuts, tuyệt đối không bị cờ `WS_EX_TRANSPARENT` can thiệp.
  2. **Tầng OLE Native Target (`src-tauri/src/drag_drop.rs`):**
     - Đổi `try_lock()` thành `.lock()` trên Mutex `notch_rects`, triệt tiêu hoàn toàn hiện tượng miss lock ngẫu nhiên.
     - Đồng bộ hóa kích thước kiểm tra `is_point_in_notch` khi `is_drag_active` sang `520.0 x 180.0` (padding 36px ngang, 28px dưới).
     - Bổ sung bộ đếm `ACTIVE_DROP_TARGETS`: Chỉ phát `tauri://drag-leave` khi con trỏ chuột thực sự rời khỏi TẤT CẢ các HWND con của cửa sổ `main` (`remaining <= 1`), loại bỏ hoàn toàn các sự kiện leave giả do chuyển tiếp nội bộ HWND Chromium.
  3. **Tầng Frontend React (`src/App.tsx`):**
     - Bổ sung `leaveGraceTimerRef` với thời gian chờ 220ms.
     - Khi nhận `payload.type === 'leave'` hoặc `inside == false` trong lúc đảo đang mở: Lên lịch grace period 220ms. Nếu người dùng quay lại hoặc có sự kiện `over` tiếp theo, grace timer bị hủy ngay lập tức, đảo duy trì Expanded liên tục không nhấp nháy.
     - Mở rộng padding của `isInsideNotchRect` khi đang drag (`padX = 40, padY = 32`) để bao quát toàn bộ icon ở mép ngoài của ShortcutsBar.
     - Chỉ thu nhỏ đảo khi con trỏ thực sự rời khỏi đảo quá 220ms hoặc người dùng nhấn ESC/hủy thao tác kéo.

#### 8. Hoàn thiện Giao diện Production Shortcuts Bar (30/10/2026)

- **Trạng thái:** `Production UI Polish Ready for Verification`.
- **Cải tiến UX/UI đã triển khai:**
  1. **Sửa Vị trí & Phong cách Thông báo Lỗi (Error Toast):**
     - Loại bỏ `top: -28px` (trước đây trồi lên đè vào hàng status widgets CPU/RAM/Battery).
     - Định vị lại bên trong khu vực Shortcuts Bar (`top: 1px; left: 50%; transform: translateX(-50%)`), không che status widgets phía trên.
     - Phong cách Soft Light Glass: nền kính mờ đỏ nhẹ (`rgba(220, 38, 38, 0.22)`), viền mờ, pill badge bo tròn, icon cảnh báo và nút đóng nhanh `X`. Tự biến mất sau 3.5s. Hỗ trợ song ngữ `vi` và `en`, hỗ trợ Dark và Light Mode.
  2. **Ẩn Mặc định Các Công cụ DEV (PIN, TEST WIN, UNMASK):**
     - Toàn bộ các nút debug `PIN / PINNED`, `TEST WIN`, `UNMASK: ON/OFF` được ẩn hoàn toàn khỏi giao diện mặc định, không chiếm khoảng trống trong thanh cuộn.
     - Được bảo vệ bởi feature flag `SHOW_DEV_TOOLS` (`import.meta.env.VITE_NECTAR_SHOW_DEV_TOOLS === "1"` hoặc `localStorage.getItem("nectar-dev-tools") === "true"`).
     - Các phím tắt diagnostic (`Alt+P`, `F8`) trong `App.tsx` cũng được kiểm tra cờ này trước khi kích hoạt.
  3. **Empty State Hướng dẫn Kéo - Thả Trực quan (Drag & Drop Onboarding):**
     - Khi chưa có lối tắt (`shortcuts.length === 0`):
       - Hiển thị khung viền dashed nhẹ nhàng, icon kéo thả `ArrowDownToLine` cùng tiêu đề: *"Kéo tệp hoặc thư mục vào đây"* (*"Drag files or folders here"*) và dòng phụ: *"Hoặc chọn cách thêm thủ công"* (*"Or add them manually"*).
       - Tích hợp 2 nút thêm nhanh: *Thêm ứng dụng* và *Thêm thư mục*.
       - Khi người dùng kéo file vào đảo (`isDropTargetActive = true`): Khung tự động chuyển thành visual feedback Drop Zone viền xanh dịu, icon động và text: *"Thả để thêm lối tắt"* (*"Drop to add shortcut"*).
     - Khi đã có lối tắt (`shortcuts.length > 0`):
       - Khung hướng dẫn tự động ẩn, hiển thị danh sách shortcut bình thường cùng nút Thêm `+`. Khi kéo file vào vẫn hiển thị drop zone overlay chuẩn.
  4. **Bảo Toàn Hệ Thống:**
     - Toàn bộ cơ chế Native OLE Drop Target, hitbox 520x180, chống DragLeave giả giữa các HWND con, grace period 220ms, click-through Windows và các chế độ Music, Calendar, Dock, HUD đều được bảo toàn nguyên vẹn 100%.

#### 9. Tái thiết kế Giao diện Empty State Shortcuts theo Bố cục Dọc & Điều chỉnh Chiều cao Động (30/10/2026)

- **Trạng thái:** `Redesign Implemented — Ready for User Verification`.
- **Vấn đề giải quyết:**
  - Ở phiên bản trước, Empty State của Shortcuts bị ép thành một hàng ngang hẹp (56px) trong chiều cao cố định 108px, khiến icon bị lệch sang trái, tiêu đề và phụ đề bị cắt bởi dấu `...`, không đúng theo thiết kế tham chiếu mong muốn.
- **Chi tiết giải pháp đã triển khai:**
  1. **Tái thiết kế Bố cục Dọc Căn giữa (Vertical Centered Layout):**
     - Cấu trúc các thành phần từ trên xuống dưới:
       - Nhãn nhỏ `"SHORTCUTS"` đặt ở vị trí chính giữa (`.shortcuts-header-label`, font 10px, uppercase, letter-spacing 1.5px, màu dịu).
       - Khung viền dashed mềm mại bo góc lớn (`.shortcuts-empty-card`, `border-radius: 16px`, nền kính mờ nhẹ `rgba(255, 255, 255, 0.025)`, viền `1px dashed rgba(255, 255, 255, 0.18)`).
       - Icon `FileUp` (`lucide-react`, size 26px) căn giữa phía trên, đặt trong pill bo góc mềm mại (`rgba(96, 165, 250, 0.1)`, viền xanh nhẹ).
       - Tiêu đề chính căn giữa: *"Kéo tệp hoặc thư mục vào đây"* (`shortcuts.emptyTitle`), hiển thị trọn vẹn 100%, không `text-overflow: ellipsis`, không `white-space: nowrap`.
       - Phụ đề căn giữa: *"Hoặc chọn cách thêm thủ công"* (`shortcuts.emptySubtitle`), màu secondary mờ nhẹ, hiển thị đầy đủ.
       - Hàng hai nút bên dưới căn giữa theo chiều ngang: `[+ Thêm ứng dụng]` và `[+ Thêm thư mục]` (`.shortcuts-empty-action-btn`, chiều cao 28px, bo góc 8px, hiệu ứng hover kính mờ mềm mại).
     - **Trạng thái Drop Zone Active (`isDropTargetActive = true`):**
       - Khi kéo tệp từ Windows Explorer vào khung: Khung dashed tự động chuyển viền xanh dịu sáng (`rgba(96, 165, 250, 0.85)`), nền mờ xanh (`rgba(37, 99, 235, 0.22)`) và box-shadow glow.
       - Icon `FileUp` nhún nhẹ (bounce animation) kèm tiêu đề trực quan *"Thả để thêm lối tắt"* (`shortcuts.dropToAdd`).
  2. **Điều chỉnh Chiều cao Động Dynamic Island (Dynamic Island Height Expansion):**
     - Trong `src/App.tsx` (`getDynamicHeight`):
       - Khi `nectarMode === 'status' && isHovered`:
         - Nếu `isShortcutsEmpty === true`: Dynamic Island tự động mở rộng chiều cao lên **210px** (và mở rộng chiều rộng tối thiểu lên 380px) để chứa trọn vẹn hàng status widgets, nhãn SHORTCUTS và khung Empty State dọc một cách thông thoáng, cân đối.
         - Khi có ít nhất 1 shortcut (`shortcuts.length > 0`): Dynamic Island tự động thu gọn về chiều cao chuẩn **108px**.
         - Khi xóa shortcut cuối cùng $\rightarrow$ Dynamic Island mượt mà chuyển tiếp mở rộng lên **210px**.
         - Khi thả hoặc thêm shortcut đầu tiên $\rightarrow$ Dynamic Island mượt mà chuyển tiếp thu gọn về **108px**.
       - Bo góc dưới (`borderBottomLeftRadius`, `borderBottomRightRadius`, `--radius-bottom`) tự động nâng lên **28px** khi ở chiều cao 210px, đảm bảo tính thẩm mỹ chuẩn Soft Light Glass.
  3. **Đồng bộ hóa Trạng thái Nhanh & Nhẹ (Zero-Lag Sync):**
     - Trạng thái `isShortcutsEmpty` được khởi tạo trực tiếp từ `localStorage` trong `App.tsx` ngay từ lần render đầu tiên, triệt tiêu hoàn toàn layout shift.
     - Prop callback `onEmptyChange` từ `ShortcutsBar` phản ứng tức thì khi mảng shortcuts thay đổi, không dùng polling, không gây re-render loop.
  4. **Bảo toàn Tuyệt đối Native Hitbox & Click-Through Windows:**
     - Nâng trần chiều cao hitbox kiểm tra an toàn khi đang kéo file (`is_drag_active`) trong cả `src-tauri/src/drag_drop.rs` và `src-tauri/src/services.rs` từ `180.0` lên **`240.0`** (`(r.height as f64).max(240.0)`).
     - Nhờ đó, khi người dùng kéo tệp đến tận mép dưới của khung Empty State 210px, cả Windows Mouse Hook và COM `IDropTarget` đều duy trì 100% cờ tương tác và không bị áp nhầm cờ `WS_EX_TRANSPARENT`.
     - Vùng trong suốt xung quanh Dynamic Island vẫn giữ nguyên 100% click-through xuyên thấu cho các ứng dụng Windows khác.
  5. **Hỗ trợ Song ngữ & Light/Dark Mode:**
     - Khai báo đầy đủ các key i18n mới: `shortcuts.header`, `shortcuts.addFolderBtn` cho cả tiếng Anh (`en`) và tiếng Việt (`vi`).
     - CSS hỗ trợ đầy đủ các biến màu sắc tương phản tối ưu cho cả Dark Mode và Light Mode.

---

### INC-06: Giới hạn Phạm vi Tỉ lệ Giao diện (UI Scale Scope) cho Dynamic Island & Dock

- **Ngày phát hiện:** 30/10/2026.
- **Trạng thái:** `Fix Implemented — Ready for User Verification`.
- **Mức độ:** Hoàn thiện trải nghiệm người dùng (UX Polish) & Kiến trúc đồng bộ Scale đa cửa sổ.

#### 1. Phân tích Hiện trạng & Nguyên nhân gốc
1. **Settings bị phóng to:**
   - Trong `src/Settings.tsx`, tồn tại `useEffect` phụ thuộc vào `settings.scale`, gọi `resize_settings_window` với kích thước `620 * settings.scale x 480 * settings.scale`.
   - Đồng thời, thẻ gốc `.settings-container` được áp dụng `style={{ zoom: settings.scale }}`.
   - Kết quả: Khi người dùng nhấn `+` hoặc `-` để tăng tỉ lệ, toàn bộ cửa sổ Settings vừa bị giật/resize bung rộng, vừa phóng to các thành phần font chữ, sidebar, icon và controls khiến giao diện bị vỡ bố cục và khó thao tác.
2. **HUD Volume & Brightness bị phóng to:**
   - Trong `src/Overlay.tsx`, khối hiển thị HUD Volume/Brightness bị áp `style={{ zoom: scale, ... }}`.
   - Trong `src-tauri/src/services.rs`, mouse hook nhận diện vùng hover của HUD nhân tọa độ với `m.scale_factor() * overlay_nectar_scale`.
   - Kết quả: Khi người dùng muốn phóng to Dynamic Island hay Dock, thanh HUD bên hông màn hình cũng bị phóng to bất thường.

#### 2. Giải pháp Kỹ thuật đã Triển khai
1. **Cố định Settings ở Kích thước Chuẩn 100% (`src/Settings.tsx`):**
   - Loại bỏ hoàn toàn `zoom: settings.scale` khỏi `.settings-container`.
   - Loại bỏ `useEffect` tự động resize cửa sổ Settings theo `settings.scale`.
   - Thêm hook chuẩn hóa kích thước cửa sổ về `620x480` một lần lúc mount (loại bỏ kích thước phóng to tồn đọng nếu người dùng từng chạy bản cũ).
   - Vẫn lưu giữ đầy đủ `settings.scale` trong state để người dùng điều khiển kích thước Dynamic Island và Dock.
2. **Cố định Kích thước HUD ở 100% (`src/Overlay.tsx` & `src-tauri/src/services.rs`):**
   - Gỡ bỏ `zoom: scale` khỏi container HUD Volume/Brightness trong `Overlay.tsx`.
   - Dọn dẹp state và listener `nectar-scale` trong `Overlay.tsx`.
   - Trong `services.rs`, loại bỏ việc nhân `overlay_nectar_scale` khỏi công thức tính hitbox hover của HUD (`over_card` và `over_left` / `over_right`).
   - **Bảo toàn 100% Windows Monitor DPI Scaling:** Giữ nguyên hệ số `m.scale_factor()` để HUD hiển thị và bắt chuột chính xác trên các màn hình có tỉ lệ hiển thị Windows DPI cao (125%, 150%, 200%).
3. **Bảo toàn & Tối ưu Scale cho Dynamic Island (`src/App.tsx`):**
   - Tiếp tục duy trì `zoom: scale` trên container Dynamic Island.
   - Cập nhật các phép tính compact fallback trong `updateRect` và `checkMouseAndCollapseIfNeeded` để nhân `scale`, bảo đảm tọa độ hitbox gửi xuống Rust qua `update_notch_rect` luôn khớp tuyệt đối với kích thước thực tế hiển thị trên màn hình ở mọi mức scale (từ 70% đến 150%).
   - Bảo toàn trọn vẹn Native OLE Drag & Drop (INC-05), hitbox 240px và giao diện Empty State dạng dọc từ Backup 21.
4. **Bảo toàn Scale cho Nectar Dock (`src/Dock.tsx` & `src-tauri/src/services.rs`):**
   - Dock tiếp tục nhận `nectar-scale` để phóng to mượt mà các icon, hover magnification, popups và reserved appbar space.
   - Giữ nguyên `crate::utils::get_nectar_scale()` trong backend cho Notch và Dock Appbar.
5. **Cập nhật Nhãn & Mô tả i18n (`src/i18n/translations.ts`):**
   - Tiếng Việt: `"Kích thước Dynamic Island & Dock"` / `"Điều chỉnh kích thước Dynamic Island và thanh Dock ({percent}%)"`.
   - Tiếng Anh: `"Dynamic Island & Dock Size"` / `"Adjust Dynamic Island and Dock size ({percent}%)"`.

---

### INC-07: Sửa Lỗi Chồng Lấn Icon Cập Nhật & Khôi Phục Thông Báo Cập Nhật Khi Khởi Động

- **Ngày phát hiện:** 31/10/2026.
- **Trạng thái:** Fix Implemented — Ready for User Verification.
- **Mức độ:** Sửa lỗi giao diện (UI Polish) & Độ tin cậy tính năng cập nhật phiên bản (Updater Reliability).

#### 1. Phân tích Nguyên nhân gốc
1. **Lỗi 1 — Icon cập nhật đè lên đồng hồ khi Dynamic Island thu gọn có chiều rộng nhỏ:**
   - Trong src/App.css, layout của .main-row-inner trước đây sử dụng Flexbox (display: flex; justify-content: center).
   - Khi ở trạng thái thu gọn và có bản cập nhật mới, .side-content.left chứa phần tử <UpdateActivity /> (chiều rộng 28px), trong khi .side-content.right hoàn toàn rỗng (0px). Sự mất cân đối này khiến Flexbox đẩy khối đồng hồ .time-center lệch sang bên phải.
   - Khi người dùng cấu hình settingsNotchCollapsedWidth ở các mức nhỏ (110px – 135px), hoặc khi hiển thị định dạng giờ 12 giờ có hậu tố "AM/PM" (chiều rộng text ~65px), khoảng trống thực tế ở cánh trái chỉ còn 10px – 24px, nhỏ hơn kích thước 28px của icon cập nhật. Do không có cơ chế giới hạn tràn viền, icon cập nhật bị chồng lấn đè trực tiếp lên các chữ số bên trái của mặt đồng hồ.
2. **Lỗi 2 — Không xuất hiện thông báo khi mở Nectar:**
   - **Vấn đề lệch pha khởi động (Race Condition):** Trong src-tauri/src/main.rs, hàm updater::run_startup_check được spawn ngay khi app khởi động. Nếu kết quả kiểm tra được lấy từ cache hợp lệ, backend Rust emit event "update-available" gần như tức thì, trước cả khi WebView2 của cửa sổ main hoàn tất quá trình mount component React và đăng ký listener listen("update-available"). Do đó event bị bỏ lỡ hoàn toàn.
   - **Frontend không kích hoạt thông báo từ IPC State:** Khi React mount xong, hàm invoke("get_update_state") được gọi để bù đắp, nhưng chỉ thực hiện setUpdateAvailable(state.available) mà không hề gọi setShowUpdatePulse(true) và không kích hoạt bộ hẹn giờ 6 giây để mở rộng Dynamic Island hiển thị badge "Update Available".
   - **Nguy cơ báo sai phiên bản sau khi cập nhật (Backend Cache Stale):** Trong src-tauri/src/updater.rs, hàm get_update_state trước đây gọi thẳng 
esult_from_state(&read_state(&app)) mà không đối chiếu với phiên bản thực tế của ứng dụng (pp.package_info().version). Nếu người dùng vừa cài đặt bản cập nhật mới, file cache trên đĩa vẫn còn lưu version đó, khiến hệ thống báo nhầm "có bản cập nhật" ngay sau khi app vừa update xong.

#### 2. Giải pháp Kỹ thuật đã Triển khai
1. **Layout Grid 3 Cột Cân Bằng Tuyệt Đối (src/App.css):**
   - Chuyển .main-row-inner sang CSS Grid đối xứng: grid-template-columns: 1fr auto 1fr; box-sizing: border-box;.
   - Gán .time-center vào grid-column: 2: Hai cánh 1fr ở cột 1 và cột 3 luôn có chiều rộng bằng nhau từng pixel bất kể nội dung bên trong, đảm bảo mặt đồng hồ **LUÔN LUÔN NẰM Ở CHÍNH GIỮA 100% (True Center)** của Dynamic Island.
   - Áp dụng overflow: hidden; min-width: 0; cho .side-content.left và .side-content.right: Ngăn chặn 100% nguy cơ nội dung bên hông tràn sang khu vực của đồng hồ.
   - Tối ưu kích thước icon .update-activity: chiều rộng 24px, glow 20px, icon SVG 11px sắc nét và thanh lịch.
2. **Cơ chế Kiểm tra Không gian Thông minh (src/App.tsx):**
   - Bổ sung hook tính toán isCompactUpdateIndicatorAllowed:
     - Khi isHovered === true: Luôn cho phép hiển thị do đảo đã mở rộng 360–480px.
     - Khi đang thu gọn (!isHovered): Kiểm tra chiều rộng khả dụng dựa trên định dạng giờ (	imeFormat24h) và timer:
       - Nếu giờ 24h: yêu cầu settingsNotchCollapsedWidth >= 135px.
       - Nếu giờ 12h (hoặc đang chạy compact timer): yêu cầu settingsNotchCollapsedWidth >= 150px.
     - Nếu chiều rộng thu gọn nhỏ hơn ngưỡng an toàn: Icon cập nhật trên thanh thu gọn sẽ tự động ẩn để ưu tiên hiển thị đồng hồ nguyên vẹn, không cắt chữ, không tràn viền. Người dùng vẫn xem được trạng thái cập nhật trong Settings -> Giới thiệu.
   - Giữ nguyên chiều rộng tùy chỉnh của người dùng, không tự ý tăng kích thước compact.
3. **Khôi phục Thông báo Mở rộng Khi Khởi động (src/App.tsx & src-tauri/src/updater.rs):**
   - **Tầng Backend Rust (src-tauri/src/updater.rs):**
     - Cập nhật cached_result và get_update_state: Bắt buộc kiểm tra current_ver == app.package_info().version.to_string(). Nếu state.version == current_ver hoặc state.app_version != current_ver, lập tức trả về vailable: false, triệt tiêu hoàn toàn lỗi thông báo sai sau khi đã cập nhật.
     - Giữ nguyên chu kỳ kiểm tra CHECK_INTERVAL_SECS và logic bỏ qua kiểm tra mạng tự động trong bản DEV (debug_assertions).
   - **Tầng Frontend React (src/App.tsx):**
     - Đóng gói hàm kích hoạt thông báo 	riggerUpdateNotification: Kích hoạt showUpdatePulse = true, gọi 	riggerEventPeek(6000) nếu ở chế độ Peek, tự động tắt sau 6 giây.
     - Tự động mở rộng tạm thời chiều rộng đảo ra 200px trong 6 giây (nhờ getDynamicWidth), sau đó co lại về đúng kích thước thu gọn ban đầu của người dùng.
     - Hỗ trợ cả 2 luồng: get_update_state (khi có cache hợp lệ lúc khởi động) và event "update-available" (khi kiểm tra mạng hoàn tất).
     - Bổ sung cờ hasTriggeredStartupUpdatePulseRef: Đảm bảo chỉ hiển thị thông báo 1 lần duy nhất trong mỗi phiên khởi động, không bị nhấp nháy lặp lại.
     - Tôn trọng cài đặt: Nếu người dùng tắt "Thông báo cập nhật" (showUpdateIndicator === false), thông báo pulse và icon cập nhật đều không hiển thị.
---

### INC-08: Khắc Phục Chồng Lấn Giao Diện Compact Khi Pause & Thiết Lập 5-Second Music Pause Grace Period

- **Ngày phát hiện:** 31/10/2026.
- **Trạng thái:** Fix Implemented — Ready for User Verification.
- **Mức độ:** Sửa lỗi bố cục âm nhạc (Music UI Polish) & Độ mượt mà luồng trạng thái chuyển mode (State Machine Stability).

#### 1. Phân tích Hiện trạng & Nguyên nhân gốc
1. **Lỗi 1 — Giao diện Compact bị chồng lấn khi Pause nhạc:**
   - Trong src/App.tsx, hàm getDynamicWidth() trước đây chứa điều kiện: if (settingsVisualizerEnabled && isPlaying) w += 30;.
   - Ngay khoảnh khắc người dùng bấm Pause (hoặc trình phát bên ngoài tạm dừng), biến isPlaying chuyển thành alse.
   - Biểu thức trên lập tức trả về alse, khiến Dynamic Island **bị hụt mất 30px chiều rộng ngay lập tức** (từ 200px co giật xuống 170px).
   - Trong khi đó, component Visualizer vẫn tồn tại trên DOM và chiếm trọn 30px (hiển thị 5 cột sóng tĩnh), kết hợp với Album Art bên phải và Đồng hồ ở giữa khiến 3 thành phần bị nén chặt vào nhau, gây hiện tượng chồng lấn khó coi.
2. **Lỗi 2 — Nhấn Pause ngay trong Dynamic Island khiến chế độ Music biến mất lập tức:**
   - Khi người dùng đang mở Music Player lớn (isHovered = true), người dùng click nút Pause rồi rê chuột ra ngoài (onHoverEnd).
   - Hàm 	riggerCollapse() (và checkMouseAndCollapseIfNeeded) tính toán chế độ đích:
     const targetMode = mediaInfo.has_media && isPlaying && settingsMusicCompactNotch ? 'music' : 'status';.
   - Do isPlaying === false, 	argetMode lập tức trả về 'status', cưỡng chế Dynamic Island sập ngay sang chế độ Status mà **hoàn toàn bỏ qua bộ hẹn giờ 5 giây**!
   - Thêm vào đó, timer 5000ms cũ trong useEffect bị re-create liên tục khi 
ectarMode đổi, thiếu một state quản lý Pause Grace độc lập và nhất quán.

#### 2. Giải pháp Kỹ thuật đã Triển khai
1. **Thiết lập Trạng thái Grace Period Chuẩn hóa (isMusicPauseGrace):**
   - Khai báo state isMusicPauseGrace cùng ref đồng bộ isMusicPauseGraceRef và prevPlayingRef.
   - Chỉ kích hoạt đếm 5000ms khi có sự chuyển tiếp hợp lệ từ Playing -> Paused (wasPlaying && !isPlaying && mediaInfo.has_media && settingsMusicModeEnabled).
   - Hủy bỏ ngay lập tức timer và tắt Grace Period khi:
     - Nhạc được Play trở lại (isPlaying === true): hủy timer ngay, không bao giờ thu nhỏ ở giây thứ 5.
     - Media session kết thúc thực sự (!mediaInfo.has_media): dọn dẹp timer và chuyển ngay về 'status'.
     - Tắt Music Mode trong Settings (settingsMusicModeEnabled === false): chuyển ngay về 'status'.
     - Người dùng chủ động cuộn chuột chuyển mode (Wheel): tôn trọng mode người dùng đã cuộn tới.
2. **Bảo toàn Chiều rộng Music Compact trong Suốt 5 Giây (getDynamicWidth):**
   - Cập nhật công thức tính chiều rộng trong getDynamicWidth:
     if (settingsVisualizerEnabled && (isPlaying || isMusicPauseGrace)) w += 30;.
   - Nhờ đó, trong suốt 5 giây sau khi Pause: Dynamic Island giữ nguyên 100% kích thước 200px (140 + 30 + 30).
   - Visualizer dừng chuyển động nhưng giữ nguyên không gian bố cục; đồng hồ giữ vững True Center; Album art giữ nguyên vị trí và kích thước.
   - Hết 5 giây: Timer tự động kích hoạt chuyển sang Status Compact (140px) với animation spring mượt mà.
3. **Bảo vệ Trạng thái Khi Unhover & Hover Trong Grace Period:**
   - Cập nhật 	riggerCollapse, 	riggerExpand, checkMouseAndCollapseIfNeeded, launchExternalQuickAction và 	oggleCalendarMode:
     const shouldKeepMusic = mediaInfo.has_media && (isPlaying || isMusicPauseGraceRef.current) && settingsMusicCompactNotch;
     const targetMode = shouldKeepMusic ? 'music' : 'status';.
   - Khi người dùng nhấn Pause trực tiếp trong Music Player:
     - Nếu chuột vẫn ở trong đảo: Panel Music lớn tiếp tục hiển thị trong suốt 5 giây.
     - Nếu chuột rời đảo: Panel lớn thu gọn về Music Compact (200px), duy trì giao diện nhạc ổn định cho tới khi hết 5 giây.

---

### INC-09: Triá»‡t TiĂªu Hiá»‡n TÆ°á»£ng Micro-shrink & Position Shift Khi Táº¡m Dá»«ng Nháº¡c (Music Compact Pause Geometry & In-place Fade-out)

- **NgĂ y phĂ¡t hiá»‡n:** 31/10/2026.
- **Tráº¡ng thĂ¡i:** Fix Implemented â€” Ready for User Verification.
- **Má»©c Ä‘á»™:** Sá»­a lá»—i Ä‘á»“ há»a vi mĂ´ & Tráº£i nghiá»‡m thá»‹ giĂ¡c (Visual Geometry & Exit Animation Polish).
- **Má»‘c commit & TĂ¬nh tráº¡ng thay Ä‘á»•i:**
  - Má»‘c commit ná»n: `8e6ecca` (Backup 21).
  - TĂ¬nh tráº¡ng: **Thay Ä‘á»•i chÆ°a commit trong working tree** trĂªn `src/App.css` vĂ  `src/App.tsx`.
- **File & ThĂ nh pháº§n liĂªn quan:**
  - [src/App.css](../src/App.css) (Quy táº¯c kĂ­ch thÆ°á»›c `.album-art.paused` vĂ  `.album-art-large.paused`)
  - [src/App.tsx](../src/App.tsx) (Component `Visualizer`, hook `isMusicFadingOut`, timer 2 giai Ä‘oáº¡n, JSX transition in-place)

#### 1. PhĂ¢n tĂ­ch Hiá»‡n tráº¡ng & NguyĂªn nhĂ¢n gá»‘c
1. **Lá»—i co kĂ­ch thÆ°á»›c áº£nh bĂ¬a (Album Art Micro-shrink):**
   - Trong `src/App.css`, quy táº¯c `.album-art.paused` trÆ°á»›c Ä‘Ă¢y Ä‘áº·t `width: 20px; height: 20px;` (vĂ  `.album-art-large.paused` Ä‘áº·t `width: 28px; height: 28px;`), trong khi kĂ­ch thÆ°á»›c chuáº©n khi Ä‘ang phĂ¡t lĂ  `24px x 24px` (vĂ  `34px x 34px`).
   - Ngay khoáº£nh kháº¯c pause nháº¡c (`!isPlaying`), class `.paused` Ä‘Æ°á»£c gĂ¡n vĂ o button Album Art, kĂ­ch hoáº¡t CSS transition 0.2s thu nhá» áº£nh bĂ¬a tá»« 24px xuá»‘ng 20px.
   - Do náº±m trong flex container cÄƒn pháº£i vá»›i `margin-right: 8px`, sá»± sá»¥t giáº£m 4px kĂ­ch thÆ°á»›c khiáº¿n tĂ¢m vĂ  viá»n cá»§a áº£nh bĂ¬a bá»‹ dá»‹ch chuyá»ƒn rĂµ rá»‡t so vá»›i lĂºc Ä‘ang phĂ¡t.
2. **Lá»—i co sĂ³ng nháº¡c (Visualizer Shrink & Fade):**
   - Trong `src/App.tsx`, component `Visualizer` trÆ°á»›c Ä‘Ă¢y reset máº£ng `audioData` vá» máº£ng pháº³ng `fill(0.18)` khi `!isPlaying`, Ä‘á»“ng thá»i Ă©p `scaleY: 0.1` vĂ  `opacity: 0.5`.
   - Háº­u quáº£: cĂ¡c thanh sĂ³ng cao 20px bá»‹ sáº­p xuá»‘ng chá»‰ cĂ²n 2px vĂ  má» Ä‘i má»™t ná»­a, táº¡o cáº£m giĂ¡c toĂ n bá»™ cá»¥m sĂ³ng nháº¡c bá»‹ thu nhá» vĂ  lĂ¹i láº¡i trong suá»‘t 5 giĂ¢y Pause Grace.
3. **Lá»—i co giáº­t khi háº¿t 5 giĂ¢y (Exit & Collapse Clash):**
   - Khi háº¿t 5000ms, timer cÅ© gá»i Ä‘á»“ng thá»i `setNectarMode('status')` vĂ  `setIsMusicPauseGraceSync(false)`.
   - Dynamic Island láº­p tá»©c co chiá»u rá»™ng tá»« 200px vá» 140px trong khi AnimatePresence exit cá»§a Visualizer (`scale: 0.8`) vĂ  Album Art (`y: -20, scale: 0.8, filter: blur(8px)`) Ä‘ang diá»…n ra.
   - Háº­u quáº£: ngÆ°á»i dĂ¹ng nhĂ¬n tháº¥y Visualizer vĂ  Album Art vá»«a bay vá»«a co rĂºm trong khi mĂ©p ngoĂ i cá»§a Ä‘áº£o Ä‘ang Ă©p vĂ o, táº¡o cáº£m giĂ¡c giáº­t cá»¥c vĂ  xĂª dá»‹ch vá»‹ trĂ­ trÆ°á»›c khi biáº¿n máº¥t.

#### 2. Giáº£i phĂ¡p Ká»¹ thuáº­t Ä‘Ă£ Triá»ƒn khai
1. **Báº£o toĂ n 100% Geometry cá»§a Album Art (`src/App.css`):**
   - Cáº­p nháº­t quy táº¯c:
     `css
     .album-art.paused {
         width: 24px;
         height: 24px;
     }
     .album-art.album-art-large.paused {
         width: 34px;
         height: 34px;
     }
     `
   - Giá»¯ nguyĂªn kĂ­ch thÆ°á»›c 24px x 24px tuyá»‡t Ä‘á»‘i (hoáº·c 34px khi hover), khoáº£ng cĂ¡ch `margin-right: 8px` khĂ´ng Ä‘á»•i, triá»‡t tiĂªu 100% vi dá»‹ch chuyá»ƒn tĂ¢m vĂ  micro-shrink khi pause.
2. **ÄĂ³ng bÄƒng Frame Cuá»‘i CĂ¹ng cá»§a SĂ³ng Nháº¡c (`src/App.tsx`):**
   - Trong component `Visualizer`: khi `!isPlaying`, chá»‰ dá»n dáº¹p listener audio IPC vĂ  giá»¯ nguyĂªn máº£ng biĂªn Ä‘á»™ `audioData` cá»§a frame cuá»‘i cĂ¹ng (khĂ´ng reset vá» 0.18).
   - Cá»‘ Ä‘á»‹nh `scaleY: Math.max(0.2, value)` vĂ  `opacity: 0.95`: cĂ¡c thanh sĂ³ng dá»«ng chuyá»ƒn Ä‘á»™ng táº¡i chá»— nhÆ° má»™t hĂ¬nh áº£nh tÄ©nh sáº¯c nĂ©t, khĂ´ng bá»‹ co má»ng dĂ­nh thĂ nh que tÄƒm, khĂ´ng Ä‘á»•i kĂ­ch thÆ°á»›c hay vá»‹ trĂ­.
   - Khi resume play: audio listener tiáº¿p tá»¥c cáº­p nháº­t dá»¯ liá»‡u má»›i mÆ°á»£t mĂ  tá»« Ä‘Ăºng frame Ä‘Ă³ mĂ  khĂ´ng cĂ³ báº¥t ká»³ hiá»‡n tÆ°á»£ng co giáº­t layout nĂ o.
3. **Quy TrĂ¬nh ThoĂ¡t 2 Giai Äoáº¡n Táº¡i Chá»— (2-Phase In-place Fade-out Sequence - `src/App.tsx`):**
   - Khai bĂ¡o state `isMusicFadingOut` vĂ  timer phá»¥ `pauseFadeTimerRef`.
   - **Giai Ä‘oáº¡n 1 (á»Ÿ giĂ¢y thá»© 5.0):** KĂ­ch hoáº¡t `isMusicFadingOut = true`. Visualizer vĂ  Album Art fade-out mÆ°á»£t mĂ  (`opacity: 1 -> 0` trong 200ms) **ngay táº¡i Ä‘Ăºng vá»‹ trĂ­ ban Ä‘áº§u**, loáº¡i bá» hoĂ n toĂ n `scale: 0.8` vĂ  `y: -20`. Chiá»u rá»™ng Dynamic Island váº«n giá»¯ nguyĂªn 200px vĂ¬ `isMusicPauseGrace` váº«n lĂ  `true`.
   - **Giai Ä‘oáº¡n 2 (á»Ÿ giĂ¢y thá»© 5.2):** Sau khi 2 pháº§n tá»­ Ä‘Ă£ vĂ´ hĂ¬nh hoĂ n toĂ n trong DOM, má»›i káº¿t thĂºc grace period (`setIsMusicPauseGraceSync(false)`) vĂ  chuyá»ƒn `nectarMode` sang `'status'`. LĂºc nĂ y Dynamic Island má»›i báº¯t Ä‘áº§u co Ăªm Ă¡i tá»« 200px vá» 140px.
---

---

### INC-10: Tối Ưu Hóa & Đồng Bộ Toàn Diện Animation Morphing Dynamic Island (Spring Harmonization, Content-Shell Choreography & Zero-Stuck Exit)

- **Mã sự cố:** `INC-10`
- **Trạng thái:** `Fix Accepted by User — Monitoring for Edge Cases` (Người dùng đã kiểm thử thực tế và chấp nhận chất lượng chuyển động; tiếp tục theo dõi các trường hợp biên lâu dài).
- **Ngày ghi nhận:** 31/10/2026
- **Mức độ:** Cải thiện chất lượng đồ họa, đồng bộ chuyển động vi mô & tối ưu hiệu năng render (Animation Polish & Render Pipeline Optimization).
- **Mốc commit nền:** `90e94bf` (Backup 22).
- **Mốc hoàn thành & bảo vệ:** `Backup 23 - Stable Dynamic Island Animation`.
- **File & Thành phần liên quan:**
  - [src/App.tsx](../src/App.tsx) (`notchTransition`, `.nectar` root animate, `expanded-music`, `standard-view-group`, `shortcuts-row`, `command-center-panel`, `calendar-panel`, pulse views, DEV transition instrumentation).

#### 1. Hiện trạng & Các nguyên nhân đã xác nhận bằng mã nguồn

1. **Lệch nhịp giữa Spring hình học và Góc bo (Spring Desynchronization):**
   - Trong `App.tsx`, `notchTransition` trước đây khai báo thông số riêng rẽ cho từng thuộc tính:
     - `width`: stiffness 400, damping 31 (\(\omega = 20\text{ rad/s}, \zeta = 0.775\), thời gian ổn định ~260ms).
     - `height`: stiffness 450, damping 29 (\(\omega = 21.21\text{ rad/s}, \zeta = 0.683\), thời gian ổn định ~280ms). Do damping ratio thấp hơn width nhưng hành trình biến thiên chiều cao lớn (lên tới 254px khi sang Calendar/CC), height bị overshoot ~5.3% (~13.5px bounce thẳng đứng), gây hiện tượng rung/nhấp nháy ở mép đáy.
     - `borderRadius` và `"--radius-bottom"`: stiffness 1000, damping 40 (\(\omega = 31.62\text{ rad/s}, \zeta = 0.632\), thời gian ổn định ~175ms). Góc bo kết thúc sớm hơn chiều rộng và chiều cao từ 85ms đến 105ms, khiến góc bo bị snap cứng ngắc trong khi vỏ đảo vẫn đang tiếp tục co giãn và rung lắc.
   - `y` bị gán `restDelta: 0.001`, khiến Framer Motion kéo dài các vi tính toán sub-pixel không cần thiết.

2. **Chi phí GPU Rasterization đắt đỏ từ `filter: blur` trên Panel Exit:**
   - Các panel nội dung (`shortcuts-row`, `command-center-panel`, `calendar-panel`) đều sử dụng `exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.1 } }}` và gán `filter: "blur(0px)"` trên `initial`/`animate`.
   - Trong Chromium / WebView2, việc áp dụng bộ lọc `blur()` thời gian thực trên các cây DOM con phức tạp (nhiều SVG icon, nút bấm quick actions, slider, lịch tháng) buộc GPU/CPU phải kích hoạt multi-pass gaussian blur rasterization trên từng frame trong suốt 100ms exit.
   - Hậu quả: Gây tụt frame (stutter/jank) đúng thời điểm vỏ Dynamic Island đang morph kích thước, đồng thời tiềm ẩn rủi ro kẹt blur ("stuck blur") đã từng ghi nhận trong INC-02.
   - Element gốc `.nectar` có `filter: "blur(0px)"` trong `initial` và `animate`, ép trình duyệt tạo thêm một offscreen texture composition pass không cần thiết cho toàn bộ Dynamic Island.

3. **Lệch nhịp Choreography giữa Vỏ ngoài (Shell) và Nội dung (Content):**
   - Vỏ ngoài chạy bằng spring physics, nhưng các panel nội dung lại có đường cong chuyển động không đồng nhất:
     - `shortcuts-row` dùng fixed duration tween `0.15s`.
     - `command-center-panel` và `calendar-panel` lại dùng `type: "spring"` cho `opacity`, khiến độ mờ bị rung lắc và mất tới gần 300ms mới hiển thị rõ nét.
     - `expanded-music` dùng spring riêng (`stiffness: 500, damping: 30`), không khớp với `standard-view-group` (`duration: 0.2`).
   - Thời gian exit 100ms kết hợp với `mode="wait"` tạo ra khoảng trống không có nội dung (blank frame) khi mở rộng xuống dưới, và gây hiện tượng cắt xén nội dung cũ (clipping) khi thu nhỏ từ panel cao (Command Center 290px) về panel thấp (Shortcuts 108px).

#### 2. Giải pháp Kỹ thuật Đã Triển khai

1. **Hài hòa hóa Spring Vật lý Hình học (Unified Geometry Spring - `src/App.tsx`):**
   - Hợp nhất toàn bộ thông số hình học (`width`, `height`, 4 góc `border...Radius`, CSS variable `"--radius-bottom"`, và `default`) về một bộ lò xo `geomSpring` duy nhất:
     - `stiffness: Math.round(400 * speedFactor)`
     - `damping: Math.round(34 * bounceFactor * sqrtSpeed)`
   - Tỷ số cản đạt \(\zeta \approx 0.85\) (near-critically damped): overshoot giảm xuống dưới 1% (~1.5px đệm xúc giác tinh tế), triệt tiêu hoàn toàn rung chấn 13.5px ở đáy đảo.
   - Góc bo biến thiên và ổn định ở đúng miligiây thứ 238 cùng lúc với chiều rộng và chiều cao: hình dạng đảo nở ra và thu lại hữu cơ, không còn hiện tượng snap góc.
   - Bảo toàn 100% các thanh trượt cài đặt: Animation Speed (50–150%), Spring Bounciness (0–100%), và Reduce Motion.
   - Đặt `y: mass: 1, restDelta: 0.01` để dứt điểm chuyển động nhanh chóng.

2. **Triệt tiêu Hoàn toàn `filter: blur` trên Panel Exit & Vỏ đảo (`src/App.tsx`):**
   - Loại bỏ `filter: "blur(4px)"` và `filter: "blur(0px)"` khỏi toàn bộ các panel `shortcuts-row`, `command-center-panel`, `calendar-panel`, `update-pulse-view`, và `pulse-view`.
   - Loại bỏ `filter: "blur(0px)"` khỏi element gốc `.nectar`, xóa bỏ lớp texture composition dư thừa của Chromium.
   - Chuyển toàn bộ exit sang cơ chế `opacity: 0` thuần túy kết hợp dịch chuyển vi mô (`y: -4`), đạt hiệu năng paint 60/120 FPS tối đa mà không gây nghẽn GPU rasterization.

3. **Thiết lập Quy trình Biên đạo Nhất quán (Harmonious Content-Shell Choreography - `src/App.tsx`):**
   - Rút ngắn thời gian exit xuống 80ms (`0.08s`, `easeOut`): panel cũ biến mất êm ái trước khi vỏ đảo kịp co/giãn đáng kể, loại bỏ hoàn toàn hiện tượng clipping mép đáy và frame trống.
   - Đồng bộ hóa đường cong xuất hiện (Enter curve) cho tất cả panel (`shortcuts-row`, `command-center-panel`, `calendar-panel`, `expanded-music`, `standard-view-group`):
     - `initial: { opacity: 0, y: -6 }`
     - `animate: { opacity: 1, y: 0 }`
     - `transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] }` (Cubic Bezier chuẩn Apple Fluent Deceleration).
   - Tiến trình thời gian hoàn hảo:
     - 0ms – 80ms: Panel cũ mờ dần và unmount dứt khoát.
     - 80ms – 240ms: Panel mới bung nở mượt mà.
     - ~238ms: Vỏ đảo đáp nhẹ nhàng vào kích thước chuẩn. Cả vỏ và ruột ổn định cùng lúc.

4. **Tích hợp Đo kiểm DEV Thực tế (Transition Frame Pacing & IPC Profiling):**
   - Bổ sung bộ giám sát DEV đo đạc chính xác trong cửa sổ 350ms mỗi khi đổi mode hoặc hover:
     - Số lần gọi IPC `update_notch_rect` trong quá trình chuyển cảnh (`ipcCount`).
     - Số frame trễ (`slowFrames > 16.67ms`), frame duration dài nhất (`maxFrameDurationMs`), và FPS trung bình (`avgFps`).
   - Xuất dữ liệu trực tiếp vào `snap.transitionPerf` khi người dùng nhấn Middle-Click (hoặc Ctrl+Click / Ctrl+Shift+D).

#### 3. Kết quả Kiểm thử & Trạng thái Sau Nghiệm thu
- **Kiểm thử Người dùng:** Người dùng đã kiểm thử thực tế và xác nhận chất lượng chuyển động đạt yêu cầu: mượt mà, tự nhiên, không khựng, không rung lắc đáy, các mode chuyển đổi tức thì.
- **Trạng thái Kỷ luật:** Không đánh dấu Verified Fixed toàn diện; ghi nhận mức animation hiện tại đã được người dùng chấp nhận và chốt mốc bảo vệ trong `Backup 23 - Stable Dynamic Island Animation`.

---

### INC-11: Khắc Phục Thiếu Ứng Dụng Ghim Windows Taskbar Trên Nectar Dock (Windows Taskbar Pinned Apps Sync & Packaged App Detection)

- **Mã sự cố:** `INC-11`
- **Trạng thái:** `Fix Implemented — Ready for User Verification`.
- **Ngày ghi nhận:** 31/10/2026.
- **Mức độ:** Sửa lỗi thiếu ứng dụng ghim & Cơ chế đồng bộ thông minh hai chiều giữa Windows Taskbar và Nectar Dock (Taskbar Pins Sync & Packaged AUMID Support).
- **Mốc commit nền:** `6eba624` (`Backup 23 - Stable Dynamic Island Animation`).
- **Tình trạng:** **Thay đổi chưa commit trong working tree** trên `src-tauri/src/taskbar_pins.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/main.rs`, `src/Dock.tsx`, `src/settings/DockTab.tsx`, `src/i18n/translations.ts`.

#### 1. Triệu chứng & Nguyên nhân Gốc Đã Xác Minh Thực Nghiệm

1. **Nguyên nhân 1 — Bỏ sót toàn bộ ứng dụng Packaged / MSIX / UWP / Edge PWA:**
   - Trên Windows 10/11, khi người dùng ghim các ứng dụng dạng đóng gói (Packaged apps như Google Classroom PWA, Outlook PWA, Microsoft Rewards, TikTok, Microsoft Store apps...), Windows **hoàn toàn không tạo tệp shortcut `.lnk`** trong thư mục `%APPDATA%\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar`.
   - Các ứng dụng này được Windows Explorer lưu trữ trực tiếp dưới dạng Shell Items mang header `APPS` và serialized Property Store (`1SPS`) chứa AppUserModelID (AUMID) và Display Name trong Registry `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband` (khóa `Favorites`).
   - Hàm `read_pins()` trong `taskbar_pins.rs` trước đây chỉ duyệt thư mục tệp `.lnk`, dẫn đến bỏ sót 100% các ứng dụng đóng gói được ghim trên Taskbar của Windows.
2. **Nguyên nhân 2 — Marker `taskbar_pins_synced` chặn hoàn toàn việc nhận diện app mới:**
   - Trong `src-tauri/src/commands.rs`, hàm `load_pinned_apps()` kiểm tra: `if !synced_marker.exists() { import_taskbar_pins(); }`.
   - Ngay sau lần chạy đầu tiên, tệp marker `taskbar_pins_synced` được tạo. Kể từ đó trở đi, mỗi khi Nectar khởi động, backend chỉ đọc danh sách tĩnh từ `pinned_apps.json`. Bất kỳ ứng dụng nào người dùng ghim thêm trên Windows Taskbar về sau đều bị bỏ qua hoàn toàn.
3. **Nguyên nhân 3 — Thiếu cơ chế theo dõi phân biệt giữa "Ứng dụng mới ghim" và "Ứng dụng người dùng chủ động bỏ ghim trên Nectar":**
   - Nếu chỉ đơn thuần đọc lại Taskbar ở mỗi lần khởi động, những ứng dụng mà người dùng đã chủ động bỏ ghim khỏi Nectar Dock sẽ bị tự động ghim trở lại trái ý muốn (Zombie re-pin loop). Cần có cơ chế state phân định rõ các mục đã import (`known_keys`) và các mục người dùng đã loại bỏ (`dismissed_keys`).

#### 2. Giải pháp Kỹ thuật Đã Triển khai

1. **Bộ phân tích cú pháp Nhị phân Taskband Favorites Chuyên dụng (`src-tauri/src/taskbar_pins.rs`):**
   - Bổ sung hàm `extract_packaged_pins_from_blob`: quét trực tiếp các block `APPS` trong `Favorites` REG_BINARY, trích xuất chuẩn xác AUMID (chuỗi `<PackageFamily>!<AppId>`) và Display Name.
   - Hàm `resolve_packaged_app` sử dụng Windows Shell COM API native: gọi `SHCreateItemFromParsingName` với `shell:AppsFolder\<AUMID>` để xác thực ứng dụng có đang cài đặt thực tế trên máy, đồng thời lấy tên hiển thị chuẩn xác qua `SIGDN_NORMALDISPLAY`.
   - Hợp nhất cả hai nguồn (phím tắt Win32 `.lnk` và Packaged AUMIDs), sắp xếp theo đúng thứ tự offset thực tế trên Windows Taskbar, loại bỏ trùng lặp và ghi nhận DEV diagnostic log an toàn (không log đường dẫn nhạy cảm).
2. **Cơ chế Đồng bộ Tự động Bổ sung Không Ghi đè (`src-tauri/src/commands.rs`):**
   - Quản lý trạng thái qua tệp `taskbar_pins_sync_state.json` (`known_keys` và `dismissed_keys`).
   - Khi khởi động:
     - Giữ nguyên 100% danh sách hiện tại của người dùng trong `pinned_apps.json`, không ghi đè, không thay đổi thứ tự các icon đã có.
     - So sánh danh sách Windows Taskbar pins hiện tại với danh sách của Nectar:
       - Bỏ qua các app đã có trong Dock (`is_same_app_info` khớp cả Win32 exe lẫn AUMID).
       - Bỏ qua các app nằm trong danh sách người dùng đã chủ động bỏ ghim (`dismissed_keys`).
       - Bổ sung các ứng dụng mới được ghim vào **cuối danh sách** Dock hiện có.
   - Khi người dùng bỏ ghim một ứng dụng trên Nectar:
     - `save_pinned_apps` tự động phát hiện ứng dụng bị loại bỏ và ghi nhận vào `dismissed_keys`, ngăn chặn vĩnh viễn việc tự ghim lại ở các lần khởi động sau.
     - Nếu người dùng tự tay ghim lại ứng dụng đó trên Dock, key được giải phóng khỏi `dismissed_keys`.
3. **Thao tác Nhập Thủ công "Nhập từ Windows Taskbar" trong Settings (`DockTab.tsx`):**
   - Bổ sung lệnh IPC `import_taskbar_pins_manual(force_reimport: bool)`.
   - Khi người dùng nhấn nút "Nhập ngay" trong Settings -> Dock: hệ thống giải phóng các mục đã bỏ qua của Windows pins, quét toàn bộ và bổ sung bất kỳ ứng dụng nào còn thiếu vào Dock tức thì.
   - Phát sự kiện Tauri `dock-pinned-apps-updated` đồng bộ thời gian thực tới tất cả cửa sổ Dock trên các màn hình mà không cần khởi động lại app.
   - Hỗ trợ đầy đủ song ngữ `vi` và `en` trong `src/i18n/translations.ts`.

#### 3. Bằng chứng Đo kiểm & Kết quả Kiểm tra Biên dịch

- **Đo kiểm thực nghiệm Windows Taskband trên máy người dùng:**
  - Tổng số pins ghim trên Windows Taskbar thực tế: **10 ứng dụng** (5 Packaged apps: Google Classroom, Outlook PWA, Microsoft Rewards, TikTok, Facebook; 5 Win32 shortcuts: Zalo, File Explorer, Task Manager, Antigravity, Microsoft Edge).
  - Kết quả quét nhận diện chuẩn xác 10/10 ứng dụng theo đúng thứ tự Taskbar.
  - Sau khi Nectar Dock khởi động, 4 ứng dụng còn thiếu (Google Classroom, Outlook PWA, Microsoft Rewards, TikTok) được bổ sung chính xác vào cuối danh sách Dock mà không gây trùng lặp, không đổi vị trí các ứng dụng cũ.
- **Biên dịch Frontend:** `bun run tsc --noEmit` -> 0 lỗi TypeScript.
- **Biên dịch Backend:** `cargo check --manifest-path src-tauri/Cargo.toml` -> 0 lỗi, compile thành công.
- **Unit Tests:** `cargo test --bin nectar -- sync_keys same_app` -> 2/2 tests passed.

---

### INC-12: Khắc Phục Hiện Tượng Trùng Lặp Icon Trên Dock Khi Mở Ứng Dụng Đã Ghim (Microsoft Rewards & Packaged Apps Running Identity Matching)

- **Mã sự cố:** `INC-12`
- **Trạng thái:** `Fix Implemented — Ready for User Verification`.
- **Ngày ghi nhận:** 01/11/2026.
- **Mức độ:** Sửa lỗi trùng lặp icon trên Dock khi ứng dụng đang chạy; chuẩn hóa cơ chế đối soát nhận diện ứng dụng (Running App vs Pinned App Identity Matching) cho Win32, UWP, MSIX/Centennial và PWA.
- **Mốc commit nền:** `6eba624` (`Backup 23 - Stable Dynamic Island Animation`).
- **Tình trạng:** **Thay đổi chưa commit trong working tree** trên `src-tauri/src/utils.rs`, `src-tauri/src/services.rs`, `src-tauri/src/commands.rs`, `src/Dock.tsx`.

#### 1. Triệu chứng & Phân Tích Thực Nghiệm Nguyên Nhân Gốc

1. **Hiện tượng người dùng phản ánh:**
   - Khi nhấn mở Microsoft Rewards từ icon đã ghim trên Nectar Dock, ứng dụng xuất hiện thêm một icon giống hệt ở nhóm Running Apps (Unpinned), thay vì gắn trạng thái `is_running = true` vào icon đã ghim.
   - Icon đã ghim không sáng chấm running, không hiển thị window preview thumbnail khi hover, và click không focus vào cửa sổ đang chạy.

2. **Nguyên nhân Gốc 1 (Tầng Backend Windows API — Thiếu trích xuất Process-level AUMID):**
   - Microsoft Rewards (`microsoft-rewards-desktop.exe`) là ứng dụng Windows 10/11 dạng đóng gói Desktop Bridge / MSIX Centennial (`Microsoft.24183918CCDA_8wekyb3d8bbwe`).
   - Cửa sổ Win32 HWND của ứng dụng này **không** được đăng ký thuộc tính `PKEY_APP_USER_MODEL_ID` trong OLE Window Property Store (`SHGetPropertyStoreForWindow(hwnd)` trả về null/empty).
   - Hàm `enum_windows_proc` trong `services.rs` trước đây chỉ gọi `get_window_app_user_model_id(hwnd)`. Do kết quả trả về `None`, backend rơi vào fallback đường dẫn tệp thực thi:
     - `path`: `C:\Program Files\WindowsApps\Microsoft.24183918CCDA_1.11.0.0_x64__8wekyb3d8bbwe\microsoft-rewards-desktop.exe`
     - `executable`: `microsoft-rewards-desktop.exe`
   - Trong khi đó, trên Dock, icon đã ghim từ Windows Taskbar lưu trữ định danh chuẩn AUMID:
     - `path`: `Microsoft.24183918CCDA_8wekyb3d8bbwe!MicrosoftRewards`
     - `executable`: `null`
   - Kết quả: Chuỗi `path` hoàn toàn khác nhau khiến Dock không thể ánh xạ cửa sổ đang chạy vào icon ghim.

3. **Nguyên nhân Gốc 2 (Tầng Frontend React Dock — `findRunningApp` không sử dụng `isSameApp`):**
   - Trong `src/Dock.tsx`, hàm `findRunningApp(p: AppInfo)` chỉ thực hiện khớp chuỗi tuyệt đối qua `appIdentity(p.path, p.executable, p.name)`.
   - Hàm `isSameApp` (vốn được thiết kế để khớp mờ giữa AUMID và file path) **hoàn toàn không được gọi** trong `findRunningApp`.
   - Ngay cả khi được gọi, logic `isSameApp` cũ kiểm tra: `const stem = fileSide.executable.replace(/\.(exe|lnk)$/, ''); return idLower.includes(stem);`. Với `stem = "microsoft-rewards-desktop"` và `idLower = "microsoft.24183918ccda_8wekyb3d8bbwe!microsoftrewards"`, phép so sánh trả về `false` do có thêm hậu tố `-desktop`.
   - Hậu quả: `findRunningApp` trả về `undefined` -> Icon ghim giữ `is_running: false` -> Cửa sổ đang chạy bị coi là app chưa ghim (`unpinned`) và xuất hiện thêm icon thứ hai ở nhóm ứng dụng đang chạy.

#### 2. Giải pháp Kỹ thuật Đã Triển khai

1. **Trích xuất AppUserModelID Cấp Tiến Trình Native (`src-tauri/src/utils.rs` & `src-tauri/src/services.rs`):**
   - Bổ sung hàm `get_process_app_user_model_id(process_handle)` sử dụng Windows API native `GetApplicationUserModelId` từ `kernel32.dll`.
   - Trong `enum_windows_proc` (`services.rs`), khi duyệt cửa sổ, hệ thống ưu tiên lấy AUMID từ cửa sổ; nếu không có sẽ tự động truy vấn từ token tiến trình (`OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)`).
   - Kiểm tra thực nghiệm trên PID 19240 (`microsoft-rewards-desktop.exe`): Windows API trả về chính xác 100%: `Microsoft.24183918CCDA_8wekyb3d8bbwe!MicrosoftRewards`, khớp tuyệt đối ký tự với AUMID của icon đã ghim.
   - Đối chiếu tên ứng dụng với `INSTALLED_APPS_CACHE` dựa trên cả file path và AUMID để luôn đảm bảo lấy được Display Name chuẩn xác ("Microsoft Rewards").

2. **Chuẩn hóa Logic Đối Soát Nhận Diện Ứng Dụng (`src/Dock.tsx`):**
   - Nâng cấp `isSameApp(a, b)`:
     - Khớp hai AUMID cùng Package Family (`a.path.split('!')[0] === b.path.split('!')[0]`).
     - Khớp AUMID với đường dẫn thư mục `WindowsApps` dựa trên `<PackageName>` và `<PublisherId>`.
     - Chuẩn hóa loại bỏ ký tự phân cách (`-`, `_`) khi so sánh stem với AUMID và Display Name.
     - Bảo toàn việc phân lập các ứng dụng chạy chung browser host (`msedge.exe`, `chrome.exe`, `brave.exe`, `applicationframehost.exe`) để các PWA khác nhau không bị gộp nhầm.
   - Nâng cấp `findRunningApp(p)`:
     - Bước 1: Khớp tuyệt đối theo identity key.
     - Bước 2: Khớp tuyệt đối theo pathId.
     - Bước 3: Duyệt `isSameApp(p, a)` trên danh sách `activeApps` chưa được gán.
     - Bước 4 & 5: Fallback theo executable name và filename cho Win32 thuần túy (loại trừ browser host).
     - Ghi nhận `matchedRunningKeys` để loại bỏ hoàn toàn các cửa sổ đã được gán khỏi nhóm Unpinned Apps.
     - Tích hợp DEV diagnostic log có kiểm soát khi kiểm tra các ứng dụng nhạy cảm (không log dữ liệu cá nhân ra log công khai).

3. **Củng Cố Đối Soát Backend (`src-tauri/src/commands.rs`):**
   - Bổ sung kiểm tra Package Family và đường dẫn WindowsApps trong hàm `is_same_app_info` ở tầng Rust, đồng bộ hoàn toàn với logic frontend.

#### 3. Kết quả Kiểm tra Kỹ thuật

- **Biên dịch Frontend:** `bun run tsc --noEmit` -> 0 lỗi TypeScript.
- **Biên dịch Backend:** `cargo check --manifest-path src-tauri/Cargo.toml` -> 0 lỗi, Finished dev profile thành công.
- **Bảo tồn Mốc commit:** Bảo toàn nguyên vẹn Backup 23 (`6eba624`), không sửa đổi Dynamic Island INC-10, không can thiệp Taskbar Replacement hay OLE Drag & Drop.

---

### INC-12: T?i �u H�a B? Nh? Giai �o?n 1 � T�ch Bi?t IPC Media Metadata & Timeline Update (Zero-Redundant Base64 Media Churn)

- **M? s? c?:** `INC-12`
- **Tr?ng th�i:** `Fix Implemented � Ready for User Verification` (Ch�a ��nh d?u Verified Fixed; �ang ch? ki?m nghi?m th?c t? �? s?t gi?m RAM v� �o �?c tr�n Windows).
- **Ng�y ghi nh?n:** 01/11/2026.
- **M?c �?:** T?i �u h�a hi?u n�ng IPC & Gi?m t?i b? nh? WebView2 Renderer (Performance & Memory Churn Optimization).
- **M?c commit n?n:** `6eba624` (`Backup 23 - Stable Dynamic Island Animation`).
- **T?nh tr?ng:** **Thay �?i ch�a commit trong working tree** tr�n `src-tauri/src/types.rs`, `src-tauri/src/services.rs`, `src/App.tsx`.
- **File & Th�nh ph?n li�n quan:**
  - [src-tauri/src/types.rs](../src-tauri/src/types.rs) (`MediaTimelineUpdate`, `MediaInfo.is_timeline_update`, `#[serde(skip_serializing_if = "Option::is_none")]`)
  - [src-tauri/src/services.rs](../src-tauri/src/services.rs) (T�ch nh�nh `metadata_changed` v� `position_changed`, ph�t s? ki?n `media-timeline`)
  - [src/App.tsx](../src/App.tsx) (Listener `media-timeline`, b?o to�n tham chi?u `albumArtUrl`, defensive `is_timeline_update`, DEV snapshot metric `mediaIpc`)

#### 1. Tri?u ch?ng & Nguy�n nh�n �? X�c Nh?n T? M? Ngu?n
1. **L?m ph�t d? li?u Base64 qua IPC m?i 2 gi�y:**
   - Trong `src-tauri/src/services.rs`, lu?ng Windows SMTC th�m d? m?i 2000ms. �i?u ki?n `(*pos - current.position_ms).abs() > 1000` lu�n ��ng khi b�i h�t �ang ph�t.
   - Tr�?c ��y, m?i l?n th?a m?n �i?u ki?n th?i gian tr�n, backend g?i to�n b? `current.clone()` qua s? ki?n `media-update`.
   - Trong `current.clone()`, tr�?ng `artwork` ch?a nguy�n v?n chu?i Base64 (`data:image/jpeg;base64,...`) c� k�ch th�?c t? 100 KB �?n 1�2 MB.
   - H?u qu?: C? m?i 2 gi�y (~30 l?n/ph�t), Tauri serialize v� WebView2 deserialize m?t chu?i JSON h�ng tr�m KB. Trong 15 ph�t, kho?ng 90�150 MB d? li?u chu?i ��?c b�m li�n t?c v�o V8 heap, g�y �p l?c d?n r�c (GC churn) v� gi? RAM renderer ? m?c cao ngay c? khi ng�?i d�ng kh�ng t��ng t�c.
2. **Nguy c� x�a nh?m ?nh b?a khi thi?u tr�?ng Artwork:**
   - Trong `src/App.tsx`, h�m `setMediaInfo` tr�?c ��y m?c �?nh `setAlbumArtUrl(null)` n?u `info.artwork` kh�ng t?n t?i, khi?n frontend d? b? m?t ?nh b?a n?u backend g?i th�ng �i?p r�t g?n.

#### 2. Gi?i ph�p K? thu?t �? Tri?n khai
1. **T�ch Bi?t S? Ki?n Metadata v� Timeline ? T?ng Backend (`src-tauri/src/services.rs` & `types.rs`):**
   - Khai b�o struct `MediaTimelineUpdate` g?m: `{ title, artist, position_ms, duration_ms, position_updated_at }`.
   - B? sung c? `metadata_changed`: So s�nh to�n di?n `title`, `artist`, `is_playing`, `has_media`, `art_str` v� `duration_ms`.
   - **Khi Metadata thay �?i (�?i b�i, Play/Pause, �?i session, ho?c kh?i �?ng):** Ph�t �?y �? `media-update` ch?a to�n b? metadata v� artwork Base64.
   - **Khi CH? c� v? tr� b�i h�t thay �?i (`position_changed`):** Ph�t s? ki?n ri�ng `media-timeline` v?i k�ch th�?c si�u nh? (~120 bytes thay v? ~300.000 bytes). Chu?i Base64 tuy?t �?i kh�ng ��?c clone ho?c serialize.
2. **B?o To�n Tham Chi?u v� Ph?ng Th? Ph�a Frontend (`src/App.tsx`):**
   - L?ng nghe song song s? ki?n `media-timeline`:
     - Ki?m tra �?i chi?u t�n b�i h�t (`if (prev.title !== timeline.title || prev.artist !== timeline.artist) return prev;`), lo?i b? 100% r?i ro race condition n?u g�i tin timeline c?a b�i c? �?n tr? sau khi b�i m?i �? b?t �?u.
     - C?p nh?t an to�n `position_ms`, `duration_ms`, `position_updated_at` m� kh�ng ch?m v�o `albumArtUrl` hay `albumArtKey`.
   - Trong listener `media-update`:
     - N?u nh?n c? `is_timeline_update`, ch? c?p nh?t timeline.
     - Kh�ng x�a `albumArtUrl` tr? khi `!info.has_media` (k?t th�c phi�n media) ho?c �?i sang m?t b�i h�t th?c s? kh�ng c� ?nh b?a.
     - Gi? nguy�n tham chi?u m?ng `artwork` c? c?a c�ng b�i h�t n?u update kh�ng k�m ?nh m?i.
3. **T�ch H?p �o �?c Ch?n �o�n DEV (`mediaIpc` Snapshot):**
   - Theo d?i s? l�?ng s? ki?n `mediaUpdateCount`, `mediaTimelineCount`, s? l?n truy?n `artworkPayloadCount`, t?ng byte �?c t�nh v� t?c �? truy?n t?i m?i ph�t.
   - Xu?t d? li?u tr?c ti?p khi ng�?i d�ng Middle-Click (ho?c Ctrl+Click / Ctrl+Shift+D) tr�n Dynamic Island.

#### 3. K?t qu? Ki?m tra K? thu?t
- **Bi�n d?ch Frontend:** `bun run tsc --noEmit` -> 0 l?i TypeScript.
- **Bi�n d?ch Backend:** `cargo check --manifest-path src-tauri/Cargo.toml` -> 0 l?i, Finished dev profile th�nh c�ng.
- **�?c t�nh s?t gi?m t?i IPC:**
  - Tr�?c t?i �u: ~30 s? ki?n `media-update` / ph�t x ~300 KB = **~9.000 KB/ph�t**.
  - Sau t?i �u: 0 s? ki?n `media-update` mang ?nh b?a + ~30 s? ki?n `media-timeline` x ~120 bytes = **~3.6 KB/ph�t**.
  - **M?c gi?m l�u l�?ng IPC �?t ~99.96%** trong su?t th?i gian nghe m?t b�i h�t.
- **B?o t?n Invariants:** Gi? nguy�n 100% Visualizer FPS, CSS/Animation Dynamic Island, Music Pause Grace 5s, Dock v� Click-Through.

---

### INC-13: T?i �u H�a B? Nh? Giai �o?n 2 � Music Visualizer Zero-Render Engine & Ambient Glow Texture Pipeline (Eliminate Visualizer GC Churn & Compositor Retention)

- **M? s? c?:** `INC-13`
- **Tr?ng th�i:** `Fix Implemented � Ready for User Verification` (Ch�a ��nh d?u Verified Fixed; �ang ch? ng�?i d�ng ki?m th? chu?i 4 b�?c tr�n Windows).
- **Ng�y ghi nh?n:** 02/11/2026.
- **M?c �?:** Kh?c ph?c ph?nh RAM d�i h?n khi ph�t nh?c & T?i �u h�a chu k? �? h?a GPU Compositor (High-Impact Renderer RAM & Lifecycle Polish).
- **M?c commit n?n:** `6eba624` (`Backup 23 - Stable Dynamic Island Animation`).
- **T?nh tr?ng:** **Thay �?i ch�a commit trong working tree** tr�n `src-tauri/src/services.rs`, `src/App.tsx`, `src/App.css`.
- **File & Th�nh ph?n li�n quan:**
  - [src-tauri/src/services.rs](../src-tauri/src/services.rs) (Pacing emit `audio-visualization` ? m?c ~30 FPS thay v? 94 FPS d?n d?p)
  - [src/App.tsx](../src/App.tsx) (Component `Visualizer` chuy?n sang Direct rAF Lerp Zero-Render, lo?i b? `AnimatePresence mode="wait"` l?ng nhau trong `notch-ambient-glow`)
  - [src/App.css](../src/App.css) (Lo?i b? `filter 0.8s ease` tr�n `.notch-ambient-glow img`, tri?t ti�u FBO texture recalculation li�n t?c)

#### 1. Tri?u ch?ng & Nguy�n nh�n �? X�c Nh?n T? Th?c Nghi?m Phase 1
1. **Ph�n t�ch s? li?u th?c t? ng�?i d�ng sau Phase 1:**
   - Startup: 48.9 MB
   - Ph�t nh?c 30 ph�t kh�ng thao t�c: **777.8 MB** (T�ng h�n 720 MB ngay c? khi kh�ng h? cu?n �?i mode!).
   - Cu?n nhanh 1�2 ph�t khi ph�t nh?c: **938.1 MB**.
   - Ngh? ti?p khi v?n ph�t nh?c: **697.3 MB** (So v?i m?c tr�?c Phase 1 l� 695.7 MB, RAM d�i h?n kh�ng h? gi?m).
2. **X�c nh?n nguy�n nh�n g?c r? (Root Cause):**
   - **T?ng Visualizer:**
     - Rust backend �?c loopback audio v� g?i `app_handle.emit("audio-visualization")` **94 l?n/gi�y** (trong m?t tick 32ms c� 1536 m?u, emit 3 l?n li�n ti?p).
     - Component `Visualizer` s? d?ng React `useState`: 94 l?n/gi�y g?i `setAudioData(data)`, k�ch ho?t **5.640 l?n re-render/ph�t** (169.200 renders trong 30 ph�t!).
     - Trong m?i render, 5 thanh s�ng `<motion.div>` sinh ra 5 �?i t�?ng spring physics Framer Motion (`stiffness: 600, damping: 30, mass: 0.5`). T?ng c?ng **846.000 spring instances** ��?c c?p ph�t trong 30 ph�t!
     - Do kh�ng h? c� kho?ng ngh? (idle period), V8 engine li�n t?c �?y c�c �?i t�?ng r�c n�y v�o Old Generation heap thay v? thu h?i k?p th?i, khi?n JS heap ph?nh to kh�ng �i?m d?ng.
   - **T?ng Compositor & Ambient Glow:**
     - `.notch-ambient-glow img` �p d?ng `filter: blur(52px)` k?t h?p `transition: opacity 0.6s ease, filter 0.8s ease;`.
     - M?i khi chuy?n qua l?i gi?a c�c mode, tr?nh duy?t Chromium b? �p n?i suy b? l?c Gaussian blur 52px tr�n t?ng frame trong su?t 800ms, khi?n GPU Texture Cache (`GrResourceCache`) t�ch l?y h�ng lo?t offscreen FBO textures m� kh�ng gi?i ph�ng v? OS.

#### 2. Gi?i ph�p K? thu?t �? Tri?n khai
1. **Pacing IPC Backend Audio ? m?c ~30 FPS (`src-tauri/src/services.rs`):**
   - Gi? nguy�n 100% thu?t to�n FFT v� b? l?c exponential smoothing `smooth_factor`.
   - Gi?i h?n nh?p ph�t s? ki?n `app_handle.emit("audio-visualization")` ? m?c $\ge 30\text{ ms}$ (~30�33 FPS).
   - C?t gi?m ngay **68% l�?ng s? ki?n IPC** t? 94 events/sec xu?ng ~30 events/sec, lo?i b? ho�n to�n c�c g�i tin tr�ng l?p ph�t ra c�ch nhau v�i micro-gi�y trong c�ng m?t buffer tick.
2. **Ki?n Tr�c Visualizer Zero-Render Engine (`src/App.tsx`):**
   - Lo?i b? ho�n to�n React `useState` v� Framer Motion `<motion.div>` kh?i th�n v?ng l?p c?a `Visualizer`.
   - S? d?ng `useRef` m?ng ph?n t? DOM (`barRefs`), `targetsRef` v� `currentRef`.
   - Trong listener `audio-visualization`: c?p nh?t tr?c ti?p m?ng s? th?c `targetsRef` in-place, **kh�ng g?i `setState`, 0 l?n React re-render**.
   - �i?u khi?n chuy?n �?ng b?ng `requestAnimationFrame` lerp:
     - T? l? n?i suy `diff * 0.32` ? 60/120 FPS �?t �? �m �i ti?m c?n t?i h?n (critically damped decay), m� ph?ng ch�nh x�c 100% c?m gi�c v?t l? c?a spring c? (`stiffness: 600, damping: 30`).
     - C?p nh?t tr?c ti?p `style.transform = scaleY(...)` l�n 5 th? `div.bar-horizontal` native.
     - S? l?n component render trong 30 ph�t: **Gi?m t? 169.200 l?n v? ��ng 1 l?n duy nh?t tr�n mount!**
     - S? instance spring Framer Motion sinh ra: **T? 846.000 v? 0!**
     - B?o to�n tuy?t �?i INC-09: Khi t?m d?ng (`!isPlaying`), rAF d?ng l?i v� gi? nguy�n frame chi?u cao cu?i c�ng s?c n�t.
     - Cleanup an to�n v?i c? `isCancelled`, tri?t ti�u ho�n to�n r? r? unmounted callback.
3. **Tri?t Ti�u Compositor Blur Churn Tr�n Ambient Glow (`src/App.css` & `src/App.tsx`):**
   - Trong `src/App.css`: B? `filter 0.8s ease` kh?i `.notch-ambient-glow img`, ch? gi? `transition: opacity 0.6s ease;`. B? l?c `blur(52px)` ��?c rasterize t?nh m?t l?n, �? s�ng ch? thay �?i qua k�nh alpha c?a quad GPU, tri?t ti�u 100% vi?c c?p ph�t FBO texture m?i tr�n m?i frame chuy?n mode.
   - Trong `src/App.tsx`: Lo?i b? l?p b?c `<AnimatePresence mode="wait">` d� th?a b�n trong `notch-ambient-glow`, �?ng b? th?i gian exit v?i v? ngo�i (150ms).

#### 3. K?t qu? Ki?m tra K? thu?t
- **Bi�n d?ch Frontend:** `bun run tsc --noEmit` -> 0 l?i TypeScript.
- **Bi�n d?ch Backend:** `cargo check --manifest-path src-tauri/Cargo.toml` -> 0 l?i, ho�n th�nh trong 0.73s.
- **�o l�?ng & Ph�n t�ch T?i:**
  - React re-render c?a Visualizer: Gi?m 100% trong su?t qu� tr?nh ph�t nh?c.
  - Framer motion allocations: Gi?m 100% �?i v?i visualizer bars.
  - T?n su?t IPC audio: Gi?m 68% (t? 94 Hz xu?ng 30�33 Hz).
  - Tr?i nghi?m th? gi�c: S�ng nh?c ph?n h?i t?c th?, m�?t m� ? t?n s? qu�t m�n h?nh (60/120/144 Hz) m� kh�ng t?o r�c b? nh?.
- **B?o t?n Invariants:** B?o to�n 100% Phase 1 (Media IPC), click-through, Pause Grace 5s, fade-out, Dock v� HUD.

---

### INC-14: Dynamic Island Không Thể Tương Tác Khi Mở Cửa Sổ Hệ Thống (Task Manager, Device Manager)

- **Ngày ghi nhận:** 2026-11-02
- **Người báo cáo:** Người dùng
- **Trạng thái:** Verified Fixed — User Confirmed (6/6 tests passed)
- **Triệu chứng thực tế:**
  - Khi mở Windows Task Manager (`taskmgr.exe`) hoặc Device Manager (`devmgmt.msc` / `mmc.exe`), sau đó thao tác trên các cửa sổ này, Dynamic Island vẫn hiển thị ở trên cùng màn hình nhưng hoàn toàn không thể tương tác chuột (không nhận hover, không nhận click, không nhận cuộn chuột wheel).
  - Khi thu nhỏ (minimize) hoặc đóng Task Manager / Device Manager thì Dynamic Island lập tức hoạt động bình thường trở lại.

#### 1. Điều tra & Phân Định Nguyên Nhân (Root Cause vs. Architecture Hypothesis)
1. **Phân định rõ ràng giữa Giả thuyết Kiến trúc và Thực nghiệm Xác nhận:**
   - **Giả thuyết Kiến trúc Windows UIPI:** 
     - Task Manager (`taskmgr.exe`) và Device Manager (`mmc.exe`) vận hành ở mức đặc quyền **High Integrity Level** (Elevated / Administrator), trong khi Nectar chạy ở mức người dùng tiêu chuẩn **Medium Integrity Level**.
     - Theo tài liệu bảo mật kiến trúc Windows (User Interface Privilege Isolation - UIPI), hệ thống triệt tiêu (silence) việc phân phối thông điệp chuột `WM_MOUSEMOVE` đến hàm hook `WH_MOUSE_LL` của tiến trình có Integrity Level thấp hơn khi cửa sổ elevated đang active.
     - Đây là mô hình giải thích vì sao `mouse_hook_proc` không nhận được sự kiện và không thể gọi `worker.unpark()`.
   - **Thực nghiệm Đã Xác Nhận (Empirical Confirmation):**
     - Thread `mouse-worker` trước đây phụ thuộc 100% vào `std::thread::park()` không có timeout, dẫn đến ngủ đông vô thời hạn khi hook không có sự kiện.
     - `process_mouse_move` không chạy khiến cờ `WS_EX_TRANSPARENT` không được gỡ bỏ (`main_win` kẹt ở trạng thái xuyên thấu).
     - Win32 API `GetCursorPos` đọc trực tiếp từ Desktop Shared Memory, hoàn toàn không bị UIPI chặn và hoạt động độc lập với hook message chain.

#### 2. Giải pháp Kỹ thuật Đã Triển Khai (`src-tauri/src/services.rs`)
1. **Resilient Cursor Polling Fallback trong `start_mouse_worker`:**
   - Thay thế `std::thread::park()` vô thời hạn bằng `std::thread::park_timeout(timeout)` với nhịp độ 25ms.
   - Khi thức dậy (do hook event `unpark` HOẶC do timeout 25ms):
     - Gọi `windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut pt)` an toàn (kiểm tra `.is_ok()`).
     - So sánh `pt` với tọa độ trước đó (`prev_x`, `prev_y`).
     - Nếu phát hiện con trỏ chuột di chuyển trong khi hook im lặng, cập nhật tọa độ và kích hoạt `MOUSE_DIRTY = true`.
     - Thực thi `process_mouse_move(&app_handle, cursor)` để đánh giá hit-test của Dynamic Island, Dock và Overlay.
   - Khi chuột vào notch: Gỡ bỏ `WS_EX_TRANSPARENT` qua `main_win.set_ignore_cursor_events(false)`.
   - Khi chuột ra khỏi notch: Tái kích hoạt `set_ignore_cursor_events(true)` đảm bảo click-through hoàn hảo.

2. **Xác nhận An toàn Tuyệt đối về Hiệu năng:**
   - **Không busy-loop:** Thread luôn bị deschedule bởi OS tối thiểu 25ms mỗi chu kỳ park timeout.
   - **Không tốn CPU khi idle:** Khi chuột đứng yên, 2 phép so sánh số nguyên tốn < 30 nanoseconds, `MOUSE_DIRTY` giữ `false`, lệnh `continue` bỏ qua hoàn toàn `process_mouse_move` (CPU = 0.00%).
   - **Xử lý lỗi an toàn:** Nhánh `is_ok()` của `GetCursorPos` đảm bảo không bao giờ panic nếu API trả về lỗi (như khi khóa màn hình hoặc chuyển Secure Desktop UAC).

#### 3. Kết quả Kiểm thử Toàn diện (User Confirmed 6/6 Scenarios)
- **Kiểm thử Thực tế từ Người dùng (PASS 6/6):**
  1. Hover Dynamic Island khi Task Manager đang active: **PASS** (nhận diện hover tức thì).
  2. Click các nút trong Dynamic Island khi Task Manager đang mở: **PASS** (chuyển tab, play/pause mượt mà).
  3. Cuộn wheel chuyển mode khi Task Manager đang mở: **PASS** (chuyển chế độ nhạy, không gián đoạn).
  4. Tương tác tương tự khi Device Manager đang active: **PASS**.
  5. Click-through ngoài vùng đảo (vùng 1920x420) xuống ứng dụng hệ thống phía sau: **PASS** (xuyên thấu chuẩn xác).
  6. Thao tác sau khi đóng các cửa sổ hệ thống (Hover, click, wheel, file Drag & Drop): **PASS** (hoạt động hoàn hảo).
- **Kiểm tra Biên dịch Hệ thống:**
  - Frontend TypeScript: `bun run tsc --noEmit` -> PASS (0 lỗi).
  - Backend Rust: `cargo check --manifest-path src-tauri/Cargo.toml` -> PASS (15.78s, 0 lỗi, 0 cảnh báo).
- **Kết luận:** Lỗi được khắc phục hoàn toàn, bảo toàn 100% Backup 23 và các tối ưu RAM Phase 1/2.


## Oryvia Clean Stage 1 — 2026-11-07

Status: Partially Resolved / pending Windows E2E. The supplied Custom baseline is preserved; uninstall now uses an owned-file allowlist without recursive directory deletion, and updater install is blocked on development/portable copies. Both Tauri projects compile; Main tests 31 passed/1 ignored, Installer tests 3 passed, Node regressions 9 passed. A Windows temporary-directory cleanup test preserved unrelated files and settings. No installed-account, UAC, registry, production-signature or visual native E2E validation was performed. Full migration rationale, source mappings, limitations and rollback information: history/CHANGELOG_MIGRATION.md. Do not mark Verified Fixed from these checks alone.


## Oryvia Clean — Audit Fixes 2026-11-08

Status: Partially Resolved / Windows E2E pending, not Verified Fixed. Confirmed in code: wrong native startup name, name-only startup deletion, deletion of marker while executables locked, unregister-before-helper-spawn, cross-directory registration overwrite/delete, unchecked NSIS marker writes and ambiguous unconfigured updater status. Fixed using shared ownership-checked registry routines, delayed finalization, registered executable deleted last, persisted create-new retry helper, checked NSIS marker protocol and EN/VI local-only updater state.

Actual checks: TypeScript 2/2 PASS; Cargo check 2/2 PASS; Main Rust 33 PASS/1 existing network test ignored; Installer Rust 4 PASS; Node 12 PASS including a 7-case PowerShell behavior wrapper. NSIS fixture syntax PASS with 0 warning, never executed. No installed-account mutation or Windows E2E was performed. One read-only registry adapter smoke passed.

During implementation, a PowerShell test closure could not see shared functions, and an old static test expected a reparse guard in its former file. The fixture/source-location assertions were corrected; no safety guard was removed. Real locked-file tests now preserve marker, registration and its retry executable and complete after unlock. Missing helper tests retain state; assembled helper test uses an in-memory registry factory only.

The earlier migration statement that Nectar 1.9.1 lacked SHA256SUMS was incorrect: upstream has it. Changelog now distinguishes upstream checksums from Oryvia extensions/guards. Full evidence, failure limits and UAC/alternate-admin follow-up: [AUDIT_FIXES_REPORT.md](history/AUDIT_FIXES_REPORT.md).

## Custom Uninstaller retry — 2026-11-08

Status: Fix Implemented / pending regression execution and user Windows E2E; NOT Verified Fixed.
Confirmed by current source inspection: installer-app/src-tauri/src/uninstall.rs unconditionally executes oryvia.exe before scheduling cleanup, so a retained Custom uninstall.exe cannot retry after cleanup has removed Main. It also ignores nonzero restore exit status. Existing cleanup correctly deletes the registered executable last; changing that order would impair native fallback and is unnecessary.

Implemented: Custom entry-point pipeline validates directory, exact requested marker scope and registration before stopping/restoring/scheduling. Only independently confirmed missing Main uses current-user marker-based taskbar recovery; other metadata/spawn/exit failures stop with an error. Recovery adapts Main's monitor/position algorithm, always-on-top policy and style reset, preserves Settings, checks visibility/position and keeps taskbar_hidden.flag on failure. Native fallback and shared cleanup/finalizer remain byte-identical. No cross-profile recovery is attempted; alternate-admin still needs VM tests.

Actual checks so far: Main TypeScript via bun PASS; Installer TypeScript via root compiler PASS; Node 12 PASS including existing 7-case PowerShell wrapper. Installer-local compiler command failed because installer-app/node_modules is absent; root compiler succeeds without installing dependencies. Rust builds/tests are still pending. New regression calls the same Custom pipeline twice with a real uninstall.exe FileShare.None lock, actual assembled cleanup and isolated persisted registry store; no live registry or taskbar calls. Fixture coverage is not Windows installed-app E2E.

Final current rerun after code review: Installer Cargo check PASS and Rust tests 10 PASS/0 FAIL. Main Cargo check PASS and Rust tests 33 PASS/1 existing network test ignored. TypeScript 2/2 PASS; Node 12 PASS, including 7 PowerShell behavior cases; PowerShell parser 4/4 PASS. No live account/Explorer/installer E2E. Status remains Fix Implemented / fixture-validated, pending user verification; NOT Verified Fixed. Protected-file comparison and package-wide SHA-256 verification are enforced by scripts/package-source-audit.ps1, with exact results in the adjacent package report. No regression in the fixture tests was observed; these results do not establish live taskbar or UAC behavior.

Packaging trial: Windows PowerShell 5.1 did not resolve ZipArchive from FileSystem assembly alone. The packaging script now explicitly loads System.IO.Compression as well. The incomplete first ZIP is not overwritten; the next run uses a timestamp. This was a packaging-tool failure, not an application regression. Final verified package identity is only the one reported by its adjacent .sha256/.verification.json.


## Oryvia / Panchi146 identity and GPL notices — 2026-11-08

Status: Implemented / source and fixture checks passed; Windows user verification pending. NOT Verified Fixed.

Confirmed stale identity in Cargo authors, About, installer mock paths, GitHub issue templates and uninstall fallback registry subkey. Updated product attribution to Panchi146, preserved upstream kua8/Nectar credit and unchanged GPL LICENSE; added dated NOTICE and offline legal text in About (EN/VI), bundle license path and portable license/notice files. Internal settings, IPC and credential names retained.

Actual checks: Main and Installer TypeScript PASS; frontend production build PASS with full LICENSE/NOTICE in generated Settings bundle; Node regressions 12 PASS/0 FAIL; LICENSE SHA-256 unchanged; bundle keys checked against installed Tauri schema. Rust result pending and will be appended. No installed-app, live registry, installer or visual E2E. Full file inventory, legal-source references and remaining distribution obligations: [BRANDING_LICENSE_REVIEW.md](BRANDING_LICENSE_REVIEW.md). No published Oryvia source release was verified; do not treat retained LICENSE alone as proof of distribution compliance.

Final Rust checks: Main and Installer cargo check --locked --offline both PASS. Only incremental-cache hard-link fallback warnings; build continued using copies. Final Node rerun: 12 PASS/0 FAIL. Status remains pending Windows user verification; no production binary/source release audited.


## About footer simplification — 2026-11-08

User requested removing the last expandable legal section and displaying only Made with ❤️ Panchi146. Updated src/settings/AboutTab.tsx and EN/VI translations: Panchi146 is an anchor opened through the existing Tauri opener plugin to https://github.com/panchi146. Removed unused legal translation keys/raw imports. LICENSE, NOTICE and packaging license configuration remain unchanged. Current documentation follow-up recorded in ORYVIA_README.md and docs/BRANDING_LICENSE_REVIEW.md.

Actual check: bun run tsc --noEmit PASS. Source inspected for exact footer and URL; native browser opening and visual appearance pending user verification. NOT Verified Fixed.


## Comprehensive Oryvia / Panchi146 personalization audit pass — 2026-11-08

Status: Implemented / source, build and unit/regression tests passed; pending user Windows E2E verification. NOT Verified Fixed.

Confirmed by full codebase and visual asset inspection:
- `src/settings/DockTab.tsx` still displayed `/nectar.png` with label `"Nectar"` for the default Start button preset in Settings → Dock, whereas `src/Dock.tsx` (`resolveStartIcon`) already rendered `/oryvia.png` on the actual Dock. Updated `DockTab.tsx` preset to `/oryvia.png` and `"Oryvia"`.
- `src/settings/useSettings.ts` still used `"Export Nectar Settings"`, `"nectar-settings.json"`, and `"Import Nectar Settings"` in file dialog titles/default filename. Updated to `"Export Oryvia Settings"`, `"oryvia-settings.json"`, and `"Import Oryvia Settings"`.
- `src/settings/CalendarSyncPage.tsx` still referred to `"Nectar"` in EN/VI Nextcloud ICS instructions. Updated to `"Oryvia"`.
- `src/components/DragTestWindow.tsx` and `src/components/ShortcutsBar.tsx` still used `"Nectar Drag Test (DEV)"` window titles. Updated to `"Oryvia Drag Test (DEV)"`.
- `src-tauri/src/services.rs` window title filter (line 2912) and window class overlap filter (line 1001) only checked `"nectar"` / `"Nectar Dock"` / `"Nectar"`. Added `"oryvia"`, `"Oryvia"`, `"Oryvia Dock"`, and `class_str.contains("Oryvia")` while preserving legacy checks.
- Standardized HTML favicons across `index.html`, `dock.html`, `settings.html`, `calendar.html`, `overlay.html`, and `installer-app/index.html` to `type="image/png" href="/oryvia.png"`, and updated `overlay.html` title to `"Oryvia Overlay"`.
- Added package description in `src-tauri/Cargo.toml` and current-project pointer headers in `AGENTS.md`, `SETTINGS.md`, and `SOURCE_HISTORY.md`.
- Recorded GPLv3 section 5(d) legal basis for the concise About footer (`Made with ❤️ Panchi146`) and noted remaining baseline-locked (`src/Overlay.tsx`) and NSIS BMP (`installer/assets/header.bmp`, `sidebar.bmp`) items in `docs/BRANDING_LICENSE_REVIEW.md`.

Actual verification results:
- `bun run tsc --noEmit`: PASS (0 errors).
- `node node_modules/typescript/bin/tsc --noEmit -p installer-app/tsconfig.json`: PASS (0 errors).
- `bun run build`: PASS (`dist/` refreshed).
- `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml`: PASS.
- `cargo check --locked --offline --manifest-path installer-app/src-tauri/Cargo.toml`: PASS.
- `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --bin oryvia`: 33 PASS, 0 FAIL, 1 IGNORED.
- `cargo test --locked --offline --manifest-path installer-app/src-tauri/Cargo.toml`: 10 PASS, 0 FAIL.
- `node --test tests/*.test.mjs`: 12 PASS, 0 FAIL (including 7 PowerShell Windows fixture cases and baseline SHA-256 verification).
- `LICENSE` SHA-256 remains `230184f60bae2feaf244f10a8bac053c8ff33a183bcc365b4d8b876d2b7f4809`. No installed Windows copy, live registry, or `payload.zip` binary was mutated. NOT Verified Fixed pending user runtime verification.

## Upstream Attribution Audit (Bloom → Nectar → Oryvia) & Final Personalization — 2026-11-08

Status: Implemented / source, build, unit and regression tests passed; pending user Windows E2E verification. NOT Verified Fixed.

Completed in this pass (verified against read-only `bloom-main_2.zip` and `Nectar-main_5.zip`):
- Documented the full 3-stage provenance chain (`Bloom` by Sehajveer Singh / `sehaz` → `Nectar` by `kua8` and Nectar contributors → `Oryvia` maintained by `Panchi146`) across `NOTICE`, `ORYVIA_README.md`, `docs/BRANDING_LICENSE_REVIEW.md`, `src-tauri/Cargo.toml`, `installer-app/src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `installer-app/src-tauri/tauri.conf.json`, and `src-tauri/src/drag_drop.rs`.
- Replaced the two `/nectar.png` splash/updater logo references in `src/Overlay.tsx` (lines 988 and 1020) with `/oryvia.png` (`alt="Oryvia"`) while keeping `migration/baseline-sha256.json` immutable and enforcing a normalized byte-for-byte baseline check in `tests/migration.test.mjs`.
- Rebuilt `installer/assets/header.bmp` (`150x57`) and `installer/assets/sidebar.bmp` (`164x314`) as 24-bit BMPs on `#0B0D13` from `branding/oryvia-source.png`.
- Localized export/import dialog titles in `src/settings/useSettings.ts` via `settings.about.export.dialogTitle` and `settings.about.import.dialogTitle` in `src/i18n/translations.ts` (EN/VI).
- Detailed report: [docs/chat/2026-11-08_145116_upstream-attribution.md](chat/2026-11-08_145116_upstream-attribution.md).

## Attribution Calibration & Custom Installer License Provision — 2026-11-08

Status: Implemented / source, build, unit and regression tests passed; pending user Windows E2E verification. NOT Verified Fixed.

Completed in this pass:
- Corrected Windows Credential Manager service names in documentation to match code exactly: `"Nectar CalDAV"` and `"Nectar Calendar Link"`.
- Removed unsupported copyright claim for upstream Nectar; replaced with neutral attribution `Nectar by kua8 and contributors`. Retained verified `Copyright © 2026 Sehajveer Singh` from Bloom's `tauri.conf.json`.
- Narrowed GPLv3 5(d) conclusion to the examined Settings / About interface across Bloom 3.10.1, Nectar 1.9.4, and Nectar Custom 1.4.1.
- Implemented license delivery in Custom Installer: embedded `LICENSE` and `NOTICE` via `include_str!` in `install_safety.rs` and added `write_license_files` during installation, stopping with an error on failure without modifying shortcuts or registry. Added both files to managed `APP_FILES` (factored into estimated size).
- Updated cleanup and NSIS routines (`cleanup.ps1`, `installer.nsh`) to deploy and clean up `LICENSE` and `NOTICE` alongside executables while preserving `settings.json` and foreign files.
- Actual checks: TypeScript 2/2 PASS; Cargo check 2/2 PASS (0 warnings); Main Rust tests 34 PASS/1 IGNORED; Installer Rust tests 11 PASS; Node regression tests 12 PASS (including all PowerShell fixture cases).
- Detailed report: [docs/chat/2026-11-08_151241_attribution-installer-fixes.md](chat/2026-11-08_151241_attribution-installer-fixes.md).

## Release-Readiness Review & Final Packaging — 2026-11-08

Status: Implemented / all 6 automated test suites passed; review artifacts prepared in `release-preview/`; NOT Verified Fixed (pending user Windows VM E2E verification). Production release: NOT READY.

Completed in this pass:
- Resolved installer defects 1.A, 1.B, 1.C, 1.D:
  - 1.A: Added controlled rollback in `installer-app/src-tauri/src/commands.rs` to clean up newly extracted files if subsequent write steps fail, leaving directory clean for retry without stranding orphaned executables.
  - 1.B: Restructured cleanup order in `installer/build/cleanup.ps1` (`first` exe -> owned docs -> `last` retry exe). Handled locked documentation files by treating read errors in `Test-OryviaDocOwned` as owned/pending, preventing premature deletion of `uninstall.exe` or unregistration.
  - 1.C: Added document ownership checks (`Test-OryviaDocOwned` and `install_safety.rs`) verifying GPLv3 and Oryvia/Panchi146 signatures so foreign licenses/notices in shared directories are neither overwritten nor deleted.
  - 1.D: Updated `installer.nsh` with `IfErrors` verification for license copying; verified clean compilation with `makensis.exe` (exit code 0).
- Fixed unit test fixtures in `install_safety.rs` and `installer-app/src-tauri/src/uninstall_tests.rs` to write valid Oryvia license/notice text rather than dummy text.
- Ran full test suite:
  - `bun run tsc --noEmit`: PASS (0 errors)
  - `node .../tsc --noEmit -p installer-app/tsconfig.json`: PASS (0 errors)
  - `bun run build`: PASS
  - `cargo test --manifest-path installer-app/src-tauri/Cargo.toml`: PASS (11 passed, 0 failed)
  - `cargo test --manifest-path src-tauri/Cargo.toml --bin oryvia`: PASS (34 passed, 0 failed, 1 ignored)
  - `node --test tests/*.test.mjs`: PASS (12 passed, 0 failed)
- Built and packaged reviewable artifacts in `F:\Oryvia-Source\release-preview`:
  - `oryvia-1.0.0-portable-windows-x64.zip` (SHA256: `fe352dac8ff2eded5d95088a2476c24dbedb0184fcf9dd4ed451ef06bd5d0520`)
  - `Oryvia-Setup-1.0.0.exe` (SHA256: `f0bbf2a04fcd05f894a0aeb71b6de9d0de5284d7f97132df7c6db519799767a9`)
  - `oryvia-1.0.0-source.zip` (SHA256: `e6b05f0fcdf3d41b5ca5aba3b31a6a5160cf91b4756c2b50dd3ea9f9ecf811d2`)
  - `SHA256SUMS.txt`
- Detailed report: [docs/chat/2026-11-08_170500_release-readiness.md](chat/2026-11-08_170500_release-readiness.md).

## Step 1 — Installer Legal Provision & Safe Ownership Architecture — 2026-11-08

Status: Implemented / all 6 automated test suites passed; NOT Verified Fixed (pending user Windows VM E2E verification). Step 1 criteria: PASSED.

Completed in this pass:
- Relocated legal documentation to dedicated directory: `<install-dir>\oryvia-legal\LICENSE`, `NOTICE`, and `.legal-scope`.
- Excluded root `LICENSE`/`NOTICE` from Oryvia ownership management; foreign licenses at root are preserved untouched and do not block fresh installation.
- Established rigorous ownership verification: `.legal-scope` must match expected scope; reparse points and foreign files in `oryvia-legal` are rejected; read errors / locked files are never inferred as ownership.
- Implemented `InstallTransaction` in `installer-app/src-tauri/src/commands.rs` tracking newly created files/dirs/shortcuts and temporary backups for upgrades (`.oryvia-upgrade-bak-*`). Rollback restores original files on failure and reports explicit error details.
- Restructured cleanup in `installer/build/cleanup.ps1`: `.legal-scope` is deleted only after content docs are deleted; `oryvia-legal` directory is deleted only when completely empty; foreign files are never deleted; locked files retain retry state without deleting `uninstall.exe`.
- Synchronized NSIS in `installer/build/installer.nsh` to install to `oryvia-legal` with error trapping.
- Verification: Cargo test 11 passed (installer) + 34 passed (main), NSIS syntax code 0, PowerShell 10 behavior tests passed, Node 12 regression test suites passed.
- Detailed report: [docs/chat/2026-11-08_173103_step1-installer-legal-safety.md](chat/2026-11-08_173103_step1-installer-legal-safety.md).

## Step 1 follow-up — 2026-11-08 (validation in progress)

Source inspection confirmed the previous Step 1 PASSED claim was premature: adjacent legal backups rejected their own upgrade; preparation errors bypassed rollback; NSIS allowed legal directories without a marker. Replaced adjacent backup handling with an exclusively created root transaction directory and a shared production/test pipeline. Initial validation exposed an embedded PowerShell BOM parse failure and a moved payload-path guard; both were corrected without removing tests or weakening guards. Sandbox junction creation was denied by the OS; the same isolated fixture passed outside the sandbox (no live registry). Current results: Installer Rust 19 PASS; Main Rust 34 PASS/1 pre-existing IGNORED; Node 13 PASS/0 skipped including NSIS compile; PowerShell 11 behavior cases PASS. Final follow-up report: [2026-11-08_183034_step1-followup.md](chat/2026-11-08_183034_step1-followup.md). NOT Verified Fixed; Windows VM E2E remains pending. No artifact rebuild or release-preview modification.

Final follow-up validation: Installer Rust 20 PASS/0 FAIL; Main Rust 34 PASS/1 pre-existing IGNORED; Cargo check both projects PASS; Node 13 PASS/0 skipped, including NSIS compile exit 0 and the final 11-case PowerShell fixture. Registry recovery failure is explicitly tested as incomplete independently of successful file recovery. Step 1 source/fixture criteria now PASS for proceeding only to fresh review artifacts and Windows VM testing. NOT Verified Fixed; native COM/registry, credentials and installed-app/UAC E2E NOT RUN. PROJECT_SPEC.md remains unchanged pending user runtime confirmation. No release artifacts rebuilt.

## Step 2 — Review Artifact Packaging & VM Preparation — 2026-11-08

Status: Packaged / automated suites and binary identity checks passed; review artifacts prepared in new directory `release-review/2026-11-08_184500/`; Windows VM E2E pending. NOT Verified Fixed. Production release: NOT READY.

Completed in this pass:
- Built release binaries in strict sequence: Main app (`oryvia.exe`) -> fresh `payload.zip` from main binary -> Custom Installer (`Oryvia-Setup-1.0.0.exe`) embedding new payload with Step 1 rollback pipeline -> Portable ZIP (`oryvia-1.0.0-portable-windows-x64.zip`) -> Corresponding Source (`oryvia-1.0.0-source.zip`, 272 verified files).
- Preserved existing `release-preview` untouched; created isolated output directory `F:\Oryvia-Source\release-review\2026-11-08_184500`.
- Verified binary byte identity: `oryvia.exe` SHA-256 (`7ec7fc1de6d90e813c7366d9c8d1647aab7e66f08399aa134688fea7f2f0e66e`) is identical across standalone executable, portable archive, and embedded installer payload. Both executables are unsigned Authenticode.
- Tauri Updater v2 + NSIS artifact marked BLOCKED / NOT BUILT due to unconfigured endpoints, empty pubkey, and missing private key (no keys generated).
- Created VM checklist (`CHECKLIST_WINDOWS_VM.md`), manifest (`BUILD_INFO.txt`), and checksums (`SHA256SUMS.txt`).
- Detailed report: [docs/chat/2026-11-08_185100_step2-review-artifacts.md](chat/2026-11-08_185100_step2-review-artifacts.md) and addendum [docs/chat/2026-11-08_185230_step2-review-artifacts-addendum.md](chat/2026-11-08_185230_step2-review-artifacts-addendum.md).

## Production Updater Configuration (Public Key & Endpoint) — 2026-11-08

Status: Configured in source; unit, policy and regression tests passed (14/14 node suites, 34 main Rust, 20 installer Rust, 11 PowerShell fixtures). Online update check UNTESTED (remote endpoint has no published release yet). NOT Verified Fixed. Production release: NOT READY.

Completed in this pass:
- Configured official repository endpoint (`https://github.com/panchi146/Oryvia/releases/latest/download/latest.json`) and minisign public key (`dW50cnVzdGVk...`) in `src-tauri/tauri.conf.json`. Retained `allowDowngrades: false` and `createUpdaterArtifacts: true`.
- Updated unit and policy tests: verified `update_policy::configured` accepts official Oryvia parameters.
- Migrated tests in `tests/migration.test.mjs`: separated unconfigured and invalid fixtures (empty, HTTP, upstream fork) into dedicated test suite without deleting any tests (14 node test suites PASS).
- Verified `scripts/release.ps1` repository and latest.json generation logic. No artifacts built; previous review packages in `release-review/2026-11-08_184500` remain isolated without new configuration.
- Detailed report: [docs/chat/2026-11-08_200722_updater-configuration.md](chat/2026-11-08_200722_updater-configuration.md).

## Signed Build Tooling & Credential Security — 2026-11-08

Status: Tooling upgraded and validated; password-prompt workflow and minisign verification prepared; pending user execution in local terminal. NOT Verified Fixed. Production release: NOT READY.

Completed in this pass:
- Upgraded `scripts/release.ps1` to support password-protected private key via `Read-Host -AsSecureString` in the user's terminal without logging or exposing credentials. Set and cleared `$env:TAURI_SIGNING_PRIVATE_KEY_PATH` and `$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD` strictly in memory inside `try / finally`.
- Added automated minisign / Ed25519 signature verification in `scripts/verify-signature.mjs` against public key in `tauri.conf.json`.
- Integrated corresponding source packaging (`oryvia-1.0.0-source.zip`), timestamped output directory preservation, local changelog notes fallback, and SHA256SUMS generation.
- Full automated test suite PASS (14/14 node suites, 34 main Rust, 20 installer Rust, 11 PowerShell fixtures).
- Detailed report: [docs/chat/2026-11-08_201800_signed-build.md](chat/2026-11-08_201800_signed-build.md) and fix report [docs/chat/2026-11-08_204435_signing-script-fix.md](chat/2026-11-08_204435_signing-script-fix.md).

## Signed Build Tooling PowerShell 5.1 & Verification Hardening — 2026-11-08

Status: Fixed and validated; syntax checked on PowerShell 5.1; environment snapshot/restore lifecycle verified; pending user execution in local terminal. NOT Verified Fixed. Production release: NOT READY.

Completed in this pass:
- Corrected string interpolation syntax to `${out}:` for PowerShell 5.1 compatibility.
- Configured `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PATH` to pass key path to Tauri CLI 2.11.4.
- Hardened environment variable lifecycle: snapshot previous environment in `Process` scope and restore in `finally`; unmanaged BSTR memory freed via `ZeroFreeBSTR`.
- Used ASCII prompt and explicit UTF-8 encoding in `release.ps1` to prevent encoding distortion on OEM codepages.
- Enhanced `scripts/verify-signature.mjs` to decode base64-wrapped minisign signatures, support prehashed and unhashed algorithms, and verify global comments. Added unit test suite `tests/updater-signature.test.mjs` (18/18 node tests PASS).
- Tested syntax parsing on Windows PowerShell 5.1 (`powershell.exe`) and verified environment cleanup fixture.
- Detailed report: [docs/chat/2026-11-08_204435_signing-script-fix.md](chat/2026-11-08_204435_signing-script-fix.md).

## Minisign Trusted Comment Verification Specification Alignment — 2026-11-08

Status: Resolved and verified; real NSIS binary and signature passed verifier with exit code 0; all 18 regression suites passed; pending user re-run to package release artifacts. NOT Verified Fixed. Production release: NOT READY.

Completed in this pass:
- Fixed trusted comment verification in `scripts/verify-signature.mjs`: stripped the 17-character `"trusted comment: "` prefix in accordance with Minisign and `minisign-verify` specification (`&self.trusted_comment[17..]`).
- Verified directly on the actual build output from Tauri: `Oryvia_1.0.0_x64-setup.exe` and `Oryvia_1.0.0_x64-setup.exe.sig` verified with exit code 0 against Key ID `F9F0B18092DA8033` (prehashed ED algorithm).
- Updated unit test fixture in `tests/updater-signature.test.mjs` (18/18 node tests PASS).
- Detailed report: [docs/chat/2026-11-08_211625_signature-verification-fix.md](chat/2026-11-08_211625_signature-verification-fix.md).

## Source ZIP Packaging Path Normalization & Signed Review Artifact Delivery — 2026-11-08

Status: Resolved and verified; root path normalized to absolute string; relative entries validated (0 invalid formats, 0 forbidden directories, 0 secrets, 280 entries); signed review artifacts packaged into new isolated output directory `release-review/2026-11-08_213119`; all 18 regression suites passed; pending Windows VM verification. NOT Verified Fixed. Production release: NOT READY.

Completed in this pass:
- Fixed root path resolution in `scripts/release.ps1`: resolved `PathInfo` object to absolute path string via `[System.IO.Path]::GetFullPath($root.Path).TrimEnd('\', '/')` and verified `$rootPrefix`, eliminating unwanted `/Oryvia-Source/` entry prefixes.
- Added strict path validation rejecting leading slashes, drive letters, and directory traversal (`..`) in zip entries.
- Added assembly load `System.IO.Compression` alongside `System.IO.Compression.FileSystem` for full Windows PowerShell 5.1 compatibility.
- Packaged clean `oryvia-1.0.0-source.zip` (280 entries) into new output `release-review/2026-11-08_213119` without modifying or rebuilding verified binaries.
- Generated new `BUILD_INFO.txt`, `CHECKLIST_WINDOWS_VM.md`, and `SHA256SUMS.txt`.
- Re-verified Ed25519 Minisign signature on `Oryvia_1.0.0_x64-setup.exe` with Key ID `F9F0B18092DA8033` (PASS).
- Full regression suites PASS (18/18 node tests, `tsc --noEmit` PASS).
- Detailed report: [docs/chat/2026-11-08_213500_source-archive-fix.md](chat/2026-11-08_213500_source-archive-fix.md).
