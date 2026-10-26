# StaNovant 2.5.2 — Admin mặc định CHỈ khi thử nghiệm trên máy cá nhân

**Trên máy bạn (Node.js lắng nghe 127.0.0.1, `NODE_ENV` không phải `production`):** chỉ cần `npm.cmd start`, hệ thống tự chuẩn bị tài khoản quản trị để đăng nhập:

- **Tên đăng nhập:** `admin`
- **Mật khẩu thử nghiệm:** `admin`
- **Trang quản trị:** `http://127.0.0.1:3000/admin.html`

**Không cần chạy `npm run admin:create` để dùng tài khoản thử nghiệm.** Nếu bạn đã tạo Admin trước đây bằng mật khẩu mạnh, mã không xóa hoặc đổi mật khẩu đó; trên localhost bạn vẫn có thể dùng `admin/admin`.

## An toàn khi công khai website

**Mật khẩu yếu `admin/admin` tự động bị vô hiệu** khi chạy `NODE_ENV=production` hoặc máy chủ lắng nghe `HOST=0.0.0.0` (ví dụ Render). Ngoài ra có thể tắt chủ động bằng `STANOVANT_DISABLE_TEST_ADMIN=1`. Tài khoản mặc định không lưu mật khẩu yếu vào SQLite. **Không dùng tunnel, ngrok, port-forward hoặc proxy để đưa server local có chế độ test lên Internet**, vì người biết `admin/admin` có thể chiếm quyền.

Nếu dùng Render thật, hãy đặt mật khẩu mạnh qua biến môi trường bí mật và khởi tạo riêng theo hướng dẫn an toàn; tài khoản trên máy cá nhân không tự đồng bộ lên Render. Tuyệt đối không đưa file SQLite hoặc tệp bí mật lên GitHub.

## Cách chạy

```powershell
cd "E:\Web dạy học\StaNovant"
$env:Path += ";C:\Program Files\nodejs"
npm.cmd start
```

Sau đó vào `http://127.0.0.1:3000/dangnhap.html` và dùng `admin` / `admin`. Nếu gặp lỗi cổng 3000 đã dùng, tắt server trước đó bằng Ctrl+C.

## Chạy các bài kiểm thử

```powershell
npm.cmd test
```

---

# StaNovant 2.5.1 — Sửa lỗi cấp quyền học viên

Sửa lỗi **JSON không hợp lệ** khi Admin bấm Cấp quyền. Admin UI giờ gửi JSON rỗng; server cũng chấp nhận thao tác cấp quyền không có body JSON vì ID đã nằm trong URL. Thu hồi quyền, kiểm tra quyền video và dữ liệu cũ không thay đổi. Chạy `npm.cmd test` để kiểm tra.

**Nâng cấp:** Sao lưu file `data/stanovant.sqlite` trong bản bạn đang dùng. Tắt server cũ, thay các tệp mã nguồn từ bản này (không ghi đè database của bạn), chạy `npm.cmd start`, rồi tải lại bằng `Ctrl+Shift+R`.

---

# StaNovant 2.5 — Bản FULL, quản lý quyền học viên

## Nâng cấp trọng tâm (v2.5)

1. **Không còn bốn khóa học ví dụ được viết sẵn trên trang chủ.** Danh sách lấy trực tiếp từ `/api/catalog`, chỉ xuất hiện khi Admin tạo và chọn *Công khai*.
2. **Xem giới thiệu trước khi được cấp quyền.** Một tài khoản học viên chỉ nhìn thấy tiêu đề, mô tả và số lượng bài học, không nhận dữ liệu nội dung/video. Không hiển thị danh sách bài học khi chưa có quyền.
3. **Admin cấp/thu hồi quyền theo từng người dùng.** Đăng nhập `admin`, vào `admin.html` → **Cấp quyền học** → chọn khóa học → chọn học viên → **Cấp quyền** hoặc **Thu hồi quyền**. Quyền ghi vào bảng `course_enrollments` trong SQLite.
4. **Kiểm tra quyền tại server**, không chỉ giấu nút. Kể cả khi học viên đoán URL `/api/catalog/:id` hoặc `/api/media/:filename`, server vẫn từ chối trả nội dung nếu không đủ quyền. Khi thu hồi, API có hiệu lực ngay; video đã tải xuống hoặc lưu cục bộ trước đó không thể thu hồi lại từ thiết bị của học viên.
5. **Bỏ hiệu ứng cố tình chờ 0,5 giây**. Các trang đổi ngay theo tốc độ mạng; chỉ hiện loading khi có tác vụ thật.
6. **Hình nhân vật trò chơi mới** vẽ bằng công cụ tạo ảnh, phát triển riêng cho StaNovant; đã thay ảnh SVG hoạt hình phẳng bằng nhân vật phong cách game fantasy, hiệu ứng ánh sáng và tấn công.

