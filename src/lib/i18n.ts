import { create } from "zustand";

export type Lang = "zh" | "en";

const STORAGE_KEY = "museek.lang";

/** Pick the initial language: a previously saved choice wins, otherwise fall
 *  back to the system locale (Chinese when it starts with "zh", else English). */
function detectInitialLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "zh" || saved === "en") return saved;
  return (navigator.language || "").toLowerCase().startsWith("zh")
    ? "zh"
    : "en";
}

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const useLangStore = create<LangState>((set) => ({
  lang: detectInitialLang(),
  setLang(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
    set({ lang });
  },
}));

/**
 * Flat translation dictionary. Keys use dotted namespaces (e.g. `nav.search`).
 * `{name}`-style placeholders are filled in by the lookup helpers below.
 *
 * NOTE: only UI chrome is translated here. Data from APIs (song/singer/album
 * names, chart board names) is never translated. Platform labels ARE chrome and
 * share one key set (`platform.*`) across Search and Library.
 */
const dict: Record<Lang, Record<string, string>> = {
  zh: {
    // App
    "app.name": "拾音",
    "app.tagline": "万千旋律，一拾即得",

    // Platform labels (shared across Search + Library)
    "platform.kw": "酷我",
    "platform.tx": "QQ音乐",
    "platform.kg": "酷狗",
    "platform.wy": "网易云",
    "platform.mg": "咪咕",

    // Navigation / Sidebar
    "nav.search": "搜索",
    "nav.playlists": "歌单",
    "nav.library": "排行榜",
    "nav.favorites": "收藏",
    "nav.downloads": "下载",
    "nav.settings": "设置",
    "nav.back": "后退",
    "nav.forward": "前进",
    "sidebar.playlists": "歌单",
    "sidebar.favorites": "我的收藏",
    "sidebar.newPlaylistPrompt": "歌单名称",
    "sidebar.collapse": "收起侧栏",
    "sidebar.expand": "展开侧栏",
    "hotPlaylists.title": "歌单",
    "hotPlaylists.empty": "暂无歌单",
    "hotPlaylists.failed": "歌单加载失败：{msg}",
    "hotPlaylists.favorite": "收藏歌单",
    "hotPlaylists.favorited": "已收藏",
    "hotPlaylists.removeFavorite": "取消收藏",
    "hotPlaylists.songCount": "共 {count} 首",
    "hotPlaylists.playlistEmpty": "歌单是空的",
    "hotPlaylists.playFailed": "播放失败：{msg}",
    "hotPlaylists.playCountTip": "播放量",

    // Common actions
    "common.addToQueue": "加入队列",
    "common.favorite": "收藏",
    "common.unfavorite": "取消收藏",
    "common.download": "下载",
    "common.retry": "重试",
    "common.cancel": "取消",
    "common.playAll": "播放全部",

    // Search
    "search.placeholder": "搜索歌曲、歌手",
    "search.placeholderPlaylist": "搜索歌单，或输入用户名",
    "search.scopeSong": "单曲",
    "search.scopePlaylist": "歌单",
    "search.playlistHint": "按歌单名搜索，或输入用户名找到 TA 的歌单",
    "search.history": "搜索历史",
    "search.dragHint": "按住可拖拽排序",
    "search.clearHistory": "清空",
    "search.removeHistory": "删除此条",
    "search.collapse": "收起",
    "search.expandAll": "展开全部 {count} 条",
    "search.emptyTitle": "搜索你喜欢的音乐",
    "search.emptyTitlePlaylist": "搜索歌单",
    "search.emptyHint": "输入歌名或歌手开始搜索",
    "search.clear": "清除",
    "search.hotTitle": "{platform} · 热门搜索",
    "search.hotEmpty": "暂无热搜数据",
    "search.failed": "搜索失败：{msg}",
    "search.loadMore": "加载更多",
    "search.loading": "加载中…",
    "search.download": "下载 {quality}",

    // Library / charts
    "library.title": "排行榜",
    "library.loadFailed": "榜单加载失败：{msg}",
    "library.empty": "暂无数据",

    // Favorites
    "favorites.title": "我的收藏",
    "favorites.count": "({count} 首)",
    "favorites.empty": "还没有收藏任何歌曲",
    "favorites.emptyHint": "在搜索或播放时点心形按钮即可收藏",
    "favorites.batchEdit": "批量编辑",
    "favorites.selectAll": "全选",
    "favorites.deselectAll": "取消全选",
    "favorites.selectedCount": "已选 {count} 项",
    "favorites.batchDownload": "下载",
    "favorites.batchDelete": "删除",
    "favorites.sort.added": "添加时间",
    "favorites.sort.name": "名称",
    "favorites.allPlatforms": "全部平台",
    "favorites.noMatch": "没有匹配的收藏",
    "favorites.playAll": "播放全部",
    "favorites.searchPlaceholder": "在收藏中搜索…",
    "favorites.searchPlaylistsPlaceholder": "搜索收藏的歌单…",
    "favorites.playlistsSection": "收藏的歌单",
    "favorites.tabSongs": "歌曲",
    "favorites.tabPlaylists": "歌单",
    "favorites.summary": "{songs} 首歌曲 · {playlists} 个歌单",
    "favorites.emptyPlaylists": "还没有收藏任何歌单",
    "favorites.emptyPlaylistsHint": "在歌单页点「收藏歌单」即可收藏整个歌单",

    // Downloads
    "downloads.title": "下载管理",
    "downloads.clearCompleted": "清除已完成",
    "downloads.empty": "暂无下载任务",
    "downloads.emptyHint": "在搜索结果点击下载按钮，任务会显示在这里",
    "downloads.status.waiting": "等待",
    "downloads.status.downloading": "下载中",
    "downloads.status.completed": "完成",
    "downloads.status.error": "失败",

    // Playlist
    "playlist.notFound": "歌单不存在",
    "playlist.count": "({count} 首)",
    "playlist.addToQueue": "加入队列",
    "playlist.delete": "删除歌单",
    "playlist.empty": "歌单还没有歌曲",

    // Player bar
    "player.empty": "无播放内容",
    "player.failed": "播放失败",
    "player.lyrics": "歌词",
    "player.queue": "播放队列",
    "player.searchOther": "在其他平台搜索",
    "playMode.sequence": "顺序播放",
    "playMode.shuffle": "随机播放",
    "playMode.repeat-list": "列表循环",
    "playMode.repeat-one": "单曲循环",

    // Play queue
    "queue.title": "播放队列",
    "queue.count": "{count} 首歌曲",
    "queue.clear": "清空",
    "queue.clearConfirmTitle": "清空播放队列？",
    "queue.clearConfirmDesc": "将移除队列中的全部歌曲（不影响你的收藏）。",
    "queue.empty": "队列为空",
    "queue.emptyHint": "播放或添加歌曲后会显示在这里",

    // Lyrics panel
    "lyrics.empty": "暂无歌词",
    "lyrics.selectSong": "请选择歌曲",
    "lyrics.noCover": "No Cover",

    // Settings
    "settings.title": "设置",
    "settings.tab.sources": "音源管理",
    "settings.tab.playback": "播放",
    "settings.tab.download": "下载",
    "settings.tab.cache": "缓存",
    "settings.tab.shortcuts": "快捷键",
    "settings.tab.appearance": "外观",
    "settings.tab.data": "数据",
    "settings.tab.about": "关于",
    "settings.about.version": "版本 {version}",
    "settings.about.description": "多平台音乐聚合软件",
    "about.checkUpdate": "检查更新",
    "about.upToDate": "已是最新版本",
    "about.checkFailed": "检查更新失败：{msg}",
    "about.updateTitle": "发现新版本",
    "about.updateDesc": "有新版本 v{version} 可用，点击前往 GitHub 下载安装包。",
    "about.download": "前往下载",

    // Quality labels
    "quality.128k": "标准 128k",
    "quality.320k": "高品 320k",
    "quality.flac": "无损 FLAC",
    "quality.flac24bit": "Hi-Res 母带",

    // Playback & download settings
    "playback.playQualityTitle": "播放音质",
    "playback.playQualityDesc": "播放时优先使用的音质；若该音质不可用，将自动降级直至成功。",
    "playback.downloadQualityTitle": "下载音质",
    "playback.downloadQualityDesc": "下载时优先使用的音质；若不可用，将自动降级直至成功。",
    "playback.preventSleepTitle": "播放时阻止休眠",
    "playback.preventSleepDesc": "播放音乐时阻止系统进入睡眠，但仍允许屏幕熄灭 / 锁屏。暂停或停止后自动解除。",
    "close.behaviorTitle": "关闭按钮行为",
    "close.behaviorDesc": "点击窗口关闭按钮时：直接退出软件，或最小化到系统托盘后台运行。",
    "close.opt.exit": "直接退出",
    "close.opt.tray": "最小化到托盘",
    "close.confirmTitle": "退出 Museek？",
    "close.confirmDesc": "点击关闭将直接退出软件。可在「设置 → 播放」中改为最小化到托盘。",
    "close.dontRemind": "不再提醒",
    "close.exitNow": "退出",
    "shortcuts.title": "快捷键",
    "shortcuts.desc": "用键盘控制播放；在输入框中输入时不会触发。",
    "shortcuts.playPause": "播放 / 暂停",
    "shortcuts.seek": "后退 / 前进 5 秒",
    "shortcuts.prevNext": "上一首 / 下一首",
    "shortcuts.volume": "音量 增大 / 减小",
    "shortcuts.mute": "静音切换",
    "shortcuts.lyrics": "歌词页",
    "download.locationTitle": "下载位置",
    "download.locationDesc": "下载完成的歌曲文件的存放位置。",
    "download.defaultLocation": "默认（应用数据目录）",
    "download.notSet": "未设置 · 请选择保存位置",
    "download.choose": "选择文件夹",
    "download.reset": "恢复默认",
    "download.clearLocation": "清除下载位置",
    "download.noLocationTitle": "未设置下载位置",
    "download.noLocationDesc": "下载歌曲前，请先在「设置 → 下载」中选择文件的保存位置。",
    "download.noLocationError": "未设置下载位置，请先在设置中选择。",
    "download.goToSettings": "前往设置",
    "download.concurrencyTitle": "同时下载数量",
    "download.concurrencyDesc": "同时进行的下载任务数（最多 5 个，默认 1 个）。",
    "download.namingTitle": "文件命名",
    "download.namingDesc": "下载文件的命名方式。",
    "naming.singer-name": "歌手 - 歌名",
    "naming.name-singer": "歌名 - 歌手",
    "naming.name": "歌名",
    "player.qualityDowngraded": "音质不可用，已降级为「{quality}」",
    "download.qualityDowngraded": "「{name}」音质不可用，已降级为「{quality}」",
    "download.added": "已加入下载：{name}",
    "download.complete": "下载完成：{name}",
    "download.openFolder": "打开下载目录",
    "download.openFolderFailed": "打开下载目录失败：{msg}",

    // Cache
    "cache.title": "缓存",
    "cache.desc": "缓存音频与歌词，再次播放更快、可离线；超过上限会自动清理最久未使用的音频。封面图片由系统自动缓存。",
    "cache.audioTitle": "缓存播放的音频",
    "cache.maxTitle": "缓存上限",
    "cache.maxDesc": "音频缓存可占用的磁盘上限，超过后自动清理最久未使用的缓存。",
    "cache.current": "当前已用：{size}",
    "cache.clear": "清理缓存",
    "cache.clearConfirmTitle": "确定清理缓存？",
    "cache.clearConfirmDesc": "将删除所有已缓存的音频与歌词。已收藏和已下载的文件不受影响，但这些歌曲下次播放时需要重新联网获取。",
    "cache.clearConfirm": "清理",

    // Config import / export
    "data.title": "配置同步",
    "data.desc": "把所有设置、音源、收藏、搜索历史、外观等导出为一个 JSON 文件，在其他设备导入即可同步。",
    "data.export": "导出配置",
    "data.import": "导入配置",
    "data.note": "不包含音频/图片缓存与已下载的文件。",
    "data.exportDone": "配置已导出",
    "data.invalid": "无效的配置文件",
    "data.failed": "操作失败：{msg}",
    "data.importConfirmTitle": "导入配置？",
    "data.importConfirmDesc": "这将用文件中的数据覆盖当前所有设置、音源、收藏等，完成后应用会自动重新加载。",
    "data.importConfirm": "导入并重载",
    "sync.title": "文件夹同步",
    "sync.desc": "选择一个被网盘客户端（百度网盘 / OneDrive / iCloud 云盘等）同步的文件夹，配置会自动加密存放到这里。打开软件自动拉取较新的备份，退出时自动备份（可在下方关闭）。在其它设备指向同一个文件夹即可同步——无需登录，也无需设置口令。",
    "sync.noFolder": "未选择同步文件夹",
    "sync.choose": "选择文件夹",
    "sync.passphrasePlaceholder": "加密口令（恢复时需输入相同口令）",
    "sync.backup": "备份到文件夹",
    "sync.restore": "从文件夹恢复",
    "sync.note": "同步文件为加密存放（非明文），隐私由你的网盘账号访问控制保障。仅同步设置 / 音源 / 收藏歌单 / 搜索历史等，不含缓存与下载文件。备份文件：museek-config.enc.json。",
    "sync.autoBackupOnExit": "退出软件时自动备份到同步文件夹",
    "sync.backupBeforeQuit": "退出前备份到同步文件夹",
    "sync.backupDone": "已加密备份到同步文件夹",
    "sync.noBackup": "该文件夹中未找到备份文件",
    "sync.wrongPass": "无法解密备份文件（可能已损坏或来自旧版本）",

    // Source manager
    "sources.title": "音源管理",
    "sources.hint":
      "粘贴 lx-music 兼容音源的链接导入（.js）。\n开启多个音源后，播放时按列表顺序（从上到下）依次自动重试，直到某个成功。",
    "sources.urlPlaceholder":
      "例：https://ghproxy.net/raw.githubusercontent.com/.../latest.js",
    "sources.paste": "从剪贴板粘贴",
    "sources.import": "导入",
    "sources.empty": "未导入音源",
    "sources.emptyHint": "导入后，Museek 将通过音源脚本获取播放链接",
    "sources.author": "作者：{name}",
    "sources.platforms": "平台：{list}",
    "sources.count": "共 {total} 个 · 已启用 {enabled} 个",
    // Errors surfaced by the source store / runner
    "sources.err.downloadHttp": "下载失败：HTTP {status}",
    "sources.err.downloadFailed": "下载音源失败：{msg}",
    "sources.err.notAScript":
      "链接返回的不是有效的音源脚本（可能是网页或错误页）",
    "sources.err.loadFailed": "音源「{name}」加载失败：{msg}",
    "sources.err.noEnabled": "没有已启用的音源",
    "sources.err.allFailed": "所有音源均失败 → {errors}",
    "sources.err.invalidUrl": "{name}：返回无效链接",
    "sources.err.tooSmall": "{name}：返回的疑似试听/受限片段（体积过小）",
    "sources.err.sourceMsg": "{name}：{msg}",

    // Theme settings
    "theme.modeTitle": "外观模式",
    "theme.modeDesc": "选择亮色、暗色，或跟随系统设置。",
    "theme.mode.system": "跟随系统",
    "theme.mode.light": "亮色",
    "theme.mode.dark": "暗色",
    "theme.paletteTitle": "主题配色",
    "theme.paletteDesc": "选择一个强调色，应用于按钮、高亮等。",
    "palette.default": "石墨",
    "palette.violet": "紫罗兰",
    "palette.blue": "海蓝",
    "palette.emerald": "翡翠",
    "palette.rose": "玫瑰",
    "palette.amber": "琥珀金",

    // Language switcher
    "lang.title": "语言 / Language",
    "lang.desc": "选择界面显示语言。",
    "lang.zh": "简体中文",
    "lang.en": "English",

    // Player errors (surfaced in UI)
    "player.err.network":
      "音源服务器连接失败，请检查网络/代理或更换音源（{msg}）",
    "player.err.unknown": "未知错误",
    "player.failedDetail": "播放失败：{msg}",
    "player.noSource": "尚未启用音源，无法播放",
    "player.goImport": "去导入",
    "lyrics.fontIncrease": "增大字体",
    "lyrics.fontDecrease": "减小字体",
  },
  en: {
    // App
    "app.name": "Museek",
    "app.tagline": "Every melody, one search.",

    // Platform labels (shared across Search + Library)
    "platform.kw": "KuWo",
    "platform.tx": "QQ Music",
    "platform.kg": "KuGou",
    "platform.wy": "NetEase",
    "platform.mg": "Migu",

    // Navigation / Sidebar
    "nav.search": "Search",
    "nav.playlists": "Playlists",
    "nav.library": "Charts",
    "nav.favorites": "Favorites",
    "nav.downloads": "Downloads",
    "nav.settings": "Settings",
    "nav.back": "Back",
    "nav.forward": "Forward",
    "sidebar.playlists": "Playlists",
    "sidebar.favorites": "Favorites",
    "sidebar.newPlaylistPrompt": "Playlist name",
    "sidebar.collapse": "Collapse",
    "sidebar.expand": "Expand",
    "hotPlaylists.title": "Playlists",
    "hotPlaylists.empty": "No playlists",
    "hotPlaylists.failed": "Failed to load: {msg}",
    "hotPlaylists.favorite": "Favorite",
    "hotPlaylists.favorited": "Favorited",
    "hotPlaylists.removeFavorite": "Remove from favorites",
    "hotPlaylists.songCount": "{count} songs",
    "hotPlaylists.playlistEmpty": "This playlist is empty",
    "hotPlaylists.playFailed": "Playback failed: {msg}",
    "hotPlaylists.playCountTip": "Plays",

    // Common actions
    "common.addToQueue": "Add to queue",
    "common.favorite": "Favorite",
    "common.unfavorite": "Unfavorite",
    "common.download": "Download",
    "common.retry": "Retry",
    "common.cancel": "Cancel",
    "common.playAll": "Play all",

    // Search
    "search.placeholder": "Search songs, artists",
    "search.placeholderPlaylist": "Search playlists, or a username",
    "search.scopeSong": "Songs",
    "search.scopePlaylist": "Playlists",
    "search.playlistHint": "Search by playlist name, or a username to find their playlists",
    "search.history": "Search history",
    "search.dragHint": "Drag to reorder",
    "search.clearHistory": "Clear",
    "search.removeHistory": "Remove",
    "search.collapse": "Collapse",
    "search.expandAll": "Show all {count}",
    "search.emptyTitle": "Search for music you love",
    "search.emptyTitlePlaylist": "Find playlists",
    "search.emptyHint": "Type a song or artist to search",
    "search.clear": "Clear",
    "search.hotTitle": "{platform} · Trending searches",
    "search.hotEmpty": "No trending data",
    "search.failed": "Search failed: {msg}",
    "search.loadMore": "Load more",
    "search.loading": "Loading…",
    "search.download": "Download {quality}",

    // Library / charts
    "library.title": "Charts",
    "library.loadFailed": "Failed to load chart: {msg}",
    "library.empty": "No data",

    // Favorites
    "favorites.title": "Favorites",
    "favorites.count": "({count} songs)",
    "favorites.empty": "No favorite songs yet",
    "favorites.emptyHint": "Tap the heart on a song to save it here",
    "favorites.batchEdit": "Select",
    "favorites.selectAll": "Select all",
    "favorites.deselectAll": "Deselect all",
    "favorites.selectedCount": "{count} selected",
    "favorites.batchDownload": "Download",
    "favorites.batchDelete": "Delete",
    "favorites.sort.added": "Date added",
    "favorites.sort.name": "Name",
    "favorites.allPlatforms": "All platforms",
    "favorites.noMatch": "No matching favorites",
    "favorites.playAll": "Play all",
    "favorites.searchPlaceholder": "Search favorites…",
    "favorites.searchPlaylistsPlaceholder": "Search saved playlists…",
    "favorites.playlistsSection": "Favorited playlists",
    "favorites.tabSongs": "Songs",
    "favorites.tabPlaylists": "Playlists",
    "favorites.summary": "{songs} songs · {playlists} playlists",
    "favorites.emptyPlaylists": "No favorited playlists yet",
    "favorites.emptyPlaylistsHint": "Tap “Favorite” on a playlist to save the whole thing here",

    // Downloads
    "downloads.title": "Downloads",
    "downloads.clearCompleted": "Clear completed",
    "downloads.empty": "No downloads yet",
    "downloads.emptyHint":
      "Hit the download button on a search result and tasks will show up here",
    "downloads.status.waiting": "Waiting",
    "downloads.status.downloading": "Downloading",
    "downloads.status.completed": "Completed",
    "downloads.status.error": "Failed",

    // Playlist
    "playlist.notFound": "Playlist not found",
    "playlist.count": "({count} songs)",
    "playlist.addToQueue": "Add to queue",
    "playlist.delete": "Delete playlist",
    "playlist.empty": "This playlist has no songs yet",

    // Player bar
    "player.empty": "Nothing playing",
    "player.failed": "Playback failed",
    "player.lyrics": "Lyrics",
    "player.queue": "Play queue",
    "player.searchOther": "Search on another platform",
    "playMode.sequence": "Sequential",
    "playMode.shuffle": "Shuffle",
    "playMode.repeat-list": "Repeat all",
    "playMode.repeat-one": "Repeat one",

    // Play queue
    "queue.title": "Play queue",
    "queue.count": "{count} songs",
    "queue.clear": "Clear",
    "queue.clearConfirmTitle": "Clear the play queue?",
    "queue.clearConfirmDesc": "This removes all songs from the queue (your favorites are unaffected).",
    "queue.empty": "Queue is empty",
    "queue.emptyHint": "Songs you play or add will appear here",

    // Lyrics panel
    "lyrics.empty": "No lyrics",
    "lyrics.selectSong": "Select a song",
    "lyrics.noCover": "No Cover",

    // Settings
    "settings.title": "Settings",
    "settings.tab.sources": "Sources",
    "settings.tab.playback": "Playback",
    "settings.tab.download": "Download",
    "settings.tab.cache": "Cache",
    "settings.tab.shortcuts": "Shortcuts",
    "settings.tab.appearance": "Appearance",
    "settings.tab.data": "Data",
    "settings.tab.about": "About",
    "settings.about.version": "Version {version}",
    "settings.about.description": "A cross-platform music aggregator",
    "about.checkUpdate": "Check for updates",
    "about.upToDate": "You're on the latest version",
    "about.checkFailed": "Update check failed: {msg}",
    "about.updateTitle": "Update available",
    "about.updateDesc": "Version v{version} is available. Click to download the installer from GitHub.",
    "about.download": "Download",

    // Quality labels
    "quality.128k": "Standard 128k",
    "quality.320k": "High 320k",
    "quality.flac": "Lossless FLAC",
    "quality.flac24bit": "Hi-Res",

    // Playback & download settings
    "playback.playQualityTitle": "Playback quality",
    "playback.playQualityDesc": "Preferred quality when playing; if unavailable, it automatically steps down until one works.",
    "playback.downloadQualityTitle": "Download quality",
    "playback.downloadQualityDesc": "Preferred quality when downloading; if unavailable, it automatically steps down until one works.",
    "playback.preventSleepTitle": "Prevent sleep while playing",
    "playback.preventSleepDesc": "Keep the system awake while music plays, but still allow the display to turn off / lock. Released automatically when paused or stopped.",
    "close.behaviorTitle": "Close button behavior",
    "close.behaviorDesc": "When you click the window close button: quit the app outright, or minimize to the system tray and keep running in the background.",
    "close.opt.exit": "Quit",
    "close.opt.tray": "Minimize to tray",
    "close.confirmTitle": "Quit Museek?",
    "close.confirmDesc": "Closing will quit the app. You can switch to minimize-to-tray in Settings → Playback.",
    "close.dontRemind": "Don't remind me again",
    "close.exitNow": "Quit",
    "shortcuts.title": "Keyboard shortcuts",
    "shortcuts.desc": "Control playback from the keyboard; ignored while typing in a text field.",
    "shortcuts.playPause": "Play / pause",
    "shortcuts.seek": "Seek back / forward 5s",
    "shortcuts.prevNext": "Previous / next track",
    "shortcuts.volume": "Volume up / down",
    "shortcuts.mute": "Mute toggle",
    "shortcuts.lyrics": "Lyrics view",
    "download.locationTitle": "Download location",
    "download.locationDesc": "Where downloaded song files are saved.",
    "download.defaultLocation": "Default (app data folder)",
    "download.notSet": "Not set — choose a folder",
    "download.choose": "Choose folder",
    "download.reset": "Reset",
    "download.clearLocation": "Clear location",
    "download.noLocationTitle": "Download location not set",
    "download.noLocationDesc": "Before downloading, choose where files are saved in Settings → Download.",
    "download.noLocationError": "No download location set — choose one in Settings.",
    "download.goToSettings": "Go to settings",
    "download.concurrencyTitle": "Concurrent downloads",
    "download.concurrencyDesc": "How many downloads run at once (up to 5, default 1).",
    "download.namingTitle": "File naming",
    "download.namingDesc": "How downloaded files are named.",
    "naming.singer-name": "Artist - Title",
    "naming.name-singer": "Title - Artist",
    "naming.name": "Title",
    "player.qualityDowngraded": "Quality unavailable — using “{quality}”",
    "download.qualityDowngraded": "“{name}” quality unavailable — using “{quality}”",
    "download.added": "Added to downloads: {name}",
    "download.complete": "Download complete: {name}",
    "download.openFolder": "Open download folder",
    "download.openFolderFailed": "Failed to open folder: {msg}",

    // Cache
    "cache.title": "Cache",
    "cache.desc": "Cache audio and lyrics for faster replays and offline playback; the least-recently-used audio is cleared automatically when over the limit. Cover images are cached by the system.",
    "cache.audioTitle": "Cache played audio",
    "cache.maxTitle": "Cache limit",
    "cache.maxDesc": "Maximum disk space the audio cache may use; oldest unused files are cleared beyond it.",
    "cache.current": "In use: {size}",
    "cache.clear": "Clear cache",
    "cache.clearConfirmTitle": "Clear cache?",
    "cache.clearConfirmDesc": "This deletes all cached audio and lyrics. Your favorites and downloaded files are unaffected, but these songs will be re-fetched online next time you play them.",
    "cache.clearConfirm": "Clear",

    // Config import / export
    "data.title": "Config sync",
    "data.desc": "Export all settings, sources, favorites, search history and appearance as one JSON file, then import it on another device to sync.",
    "data.export": "Export config",
    "data.import": "Import config",
    "data.note": "Excludes the audio/image cache and downloaded files.",
    "data.exportDone": "Config exported",
    "data.invalid": "Invalid config file",
    "data.failed": "Operation failed: {msg}",
    "data.importConfirmTitle": "Import config?",
    "data.importConfirmDesc": "This overwrites all current settings, sources, favorites, etc. with the file's data, and the app will reload when done.",
    "data.importConfirm": "Import & reload",
    "sync.title": "Folder sync",
    "sync.desc": "Pick a folder a cloud client (Baidu Netdisk / OneDrive / iCloud Drive, etc.) already syncs; your config is encrypted and stored there automatically. Museek auto-pulls a newer backup on launch and backs up on quit (toggle below). Point another device at the same folder to sync — no login, no passphrase to set.",
    "sync.noFolder": "No sync folder selected",
    "sync.choose": "Choose folder",
    "sync.passphrasePlaceholder": "Encryption passphrase (required to restore)",
    "sync.backup": "Back up to folder",
    "sync.restore": "Restore from folder",
    "sync.note": "The synced file is stored encrypted (not plaintext); privacy relies on your cloud account's access control. Only settings / sources / favorites / search history sync — not the cache or downloads. Backup file: museek-config.enc.json.",
    "sync.autoBackupOnExit": "Automatically back up to the sync folder on quit",
    "sync.backupBeforeQuit": "Back up to the sync folder before quitting",
    "sync.backupDone": "Encrypted backup written to the sync folder",
    "sync.noBackup": "No backup file found in that folder",
    "sync.wrongPass": "Couldn't decrypt the backup (corrupted or from an old version)",

    // Source manager
    "sources.title": "Source management",
    "sources.hint":
      "Paste the link to an lx-music compatible source (.js) to import it.\nWith several sources enabled, playback retries them in list order (top to bottom) until one succeeds.",
    "sources.urlPlaceholder":
      "e.g. https://ghproxy.net/raw.githubusercontent.com/.../latest.js",
    "sources.paste": "Paste from clipboard",
    "sources.import": "Import",
    "sources.empty": "No sources imported",
    "sources.emptyHint":
      "Once imported, Museek uses the source script to fetch playback links",
    "sources.author": "Author: {name}",
    "sources.platforms": "Platforms: {list}",
    "sources.count": "{total} total · {enabled} enabled",
    // Errors surfaced by the source store / runner
    "sources.err.downloadHttp": "Download failed: HTTP {status}",
    "sources.err.downloadFailed": "Failed to download source: {msg}",
    "sources.err.notAScript":
      "The link did not return a valid source script (it may be a web page or error page)",
    "sources.err.loadFailed": 'Failed to load source "{name}": {msg}',
    "sources.err.noEnabled": "No enabled sources",
    "sources.err.allFailed": "All sources failed → {errors}",
    "sources.err.invalidUrl": "{name}: returned an invalid link",
    "sources.err.tooSmall": "{name}: returned a likely trial/restricted clip (too small)",
    "sources.err.sourceMsg": "{name}: {msg}",

    // Theme settings
    "theme.modeTitle": "Appearance mode",
    "theme.modeDesc": "Choose light, dark, or follow the system setting.",
    "theme.mode.system": "System",
    "theme.mode.light": "Light",
    "theme.mode.dark": "Dark",
    "theme.paletteTitle": "Accent color",
    "theme.paletteDesc":
      "Pick an accent color for buttons, highlights and more.",
    "palette.default": "Graphite",
    "palette.violet": "Violet",
    "palette.blue": "Ocean",
    "palette.emerald": "Emerald",
    "palette.rose": "Rose",
    "palette.amber": "Amber",

    // Language switcher
    "lang.title": "语言 / Language",
    "lang.desc": "Choose the interface language.",
    "lang.zh": "简体中文",
    "lang.en": "English",

    // Player errors (surfaced in UI)
    "player.err.network":
      "Could not connect to the source server. Check your network/proxy or switch sources ({msg})",
    "player.err.unknown": "Unknown error",
    "player.failedDetail": "Playback failed: {msg}",
    "player.noSource": "No source enabled — can't play",
    "player.goImport": "Import",
    "lyrics.fontIncrease": "Increase font size",
    "lyrics.fontDecrease": "Decrease font size",
  },
};

/** Interpolate `{name}` placeholders in a template with the given vars. */
function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}

/** Resolve a key for a given language, falling back to zh, then the key itself. */
function translate(
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const template = dict[lang][key] ?? dict.zh[key] ?? key;
  return interpolate(template, vars);
}

/**
 * Hook for components: subscribes to the language store so the component
 * re-renders when the language changes, and returns a `t` function.
 */
export function useT() {
  const lang = useLangStore((s) => s.lang);
  return (key: string, vars?: Record<string, string | number>) =>
    translate(lang, key, vars);
}

/**
 * Standalone translator for use outside React components (e.g. zustand stores).
 * Reads the current language from the store at call time.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  return translate(useLangStore.getState().lang, key, vars);
}
