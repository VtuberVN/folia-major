Bản phát hành chính thức cho hệ điều hành Windows, macOS và Linux, bổ sung tiếng Việt, hỗ trợ chính thức Spotify & YouTube Music từ upstream v0.7.20, bổ sung 2 nền tảng âm nhạc Việt Nam (Zing MP3, NhacCuaTui), đồng bộ thư viện cá nhân và cập nhật toàn bộ cải tiến mới nhất từ nhánh phát triển gốc.

---

### 1. Bổ sung nền tảng âm nhạc mới và Tiếng Việt

Phiên bản này mở rộng thêm 4 nguồn phát và đồng bộ âm nhạc trực tiếp bên cạnh 4 nền tảng có sẵn từ nhánh gốc (NetEase Cloud Music, QQ Music, KuGou Music, Bodian Music):

- **Zing MP3:**
  - Hỗ trợ tìm kiếm bài hát, ca sĩ, album, danh sách bài hát bảng xếp hạng Realtime và Top 100.
  - Hỗ trợ đăng nhập tài khoản cá nhân để đồng bộ Danh sách phát (Playlist), Bài hát yêu thích và Nghe gần đây kèm ảnh bìa thực tế.
  - Phát âm thanh trực tiếp với khả năng tự động nhận diện bài hát tài khoản VIP.
  - Đồng bộ lời bài hát chạy từng từ (word-by-word) và từng dòng theo thời gian thực.
- **NhacCuaTui (NCT):**
  - Tích hợp nhà cung cấp âm nhạc trực tuyến Việt Nam, hỗ trợ tìm kiếm và phát luồng âm thanh bài hát trực tiếp.
- **YouTube Music (Tích hợp trực tiếp vào nhân ứng dụng):**
  - Hợp nhất hoàn toàn mã nguồn phát nhạc YouTube Music trực tiếp vào nhân ứng dụng chính, loại bỏ hoàn toàn hệ thống mod cài đặt thủ công qua thư mục ngoài.
  - Thống nhất quy trình đóng gói thành một bản cài đặt duy nhất, loại bỏ hoàn toàn cờ build with_ytb và không còn phân chia thành hai bản dựng riêng biệt.
  - Hỗ trợ đăng nhập đồng bộ danh sách phát cá nhân và bài hát đã thích từ tài khoản YouTube Music.
  - Tối ưu luồng phát âm thanh trực tiếp (Progressive MP4 AAC) qua thẻ audio của Electron, xử lý triệt để lỗi hạn chế quyền truy cập và kiểm soát tiêu đề CORS trên ứng dụng máy tính.
- **Spotify (Local) - Đồng bộ lời bài hát từ Spotify Desktop:**
  - Đọc trực tiếp phiên phát đa phương tiện của ứng dụng Spotify Desktop đang chạy trên máy và tự động tìm kiếm, khớp lời bài hát đồng bộ theo thời gian thực mà không cần xác thực Spotify Web API.
  - Không yêu cầu cấu hình tài khoản nhà phát triển (Spotify Client ID / Client Secret) hay đăng nhập OAuth phức tạp.
  - Hoạt động đa nền tảng:
    - Trên Windows: Sử dụng GSMTC (Global System Media Transport Controls) qua Windows Runtime để đọc tiến trình phát và bài hát.
    - Trên Linux: Sử dụng giao thức MPRIS (thông qua playerctl hoặc gdbus).
    - Trên macOS: Sử dụng AppleScript tương tác trực tiếp với ứng dụng Spotify.
  - Hướng dẫn sử dụng:
    1. Mở Cài đặt trong Folia -> chọn mục Tích hợp -> tại mục Nguồn phát (Stage Source), chọn Spotify (Local).
    2. Khởi động ứng dụng Spotify Desktop trên máy và phát bài hát bất kỳ (luôn giữ Spotify chạy nền).
    3. Folia sẽ tự động bắt nhịp bài hát đang phát và đồng bộ lời bài hát chạy chữ lên màn hình Stage hoặc xuất sang OBS.
    4. Lưu ý trên hệ điều hành macOS: Hãy cấp quyền cho Folia trong Cài đặt hệ thống > Quyền riêng tư & Bảo mật > Tự động hóa.
  - Nguồn gốc phát triển: Tính năng được kế thừa và phát triển dựa trên kiến trúc Stage / PlayerCap từ hệ sinh thái Folia (nhánh phát triển của VTB-LINK và Lynx-1ST), sau đó được tích hợp hoàn chỉnh cơ chế GSMTC cục bộ bởi VtuberVN.

---

### 2. Chuẩn hóa nhận diện bản quyền VIP và phân loại lỗi phát nhạc

