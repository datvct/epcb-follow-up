# Hướng dẫn triển khai — Netlify + Google Apps Script + Google Sheets

Kiến trúc:

```
Netlify (frontend/index.html)  ← epcbproject.netlify.app
        ↕ JSONP
Google Apps Script (backend/*.gs)  ← chứa API_PASSWORD
        ↕
Google Sheets  ← database
  ├── Sheet "Projects"          ← dữ liệu gốc, CRUD từ web
  └── Sheet "Dashboard View"    ← view đẹp, tự cập nhật bằng công thức QUERY/SUMIFS
```

---

## Bước 1 — Tạo Google Sheet database

1. Vào https://sheets.google.com → tạo 1 file mới, đặt tên ví dụ "DB - Du an follow up".
2. Copy ID của sheet từ URL:
   `https://docs.google.com/spreadsheets/d/DAY_LA_SHEET_ID/edit` → copy `DAY_LA_SHEET_ID`.
3. Chưa cần tạo cột gì — bước 3 code sẽ tự tạo đủ 4 sheet.

## Bước 2 — Tạo project Apps Script (backend)

1. Vào https://script.google.com → **New project**.
2. Đặt tên, ví dụ "Backend du an follow up".
3. Xoá hết nội dung `Code.gs` mặc định.
4. Tạo lần lượt 6 file **loại Script (.gs)**, copy đúng nội dung từ thư mục `backend/`:
   - `Config.gs`
   - `Auth.gs`
   - `Router.gs`
   - `Data.gs`
   - `Dashboard.gs`
   - `Setup.gs`
5. Mở `Config.gs`, sửa 2 dòng:
   ```js
   const SHEET_ID = 'DAN_ID_GOOGLE_SHEET_CUA_BAN_VAO_DAY';
   const API_PASSWORD = 'DOI_MAT_KHAU_NAY_TRUOC_KHI_DEPLOY';
   ```
   → Dán ID sheet ở Bước 1, và đặt 1 mật khẩu riêng (không dùng mật khẩu Google thật).

## Bước 3 — Khởi tạo cấu trúc sheet (chạy 1 lần)

1. Trong Apps Script, chọn hàm `setupSpreadsheet` ở thanh chọn hàm phía trên toolbar.
2. Bấm **Run** (▶). Lần đầu Google sẽ hỏi cấp quyền → **Advanced** → **Go to [tên project] (unsafe)** → **Allow**.
3. Mở lại Google Sheet — sẽ thấy 4 sheet tự động tạo:
   - **Projects** — sheet chính, web CRUD trực tiếp vào đây.
   - **Dashboard View** — view tổng hợp, dùng công thức QUERY/SUMIFS đọc thẳng từ Projects nên **tự cập nhật realtime**, không cần chạy script hay trigger gì thêm. Chỉ nên xem, không sửa tay trong sheet này.
   - **Probability Map** — bảng % xác suất chốt theo trạng thái, sửa tay được.
   - **History Log** — tự ghi log mỗi khi có thêm/sửa dự án, phục vụ biểu đồ xu hướng trên web.

## Bước 4 — Publish Apps Script thành Web App

1. Trong Apps Script, bấm **Deploy** → **New deployment**.
2. Chọn loại: **Web app**.
3. Cấu hình:
   - Execute as: **Me**
   - Who has access: **Anyone** (bắt buộc, vì Netlify gọi từ ngoài Google — lớp `API_PASSWORD` ở Bước 2 sẽ chặn người lạ).
4. Bấm **Deploy** → copy URL dạng:
   `https://script.google.com/macros/s/XXXXXXXX/exec`

> Mỗi lần bạn sửa code trong Apps Script, phải vào **Deploy → Manage deployments → sửa deployment hiện có → Version: New version → Deploy** thì URL `/exec` mới nhận code mới.

## Bước 5 — Cấu hình frontend

1. Mở `frontend/js/config.js`, dán URL `/exec` vừa copy:
   ```js
   const API_URL = 'https://script.google.com/macros/s/XXXXXXXX/exec';
   ```

## Bước 6 — Deploy frontend lên Netlify

