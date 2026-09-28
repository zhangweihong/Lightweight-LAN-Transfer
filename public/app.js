"use strict";

// Polyfill Element.prototype.replaceChildren for older mobile webviews
if (!Element.prototype.replaceChildren) {
  Element.prototype.replaceChildren = function (...nodes) {
    while (this.firstChild) {
      this.removeChild(this.firstChild);
    }
    this.append(...nodes);
  };
}

const $ = (id) => document.getElementById(id);
const state = {
  me: null,
  peers: [],
  transfers: new Map(),
  files: new Map(),
  running: new Map(),
  paused: new Set(),
  errors: new Map(),
  cached: new Set(),
  saved: new Set(JSON.parse(localStorage.getItem("lft-saved") || "[]")),
  cleared: new Set(JSON.parse(localStorage.getItem("lft-cleared") || "[]")),
  handed: new Set(),
  localBytes: new Map(),
  speeds: new Map(),
  selectedId: null,
  selectedName: "",
  wsReady: false,
  accepting: new Set(),
  pendingFiles: null,
  lang: localStorage.getItem("lft-lang") || "en",
  urls: [],
};

// ==========================================================================
// Internationalization (i18n) - English (Default) & Chinese
// ==========================================================================

const I18N = {
  en: {
    app_title: "Lightweight LAN Transfer",
    app_tagline: "Instant zero-install transfer on same Wi-Fi · P2P staging · Resume interrupted",
    my_device: "My Device",
    device_title_tip: "Click to rename this device",
    conn_status_title: "Network Connection Status",
    lang_toggle_tip: "Switch Language / 切换语言",
    theme_toggle_tip: "Switch light/dark theme",
    urls_title: "LAN Access Addresses",
    urls_tip: "Open on other phones, iPads or PCs on the same Wi-Fi to connect instantly",
    devices_title: "Online Devices",
    btn_refresh: "Refresh",
    btn_refresh_tip: "Refresh online devices",
    drop_title_default: "Select a device first",
    drop_title_target: "Send files to {0}",
    drop_sub_default: "Drag multiple files or folders · Zero compression",
    btn_select_files: "Select Files",
    auto_accept: "Auto Accept",
    auto_accept_tip: "Automatically accept incoming files without manual confirmation",
    transfers_title: "Transfer Center",
    btn_clear_finished: "Clear Finished",
    btn_clear_finished_tip: "Clear all finished or cancelled records",
    stepper_files: "Parallel Files",
    stepper_files_tip: "Concurrent files being transferred (1-6)",
    stepper_chunks: "Parallel Chunks",
    stepper_chunks_tip: "Concurrent chunks per file (1-4)",
    footer_text: "High-speed peer-to-peer LAN staging transfer · Readable only by sender and receiver · Auto-destroyed when done or expired · Do not expose port publicly",
    modal_qr_title: "Scan to Connect to This PC",
    modal_qr_tip: "Scan with your phone or tablet camera to open instantly on the same Wi-Fi without app installation.",
    
    // Dynamic status & messages
    connecting: "Connecting...",
    connected: "Connected",
    reconnecting: "Reconnecting...",
    n_devices_online: "{0} Online",
    n_tasks: "{0} Tasks",
    copy_address: "Copy Address",
    copied: "Copied",
    scan_qr: "QR Code",
    scan_qr_tip: "Generate QR code, scan with mobile camera to connect",
    click_copy_ctrl_open: "Click to copy address, Ctrl+Click to open in new tab",
    one_click_copy: "Copy complete address",
    copy_success_toast: "Copied address to clipboard: {0}",
    copy_fallback_toast: "Address selected, press Ctrl+C / long press to copy",
    theme_dark: "Dark mode enabled",
    theme_light: "Light mode enabled",
    theme_auto: "Following system theme",
    no_wifi_detected: "No available LAN address detected. Please confirm you are connected to Wi-Fi.",
    searching_devices_title: "Looking for LAN devices",
    searching_devices_p: "Open the address above on other phones, iPads, or PCs. Devices on the same Wi-Fi will automatically appear here.",
    status_target_chosen: "Selected as Receiver",
    status_ready_to_send: "Ready · Click to Send",
    badge_current_target: "Target ✓",
    badge_select: "Select",
    empty_transfers: "No transfer tasks yet. Select a device and drop files into the transfer area to start.",
    status_interrupted: "Interrupted",
    status_paused: "Paused",
    status_cancelled: "Cancelled",
    status_rejected: "Rejected",
    status_expired: "Expired",
    status_waiting_peer: "Waiting for recipient",
    status_confirm_recv: "Awaiting confirmation",
    status_repick_file: "Re-select original file",
    status_merging: "Merging...",
    status_sending: "Sending...",
    status_peer_uploading: "Peer uploading...",
    status_sent_done: "Sent",
    status_saved: "Saved",
    status_downloaded: "Downloaded",
    status_received: "Received",
    status_receiving: "Receiving...",
    status_can_save: "Ready to save",
    badge_send: "Send",
    badge_recv: "Receive",
    send_to_peer: "Send to: {0}",
    from_peer: "From: {0}",
    action_receive: "Receive",
    action_reject: "Reject",
    action_repick: "Select original file to resume",
    action_pause: "Pause",
    action_resume: "Resume",
    action_save_again: "Save Again",
    action_save_local: "Save to Device",
    action_cancel: "Cancel",
    action_delete_record: "Delete",
    toast_deleted: "Record deleted",
    toast_cleared_finished: "Cleared finished records",
    incoming_wants_send: "{0} wants to send {1} file(s)",
    total_size: "Total Size: {0}",
    action_accept_all: "Accept All",
    action_reject_all: "Reject All",
    resume_banner_title: "{0} send task(s) can be resumed",
    resume_banner_desc: "The browser cannot directly access local files after page reload. Please re-select the same file; the system will verify and resume from the breakpoint without re-uploading everything.",
    action_repick_resume: "Select File to Resume",
    toast_select_device_first: "Please select a device first",
    toast_submitted_files: "Submitted {0} file(s)",
    toast_resumed_files: "Resumed incomplete file(s) from breakpoint",
    toast_files_picked_select_dev: "Picked {0} file(s), please click a device above to receive",
    toast_no_online_devices: "No online devices available. Scan QR code or open the address above on another device",
    toast_dev_name_updated: "Device name updated",
    toast_auto_accept_on: "Auto accept enabled",
    toast_auto_accept_off: "Auto accept disabled",
    toast_refresh_devs: "Device list refreshed",
    toast_transfer_interrupted: "Transfer interrupted, click Resume to continue from breakpoint",
    toast_cannot_connect: "Cannot connect to server",
    wakelock_active: "Awake",
    wakelock_inactive: "Sleep Allowed",
    wakelock_active_tip: "Screen Keep-Awake is Active: Screen will stay on to prevent transfer disconnection (Click to toggle)",
    wakelock_inactive_tip: "Screen Keep-Awake is Paused: Screen may auto-lock (Click to enable)",
    toast_wakelock_active: "Screen keep-awake is active to prevent file transfers from disconnecting",
    toast_wakelock_disabled: "Screen keep-awake paused (screen may auto-lock)",
  },
  zh: {
    app_title: "轻量级局域网文件传输",
    app_tagline: "同一 Wi-Fi 免安装即开即传 · P2P 中转 · 断点续传",
    my_device: "我的设备",
    device_title_tip: "点击可修改本设备名称",
    conn_status_title: "网络连接状态",
    lang_toggle_tip: "切换语言 / Switch Language",
    theme_toggle_tip: "切换明亮/暗黑主题",
    urls_title: "局域网访问地址",
    urls_tip: "连入同一 Wi-Fi 的手机、平板或电脑打开下方任意地址即可互联",
    devices_title: "在线设备",
    btn_refresh: "刷新",
    btn_refresh_tip: "刷新在线设备",
    drop_title_default: "先选择一台设备",
    drop_title_target: "投送文件给 {0}",
    drop_sub_default: "支持拖入多个文件或文件夹 · 原图原文件无损传输",
    btn_select_files: "选择文件",
    auto_accept: "自动接收",
    auto_accept_tip: "开启后收到文件将自动同意接收，无需逐个确认",
    transfers_title: "传输中心",
    btn_clear_finished: "清除记录",
    btn_clear_finished_tip: "一键清空所有已完成或已取消的记录",
    stepper_files: "并行文件",
    stepper_files_tip: "同时传输的文件数 (1-6)",
    stepper_chunks: "分片并发",
    stepper_chunks_tip: "单个文件分片并发数 (1-4)",
    footer_text: "局域网高速中转传输 · 仅发送方与接收方可见 · 传输完成或超时自动销毁 · 请勿映射至公网",
    modal_qr_title: "扫码连接本电脑",
    modal_qr_tip: "手机或平板使用相机/浏览器扫码，在同一 Wi-Fi 下免装 App 即开即连。",
    
    // Dynamic status & messages
    connecting: "连接中...",
    connected: "已连接",
    reconnecting: "重新连接中",
    n_devices_online: "{0} 台在线",
    n_tasks: "{0} 个任务",
    copy_address: "复制地址",
    copied: "已复制",
    scan_qr: "扫码",
    scan_qr_tip: "生成二维码，手机相机扫码秒连",
    click_copy_ctrl_open: "点击复制地址，Ctrl+点击在新标签页打开",
    one_click_copy: "一键复制完整地址",
    copy_success_toast: "已复制地址到剪贴板：{0}",
    copy_fallback_toast: "已选中地址，请按 Ctrl+C / 长按复制",
    theme_dark: "已开启深色模式",
    theme_light: "已开启浅色模式",
    theme_auto: "已跟随系统色彩模式",
    no_wifi_detected: "未检测到可用的局域网地址，请确认已连入 Wi-Fi",
    searching_devices_title: "正在寻找局域网设备",
    searching_devices_p: "请在其他手机、iPad 或电脑上打开上方网址。连入同一 Wi-Fi 的设备将自动在这里发现并互通。",
    status_target_chosen: "已选定为接收方",
    status_ready_to_send: "就绪 · 点击投送",
    badge_current_target: "当前目标 ✓",
    badge_select: "选择",
    empty_transfers: "还没有传输任务。选定设备并将文件拖入投送区，即可开启极速互传。",
    status_interrupted: "传输中断",
    status_paused: "已暂停",
    status_cancelled: "已取消",
    status_rejected: "已拒绝",
    status_expired: "已过期",
    status_waiting_peer: "等待对方接收",
    status_confirm_recv: "待确认接收",
    status_repick_file: "待重选原文件",
    status_merging: "正在合并",
    status_sending: "发送中",
    status_peer_uploading: "对方上传中",
    status_sent_done: "发送完成",
    status_saved: "已保存",
    status_downloaded: "已下载",
    status_received: "已接收",
    status_receiving: "正在接收",
    status_can_save: "可以保存",
    badge_send: "发送",
    badge_recv: "接收",
    send_to_peer: "发送给: {0}",
    from_peer: "来自: {0}",
    action_receive: "接收",
    action_reject: "拒绝",
    action_repick: "选择原文件续传",
    action_pause: "暂停",
    action_resume: "继续",
    action_save_again: "再次保存",
    action_save_local: "保存到本地",
    action_cancel: "取消",
    action_delete_record: "删除记录",
    toast_deleted: "已删除记录",
    toast_cleared_finished: "已清空已结束记录",
    incoming_wants_send: "{0} 想要向您发送 {1} 个文件",
    total_size: "总大小: {0}",
    action_accept_all: "全部接收",
    action_reject_all: "全部拒绝",
    resume_banner_title: "有 {0} 个发送任务可以断点续传",
    resume_banner_desc: "页面刷新后浏览器无法直接读取原文件。请重新选择同一个文件，系统将自动校验并从断点继续传输，无需重新上传全部内容。",
    action_repick_resume: "选择原文件续传",
    toast_select_device_first: "请先选择一台设备",
    toast_submitted_files: "已提交 {0} 个文件",
    toast_resumed_files: "已接上未完成的文件，将从断点继续",
    toast_files_picked_select_dev: "已选取 {0} 个文件，请点击上方要接收文件的设备",
    toast_no_online_devices: "当前没有可发送的在线设备，请先用其他设备扫码或打开上方地址",
    toast_dev_name_updated: "设备名称已更新",
    toast_auto_accept_on: "已开启自动接收文件",
    toast_auto_accept_off: "已关闭自动接收",
    toast_refresh_devs: "设备列表已刷新",
    toast_transfer_interrupted: "传输中断，点继续即可从断点接着传",
    toast_cannot_connect: "无法连接服务",
    wakelock_active: "保持常亮",
    wakelock_inactive: "允许息屏",
    wakelock_active_tip: "屏幕常亮已开启：防止熄屏导致文件传输断开（点击切换）",
    wakelock_inactive_tip: "屏幕常亮已暂停：设备可能自动休眠（点击开启）",
    toast_wakelock_active: "已开启屏幕常亮，防止手机或电脑息屏导致文件传输中断",
    toast_wakelock_disabled: "已暂停屏幕常亮（设备将按系统设置休眠）",
  }
};

