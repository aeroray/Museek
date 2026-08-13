use lofty::config::WriteOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey, Tag, TagType};
use base64::Engine;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, PlatformConfig,
};
use std::io::Cursor;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_fs::FsExt;

const MAX_EMBEDDED_COVER_BYTES: usize = 10 * 1024 * 1024;

#[cfg(target_os = "windows")]
fn set_windows_app_user_model_id() {
    use windows::core::w;
    use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(w!("com.museek.app"));
    }
}

#[cfg(target_os = "windows")]
fn set_windows_media_app_id(hwnd: *mut std::ffi::c_void) {
    use windows::core::{factory, HSTRING};
    use windows::Media::SystemMediaTransportControls;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;

    let result = (|| -> windows::core::Result<()> {
        let interop = factory::<
            SystemMediaTransportControls,
            ISystemMediaTransportControlsInterop,
        >()?;
        let controls: SystemMediaTransportControls =
            unsafe { interop.GetForWindow(HWND(hwnd)) }?;
        let updater = controls.DisplayUpdater()?;
        updater.SetAppMediaId(&HSTRING::from("Museek"))?;
        updater.Update()?;
        Ok(())
    })();

    if let Err(error) = result {
        eprintln!("Failed to set Museek Windows media app identity: {error}");
    }
}

fn detect_embeddable_cover_mime(bytes: &[u8]) -> Option<&'static str> {
    // ID3 APIC is reliable for JPEG/PNG. WebP/GIF/BMP often make the whole tag write fail.
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("image/png");
    }
    None
}

const EMBED_CHUNK_BYTES: usize = 512 * 1024;

fn lofty_error(error: &dyn std::error::Error) -> String {
    let mut msg = error.to_string();
    let mut source = error.source();
    while let Some(inner) = source {
        msg.push_str(": ");
        msg.push_str(&inner.to_string());
        source = inner.source();
    }
    msg
}

fn load_embed_cover_bytes(bytes: Vec<u8>) -> Option<(Vec<u8>, &'static str)> {
    if bytes.is_empty() || bytes.len() > MAX_EMBEDDED_COVER_BYTES {
        return None;
    }
    let mime = detect_embeddable_cover_mime(&bytes)?;
    Some((bytes, mime))
}

fn load_embed_cover(cover_base64: Option<String>) -> Option<(Vec<u8>, &'static str)> {
    let cover_base64 = cover_base64.filter(|value| !value.trim().is_empty())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(cover_base64.trim())
        .ok()?;
    load_embed_cover_bytes(bytes)
}

