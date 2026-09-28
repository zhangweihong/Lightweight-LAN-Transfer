# ⚡ Lightweight LAN File Transporter

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20iOS%20%7C%20Android-007aff.svg)](#)
[![Design](https://img.shields.io/badge/Design-iOS%2026%20Liquid%20Glass-5856d6.svg)](#)

<p align="center">
  <a href="README.md">简体中文</a> | <b>English</b>
</p>

> **Ultra-fast Multi-file Concurrency · Reliable Chunked Breakpoint Resume · Zero-install Cross-Platform · Native iOS 26 Liquid Glass Aesthetic**

No cables required, no third-party account registration, and no heavy client apps to install. As long as your devices are connected to the same local area network (same Wi-Fi), simply open your browser on any device to instantly discover nearby peers and transfer files at gigabit LAN speed.

Seamlessly works across **Windows, macOS, Linux, iPhone/iPad (iOS), Android phones, and tablets**. Built upon a robust Node.js chunked streaming staging and hash-based breakpoint resume architecture, completely overcoming the fragility of conventional P2P links that break upon network fluctuations with zero recovery capability.

---

## 📸 Screenshots & UI Preview

### 🖥️ Desktop Experience

| English Light Mode | Chinese Light Mode |
| :---: | :---: |
| ![Desktop English Light](doc/1.png) | ![Desktop Chinese Light](doc/2.png) |

| Live Transfer Center & Incoming File Offers |
| :---: |
| ![Desktop Transfer Center](doc/3.png) |

---

### 📱 Mobile Adaptive (Dark Mode)

| Mobile Header, Status & QR Quick Connect | Transfer Control Panel & Breakpoint Resume Banner |
| :---: | :---: |
| ![Mobile Header & LAN Addresses](doc/4.png) | ![Mobile Transfer & Resume Banner](doc/5.png) |

---

## ✨ Key Features

- 🎨 **iOS 26 Liquid Glass & Spatial Aesthetics**
  - Crafted with Apple-inspired liquid glass, silky backdrop blurs, and dynamic spatial aura gradients.
  - Full **Light / Dark Mode** with automatic system following and one-click manual toggle.
  - Floating Dynamic Island notification toasts for clean, non-intrusive operational feedback.

- ⚡ **Multi-File Concurrency & High-Speed Chunking**
  - Drag-and-drop batch file and folder transfers.
  - Slider controls on UI for **Parallel Files** (1–6) and **Parallel Chunks per file** (1–4), unleashing the full throughput of Gigabit LAN and Wi-Fi 6.

- 🔄 **True Reliable Breakpoint Resume (Interrupted Transfers)**
  - File chunk tracking with granular byte-range offsets and hash validation.
  - If a transfer is interrupted by network drops, accidental page reloads, or server restarts, re-selecting the same file automatically verifies missing chunks and **resumes seamlessly without re-uploading finished data**.

- 📱 **Screen Keep-Awake Protection (WakeLock)**
  - Native integration with the W3C `navigator.wakeLock` API (with silent inline video fallback for older webviews).
  - Keeps mobile screens and laptops awake during large transfers, preventing system sleep or background process throttling from disconnecting active transfers.

- 🌐 **Seamless Internationalization (i18n)**
  - Built-in one-click dropdown toggle between **English** and **简体中文 (Simplified Chinese)**.
  - Language preference is automatically persisted to local storage.

- ⚡ **Auto-Accept Mode**
  - Optional "Auto Accept" switch. When transferring files between personal devices, incoming files can be automatically accepted and saved without manual clicking on the receiving end.

- 📷 **LAN IP Auto-Detection & QR Code Pairing**
  - Server automatically discovers and displays all available local network IP addresses on launch.
  - One-click URL copying and ISO/IEC 18004 compliant QR code scanning modal for instant camera pairing on smartphones and tablets.

- 🛡️ **Privacy & Automatic Expiration Cleanup**
  - Session-isolated peer authorization tokens ensure only sender and receiver can access transfer payloads.
  - Automatic expiration and disk space reclamation (unfinished jobs retained for 12 hours by default, completed files for 6 hours).
  - Designed for trusted LAN environments without exposing ports to the public Internet.

- 📲 **In-App Webview & Mobile Browser Hardening**
  - Specifically hardened for domestic Android browser webviews (Xiaomi/HyperOS, WeChat WebView, QQ, UC, Quark).
  - Vendor meta declarations prevent browsers from triggering disruptive "smart page stitching" or media sniffing layer overlays.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) `>= 18.0.0`

### 1. Clone & Install
```bash
git clone https://github.com/your-username/filetransporter.git
cd filetransporter
npm install
```

### 2. Start the Server
```bash
npm start
```
> **Windows Users**: You can also double-click `start.bat` in the project root to launch with one click.

### 3. Access & Connect
Once started, the terminal will print access URLs, for example:
```text
局域网文件传输已启动
本机打开: http://127.0.0.1:3780
手机、其他电脑、Mac 请打开下面任一地址（需在同一局域网）:
  http://192.168.x.x:3780
暂存目录: <project-root-directory>/data
按 Ctrl+C 停止服务。
```

- **Local PC**: Open `http://127.0.0.1:3780` in your browser.
- **Phones / Other PCs / Tablets**: Open the displayed LAN IP on the same Wi-Fi (e.g. `http://192.168.x.x:3780`), or click **"QR Code"** on the PC and scan with your mobile camera.

---

## 📖 Usage Guide

1. **Device Discovery**:
   - Ensure both devices are on the same Wi-Fi or LAN subnet.
   - Upon opening the webpage, devices will automatically show up under "Online Devices" (e.g. `Windows123`, `Android Phone`).
   - Click "My Device" in the header to customize your device nickname anytime.
2. **Select Target & Files**:
   - On the sender device, click to select the target peer (marked with "Current Target ✓").
   - Drag files into the dashed drop zone, or click **"＋ Select Files"** to pick one or more files.
3. **Accept & Transfer**:
   - A clear incoming prompt will appear on the receiver device with sender name, file list, and total size.
   - Click **"✓ Accept All"** (or individual "Accept" buttons) to begin concurrent chunked transfer.
   - Toggle **"Auto Accept"** to skip manual confirmation when sending files to your own devices.
4. **Save Locally**:
   - Once transfer finishes, the checksum is verified and a "Save to Local" button allows saving directly to your disk.

### 🔁 Breakpoint Resume Workflow
- **Sender Reload / Network Interruption**: An amber banner **"There are tasks that can be resumed"** will appear on the sender page. Simply re-select the original file; the system checks missing chunk offsets and resumes immediately from the interruption point.
- **Receiver Interruption**: Reopen the page; if the file is still within its server retention window, transfer resumes from the locally recorded byte offset.

---

## 🛠️ Configuration & Environment Variables

You can customize server behavior by setting environment variables prior to launch:

| Environment Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3780` | HTTP and WebSocket server listening port |
| `HOST` | `0.0.0.0` | Bind address (`0.0.0.0` allows LAN devices to connect) |
| `DATA_DIR` | `data` | Directory path for chunk staging and device token storage |
| `CHUNK_SIZE` | `4194304` (4MB) | Default chunk slice size in bytes |
| `MAX_CHUNK_SIZE` | `8388608` (8MB) | Maximum permitted chunk slice per upload request |
| `MAX_FILE_SIZE` | `50GB` | Maximum file size limit for a single upload |
| `MAX_TOTAL_SIZE` | `100GB` | Total storage capacity ceiling for active tasks |
| `TTL_HOURS` | `12` | Retention period for unfinished transfer jobs (hours) |
| `READY_TTL_HOURS` | `6` | Retention period for completed files before automatic disk cleanup (hours) |

#### Custom Port Examples:
- **PowerShell (Windows)**:
  ```powershell
  $env:PORT = "3800"; npm start
  ```
- **Bash (macOS / Linux)**:
  ```bash
  PORT=3800 npm start
  ```

---

## ❓ Troubleshooting

### 1. Phone cannot open the PC's address?
- **Verify Same Wi-Fi Network**: Ensure your phone and PC are connected to the same router. If using a public or enterprise **Guest Wi-Fi**, routers frequently enable **"AP Isolation"** (preventing devices from communicating with one another). Switch to a standard Wi-Fi network without client isolation.
- **Windows Firewall Inbound Rules**: Windows Defender Firewall may block inbound LAN connections. Open PowerShell as Administrator and run:
  ```powershell
  New-NetFirewallRule -DisplayName "LAN File Transfer" -Direction Inbound -Protocol TCP -LocalPort 3780 -Action Allow
  ```
- **Do NOT use 127.0.0.1 on Mobile**: `127.0.0.1` refers to the mobile phone itself. Mobile devices must access the actual LAN IP shown in your terminal or web header (e.g. `http://192.168.x.x:3780`).

### 2. Mobile built-in browser renders outdated cached styles?
- The project includes `no-cache, must-revalidate` HTTP headers and asset version queries. If an aggressive mobile webview kernel retains old assets, swipe down to reload or clear site data in browser settings.

---

## 🧪 Automated Testing

The project uses the native Node.js test runner covering range merging, out-of-order chunk uploads, server reboot resumption, multi-file concurrency, WebSocket discovery, and disk cleanup:

```bash
npm test
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE). Contributions, bug reports, and pull requests are warmly welcome!
