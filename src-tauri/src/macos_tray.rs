use std::sync::atomic::{AtomicU8, Ordering};
use std::time::Duration;

use objc2_app_kit::NSAppearanceCustomization;
use objc2_foundation::{ns_string, MainThreadMarker, NSArray, NSString};
use tauri::tray::TrayIcon;
use tauri::AppHandle;

static LAST_APPEARANCE: AtomicU8 = AtomicU8::new(0);

fn status_bar_prefers_dark(tray: &TrayIcon) -> Option<bool> {
    tray.with_inner_tray_icon(|inner| {
        let status_item = inner.ns_status_item()?;
        let marker = MainThreadMarker::new()?;
        let button = status_item.button(marker)?;
        let appearance = button.effectiveAppearance();
        let aqua = ns_string!("NSAppearanceNameAqua");
        let dark_aqua = ns_string!("NSAppearanceNameDarkAqua");
        let names = NSArray::from_slice(&[aqua, dark_aqua]);
        let match_name = appearance.bestMatchFromAppearancesWithNames(&names)?;
        let match_name: &NSString = match_name.as_ref();
        Some(match_name == dark_aqua)
    })
    .ok()
    .flatten()
}

fn sync_tray_icon(app: &AppHandle, force: bool) {
    let Some(tray) = app.tray_by_id("main-tray") else {
        return;
    };
    let Some(dark) = status_bar_prefers_dark(&tray) else {
        return;
    };
    let value = if dark { 2 } else { 1 };
    if !force && LAST_APPEARANCE.swap(value, Ordering::Relaxed) == value {
        return;
    }
    LAST_APPEARANCE.store(value, Ordering::Relaxed);

    let bytes: &[u8] = if dark {
        include_bytes!("../icons/tray-dark@2x.png")
    } else {
        include_bytes!("../icons/tray-light@2x.png")
    };
    if let Ok(icon) = tauri::image::Image::from_bytes(bytes) {
        let _ = tray.set_icon(Some(icon));
    }
}

pub fn sync_after_build(app: &AppHandle) {
    sync_tray_icon(app, true);
}

pub fn observe_appearance(app: &AppHandle) {
    // A wallpaper appearance change does not reliably emit an application
    // theme notification. Poll the status-bar button itself so this stays
    // independent from the main window's appearance.
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(250));
        let dispatch_handle = app.clone();
        let refresh_handle = app.clone();
        if dispatch_handle
            .run_on_main_thread(move || sync_tray_icon(&refresh_handle, false))
            .is_err()
        {
            break;
        }
    });
}
