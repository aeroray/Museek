import type { Lang } from "@/lib/i18n"

export type WhatsNewSection = {
  /** Section heading shown above its bullets */
  title: string
  bullets: string[]
}

export type WhatsNewCopy = {
  sections: WhatsNewSection[]
}

export type WhatsNewRelease = {
  version: string
  copy: WhatsNewCopy
}

/** Built-in bilingual release notes keyed by package.json version (no leading v). */
const ENTRIES: Record<string, Record<Lang, WhatsNewCopy>> = {
  "3.7.1": {
    zh: {
      sections: [
        {
          title: "⬇️ 下载",
          bullets: [
            "已完成的下载可一键导入本地音乐；悬停显示图标",
            "进入下载页时后台检查文件是否还在，已删除的会标成「文件缺失」",
          ],
        },
        {
          title: "📁 本地音乐",
          bullets: [
            "进入本地页时后台检查文件是否还在，缺失或找回都会更新标记",
          ],
        },
        {
          title: "📋 歌单",
          bullets: [
            "打开过的收藏歌单会保存歌曲列表；远程被删后仍能打开和播放",
            "这份快照会随配置同步到其他设备",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "⬇️ Downloads",
          bullets: [
            "Import a finished download into Local music from a hover icon",
            "Opening Downloads checks files in the background and marks deleted ones as missing",
          ],
        },
        {
          title: "📁 Local music",
          bullets: [
            "Opening Local checks files in the background and updates missing or restored tracks",
          ],
        },
        {
          title: "📋 Playlists",
          bullets: [
            "Opened favorite playlists keep a song snapshot, so they still open and play if the remote list is deleted",
            "The snapshot syncs with your config to other devices",
          ],
        },
      ],
    },
  },
  "3.7.0": {
    zh: {
      sections: [
        {
          title: "📁 本地音乐",
          bullets: [
            "单曲「在线匹配」改为网易云候选列表，缺标签时可识曲；搜索中可取消",
            "未匹配的文件点播放不再偷偷上网补封面、歌手和歌词",
            "已匹配的歌曲按网易云目录搜歌词，其它平台也能出结果",
            "本地有损音质按真实码率显示 128K / 192K / 256K / 320K",
          ],
        },
        {
          title: "🎤 歌词",
          bullets: [
            "没有歌词时，底部播放栏的桌面歌词按钮会禁用",
            "桌面歌词的普通 LRC 会按整行用主题色填满",
          ],
        },
        {
          title: "📋 歌单",
          bullets: [
            "用链接打开的 QQ 个人歌单能正确列出歌曲",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "📁 Local music",
          bullets: [
            "Single-track Match online opens a NetEase picker, with fingerprint when tags are missing; you can cancel while it searches",
            "Unmatched files no longer look up cover, artist, or lyrics when you press play",
            "Matched tracks search lyrics as the bound NetEase song, so other platforms can appear too",
            "Local lossy files show 128K / 192K / 256K / 320K from the real bitrate",
          ],
        },
        {
          title: "🎤 Lyrics",
          bullets: [
            "The desktop lyrics button in the player bar is disabled when there are no lyrics",
            "Plain desktop LRC fills the whole line with the theme color",
          ],
        },
        {
          title: "📋 Playlists",
          bullets: [
            "QQ playlists opened from a personal or share link list their songs correctly",
          ],
        },
      ],
    },
  },
  "3.6.0": {
    zh: {
      sections: [
        {
          title: "🎤 歌词",
          bullets: [
            "卡拉 OK 只用平台原生逐字时间；普通歌词整行显示，不再估算逐字",
            "歌词页可切换网易云、酷我、酷狗、QQ 音乐、咪咕；播放时优先选有逐字的源",
            "去掉歌词时间轴微调，改从各平台里选一份更准的词",
          ],
        },
        {
          title: "📁 本地音乐",
          bullets: [
            "播放时补缺失封面和目录信息；勾选「显示原文件名」仍只锁定歌名",
            "无歌词的 BGM、播客不再错配其他歌曲的词；歌名和时长对不上就留空",
          ],
        },
        {
          title: "🏷️ 分类",
          bullets: [
            "全部分类菜单里，自定义分类可直接改名或删除",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "🎤 Lyrics",
          bullets: [
            "Karaoke uses platform-native word timing only; plain lyrics stay whole-line",
            "Switch NetEase, KuWo, KuGou, QQ Music, or Migu on the lyrics page; playback prefers a word-timed source",
            "Timeline nudge is gone — pick another platform’s lyrics instead",
          ],
        },
        {
          title: "📁 Local music",
          bullets: [
            "Playing fills missing cover and catalog info; Show original filename still only locks the title",
            "Instrumental BGM and podcasts no longer get another song’s lyrics; weak title or duration matches stay empty",
          ],
        },
        {
          title: "🏷️ Categories",
          bullets: [
            "Rename or delete a custom category from the All Categories menu",
          ],
        },
      ],
    },
  },
  "3.5.3": {
    zh: {
      sections: [
        {
          title: "📁 本地音乐",
          bullets: [
            "导入立刻按文件名入列，封面和标签从文件后台补全，默认不上网",
            "只有点「在线匹配」或打开「导入时匹配」才会上网补缺；勾选「显示原文件名」只锁定歌名",
            "播放、勾选或取消「显示原文件名」都不会触发在线匹配",
          ],
        },
        {
          title: "⬇️ 下载",
          bullets: [
            "未设置下载目录时，「打开文件夹」会禁用，避免点了没反应",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "📁 Local music",
          bullets: [
            "Import lists filenames immediately; covers and tags fill from the file in the background with no network",
            "Online fill only from Match online or Match on import; Show original filename only locks the title",
            "Playing or toggling the filename checkbox never matches online",
          ],
        },
        {
          title: "⬇️ Downloads",
          bullets: [
            "Disable Open folder when no download directory is set",
          ],
        },
      ],
    },
  },
  "3.5.2": {
    zh: {
      sections: [
        {
          title: "🪟 Windows",
          bullets: [
            "修复打开数秒后闪退、拖窗口发滞：窗口显示改回界面线程",
            "主窗口被藏住时，点任务栏图标可以重新打开（缩略图按钮本来就能用）",
          ],
        },
        {
          title: "🎵 酷狗",
          bullets: [
            "搜索页点收藏只会收进当前这一首，不再一次收进多首同名版本",
          ],
        },
        {
          title: "🎶 歌词",
          bullets: [
            "歌词页封面下方可拖动播放进度，盖住底栏时也能微调位置",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "🪟 Windows",
          bullets: [
            "Fix a crash and drag hitch a few seconds after launch by showing the window on the UI thread",
            "Clicking the taskbar icon restores a hidden main window (the thumbnail buttons already worked)",
          ],
        },
        {
          title: "🎵 KuGou",
          bullets: [
            "Favoriting a search result adds only that track, not every same-title version in the group",
          ],
        },
        {
          title: "🎶 Lyrics",
          bullets: [
            "Seek from a compact progress bar under the lyrics-page cover while the overlay hides the player bar",
          ],
        },
      ],
    },
  },
  "3.5.1": {
    zh: {
      sections: [
        {
          title: "⌨️ 快捷键",
          bullets: [
            "每项功能可同时设置应用内快捷键和全局热键，两套都能触发",
            "应用内默认单键：空格播放、方向键微调进度、P/N 切歌、M 静音、L 歌词、D 桌面歌词",
          ],
        },
        {
          title: "🔌 音源",
          bullets: [
            "音源只从本地文件导入（选择文件或拖入），不再支持粘贴链接",
          ],
        },
        {
          title: "🎶 歌词与评论",
          bullets: [
            "修复酷狗评论因空图片字段导致面板报错",
            "单行桌面歌词胶囊上下留白更均衡，评论标题不再被关闭按钮挡住",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "⌨️ Shortcuts",
          bullets: [
            "Each action can have an in-app shortcut and a global hotkey at the same time",
            "Simple in-app defaults: Space to play, arrows to seek, P/N to skip, M mute, L lyrics, D desktop lyrics",
          ],
        },
        {
          title: "🔌 Sources",
          bullets: [
            "Import source scripts from local files only (picker or drag-drop); link import is gone",
          ],
        },
        {
          title: "🎶 Lyrics and comments",
          bullets: [
            "Fix KuGou comments crashing when the API returns an empty images field",
            "Even padding on the single-line desktop lyric capsule, and the comments title no longer sits under the close button",
          ],
        },
      ],
    },
  },
  "3.5.0": {
    zh: {
      sections: [
        {
          title: "💬 评论",
          bullets: [
            "歌词页可查看网易云、酷我、酷狗、QQ 音乐、咪咕的歌曲评论，支持热评和最新",
            "打开评论时收起封面；「歌词独享」与评论互斥，不会三列挤在一起",
          ],
        },
        {
          title: "🎶 歌词",
          bullets: [
            "桌面歌词可显示双行：有翻译时显示译文，否则显示下一句",
            "桌面歌词颜色可跟随主题，也可自选",
            "重启后会立即请求当前歌曲歌词，不必先点播放",
          ],
        },
        {
          title: "⌨️ 快捷键",
          bullets: [
            "录制快捷键时先注销全局热键，避免系统抢走按键",
            "组合已被本软件占用时会明确提示",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "💬 Comments",
          bullets: [
            "Read song comments from NetEase, KuWo, KuGou, QQ Music, and Migu on the lyrics page, with Hot and Latest",
            "Opening comments hides the cover; Lyrics only and comments are exclusive so the three columns never crowd",
          ],
        },
        {
          title: "🎶 Lyrics",
          bullets: [
            "Desktop lyrics can show two lines: the translation when present, otherwise the upcoming line",
            "Desktop lyric color can follow the theme or a color you pick",
            "Lyrics for the restored song load at launch — no need to press Play first",
          ],
        },
        {
          title: "⌨️ Shortcuts",
          bullets: [
            "Recording a shortcut unregisters global hotkeys so the OS does not swallow the keys",
            "A clear prompt when the combo is already used by Museek",
          ],
        },
      ],
    },
  },
  "3.4.0": {
    zh: {
      sections: [
        {
          title: "💬 歌词",
          bullets: [
            "歌词页可用快进 / 快退微调时间轴（每步 0.5 秒），只存在本地缓存，清理缓存即清除",
            "把播放进度写入系统媒体会话，方便其他本地歌词软件跟词",
          ],
        },
        {
          title: "🎨 外观",
          bullets: [
            "默认跟随系统字体，不再捆绑中文衬线包",
            "可从本机已安装字体中选择；桌面歌词默认同软件字体，也可分开",
            "打开字体列表时会显示加载状态",
          ],
        },
        {
          title: "⌨️ 快捷键",
          bullets: [
            "播放控件悬停显示当前全局快捷键，不再写死组合",
          ],
        },
        {
          title: "🍎 macOS",
          bullets: [
            "Dock 图标显示播放进度；暂停时保留，播完或无效时隐藏",
            "继续稳住睡眠唤醒后的红绿灯位置",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "💬 Lyrics",
          bullets: [
            "Nudge the lyric timeline forward or back by 0.5s on the lyrics page; stored in local cache and cleared with it",
            "Publish playback position to the system media session so other local lyrics apps can follow along",
          ],
        },
        {
          title: "🎨 Appearance",
          bullets: [
            "Follow the system UI font by default; bundled CJK serif files are gone",
            "Pick from fonts installed on this device; desktop lyrics follow the app font unless you choose another",
            "The font list shows a loading state while system fonts are enumerated",
          ],
        },
        {
          title: "⌨️ Shortcuts",
          bullets: [
            "Hovering playback controls shows the current global hotkey instead of a hardcoded combo",
          ],
        },
        {
          title: "🍎 macOS",
          bullets: [
            "Dock icon shows playback progress; it stays while paused and hides when finished or invalid",
            "Keep traffic-light placement stable after sleep and wake",
          ],
        },
      ],
    },
  },
  "3.3.0": {
    zh: {
      sections: [
        {
          title: "⌨️ 快捷键",
          bullets: [
            "播放相关快捷键改为系统全局热键，最小化后也能用",
            "「设置 → 快捷键」可点击按键改组合；默认 Ctrl/⌘ + Shift",
            "Windows 的 Ctrl 与 Mac 的 ⌘ 会一起同步；可一键恢复默认",
          ],
        },
        {
          title: "▶️ 播放",
          bullets: [
            "重启后恢复上次队列、当前歌曲和进度；有缓存则直接可播，没有则等你按播放",
            "「设置 → 播放」可选启动进入的页面",
            "缓存音质低于偏好时会再试更高音质，不再被低码率缓存卡住",
            "无效音频链接时提示换其他音源",
          ],
        },
        {
          title: "🔌 音源",
          bullets: [
            "导入的音源在沙箱中运行，并限制可疑网络请求",
            "导入前会提示：只导入你信任的脚本",
          ],
        },
        {
          title: "🍎 macOS",
          bullets: [
            "修复睡眠唤醒后红绿灯按钮逐渐右移的问题",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "⌨️ Shortcuts",
          bullets: [
            "Playback shortcuts are now OS global hotkeys, including when Museek is minimized",
            "Change combos in Settings → Shortcuts by clicking a keycap; defaults use Ctrl/⌘ + Shift",
            "Windows Ctrl and Mac ⌘ stay in sync; restore defaults in one click",
          ],
        },
        {
          title: "▶️ Playback",
          bullets: [
            "Relaunch restores the last queue, current song, and position; play immediately from cache, or wait until you press play",
            "Choose the page that opens on launch in Settings → Playback",
            "If a cache is below your preferred quality, Museek tries a higher tier instead of staying stuck on 128k",
            "Invalid audio links now say to try another source",
          ],
        },
        {
          title: "🔌 Sources",
          bullets: [
            "Imported source scripts run in a sandbox, with junk network requests blocked",
            "Import shows a reminder to only add scripts you trust",
          ],
        },
        {
          title: "🍎 macOS",
          bullets: [
            "Fix traffic lights walking right after sleep and wake",
          ],
        },
      ],
    },
  },
  "3.2.1": {
    zh: {
      sections: [
        {
          title: "⬇️ 下载",
          bullets: [
            "修复下载完成后歌词、封面经常写不进文件的问题（Windows 拒绝访问）",
            "在内存中写入标签后再保存，M4A 等实际格式也能内嵌",
            "写入标签时进度条会显示「写入标签…」，不再提前到 100%",
            "修复部分更新后下载目录设置被清空的问题",
          ],
        },
        {
          title: "✨ 其它",
          bullets: [
            "歌单 / 专辑批量编辑可一键加入收藏",
            "删除本地歌曲时同步从播放队列移除",
            "顶栏歌词可点进歌词页，空白区域仍可拖动窗口",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "⬇️ Downloads",
          bullets: [
            "Fix lyrics and cover art often failing to embed after a download (Windows access denied)",
            "Write tags in memory before saving, including M4A when that is the real file format",
            "Progress shows “Writing tags…” instead of jumping to 100% too early",
            "Fix the download folder setting being cleared after some updates",
          ],
        },
        {
          title: "✨ Other",
          bullets: [
            "Batch-edit on playlists and albums can add songs to favorites",
            "Removing a local track also drops it from the play queue",
            "Click the top-bar lyric to open lyrics; empty space still drags the window",
          ],
        },
      ],
    },
  },
  "3.2.0": {
    zh: {
      sections: [
        {
          title: "🎧 听歌识曲",
          bullets: [
            "侧栏新增「识曲」页（Beta）：听一段旋律，找出对应歌曲",
            "支持麦克风或系统声音采集；桌面端可用时默认系统声音",
            "使用网易云指纹识别，匹配成功后以可播放曲目展示",
            "需手动开始聆听；识曲时会暂停 Museek 播放，避免采到本机播放声",
          ],
        },
        {
          title: "🍎 macOS",
          bullets: [
            "macOS 现已支持系统声音识曲（首次可能请求屏幕录制权限）",
            "修复播放时钟不稳导致主窗口空白 / 顶栏歌词异常的问题",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "🎧 Song recognition",
          bullets: [
            "New Recognize page (Beta) in the sidebar — hear a clip and find the song",
            "Capture with Microphone or System audio; desktop defaults to system audio when available",
            "Powered by NetEase fingerprint matching; matches appear as playable tracks",
            "Starts only when you press listen; pauses Museek playback during capture for a clean sample",
          ],
        },
        {
          title: "🍎 macOS",
          bullets: [
            "System-audio recognition now works on macOS (may ask for Screen Recording permission)",
            "Fix unstable playback clock that could blank the main window or break top-bar karaoke",
          ],
        },
      ],
    },
  },
  "3.1.4": {
    zh: {
      sections: [
        {
          title: "🪟 Windows 媒体控制",
          bullets: [
            "系统媒体卡片统一显示为 Museek，避免与 WebView2 重复出现两张卡",
            "进程启动时设置应用身份，媒体信息归属更稳定",
          ],
        },
        {
          title: "🎤 歌词",
          bullets: [
            "点击顶栏歌词可打开歌词页",
            "歌词页封面高光与浮动动画在暂停时会停下，当前行字号更突出",
            "桌面歌词时间同步更稳，减少跳动与丢帧感",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "🪟 Windows media controls",
          bullets: [
            "System media card shows as Museek only — no duplicate WebView2 session card",
            "App identity is set at process start so media metadata stays correctly owned",
          ],
        },
        {
          title: "🎤 Lyrics",
          bullets: [
            "Click the top-bar lyric line to open the lyrics page",
            "Lyrics-page cover shine/float pauses when playback pauses; active line is larger",
            "Desktop lyrics timing sync is steadier with fewer jumps",
          ],
        },
      ],
    },
  },
  "3.1.3": {
    zh: {
      sections: [
        {
          title: "🛠 构建",
          bullets: [
            "修复 pnpm workspace 配置，解除 3.1.2 发版 CI 卡在依赖缓存的问题",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "🛠 Build",
          bullets: [
            "Fix pnpm workspace config that blocked the 3.1.2 release CI at dependency cache setup",
          ],
        },
      ],
    },
  },
  "3.1.2": {
    zh: {
      sections: [
        {
          title: "🍎 macOS / 播放",
          bullets: [
            "修复播放时钟导致的无限重渲染，避免主窗口空白 / 消失",
            "顶栏恢复逐字卡拉 OK（在稳定的播放时钟之上）",
            "更新 macOS 应用图标，四周留出安全边距，Dock 观感更轻",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "🍎 macOS / Playback",
          bullets: [
            "Fix infinite re-renders from the playback clock that blanked the main window",
            "Restore word-by-word karaoke in the top bar on the stabilized clock",
            "Refresh the macOS app icon with a safer inset margin for a lighter Dock look",
          ],
        },
      ],
    },
  },
  "3.1.1": {
    zh: {
      sections: [
        {
          title: "🍎 macOS",
          bullets: [
            "修复播放时歌词加载导致主窗口空白 / 消失的问题",
            "顶栏改回整行歌词显示；歌词页与桌面歌词仍保留逐字卡拉 OK",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "🍎 macOS",
          bullets: [
            "Fix the main window going blank / disappearing when lyrics load during playback",
            "Top bar uses plain lyric lines again; word karaoke remains in the lyrics page and desktop lyrics",
          ],
        },
      ],
    },
  },
  "3.1.0": {
    zh: {
      sections: [
        {
          title: "⬇️ 下载",
          bullets: [
            "下载的 MP3 / FLAC 可内嵌歌词与封面（默认开启）",
            "「设置 → 下载」新增内嵌歌词、内嵌封面开关",
            "元数据写入失败时仍算下载完成，并提示哪些未写入",
          ],
        },
        {
          title: "🎤 歌词",
          bullets: [
            "歌词页、桌面歌词与顶栏当前行支持逐字卡拉 OK 高亮",
            "换行过渡更顺滑；歌词页上下边缘更柔和，当前行不再突然放大",
          ],
        },
        {
          title: "▶️ 播放",
          bullets: [
            "播放中进度条更平滑，拖动与暂停时的时间同步更稳",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "⬇️ Downloads",
          bullets: [
            "Embed lyrics and cover art into MP3 / FLAC downloads (on by default)",
            "New Settings → Download toggles for embed lyrics and embed cover art",
            "If metadata write fails, the download still completes with a clear warning",
          ],
        },
        {
          title: "🎤 Lyrics",
          bullets: [
            "Word-by-word karaoke highlight in the lyrics panel, desktop lyrics, and top bar",
            "Smoother line transitions; softer panel edges, and the active line no longer jumps in size",
          ],
        },
        {
          title: "▶️ Playback",
          bullets: [
            "Smoother progress tracking while playing, with steadier seek / pause time sync",
          ],
        },
      ],
    },
  },
  "3.0.0": {
    zh: {
      sections: [
        {
          title: "🖥️ 桌面歌词",
          bullets: [
            "新增始终置顶的桌面歌词浮窗，可在其他应用工作时显示当前歌词",
            "播放栏或 Ctrl/⌘ + L 开关；Ctrl/⌘ + Shift + L 锁定 / 解锁（未聚焦也可用）",
            "可拖动位置、Ctrl/⌘ + 滚轮调字号；支持胶囊底与「设置 → 歌词」选项",
            "有逐字时间轴时按主题色做卡拉 OK 填色",
          ],
        },
        {
          title: "🎤 歌词体验",
          bullets: [
            "优先使用各平台原生逐字歌词（YRC / QRC / KRC / MRC 等），跟唱更贴人声",
            "主歌词页支持「歌词独享」布局，以及 Ctrl/⌘ + 滚轮调字号",
          ],
        },
        {
          title: "📁 本地音乐",
          bullets: [
            "每首歌可单独选择：智能识别歌名，或保留原文件名（跳过在线改写）",
          ],
        },
        {
          title: "🔍 搜索",
          bullets: [
            "切换平台或类型时不再残留上一次请求的旧结果",
            "咪咕搜索失败时自动回退，更稳定",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "🖥️ Desktop lyrics",
          bullets: [
            "Always-on-top desktop lyrics overlay so you can follow along while using other apps",
            "Toggle from the player bar or with Ctrl/⌘ + L; lock/unlock with Ctrl/⌘ + Shift + L (works unfocused)",
            "Drag to move, Ctrl/⌘ + scroll to resize; optional capsule background and Settings → Lyrics options",
            "Theme-colored karaoke fill when word timings are available",
          ],
        },
        {
          title: "🎤 Lyrics",
          bullets: [
            "Prefer platform-native word timing (YRC / QRC / KRC / MRC, and more) for tighter karaoke",
            "Lyrics-only layout in the main lyrics view, plus Ctrl/⌘ + scroll font scaling",
          ],
        },
        {
          title: "📁 Local music",
          bullets: [
            "Per-track title mode: smart recognition, or keep the original filename (skip online rewrite)",
          ],
        },
        {
          title: "🔍 Search",
          bullets: [
            "Switching platform or result type no longer leaves stale rows from the previous request",
            "More reliable Migu search with automatic fallback",
          ],
        },
      ],
    },
  },
  "2.5.3": {
    zh: {
      sections: [
        {
          title: "🍎 macOS",
          bullets: [
            "冷启动时正确显示窗口阴影（不必再关窗后从托盘重开）",
            "「关闭时最小化到托盘」后，点击 Dock 图标可重新打开窗口",
            "菜单栏托盘图标跟随当前主题强调色（不仅是石墨深浅）",
          ],
        },
        {
          title: "🎨 外观与设置",
          bullets: [
            "设置侧栏各项增加语义图标",
            "主题配色「琥珀金」替换为「青石」，强调色文字对比更清晰",
          ],
        },
        {
          title: "▶️ 播放队列",
          bullets: [
            "收藏单曲与本地音乐的「加入队列」移至批量编辑工具栏，并对勾选项生效",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "🍎 macOS",
          bullets: [
            "Window shadow appears correctly on cold start (no need to hide and reopen from the tray)",
            "After close-to-tray, clicking the Dock icon restores the main window",
            "Menu-bar tray icon follows the active accent palette (not only Graphite light/dark)",
          ],
        },
        {
          title: "🎨 Appearance & settings",
          bullets: [
            "Settings sidebar tabs now have semantic icons",
            "Replaced Amber accent with Teal for cleaner contrast on primary surfaces",
          ],
        },
        {
          title: "▶️ Play queue",
          bullets: [
            "Favorites songs and Local Music: “Add to queue” lives in batch-edit and applies to the selection",
          ],
        },
      ],
    },
  },
  "2.5.2": {
    zh: {
      sections: [
        {
          title: "▶️ 播放队列",
          bullets: [
            "「播放全部」改为追加到现有队列，不再清空",
            "收藏单曲与本地音乐支持加入当前播放队列",
          ],
        },
        {
          title: "🖥 托盘图标",
          bullets: [
            "macOS 菜单栏托盘图标适配浅色 / 深色外观（自动反白）",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "▶️ Play queue",
          bullets: [
            "“Play all” appends to the current queue instead of replacing it",
            "Add to queue from Favorites songs and Local Music",
          ],
        },
        {
          title: "🖥 Tray icon",
          bullets: [
            "macOS menu-bar tray icon adapts to light / dark appearance",
          ],
        },
      ],
    },
  },
  "2.5.1": {
    zh: {
      sections: [
        {
          title: "💬 顶栏问候",
          bullets: [
            "没有播放歌曲时，顶部歌词栏会显示温馨话语",
            "话语按时间段准备并随机切换，进入搜索、清空搜索或切换页面时也会更新",
          ],
        },
        {
          title: "✨ 体验",
          bullets: [
            "播放队列的遮罩会跟随主窗口圆角裁切，不再露出方形边角",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "💬 Warm welcome",
          bullets: [
            "Show a warm message in the top lyric bar when no song is playing",
            "Messages rotate by time of day and refresh when entering Search, clearing a search, or changing pages",
          ],
        },
        {
          title: "✨ Polish",
          bullets: [
            "The playback queue backdrop now follows the rounded app window instead of showing square corners",
          ],
        },
      ],
    },
  },
  "2.5.0": {
    zh: {
      sections: [
        {
          title: "💿 专辑",
          bullets: [
            "搜索支持专辑范围；侧栏新增专辑广场（平台切换 + 分类）",
            "收藏拆出专辑页签；详情可收藏，并显示发行月份",
            "从搜索进入详情后返回，会回到搜索结果",
          ],
        },
        {
          title: "✨ 体验",
          bullets: [
            "封面加载前显示柔和模糊占位，避免空白闪烁",
            "切换平台时分类栏始终保留「全部」，减少列表抖动",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "💿 Albums",
          bullets: [
            "Search albums; new Albums hub in the sidebar with platforms and categories",
            "Separate Favorites tab for albums; favorite from detail; show release month",
            "Back from an album opened via search returns to your search results",
          ],
        },
        {
          title: "✨ Polish",
          bullets: [
            "Soft blur placeholder while covers load",
            "Category bar keeps “All” when switching platforms — less layout jump",
          ],
        },
      ],
    },
  },
  "2.4.0": {
    zh: {
      sections: [
        {
          title: "🔇 静默启动",
          bullets: [
            "开机自启时可只留托盘图标，不弹出主窗口",
          ],
        },
        {
          title: "⬇️ 下载",
          bullets: [
            "底部播放栏与歌词页可为当前歌曲一键下载（可选音质）",
          ],
        },
        {
          title: "💾 播放缓存",
          bullets: [
            "已缓存歌曲再次播放更接近秒开；后台写入更稳，音质切换也能命中已有缓存",
          ],
        },
        {
          title: "🐶 酷狗歌单",
          bullets: [
            "支持用酷狗码导入自建歌单；打开外部歌单的说明改为各平台简短提示",
          ],
        },
        {
          title: "🪟 迷你播放 / 唱片",
          bullets: [
            "进出迷你窗与贴边唱片的过渡更流畅，卡顿更少",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "🔇 Silent start",
          bullets: [
            "Optionally launch to the tray only at login — no main window popup",
          ],
        },
        {
          title: "⬇️ Download",
          bullets: [
            "Download the current track from the player bar or lyrics page (pick quality)",
          ],
        },
        {
          title: "💾 Playback cache",
          bullets: [
            "Cached tracks restart closer to instantly; warmer writes and quality-aware cache hits",
          ],
        },
        {
          title: "🐶 KuGou playlists",
          bullets: [
            "Import playlists via KuGou share codes; external-open hints moved into per-platform placeholders",
          ],
        },
        {
          title: "🪟 Mini player / vinyl",
          bullets: [
            "Smoother enter/exit morphs for the mini bar and docked vinyl peek",
          ],
        },
      ],
    },
  },
  "2.3.4": {
    zh: {
      sections: [
        {
          title: "📂 打开方式",
          bullets: [
            "修复右键用拾音打开时误报「无法读取本地文件」的权限问题",
            "重新打开已导入的歌会刷新封面；补全的封面会同步到正在播放",
            "打开文件时将窗口拉到前台，避免只在后台播放却看不见",
          ],
        },
        {
          title: "🪟 迷你播放器",
          bullets: [
            "播放列表高度随歌曲数量伸缩，最多约显示 4 首，超出可滚动",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "📂 Open with",
          bullets: [
            "Fix false “couldn’t read local file / check permissions” when opening via Open with",
            "Re-opening an imported track refreshes artwork; enriched covers sync to the player",
            "Bring Museek to the foreground when opening files so playback isn’t hidden in the background",
          ],
        },
        {
          title: "🪟 Mini player",
          bullets: [
            "Queue panel height follows the number of tracks (max ~4 rows, then scroll)",
          ],
        },
      ],
    },
  },
  "2.3.3": {
    zh: {
      sections: [
        {
          title: "📂 打开方式",
          bullets: [
            "设为默认打开后保持单实例：再双击歌曲会导入本地并立即播放，而不是再开一个窗口",
            "不支持的格式（如 wma）会明确提示，不再只亮窗口却无反馈",
          ],
        },
        {
          title: "💿 本地音乐",
          bullets: [
            "导入更快：并发扫描、进度显示；音质按实际编码识别（不再只看扩展名）",
            "同路径重新导入可清除「文件缺失」；内嵌封面与歌词（同目录 .lrc / 标签）更稳",
            "大文件播放改用资源协议，减少卡顿",
          ],
        },
        {
          title: "🎙 顶栏歌词",
          bullets: [
            "字号加大，并避免下行字母被裁切",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "📂 Open with",
          bullets: [
            "Single-instance: opening more songs imports them locally and plays immediately instead of spawning new windows",
            "Unsupported formats (e.g. wma) show a clear toast instead of a silent focus-only open",
          ],
        },
        {
          title: "💿 Local music",
          bullets: [
            "Faster imports with concurrency + progress; quality from real encoding (not just extension)",
            "Re-importing the same path clears “file missing”; embedded covers and lyrics (.lrc / tags) are more reliable",
            "Large local files play via the asset protocol to reduce hitching",
          ],
        },
        {
          title: "🎙 Top-bar lyrics",
          bullets: [
            "Larger type and no clipped descenders",
          ],
        },
      ],
    },
  },
  "2.3.2": {
    zh: {
      sections: [
        {
          title: "🎵 歌单",
          bullets: [
            "修复酷狗外部歌单加载失败；支持榜单链接（如 /yy/rank/home/1-6666.html）",
          ],
        },
        {
          title: "🪟 窗口",
          bullets: [
            "修复关闭确认里勾选「不再提醒」后仍会再次弹出的问题",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "🎵 Playlists",
          bullets: [
            "Fix KuGou external playlist loading; chart links like /yy/rank/home/… now work",
          ],
        },
        {
          title: "🪟 Window",
          bullets: [
            "Fix: “Don’t remind me” on the close dialog may not stick",
          ],
        },
      ],
    },
  },
  "2.3.1": {
    zh: {
      sections: [
        {
          title: "📜 更新日志",
          bullets: [
            "修复 Mac 应用内更新后启动不弹出更新日志的问题",
          ],
        },
        {
          title: "⚙️ 设置",
          bullets: [
            "新增开机自启动开关（默认关闭，Windows / macOS 均可用）",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "📜 Changelog",
          bullets: [
            "Fix: changelog may not appear after an in-app update on Mac",
          ],
        },
        {
          title: "⚙️ Settings",
          bullets: [
            "New open-at-login toggle (off by default; Windows and macOS)",
          ],
        },
      ],
    },
  },
  "2.3.0": {
    zh: {
      sections: [
        {
          title: "🎧 迷你播放",
          bullets: [
            "一键缩成置顶小窗，贴到屏幕边缘后会收成旋转唱片",
            "悬停展开控制条和播放列表；失焦自动收起列表",
            "按 P 进出迷你模式",
          ],
        },
        {
          title: "🪟 窗口",
          bullets: [
            "任务栏标题跟界面语言走：中文「拾音」、英文 Museek",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "🎧 Mini player",
          bullets: [
            "Shrink to an always-on-top bar; dock to an edge and it peeks as a spinning vinyl",
            "Hover to expand controls and the queue; the queue closes when you look away",
            "Press P to enter or exit",
          ],
        },
        {
          title: "🪟 Window",
          bullets: [
            "Taskbar title follows the UI language: 拾音 in Chinese, Museek in English",
          ],
        },
      ],
    },
  },
  "2.2.2": {
    zh: {
      sections: [
        {
          title: "🔊 播放",
          bullets: [
            "音量和静音会记住，重启不会再被拉回 100%",
          ],
        },
        {
          title: "📋 歌单",
          bullets: [
            "歌单详情可以批量勾选下载，自建歌单也行",
          ],
        },
        {
          title: "✨ 其它",
          bullets: [
            "窗口默认更大一点；升级后会提示本版更新日志",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "🔊 Playback",
          bullets: [
            "Volume and mute stick across launches — no more jump back to 100%",
          ],
        },
        {
          title: "📋 Playlists",
          bullets: [
            "Batch-select and download from playlist detail (including your own lists)",
          ],
        },
        {
          title: "✨ Other",
          bullets: [
            "Slightly larger default window; upgrades can show this changelog once",
          ],
        },
      ],
    },
  },
  "2.2.1": {
    zh: {
      sections: [
        {
          title: "📌 托盘",
          bullets: [
            "最小化到托盘终于能真正藏起来，也不再占任务栏",
            "右键托盘可上一首 / 播放暂停 / 下一首，悬停能看到当前歌",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "📌 Tray",
          bullets: [
            "Hide-to-tray actually hides, and leaves the taskbar",
            "Right-click for prev / play-pause / next; hover shows the current track",
          ],
        },
      ],
    },
  },
  "2.2.0": {
    zh: {
      sections: [
        {
          title: "▶️ 播放器",
          bullets: [
            "进度条更跟手，播放时走动也更顺",
          ],
        },
        {
          title: "🏷️ 分类",
          bullets: [
            "本地音乐和收藏共用同一套分类界面",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "▶️ Player",
          bullets: [
            "Seek bar feels tighter; progress moves more smoothly while playing",
          ],
        },
        {
          title: "🏷️ Categories",
          bullets: [
            "Local music and favorites share one category UI",
          ],
        },
      ],
    },
  },
  "2.1.0": {
    zh: {
      sections: [
        {
          title: "🏷️ 歌曲分类",
          bullets: [
            "给喜欢的歌打分类，找歌更快",
            "本地缺文件时提示更清楚",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "🏷️ Song categories",
          bullets: [
            "Tag favorites so they’re easier to find",
            "Clearer prompts when a local file is missing",
          ],
        },
      ],
    },
  },
  "2.0.0": {
    zh: {
      sections: [
        {
          title: "💿 本地音乐",
          bullets: [
            "导入本机曲库，也能搜歌词",
            "下载列表更好用了一些",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "💿 Local library",
          bullets: [
            "Import tracks from your computer, with lyric search",
            "Downloads list polish",
          ],
        },
      ],
    },
  },
}

function normalizeVersion(version: string): string {
  return version.replace(/^v/i, "")
}

/** Newest-first semver-ish sort (major.minor.patch numeric parts). */
function compareVersionsDesc(a: string, b: string): number {
  const pa = normalizeVersion(a).split(".").map((n) => Number.parseInt(n, 10) || 0)
  const pb = normalizeVersion(b).split(".").map((n) => Number.parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export function getWhatsNew(version: string, lang: Lang): WhatsNewCopy | null {
  const key = normalizeVersion(version)
  return ENTRIES[key]?.[lang] ?? ENTRIES[key]?.zh ?? null
}

/** All known release notes, newest first. */
export function listWhatsNew(lang: Lang): WhatsNewRelease[] {
  return Object.keys(ENTRIES)
    .sort(compareVersionsDesc)
    .map((version) => ({
      version,
      copy: ENTRIES[version][lang] ?? ENTRIES[version].zh,
    }))
}
