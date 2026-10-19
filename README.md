# tool_revert

Toolkit dịch ngược, phân tích bảo mật và tái tạo dự án Android Studio tự động, hỗ trợ Android (APK, XAPK, APKM) và JavaScript/Electron, tích hợp cùng **REA** (*Reverse Engineer Anything*) MCP engine và **JADX**.

---

## 🚀 Tính năng chính

- **Phân tích toàn diện Android APK, XAPK & APKM**:
  - Tự động nhận diện container XAPK/APKM, phân tách `base.apk` và split APKs (arch, density, language).
  - Trích xuất thông tin Package, Min SDK, Target SDK, Version, Permissions, Activities, Services, Receivers.
  - Kiểm tra và đánh giá rủi ro bảo mật (Debuggable flag, Exported Components, Dangerous Permissions).
  - Thống kê các class, method và nhận diện SDK bên thứ 3 (AdMob, Firebase, Billing, Lottie, Retrofit, Koin...).
  - Giải mã tài nguyên (Android Resources) qua REA engine.

- **Dịch ngược mã nguồn (Decompile)**:
  - Tích hợp JADX MCP server giải mã mã nguồn Java/Kotlin, Python/assets từ bytecode DEX sang file đĩa.
  - Tự động lọc package chính của ứng dụng hoặc chỉ định theo tiền tố (`--package com.example`).

- **Tái tạo dự án Android Studio (Reconstruct)**:
  - Tự động dựng hoàn chỉnh cấu trúc dự án Android Studio Gradle đa module (`app`).
  - Khắc phục các xung đột manifest khi dịch ngược: tự động bóc tách stub chống giả mạo của Google Play (`com.pairip`), các AAR merged library providers/services (`FirebaseInitProvider`, `WorkManager`).
  - Tự động giải mã và sao chép layouts, drawables, colors, strings, raw, mipmaps và assets.
  - Cung cấp mã nguồn Java/Kotlin sạch có thể compile trực tiếp bằng Gradle (`./gradlew assembleDebug`), đồng thời bảo tồn toàn bộ mã dịch ngược gốc tại `app/src/main/decompiled/` để đối chiếu.

- **Phân tích JavaScript / Electron**:
  - Đọc ASAR / thư mục nguồn và phân tích cấu trúc AST.
  - Phục hồi mã nguồn JavaScript (Source recovery).

- **Tích hợp ADB**:
  - Liệt kê thiết bị kết nối (`adb devices`).
  - Liệt kê và kéo file APK trực tiếp từ thiết bị (`adb pull`).

- **Xuất báo cáo chi tiết**:
  - Tự động tạo `metadata.json`, `classes.json`, và báo cáo markdown `analysis_report.md` tại thư mục `output/`.

---

## 🛠 Hướng dẫn sử dụng nhanh

### 1. Kiểm tra trạng thái hệ thống

```bash
node bin/tool_revert.js doctor
```

### 2. Phân tích file APK / XAPK

```bash
node bin/tool_revert.js analyze path/to/app.xapk --decode-resources
```

Hoặc chỉ định thư mục xuất kết quả:

```bash
node bin/tool_revert.js apk path/to/app.apk -o ./output/my_analysis
```

### 3. Dịch ngược mã nguồn sang Java/Kotlin

```bash
# Dịch ngược package chính của app
node bin/tool_revert.js decompile path/to/app.xapk -o ./output/source_code

# Dịch ngược có bộ lọc package
node bin/tool_revert.js decompile path/to/app.apk --package com.example.app
```

### 4. Tái tạo dự án Android Studio hoàn chỉnh

```bash
node bin/tool_revert.js reconstruct path/to/app.xapk -o ./reconstructed_app
```

Sau khi tạo xong, bạn có thể:

1. Mở thư mục `./reconstructed_app` bằng **Android Studio**.
2. Nhấn **Run** hoặc build bằng lệnh:

   ```bash
   cd reconstructed_app
   ./gradlew assembleDebug
   ```

### 5. Sử dụng công cụ ADB

```bash
# Liệt kê thiết bị kết nối
node bin/tool_revert.js adb devices

# Xem các package đã cài trên thiết bị
node bin/tool_revert.js adb packages

# Kéo file APK từ thiết bị về máy
node bin/tool_revert.js adb pull com.example.targetapp
```

---

## 🧪 Kiểm thử & Xác minh chất lượng (Definition of DONE)

Chạy script kiểm thử toàn diện của dự án:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

Hoặc dùng npm:

```bash
cmd /c npm test
```

---

## 📁 Cấu trúc thư mục

```
tool_revert/
├── bin/
│   └── tool_revert.js          # CLI chính
├── src/
│   ├── android_analyzer.js     # Phân tích APK, bảo mật, SDKs
│   ├── jadx_client.js          # Client kết nối JADX server
│   ├── js_analyzer.js          # Phân tích Electron/JS
│   ├── project_reconstructor.js# Bộ tái tạo dự án Android Studio
│   ├── rea_bridge.js           # Bridge kết nối REA MCP
│   ├── reporter.js             # Bộ xuất báo cáo Markdown/JSON
│   └── utils.js                # Tiện ích chung
├── test/                       # Unit tests
├── scripts/                    # Scripts xác minh (verify.ps1, verify.sh)
├── tools/                      # JADX MCP server jar
├── output/                     # Thư mục lưu kết quả phân tích & decompile
└── reconstructed_tv_remote/    # Dự án Android Studio mẫu đã tái tạo và chạy thực tế
```
