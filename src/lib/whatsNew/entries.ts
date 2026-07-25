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