**Cách nhanh nhất (kéo-thả):**
1. Vào https://app.netlify.com → **Add new site** → **Deploy manually**.
2. Kéo thả toàn bộ thư mục `frontend/` vào ô upload.
3. Netlify tự cấp domain dạng `random-name-123.netlify.app`.
4. Vào **Site settings → Change site name** → đổi thành `epcbproject` để có domain `epcbproject.netlify.app`.

**Cách dùng Git (khuyên dùng nếu cần sửa thường xuyên):**
1. Đẩy thư mục `frontend/` lên 1 repo GitHub.
2. Netlify → **Add new site → Import an existing project** → chọn repo.
3. Build command: để trống. Publish directory: `.` (vì đây là site tĩnh, không cần build).

## Bước 7 — Kiểm thử

1. Mở `https://epcbproject.netlify.app` → màn hình đăng nhập hiện ra → nhập đúng `API_PASSWORD` đã đặt ở Bước 2.
2. Vào tab "Thêm dự án" → thêm thử 1 dự án → kiểm tra dòng mới xuất hiện trong sheet **Projects**, đồng thời sheet **Dashboard View** tự cập nhật số liệu ngay (không cần reload gì cả, vì là công thức Sheets).
3. Vào tab "Danh sách & follow up" → bấm vào 1 dòng → thử "Đã follow up (+1)".
4. Đặt "Ngày follow up" là hôm nay/quá khứ → về tab Dashboard kiểm tra hiện trong khung "Cần follow up gấp".

---

## Lưu ý bảo mật (đọc kỹ)

Vì kiến trúc bắt buộc dùng **JSONP** (Netlify và Apps Script khác domain, Apps Script Web App không set CORS cho `fetch()`), mật khẩu API phải gửi qua query string của URL. Ai mở DevTools → Network vẫn xem được request. Đây là mức bảo mật "chặn người ngoài tình cờ/không biết", **không phải** bảo mật cấp production cho dữ liệu thực sự nhạy cảm.

Nếu cần chặt hơn:
- Giới hạn "Who has access" ở Bước 4 xuống nội bộ Google Workspace nếu team dùng chung 1 domain Google.
- Hoặc đổi mật khẩu định kỳ, theo dõi `History Log` bất thường.

## Tính năng mới — Tự động đọc file báo giá từ link Drive

Khi dán 1 link Google Drive (PDF/Doc/Sheet theo đúng mẫu "BẢNG BÁO GIÁ") vào
ô **"File/sản phẩm báo giá"** ở form Thêm báo giá và bấm Lưu, hệ thống tự
động mở file đó, đọc bảng sản phẩm và lưu vào 6 cột mới ở cuối sheet
**Projects**: Tên sản phẩm, Tình trạng sản phẩm, Số lượng, Đơn giá, Thành
tiền báo giá, Trạng thái đọc file (tất cả có hậu tố "(tự động)"). Trong tab
**Danh sách**, ô tìm kiếm giờ tìm luôn theo tên sản phẩm này — filter theo
tên sản phẩm vẫn ra đúng báo giá của khách hàng đó.

**Bước bắt buộc thêm (chỉ làm 1 lần):**
1. Trong Apps Script, mở file code mới `QuoteParser.gs` — copy nội dung từ
   `backend/QuoteParser.gs` vào (giống Bước 2 ở trên, tạo thêm 1 file .gs).
2. Bấm menu **Dịch vụ** (icon dấu +) ở sidebar bên trái → chọn **Drive API**
   → **Thêm (Add)**. Đây là Advanced Google Service dùng để convert PDF
   sang Google Doc nhằm đọc được chữ trong đó — không cần cấu hình gì thêm
   ở Google Cloud Console.
3. Deploy lại (Deploy → Manage deployments → sửa deployment hiện có →
   Version: New version → Deploy) để `/exec` nhận code mới.
4. Kéo-thả lại `frontend/` (đã có sẵn phần hiển thị sản phẩm tự động trong
   modal Cập nhật báo giá + nút "đọc lại file").

