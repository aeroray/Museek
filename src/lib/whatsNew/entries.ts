import type { Lang } from "@/lib/i18n"

export type WhatsNewSection = {
  /** Section heading shown above its bullets */
  title: string
  bullets: string[]
}

export type WhatsNewCopy = {
  sections: WhatsNewSection[]
}

/** Built-in bilingual release notes keyed by package.json version (no leading v). */
const ENTRIES: Record<string, Record<Lang, WhatsNewCopy>> = {
  "2.2.2": {
    zh: {
      sections: [
        {
          title: "播放",
          bullets: [
            "音量与静音会保存在本机，重启后不再回到 100%（不同步）",
          ],
        },
        {
          title: "歌单",
          bullets: [
            "歌单详情支持批量编辑下载（搜索框旁，交互对齐「我的收藏」）",
            "自建歌单同样支持批量下载",
          ],
        },
        {
          title: "窗口与更新",
          bullets: [
            "默认与最小窗口尺寸改为 1200×830",
            "升级后会弹出本版「更新内容」提示（仅升级时，全新安装不打扰）",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "Playback",
          bullets: [
            "Volume and mute are saved on this device — no more reset to 100% on launch (not synced)",
          ],
        },
        {
          title: "Playlists",
          bullets: [
            "Playlist detail: batch select & download (next to search, same pattern as Favorites)",
            "User playlists support batch download too",
          ],
        },
        {
          title: "Window & updates",
          bullets: [
            "Default and minimum window size is now 1200×830",
            "After an upgrade, a What's New dialog appears once (fresh installs stay quiet)",
          ],
        },
      ],
    },
  },
  "2.2.1": {
    zh: {
      sections: [
        {
          title: "托盘",
          bullets: [
            "修复「最小化到托盘」：窗口现在能真正隐藏",
            "托盘模式下，标题栏最小化也会收起到托盘",
            "隐藏后不再占任务栏；点击托盘图标恢复窗口",
          ],
        },
        {
          title: "托盘播放控制",
          bullets: [
            "右键托盘菜单：上一首 / 播放·暂停 / 下一首",
            "悬停托盘显示当前曲目",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "Tray",
          bullets: [
            "Fix minimize-to-tray: the window can actually hide",
            "In tray mode, the title-bar minimize button also hides to tray",
            "Hidden windows leave the taskbar; click the tray icon to restore",
          ],
        },
        {
          title: "Tray playback",
          bullets: [
            "Right-click tray: Previous / Play-Pause / Next",
            "Tooltip shows the current track while playing",
          ],
        },
      ],
    },
  },
  "2.2.0": {
    zh: {
      sections: [
        {
          title: "播放器",
          bullets: [
            "进度条重绘：填充与圆球始终对齐",
            "播放中进度更顺滑（按帧刷新）",
          ],
        },
        {
          title: "分类",
          bullets: [
            "本地音乐与收藏歌曲共用同一套分类界面",
            "行为不变：每首一个分类；收藏可同步，本地曲库仍仅本机",
          ],
        },
      ],
    },
    en: {
      sections: [
        {
          title: "Player",
          bullets: [
            "Seek bar redrawn so the fill and thumb stay aligned",
            "Smoother progress while playing",
          ],
        },
        {
          title: "Categories",
          bullets: [
            "Local music and favorites share one category UI",
            "Same rules: one category per track; favorites sync, local library stays device-local",
          ],
        },
      ],
    },
  },
}

export function getWhatsNew(version: string, lang: Lang): WhatsNewCopy | null {
  const key = version.replace(/^v/i, "")
  return ENTRIES[key]?.[lang] ?? ENTRIES[key]?.zh ?? null
}