function t(key, ...args) {
  const lang = state.lang || "en";
  const dict = I18N[lang] || I18N.en;
  let text = dict[key] || (I18N.en && I18N.en[key]) || key;
  if (args.length) {
    args.forEach((val, idx) => {
      text = text.replace(new RegExp(`\\{${idx}\\}`, "g"), val);
    });
  }
  return text;
}

function setLanguage(lang) {
  state.lang = lang === "zh" ? "zh" : "en";
  localStorage.setItem("lft-lang", state.lang);
  document.documentElement.lang = state.lang;

  const langLabel = $("lang-label");
  if (langLabel) {
    langLabel.textContent = state.lang === "zh" ? "中" : "EN";
  }

  // Update dropdown menu items selected status
  document.querySelectorAll(".lang-menu-item").forEach((item) => {
    const isSelected = item.getAttribute("data-lang") === state.lang;
    item.classList.toggle("selected", isSelected);
    item.setAttribute("aria-selected", isSelected ? "true" : "false");
  });

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (key) {
      if (node.tagName === "TITLE") {
        document.title = state.lang === "zh" ? "轻量级局域网文件传输" : "Lightweight LAN Transfer";
      } else {
        node.textContent = t(key);
      }
    }
  });

  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    const key = node.getAttribute("data-i18n-title");
    if (key) node.setAttribute("title", t(key));
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    const key = node.getAttribute("data-i18n-placeholder");
    if (key) node.setAttribute("placeholder", t(key));
  });

  renderStatus();
  if (state.urls) renderUrls(state.urls);
  renderDevices();
  renderTransfers();
  renderDrop();
  if (typeof keepAwake !== "undefined" && keepAwake.updateUI) keepAwake.updateUI();
}

// 生成 UUID。通过局域网 IP 打开时，页面不是安全上下文，crypto.randomUUID 可能不可用。
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((item) => item.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function settings() {
  return {
    files: clamp($("parallel-files").value, 1, 6),
    chunks: clamp($("parallel-chunks").value, 1, 4),
  };
}

function randomSuffix(length = 4) {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  let result = "";
  if (window.crypto && crypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i += 1) {
      result += chars[bytes[i] % chars.length];
    }
  } else {
    for (let i = 0; i < length; i += 1) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return result;
}

function guessDeviceBaseName() {
  const ua = navigator.userAgent;
  const isZh = (state.lang || "en") === "zh";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return isZh ? "Android 手机" : "Android Phone";
  if (/Mac OS/i.test(ua)) return isZh ? "Mac 电脑" : "Mac";
  if (/Windows/i.test(ua)) return isZh ? "Windows 电脑" : "Windows PC";
  if (/Linux/i.test(ua)) return isZh ? "Linux 主机" : "Linux Host";
  return isZh ? "浏览器设备" : "Browser Device";
}

function guessName() {
  return guessDeviceBaseName() + "-" + randomSuffix(4);
}

function formatBytes(value) {
  const size = Number(value) || 0;
  if (size < 1024) return size + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let number = size / 1024;
  let index = 0;
  while (number >= 1024 && index < units.length - 1) {
    number /= 1024;
    index += 1;
  }
  return number.toFixed(number >= 10 ? 1 : 2) + " " + units[index];
}

function formatSpeed(value) {
  if (!value || value < 1) return "";
  return formatBytes(value) + "/s";
}

// 把缺失区间切成可并行上传的小块。end 为不含本身的结束位置。
function splitRanges(ranges, chunkSize) {
  const pieces = [];
  for (const pair of ranges) {
    for (let cursor = pair[0]; cursor < pair[1]; cursor += chunkSize) {
      pieces.push([cursor, Math.min(cursor + chunkSize, pair[1])]);
    }
  }
  return pieces;
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  const props = attrs || {};
  for (const key of Object.keys(props)) {
    const value = props[key];
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value == null ? "" : String(value);
    else if (key === "html") node.innerHTML = value == null ? "" : String(value);
    else if (key.indexOf("on") === 0 && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (value != null) node.setAttribute(key, String(value));
  }
  for (const child of children || []) {
    if (child == null) continue;
    if (typeof child === "string" || typeof child === "number") node.append(document.createTextNode(String(child)));
    else node.append(child);
  }
  return node;
}

// ==========================================================================
// iOS 26 Icon & Category Utilities
// ==========================================================================

function getDeviceSvg(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.includes("iphone") || lower.includes("手机") || lower.includes("phone")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="3"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`;
  }
  if (lower.includes("ipad") || lower.includes("pad") || lower.includes("平板")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2.5"/><circle cx="12" cy="18" r="1"/></svg>`;
  }
  if (lower.includes("mac") || lower.includes("apple")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 18h20v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1z"/><path d="M10 18v-2h4v2"/></svg>`;
  }
  if (lower.includes("android") || lower.includes("安卓")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/></svg>`;
  }
  if (lower.includes("linux")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`;
  }
  // Default Windows / Desktop PC
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
}

function getFileCategory(name) {
  const ext = (String(name || "").split(".").pop() || "").toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "heic", "tiff"].includes(ext)) return "photo";
  if (["mp4", "mov", "mkv", "avi", "webm", "flv", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "aac", "flac", "m4a", "ogg", "wma"].includes(ext)) return "audio";
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso", "dmg"].includes(ext)) return "archive";
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md"].includes(ext)) return "doc";
  if (["js", "ts", "json", "html", "css", "py", "c", "cpp", "rs", "go", "java", "sh"].includes(ext)) return "code";
  return "general";
}

