## 🍎 macOS 修复 · macOS fixes

- 修复：主窗口的阴影有时会消失（启动后、以及从迷你播放切回主窗口时），现在会稳定显示
  Fix: the main window's shadow could disappear — at launch, and when returning from the mini player; it is now reliable

## 🎤 桌面歌词 · Desktop lyrics

- 修复：未锁定时悬停歌词，有时不显示「抓手」光标
  Fix: hovering the lyrics while unlocked sometimes showed no grab cursor
- 修复：拖动歌词时光标会变成普通箭头，现在全程保持「抓紧」的手型
  Fix: dragging the lyrics turned the cursor into the default arrow; the closed hand is now kept for the whole drag

---

## Download · 下载

- **Windows**: `*_x64-setup.exe` (NSIS; installer UI follows system language: Chinese / English)  
  **Windows**：`*_x64-setup.exe`（NSIS；安装界面随系统语言自动中/英文）
- **macOS (Apple Silicon)**: `*_aarch64.dmg` (first install) / in-app update uses `.app.tar.gz`  
  **macOS（Apple Silicon）**：首次安装用 `*_aarch64.dmg`；应用内更新使用 `.app.tar.gz`

Already installed? Use **Settings → About → Install update** (this Release must include `latest.json` and `.sig`).  
已安装用户可在「设置 → 关于 → 安装更新」升级（需本 Release 含 `latest.json` 与 `.sig`）。

⚠️ Museek ships **no** music sources. Import lx-music–compatible scripts under **Settings → Sources** before playing.  
⚠️ Museek **不内置**音源；请先在「设置 → 音源管理」导入兼容 lx-music 的音源脚本。

**macOS "app is damaged"?** Drag Museek.app into Applications, then run:  
**macOS 提示「已损坏」？** 把 App 拖入「应用程序」后执行：  
`/usr/bin/xattr -rd com.apple.quarantine /Applications/Museek.app`

**Full Changelog**: https://github.com/aeroray/Museek/compare/v3.11.2...v3.11.3
