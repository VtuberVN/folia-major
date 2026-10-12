# 🎵 YouTube Provider Mod cho Folia

> **Nguồn phát nhạc YouTube & YouTube Music chất lượng cao dành cho trình phát Folia Major.**  
> Hỗ trợ tìm kiếm, phát âm thanh trực tiếp và tự động đồng bộ lời bài hát thời gian thực (.lrc).

---

## 🌟 Tính năng nổi bật

- 🔍 **Tìm kiếm không giới hạn:** Tìm kiếm bài hát, ca sĩ, album trực tiếp trên YouTube Music thông qua official InnerTube API (không cần tạo hay cấu hình Google Cloud API Key).
- 🔗 **Dán link YouTube trực tiếp:** Hỗ trợ nhận diện và phát ngay khi dán link video hoặc ID bài hát:
  - `https://www.youtube.com/watch?v=...`
  - `https://youtu.be/...`
  - `https://music.youtube.com/watch?v=...`
- ⚡ **Local Streaming Proxy:** Tích hợp máy chủ proxy luồng âm thanh cục bộ (127.0.0.1) trên tiến trình Electron Main Process:
  - Vượt qua rào cản CORS và Private Network Access (PNA).
  - Hỗ trợ đầy đủ HTTP Range Request (`206 Partial Content`) giúp tua bài (seek), tải trước (buffer) mượt mà.
  - Tự động bám theo HTTP 302 Redirect từ Google Video CDN.
- 🎤 **Tự động tìm kiếm & Đồng bộ lời bài hát (.lrc):**
  - **LRCLIB:** Kho dữ liệu lời bài hát đồng bộ mở quốc tế lớn nhất.
  - **Zing MP3 Fallback:** Tự động tìm kiếm lời bài hát dự phòng chuyên biệt cho V-Pop và các ca khúc tiếng Việt.
  - Render đầy đủ hiệu ứng chữ, chữ chạy theo dòng và phụ đề chuẩn Folia.
- 🧹 **Tự phục hồi bộ nhớ đệm (Cache Self-Healing):** Tự động phát hiện và dọn dẹp các tệp media cache 0-byte bị lỗi mạng để tránh gây treo phát nhạc.

---

## 🚀 Cách cài đặt & Sử dụng

### Cách 1: Sử dụng bản build sẵn `with_ytb` *(Khuyên dùng)*
Nếu bạn tải bản phát hành Folia có hậu tố **`-with_ytb`** (ví dụ: `Folia-Setup-0.7.18-with_ytb.exe` hoặc `Folia-0.7.18-x64-with_ytb.zip`):
- YouTube Music đã được tích hợp sẵn 100% vào nhân ứng dụng.
- **Không cần cài đặt thêm mod này**, mở ứng dụng là có sẵn tab YouTube.

---

### Cách 2: Cài đặt Mod thủ công vào Folia (Bản Standard)
1. Tải về hoặc copy thư mục `youtube-provider`.
2. Di chuyển thư mục `youtube-provider` vào thư mục lưu trữ Mod của Folia tương ứng với hệ điều hành:
   - **Windows:**
     ```text
     %APPDATA%\Folia\mods\youtube-provider\
     (hoặc C:\Users\<Tên_bạn>\AppData\Roaming\Folia\mods\youtube-provider\)
     ```
   - **Linux:**
     ```text
     ~/.config/folia/mods/youtube-provider/
     ```
   - **macOS:**
     ```text
     ~/Library/Application Support/Folia/mods/youtube-provider/
     ```
3. Khởi động lại ứng dụng Folia.

---

### Cách 3: Kích hoạt trong Cài đặt (Folium Mod Manager)
1. Mở Folia > bấm biểu tượng **Cài đặt (Settings)** (góc dưới bên trái).
2. Chọn mục **Tiện ích mở rộng / Mods**.
3. Bật kích hoạt **YouTube Provider**.

---

## 📖 Hướng dẫn sử dụng

1. **Tìm kiếm:**
   - Mở khung tìm kiếm bằng cách bấm vào thanh tìm kiếm hoặc dùng phím tắt `Ctrl + K`.
   - Chọn tab **YouTube** (biểu tượng YouTube màu đỏ).
   - Nhập tên bài hát hoặc tên nghệ sĩ bạn muốn nghe.
2. **Dán link YouTube:**
   - Sao chép bất kỳ đường dẫn video bài hát YouTube nào.
   - Dán vào ô tìm kiếm của Folia và bấm Enter. Bài hát sẽ được nạp và phát ngay lập tức.
3. **Xem lời bài hát:**
   - Mở màn hình phát nhạc chính (Player View) hoặc chế độ sân khấu (Stage View).
   - Lời bài hát đồng bộ sẽ tự động tải và hiển thị hiệu ứng động tương ứng với nhạc.

---

## 📂 Cấu trúc mã nguồn

```text
mods/youtube-provider/
├── mod.json            # Manifest khai báo metadata, quyền hạn theo chuẩn Folium 1
├── client.mjs          # Client entrypoint: Đăng ký provider vào hệ thống Omni của Folia
├── main.cjs            # Electron backend: Khởi chạy Local HTTP Streaming Proxy & dọn dẹp cache
├── youtubeApi.mjs      # Trích xuất video, stream audio và tìm kiếm InnerTube
├── lyricsService.mjs   # Tìm kiếm và đồng bộ lời bài hát từ LRCLIB & Zing MP3
└── README.md           # Tài liệu hướng dẫn sử dụng và thông tin mod
```

---

## 🔒 Quyền hạn (Permissions)

Mod yêu cầu các quyền trong `mod.json`:
- `net.fetch`: Kết nối mạng để tìm kiếm bài hát, trích xuất luồng phát và tải lời bài hát.
- `filesystem.data`: Quản lý bộ nhớ đệm cục bộ của mod.
- `omni.providers`: Đăng ký nguồn phát nhạc vào hệ sinh thái của Folia.

---

## 🛠️ Khắc phục sự cố (Troubleshooting)

- **Bài hát không phát được hoặc đứng ở 00:00:**
  - Kiểm tra kết nối Internet của thiết bị.
  - Một số video giới hạn độ tuổi hoặc video phát trực tiếp (livestream) có thể không hỗ trợ trích xuất luồng âm thanh trực tiếp.
- **Không hiển thị lời bài hát:**
  - Mod tự động tìm kiếm lời bài hát trên LRCLIB và Zing MP3. Đối với các bài nhạc beat, remix không chính thức hoặc ca khúc mới phát hành, lời bài hát có thể chưa được cộng đồng cập nhật trên hai nền tảng này.
- **Xung đột khi dùng bản `with_ytb`:**
  - Bản `with_ytb` đã tích hợp sẵn YouTube Music trong nhân. Nếu bạn cài thêm mod này, ứng dụng vẫn ưu tiên nguồn tích hợp sẵn để đạt hiệu năng cao nhất.

---

## 📜 Giấy phép & Tác giả

- **Tác giả:** [VtuberVN](https://github.com/VtuberVN)
- **Dự án:** [folia-major](https://github.com/VtuberVN/folia-major)
- **Giấy phép:** AGPL-3.0 (theo giấy phép chung của Folia Major)
