use souvlaki::{MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, PlatformConfig};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

// OS media controls (Windows SMTC / macOS Now Playing / Linux MPRIS) — the media
// flyout / lock-screen play-pause-next-prev. MediaControls isn't Send/Sync on
// Windows (raw window + COM handles); we only touch it from `media_update` behind
// a Mutex. Stored as an Option so the command still runs (and can update the
// Windows taskbar toolbar) even if SMTC failed to initialize.
struct MediaState(Mutex<Option<MediaControls>>);
unsafe impl Send for MediaState {}
unsafe impl Sync for MediaState {}

#[tauri::command]
fn media_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, MediaState>,
    title: String,
    artist: String,
    album: String,
    cover: Option<String>,
    playing: bool,
) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(controls) = guard.as_mut() {
            let _ = controls.set_metadata(MediaMetadata {
                title: Some(&title),
                artist: Some(&artist),
                album: Some(&album),
                cover_url: cover.as_deref(),
                ..Default::default()
            });
            let _ = controls.set_playback(if playing {
                MediaPlayback::Playing { progress: None }
            } else {
                MediaPlayback::Paused { progress: None }
            });
        }
    }
    // Reflect the play/pause state on the Windows taskbar thumbnail toolbar too.
    #[cfg(target_os = "windows")]
    taskbar::set_playing(&app, playing);
    #[cfg(not(target_os = "windows"))]
    let _ = &app;
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

// Bring the main window back from hidden / minimized and focus it.
fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn build_tray(app: &tauri::AppHandle) -> tauri::Result<TrayIcon> {
    let show_item = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("Museek")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
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
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.manage(KeepAwakeState(Mutex::new(None)));

            let app_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                // Windows: add prev / play-pause / next buttons to the taskbar
                // thumbnail toolbar (shown when hovering the taskbar icon).
                #[cfg(target_os = "windows")]
                if let Ok(h) = window.hwnd() {
                    taskbar::install(h.0 as *mut std::ffi::c_void, app_handle.clone());
                }

                #[cfg(target_os = "windows")]
                let hwnd = window.hwnd().ok().map(|h| h.0 as *mut std::ffi::c_void);
                #[cfg(not(target_os = "windows"))]
                let hwnd = None;
                // `window` is only read on Windows (hwnd); mark it used elsewhere.
                #[cfg(not(target_os = "windows"))]
                let _ = &window;

                let config = PlatformConfig {
                    dbus_name: "museek",
                    display_name: "Museek",
                    hwnd,
                };

                let controls = MediaControls::new(config).ok().map(|mut controls| {
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
                    // Set an initial state so the controls register with the OS.
                    let _ = controls.set_playback(MediaPlayback::Paused { progress: None });
                    controls
                });
                app.manage(MediaState(Mutex::new(controls)));
            }

            // The system tray is created on demand (only in "hide to tray" close
            // mode) — the frontend calls set_tray_visible after loading settings.

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            media_update,
            set_prevent_sleep,
            quit_app,
            set_tray_visible
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
        DefSubclassProc, SetWindowSubclass, ITaskbarList3, TaskbarList, THBF_ENABLED, THB_FLAGS,
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
                        let _ = list.HrInit();
                        self.list = Some(list);
                    }
                    Err(_) => return,
                }
            }
            let list = match &self.list {
                Some(l) => l.clone(),
                None => return,
            };
            let buttons = self.buttons();
            if !self.added {
                if list.ThumbBarAddButtons(self.hwnd, &buttons).is_ok() {
                    self.added = true;
                }
            } else {
                let _ = list.ThumbBarUpdateButtons(self.hwnd, &buttons);
            }
        }
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
