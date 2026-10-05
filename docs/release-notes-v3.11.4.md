## 📝 歌词 · Lyrics

- 修复：部分歌手的歌曲在其他平台搜不到歌词（例如 QQ 音乐的日语歌切到网易云/酷狗时显示无歌词）
  Fix: lyrics could not be found on other platforms for some artists (a Japanese song on QQ Music showed no lyrics when switching to NetEase/KuGou)
- 原因是同一个歌手在不同平台的名字不一样（QQ 音乐叫「爱缪」，网易云叫「あいみょん」），现在会先确认平台上的写法再匹配
  The same artist is named differently per platform (爱缪 on QQ Music, あいみょん on NetEase); the platform's own spelling is now resolved before matching

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

**Full Changelog**: https://github.com/aeroray/Museek/compare/v3.11.3...v3.11.4
