## 🍎 macOS 修复 · macOS fixes

- 修复：从迷你播放切回主窗口后，主窗口的阴影会消失
  Fix: returning from the mini player left the main window with no shadow
- 修复：菜单栏图标显示成一整块实心方块，现在会随浅色/深色模式自动反色，并与旁边的系统图标一致
  Fix: the menu-bar icon rendered as a solid block; it is now a template image that inverts with light/dark mode and matches the system icons beside it

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

**Full Changelog**: https://github.com/aeroray/Museek/compare/v3.11.1...v3.11.2
