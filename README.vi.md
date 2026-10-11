<p align="center">
  <img src="https://github.com/user-attachments/assets/b5d0e863-48be-497b-b0e9-4bd8d8ce9bf0" alt="Folia" width="100%" />
</p>

<div align="center">
<a href="https://trendshift.io/repositories/71740?utm_source=repository-badge&amp;utm_medium=badge&amp;utm_campaign=badge-repository-71740" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/repositories/71740" alt="chthollyphile%2Ffolia-major | Trendshift" width="250" height="55"/></a>

[English](README.md) | [Tiếng Việt](README.vi.md)

# Folia

Trải nghiệm lời bài hát theo cách mới

[![GitHub release](https://img.shields.io/github/v/release/chthollyphile/folia-major?label=release)](https://github.com/chthollyphile/folia-major/releases)
[![License](https://img.shields.io/github/license/chthollyphile/folia-major)](https://github.com/chthollyphile/folia-major/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/chthollyphile/folia-major?style=social)](https://github.com/chthollyphile/folia-major/stargazers)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/chthollyphile/folia-major)
[![Discord](https://img.shields.io/discord/1541051241822687232?logo=discord&logoColor=white&label=Join%20our%20Discord)](https://discord.gg/dMDBTHxeKd)
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-35-orange.svg?style=flat-square)](CONTRIBUTORS.md)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

[Sử dụng Folia](#cách-sử-dụng-folia)
·
[Triển khai lên Vercel](https://vercel.com/new/clone?repository-url=https://github.com/chthollyphile/folia-major)
·
[Hướng dẫn sử dụng](https://folia-site.cielaniska.top/guide/)
·
[Tài liệu kỹ thuật](docs/technical.md)

</div>

## Giới thiệu

Folia là trình phát nhạc trực tuyến tập trung vào trải nghiệm lời bài hát toàn màn hình. Ứng dụng hỗ trợ NetEase Cloud Music, KuGou, Navidrome và thư viện cục bộ, kết hợp ghép lời thông minh, chủ đề màu sắc do AI tạo và nhiều hiệu ứng lời bài hát.

Ứng dụng máy tính dùng Electron có trên Windows, macOS và Linux. Bản Web dựa trên Node.js có thể triển khai lên Vercel hoặc nền tảng hỗ trợ Node.js để sử dụng trên trình duyệt và thiết bị di động.

## Hình ảnh giới thiệu

![visualizer](./img/visualizer.png)

### Video demo

https://github.com/user-attachments/assets/af806cf1-f67f-4b88-b2e7-57db507e9e81

https://github.com/user-attachments/assets/fd27f4f0-64b9-4c57-8c3b-10df767f934b

https://github.com/user-attachments/assets/704f195a-2194-434b-86e8-8f36290e5cc4

### Xem trước chủ đề

<table>
  <tr>
    <td width="50%">
      <img src="./img/preview-fume.png" alt="Fume xem trước chủ đề" />
    </td>
    <td width="50%">
      <img src="./img/preview-lumi.png" alt="Lumi xem trước chủ đề" />
    </td>
  </tr>
  <tr>
    <td align="center"><strong>Fume</strong></td>
    <td align="center"><strong>Lumi</strong></td>
  </tr>
  <tr>
    <td width="50%">
      <img src="./img/preview-cad.png" alt="Cad xem trước chủ đề" />
    </td>
    <td width="50%">
      <img src="./img/preview-pat.png" alt="Pat xem trước chủ đề" />
    </td>
  </tr>
  <tr>
    <td align="center"><strong>Cad</strong></td>
    <td align="center"><strong>Pat</strong></td>
  </tr>
  <tr>
    <td width="50%">
      <img src="./img/preview-cappella.jpg" alt="Cappella xem trước chủ đề" />
    </td>
    <td width="50%">
      <img src="./img/preview-tilt.png" alt="Tilt xem trước chủ đề" />
    </td>
  </tr>
  <tr>
    <td align="center"><strong>Cappella</strong></td>
    <td align="center"><strong>Tilt</strong></td>
  </tr>
    <tr>
    <td width="50%">
      <img src="./img/preview-diorama.png" alt="Diorama xem trước chủ đề" />
    </td>
    <td width="50%">
      <img src="./img/preview-pendolo.png" alt="Pendolo xem trước chủ đề" />
    </td>
  </tr>
  <tr>
    <td align="center"><strong>Diorama</strong></td>
    <td align="center"><strong>Pendolo</strong></td>
  </tr>
</table>


Mỗi hiệu ứng lời có bố cục, phong cách và tham số tùy chỉnh riêng, mang lại hình ảnh phong phú như video âm nhạc bằng chữ, đồng thời tự thích ứng với kích thước cửa sổ.

## Tính năng chính

| Tính năng | Mô tả |
| --- | --- |
| Tìm kiếm và phát nhạc trực tuyến | Tìm bài hát, nghệ sĩ hoặc album rồi phát nhạc với ảnh bìa và lời được tải tự động. |
| Nhạc cục bộ | Nhập âm thanh và lưu chỉ mục trên thiết bị, không tải nội dung tệp lên máy chủ. Xem [Quản lý thư viện cục bộ](docs/local-library-management.md). |
| Ghép thông minh | Tự ghép bài hát cục bộ với lời và ảnh bìa trực tuyến; hỗ trợ sửa kết quả thủ công. |
| Tệp lời cục bộ | Tải tệp `.lrc`, `.vtt`, `.ttml`, `.qrc`, `.yrc`, `.krc` cùng tên trong cùng thư mục với nhạc, hoặc lời LRC nhúng. Hỗ trợ lời nâng cao theo từng từ do LDDC tạo. |
| Now Playing | Dùng [dịch vụ Now Playing](https://github.com/Widdit/now-playing-service/) trên máy để nhận bài hát, thời gian và lời từ trình phát bên ngoài, điều khiển chế độ sân khấu và lời toàn màn hình. |
| Chủ đề AI | Tạo nền và tham số hiển thị dựa trên cảm xúc và lời bài hát. |
| Đa nền tảng | Triển khai bản Web hoặc cài ứng dụng máy tính. |
| Mod thử nghiệm | Mở rộng bản máy tính bằng hiệu ứng lời, nền, lớp hiển thị trang phát nhạc và lệnh Folium. Xem [Hệ thống mod](#hệ-thống-mod-folium-v1x). |

## Cách sử dụng Folia

Bản máy tính tích hợp môi trường chạy frontend và backend để cài và sử dụng ngay.

### Triển khai một lần nhấp

Làm theo [Hướng dẫn triển khai Vercel](https://folia-site.cielaniska.top/guide/deploy-vercel) để đưa bản Web vào hoạt động.

[![Triển khai với Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/chthollyphile/folia-major)

Dự án cũng hỗ trợ triển khai Cloudflare bằng một lần nhấp; điều chỉnh hướng dẫn Vercel cho phù hợp.

[![Triển khai lên Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/chthollyphile/folia-major)

Với QQ Music trên Vercel hoặc Cloudflare, đặt `VITE_QQ_API_BASE` thành `/api/qq` và cấu hình `QQ_SESSION_SECRET` làm khóa bí mật phía máy chủ, **không thêm tiền tố `VITE_`**. Không cần API riêng chạy liên tục. Mặc định chỉ hỗ trợ đăng nhập bằng mã QR WeChat và phải đăng nhập trước khi phát nhạc. Trên Cloudflare, liên kết Durable Object để hỗ trợ thêm mã QR QQ. Xem [Triển khai QQ Music](docs/qq-music-deployment.md) để biết các bước, khác biệt nền tảng và cách xử lý lỗi.

Để tự lưu trữ, dùng [Docker Compose](deploy/docker/README.md). Truy cập thư mục nhạc cục bộ cần ngữ cảnh bảo mật HTTPS đáng tin cậy; hướng dẫn có thông tin về reverse proxy NAS và chứng chỉ.

Trên thiết bị di động, triển khai hoặc tự lưu trữ bản Web rồi cài PWA bằng chức năng thêm vào màn hình chính trong Chrome trên Android hoặc Safari trên iOS. Người dùng có kinh nghiệm có thể dùng Capacitor đóng gói APK Android; xem [folia-sonnet](https://github.com/chthollyphile/folia-sonnet).

### Tải trực tiếp

- **Windows / macOS / Linux:** Tải bộ cài mới nhất từ [Releases](https://github.com/chthollyphile/folia-major/releases/latest).
- **Arch Linux:** Cài [folia-major-bin](https://aur.archlinux.org/packages/folia-major-bin) từ AUR.
- **Flatpak:** Gói bên thứ ba do cộng đồng cung cấp có trên [Flatpark](https://flatpark.org/apps/top.izuna.foliamajor/).

> [!IMPORTANT]
> Nếu tải GitHub chậm tại Trung Quốc đại lục, dùng [Quark Drive](https://pan.quark.cn/s/6e4c6fa3bc6f) hoặc [Baidu Drive](https://pan.baidu.com/s/1f0x3g-8PMcNCO-TJ5z1rPw?pwd=flia). Các nguồn này chỉ cung cấp bộ cài ổn định cho Windows và Apple silicon.

Thông tin gói Linux, cửa sổ điều khiển từ xa Wayland / Hyprland và bản máy tính nằm trong [Tài liệu kỹ thuật](docs/technical.md).

## Tài liệu và phát triển

Xem [Folia Guide](https://folia-site.cielaniska.top/guide/) để biết cách sử dụng. Thông tin triển khai, biến môi trường, phát triển cục bộ, Stage API, script và công nghệ nằm trong [Tài liệu kỹ thuật](docs/technical.md).

## Hệ thống mod (Folium v1.x)

> [!NOTE]
> Mod là tính năng thử nghiệm, chỉ có trên máy tính và mặc định tắt. Bật tại Cài đặt → Phòng thí nghiệm → Hệ thống mod.

Mod Folium có thể thêm hiệu ứng lời và nền, chèn nội dung trên trang phát nhạc, thêm nút và dấu mốc trên thanh tiến trình, đăng ký lệnh và mục cài đặt, xử lý lời trước khi hiển thị và gọi công cụ cục bộ như ffmpeg qua điểm vào Node. Mod chạy dưới dạng mã được tin cậy: mỗi mod cần xác nhận trong cửa sổ gốc trước khi kích hoạt và phải xác nhận lại khi tệp thay đổi.

- **Chợ mod:** [folium-compound.vercel.app](https://folium-compound.vercel.app) cung cấp mod chính thức và mod cộng đồng đã xét duyệt. Tải ZIP và kéo vào bảng mod để cài.
- **Chứng nhận:** Mod trong chợ có chữ ký Folium và hiển thị đã chứng nhận. Mod bên thứ ba không có chữ ký hiển thị chưa xác minh và vẫn dùng được.
- **Phát triển:** [Hướng dẫn đóng góp](docs/folium/contributing.md) gồm viết mod, gỡ lỗi, gửi lên chợ, xét duyệt, ký và cập nhật.
- **API:** [Tham chiếu API](docs/folium/api.md) được tạo từ hợp đồng và phân theo registry, ngữ cảnh, sự kiện, dịch vụ.
- **Đặc tả:** [Đặc tả Folium](mods/README.md) gồm manifest, quyền, ngữ nghĩa registry, sự kiện, bảo mật và phiên bản.
- **Ví dụ:** [`mods/`](mods/) gồm hiệu ứng lời, điều chỉnh tham số, thanh tiến trình, lớp hiển thị trang phát nhạc và xuất video nền trong suốt.

## Máy chủ đồng bộ

Máy chủ chính thức tùy chọn `sync-server` đồng bộ cài đặt giao diện và thư viện chủ đề AI giữa các thiết bị. Người dùng tự lưu trữ máy chủ.

- **Cloudflare Workers / D1:** Triển khai serverless không cần quản trị máy chủ, được khuyến nghị.
  [![Triển khai lên Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/chthollyphile/folia-major/tree/main/sync-server)
- **Docker:** Xem image và cấu hình Compose tại [Triển khai Docker](deploy/docker/README.md).
- **Node.js:** Dùng SQLite, phù hợp với môi trường cục bộ hoặc nơi không thuận tiện dùng Docker.

Làm theo [Hướng dẫn triển khai máy chủ đồng bộ](https://folia-site.cielaniska.top/guide/deploy-sync) để cấu hình biến môi trường, token và triển khai. Nhập địa chỉ máy chủ và `SYNC_TOKEN` trong cài đặt lưu trữ Folia để bật đồng bộ.

## Nhạc cục bộ và ghép thông tin

Folia đọc siêu dữ liệu âm thanh, lời và ảnh bìa trong cùng thư mục, bổ sung thông tin bằng NetEase Cloud Music, QQ Music hoặc KuGou theo thứ tự đó. Nếu ghép sai, bạn có thể chọn ứng viên thủ công, khôi phục thông tin lúc nhập ban đầu hoặc gộp, tách thực thể nghệ sĩ và album.

Xem [Quản lý thư viện cục bộ](docs/local-library-management.md) để biết cách nhập, quét lại, ghép thông tin, chỉnh sửa thực thể, danh sách phát, bộ nhớ đệm và xử lý lỗi.

## Cộng đồng

Tham gia Discord để trao đổi về Folia và nhận hỗ trợ.

[![Discord](https://img.shields.io/discord/1541051241822687232?logo=discord&logoColor=white&label=Join%20our%20Discord)](https://discord.gg/dMDBTHxeKd)

## Người đóng góp

Cảm ơn mọi người đã gửi issue, báo lỗi, đề xuất ý tưởng, kiểm thử và viết mã. Đóng góp được ghi nhận theo tiêu chuẩn all-contributors; xem [Danh sách người đóng góp](CONTRIBUTORS.md).

## Thông báo pháp lý và miễn trừ trách nhiệm

Dự án được phát triển với sự hỗ trợ rộng rãi của AI nên vẫn có thể còn lỗi nhỏ hoặc khó nhận biết. Mong bạn thông cảm nếu chúng gây bất tiện.

Dự án chủ yếu trình diễn hiệu ứng phát nhạc, thiết kế giao diện và triển khai kỹ thuật liên quan. Bản quyền nhạc trực tuyến, lời, ảnh bìa và nội dung khác thuộc về các chủ sở hữu quyền tương ứng.

Repository và mã nguồn dành cho học tập cá nhân, trao đổi kỹ thuật và kiểm thử phi lợi nhuận. Vui lòng không dùng để thu lợi thương mại. Người dùng chịu trách nhiệm về tranh chấp bản quyền hoặc trách nhiệm khác phát sinh từ phân phối, xử lý hay tái phân phối tài nguyên trực tuyến; nhà phát triển không chịu trách nhiệm liên quan.

Tôn trọng bản quyền số và ủng hộ nhạc có bản quyền qua nền tảng chính thức khi có thể.

## Lời cảm ơn

Đặc biệt cảm ơn:

- [chenmozhijin/LDDC](https://github.com/chenmozhijin/LDDC)
- [NeteaseCloudMusicApiEnhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced)
- [chenglou/pretext](https://github.com/chenglou/pretext)
- [MakcRe/KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi)
- [paper-design/shaders](https://github.com/paper-design/shaders)
- [yakult-green-tea/qq-music-api](https://github.com/yakult-green-tea/qq-music-api)

Folia tích hợp [kho lời theo từng từ Apple Music-like Lyrics TTML](https://github.com/amll-dev/amll-ttml-db) để cung cấp lời chất lượng cao. Cảm ơn các tác giả và người đóng góp của kho này.

## Giấy phép

Dự án được phát hành mã nguồn mở theo `AGPL-3.0`.