function getFileIconSvg(category) {
  if (category === "photo") {
    return `<div style="width:34px;height:34px;border-radius:10px;background:rgba(255,45,85,0.15);color:#ff2d55;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;
  }
  if (category === "video") {
    return `<div style="width:34px;height:34px;border-radius:10px;background:rgba(175,82,222,0.15);color:#af52de;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></div>`;
  }
  if (category === "audio") {
    return `<div style="width:34px;height:34px;border-radius:10px;background:rgba(255,59,48,0.15);color:#ff3b30;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`;
  }
  if (category === "archive") {
    return `<div style="width:34px;height:34px;border-radius:10px;background:rgba(255,149,0,0.15);color:#ff9500;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg></div>`;
  }
  if (category === "doc") {
    return `<div style="width:34px;height:34px;border-radius:10px;background:rgba(0,113,227,0.15);color:#0071e3;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>`;
  }
  if (category === "code") {
    return `<div style="width:34px;height:34px;border-radius:10px;background:rgba(52,199,89,0.15);color:#34c759;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></div>`;
  }
  return `<div style="width:34px;height:34px;border-radius:10px;background:rgba(142,142,147,0.15);color:#8e8e93;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg></div>`;
}

// ==========================================================================
// QR Code Generator (Standard Compliant, 100% Scannable)
// ==========================================================================

function createQRCode(text) {
  if (typeof qrcode === "function") {
    try {
      const qr = qrcode(0, "M");
      qr.addData(text);
      qr.make();
      const count = qr.getModuleCount();
      const margin = 4;
      const size = count + margin * 2;
      let path = "";
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            path += `M${c + margin},${r + margin}h1v1h-1z `;
          }
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#ffffff"/><path d="${path}" fill="#000000"/></svg>`;
    } catch (e) {
      console.warn("Client QR generation error:", e);
    }
  }
  return "";
}

// ==========================================================================
// Toast & Modals
// ==========================================================================

let toastTimer = 0;
function toast(message) {
  const node = $("toast");
  if (!node) return;
  const textEl = node.querySelector(".toast-text");
  if (textEl) textEl.textContent = message;
  else node.textContent = message;
  node.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.add("hidden"), 3800);
}

async function openQrModal(url) {
  const modal = $("qr-modal");
  const svgWrap = $("qr-svg-wrap");
  const urlText = $("qr-url-text");
  if (!modal || !svgWrap) return;
  if (urlText) urlText.textContent = url;

  const localSvg = createQRCode(url);
  if (localSvg) {
    svgWrap.innerHTML = localSvg;
  }
  modal.classList.remove("hidden");

  try {
    const res = await fetch("/api/qrcode?text=" + encodeURIComponent(url));
    if (res.ok) {
      const data = await res.json();
      if (data && data.svg) {
        svgWrap.innerHTML = data.svg;
      }
    }
  } catch {}
}

function closeQrModal() {
  const modal = $("qr-modal");
  if (modal) modal.classList.add("hidden");
}

