## 🎧 Last.fm 喜欢 · Loves

- 「收藏」页新增 Last.fm 标签，可以看到你在 Last.fm 上喜欢的全部歌曲（包括在网页版或手机 App 里喜欢的）
  The Favorites page gains a Last.fm tab showing every track you have loved on Last.fm, including ones loved on the website or in the app
- 支持搜索歌名或歌手，也可以按最近喜欢 / 歌名 / 歌手排序
  Search by title or artist, and sort by recently loved / title / artist
- 可以「播放全部」，把整个列表加入播放队列
  Play all queues the whole list
- 在「收藏」页收藏或取消收藏歌曲时，会同步更新 Last.fm 上的「喜欢」；可以在「设置 → Last.fm」里关闭
  Favouriting or un-favouriting a song on the Favorites page also loves or un-loves it on Last.fm; turn this off under Settings → Last.fm

## 🐛 播放修复 · Playback fixes

- 修复：播放某些平台的歌曲时，有时会播出另一首歌（歌曲不再被交给不支持该平台的音源脚本）
  Fix: playing a song from some platforms could play a different song (a song is no longer handed to a source script that does not serve its platform)
- 修复：Last.fm 喜欢列表里的歌曲点击播放会提示「找不到」
  Fix: playing a track from the Last.fm loved list reported "not found"
- 修复：Last.fm 的歌手名和平台写法不同（Aimyon / あいみょん / 爱缪），现在会先向平台询问它自己的写法再匹配
  Fix: Last.fm spells artists differently from the platforms (Aimyon / あいみょん / 爱缪); the platform's own spelling is now asked for before matching
- 修复：Last.fm 只记录第一个歌手，而平台会列出全部合作者（元 / 元、鱼骨妹），现在会逐个比对
  Fix: Last.fm stores only the first artist while platforms credit everyone (元 / 元、鱼骨妹); each credited artist is now compared
- 已经在「收藏」里的歌曲会直接播放收藏里的那一版，不再去搜索
  A song already in your Favorites plays that exact recording instead of being searched for

## ✨ 界面 · Interface

- 修复：歌曲封面四周有一圈多余的黑边（封面和外框各画了一次边框）
  Fix: song covers had a stray black edge on all four sides (the cover and its frame each drew a border)
- 修复：「足迹」页的悬停提示浮在歌曲上方，现在会跟随鼠标显示
  Fix: the hover hint on the History page floated above the song; it now follows the pointer
- 「收藏」页的 Last.fm 标签与「歌曲」标签样式统一：悬停封面出现播放按钮，右侧按钮样式一致，并新增搜索框与排序
  The Last.fm tab on Favorites now matches the Songs tab: the play button appears on the cover on hover, the trailing actions match, and it gains a search box and sorting
- 「加载喜欢的歌曲」按钮改为与「足迹」页一致的刷新图标按钮
  "Load loved tracks" is now the same refresh icon button the History page uses

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

**Full Changelog**: https://github.com/aeroray/Museek/compare/v3.11.0...v3.11.1