fn decode_base64_chunks(chunks: Vec<String>) -> Result<Vec<u8>, String> {
    let mut audio = Vec::new();
    for chunk in chunks {
        let trimmed = chunk.trim();
        if trimmed.is_empty() {
            continue;
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(trimmed)
            .map_err(|error| error.to_string())?;
        audio.extend_from_slice(&bytes);
    }
    Ok(audio)
}

fn encode_base64_chunks(bytes: &[u8]) -> Vec<String> {
    bytes
        .chunks(EMBED_CHUNK_BYTES)
        .map(|chunk| base64::engine::general_purpose::STANDARD.encode(chunk))
        .collect()
}

fn apply_download_tags(
    tagged_file: &mut lofty::file::TaggedFile,
    title: &str,
    artist: &str,
    album: &str,
    lyrics: Option<&str>,
    cover: Option<&(Vec<u8>, &'static str)>,
) -> Result<(), String> {
    let tag_type = tagged_file.primary_tag_type();
    if !tagged_file.tag_support(tag_type).is_writable() {
        return Err(format!(
            "The audio format {:?} does not support writable metadata",
            tagged_file.file_type()
        ));
    }

    if tagged_file.primary_tag().is_none() {
        tagged_file.insert_tag(Tag::new(tag_type));
    }

    let tag = tagged_file
        .primary_tag_mut()
        .ok_or_else(|| "Could not create the audio metadata tag".to_string())?;
    if !title.trim().is_empty() {
        tag.set_title(title.to_string());
    }
    if !artist.trim().is_empty() {
        tag.set_artist(artist.to_string());
    }
    if !album.trim().is_empty() {
        tag.set_album(album.to_string());
    }
    if let Some(lyrics) = lyrics.filter(|value| !value.trim().is_empty()) {
        let lyrics = lyrics.replace('\0', "");
        let keys = if tag_type == TagType::Id3v2 {
            [ItemKey::UnsyncLyrics, ItemKey::Lyrics]
        } else {
            [ItemKey::Lyrics, ItemKey::UnsyncLyrics]
        };
        for key in keys {
            if tag.insert_text(key, lyrics.clone()) {
                break;
            }
        }
    }
    if let Some((cover, mime)) = cover {
        tag.remove_picture_type(PictureType::CoverFront);
        tag.push_picture(
            Picture::unchecked(cover.clone())
                .pic_type(PictureType::CoverFront)
                .mime_type(MimeType::from_str(mime))
                .build(),
        );
    }
    Ok(())
}

fn embed_audio_in_memory(
    audio: Vec<u8>,
    title: &str,
    artist: &str,
    album: &str,
    lyrics: Option<&str>,
    cover: Option<&(Vec<u8>, &'static str)>,
) -> Result<Vec<u8>, String> {
    let mut cursor = Cursor::new(audio);
    let mut tagged_file = Probe::new(&mut cursor)
        .guess_file_type()
        .map_err(|error| error.to_string())?
        .read()
        .map_err(|error| lofty_error(&error))?;
    apply_download_tags(&mut tagged_file, title, artist, album, lyrics, cover)?;
    tagged_file
        .save_to(&mut cursor, WriteOptions::default())
        .map_err(|error| error.to_string())?;
    Ok(cursor.into_inner())
}

#[tauri::command]
fn embed_download_metadata(
    audio_chunks_base64: Vec<String>,
    title: String,
    artist: String,
    album: String,
    lyrics: Option<String>,
    cover_base64: Option<String>,
) -> Result<Vec<String>, String> {
    let audio = decode_base64_chunks(audio_chunks_base64)?;
    if audio.is_empty() {
        return Err("Empty audio".to_string());
    }

    let cover = load_embed_cover(cover_base64);
    let lyrics = lyrics.filter(|value| !value.trim().is_empty());
    let attempts = [
        (lyrics.as_deref(), cover.as_ref()),
        (None, cover.as_ref()),
        (lyrics.as_deref(), None),
        (None, None),
    ];
    let mut last_error = None;
    let mut seen = Vec::new();
    for attempt in attempts {
        let key = (attempt.0.is_some(), attempt.1.is_some());
        if seen.contains(&key) {
            continue;
        }
        seen.push(key);
        match embed_audio_in_memory(
            audio.clone(),
            &title,
            &artist,
            &album,
            attempt.0,
            attempt.1,
        ) {
            Ok(tagged) => return Ok(encode_base64_chunks(&tagged)),
            Err(error) => last_error = Some(error),
        }
    }
    let error = last_error.unwrap_or_else(|| "Could not write embedded metadata".to_string());
    eprintln!("embed_download_metadata failed: {error}");
    Err(error)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod update_race;

// Native OS media controls for desktop platforms. Windows uses the native
// session so its app identity and metadata stay under our control.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
struct MediaState(Mutex<Option<MediaControls>>);
#[cfg(not(any(target_os = "android", target_os = "ios")))]
unsafe impl Send for MediaState {}
#[cfg(not(any(target_os = "android", target_os = "ios")))]
unsafe impl Sync for MediaState {}

#[tauri::command]
fn media_update(
    app: tauri::AppHandle,
    title: String,
    artist: String,
    album: String,
    cover: Option<String>,
    playing: bool,
) {
    let handle = app.clone();
    let update = move || {
        #[cfg(not(any(target_os = "android", target_os = "ios")))]
        {
            if let Ok(mut guard) = handle.state::<MediaState>().0.lock() {
                if let Some(controls) = guard.as_mut() {
                    let cover_url = cover.as_deref();

                    let _ = controls.set_metadata(MediaMetadata {
                        title: Some(&title),
                        artist: Some(&artist),
                        album: Some(&album),
                        cover_url,
                        ..Default::default()
                    });
                    let _ = controls.set_playback(if playing {
                        MediaPlayback::Playing { progress: None }
                    } else {
                        MediaPlayback::Paused { progress: None }
                    });
                }
            }
        }
        // Reflect the play/pause state on the Windows taskbar thumbnail toolbar too.
        #[cfg(target_os = "windows")]
        taskbar::set_playing(&handle, playing);
        // Keep the tray tooltip in sync with Now Playing (when the tray is shown).
        if let Some(tray) = handle.tray_by_id("main-tray") {
            let tip = if title.trim().is_empty() {
                "Museek".to_string()
            } else if artist.trim().is_empty() {
                format!("{title} — Museek")
            } else {
                format!("{artist} - {title}")
            };
            // Windows tray tooltips are short; truncate gracefully.
            let tip = if tip.chars().count() > 120 {
                format!("{}…", tip.chars().take(119).collect::<String>())
            } else {
                tip
            };
            let _ = tray.set_tooltip(Some(tip));
        }
    };

    #[cfg(target_os = "macos")]
    {
        let _ = app.run_on_main_thread(update);
    }
    #[cfg(not(target_os = "macos"))]
    update();
}

// Keep-awake: prevent the system from *sleeping* while music plays, but still let
// the display turn off / lock. On Windows we set ES_SYSTEM_REQUIRED (deliberately
// WITHOUT ES_DISPLAY_REQUIRED) on the long-lived main thread, since the flag is
// per-thread and cleared when that thread exits. On macOS we hold a `caffeinate -i`
// child (prevents idle *system* sleep, display may still sleep) that also auto-exits
// when our process does (`-w <pid>`), so a crash can't leak it.
#[cfg(target_os = "macos")]
struct KeepAwakeState(Mutex<Option<std::process::Child>>);

#[tauri::command]
fn set_prevent_sleep(app: tauri::AppHandle, enabled: bool) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::System::Power::{
            SetThreadExecutionState, ES_CONTINUOUS, ES_SYSTEM_REQUIRED, EXECUTION_STATE,
        };
        let _ = app.run_on_main_thread(move || unsafe {
            let flags = if enabled {
                EXECUTION_STATE(ES_CONTINUOUS.0 | ES_SYSTEM_REQUIRED.0)
            } else {
                ES_CONTINUOUS
            };
            SetThreadExecutionState(flags);
        });
    }
    #[cfg(target_os = "macos")]
    {
        let state = app.state::<KeepAwakeState>();
        // Bind the guard to a local (not an `if let` temporary) so it doesn't
        // outlive `state`; recover from poisoning rather than panicking.
        let mut guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
        if enabled {
            if guard.is_none() {
                let pid = std::process::id().to_string();
                if let Ok(child) = std::process::Command::new("caffeinate")
                    .args(["-i", "-w", pid.as_str()])
                    .spawn()
                {
                    *guard = Some(child);
                }
            }
        } else if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait(); // reap so repeated toggles don't leak zombies
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let _ = (app, enabled);
}

// Fully quit the app (used by the "exit" close-behavior / tray Quit). A plain
// window close can't be relied on to terminate the process while a tray icon is
// alive, so exit explicitly.
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Login-item / silent-start flags resolved once in setup.
struct LaunchFlags {
    #[allow(dead_code)]
    autostart: bool,
    /// Autostart + startHiddenToTray pref + no open-with audio → stay in tray.
    start_hidden: bool,
}

#[tauri::command]
fn is_autostart_launch(flags: tauri::State<'_, LaunchFlags>) -> bool {
    flags.autostart
}

#[tauri::command]
fn should_start_hidden(flags: tauri::State<'_, LaunchFlags>) -> bool {
    flags.start_hidden
}

/// Read `startHiddenToTray` from the same AppData settings.json the frontend uses.
fn read_start_hidden_to_tray(app: &tauri::AppHandle) -> bool {
    let Ok(dir) = app.path().app_data_dir() else {
        return false;
    };
    let path = dir.join("museek").join("settings.json");
    let Ok(text) = std::fs::read_to_string(path) else {
        return false;
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else {
        return false;
    };
    v.get("startHiddenToTray")
        .and_then(|x| x.as_bool())
        .unwrap_or(false)
}

/// macOS transparent + Overlay windows often keep `hasShadow` true but never
/// paint the shadow layer if it was set while the window was still invisible
/// (conf uses `shadow: false` for Windows). Toggle after `show()` forces AppKit
/// to rebuild it — same effect as hide-to-tray then reopen.
#[cfg(target_os = "macos")]
fn refresh_macos_window_shadow(window: &tauri::WebviewWindow) {
    let _ = window.set_shadow(false);
    let _ = window.set_shadow(true);
}

// Bring the main window back from hidden / minimized and focus it.
fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_skip_taskbar(false);
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        #[cfg(target_os = "macos")]
        refresh_macos_window_shadow(&w);
        // Windows blocks SetForegroundWindow unless we attach to the current
        // foreground thread — plain set_focus() often no-ops when Explorer
        // just handed us an "Open with" activation.
        #[cfg(target_os = "windows")]
        if let Ok(hwnd) = w.hwnd() {
            force_foreground_hwnd(hwnd.0 as *mut std::ffi::c_void);
        }
        // Fallback: flash the taskbar if focus still didn't stick.
        let _ = w.request_user_attention(Some(tauri::UserAttentionType::Informational));
    }
}

fn configure_lyrics_interaction(
    window: &tauri::WebviewWindow,
    interactive: bool,
    focus: bool,
) -> Result<(), String> {
    window
        .set_ignore_cursor_events(true)
        .map_err(|e| e.to_string())?;
    window
        .set_focusable(interactive)
        .map_err(|e| e.to_string())?;
    if interactive && focus {
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn show_lyrics_window(app: tauri::AppHandle, interactive: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("lyrics")
        .ok_or_else(|| "lyrics window missing".to_string())?;
    let _ = window.set_skip_taskbar(true);
    window.set_always_on_top(true).map_err(|e| e.to_string())?;
    configure_lyrics_interaction(&window, interactive, false)?;
    window.show().map_err(|e| e.to_string())?;
    if interactive {
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_lyrics_interaction(app: tauri::AppHandle, interactive: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("lyrics")
        .ok_or_else(|| "lyrics window missing".to_string())?;
    configure_lyrics_interaction(&window, interactive, false)
}

#[tauri::command]
fn hide_lyrics_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("lyrics") {
        let _ = window.hide();
    }
}

#[cfg(target_os = "windows")]
fn force_foreground_hwnd(hwnd_ptr: *mut std::ffi::c_void) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow,
        SetWindowPos, ShowWindow, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE,
        SWP_SHOWWINDOW, SW_RESTORE,
    };

    if hwnd_ptr.is_null() {
        return;
    }
    unsafe {
        let hwnd = HWND(hwnd_ptr);
        let _ = ShowWindow(hwnd, SW_RESTORE);

        let fg = GetForegroundWindow();
        let fg_tid = GetWindowThreadProcessId(fg, None);
        let cur_tid = GetCurrentThreadId();
        if fg_tid != 0 && fg_tid != cur_tid {
            let _ = AttachThreadInput(cur_tid, fg_tid, true);
        }
        let _ = BringWindowToTop(hwnd);
        let _ = SetForegroundWindow(hwnd);
        // Brief TOPMOST toggle forces Z-order above the file manager.
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
        );
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_NOTOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
        );
        if fg_tid != 0 && fg_tid != cur_tid {
            let _ = AttachThreadInput(cur_tid, fg_tid, false);
        }
    }
}

/// Audio extensions Museek can import as local library tracks.
fn is_local_audio_path(path: &std::path::Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .as_deref(),
        Some("mp3" | "flac" | "m4a" | "ogg" | "wav" | "aac")
    )
}

