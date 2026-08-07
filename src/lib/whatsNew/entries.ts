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