Đồng bộ hệ thống quản lý chính sách phát nhạc trực tuyến mới nhất từ nhánh phát triển gốc (PR #619) và kết nối với các nền tảng có sẵn (NetEase, QQ, KuGou, Bodian) cũng như nền tảng mới:
- Tự động nhận diện chính xác bài hát yêu cầu tài khoản thành viên hoặc tài khoản VIP (membership-required trên Zing MP3, KuGou và NetEase Cloud Music).
- Nhận diện bài hát yêu cầu mua album số (purchase-required) hoặc bài hát bị giới hạn theo khu vực địa lý (region-restricted).
- Tự động phát hiện các đoạn âm thanh chỉ cho phép nghe thử 30 giây (preview-only) để chặn tải vào bộ nhớ đệm trước khi phát.
- Khi gặp bài hát cần tài khoản VIP hoặc quyền truy cập đặc biệt, ứng dụng sẽ dừng phát, giữ nguyên hàng đợi danh sách bài hát và hiển thị thông báo tiếng Việt rõ ràng cùng nút thao tác bỏ qua, thay vì tự động đếm ngược nhảy bài lỗi như trước đây.

---

### 3. Hỗ trợ phụ đề lời bài hát thực và ngắt từ thông minh

- Hỗ trợ phụ đề lời bài hát đồng bộ theo thời gian thực (Synced Lyrics / LRC) và chạy chữ mượt mà theo từng từ (Word-by-word) thông qua Zing MP3 và LRCLIB.
- Tích hợp bộ phân tích ngắt từ thông minh (ICU tokenization) tối ưu riêng cho các ngôn ngữ tượng hình (tiếng Trung, tiếng Nhật) và phiên âm La-tinh.
- Hỗ trợ hiển thị lời dịch song ngữ và phiên âm La-tinh (Romaji / Pinyin) trực tiếp trên giao diện sân khấu lời bài hát.

---

### 4. Tách biệt đường dẫn liên kết OBS cho buổi phát trực tiếp

Bổ sung và phân tách đường dẫn liên kết OBS Browser Source thành hai luồng hiển thị độc lập:
- Luồng Nền (Background Visualizer Overlay): Hiển thị ảnh bìa động, sóng nhạc FFT và hiệu ứng thị giác PixiJS.
- Luồng Hiệu ứng Lời bài hát (Lyrics Stage Overlay): Hiển thị riêng phần phụ đề lời bài hát động trên nền trong suốt, giúp người làm nội dung và VTuber dễ dàng tùy biến bố cục và kích thước khung chữ trên phần mềm OBS Studio.

---

### 5. Tối ưu hóa hiệu năng và tùy chọn nền tảng âm nhạc mặc định

- Cho phép lựa chọn nền tảng âm nhạc trực tuyến mặc định khi khởi động hoặc tải lại ứng dụng tại Cài đặt -> Trực tuyến -> Nguồn nhạc mặc định.
- Tự động tạm dừng hoặc giảm tải tần suất tính toán hiệu ứng thị giác PixiJS và phân tích phổ âm thanh FFT khi cửa sổ ứng dụng bị ẩn hoặc thu nhỏ xuống thanh tác vụ, giúp tiết kiệm tối đa tài nguyên vi xử lý và card đồ họa.
- Hiển thị trực tiếp thông số kỹ thuật âm thanh (định dạng tập tin FLAC/AAC/MP3, bitrate thực tế, tần số lấy mẫu kHz, độ sâu bit) ngay trên thanh điều khiển thu nhỏ (Mini Player) cho cả nhạc nội bộ và luồng phát trực tuyến.
- Giao diện người dùng, trình cài đặt Windows, menu khay hệ thống và bảng lệnh được bản địa hóa hoàn toàn sang tiếng Việt.
- Tích hợp Discord Rich Presence hiển thị thông tin bài hát và nghệ sĩ đang phát bằng tiếng Việt.

---

### Hướng dẫn tải xuống theo hệ điều hành

- **Windows (x64):**
  - Bộ cài đặt tự động: `Folia-Setup-{{VERSION}}.exe`
  - Bản giải nén chạy trực tiếp (Portable): `Folia-{{VERSION}}-win-x64.zip`
- **macOS:**
  - Apple Silicon (M1/M2/M3/M4): `Folia-{{VERSION}}-arm64.dmg` hoặc `Folia-{{VERSION}}-arm64.zip`
  - Intel Mac: `Folia-{{VERSION}}-x64.dmg` hoặc `Folia-{{VERSION}}-x64.zip`
  - Lưu ý: Nếu macOS thông báo ứng dụng bị hỏng do gói cài đặt chưa ký số Apple Developer, vui lòng xem [hướng dẫn mở khóa Gatekeeper]({{MACOS_UNSIGNED_HELP_URL}}).
- **Linux (x64):**
  - Debian / Ubuntu: `folia-major-{{VERSION}}-linux-amd64.deb`
  - Fedora / openSUSE: `folia-major-{{VERSION}}-linux-x86_64.rpm`
  - Các bản phân phối khác: `folia-major-{{VERSION}}-linux-x64.tar.gz`