fn normalize_open_arg(raw: &str) -> Option<std::path::PathBuf> {
    let trimmed = raw.trim().trim_matches('"');
    if trimmed.is_empty() || trimmed.starts_with('-') {
        return None;
    }
    // Only parse real URLs. `Url::parse("C:/Users/a.mp3")` succeeds with scheme
    // "C" and would drop valid Windows forward-slash paths if we treated any
    // successful parse as a URL.
    let looks_like_url = trimmed.contains("://") || trimmed.to_ascii_lowercase().starts_with("file:");
    if looks_like_url {
        if let Ok(url) = url::Url::parse(trimmed) {
            if url.scheme() == "file" {
                return url.to_file_path().ok();
            }
            // Skip custom protocols / http(s).
            return None;
        }
    }
    Some(std::path::PathBuf::from(trimmed))
}

fn audio_paths_from_args(args: &[String]) -> Vec<String> {
    args.iter()
        .skip(1) // argv[0] is the executable
        .filter_map(|a| normalize_open_arg(a))
        .filter(|p| is_local_audio_path(p))
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

/// File-like argv entries that are not supported local-audio extensions (e.g. .wma).
fn unsupported_open_paths_from_args(args: &[String]) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter_map(|a| normalize_open_arg(a))
        .filter(|p| {
            p.extension().and_then(|e| e.to_str()).is_some() && !is_local_audio_path(p)
        })
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

/// Cold-start / concurrent opens may arrive before the webview listens.
struct PendingLocalFiles(Mutex<Vec<String>>);
struct PendingUnsupportedOpens(Mutex<Vec<String>>);

fn queue_open_local_files(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    // Open-with / argv paths never go through the dialog picker, so expand the
    // fs ACL for each file or exists()/readFile() will deny and surface as a
    // fake "permission" error in the UI.
    for p in &paths {
        let _ = app.fs_scope().allow_file(std::path::Path::new(p));
    }
    if let Ok(mut guard) = app.state::<PendingLocalFiles>().0.lock() {
        for p in &paths {
            if !guard.iter().any(|x| x == p) {
                guard.push(p.clone());
            }
        }
    }
    // Payload is unused — frontend always drains via `take_opened_local_files`
    // so event + cold-start take cannot double-import the same paths.
    let _ = app.emit("open-local-files", ());
}

fn queue_unsupported_opens(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    if let Ok(mut guard) = app.state::<PendingUnsupportedOpens>().0.lock() {
        for p in &paths {
            if !guard.iter().any(|x| x == p) {
                guard.push(p.clone());
            }
        }
    }
    let _ = app.emit("open-local-unsupported", ());
}

fn handle_os_open_args(app: &tauri::AppHandle, args: &[String]) {
    queue_open_local_files(app, audio_paths_from_args(args));
    queue_unsupported_opens(app, unsupported_open_paths_from_args(args));
}

/// Drain paths queued before the frontend subscribed to `open-local-files`.
#[tauri::command]
fn take_opened_local_files(app: tauri::AppHandle) -> Vec<String> {
    app.state::<PendingLocalFiles>()
        .0
        .lock()
        .map(|mut g| std::mem::take(&mut *g))
        .unwrap_or_default()
}

#[tauri::command]
fn take_opened_unsupported_files(app: tauri::AppHandle) -> Vec<String> {
    app.state::<PendingUnsupportedOpens>()
        .0
        .lock()
        .map(|mut g| std::mem::take(&mut *g))
        .unwrap_or_default()
}

fn build_tray(app: &tauri::AppHandle) -> tauri::Result<TrayIcon> {
    let prev_item = MenuItem::with_id(app, "prev", "上一首", true, None::<&str>)?;
    let toggle_item = MenuItem::with_id(app, "toggle", "播放 / 暂停", true, None::<&str>)?;
    let next_item = MenuItem::with_id(app, "next", "下一首", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let show_item = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &prev_item,
            &toggle_item,
            &next_item,
            &sep,
            &show_item,
            &quit_item,
        ],
    )?;
    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("Museek")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            // Same channel as SMTC / taskbar buttons → playerStore.attachMediaControls.
            "prev" => {
                let _ = app.emit("media-control", "previous");
            }
            "toggle" => {
                let _ = app.emit("media-control", "toggle");
            }
            "next" => {
                let _ = app.emit("media-control", "next");
            }
            "show" => show_main(app),
            // Route quit through the frontend so it can back up to the sync folder
            // first; the frontend then calls the quit_app command.
            "quit" => {
                let _ = app.emit("quit-requested", ());
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });

    // Prefer the theme-colored mark from the frontend (matches BrandMark /
    // --primary). Fall back to graphite light/dark or the window icon.
    if let Some(icon) = tray_mark_from_cache(app) {
        builder = builder.icon(icon);
    } else {
        #[cfg(target_os = "macos")]
        {
            builder = builder.icon(macos_graphite_tray_icon(current_system_theme(app))?);
        }
        #[cfg(not(target_os = "macos"))]
        {
            if let Some(icon) = app.default_window_icon() {
                builder = builder.icon(icon.clone());
            }
        }
    }

    builder.build(app)
}

