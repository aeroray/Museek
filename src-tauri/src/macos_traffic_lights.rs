//! Keep Overlay traffic lights at the configured inset after AppKit relayouts.
//!
//! Tao/Wry re-inset buttons from the *current* close→miniaturize gap. After
//! display sleep, AppKit can reset only some buttons, so that gap inflates and
//! the lights walk right. We pin origin-to-origin spacing and reapply on wake.

use std::ptr::NonNull;
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject};
use objc2_app_kit::{
    NSWindow, NSWindowButton, NSWorkspace, NSWorkspaceDidWakeNotification,
    NSWorkspaceScreensDidWakeNotification,
};
use objc2_foundation::{NSNotification, NSNotificationCenter, NSObjectProtocol};
use tauri::{AppHandle, Manager, WebviewWindow, WindowEvent};

/// Keep in sync with `trafficLightPosition` in tauri.conf.json.
const TRAFFIC_LIGHT_X: f64 = 14.0;
const TRAFFIC_LIGHT_Y: f64 = 18.0;
/// macOS default origin-to-origin gap (12pt button + 8pt spacing).
const TRAFFIC_LIGHT_SPACING: f64 = 20.0;

struct TrafficLightObservers(Vec<Retained<ProtocolObject<dyn NSObjectProtocol>>>);

pub fn install(app: &AppHandle, window: &WebviewWindow) {
    apply(window);
    listen_window_events(window);
    observe_wake(app, window);
}

pub fn refresh_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        apply(&window);
    }
}

pub fn apply(window: &WebviewWindow) {
    let Ok(ptr) = window.ns_window() else {
        return;
    };
    if ptr.is_null() {
        return;
    }
    unsafe {
        inset_traffic_lights(&*(ptr as *const NSWindow));
    }
}

fn listen_window_events(window: &WebviewWindow) {
    let apply_window = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::ScaleFactorChanged { .. }
        | WindowEvent::ThemeChanged(_)
        | WindowEvent::Focused(true)
        | WindowEvent::Resized(_) => apply(&apply_window),
        _ => {}
    });
}

fn observe_wake(app: &AppHandle, window: &WebviewWindow) {
    let workspace = NSWorkspace::sharedWorkspace();
    let center = workspace.notificationCenter();
    let mut observers = Vec::new();
    for name in [
        NSWorkspaceScreensDidWakeNotification,
        NSWorkspaceDidWakeNotification,
    ] {
        observers.push(observe_notification(&center, name, window));
    }
    app.manage(TrafficLightObservers(observers));
}

fn observe_notification(
    center: &NSNotificationCenter,
    name: &objc2_foundation::NSNotificationName,
    window: &WebviewWindow,
) -> Retained<ProtocolObject<dyn NSObjectProtocol>> {
    let window = window.clone();
    let block = RcBlock::new(move |_notification: NonNull<NSNotification>| {
        schedule_refresh(&window);
    });
    unsafe {
        center.addObserverForName_object_queue_usingBlock(
            Some(name),
            None::<&AnyObject>,
            None,
            &block,
        )
    }
}

fn schedule_refresh(window: &WebviewWindow) {
    let apply_now = window.clone();
    let _ = window.run_on_main_thread(move || apply(&apply_now));
    for delay_ms in [80_u64, 400] {
        let window = window.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(delay_ms));
            let apply_window = window.clone();
            let _ = window.run_on_main_thread(move || apply(&apply_window));
        });
    }
}

unsafe fn inset_traffic_lights(window: &NSWindow) {
    let Some(close) = window.standardWindowButton(NSWindowButton::CloseButton) else {
        return;
    };
    let Some(miniaturize) = window.standardWindowButton(NSWindowButton::MiniaturizeButton) else {
        return;
    };
    let zoom = window.standardWindowButton(NSWindowButton::ZoomButton);

    let Some(button_row) = (unsafe { close.superview() }) else {
        return;
    };
    let Some(title_bar_container) = (unsafe { button_row.superview() }) else {
        return;
    };

    let close_rect = close.frame();
    let title_bar_frame_height = close_rect.size.height + TRAFFIC_LIGHT_Y;
    let mut title_bar_rect = title_bar_container.frame();
    title_bar_rect.size.height = title_bar_frame_height;
    let container_parent_height = unsafe { title_bar_container.superview() }
        .map(|parent| parent.frame().size.height)
        .unwrap_or_else(|| window.frame().size.height);
    title_bar_rect.origin.y = container_parent_height - title_bar_frame_height;
    title_bar_container.setFrame(title_bar_rect);

    let buttons = [Some(close), Some(miniaturize), zoom];
    for (i, button) in buttons.into_iter().flatten().enumerate() {
        let mut origin = button.frame().origin;
        origin.x = TRAFFIC_LIGHT_X + (i as f64 * TRAFFIC_LIGHT_SPACING);
        button.setFrameOrigin(origin);
    }
}