## Chạy trên Windows / VS Code

Giải nén ZIP rồi mở **đúng thư mục `StaNovant` chứa `package.json`**. Mở Terminal:

```powershell
cd "E:\Web dạy học\StaNovant"
$env:Path += ";C:\Program Files\nodejs"
npm.cmd run admin:create
npm.cmd start
```

Lệnh `admin:create` là cách tạo Admin với mật khẩu mạnh cho môi trường khác. **Khi test tại localhost, chỉ cần `npm start` rồi dùng `admin/admin`**, không cần chạy `admin:create`.

Mở `http://127.0.0.1:3000/dangnhap.html`. Đăng nhập Admin với tên `admin` để vào `http://127.0.0.1:3000/admin.html`.

**Quy trình thử hoàn chỉnh:**

1. Đăng ký tài khoản học viên thử trên trang đăng ký (một trình duyệt hoặc cửa sổ ẩn danh khác).
2. Admin → Khóa học → Thêm khóa học → nhập tên/mô tả → chọn Công khai.
3. Admin → Bài học / Video → thêm bài, nhập nội dung hoặc video của bạn.
4. Học viên đăng nhập: chỉ thấy giới thiệu khóa học, có biểu tượng khóa, không xem bài/video.
5. Admin → Cấp quyền học → chọn đúng khóa và học viên → Cấp quyền.
6. Học viên tải lại trang khóa học: xem được nội dung, video. Thu hồi quyền ở Admin để kiểm tra việc khóa lại.

## Hạn chế bảo mật / dữ liệu cần nhớ

- Quyền truy cập được kiểm tra đối với video **tải lên hệ thống** qua `/api/media/`. Nếu bạn dán URL video HTTPS công khai từ nền tảng bên ngoài, người biết URL có thể truy cập ngoài StaNovant. Muốn bán khóa học, cần dịch vụ video private/signed URLs và kiểm soát phân quyền tại nguồn lưu trữ.
- Dùng **SQLite + upload trên ổ đĩa máy chủ** để phát triển/thử nghiệm. Render gói miễn phí có hệ thống tệp tạm; sau khi restart/deploy dữ liệu hoặc video có thể mất. Không dùng để thu phí hoặc lưu học viên thật khi chưa chuyển sang lưu trữ bền vững và sao lưu định kỳ.
- Chưa có thanh toán thật, xác minh email, quên mật khẩu, xác thực đa yếu tố, luồng hỗ trợ xóa dữ liệu, chống chia sẻ tài khoản, giám sát và kiểm toán bảo mật toàn diện.
- Nội dung khóa học đã tồn tại từ bản 2.4 vẫn giữ nguyên nếu tiếp tục dùng **cùng file SQLite**. Bảng quyền được tạo tự động khi server v2.5 chạy. Chưa cấp quyền cho ai theo mặc định.
- Nếu thay thư mục project, sao lưu database trong `data/stanovant.sqlite` trước. **Không upload database, video riêng tư, khóa bí mật lên GitHub**.
- Số lượng học viên ở bảng Admin đang giới hạn bản thử nghiệm; quy mô lớn cần phân trang và tìm kiếm ở server.

## Kiểm tra tự động

```powershell
npm.cmd test
```

---

# StaNovant v2.4 – Website học tập và Admin

Bản này bao gồm **đủ toàn bộ tệp** HTML/CSS/JS/Node.js, không cần ghép với bản trước.

## Chạy từ đầu trong VS Code (Windows)

1. Giải nén ZIP. Sao lưu file SQLite cũ nếu bạn cần giữ tài khoản (`data/stanovant.sqlite`), không đưa file này lên GitHub.
2. Mở **đúng thư mục StaNovant** (có `package.json`) trong VS Code, mở Terminal → New Terminal.
3. Nếu Windows chưa nhận Node/npm trong Terminal, chạy `$env:Path += ";C:\Program Files\nodejs"`.
4. Tạo tài khoản quản trị **một lần duy nhất**:

```powershell
npm.cmd run admin:create
```

Kết quả sẽ in:

```text
Tên đăng nhập: admin
Mật khẩu khởi tạo (ghi lại ngay): <mật khẩu mạnh được tạo ngẫu nhiên>
```

**Trong chế độ production không có mật khẩu mặc định `admin/admin`**, vì quá dễ bị chiếm tài khoản. Hãy ghi mật khẩu vào trình quản lý mật khẩu. Tài khoản được tạo vào **DB_PATH hiện tại trên máy**. Không tải `.sqlite`, `.env`, khóa mật hay bản sao lưu lên GitHub.

5. Khởi động website:

```powershell
npm.cmd start
```

6. Mở `http://127.0.0.1:3000/dangnhap.html`, điền **admin** vào ô *Email hoặc tên quản trị*, nhập mật khẩu vừa tạo. Sau khi đăng nhập, bạn sẽ vào `/admin.html`.
7. Để dùng tài khoản học viên: đăng ký bằng email bình thường. Sau đăng nhập, học viên vào `/hocvien.html`.

Nếu báo cổng 3000 đã dùng, hãy tắt Terminal chạy server cũ bằng **Ctrl+C** rồi mở lại.

## Chức năng mới

- `admin.html`: dashboard quản trị độc lập. **Admin-only API** được bảo vệ bằng vai trò trong cơ sở dữ liệu.
- **Tạo/sửa/xóa khóa học**, xuất bản hoặc để bản nháp.
- **Tạo/sửa/xóa bài học**, nội dung văn bản và video.
- **Tải MP4/WebM dưới 30 MB** lên thư mục riêng tư trên server, hoặc gắn URL HTTPS tới video ngoài; video lớn nên dùng nơi lưu video chuyên dụng. Các video trong bản thử được xem bởi người dùng đã đăng nhập, **chưa có kiểm tra quyền mua khóa học**.
- Học viên mở khóa đã xuất bản qua `hocvien.html` hoặc `khoahoc.html` rồi vào `lop.html`.
- Admin xem tên, email, vai trò, tiến độ bài học và số trắc nghiệm đúng; **không thể xem mật khẩu hoặc mã phiên**.
- Trang đăng nhập/đăng ký không còn ảnh học sinh cũ; sửa màu nền và ô **Gợi ý học tiếp** cả sáng/tối; có chuyển màu mượt, hiệu ứng tải trang khoảng 0,5 giây.
- Dữ liệu khóa học, bài học, tài khoản và tiến độ lưu vào SQLite bên phía server, không vào localStorage (trừ lựa chọn chủ đề giao diện).

## Sao lưu dữ liệu

Chạy:

```powershell
npm.cmd run backup
```

Tạo thư mục `backups/backup-...` gồm bản sao database và video uploads (nếu có). Lưu riêng nơi an toàn; hãy kiểm thử khôi phục dữ liệu, không upload thư mục `backups` lên GitHub.

## Triển khai Internet và giới hạn quan trọng

**Đây là bản phát triển/thử nghiệm, không phải hệ thống đã được kiểm toán bảo mật để vận hành thương mại.** Bản đã có phân quyền phía server, mật khẩu băm scrypt, cookie HttpOnly và Secure khi chạy với NODE_ENV=production, chống brute-force cơ bản và giới hạn tệp video, nhưng còn cần:

- Xác minh email, quên mật khẩu an toàn, MFA cho Admin, bảo vệ CSRF và giới hạn tốc độ truy cập tập trung, kiểm toán bảo mật.
- Phân quyền chi tiết giáo viên/học viên, quyền xem video theo gói mua, xử lý GDPR/pháp luật Việt Nam, quản lý dữ liệu cá nhân và chức năng xóa tài khoản.
- Quản lý video lớn qua dịch vụ lưu trữ đáng tin cậy, scan file, CDN; không dùng ổ tạm của Render Free để lưu video hoặc SQLite.
- PostgreSQL hoặc SQLite trên ổ lưu trữ bền, backup/restore tự động và thử nghiệm khôi phục.
- Cổng thanh toán theo quy định sau khi hoàn thiện bảo mật, quyền tác giả và điều khoản giao dịch.

**Render Free:** Hệ thống file tạm có thể mất SQLite, mật khẩu Admin và video sau khi deploy/restart, vì vậy không sử dụng để giữ dữ liệu thật. Nếu triển khai trên Render có lưu trữ bền, cần đặt `DB_PATH` vào volume và sao lưu riêng thư mục chứa video. Để tạo Admin trên hosting, cần chạy setup script trong môi trường hosting với `DB_PATH` trỏ cùng cơ sở dữ liệu; tạo Admin trên máy cá nhân **không tự chuyển** tài khoản đó lên Render.

> Bạn cần giữ dữ liệu cũ? Sao lưu `data/stanovant.sqlite` trước khi thay mã nguồn. Bản v2.4 tự thêm cột `role` cho DB StaNovant 2.3; không xóa người dùng cũ.

## Bản quyền

Mã nguồn và những hình minh họa gốc trong bộ dự án dành để bạn tùy biến. Khi đưa video, ảnh, âm nhạc hoặc tài liệu bên ngoài vào khóa học, bạn cần kiểm tra giấy phép tương ứng. Không thể cam kết tên thương hiệu StaNovant không trùng nhãn hiệu nếu chưa tra cứu độc lập.