/// Last tray PNG painted by the frontend from the active theme palette.
struct TrayMarkCache(Mutex<Option<Vec<u8>>>);

fn tray_mark_from_cache(app: &tauri::AppHandle) -> Option<tauri::image::Image<'static>> {
    let state = app.try_state::<TrayMarkCache>()?;
    let guard = state.0.lock().ok()?;
    let bytes = guard.as_ref()?;
    tauri::image::Image::from_bytes(bytes).ok()
}

#[tauri::command]
fn set_tray_mark_icon(app: tauri::AppHandle, png: Vec<u8>) -> Result<(), String> {
    if png.is_empty() {
        return Err("empty tray mark".into());
    }
    let icon = tauri::image::Image::from_bytes(&png).map_err(|e| e.to_string())?;
    if let Ok(mut guard) = app.state::<TrayMarkCache>().0.lock() {
        *guard = Some(png);
    }
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn current_system_theme(app: &tauri::AppHandle) -> tauri::Theme {
    app.get_webview_window("main")
        .and_then(|w| w.theme().ok())
        .unwrap_or(tauri::Theme::Light)
}

#[cfg(target_os = "macos")]
fn macos_graphite_tray_icon(theme: tauri::Theme) -> tauri::Result<tauri::image::Image<'static>> {
    // Fallback before the frontend has synced palette colors.
    let bytes: &[u8] = match theme {
        tauri::Theme::Dark => include_bytes!("../icons/tray-dark@2x.png"),
        _ => include_bytes!("../icons/tray-light@2x.png"),
    };
    tauri::image::Image::from_bytes(bytes)
}

// Show/hide the tray icon to match the "hide to tray" close-behavior setting.
// Tauri tracks the icon by id, so this is idempotent.
#[tauri::command]
fn set_tray_visible(app: tauri::AppHandle, visible: bool) {
    if visible {
        if app.tray_by_id("main-tray").is_none() {
            let _ = build_tray(&app);
        }
    } else {
        let _ = app.remove_tray_by_id("main-tray");
    }
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CapturedAudioDto {
    samples: Vec<f32>,
    sample_rate: u32,
    channel_count: u16,
    duration_ms: u64,
}

#[cfg(target_os = "windows")]
fn capture_windows_audio(mode: String, duration_ms: u64) -> Result<CapturedAudioDto, String> {
    use std::time::{Duration, Instant};
    use wasapi::{deinitialize, initialize_mta, DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat};

    let _ = initialize_mta();
    let result = (|| -> Result<CapturedAudioDto, String> {
        let enumerator = DeviceEnumerator::new().map_err(|error| error.to_string())?;
        let (device, direction) = match mode.as_str() {
            "microphone" => (
                enumerator
                    .get_default_device(&Direction::Capture)
                    .map_err(|error| error.to_string())?,
                Direction::Capture,
            ),
            "system" => (
                enumerator
                    .get_default_device(&Direction::Render)
                    .map_err(|error| error.to_string())?,
                Direction::Capture,
            ),
            _ => return Err("Unknown audio capture mode".to_string()),
        };
        let mut audio_client = device
            .get_iaudioclient()
            .map_err(|error| error.to_string())?;
        let desired_format = WaveFormat::new(32, 32, &SampleType::Float, 16_000, 1, None);
        let (_, min_time) = audio_client
            .get_device_period()
            .map_err(|error| error.to_string())?;
        let stream_mode = StreamMode::EventsShared {
            autoconvert: true,
            buffer_duration_hns: min_time,
        };
        audio_client
            .initialize_client(&desired_format, &direction, &stream_mode)
            .map_err(|error| error.to_string())?;
        let event = audio_client
            .set_get_eventhandle()
            .map_err(|error| error.to_string())?;
        let capture_client = audio_client
            .get_audiocaptureclient()
            .map_err(|error| error.to_string())?;
        let block_align = desired_format.get_blockalign() as usize;
        let target_samples = (16_000u64 * duration_ms / 1000).clamp(48_000, 192_000) as usize;
        let deadline = Instant::now()
            + Duration::from_millis(duration_ms.clamp(3_000, 12_000) + 2_000);
        let mut samples = Vec::with_capacity(target_samples);

        audio_client
            .start_stream()
            .map_err(|error| error.to_string())?;
        while samples.len() < target_samples && Instant::now() < deadline {
            while samples.len() < target_samples {
                let packet_frames = capture_client
                    .get_next_packet_size()
                    .map_err(|error| error.to_string())?
                    .unwrap_or(0);
                if packet_frames == 0 {
                    break;
                }
                let mut bytes = vec![0u8; packet_frames as usize * block_align];
                let (frames, info) = capture_client
                    .read_from_device(&mut bytes)
                    .map_err(|error| error.to_string())?;
                for frame in 0..frames as usize {
                    if info.flags.silent {
                        samples.push(0.0);
                    } else {
                        let start = frame * block_align;
                        let end = start + std::mem::size_of::<f32>();
                        samples.push(f32::from_ne_bytes(
                            bytes[start..end]
                                .try_into()
                                .map_err(|_| "Invalid audio sample".to_string())?,
                        ));
                    }
                    if samples.len() >= target_samples {
                        break;
                    }
                }
            }
            if samples.len() < target_samples {
                event
                    .wait_for_event(1000)
                    .map_err(|error| error.to_string())?;
            }
        }
        audio_client
            .stop_stream()
            .map_err(|error| error.to_string())?;
        if samples.is_empty() {
            return Err("No audio samples were captured".to_string());
        }
        samples.truncate(target_samples);
        Ok(CapturedAudioDto {
            duration_ms: samples.len() as u64 * 1000 / 16_000,
            samples,
            sample_rate: 16_000,
            channel_count: 1,
        })
    })();
    deinitialize();
    result
}

#[cfg(target_os = "macos")]
fn capture_macos_system_audio(duration_ms: u64) -> Result<CapturedAudioDto, String> {
    use screencapturekit::prelude::*;
    use std::sync::{Arc, Condvar, Mutex};
    use std::time::{Duration, Instant};

    const SAMPLE_RATE: usize = 16_000;
    let duration_ms = duration_ms.clamp(3_000, 12_000);
    let target_samples = (SAMPLE_RATE as u64 * duration_ms / 1000) as usize;
    let content = SCShareableContent::get().map_err(|error| error.to_string())?;
    let display = content
        .displays()
        .into_iter()
        .next()
        .ok_or_else(|| "No display is available for system audio capture".to_string())?;
    let filter = SCContentFilter::create()
        .with_display(&display)
        .with_excluding_windows(&[])
        .build();
    let configuration = SCStreamConfiguration::new()
        .with_captures_audio(true)
        .with_sample_rate(SAMPLE_RATE as i32)
        .with_channel_count(1);
    let captured = Arc::new((Mutex::new(Vec::with_capacity(target_samples)), Condvar::new()));
    let captured_for_handler = Arc::clone(&captured);
    let mut stream = SCStream::new(&filter, &configuration);
    let handler_registered = stream.add_output_handler(
        move |sample: CMSampleBuffer, _output_type: SCStreamOutputType| {
            let Some(audio_buffers) = sample.audio_buffer_list() else {
                return;
            };
            let (samples, ready) = &*captured_for_handler;
            let mut samples = samples.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            if samples.len() >= target_samples {
                return;
            }
            for buffer in audio_buffers.iter() {
                for bytes in buffer.data().chunks_exact(std::mem::size_of::<f32>()) {
                    samples.push(f32::from_ne_bytes(bytes.try_into().unwrap_or([0; 4])));
                    if samples.len() >= target_samples {
                        break;
                    }
                }
                if samples.len() >= target_samples {
                    break;
                }
            }
            ready.notify_one();
        },
        SCStreamOutputType::Audio,
    );
    if handler_registered.is_none() {
        return Err("Failed to register the macOS system audio output".to_string());
    }
    stream
        .start_capture()
        .map_err(|error| format!("Failed to start macOS system audio capture: {error}"))?;

    let deadline = Instant::now() + Duration::from_millis(duration_ms + 2_000);
    let (samples, ready) = &*captured;
    let mut samples = samples.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    while samples.len() < target_samples {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break;
        }
        let (guard, _) = ready
            .wait_timeout(samples, remaining)
            .map_err(|_| "System audio capture synchronization failed".to_string())?;
        samples = guard;
    }
    let result = if samples.is_empty() {
        Err("No system audio samples were captured. Grant Screen Recording permission and play audio before retrying.".to_string())
    } else {
        samples.truncate(target_samples);
        Ok(CapturedAudioDto {
            duration_ms: samples.len() as u64 * 1000 / SAMPLE_RATE as u64,
            samples: samples.clone(),
            sample_rate: SAMPLE_RATE as u32,
            channel_count: 1,
        })
    };
    drop(samples);
    stream
        .stop_capture()
        .map_err(|error| format!("Failed to stop macOS system audio capture: {error}"))?;
    result
}

