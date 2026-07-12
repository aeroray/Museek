<a id="english"></a>

<div align="center">

<img src="./app-icon.svg" width="120" height="120" alt="Museek logo" />

# Museek · 拾音

**A cross-platform desktop music aggregator — search, charts, playlists, synced lyrics, and downloads across multiple providers, all in one elegant app.**

_Every melody, one search._

![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

**English** | [简体中文](#简体中文)

</div>

---

> [!IMPORTANT]
> Museek ships **no** music sources or content of its own. It is a player/aggregator UI: playback links come from **user-provided, lx-music–compatible source scripts**, while search / charts / playlists query public platform APIs. See the [Disclaimer](#disclaimer).

## ✨ Features

- 🔍 **Multi-platform search** — find **songs, playlists, and users** across NetEase, KuWo, KuGou, QQ Music, and Migu. Search a username to open their public playlists (e.g. your own NetEase "我喜欢的音乐"), with full search history — plus a **per-platform trending word cloud** on the empty search page.
- 📊 **Charts** — browse the top / ranking lists of every supported platform.
- 🎶 **Playlists** — explore each platform's hot playlists, open them as full track lists (with in-list search), and favorite whole playlists.
- 🧩 **lx-music–compatible sources** — import source scripts by URL (paste **several at once, one per line**); multiple enabled sources are tried in order (failover) until one returns a playable link. Museek also **detects and skips the short "this song is VIP" trial clips** some sources return, so it keeps trying the next source instead of silently "succeeding".
- 🎧 **Full player** — play queue, sequential / shuffle / repeat-all / repeat-one modes, volume, and a persistent player bar with platform & quality tags.
- ⌨️ **Keyboard shortcuts** — Space (play / pause), ← / → (seek ±5s), Ctrl/⌘ + ← / → (previous / next), ↑ / ↓ (volume), M (mute), L (lyrics) — always on, and ignored while typing in a text field.
- 🪟 **OS media controls** — control playback from the **Windows** taskbar thumbnail buttons & system media (SMTC) flyout, or **macOS** Now Playing / media keys.
- 🔁 **Search on another platform** — one click sends the now-playing track to another platform's search, pre-filled and ready — handy when a song is VIP-locked on its origin.
- 📝 **Built-in lyrics** for all five platforms (including encrypted formats), in an immersive view with a blurred-cover backdrop, synced auto-scroll, click-to-seek, adjustable font size, and translations when available.
- ❤️ **Favorites** — collect **songs and whole playlists**; sort (date / name), filter by platform, instant search, batch download / delete, and "play all".
- ⬇️ **Downloads** — pick a quality, choose where files are saved (**per-device** — you're prompted on first download), pick a file-naming scheme, control concurrency (1–5), and open the folder when done.
- 🎚️ **Preferred quality + auto-downgrade** — set a target quality for playback and downloads; if it's unavailable, Museek steps down automatically and tells you.
- 💾 **Disk cache** — audio, lyrics, and cover images are cached for faster replays and offline playback, with a configurable size cap, LRU auto-eviction, and one-click clearing.
- 🎨 **Theming & i18n** — light / dark / system modes, several accent palettes, and a full **English / 简体中文** interface that follows your system by default.
- 🖥️ **Desktop integration** — a frameless window with a custom title bar merged into the content; optionally keep the system awake while music plays (the screen can still sleep / lock); choose whether the window close button **quits** or **minimizes to a system tray**; and check for updates from the About page.
- 🔄 **Config sync** — export / import everything (settings, sources, favorites, history, appearance) as one JSON file, **or** point Museek at a cloud-synced folder (Baidu Netdisk / OneDrive / iCloud Drive…) for **automatic, encrypted, zero-login sync** — it pulls a newer config on launch and backs up on quit.

## 📸 Screenshots

<p align="center">
  <img src="./docs/screenshots/02-playlists.webp" width="820" alt="Browse hot playlists across platforms" />
</p>

<table>
  <tr>
    <td width="33%" valign="top"><img src="./docs/screenshots/01-search.webp" alt="Multi-platform search" /></td>
    <td width="33%" valign="top"><img src="./docs/screenshots/03-playlist-detail.webp" alt="Playlist detail with quality badges" /></td>
    <td width="33%" valign="top"><img src="./docs/screenshots/04-charts.webp" alt="Platform charts" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Multi-platform search</sub></td>
    <td align="center"><sub>Playlist detail</sub></td>
    <td align="center"><sub>Charts</sub></td>
  </tr>
</table>

## 🏗️ Tech Stack

- **[Tauri 2](https://tauri.app/)** (Rust) — tiny, secure native shell + plugins (http, fs, dialog, shell, opener, clipboard) and native OS media controls (taskbar / SMTC).
- **[React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)**
- **[Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)** (Radix primitives) for the UI.
- **[Zustand](https://zustand-demo.pmnd.rs/)** for state, **React Router** for navigation.
- Crypto helpers (`js-md5`, `aes-js`, `node-forge`, `pako`) to support encrypted lyric/source formats.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ and [pnpm](https://pnpm.io/)
- The [Rust](https://www.rust-lang.org/tools/install) toolchain (stable)
- Tauri 2 [system prerequisites](https://tauri.app/start/prerequisites/) (on Windows: WebView2 + the MSVC build tools)

### Develop

```bash
pnpm install
pnpm tauri dev
```

### Build installers

```bash
pnpm tauri build
```

The packaged app and installers are written to `src-tauri/target/release/bundle/` (on Windows: an `.msi` and an NSIS `setup.exe`).

## 🎧 Usage

1. **Add a source.** Open **Settings → Sources**, paste the URL of an lx-music–compatible source script (`.js`), and import it. Enable several to get automatic failover.
2. **Discover.** Search, or browse **Charts** and **Playlists**.
3. **Play & collect.** Play tracks, build a queue, favorite songs, view synced lyrics, and download in your preferred quality.
4. **Sync.** In **Settings → Data**, export / import a JSON file — or pick a cloud-synced folder for automatic, encrypted sync across your devices.

## 🧠 How it works

Search, charts, and playlists call the platforms' public web APIs directly from the renderer (routed through Tauri's HTTP plugin to bypass CORS). Playback URLs are resolved by running **lx-music–compatible source scripts** in the renderer behind a `globalThis.lx` compatibility layer — Museek only handles the `musicUrl` / `lyric` / `pic` actions. Read-only requests are cached/throttled to be gentle on the upstream services.

## <a id="disclaimer"></a>⚠️ Disclaimer

This project is for **personal study and research only**. Museek does not provide, host, or distribute any music; it is a UI that aggregates publicly available platform APIs and plays links produced by source scripts that **you** supply. Do not use it for any commercial purpose, and respect the terms of service and copyrights of each platform. Any consequences of use are the user's own responsibility.

## 📄 License

Released under the [MIT License](LICENSE).

---
---

<a id="简体中文"></a>

<div align="center">

<img src="./app-icon.svg" width="120" height="120" alt="Museek logo" />

# Museek · 拾音

**桌面端多平台音乐聚合软件 —— 搜索、排行榜、歌单、同步歌词与下载,多家平台一站搞定。**

_万千旋律,一拾即得。_

![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

[English](#english) | **简体中文**

</div>

---

> [!IMPORTANT]
> 拾音本身**不提供**任何音乐源或内容。它是一个播放器 / 聚合界面:播放链接来自**用户自行导入的、兼容 lx-music 的音源脚本**,搜索 / 排行榜 / 歌单则调用各平台的公开 API。详见[免责声明](#免责声明)。

## ✨ 功能特性

- 🔍 **多平台搜索** —— 搜索**单曲、歌单与用户**,覆盖网易云、酷我、酷狗、QQ音乐、咪咕。可输入用户名打开 TA 的公开歌单(例如你自己的网易云「我喜欢的音乐」),并保留搜索历史;空搜索页还会展示**各平台的热门搜索词云**。
- 📊 **排行榜** —— 浏览各平台的榜单。
- 🎶 **歌单** —— 浏览各平台热门歌单、展开为完整歌曲列表(支持列表内搜索),并可收藏整个歌单。
- 🧩 **兼容 lx-music 音源** —— 通过链接导入音源脚本(可**一次粘贴多个、每行一个**);开启多个时按顺序依次重试(失败转移),直到取到可播放链接。拾音还会**识别并跳过部分音源返回的几秒「VIP 试听」提示音**,自动继续尝试下一个音源,而不是把它当成「成功」。
- 🎧 **完整播放器** —— 播放队列,顺序 / 随机 / 列表循环 / 单曲循环,音量,常驻播放栏(含平台与音质标签)。
- ⌨️ **键盘快捷键** —— 空格(播放 / 暂停)、← / →(快退 / 快进 5 秒)、Ctrl/⌘ + ← / →(上一首 / 下一首)、↑ / ↓(音量)、M(静音)、L(歌词);始终生效,在输入框中输入时自动忽略。
- 🪟 **系统媒体控制** —— 可通过 **Windows** 任务栏缩略图按钮与系统媒体浮窗(SMTC),或 **macOS** 的「正在播放」/ 媒体键控制播放。
- 🔁 **在其他平台搜索** —— 一键把当前播放的歌曲发送到其他平台搜索(自动填好并搜索)—— 当歌曲在原平台为 VIP 时尤其方便。
- 📝 **内置歌词**,覆盖全部五个平台(含加密格式),沉浸式歌词页(高度模糊封面作背景),支持同步滚动、点击跳转、字号调节,有翻译时一并显示。
- ❤️ **收藏** —— 可收藏**单曲与整个歌单**;按时间 / 名称排序、按平台筛选、即时搜索、批量下载 / 删除、一键播放全部。
- ⬇️ **下载** —— 选择音质、选择保存目录(**按设备保存**,首次下载会提示设置)、文件命名方式、并发数(1–5),完成后可一键打开目录。
- 🎚️ **首选音质 + 自动降级** —— 为播放和下载设定目标音质;不可用时自动逐级降级并提示。
- 💾 **本地缓存** —— 音频、歌词与封面图缓存,再次播放更快、可离线;可设上限、按最近最少使用自动清理,也可一键清空。
- 🎨 **主题与多语言** —— 亮 / 暗 / 跟随系统,多套主题配色,完整的**简体中文 / English**界面(默认跟随系统)。
- 🖥️ **桌面集成** —— 无边框窗口、标题栏与内容融为一体;可选「播放时阻止系统休眠」(仍允许息屏 / 锁屏);关闭按钮可设为**直接退出**或**最小化到系统托盘**;并可在「关于」页检查更新。
- 🔄 **配置同步** —— 把所有设置、音源、收藏、历史、外观导出 / 导入为一个 JSON 文件;**或**指定一个被网盘客户端(百度网盘 / OneDrive / iCloud 云盘等)同步的文件夹,实现**自动、加密、免登录**的多设备同步 —— 打开时拉取较新配置,退出时自动备份。

## 📸 截图

<p align="center">
  <img src="./docs/screenshots/02-playlists.webp" width="820" alt="浏览各平台热门歌单" />
</p>

<table>
  <tr>
    <td width="33%" valign="top"><img src="./docs/screenshots/01-search.webp" alt="多平台搜索" /></td>
    <td width="33%" valign="top"><img src="./docs/screenshots/03-playlist-detail.webp" alt="歌单详情" /></td>
    <td width="33%" valign="top"><img src="./docs/screenshots/04-charts.webp" alt="排行榜" /></td>
  </tr>
  <tr>
    <td align="center"><sub>多平台搜索</sub></td>
    <td align="center"><sub>歌单详情</sub></td>
    <td align="center"><sub>排行榜</sub></td>
  </tr>
</table>

## 🏗️ 技术栈

- **[Tauri 2](https://tauri.app/)**(Rust)—— 轻量、安全的原生外壳与插件(http、fs、dialog、shell、opener、clipboard),以及系统媒体控制(任务栏 / SMTC)。
- **[React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)**
- **[Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)**(基于 Radix)构建界面。
- **[Zustand](https://zustand-demo.pmnd.rs/)** 管理状态,**React Router** 负责路由。
- 加密相关:`js-md5`、`aes-js`、`node-forge`、`pako`,用于支持加密的歌词/音源格式。

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) 18+ 与 [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install) 工具链(stable)
- Tauri 2 的[系统依赖](https://tauri.app/start/prerequisites/)(Windows 需 WebView2 + MSVC 构建工具)

### 开发

```bash
pnpm install
pnpm tauri dev
```

### 打包安装包

```bash
pnpm tauri build
```

打包产物位于 `src-tauri/target/release/bundle/`(Windows 下为 `.msi` 与 NSIS 的 `setup.exe`)。

## 🎧 使用

1. **导入音源。** 打开 **设置 → 音源管理**,粘贴一个兼容 lx-music 的音源脚本链接(`.js`)并导入。开启多个即可自动失败转移。
2. **发现音乐。** 搜索,或浏览**排行榜**与**歌单**。
3. **播放与收藏。** 播放歌曲、构建队列、收藏、查看同步歌词、按首选音质下载。
4. **同步。** 在 **设置 → 数据** 导出 / 导入 JSON 文件,或指定一个被网盘同步的文件夹,实现多设备自动加密同步。

## 🧠 工作原理

搜索、排行榜、歌单直接在前端调用各平台的公开 Web API(经 Tauri HTTP 插件绕过 CORS)。播放链接则通过在前端运行**兼容 lx-music 的音源脚本**取得(注入 `globalThis.lx` 兼容层)—— 拾音只处理 `musicUrl` / `lyric` / `pic` 三类动作。只读请求会做缓存 / 限流,尽量减少对上游服务的压力。

## <a id="免责声明"></a>⚠️ 免责声明

本项目**仅供个人学习与研究使用**。拾音不提供、不存储、不分发任何音乐内容;它只是一个聚合公开平台 API、并播放由**你自己**导入的音源脚本所返回链接的界面。请勿用于任何商业用途,并遵守各平台的服务条款与版权规定。使用所产生的一切后果由使用者自行承担。

## 📄 许可

基于 [MIT License](LICENSE) 发布。