async function copyToClipboard(text, btn, inputEl) {
  let success = false;

  // If input element is given, focus and select it
  if (inputEl) {
    try {
      inputEl.focus();
      inputEl.select();
      inputEl.setSelectionRange(0, text.length);
    } catch (e) {}
  }

  // Strategy 1: Modern Clipboard API
  if (navigator.clipboard && window.isSecureContext && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      success = true;
    } catch (e) {
      success = false;
    }
  }

  // Strategy 2: execCommand with input or temporary textarea
  if (!success) {
    try {
      if (inputEl) {
        success = document.execCommand("copy");
      }
      if (!success) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.top = "0";
        textarea.style.left = "0";
        textarea.style.width = "2em";
        textarea.style.height = "2em";
        textarea.style.opacity = "0.01";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, text.length);
        success = document.execCommand("copy");
        document.body.removeChild(textarea);
      }
    } catch (e) {
      success = false;
    }
  }

  if (success) {
    if (btn) {
      btn.classList.add("copied");
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;"><polyline points="20 6 9 17 4 12"/></svg><span>${t("copied")}</span>`;
      setTimeout(() => {
        btn.classList.remove("copied");
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>${t("copy_address")}</span>`;
      }, 2000);
    }
    toast(t("copy_success_toast", text));
  } else {
    if (inputEl) {
      inputEl.focus();
      inputEl.select();
    }
    toast(t("copy_fallback_toast"));
  }
}

// ==========================================================================
// Theme Management
// ==========================================================================

function initTheme() {
  const toggleBtn = $("theme-toggle");
  let theme = localStorage.getItem("lft-theme") || "auto";
  applyTheme(theme);

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      if (theme === "auto") theme = "dark";
      else if (theme === "dark") theme = "light";
      else theme = "auto";
      localStorage.setItem("lft-theme", theme);
      applyTheme(theme);
      toast(theme === "dark" ? t("theme_dark") : theme === "light" ? t("theme_light") : t("theme_auto"));
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

// ==========================================================================
// Screen Keep-Awake Engine (Mobile iOS/Android & Desktop)
// Keeps screen from sleeping/locking during transfers and browsing
// ==========================================================================

const KEEP_AWAKE_MP4_B64 = "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAARRbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAA3t0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAACAAAAAgAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAEAAABAAAAAALzbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAyAAAAMgBVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAACnm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAl5zdGJsAAAAqnN0c2QAAAAAAAAAAQAAAJphdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAACAAIABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2UlsBEAAAAMAQAAADIPEiWWAAQAGaOvjxMhM/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAYc3R0cwAAAAAAAAABAAAAGQAAAgAAAAAUc3RzcwAAAAAAAAABAAAAAQAAANhjdHRzAAAAAAAAABkAAAABAAAEAAAAAAEAAAoAAAAAAQAABAAAAAABAAAAAAAAAAEAAAIAAAAAAQAACgAAAAABAAAEAAAAAAEAAAAAAAAAAQAAAgAAAAABAAAKAAAAAAEAAAQAAAAAAQAAAAAAAAABAAACAAAAAAEAAAoAAAAAAQAABAAAAAABAAAAAAAAAAEAAAIAAAAAAQAACgAAAAABAAAEAAAAAAEAAAAAAAAAAQAAAgAAAAABAAAKAAAAAAEAAAQAAAAAAQAAAAAAAAABAAACAAAAABxzdHNjAAAAAAAAAAEAAAABAAAAGQAAAAEAAAB4c3RzegAAAAAAAAAAAAAAGQAAAr8AAAAOAAAADQAAAA0AAAANAAAAFAAAAA8AAAANAAAADQAAABQAAAAPAAAADQAAAA0AAAAUAAAADwAAAA0AAAANAAAAFAAAAA8AAAANAAAADQAAABMAAAAPAAAADQAAAA0AAAAUc3RjbwAAAAAAAAABAAAEgQAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNTguNTAuMTAwAAAACGZyZWUAAAQsbWRhdAAAAqIGBf//ntxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjEgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDIwIC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MSByZWY9MyBkZWJsb2NrPTE6LTM6LTMgYW5hbHlzZT0weDM6MHgxMTMgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTIuMDA6MC43MCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTQgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTEgYl9iaWFzPTAgZGlyZWN0PTEgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0yIGtleWludD0yNTAga2V5aW50X21pbj0yNSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMjAAgAAAABVliIQAEc5//veIHzLLb5xq12qmFN8AAAAKQZokbEEc5/61wAAAAAlBnkJ4h2c/RsEAAAAJAZ5hdENzn0xAAAAACQGeY2pDc59MQQAAABBBmmhJqEFomUwII5z//rXBAAAAC0GehkURLDs5/0bBAAAACQGepXRDc59MQQAAAAkBnqdqQ3OfTEAAAAAQQZqsSahBbJlMCCOc//61wAAAAAtBnspFFSw7Of9GwQAAAAkBnul0Q3OfTEAAAAAJAZ7rakNzn0xAAAAAEEGa8EmoQWyZTAghnP/+q4EAAAALQZ8ORRUsOzn/RsEAAAAJAZ8tdENzn0xBAAAACQGfL2pDc59MQAAAABBBmzRJqEFsmUwIfnP//quAAAAAC0GfUkUVLDs5/0bBAAAACQGfcXRDc59MQAAAAAkBn3NqQ3OfTEAAAAAPQZt4SahBbJlMCG5z//6rAAAAC0GflkUVLDs5/0bAAAAACQGftXRDc59MQQAAAAkBn7dqQ3OfTEE=";

const keepAwake = {
  enabled: localStorage.getItem("lft-keep-awake") !== "0",
  wakeLock: null,
  videoEl: null,
  active: false,

  init() {
    this.videoEl = $("keep-awake-video");
    if (!this.videoEl) {
      const v = document.createElement("video");
      v.id = "keep-awake-video";
      v.setAttribute("playsinline", "");
      v.setAttribute("webkit-playsinline", "");
      v.muted = true;
      v.defaultMuted = true;
      v.loop = true;
      v.autoplay = true;
      v.preload = "auto";
      v.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.001;pointer-events:none;z-index:-999;";
      document.body.appendChild(v);
      this.videoEl = v;
    }
    // Set fallback source
    if (this.videoEl && !this.videoEl.src && !this.videoEl.querySelector("source")) {
      this.videoEl.src = "data:video/mp4;base64," + KEEP_AWAKE_MP4_B64;
    }
    this.bindEvents();
    if (this.enabled) {
      this.acquire();
    } else {
      this.updateUI();
    }
  },

  async acquireWakeLock() {
    if ("wakeLock" in navigator && document.visibilityState === "visible") {
      try {
        if (this.wakeLock) return true;
        this.wakeLock = await navigator.wakeLock.request("screen");
        this.wakeLock.addEventListener("release", () => {
          this.wakeLock = null;
          this.updateUI();
        });
        return true;
      } catch (err) {
        this.wakeLock = null;
        return false;
      }
    }
    return false;
  },

  async acquireVideo() {
    const v = this.videoEl || $("keep-awake-video");
    if (!v) return false;
    try {
      v.muted = true;
      v.defaultMuted = true;
      if (v.paused) {
        const p = v.play();
        if (p && p.catch) {
          await p.catch(() => {
            if (!v.src || !v.src.startsWith("data:")) {
              v.src = "data:video/mp4;base64," + KEEP_AWAKE_MP4_B64;
              v.play().catch(() => {});
            }
          });
        }
      }
      return !v.paused;
    } catch (err) {
      return false;
    }
  },

  async acquire() {
    if (!this.enabled) return;
    const lockOk = await this.acquireWakeLock();
    let videoOk = false;
    if (!lockOk) {
      videoOk = await this.acquireVideo();
    } else {
      const v = this.videoEl || $("keep-awake-video");
      if (v && !v.paused) {
        try { v.pause(); } catch (_) {}
      }
    }
    this.active = lockOk || videoOk;
    this.updateUI();
  },

  release() {
    if (this.wakeLock) {
      try { this.wakeLock.release(); } catch (_) {}
      this.wakeLock = null;
    }
    const v = this.videoEl || $("keep-awake-video");
    if (v && !v.paused) {
      try { v.pause(); } catch (_) {}
    }
    this.active = false;
    this.updateUI();
  },

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem("lft-keep-awake", this.enabled ? "1" : "0");
    if (this.enabled) {
      this.acquire();
      toast(t("toast_wakelock_active"));
    } else {
      this.release();
      toast(t("toast_wakelock_disabled"));
    }
  },

  bindEvents() {
    // When returning to foreground tab or unlocking device
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.enabled) {
        this.acquire();
      }
    });

    // Mobile user-gesture activation: tap anywhere unlocks video playback if initially restricted
    const unlock = () => {
      if (this.enabled) {
        this.acquire();
      }
    };
    ["touchstart", "touchend", "click", "pointerdown"].forEach((evt) => {
      window.addEventListener(evt, unlock, { passive: true });
    });
  },

  updateUI() {
    const btn = $("wakelock-toggle");
    if (!btn) return;
    const isAwake = this.enabled;
    btn.classList.toggle("active", isAwake);
    btn.classList.toggle("disabled", !isAwake);
    const label = $("wakelock-label");
    if (label) {
      label.textContent = t(isAwake ? "wakelock_active" : "wakelock_inactive");
    }
    btn.setAttribute("title", t(isAwake ? "wakelock_active_tip" : "wakelock_inactive_tip"));
  }
};

// ==========================================================================
// Network & Session
// ==========================================================================

async function api(method, path, options) {
  const opts = options || {};
  const response = await fetch(path, {
    method: method,
    credentials: "same-origin",
    signal: opts.signal,
    headers: Object.assign({}, opts.json ? { "Content-Type": "application/json" } : {}, opts.headers || {}),
    body: opts.json ? JSON.stringify(opts.json) : opts.body,
  });
  const type = response.headers.get("content-type") || "";
  const data = type.indexOf("json") >= 0 ? await response.json() : null;
  if (!response.ok) {
    const error = new Error((data && data.message) || "请求失败");
    error.status = response.status;
    error.code = data && data.error;
    throw error;
  }
  return data;
}

function persistSaved() {
  localStorage.setItem("lft-saved", JSON.stringify(Array.from(state.saved)));
}

function persistCleared() {
  const arr = Array.from(state.cleared);
  if (arr.length > 300) arr.splice(0, arr.length - 300);
  localStorage.setItem("lft-cleared", JSON.stringify(arr));
}

async function clearTransfer(id) {
  state.cleared.add(id);
  persistCleared();
  const running = state.running.get(id);
  if (running && running.controller) {
    try { running.controller.abort(); } catch (_) {}
  }
  state.transfers.delete(id);
  state.files.delete(id);
  state.running.delete(id);
  state.paused.delete(id);
  state.errors.delete(id);
  state.speeds.delete(id);
  state.saved.delete(id);
  persistSaved();
  state.cached.delete(id);
  state.handed.delete(id);
  renderTransfers();
  renderIncoming();
  try {
    await api("DELETE", "/api/transfers/" + id);
  } catch (error) {
    // 忽略异常，本地已永久清除
  }
}

function ackKey(id) {
  return "lft-ack:" + id;
}

function upsert(transfer) {
  if (state.cleared.has(transfer.id)) return;
  const previous = state.transfers.get(transfer.id);
  state.transfers.set(transfer.id, transfer);
  if (previous) noteSpeed(transfer.id, transfer.receivedBytes);
  else state.speeds.set(transfer.id, { t: Date.now(), bytes: transfer.receivedBytes, speed: 0 });
  if (transfer.status === "cancelled" || transfer.status === "rejected" || transfer.status === "expired") {
    state.files.delete(transfer.id);
    state.paused.delete(transfer.id);
  }
  maybeAutoAccept(transfer);
}

function noteSpeed(id, bytes) {
  const now = Date.now();
  const previous = state.speeds.get(id) || { t: now, bytes: bytes, speed: 0 };
  const delta = (now - previous.t) / 1000;
  if (delta >= 0.4) {
    state.speeds.set(id, { t: now, bytes: bytes, speed: Math.max(0, (bytes - previous.bytes) / delta) });
  }
}

function connectWs() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(protocol + "://" + location.host + "/ws");
  socket.onopen = () => {
    state.wsReady = true;
    renderStatus();
  };
  socket.onclose = () => {
    state.wsReady = false;
    renderStatus();
    setTimeout(connectWs, 1500);
  };
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "peers" || message.type === "hello") {
      state.peers = message.peers || [];
      renderDevices();
    }
    if (message.type === "transfer") {
      if (state.cleared.has(message.transfer.id)) return;
      upsert(message.transfer);
      schedule();
      renderTransfers();
    }
    if (message.type === "transfer:delete") {
      state.cleared.add(message.id);
      persistCleared();
      state.transfers.delete(message.id);
      renderTransfers();
      renderIncoming();
    }
  };
}

async function refresh() {
  const peers = await api("GET", "/api/peers");
  const transfers = await api("GET", "/api/transfers");
  const info = await api("GET", "/api/info");
  state.peers = peers.peers;
  const seen = new Set();
  for (const transfer of transfers.transfers) {
    if (state.cleared.has(transfer.id)) continue;
    seen.add(transfer.id);
    upsert(transfer);
  }
  for (const id of Array.from(state.transfers.keys())) {
    if (!seen.has(id) || state.cleared.has(id)) state.transfers.delete(id);
  }
  state.urls = info.urls || [];
  renderUrls(state.urls);
  renderDevices();
  renderTransfers();
  schedule();
}

function renderStatus() {
  const node = $("conn-status");
  if (node) {
    node.textContent = state.wsReady ? t("connected") : t("reconnecting");
    node.classList.toggle("on", state.wsReady);
  }
  const avatar = $("my-device-avatar");
  if (avatar && state.me) {
    avatar.innerHTML = getDeviceSvg(state.me.name);
  }
}

function renderUrls(urls) {
  state.urls = urls || [];
  const root = $("urls");
  root.replaceChildren();
  const remote = urls.filter((url) => url.indexOf("127.0.0.1") < 0);
  const list = remote.length ? remote : urls;
  if (!list.length) {
    root.append(el("div", { class: "meta", text: t("no_wifi_detected") }));
    return;
  }
  list.forEach((url) => {
    const row = el("div", { class: "url-row" });

    const icon = el("div", {
      class: "url-row-icon",
      title: "Wi-Fi LAN Access Point",
      html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`
    });

    const linkEl = el("a", {
      class: "url-link",
      href: url,
      target: "_blank",
      rel: "noopener noreferrer",
      title: t("click_copy_ctrl_open"),
    }, [
      el("span", { class: "url-text", text: url }),
      el("span", { class: "url-open-icon", html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>` })
    ]);

    linkEl.addEventListener("click", (e) => {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        copyToClipboard(url, copyBtn);
      }
    });

    const displayWrap = el("div", { class: "url-display-wrap" }, [linkEl]);

    const copyBtn = el("button", {
      type: "button",
      class: "btn-copy-url",
      title: t("one_click_copy"),
      html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>${t("copy_address")}</span>`,
      onclick: () => copyToClipboard(url, copyBtn)
    });

    const qrBtn = el("button", {
      type: "button",
      class: "btn-qr-url",
      title: t("scan_qr_tip"),
      html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg><span>${t("scan_qr")}</span>`,
      onclick: () => openQrModal(url)
    });

    row.append(icon, displayWrap, copyBtn, qrBtn);
    root.append(row);
  });
}

function renderDevices() {
  const root = $("devices");
  const peers = state.peers.filter((peer) => !state.me || peer.id !== state.me.id);
  const countBadge = $("device-count");
  if (countBadge) {
    countBadge.textContent = t("n_devices_online", peers.length);
  }

  // If selected device is no longer online, clear selection
  if (state.selectedId && !peers.some((p) => p.id === state.selectedId)) {
    state.selectedId = null;
    state.selectedName = "";
  }

  // If only 1 peer is online and none is selected, auto-select it for seamless UX
  if (!state.selectedId && peers.length === 1) {
    state.selectedId = peers[0].id;
    state.selectedName = peers[0].name;
  }

  if (!peers.length) {
    const radar = el("div", { class: "radar-empty" }, [
      el("div", { class: "radar-ripple-container" }, [
        el("div", { class: "radar-ring" }),
        el("div", { class: "radar-ring" }),
        el("div", { class: "radar-ring" }),
        el("div", {
          class: "radar-center-icon",
          html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 0 0-10 10c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/></svg>`
        }),
      ]),
      el("h3", { text: t("searching_devices_title") }),
      el("p", { text: t("searching_devices_p") })
    ]);
    root.replaceChildren(radar);
    renderDrop();
    return;
  }

  root.replaceChildren.apply(root, peers.map((peer) => {
    const selected = peer.id === state.selectedId;
    const deviceSvg = getDeviceSvg(peer.name);
    return el("button", {
      class: "device" + (selected ? " selected" : ""),
      type: "button",
      onclick: () => selectPeer(peer),
      ondragover: (event) => {
        event.preventDefault();
        event.currentTarget.classList.add("selected");
      },
      ondrop: (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectPeer(peer);
        if (event.dataTransfer.files && event.dataTransfer.files.length) {
          sendFiles(peer.id, event.dataTransfer.files).catch((error) => toast(error.message));
        }
      },
    }, [
      el("div", { class: "device-left" }, [
        el("div", { class: "device-icon-box", html: deviceSvg }),
        el("div", { class: "device-info" }, [
          el("span", { class: "name", text: peer.name }),
          el("div", { class: "device-status" }, [
            el("span", { class: "dot" }),
            el("span", { text: selected ? t("status_target_chosen") : t("status_ready_to_send") }),
          ]),
        ]),
      ]),
      el("span", { class: "device-right-tag", text: selected ? t("badge_current_target") : t("badge_select") }),
    ]);
  }));
  renderDrop();
}