#[tauri::command]
async fn capture_audio_clip(mode: String, duration_ms: u64) -> Result<CapturedAudioDto, String> {
    #[cfg(target_os = "windows")]
    {
        return tauri::async_runtime::spawn_blocking(move || {
            capture_windows_audio(mode, duration_ms)
        })
        .await
        .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        if mode == "system" {
            return tauri::async_runtime::spawn_blocking(move || {
                capture_macos_system_audio(duration_ms)
            })
            .await
            .map_err(|error| error.to_string())?;
        }
        let _ = mode;
        return Err("Native microphone capture is unavailable on macOS".to_string());
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (mode, duration_ms);
        Err("Native audio capture is currently available on Windows only".to_string())
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct OuterRectDto {
    x: i32,
    y: i32,
    w: u32,
    h: u32,
}

fn ease_out_expo(t: f64) -> f64 {
    if t >= 1.0 {
        1.0
    } else {
        1.0 - 2f64.powf(-10.0 * t)
    }
}

fn ease_in_out_cubic(t: f64) -> f64 {
    if t < 0.5 {
        4.0 * t * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
    }
}

fn ease_out_cubic(t: f64) -> f64 {
    1.0 - (1.0 - t).powi(3)
}

/// Morph the main window outer rect in-process (size+position per step, one IPC).
/// Avoids the JS rAF loop flooding `set_size`/`set_position` separately each frame.
#[tauri::command]
async fn animate_window_outer_rect(
    app: tauri::AppHandle,
    to: OuterRectDto,
    duration_ms: u32,
    ease: String,
) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window missing".to_string())?;

    let from_size = win.outer_size().map_err(|e| e.to_string())?;
    let from_pos = win.outer_position().map_err(|e| e.to_string())?;
    let from = OuterRectDto {
        x: from_pos.x,
        y: from_pos.y,
        w: from_size.width,
        h: from_size.height,
    };

    let apply = |r: &OuterRectDto| {
        let _ = win.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: r.w.max(1),
            height: r.h.max(1),
        }));
        let _ = win.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: r.x,
            y: r.y,
        }));
    };

    if (from.x - to.x).abs() < 2
        && (from.y - to.y).abs() < 2
        && (from.w as i32 - to.w as i32).abs() < 2
        && (from.h as i32 - to.h as i32).abs() < 2
    {
        apply(&to);
        return Ok(());
    }

    if duration_ms == 0 {
        apply(&to);
        return Ok(());
    }

    // Fixed keyframe count (~28ms) — predictable load on the OS compositor.
    let steps = ((duration_ms as f64 / 28.0).ceil() as u32).clamp(8, 12);
    let step_ms = (duration_ms / steps).max(1) as u64;
    let ease_fn = match ease.as_str() {
        "exit" => ease_in_out_cubic as fn(f64) -> f64,
        "peek" => ease_out_cubic as fn(f64) -> f64,
        _ => ease_out_expo as fn(f64) -> f64,
    };

    for i in 1..=steps {
        let t = i as f64 / steps as f64;
        let e = ease_fn(t);
        let r = OuterRectDto {
            x: (from.x as f64 + (to.x - from.x) as f64 * e).round() as i32,
            y: (from.y as f64 + (to.y - from.y) as f64 * e).round() as i32,
            w: (from.w as f64 + (to.w as f64 - from.w as f64) * e)
                .round()
                .max(1.0) as u32,
            h: (from.h as f64 + (to.h as f64 - from.h as f64) * e)
                .round()
                .max(1.0) as u32,
        };
        apply(&r);
        if i < steps {
            tokio::time::sleep(std::time::Duration::from_millis(step_ms)).await;
        }
    }
    apply(&to);
    Ok(())
}

