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
