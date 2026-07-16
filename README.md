<div align="center">

![Museek · 拾音 — desktop music aggregator / 跨平台桌面音乐聚合](./assets/readme/hero.svg)

</div>

<h1 align="center">Museek · 拾音</h1>

<p align="center">
  <em>Every melody, one search. · 万千旋律，一拾即得。</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=white" alt="Tauri 2">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5">
  <img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white" alt="Vite 7">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License">
</p>

**Museek** is a cross-platform desktop music aggregator: search, charts, playlists, synced lyrics, and downloads across **NetEase · KuWo · KuGou · QQ Music · Migu** — in one app.

**拾音**是跨平台桌面音乐聚合应用：搜索、排行榜、歌单、同步歌词与下载，覆盖网易云 / 酷我 / 酷狗 / QQ 音乐 / 咪咕。

> [!IMPORTANT]
> Museek ships **no** music sources or content. Playback links come from **your** lx-music–compatible source scripts; search / charts / playlists use public platform APIs. See [Disclaimer](#disclaimer).
>
> 拾音**不提供**任何音乐源或内容。播放链接来自**你导入的**兼容 lx-music 音源脚本；搜索 / 排行榜 / 歌单调用各平台公开 API。详见[免责声明](#disclaimer)。

---

## Proof · 界面

<div align="center">

![Browse hot playlists across platforms · 浏览各平台热门歌单](./docs/screenshots/02-playlists.webp)

</div>

| ![Multi-platform search · 多平台搜索](./docs/screenshots/01-search.webp) | ![Playlist detail · 歌单详情](./docs/screenshots/03-playlist-detail.webp) | ![Platform charts · 排行榜](./docs/screenshots/04-charts.webp) |
| :---: | :---: | :---: |
| Search · 搜索 | Playlist · 歌单 | Charts · 排行榜 |

---

<div align="center">

![What you can do · 功能一览](./assets/readme/section-features.svg)

</div>

| | English | 中文 |
| --- | --- | --- |
| **Discover · 发现** | Search songs, playlists, and users across five platforms; browse charts and hot playlists; trending word cloud on empty search. | 五平台搜索单曲 / 歌单 / 用户；排行榜与热门歌单；空搜索页热词云。 |
| **Sources · 音源** | Import lx-music scripts by URL (paste several at once). Multi-source failover; skips short VIP trial clips. | 链接导入音源（可一次粘贴多条）。多源失败转移；跳过 VIP 试听提示音。 |
| **Player · 播放器** | Queue, shuffle / repeat, quality auto-downgrade, immersive synced lyrics, Windows SMTC / macOS Now Playing, keyboard shortcuts. | 队列与循环模式、音质自动降级、沉浸歌词、系统媒体控制、键盘快捷键。 |
| **Library · 收藏库** | Favorite songs & whole playlists; batch download; disk cache for audio / lyrics / covers. | 收藏单曲与歌单；批量下载；音频 / 歌词 / 封面本地缓存。 |
| **Desktop · 桌面** | Light / dark / system themes, EN / 简体中文, tray close behavior, prevent-sleep while playing, encrypted cloud-folder sync. | 主题与中英界面、托盘关闭、播放防休眠、网盘文件夹加密同步。 |

---

<div align="center">

![How Museek works · 工作原理：公开 API 发现，音源脚本播放](./assets/readme/workflow.svg)

</div>

Search / charts / playlists hit public web APIs through Tauri’s HTTP plugin. Playback URLs come from lx-music–compatible scripts running behind `globalThis.lx` — Museek only handles `musicUrl` / `lyric` / `pic`.

搜索 / 排行榜 / 歌单经 Tauri HTTP 调用公开 Web API。播放链接由兼容 lx-music 的音源脚本解析（`globalThis.lx`）—— 拾音只处理 `musicUrl` / `lyric` / `pic`。

---

<div align="center">

![Get started · 快速开始](./assets/readme/section-start.svg)

</div>

### Prerequisites · 环境

- [Node.js](https://nodejs.org/) 18+ and [pnpm](https://pnpm.io/)<br>[Node.js](https://nodejs.org/) 18+ 与 [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install) stable<br>[Rust](https://www.rust-lang.org/tools/install) 工具链（stable）
- Tauri 2 [system prerequisites](https://tauri.app/start/prerequisites/) (Windows: WebView2 + MSVC)<br>Tauri 2 的[系统依赖](https://tauri.app/start/prerequisites/)（Windows 需 WebView2 + MSVC）

### Develop · 开发

```bash
pnpm install
pnpm tauri dev
```

### Build · 打包

```bash
pnpm tauri build
```

Installers land in `src-tauri/target/release/bundle/` (Windows: `.msi` + NSIS `setup.exe`).  
打包产物位于 `src-tauri/target/release/bundle/`（Windows 下为 `.msi` 与 NSIS 的 `setup.exe`）。

### First play · 第一次播放

1. **Settings → Sources** — paste lx-music–compatible `.js` URL(s), import, enable several for failover.  
   **设置 → 音源管理** — 粘贴音源链接并导入，开启多个可自动失败转移。
2. Search, or open **Charts** / **Playlists**.  
   搜索，或打开**排行榜** / **歌单**。
3. Play, favorite, open lyrics, download at your preferred quality.  
   播放、收藏、看歌词、按首选音质下载。
4. Optional: **Settings → Data** — JSON export/import, or a cloud-synced folder for encrypted multi-device sync.  
   可选：**设置 → 数据** — JSON 导入导出，或指定网盘同步文件夹。

---

## WeChat · 公众号

Scan to follow — send **音源** for source links and updates.  
扫码关注，发送「音源」获取音源链接与更新。

<div align="center">

![WeChat official account QR · 微信公众号二维码](./public/gzh/qrcode.webp)

</div>

---

## Tech · 技术栈

- **[Tauri 2](https://tauri.app/)** (Rust) — native shell, plugins, OS media controls<br>**[Tauri 2](https://tauri.app/)**（Rust）—— 轻量原生外壳与插件，以及系统媒体控制
- **[React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)**
- **[Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)** · **[Zustand](https://zustand-demo.pmnd.rs/)** · React Router<br>**[Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)** · **[Zustand](https://zustand-demo.pmnd.rs/)** · React Router 构建界面与状态
- Crypto helpers (`js-md5`, `aes-js`, `node-forge`, `pako`) for encrypted lyric / source formats<br>加密相关：`js-md5`、`aes-js`、`node-forge`、`pako`，用于加密歌词 / 音源格式

---

## <a id="disclaimer"></a>Disclaimer · 免责声明

This project is for **personal study and research only**. Museek does not provide, host, or distribute music; it aggregates public APIs and plays links from source scripts **you** supply. Do not use it commercially. Respect each platform’s terms and copyrights. Consequences of use are the user’s responsibility.

本项目**仅供个人学习与研究**。拾音不提供、不存储、不分发音乐；只聚合公开 API，并播放**你自己**导入的音源脚本返回的链接。请勿商用，并遵守各平台条款与版权。使用后果由使用者自行承担。

## License · 许可

Released under the [MIT License](LICENSE).  
基于 [MIT License](LICENSE) 发布。