**Lưu ý quan trọng:**
- File Drive phải để chế độ chia sẻ mà tài khoản chạy script (đăng nhập lúc
  Deploy → Execute as: Me) mở được — nếu để "Riêng tư" sẽ đọc lỗi.
- PDF phải là PDF "chữ thật" (xuất từ Sheet/Word/Docs) như mẫu báo giá EPCB,
  không phải ảnh scan mờ — độ chính xác phụ thuộc khả năng convert PDF→Doc
  của Google nên không đảm bảo đúng 100% mọi trường hợp.
- Việc đọc file chạy ngay trong lúc Lưu (không phải job nền thật sự — Apps
  Script không hỗ trợ chạy nền độc lập), nên thao tác Lưu có thể chậm hơn
  vài giây so với trước. Nếu đọc lỗi, báo giá vẫn được lưu bình thường, chỉ
  có cột "Trạng thái đọc file" ghi lại lý do lỗi để bạn nhập tay hoặc bấm
  nút "đọc lại file" (icon 🔄 trong modal Cập nhật) sau khi đã sửa file/quyền.
- Sửa file trên link mà không đổi link mới thì hệ thống sẽ **không** tự đọc
  lại khi bạn sửa các trường khác của báo giá (để tránh gọi Drive liên tục)
  — bấm nút "đọc lại file" trong modal Cập nhật để đọc lại thủ công.

## Sau khi đã dùng ổn định

- Muốn thêm cột mới: chỉ sửa `FIELD_MAP` trong `backend/Config.gs` — nhưng nếu đã setup rồi, thêm cột mới nên thêm vào **cuối mảng** để không lệch công thức cột cố định (A–S) trong sheet **Dashboard View**.
- Muốn sửa % xác suất chốt: mở thẳng sheet **Probability Map**, sửa cột "Xác suất chốt" — web tự đọc lại.
- Muốn nhắc follow up qua email/Zalo tự động mỗi sáng: gắn thêm 1 time-driven trigger gọi hàm dựa trên `getUpcomingFollowUps()` trong `Dashboard.gs` — nói mình biết nếu cần, mình viết thêm phần này.

---

## Cập nhật giao diện & tính năng (bản mới nhất)

Toàn bộ thay đổi lần này chỉ nằm ở `frontend/` — **không cần đụng vào Apps Script / không cần Deploy lại backend**, chỉ cần kéo-thả lại thư mục `frontend/` mới lên Netlify (hoặc git push nếu dùng Git).

1. **Giao diện mới**: chuyển sang layout sidebar hiện đại (menu dọc bên trái, topbar phía trên có nút làm mới + chuông nhắc nhở), KPI card có icon màu, bo góc/đổ bóng mềm, font Inter — tham khảo phong cách từ epcbproject.netlify.app.
2. **Xem số liệu theo Ngày / Tuần / Tháng / Tất cả**: bộ chuyển ở đầu tab Tổng quan — đổi cả 4 KPI, biểu đồ trạng thái và biểu đồ xu hướng doanh thu theo đúng khoảng đang chọn. Tab Danh sách cũng có bộ lọc riêng "báo giá hôm nay/tuần này/tháng này". Tab Báo cáo có 4 lát cắt: Theo Sales / Theo ngày / Theo tuần / Theo tháng, mỗi lát cắt có cả bảng số liệu và biểu đồ cột.
3. **Cơ chế nhắc nhở nâng cao**: khung "Cần follow up" có 2 tab (Quá hạn & sắp tới hạn / Tất cả đang theo dõi), nút "follow up nhanh (+1)" ngay trong danh sách không cần mở modal, chuông ở topbar hiện số lượng cần xử lý, xin quyền gửi **thông báo trình duyệt (browser notification)** khi có báo giá quá hạn, và tự động làm mới dữ liệu mỗi 5 phút trong lúc mở app.

Toàn bộ tính toán lọc/gom nhóm theo ngày-tuần-tháng chạy ở trình duyệt (file `frontend/js/periods.js`) dựa trên dữ liệu đã lấy về, nên không phát sinh thêm lệnh gọi tới Google Sheets.
