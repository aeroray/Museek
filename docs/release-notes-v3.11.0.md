## 🎧 Last.fm

- 新增 Last.fm 集成：可以把收听记录同步到你的 Last.fm 账号
  New Last.fm integration: sync your listening history to your Last.fm account
- 在「设置 → Last.fm」填入 API Key 与 Secret，再点「连接账号」在浏览器里授权即可
  Add your API Key and Secret under Settings → Last.fm, then press Connect account to authorize in your browser
- 「足迹」页新增 Last.fm 标签，可查看常听歌手、常听歌曲和最近记录，点击任意一条会在浏览器打开对应的 Last.fm 页面
  A new Last.fm tab on the History page shows top artists, top tracks and recent plays; clicking a row opens that page on Last.fm
- 支持切换全部时间 / 近 7 天 / 近 1 个月 / 近 3 个月 / 近 12 个月
  Switch between All time / 7 days / 1 month / 3 months / 12 months
- 可以分别关闭「记录播放」和「正在播放」；断网或 Last.fm 不可用时，记录会先排队，恢复后自动补传
  Scrobbling and Now Playing can be toggled separately; if the network or Last.fm is unavailable, plays are queued and sent once it recovers
- 每次启动后第一次进入 Last.fm 标签会自动刷新一次，加载时显示占位骨架
  The Last.fm tab refreshes once after each launch, with a loading placeholder while it does

## 📌 记录准确性 · Accuracy

- 修复：本地音乐只有匹配到在线歌曲后，才会以正确的歌手和歌名上报（之前文件名模式下会上报成「01 - 歌名」）
  Fix: local music is reported under its real artist and title once matched online (filename mode used to send "01 - Title")
- 修复：没有标签的本地文件不再以「未知歌曲 / 未知歌手」上报（这类记录会在 Last.fm 上堆成同一条垃圾记录）
  Fix: untagged local files are no longer reported as "Unknown title / Unknown artist" (they all collapsed into one junk entry on Last.fm)
- 修复：正在播放状态现在会带上歌曲时长
  Fix: the Now Playing status now includes the track duration
- 修复：一首歌播完后再播同一首，会重新上报正在播放（之前会被静默忽略，Last.fm 上一直挂着上一首）
  Fix: replaying the same song after it finished announces it again (it used to be silently skipped, leaving the previous track stuck on your profile)

## ✨ 界面 · Interface

- 播放栏和歌词页里过长的歌名、歌手名，鼠标悬停时会横向滚动显示完整内容
  Long song and artist names scroll horizontally on hover in the player bar and the lyrics page
- 「足迹」页的 Last.fm 标签与「歌曲 / 歌手 / 最近」保持一致的排版与筛选栏
  The Last.fm tab now matches the layout and filter bar of Songs / Artists / Recent
- 修复：设置侧栏的文字与图标没有垂直居中
  Fix: the settings sidebar labels and icons were not vertically centred
- 修复：「重新连接」按钮看起来比旁边的按钮大（实际尺寸相同，已统一视觉重量）
  Fix: the Reconnect button looked larger than the button beside it (same size; their visual weight is now matched)

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

**Full Changelog**: https://github.com/aeroray/Museek/compare/v3.10.1...v3.11.0
