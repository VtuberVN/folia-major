## 🎉 Folia v0.7.20-extra.2 — Bản cập nhật Hotfix & Đồng bộ tính năng mở rộng

Bản phát hành sửa lỗi khởi động trên Windows do thay đổi đường dẫn module FFmpeg từ upstream, sửa lỗi crash đen màn hình khi cuộn và rê chuột vào NhacCuaTui (NCT), đồng thời tinh chỉnh và chuẩn hóa tương thích giữa các nền tảng âm nhạc mới (YouTube Music, Spotify) và các dịch vụ mở rộng (Zing MP3, Nhạc Của Tui).

---

### 🛠️ Các sửa đổi và khắc phục quan trọng (Changelog)

1. **Khắc phục triệt để lỗi crash đen màn hình khi chọn / cuộn đến NhacCuaTui (NCT):**
   - Loại bỏ `WebkitMaskImage` / `maskImage` trên container cuộn danh sách nền tảng `PlatformColumn.tsx`, loại bỏ nguyên nhân gây crash bộ vẽ Skia GPU (GPU context loss) của Chromium/Electron trên Windows.
   - Bổ sung `getLoginStatus` và `logout` an toàn cho `nctProvider`, ngăn chặn ngoại lệ chưa bắt trong luồng đọc tài khoản của Folia.
   - Bổ sung đầy đủ chuỗi bản dịch `loginTitleZing`, `loginNoteZing`, `loginTitleNct`, `loginNoteNct` trên tất cả 5 ngôn ngữ (`vi`, `en`, `zh-CN`, `in`, `vi-core`).

2. **Tích hợp `AppErrorBoundary` bảo vệ giao diện toàn cục:**
   - Bọc toàn bộ nội dung ứng dụng (`AppShell.tsx`) trong Error Boundary để bắt mọi ngoại lệ React nếu có.
   - Đảm bảo thanh điều khiển cửa sổ (`WindowControls`: thu nhỏ, phóng to, đóng cửa sổ) và drag zone luôn luôn hiển thị và hoạt động được ngay cả khi một component con gặp sự cố, kèm nút "Tải lại ứng dụng".

3. **Khắc phục lỗi khởi động crash WASAPI:**
   - Sửa lỗi `Cannot find module '../modSystem/ffmpeg.cjs'` trong `electron/wasapi/wasapiEngine.cjs` do file FFmpeg đã được upstream chuyển vị trí sang `electron/ffmpeg.cjs`.
   - Ứng dụng khởi động mượt mà, không còn gặp lỗi popup JavaScript lỗi khi mở app.

4. **Đồng bộ kiến trúc Upstream (YouTube Music & Spotify):**
   - Áp dụng nguyên vẹn luồng xử lý và kiến trúc provider mới nhất của tác giả gốc đối với YouTube Music và Spotify.
   - Loại bỏ các module mock và code trung gian thừa kế cũ để đồng bộ 100% với hệ thống quản lý tài khoản / omni provider của upstream.

5. **Chuẩn hóa các Provider mở rộng (Zing MP3 & NhacCuaTui):**
   - Bổ sung `PlatformMark` cho Zing MP3 (`Z`) và NCT (`N`) tương thích với giao diện tìm kiếm thống nhất của Folia.
   - Chuẩn hóa thứ tự tab tìm kiếm đa nền tảng: ưu tiên provider chính được chọn, tiếp theo là các provider phụ (Zing, NCT, QQ, Kugou), sau đó đến Local và Navidrome.
   - Tuân thủ kiểm tra kiến trúc nghiêm ngặt `omniArchitecture` và 100% unit tests (1118/1118 tests passed).

6. **Bảo tồn đầy đủ các tính năng độc quyền nhánh `extra-features`:**
   - **WASAPI Exclusive Mode**: Xuất âm thanh bit-perfect trực tiếp qua WASAPI Engine.
   - **Sora 3D Visualizer & Tide Fluid Visualizer**: Bộ hiệu ứng sóng nhạc và visualizer không gian 3D.
   - **Mini Lyric Bar**: Thanh lời bài hát mini ghim nổi trên màn hình.
   - **Acrylic / Liquid Glass & Splash Screen Fix**: Tối ưu hiệu ứng thị giác và sửa lỗi màn hình chờ khi khởi động.
   - **Bản địa hóa tiếng Việt 100%**.

---

### 📦 Tải về (Download)

| Tệp tin | Mô tả |
| :--- | :--- |
| **`Folia-Setup-0.7.20-extra-features.exe`** | Bộ cài đặt Windows x64 (Tự động cập nhật) |
| **`Folia-0.7.20-extra-features-win-x64.zip`** | Bản Portable chạy ngay không cần cài đặt |

#### Mã kiểm tra toàn vẹn (SHA256 Checksums)
```text
2a7f7791c260f932aeb8acbeba72a761f32d4088307a417e9d0e62796bc9fb5b  Folia-Setup-0.7.20-extra-features.exe
72ec2d87c1bdd036157251a98751d411da243347a692bc55277ff15dedf777a6  Folia-0.7.20-extra-features-win-x64.zip
```