function selectPeer(peer) {
  state.selectedId = peer.id;
  state.selectedName = peer.name;
  renderDevices();
  if (state.pendingFiles && state.pendingFiles.length) {
    const files = state.pendingFiles;
    state.pendingFiles = null;
    sendFiles(peer.id, files).catch((error) => toast(error.message));
  }
}

function renderDrop() {
  const titleNode = $("drop-title");
  if (titleNode) {
    titleNode.textContent = state.selectedId ? t("drop_title_target", state.selectedName) : t("drop_title_default");
  }
}

function describe(transfer) {
  const error = state.errors.get(transfer.id);
  if (error) return error;
  const mine = transfer.senderId === state.me.id;
  if (state.paused.has(transfer.id)) return t("status_paused");
  if (transfer.status === "offered") return mine ? t("status_waiting_peer") : t("status_confirm_recv");
  if (transfer.status === "rejected") return t("status_rejected");
  if (transfer.status === "cancelled") return t("status_cancelled");
  if (transfer.status === "expired") return t("status_expired");
  if (transfer.status === "uploading") {
    if (mine && !state.files.has(transfer.id)) return t("status_repick_file");
    if (!transfer.missing.length && transfer.receivedBytes === transfer.size) return t("status_merging");
    return mine ? t("status_sending") : t("status_peer_uploading");
  }
  if (transfer.status === "ready") {
    if (mine) return t("status_sent_done");
    if (state.saved.has(transfer.id)) return t("status_saved");
    if (state.handed.has(transfer.id)) return t("status_downloaded");
    if (state.cached.has(transfer.id)) return t("status_received");
    if (state.running.has(transfer.id)) return t("status_receiving");
    return t("status_can_save");
  }
  return transfer.status;
}

function percentOf(transfer) {
  if (transfer.receiverId === state.me.id && transfer.status === "ready") {
    if (state.cached.has(transfer.id) || state.saved.has(transfer.id)) return 1;
    if (state.localBytes.has(transfer.id)) {
      return transfer.size === 0 ? 1 : state.localBytes.get(transfer.id) / transfer.size;
    }
  }
  if (transfer.size === 0) return transfer.status === "offered" ? 0 : 1;
  return transfer.percent || 0;
}

function renderTransfers() {
  renderIncoming();
  renderResumeBanner();
  const root = $("transfers");
  const items = Array.from(state.transfers.values())
    .filter((transfer) => !state.cleared.has(transfer.id))
    .sort((a, b) => b.createdAt - a.createdAt);
  
  const countBadge = $("transfer-count");
  if (countBadge) {
    countBadge.textContent = t("n_tasks", items.length);
  }

  const clearFinishedBtn = $("clear-finished");
  if (clearFinishedBtn) {
    const hasFinished = items.some((t) => 
      t.status === "ready" || t.status === "cancelled" || t.status === "rejected" || t.status === "expired"
    );
    clearFinishedBtn.classList.toggle("hidden", !hasFinished);
  }

  if (!items.length) {
    root.replaceChildren(el("div", { class: "empty", text: t("empty_transfers") }));
    return;
  }
  root.replaceChildren.apply(root, items.map(renderTransfer));
}

function getTransferStatus(transfer, mine) {
  const error = state.errors.get(transfer.id);
  if (error) {
    return { text: t("status_interrupted"), type: "error" };
  }
  if (state.paused.has(transfer.id)) {
    return { text: t("status_paused"), type: "warning" };
  }
  if (transfer.status === "cancelled") {
    return { text: t("status_cancelled"), type: "neutral" };
  }
  if (transfer.status === "rejected") {
    return { text: t("status_rejected"), type: "neutral" };
  }
  if (transfer.status === "expired") {
    return { text: t("status_expired"), type: "neutral" };
  }
  if (transfer.status === "offered") {
    return { text: mine ? t("status_waiting_peer") : t("status_confirm_recv"), type: "pending" };
  }
  if (transfer.status === "uploading") {
    if (mine && !state.files.has(transfer.id)) {
      return { text: t("status_repick_file"), type: "warning" };
    }
    if (!transfer.missing.length && transfer.receivedBytes === transfer.size) {
      return { text: t("status_merging"), type: "active" };
    }
    return { text: mine ? t("status_sending") : t("status_peer_uploading"), type: "active" };
  }
  if (transfer.status === "ready") {
    if (mine) {
      return { text: t("status_sent_done"), type: "success" };
    }
    if (state.saved.has(transfer.id)) {
      return { text: t("status_saved"), type: "success" };
    }
    if (state.handed.has(transfer.id)) {
      return { text: t("status_downloaded"), type: "success" };
    }
    if (state.cached.has(transfer.id)) {
      return { text: t("status_received"), type: "success" };
    }
    if (state.running.has(transfer.id)) {
      return { text: t("status_receiving"), type: "active" };
    }
    return { text: t("status_can_save"), type: "success" };
  }
  return { text: transfer.status, type: "neutral" };
}