/// Concurrent mirror race for the updater artifact, then signature-verified quiet install.
#[tauri::command]
async fn race_download_and_install(
    app: tauri::AppHandle,
    urls: Vec<String>,
) -> Result<(), String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, urls);
        Err("Updater is not available on this platform".into())
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        update_race::run(app, urls).await
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    set_windows_app_user_model_id();

    let mut builder = tauri::Builder::default();

    // Single-instance must register early: a second "Open with" should forward
    // file paths into the running app instead of spawning another Museek.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            handle_os_open_args(app, &argv);
            show_main(app);
        }));
    }

    let app = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            // Marks login-item launches so the frontend can optionally stay in tray.
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .manage(PendingLocalFiles(Mutex::new(Vec::new())))
        .manage(PendingUnsupportedOpens(Mutex::new(Vec::new())))
        .manage(TrayMarkCache(Mutex::new(None)))
        .setup(|app| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                use tauri::Emitter;
                use tauri_plugin_global_shortcut::{Builder, ShortcutState};

                let global_shortcut = Builder::new()
                    .with_shortcuts(["CommandOrControl+Shift+L"])
                    .expect("desktop lyrics global shortcut must be valid")
                    .with_handler(|app, _shortcut, event| {
                        if event.state == ShortcutState::Pressed {
                            let _ = app.emit("desktop-lyrics/toggle-interaction", ());
                        }
                    })
                    .build();
                if let Err(error) = app.handle().plugin(global_shortcut) {
                    eprintln!("Failed to register desktop lyrics global shortcut: {error}");
                }
            }

            #[cfg(target_os = "macos")]
            app.manage(KeepAwakeState(Mutex::new(None)));

            let args: Vec<String> = std::env::args().collect();
            let is_autostart = args.iter().any(|a| a == "--autostart");

            // Windows/Linux: cold-start "Open with" passes paths as argv.
            #[cfg(any(windows, target_os = "linux"))]
            {
                handle_os_open_args(app.handle(), &args);
            }

            let open_audio = audio_paths_from_args(&args);
            // Autostart + pref + no files to open → stay in tray (no window flash).
            let start_hidden = is_autostart
                && open_audio.is_empty()
                && read_start_hidden_to_tray(app.handle());
            app.manage(LaunchFlags {
                autostart: is_autostart,
                start_hidden,
            });

            let app_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                // Fully clear window + webview backplates so CSS corner pixels
                // show the desktop (not a square default fill). Alpha must be 0
                // on Windows 8+ for the webview layer.
                let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
                // Windows: keep shadow off — enabling it adds a 1px white border
                // and Win11 system rounding that fights CSS radius.
                // macOS: native shadow is fine with transparent windows and
                // avoids needing a CSS outer glow that bleeds into corners.
                //
                // Window chrome is platform-split:
                // - macOS: decorations + Overlay title bar → native traffic lights
                //   (configured in tauri.conf.json).
                // - Windows: strip decorations immediately for the custom
                //   WindowControls chrome (conf starts with decorations:true so
                //   macOS can show traffic lights at create-time).
                #[cfg(target_os = "macos")]
                {
                    // macOS Overlay chrome has no Windows-style decorated flash —
                    // show immediately so cold start feels instant again.
                    // Silent autostart: keep hidden until the user opens the tray.
                    //
                    // Do NOT set_shadow while still invisible: AppKit often skips
                    // drawing the shadow until a later hide→show (tray reopen).
                    // Apply after show, then again shortly after first composite.
                    if !start_hidden {
                        let _ = window.show();
                        let _ = window.set_focus();
                        refresh_macos_window_shadow(&window);
                        let w = window.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(120));
                            refresh_macos_window_shadow(&w);
                        });
                    }
                }
                // Non-macOS: frameless + custom WindowControls (conf uses
                // decorations:true only so macOS Overlay traffic lights exist).
                // Must run while still hidden (visible:false) so Windows never
                // flashes the native title bar.
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = window.set_decorations(false);
                }
                #[cfg(target_os = "windows")]
                {
                    let _ = window.set_shadow(false);
                }

                // Windows/Linux fallback if the frontend never calls show().
                // macOS is already shown above (unless silent autostart).
                #[cfg(not(target_os = "macos"))]
                if !start_hidden {
                    let w = window.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(4000));
                        let _ = w.show();
                    });
                }

                // Windows: add prev / play-pause / next buttons to the taskbar
                // thumbnail toolbar (shown when hovering the taskbar icon).
                #[cfg(target_os = "windows")]
                if let Ok(h) = window.hwnd() {
                    taskbar::install(h.0 as *mut std::ffi::c_void, app_handle.clone());
                }

                #[cfg(not(any(target_os = "android", target_os = "ios")))]
                {
                    let controls = {
                        #[cfg(target_os = "windows")]
                        {
                            window.hwnd().ok().and_then(|h| {
                                set_windows_media_app_id(h.0 as *mut std::ffi::c_void);
                                let config = PlatformConfig {
                                    dbus_name: "museek",
                                    display_name: "Museek",
                                    hwnd: Some(h.0 as *mut std::ffi::c_void),
                                };
                                MediaControls::new(config).ok().map(|mut controls| {
                                    let handle = app_handle.clone();
                                    let _ = controls.attach(move |event: MediaControlEvent| {
                                        let action = match event {
                                            MediaControlEvent::Play => "play",
                                            MediaControlEvent::Pause => "pause",
                                            MediaControlEvent::Toggle => "toggle",
                                            MediaControlEvent::Next => "next",
                                            MediaControlEvent::Previous => "previous",
                                            MediaControlEvent::Stop => "pause",
                                            _ => return,
                                        };
                                        let _ = handle.emit("media-control", action);
                                    });
                                    controls
                                })
                            })
                        }
                        #[cfg(not(target_os = "windows"))]
                        {
                            let config = PlatformConfig {
                                dbus_name: "museek",
                                display_name: "Museek",
                                hwnd: None,
                            };
                            MediaControls::new(config).ok().map(|mut controls| {
                                let handle = app_handle.clone();
                                let _ = controls.attach(move |event: MediaControlEvent| {
                                    let action = match event {
                                        MediaControlEvent::Play => "play",
                                        MediaControlEvent::Pause => "pause",
                                        MediaControlEvent::Toggle => "toggle",
                                        MediaControlEvent::Next => "next",
                                        MediaControlEvent::Previous => "previous",
                                        MediaControlEvent::Stop => "pause",
                                        _ => return,
                                    };
                                    let _ = handle.emit("media-control", action);
                                });
                                controls
                            })
                        }
                    };
                    app.manage(MediaState(Mutex::new(controls)));
                }
            }

            if let Some(window) = app.get_webview_window("lyrics") {
                let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
                #[cfg(target_os = "windows")]
                let _ = window.set_shadow(false);
            }

            // The system tray is created on demand (only in "hide to tray" close
            // mode) — the frontend calls set_tray_visible after loading settings.

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            embed_download_metadata,
            media_update,
            set_prevent_sleep,
            quit_app,
            set_tray_visible,
            capture_audio_clip,
            set_tray_mark_icon,
            show_lyrics_window,
            set_lyrics_interaction,
            hide_lyrics_window,
            animate_window_outer_rect,
            race_download_and_install,
            take_opened_local_files,
            take_opened_unsupported_files,
            is_autostart_launch,
            should_start_hidden
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // macOS "Open with" delivers file URLs here (not always as argv).
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = &event {
            let paths = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .collect::<Vec<_>>();
            let audio = paths
                .iter()
                .filter(|p| is_local_audio_path(p))
                .map(|p| p.to_string_lossy().into_owned())
                .collect::<Vec<_>>();
            let unsupported = paths
                .iter()
                .filter(|p| {
                    p.extension().and_then(|e| e.to_str()).is_some() && !is_local_audio_path(p)
                })
                .map(|p| p.to_string_lossy().into_owned())
                .collect::<Vec<_>>();
            queue_open_local_files(app_handle, audio);
            queue_unsupported_opens(app_handle, unsupported);
            show_main(app_handle);
        }
        // macOS: Dock click while all windows are hidden (e.g. close-to-tray)
        // fires applicationShouldHandleReopen → Reopen. Without this, the Dock
        // icon appears active but the main window stays hidden.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen {
            has_visible_windows,
            ..
        } = &event
        {
            if !has_visible_windows {
                show_main(app_handle);
            }
        }
        let _ = (app_handle, &event);
    });
}

