//! List installed font family names for the in-app font picker.

#[cfg(target_os = "windows")]
mod windows_impl {
    use std::collections::HashSet;
    use windows::Win32::Foundation::LPARAM;
    use windows::Win32::Graphics::Gdi::{
        EnumFontFamiliesExW, GetDC, ReleaseDC, DEFAULT_CHARSET, LOGFONTW, RASTER_FONTTYPE,
        SYMBOL_CHARSET, TEXTMETRICW,
    };

    fn face_name(buf: &[u16]) -> String {
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        String::from_utf16_lossy(&buf[..end]).trim().to_string()
    }

    unsafe extern "system" fn enum_proc(
        lpelfe: *const LOGFONTW,
        _lpntme: *const TEXTMETRICW,
        font_type: u32,
        lparam: LPARAM,
    ) -> i32 {
        if lpelfe.is_null() {
            return 1;
        }
        if font_type & RASTER_FONTTYPE != 0 {
            return 1;
        }
        let logfont = unsafe { &*lpelfe };
        if logfont.lfCharSet == SYMBOL_CHARSET {
            return 1;
        }
        let name = face_name(&logfont.lfFaceName);
        if name.is_empty() || name.starts_with('@') {
            return 1;
        }
        let names = unsafe { &mut *(lparam.0 as *mut HashSet<String>) };
        names.insert(name);
        1
    }

    pub fn list() -> Vec<String> {
        let mut names = HashSet::new();
        unsafe {
            let hdc = GetDC(None);
            if hdc.0.is_null() {
                return Vec::new();
            }
            let mut logfont = LOGFONTW {
                lfCharSet: DEFAULT_CHARSET,
                ..Default::default()
            };
            let _ = EnumFontFamiliesExW(
                hdc,
                &mut logfont,
                Some(enum_proc),
                LPARAM(&mut names as *mut HashSet<String> as isize),
                0,
            );
            let _ = ReleaseDC(None, hdc);
        }
        let mut list: Vec<String> = names.into_iter().collect();
        list.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
        list
    }
}

#[cfg(target_os = "macos")]
mod macos_impl {
    use objc2_app_kit::NSFontManager;

    pub fn list() -> Vec<String> {
        unsafe {
            let manager = NSFontManager::sharedFontManager();
            let families = manager.availableFontFamilies();
            let mut list: Vec<String> = families.iter().map(|name| name.to_string()).collect();
            list.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
            list
        }
    }
}

pub fn list_font_families() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        windows_impl::list()
    }
    #[cfg(target_os = "macos")]
    {
        macos_impl::list()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Vec::new()
    }
}