function renderTransfer(transfer) {
  const mine = transfer.senderId === state.me.id;
  const peerName = mine ? transfer.receiverName : transfer.senderName;
  const percent = Math.max(0, Math.min(1, percentOf(transfer)));
  const speed = formatSpeed((state.speeds.get(transfer.id) || {}).speed);
  const actions = el("div", { class: "actions" });
  addActions(actions, transfer, mine);

  const fileCategory = getFileCategory(transfer.name);
  const fileSvg = getFileIconSvg(fileCategory);
  const statusInfo = getTransferStatus(transfer, mine);

  const isCancelled = transfer.status === "cancelled" || transfer.status === "rejected" || transfer.status === "expired";
  const isSuccess = transfer.status === "ready" && (mine || state.saved.has(transfer.id) || state.cached.has(transfer.id));
  const isFinished = transfer.status === "ready" || isCancelled;
  const showProgressBar = !isFinished && (transfer.status === "uploading" || state.running.has(transfer.id));

  const children = [
    el("div", { class: "transfer-top" }, [
      el("div", { style: "display:flex;align-items:center;gap:10px;overflow:hidden;flex:1;min-width:0;" }, [
        el("div", { style: "flex-shrink:0;", html: fileSvg }),
        el("strong", { text: transfer.name, title: transfer.name }),
      ]),
      el("div", { style: "display:flex;align-items:center;gap:6px;flex-shrink:0;" }, [
        el("span", { class: "badge-direction " + (mine ? "send" : "recv"), text: mine ? t("badge_send") : t("badge_recv") }),
        el("span", { class: "badge-status " + statusInfo.type, text: statusInfo.text }),
      ]),
    ]),
    el("div", { class: "transfer-info-row" }, [
      el("span", { text: (mine ? t("send_to_peer", peerName) : t("from_peer", peerName)) + " · " + formatBytes(transfer.size) + " · " + describe(transfer) }),
      speed && !isFinished ? el("span", { class: "transfer-speed", html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> ` + speed }) : null,
    ]),
  ];

  if (showProgressBar) {
    children.push(
      el("div", { class: "bar-wrap" }, [
        el("div", { class: "bar" }, [
          el("span", { style: "width:" + (percent * 100).toFixed(1) + "%" }),
        ]),
        el("span", { class: "percent-text", text: Math.round(percent * 100) + "%" }),
      ])
    );
  }

  children.push(actions);

  return el("article", { class: "transfer" + (isSuccess ? " is-success" : "") + (isCancelled ? " is-cancelled" : "") }, children);
}

function addActions(actions, transfer, mine) {
  const button = (label, className, iconSvg, onclick) => {
    const btn = el("button", { type: "button", class: className, onclick: onclick });
    if (iconSvg) {
      btn.innerHTML = iconSvg + `<span>${label}</span>`;
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.gap = "5px";
    } else {
      btn.textContent = label;
    }
    actions.append(btn);
  };

  if (transfer.status === "offered" && !mine) {
    button(t("action_receive"), "btn-primary", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><polyline points="20 6 9 17 4 12"/></svg>`, () => acceptOne(transfer.id));
    button(t("action_reject"), "ghost warn", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`, () => postAction(transfer.id, "reject"));
  }
  if (transfer.status === "uploading" && mine && !state.files.has(transfer.id)) {
    button(t("action_repick"), "btn-primary", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`, () => $("resume-input").click());
  }
  if (state.running.has(transfer.id)) {
    button(t("action_pause"), "ghost", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`, () => pause(transfer.id));
  } else if (state.paused.has(transfer.id) || state.errors.has(transfer.id)) {
    button(t("action_resume"), "", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>`, () => resume(transfer.id));
  }
  if (!mine && transfer.status === "ready") {
    button(state.saved.has(transfer.id) ? t("action_save_again") : t("action_save_local"), "", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`, () => saveTransfer(transfer.id));
  }
  if (transfer.status === "offered" || transfer.status === "uploading") {
    button(t("action_cancel"), "ghost warn", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`, () => postAction(transfer.id, "cancel"));
  }
  if (transfer.status === "ready" || transfer.status === "cancelled" || transfer.status === "rejected" || transfer.status === "expired") {
    button(t("action_delete_record"), "ghost", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`, () => {
      clearTransfer(transfer.id);
      toast(t("toast_deleted"));
    });
  }
}

function renderIncoming() {
  const root = $("incoming");
  const groups = new Map();
  for (const transfer of state.transfers.values()) {
    if (transfer.receiverId !== state.me.id || transfer.status !== "offered") continue;
    if (!groups.has(transfer.batchId)) groups.set(transfer.batchId, []);
    groups.get(transfer.batchId).push(transfer);
  }
  const cards = [];
  for (const group of groups.values()) {
    const total = group.reduce((sum, item) => sum + item.size, 0);
    cards.push(el("div", { class: "offer" }, [
      el("div", { style: "display:flex;align-items:center;gap:8px;" }, [
        el("div", { style: "width:32px;height:32px;border-radius:50%;background:var(--ios-blue-light);color:var(--ios-blue);display:flex;align-items:center;justify-content:center;", html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>` }),
        el("b", { text: t("incoming_wants_send", group[0].senderName, group.length) }),
      ]),
      el("div", { class: "meta", text: group.map((item) => item.name).join("、") }),
      el("div", { class: "meta", style: "font-weight:600;color:var(--ios-text-primary);", text: t("total_size", formatBytes(total)) }),
      el("div", { class: "actions" }, [
        el("button", {
          type: "button",
          class: "btn-primary btn-accept-all",
          onclick: () => acceptGroup(group),
        }, [
          el("span", { html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:5px;"><polyline points="20 6 9 17 4 12"/></svg>` }),
          document.createTextNode(t("action_accept_all")),
        ]),
        el("button", {
          type: "button",
          class: "ghost warn",
          onclick: () => Promise.all(group.map((item) => postAction(item.id, "reject"))),
        }, [
          el("span", { html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:5px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>` }),
          document.createTextNode(t("action_reject_all")),
        ]),
      ]),
    ]));
  }
  root.replaceChildren.apply(root, cards);
}

function renderResumeBanner() {
  const banner = $("resume-banner");
  const pending = Array.from(state.transfers.values()).filter((transfer) => (
    transfer.senderId === state.me.id &&
    (transfer.status === "offered" || transfer.status === "uploading") &&
    !state.files.has(transfer.id)
  ));
  if (!pending.length) {
    banner.classList.add("hidden");
    banner.replaceChildren();
    return;
  }
  banner.classList.remove("hidden");
  banner.replaceChildren(
    el("div", { style: "display:flex;align-items:center;gap:8px;" }, [
      el("div", { html: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ios-amber)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>` }),
      el("strong", { text: t("resume_banner_title", pending.length) }),
    ]),
    el("p", { class: "meta", text: t("resume_banner_desc") }),
    el("button", { type: "button", onclick: () => $("resume-input").click() }, [document.createTextNode(t("action_repick_resume"))])
  );
}

async function postAction(id, action) {
  try {
    const data = await api("POST", "/api/transfers/" + id + "/" + action, { json: {} });
    if (action === "cancel") await clearLocal(id);
    upsert(data.transfer);
    renderTransfers();
    schedule();
  } catch (error) {
    toast(error.message);
  }
}

async function acceptOne(id) {
  if (typeof keepAwake !== "undefined") keepAwake.acquire();
  if (state.accepting.has(id)) return;
  state.accepting.add(id);
  try {
    const data = await api("POST", "/api/transfers/" + id + "/accept", { json: {} });
    upsert(data.transfer);
    schedule();
    renderTransfers();
  } catch (error) {
    state.accepting.delete(id);
    if (error.code !== "bad_state") toast(error.message);
  }
}

function acceptGroup(group) {
  return Promise.all(group.map((item) => acceptOne(item.id)));
}

function maybeAutoAccept(transfer) {
  if (!$("auto-accept").checked) return;
  if (!state.me || transfer.receiverId !== state.me.id || transfer.status !== "offered") return;
  acceptOne(transfer.id);
}

function pause(id) {
  state.paused.add(id);
  const job = state.running.get(id);
  if (job) job.controller.abort();
  renderTransfers();
}

function resume(id) {
  state.paused.delete(id);
  state.errors.delete(id);
  schedule();
  renderTransfers();
}

async function sendFiles(peerId, fileList) {
  if (typeof keepAwake !== "undefined") keepAwake.acquire();
  if (!peerId) {
    toast(t("toast_select_device_first"));
    return;
  }
  const incoming = Array.from(fileList);
  const fresh = [];
  for (const file of incoming) {
    const existing = Array.from(state.transfers.values()).find((transfer) => (
      transfer.senderId === state.me.id &&
      transfer.receiverId === peerId &&
      (transfer.status === "offered" || transfer.status === "uploading") &&
      transfer.name === file.name &&
      transfer.size === file.size &&
      !state.files.has(transfer.id)
    ));
    if (existing) {
      state.files.set(existing.id, file);
      state.errors.delete(existing.id);
      state.paused.delete(existing.id);
    } else {
      fresh.push(file);
    }
  }
  if (fresh.length) {
    const payload = fresh.map((file) => ({
      file: file,
      clientFileId: uuid(),
      name: file.name,
      size: file.size,
      mime: file.type || "application/octet-stream",
      lastModified: file.lastModified || 0,
    }));
    const data = await api("POST", "/api/transfers", {
      json: {
        receiverId: peerId,
        batchId: uuid(),
        files: payload.map((item) => ({
          clientFileId: item.clientFileId,
          name: item.name,
          size: item.size,
          mime: item.mime,
          lastModified: item.lastModified,
        })),
      },
    });
    for (const transfer of data.transfers) {
      const source = payload.find((item) => item.clientFileId === transfer.clientFileId);
      if (source) state.files.set(transfer.id, source.file);
      upsert(transfer);
    }
  }
  schedule();
  renderTransfers();
  toast(fresh.length ? t("toast_submitted_files", incoming.length) : t("toast_resumed_files"));
}

async function mapPool(items, limit, worker, signal) {
  let index = 0;
  let firstError = null;
  const count = Math.min(limit, items.length);
  async function run() {
    while (!signal.aborted && !firstError) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      try {
        await worker(items[current]);
      } catch (error) {
        if (!firstError) firstError = error;
      }
    }
  }
  await Promise.all(Array.from({ length: count }, () => run()));
  if (signal.aborted) throw new DOMException("已暂停", "AbortError");
  if (firstError) throw firstError;
}

async function withRetry(work, signal) {
  let last = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (signal.aborted) throw new DOMException("已暂停", "AbortError");
    try {
      return await work();
    } catch (error) {
      if (error.name === "AbortError" || signal.aborted) throw error;
      if (error.code === "bad_state" || error.code === "forbidden" || error.code === "not_found" || error.code === "not_ready") throw error;
      last = error;
      await sleep(350 * (attempt + 1));
    }
  }
  throw last || new Error("传输失败");
}

async function uploadJob(transferId, file, signal) {
  while (!signal.aborted) {
    const data = await api("GET", "/api/transfers/" + transferId, { signal: signal });
    upsert(data.transfer);
    const transfer = data.transfer;
    if (transfer.status === "ready") return;
    if (transfer.status !== "uploading") throw new Error(describe(transfer));
    const pieces = splitRanges(transfer.missing, transfer.chunkSize);
    if (!pieces.length) {
      await sleep(300);
      continue;
    }
    await mapPool(pieces, settings().chunks, async (piece) => {
      const start = piece[0];
      const end = piece[1];
      const result = await withRetry(() => api("PUT", "/api/transfers/" + transferId + "/chunks", {
        signal: signal,
        body: file.slice(start, end),
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Range": "bytes " + start + "-" + (end - 1) + "/" + file.size,
          "X-Chunk-Start": String(start),
          "X-Chunk-End": String(end),
        },
      }), signal);
      upsert(result.transfer);
      renderTransfers();
    }, signal);
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("lan-file-transfer", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("chunks")) request.result.createObjectStore("chunks");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbPut(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("chunks", "readwrite");
    tx.objectStore("chunks").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const request = db.transaction("chunks", "readonly").objectStore("chunks").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbKeys(db) {
  return new Promise((resolve, reject) => {
    const request = db.transaction("chunks", "readonly").objectStore("chunks").getAllKeys();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function idbDelete(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("chunks", "readwrite");
    tx.objectStore("chunks").delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function fetchRange(id, start, endInclusive, signal) {
  const response = await fetch("/api/transfers/" + id + "/file", {
    credentials: "same-origin",
    signal: signal,
    headers: { Range: "bytes=" + start + "-" + endInclusive },
  });
  if (!response.ok && response.status !== 206) throw new Error("下载分片失败");
  return response.arrayBuffer();
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function browserDownload(transfer) {
  const link = document.createElement("a");
  link.href = "/api/transfers/" + transfer.id + "/file";
  link.download = transfer.name;
  document.body.append(link);
  link.click();
  link.remove();
}

async function assembleIdb(db, transfer) {
  const keys = (await idbKeys(db))
    .filter((key) => String(key).indexOf(transfer.id + ":") === 0)
    .sort((a, b) => Number(String(a).split(":")[1]) - Number(String(b).split(":")[1]));
  const parts = [];
  let expect = 0;
  for (const key of keys) {
    const start = Number(String(key).split(":")[1]);
    if (start !== expect) break;
    const value = await idbGet(db, key);
    if (!value) break;
    parts.push(value);
    expect += value.byteLength;
  }
  if (expect !== transfer.size) throw new Error("本地缓存不完整，请点继续重新接收");
  return new Blob(parts, { type: transfer.mime || "application/octet-stream" });
}

// 接收缓存。localhost / https 用 OPFS；普通局域网 http 用 IndexedDB。特别大的文件交给浏览器下载。
async function createStore(transfer) {
  const big = transfer.size > 200 * 1024 * 1024;
  if (navigator.storage && navigator.storage.getDirectory) {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("incoming", { create: true });
      const handle = await dir.getFileHandle(transfer.id, { create: true });
      return {
        kind: "opfs",
        async ack() {
          const file = await handle.getFile();
          let saved = Number(localStorage.getItem(ackKey(transfer.id)) || 0);
          if (!Number.isFinite(saved) || saved < 0) saved = 0;
          return Math.min(saved, file.size);
        },
        async write(offset, bytes) {
          const current = await handle.getFile();
          const writable = await handle.createWritable({ keepExistingData: true });
          try {
            if (current.size !== offset && writable.truncate) await writable.truncate(offset);
            await writable.seek(offset);
            await writable.write(bytes);
            await writable.close();
          } catch (error) {
            try { await writable.abort(); } catch (ignore) { /* 丢弃未完成写入 */ }
            throw error;
          }
        },
        async save() {
          triggerDownload(await handle.getFile(), transfer.name);
        },
        async clear() {
          localStorage.removeItem(ackKey(transfer.id));
          try { await dir.removeEntry(transfer.id); } catch (error) { /* 可能已删除 */ }
        },
      };
    } catch (error) {
      // 用 IP 打开的 http 页面通常不能使用 OPFS。
    }
  }
  if (big) {
    return {
      kind: "browser",
      async ack() { return 0; },
      async write() {},
      async save() { browserDownload(transfer); },
      async clear() { localStorage.removeItem(ackKey(transfer.id)); },
    };
  }
  const db = await openDb();
  return {
    kind: "idb",
    async ack() {
      const saved = Number(localStorage.getItem(ackKey(transfer.id)) || 0);
      return Number.isFinite(saved) && saved > 0 ? saved : 0;
    },
    async write(offset, bytes) {
      await idbPut(db, transfer.id + ":" + offset, bytes);
    },
    async save() {
      triggerDownload(await assembleIdb(db, transfer), transfer.name);
    },
    async clear() {
      localStorage.removeItem(ackKey(transfer.id));
      const keys = await idbKeys(db);
      for (const key of keys) {
        if (String(key).indexOf(transfer.id + ":") === 0) await idbDelete(db, key);
      }
    },
  };
}

async function pullToStore(store, transfer, signal) {
  if (store.kind === "browser") {
    browserDownload(transfer);
    state.handed.add(transfer.id);
    return;
  }
  let ack = await store.ack();
  if (ack > transfer.size) ack = 0;
  state.localBytes.set(transfer.id, ack);
  if (ack === transfer.size) {
    state.cached.add(transfer.id);
    return;
  }
  const pieces = splitRanges([[ack, transfer.size]], transfer.chunkSize || 4 * 1024 * 1024);
  let cursor = 0;
  const inflight = new Map();
  const pump = () => {
    while (inflight.size < settings().chunks && cursor < pieces.length && !signal.aborted) {
      const index = cursor;
      cursor += 1;
      const piece = pieces[index];
      inflight.set(index, fetchRange(transfer.id, piece[0], piece[1] - 1, signal).then((buffer) => ({
        start: piece[0],
        end: piece[1],
        buffer: buffer,
      })));
    }
  };
  pump();
  for (let index = 0; index < pieces.length; index += 1) {
    const item = await inflight.get(index);
    inflight.delete(index);
    pump();
    if (item.buffer.byteLength !== item.end - item.start) throw new Error("下载到的分片长度不对");
    await store.write(item.start, item.buffer);
    localStorage.setItem(ackKey(transfer.id), String(item.end));
    state.localBytes.set(transfer.id, item.end);
    noteSpeed(transfer.id, item.end);
    renderTransfers();
  }
  state.cached.add(transfer.id);
}

const stores = new Map();
async function storeFor(transfer) {
  if (!stores.has(transfer.id)) stores.set(transfer.id, await createStore(transfer));
  return stores.get(transfer.id);
}

async function clearLocal(id) {
  state.cached.delete(id);
  state.saved.delete(id);
  state.handed.delete(id);
  state.localBytes.delete(id);
  state.files.delete(id);
  persistSaved();
  const store = stores.get(id);
  stores.delete(id);
  if (store) {
    try { await store.clear(); } catch (error) { /* 清理失败不影响取消 */ }
  } else {
    localStorage.removeItem(ackKey(id));
  }
}

async function saveTransfer(id) {
  const transfer = state.transfers.get(id);
  if (!transfer) return;
  try {
    const store = await storeFor(transfer);
    if (store.kind !== "browser" && !state.cached.has(id)) {
      await pullToStore(store, transfer, new AbortController().signal);
    }
    await store.save();
    if (store.kind === "browser") state.handed.add(id);
    else {
      state.saved.add(id);
      persistSaved();
    }
    renderTransfers();
  } catch (error) {
    if (error.name !== "AbortError") toast(error.message || "保存失败");
  }
}

function schedule() {
  const limit = settings().files;
  const uploads = Array.from(state.transfers.values()).filter((transfer) => (
    state.me &&
    transfer.senderId === state.me.id &&
    transfer.status === "uploading" &&
    state.files.has(transfer.id) &&
    !state.paused.has(transfer.id) &&
    !state.errors.has(transfer.id) &&
    !state.running.has(transfer.id)
  ));
  const downloads = Array.from(state.transfers.values()).filter((transfer) => (
    state.me &&
    transfer.receiverId === state.me.id &&
    transfer.status === "ready" &&
    !state.cached.has(transfer.id) &&
    !state.handed.has(transfer.id) &&
    !state.saved.has(transfer.id) &&
    !state.paused.has(transfer.id) &&
    !state.errors.has(transfer.id) &&
    !state.running.has(transfer.id)
  ));
  startSome("up", limit, uploads, async (transfer) => {
    const signal = state.running.get(transfer.id).controller.signal;
    await uploadJob(transfer.id, state.files.get(transfer.id), signal);
  });
  startSome("down", limit, downloads, async (transfer) => {
    const job = state.running.get(transfer.id);
    const store = await storeFor(transfer);
    await pullToStore(store, transfer, job.controller.signal);
    if (store.kind === "browser") return;
    try {
      await store.save();
      state.saved.add(transfer.id);
      persistSaved();
    } catch (error) {
      if (error.name === "AbortError") throw error;
    }
  });
}

function startSome(direction, limit, items, runner) {
  let active = 0;
  for (const job of state.running.values()) if (job.direction === direction) active += 1;
  const room = Math.max(0, limit - active);
  for (const transfer of items.slice(0, room)) {
    const controller = new AbortController();
    state.running.set(transfer.id, { direction: direction, controller: controller });
    Promise.resolve()
      .then(() => runner(transfer))
      .catch((error) => {
        if (error.name === "AbortError" || state.paused.has(transfer.id)) return;
        state.errors.set(transfer.id, t("toast_transfer_interrupted"));
        toast(transfer.name + ": " + (error.message || t("status_interrupted")));
      })
      .finally(() => {
        state.running.delete(transfer.id);
        renderTransfers();
        schedule();
      });
  }
}

function inferResumePeer(fileList) {
  for (const file of fileList) {
    const found = Array.from(state.transfers.values()).find((transfer) => (
      transfer.senderId === state.me.id &&
      transfer.name === file.name &&
      transfer.size === file.size &&
      (transfer.status === "offered" || transfer.status === "uploading")
    ));
    if (found) return found.receiverId;
  }
  return state.selectedId;
}

function installEvents() {
  $("refresh").addEventListener("click", () => {
    const icon = $("refresh").querySelector(".icon-refresh");
    if (icon) icon.style.transform = "rotate(360deg)";
    refresh()
      .then(() => toast(t("toast_refresh_devs")))
      .catch((error) => toast(error.message))
      .finally(() => {
        setTimeout(() => {
          if (icon) icon.style.transform = "";
        }, 500);
      });
  });

  const clearFinishedBtn = $("clear-finished");
  if (clearFinishedBtn) {
    clearFinishedBtn.addEventListener("click", () => {
      const finished = Array.from(state.transfers.values()).filter((t) => 
        t.status === "ready" || t.status === "cancelled" || t.status === "rejected" || t.status === "expired"
      );
      if (!finished.length) return;
      for (const t of finished) {
        clearTransfer(t.id);
      }
      toast(t("toast_cleared_finished"));
    });
  }

  $("pick").addEventListener("click", () => {
    const availablePeers = state.peers.filter((p) => !state.me || p.id !== state.me.id);
    if (!state.selectedId && availablePeers.length === 1) {
      selectPeer(availablePeers[0]);
    }
    $("file-input").click();
  });

  $("file-input").addEventListener("change", () => {
    const files = $("file-input").files;
    if (!files || !files.length) return;

    const availablePeers = state.peers.filter((p) => !state.me || p.id !== state.me.id);
    let targetId = state.selectedId;

    if (!targetId && availablePeers.length === 1) {
      selectPeer(availablePeers[0]);
      targetId = availablePeers[0].id;
    }

    if (targetId) {
      sendFiles(targetId, files).catch((error) => toast(error.message));
    } else if (availablePeers.length > 1) {
      state.pendingFiles = Array.from(files);
      toast(t("toast_files_picked_select_dev", files.length));
      const devRoot = $("devices");
      if (devRoot) {
        devRoot.style.transition = "box-shadow 0.3s ease";
        devRoot.style.boxShadow = "0 0 0 3px var(--ios-blue)";
        setTimeout(() => { if (devRoot) devRoot.style.boxShadow = ""; }, 2000);
      }
    } else {
      toast(t("toast_no_online_devices"));
    }
    $("file-input").value = "";
  });

  $("resume-input").addEventListener("change", () => {
    const files = $("resume-input").files;
    if (files && files.length) sendFiles(inferResumePeer(files), files).catch((error) => toast(error.message));
    $("resume-input").value = "";
  });

  $("device-name").addEventListener("change", () => {
    api("PATCH", "/api/session", { json: { name: $("device-name").value } })
      .then((data) => {
        state.me = data.device;
        localStorage.setItem("lft-device-name", state.me.name);
        $("device-name").value = state.me.name;
        renderStatus();
        toast(t("toast_dev_name_updated"));
      })
      .catch((error) => toast(error.message));
  });

  $("auto-accept").checked = localStorage.getItem("lft-auto-accept") === "1";
  $("auto-accept").addEventListener("change", () => {
    localStorage.setItem("lft-auto-accept", $("auto-accept").checked ? "1" : "0");
    for (const transfer of state.transfers.values()) maybeAutoAccept(transfer);
    toast($("auto-accept").checked ? t("toast_auto_accept_on") : t("toast_auto_accept_off"));
  });

  $("parallel-files").value = localStorage.getItem("lft-parallel-files") || "3";
  $("parallel-chunks").value = localStorage.getItem("lft-parallel-chunks") || "3";
  $("parallel-files").addEventListener("change", () => {
    $("parallel-files").value = String(settings().files);
    localStorage.setItem("lft-parallel-files", $("parallel-files").value);
    schedule();
  });
  $("parallel-chunks").addEventListener("change", () => {
    $("parallel-chunks").value = String(settings().chunks);
    localStorage.setItem("lft-parallel-chunks", $("parallel-chunks").value);
  });

  const drop = $("drop");
  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("hot");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("hot"));
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("hot");
    if (event.dataTransfer.files.length) sendFiles(state.selectedId, event.dataTransfer.files).catch((error) => toast(error.message));
  });

  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", (event) => event.preventDefault());
  window.addEventListener("beforeunload", (event) => {
    const active = Array.from(state.transfers.values()).some((transfer) => transfer.status === "offered" || transfer.status === "uploading" || state.running.has(transfer.id));
    if (!active) return;
    event.preventDefault();
    event.returnValue = "";
  });

  // Language Switcher Dropdown
  const langToggle = $("lang-toggle");
  const langMenu = $("lang-menu");
  if (langToggle && langMenu) {
    const setMenuOpen = (open) => {
      const willOpen = typeof open === "boolean" ? open : langMenu.classList.contains("hidden");
      if (willOpen) {
        langMenu.classList.remove("hidden");
        langToggle.classList.add("open");
        langToggle.setAttribute("aria-expanded", "true");
      } else {
        langMenu.classList.add("hidden");
        langToggle.classList.remove("open");
        langToggle.setAttribute("aria-expanded", "false");
      }
    };

    langToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      setMenuOpen();
    });

    langMenu.querySelectorAll(".lang-menu-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetLang = item.getAttribute("data-lang");
        if (targetLang) {
          setLanguage(targetLang);
        }
        setMenuOpen(false);
      });
    });

    document.addEventListener("click", (e) => {
      if (!langMenu.classList.contains("hidden")) {
        const wrap = langToggle.closest(".lang-dropdown-wrap");
        if (wrap && !wrap.contains(e.target)) {
          setMenuOpen(false);
        }
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !langMenu.classList.contains("hidden")) {
        setMenuOpen(false);
      }
    });
  }

  // Screen Keep-Awake Toggle
  const wakeToggle = $("wakelock-toggle");
  if (wakeToggle) {
    wakeToggle.addEventListener("click", () => keepAwake.toggle());
  }

  // QR Modal Events
  const modal = $("qr-modal");
  const closeBtn = $("qr-close");
  if (closeBtn) closeBtn.addEventListener("click", closeQrModal);
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeQrModal();
    });
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeQrModal();
  });
}

async function boot() {
  initTheme();
  keepAwake.init();
  setLanguage(state.lang);
  installEvents();
  const savedId = localStorage.getItem("lft-device-id") || "";
  let savedName = localStorage.getItem("lft-device-name") || "";
  const oldDefaults = new Set([
    "iPhone", "iPad", "Android 手机", "Mac 电脑", "Windows 电脑", "Linux 主机", "浏览器设备", "设备", "新设备",
    "Android Phone", "Mac", "Windows PC", "Linux Host", "Browser Device"
  ]);
  if (!savedName || oldDefaults.has(savedName)) {
    savedName = guessName();
  }
  const session = await api("POST", "/api/session", { json: { deviceId: savedId, name: savedName } });
  state.me = session.device;
  localStorage.setItem("lft-device-id", state.me.id);
  localStorage.setItem("lft-device-name", state.me.name);
  $("device-name").value = state.me.name;
  renderStatus();
  connectWs();
  await refresh();
  setInterval(() => {
    refresh().catch(() => renderStatus());
  }, 2500);
}

boot().catch((error) => {
  console.error(error);
  toast(error.message || t("toast_cannot_connect"));
});