// ---------------------------------------------------------------------------
// Windows taskbar thumbnail toolbar (ITaskbarList3::ThumbBarAddButtons).
// souvlaki gives the SMTC flyout; this adds the small prev/play/next buttons
// that appear under the taskbar thumbnail preview when hovering the icon.
// ---------------------------------------------------------------------------
#[cfg(target_os = "windows")]
mod taskbar {
    use std::cell::RefCell;
    use std::sync::OnceLock;
    use tauri::{AppHandle, Emitter};
    use windows::core::w;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::Graphics::Gdi::{
        CreateBitmap, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, BITMAPINFO,
        BITMAPINFOHEADER, DIB_RGB_COLORS, HBITMAP, HGDIOBJ,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
    use windows::Win32::UI::Shell::{
        DefSubclassProc, ITaskbarList3, SetWindowSubclass, TaskbarList, THBF_ENABLED, THB_FLAGS,
        THB_ICON, THB_TOOLTIP, THUMBBUTTON,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateIconIndirect, RegisterWindowMessageW, HICON, ICONINFO, WM_COMMAND,
    };

    const ID_PREV: u32 = 1;
    const ID_PLAYPAUSE: u32 = 2;
    const ID_NEXT: u32 = 3;
    const THBN_CLICKED: u32 = 0x1800;

    static APP: OnceLock<AppHandle> = OnceLock::new();
    static WM_TB_CREATED: OnceLock<u32> = OnceLock::new();

    thread_local! {
        static TB: RefCell<Option<TbState>> = const { RefCell::new(None) };
    }

    struct TbState {
        hwnd: HWND,
        list: Option<ITaskbarList3>,
        added: bool,
        playing: bool,
        icon_prev: HICON,
        icon_play: HICON,
        icon_pause: HICON,
        icon_next: HICON,
    }

    impl TbState {
        fn buttons(&self) -> [THUMBBUTTON; 3] {
            let (mid_icon, mid_tip) = if self.playing {
                (self.icon_pause, "暂停")
            } else {
                (self.icon_play, "播放")
            };
            [
                make_button(ID_PREV, self.icon_prev, "上一首"),
                make_button(ID_PLAYPAUSE, mid_icon, mid_tip),
                make_button(ID_NEXT, self.icon_next, "下一首"),
            ]
        }

        unsafe fn refresh(&mut self) {
            if self.list.is_none() {
                let created: windows::core::Result<ITaskbarList3> =
                    CoCreateInstance(&TaskbarList, None, CLSCTX_ALL);
                match created {
                    Ok(list) => {
                        if let Err(error) = list.HrInit() {
                            eprintln!("Failed to initialize Windows taskbar: {error}");
                            return;
                        }
                        self.list = Some(list);
                    }
                    Err(error) => {
                        eprintln!("Failed to create Windows taskbar interface: {error}");
                        return;
                    }
                }
            }
            let list = match &self.list {
                Some(l) => l.clone(),
                None => return,
            };
            let buttons = self.buttons();
            if !self.added {
                match list.ThumbBarAddButtons(self.hwnd, &buttons) {
                    Ok(()) => self.added = true,
                    Err(error) => {
                        eprintln!("Failed to add Windows taskbar buttons: {error}");
                    }
                }
            } else if let Err(error) = list.ThumbBarUpdateButtons(self.hwnd, &buttons) {
                self.added = false;
                eprintln!("Failed to update Windows taskbar buttons: {error}");
            }
        }
    }

    fn refresh_current() {
        TB.with(|c| {
            if let Some(state) = c.borrow_mut().as_mut() {
                unsafe { state.refresh() };
            }
        });
    }

    fn refresh_on_main_thread(app: &AppHandle) {
        let _ = app.run_on_main_thread(refresh_current);
    }

    fn schedule_refreshes(app: AppHandle) {
        std::thread::spawn(move || {
            for delay in [100_u64, 400, 1_000, 2_500, 5_000] {
                std::thread::sleep(std::time::Duration::from_millis(delay));
                refresh_on_main_thread(&app);
            }
        });
    }

    fn make_button(id: u32, icon: HICON, tip: &str) -> THUMBBUTTON {
        let mut b = THUMBBUTTON {
            dwMask: THB_ICON | THB_TOOLTIP | THB_FLAGS,
            iId: id,
            hIcon: icon,
            dwFlags: THBF_ENABLED,
            ..Default::default()
        };
        let mut idx = 0usize;
        for u in tip.encode_utf16() {
            if idx < b.szTip.len() - 1 {
                b.szTip[idx] = u;
                idx += 1;
            }
        }
        b.szTip[idx] = 0;
        b
    }

    // --- icon drawing (no asset files): plot white glyphs into a 32-bit DIB ---
    const N: usize = 32;
    #[inline]
    fn px(buf: &mut [u32], x: i32, y: i32) {
        if x >= 0 && y >= 0 && (x as usize) < N && (y as usize) < N {
            buf[y as usize * N + x as usize] = 0xFFFF_FFFF;
        }
    }
    fn plot_play(buf: &mut [u32]) {
        let (x0, x1, cy, h) = (11, 23, 16, 8);
        for y in 8..24 {
            let t = 1.0 - ((y - cy) as f32).abs() / h as f32;
            let xend = x0 + ((x1 - x0) as f32 * t).round() as i32;
            for x in x0..=xend {
                px(buf, x, y);
            }
        }
    }
    fn plot_pause(buf: &mut [u32]) {
        for y in 8..24 {
            for x in 10..14 {
                px(buf, x, y);
            }
            for x in 18..22 {
                px(buf, x, y);
            }
        }
    }
    fn plot_prev(buf: &mut [u32]) {
        for y in 8..24 {
            for x in 9..12 {
                px(buf, x, y);
            }
        }
        let (x0, x1, cy, h) = (13, 23, 16, 8);
        for y in 8..24 {
            let t = 1.0 - ((y - cy) as f32).abs() / h as f32;
            let xstart = x1 - ((x1 - x0) as f32 * t).round() as i32;
            for x in xstart..=x1 {
                px(buf, x, y);
            }
        }
    }
    fn plot_next(buf: &mut [u32]) {
        let (x0, x1, cy, h) = (9, 19, 16, 8);
        for y in 8..24 {
            let t = 1.0 - ((y - cy) as f32).abs() / h as f32;
            let xend = x0 + ((x1 - x0) as f32 * t).round() as i32;
            for x in x0..=xend {
                px(buf, x, y);
            }
        }
        for y in 8..24 {
            for x in 20..23 {
                px(buf, x, y);
            }
        }
    }

    unsafe fn make_icon(plot: fn(&mut [u32])) -> HICON {
        const SZ: i32 = 32;
        let mut bi = BITMAPINFO::default();
        bi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bi.bmiHeader.biWidth = SZ;
        bi.bmiHeader.biHeight = -SZ; // top-down
        bi.bmiHeader.biPlanes = 1;
        bi.bmiHeader.biBitCount = 32;
        bi.bmiHeader.biCompression = 0; // BI_RGB

        let dc = CreateCompatibleDC(None);
        let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
        let dib = match CreateDIBSection(Some(dc), &bi, DIB_RGB_COLORS, &mut bits, None, 0) {
            Ok(h) => h,
            Err(_) => {
                let _ = DeleteDC(dc);
                return HICON::default();
            }
        };
        if !bits.is_null() {
            let buf = std::slice::from_raw_parts_mut(bits as *mut u32, (SZ * SZ) as usize);
            for p in buf.iter_mut() {
                *p = 0;
            }
            plot(buf);
        }
        let mask: HBITMAP = CreateBitmap(SZ, SZ, 1, 1, None);
        let ii = ICONINFO {
            fIcon: true.into(),
            xHotspot: 0,
            yHotspot: 0,
            hbmMask: mask,
            hbmColor: dib,
        };
        let icon = CreateIconIndirect(&ii).unwrap_or_default();
        let _ = DeleteObject(HGDIOBJ(dib.0));
        let _ = DeleteObject(HGDIOBJ(mask.0));
        let _ = DeleteDC(dc);
        icon
    }

    unsafe extern "system" fn subclass_proc(
        hwnd: HWND,
        umsg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        let created = WM_TB_CREATED.get().copied().unwrap_or(0);
        if created != 0 && umsg == created {
            TB.with(|c| {
                if let Some(s) = c.borrow_mut().as_mut() {
                    s.list = None;
                    s.added = false;
                    s.refresh();
                }
            });
        } else if umsg == WM_COMMAND {
            let code = ((wparam.0 >> 16) & 0xFFFF) as u32;
            if code == THBN_CLICKED {
                let id = (wparam.0 & 0xFFFF) as u32;
                let action = match id {
                    ID_PREV => "previous",
                    ID_PLAYPAUSE => "toggle",
                    ID_NEXT => "next",
                    _ => "",
                };
                if !action.is_empty() {
                    if let Some(app) = APP.get() {
                        let _ = app.emit("media-control", action);
                    }
                    return LRESULT(0);
                }
            }
        }
        DefSubclassProc(hwnd, umsg, wparam, lparam)
    }

    /// Install the thumbnail toolbar on the given window (called once at startup,
    /// on the main thread). Best-effort: any failure leaves the app unaffected.
    pub fn install(hwnd_ptr: *mut std::ffi::c_void, app: AppHandle) {
        let retry_app = app.clone();
        let _ = APP.set(app);
        unsafe {
            let hwnd = HWND(hwnd_ptr);
            let msg = RegisterWindowMessageW(w!("TaskbarButtonCreated"));
            let _ = WM_TB_CREATED.set(msg);

            let state = TbState {
                hwnd,
                list: None,
                added: false,
                playing: false,
                icon_prev: make_icon(plot_prev),
                icon_play: make_icon(plot_play),
                icon_pause: make_icon(plot_pause),
                icon_next: make_icon(plot_next),
            };
            TB.with(|c| *c.borrow_mut() = Some(state));

            let _ = SetWindowSubclass(hwnd, Some(subclass_proc), 1, 0);

            // Try once now; the TaskbarButtonCreated message will retry once the
            // taskbar button actually exists.
            TB.with(|c| {
                if let Some(s) = c.borrow_mut().as_mut() {
                    s.refresh();
                }
            });
        }
        schedule_refreshes(retry_app);
    }

    /// Update the play/pause button to reflect the current state. Marshals onto
    /// the main thread because ITaskbarList3 is apartment-bound there.
    pub fn set_playing(app: &AppHandle, playing: bool) {
        let _ = app.run_on_main_thread(move || {
            TB.with(|c| {
                if let Some(s) = c.borrow_mut().as_mut() {
                    if s.playing != playing {
                        s.playing = playing;
                    }
                    unsafe { s.refresh() };
                }
            });
        });
    }
}
