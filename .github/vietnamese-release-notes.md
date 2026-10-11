## Folia tiếng Việt cho Windows

- Sửa đọc định dạng âm thanh theo byte thực của luồng thay vì chọn parser từ Content-Type HTTP có thể khai báo sai. Kiểm thử FLAC với MIME AAC, MPEG, MP4 và metadata bị cắt.
- Khi codec đo được khác metadata nguồn, không ghép bitrate và độ sâu bit của codec cũ vào codec mới. Khi cùng là FLAC, giữ bitrate NetEase cung cấp.

- Tối ưu tìm dòng lời đang phát bằng tìm kiếm theo thời gian cho lời đã sắp xếp; giữ nguyên xử lý tua, dòng chồng nhau và định dạng không theo thứ tự.
- Khi tạm dừng, xóa phổ FFT một lần thay vì cấp phát và gửi mảng rỗng ở mỗi khung hình. Giữ dữ liệu phổ mới khi tiếp tục phát.

- Bổ sung thông số QQ, KuGou và Navidrome: đọc header luồng đang phát trong nền, tối đa 256 KB và 5 giây. Chỉ hiển thị bitrate khi xác định được; thông số tệp gốc Navidrome được ghi rõ **Nguồn gốc** khi chưa xác minh luồng chuyển mã.
- Giảm xử lý visualizer, FFT và hiệu ứng nền khi cửa sổ bị ẩn hoặc thu nhỏ. Giữ hoạt động phát nhạc, đồng hồ lời bài hát, Automix, wallpaper và OBS khi cần. Worker đọc header tự đóng và bộ nhớ đệm giới hạn 48 nguồn.

- Nhạc đã lưu đệm bắt đầu phát trước khi đọc thông số âm thanh. Thông số được bổ sung trong nền và lưu lại theo phiên bản tệp.
- Worker đọc metadata có timeout và tự phục hồi, tránh yêu cầu bị kẹt khi parser gặp lỗi.
- Thêm kênh cập nhật **Tiếng Việt** dành riêng cho các bản `vi.*`; cấu hình cũ được chuyển đổi một lần. Cài bản này một lần để nhận các bản tiếp theo qua tính năng cập nhật trong ứng dụng.
- Giữ tên mức chất lượng và các tên kỹ thuật quen thuộc bằng tiếng Anh: **Standard, Very High, Lossless, Hi-Res, ReplayGain, Crossfade, Automix**.

- Mini player hiển thị bitrate (`kbps`), định dạng, tần số lấy mẫu và độ sâu bit khi tệp hoặc nguồn phát cung cấp dữ liệu. Hỗ trợ nhạc cục bộ, thông số luồng NetEase và nhạc đã lưu đệm; nguồn thiếu thông tin sẽ không hiển thị số giả định.
- Liên kết repository, trợ giúp AI và báo lỗi trong ứng dụng trỏ về `VtuberVN/folia-major`.

- Thêm tiếng Việt cho giao diện, cài đặt, bảng lệnh, hướng dẫn và thông báo của ứng dụng.
- Tự nhận tiếng Việt theo ngôn ngữ hệ thống; có thể chọn tại **Cài đặt → Cài đặt chung → Ngôn ngữ giao diện → Tiếng Việt**.
- Việt hóa menu khay hệ thống, hộp thoại và bộ cài Windows.
- Discord Rich Presence dùng Application ID mặc định `1203744706702610522`; có thể đổi tại **Cài đặt → Tích hợp → Discord Rich Presence**.
- Trạng thái Discord rút gọn hiển thị tiêu đề bài hát; thẻ mở rộng giữ nghệ sĩ, ảnh bìa và tiến trình phát.

Tải tệp **Folia-Setup-0.7.17-vi.1.exe** để cài trên Windows x64. Bật Discord Rich Presence trong cài đặt tích hợp và mở ứng dụng Discord trên máy để sử dụng.

Đây là bản phát hành thử của nhánh tiếng Việt. Bộ cài chưa có chữ ký số. Tệp `SHA256SUMS.txt` cung cấp mã SHA-256 để kiểm tra bản tải xuống.
