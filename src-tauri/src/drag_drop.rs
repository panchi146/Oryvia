//! OS drop target for the notch (files), using Windows OLE `IDropTarget` and
//! `EnumChildWindows` registration adapted from Nectar / Bloom by Sehajveer Singh (GPLv3).

use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use windows::core::{implement, Result, Ref};
use windows::Win32::Foundation::{HWND, LPARAM, POINT, POINTL};
use windows::Win32::Graphics::Gdi::ScreenToClient;
use windows::Win32::System::Com::{IDataObject, DVASPECT_CONTENT, FORMATETC, TYMED_HGLOBAL};
use windows::Win32::System::Ole::{
    IDropTarget, IDropTarget_Impl, RegisterDragDrop, ReleaseStgMedium, RevokeDragDrop,
    CF_HDROP, DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_NONE,
};
use windows::Win32::System::SystemServices::MODIFIERKEYS_FLAGS;
use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};
use windows::Win32::UI::WindowsAndMessaging::EnumChildWindows;

static IS_NOTCH_DRAG_ACTIVE: AtomicBool = AtomicBool::new(false);
static ACTIVE_DROP_TARGETS: AtomicUsize = AtomicUsize::new(0);

pub fn is_notch_drag_active() -> bool {
    IS_NOTCH_DRAG_ACTIVE.load(Ordering::Relaxed)
}

unsafe fn extract_file_paths(data_obj: Ref<'_, IDataObject>) -> Vec<String> {
    let drop_format = FORMATETC {
        cfFormat: CF_HDROP.0,
        ptd: std::ptr::null_mut(),
        dwAspect: DVASPECT_CONTENT.0,
        lindex: -1,
        tymed: TYMED_HGLOBAL.0 as u32,
    };

    let Ok(mut medium) = data_obj.as_ref().expect("Null IDataObject").GetData(&drop_format) else {
        return Vec::new();
    };

    let hdrop = HDROP(medium.u.hGlobal.0 as _);
    let item_count = DragQueryFileW(hdrop, 0xFFFFFFFF, None);
    let mut paths = Vec::with_capacity(item_count as usize);

    for i in 0..item_count {
        let character_count = DragQueryFileW(hdrop, i, None) as usize;
        let mut path_buf = vec![0u16; character_count + 1];
        DragQueryFileW(hdrop, i, Some(&mut path_buf));
        let path_str = OsString::from_wide(&path_buf[0..character_count]).to_string_lossy().to_string();
        paths.push(path_str);
    }

    let _ = ReleaseStgMedium(&mut medium);
    paths
}

fn is_point_in_notch(app_handle: &AppHandle, pt: &POINTL) -> bool {
    let main_rect_val = crate::state::main_window_rects().lock().ok().and_then(|m| m.get("main").copied());
    let Some((win_pos, _)) = main_rect_val else { return false };
    let Ok(region) = crate::state::notch_rects().lock() else { return false };
    let Some(r) = region.get("main").copied() else { return false };

    let scale = app_handle.get_webview_window("main").and_then(|w| w.scale_factor().ok()).unwrap_or(1.0);

    // If a drag session is underway, expand the allowable bounds to cover
    // the full potential Shortcuts Expanded area (at least 520px width, 180px height).
    // This eliminates false 'outside' detections while the island is animating
    // or when the user navigates across the Shortcuts bar icons.
    let is_drag_active = is_notch_drag_active();
    let (rw_css, rh_css, pad_x_css, pad_y_bottom_css) = if is_drag_active {
        (
            (r.width as f64).max(520.0),
            (r.height as f64).max(240.0),
            36.0,
            28.0,
        )
    } else {
        (
            r.width as f64,
            r.height as f64,
            24.0,
            16.0,
        )
    };

    let pad_x = (pad_x_css * scale) as i32;
    let pad_y_bottom = (pad_y_bottom_css * scale) as i32;

    let center_x_css = r.x as f64 + (r.width as f64) / 2.0;
    let rx_css = center_x_css - (rw_css / 2.0);

    let rx = win_pos.x + (rx_css * scale) as i32 - pad_x;
    let rw = (rw_css * scale) as i32 + (pad_x * 2);
    let ry_top = win_pos.y;
    let ry_bottom = win_pos.y + (rh_css * scale) as i32 + pad_y_bottom;

    pt.x >= rx && pt.x <= (rx + rw) && pt.y >= ry_top && pt.y <= ry_bottom
}

#[implement(IDropTarget)]
pub struct NotchDropTarget {
    hwnd: HWND,
    main_hwnd: HWND,
    app_handle: AppHandle,
    is_active: AtomicBool,
}

impl NotchDropTarget {
    pub fn new(hwnd: HWND, main_hwnd: HWND, app_handle: AppHandle) -> Self {
        Self {
            hwnd,
            main_hwnd,
            app_handle,
            is_active: AtomicBool::new(false),
        }
    }
}

impl IDropTarget_Impl for NotchDropTarget_Impl {
    fn DragEnter(
        &self,
        pdataobj: Ref<'_, IDataObject>,
        _grfkeystate: MODIFIERKEYS_FLAGS,
        pt: &POINTL,
        pdweffect: *mut DROPEFFECT,
    ) -> Result<()> {
        let inside = is_point_in_notch(&self.app_handle, pt);
        if !inside {
            self.is_active.store(false, Ordering::Relaxed);
            unsafe { *pdweffect = DROPEFFECT_NONE };
            return Ok(());
        }

        let paths = unsafe { extract_file_paths(pdataobj) };
        if paths.is_empty() {
            self.is_active.store(false, Ordering::Relaxed);
            unsafe { *pdweffect = DROPEFFECT_NONE };
            return Ok(());
        }

        ACTIVE_DROP_TARGETS.fetch_add(1, Ordering::Relaxed);
        self.is_active.store(true, Ordering::Relaxed);
        IS_NOTCH_DRAG_ACTIVE.store(true, Ordering::Relaxed);
        unsafe { *pdweffect = DROPEFFECT_COPY };

        let mut client_pt = POINT { x: pt.x, y: pt.y };
        let _ = unsafe { ScreenToClient(self.main_hwnd, &mut client_pt) };

        crate::diagnostics::log(&format!(
            "[NOTCH_DROP_TARGET] DragEnter hwnd=0x{:x} inside=true paths_count={} pos=({},{})",
            self.hwnd.0 as usize, paths.len(), client_pt.x, client_pt.y
        ));

        let _ = self.app_handle.emit_to(
            "main",
            "tauri://drag-enter",
            serde_json::json!({
                "paths": paths,
                "position": { "x": client_pt.x, "y": client_pt.y }
            }),
        );

        Ok(())
    }

    fn DragOver(
        &self,
        _grfkeystate: MODIFIERKEYS_FLAGS,
        pt: &POINTL,
        pdweffect: *mut DROPEFFECT,
    ) -> Result<()> {
        let inside = is_point_in_notch(&self.app_handle, pt);
        let was_active = self.is_active.load(Ordering::Relaxed);

        if inside {
            if !was_active {
                ACTIVE_DROP_TARGETS.fetch_add(1, Ordering::Relaxed);
            }
            self.is_active.store(true, Ordering::Relaxed);
            IS_NOTCH_DRAG_ACTIVE.store(true, Ordering::Relaxed);
            unsafe { *pdweffect = DROPEFFECT_COPY };

            let mut client_pt = POINT { x: pt.x, y: pt.y };
            let _ = unsafe { ScreenToClient(self.main_hwnd, &mut client_pt) };

            let _ = self.app_handle.emit_to(
                "main",
                "tauri://drag-over",
                serde_json::json!({
                    "position": { "x": client_pt.x, "y": client_pt.y }
                }),
            );
        } else {
            unsafe { *pdweffect = DROPEFFECT_NONE };

            if was_active {
                self.is_active.store(false, Ordering::Relaxed);
                let remaining = ACTIVE_DROP_TARGETS.fetch_sub(1, Ordering::Relaxed);
                if remaining <= 1 {
                    IS_NOTCH_DRAG_ACTIVE.store(false, Ordering::Relaxed);
                    crate::diagnostics::log(&format!(
                        "[NOTCH_DROP_TARGET] DragOver moved outside notch hwnd=0x{:x}",
                        self.hwnd.0 as usize
                    ));
                    let _ = self.app_handle.emit_to("main", "tauri://drag-leave", ());
                }
            }
        }

        Ok(())
    }

    fn DragLeave(&self) -> Result<()> {
        if self.is_active.swap(false, Ordering::Relaxed) {
            let remaining = ACTIVE_DROP_TARGETS.fetch_sub(1, Ordering::Relaxed);
            if remaining <= 1 {
                IS_NOTCH_DRAG_ACTIVE.store(false, Ordering::Relaxed);
                crate::diagnostics::log(&format!(
                    "[NOTCH_DROP_TARGET] DragLeave hwnd=0x{:x} (final target)",
                    self.hwnd.0 as usize
                ));
                let _ = self.app_handle.emit_to("main", "tauri://drag-leave", ());
            } else {
                crate::diagnostics::log(&format!(
                    "[NOTCH_DROP_TARGET] DragLeave hwnd=0x{:x} (internal child transition, remaining={})",
                    self.hwnd.0 as usize, remaining - 1
                ));
            }
        }
        Ok(())
    }

    fn Drop(
        &self,
        pdataobj: Ref<'_, IDataObject>,
        _grfkeystate: MODIFIERKEYS_FLAGS,
        pt: &POINTL,
        pdweffect: *mut DROPEFFECT,
    ) -> Result<()> {
        let inside = is_point_in_notch(&self.app_handle, pt);
        self.is_active.store(false, Ordering::Relaxed);
        ACTIVE_DROP_TARGETS.store(0, Ordering::Relaxed);
        IS_NOTCH_DRAG_ACTIVE.store(false, Ordering::Relaxed);

        if !inside {
            unsafe { *pdweffect = DROPEFFECT_NONE };
            let _ = self.app_handle.emit_to("main", "tauri://drag-leave", ());
            return Ok(());
        }

        let paths = unsafe { extract_file_paths(pdataobj) };
        if paths.is_empty() {
            unsafe { *pdweffect = DROPEFFECT_NONE };
            return Ok(());
        }

        unsafe { *pdweffect = DROPEFFECT_COPY };

        let mut client_pt = POINT { x: pt.x, y: pt.y };
        let _ = unsafe { ScreenToClient(self.main_hwnd, &mut client_pt) };

        crate::diagnostics::log(&format!(
            "[NOTCH_DROP_TARGET] Drop hwnd=0x{:x} paths_count={} pos=({},{})",
            self.hwnd.0 as usize, paths.len(), client_pt.x, client_pt.y
        ));

        let _ = self.app_handle.emit_to(
            "main",
            "tauri://drag-drop",
            serde_json::json!({
                "paths": paths,
                "position": { "x": client_pt.x, "y": client_pt.y }
            }),
        );

        Ok(())
    }
}

#[allow(dead_code)]
pub struct SendDropTarget(pub IDropTarget);
unsafe impl Send for SendDropTarget {}
unsafe impl Sync for SendDropTarget {}

static DROP_TARGETS_HOLDER: Mutex<Vec<SendDropTarget>> = Mutex::new(Vec::new());

pub fn register_notch_drop_target(app_handle: &AppHandle) {
    let Some(main_win) = app_handle.get_webview_window("main") else { return };
    let Ok(main_hwnd) = main_win.hwnd() else { return };

    let mut holder = match DROP_TARGETS_HOLDER.lock() {
        Ok(h) => h,
        Err(e) => e.into_inner(),
    };
    holder.clear();
    ACTIVE_DROP_TARGETS.store(0, Ordering::Relaxed);

    // 1. Register on top-level main_hwnd
    let dt: IDropTarget = NotchDropTarget::new(main_hwnd, main_hwnd, app_handle.clone()).into();
    unsafe {
        let _ = RevokeDragDrop(main_hwnd);
        if RegisterDragDrop(main_hwnd, &dt).is_ok() {
            crate::diagnostics::log(&format!("[NOTCH_DROP_TARGET] Registered on main_hwnd 0x{:x}", main_hwnd.0 as usize));
            holder.push(SendDropTarget(dt));
        } else {
            crate::diagnostics::log(&format!("[NOTCH_DROP_TARGET] Failed to register on main_hwnd 0x{:x}", main_hwnd.0 as usize));
        }
    }

    // 2. Register on all child windows of main_hwnd (Chrome_WidgetWin_0, Chrome_RenderWidgetHostHWND, etc.)
    struct EnumState {
        main_hwnd: HWND,
        app_handle: AppHandle,
        targets: Vec<SendDropTarget>,
    }
    let mut state = EnumState {
        main_hwnd,
        app_handle: app_handle.clone(),
        targets: Vec::new(),
    };

    unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
        let state = &mut *(lparam.0 as *mut EnumState);
        let dt: IDropTarget = NotchDropTarget::new(hwnd, state.main_hwnd, state.app_handle.clone()).into();
        let _ = RevokeDragDrop(hwnd);
        if RegisterDragDrop(hwnd, &dt).is_ok() {
            crate::diagnostics::log(&format!("[NOTCH_DROP_TARGET] Registered on child HWND 0x{:x}", hwnd.0 as usize));
            state.targets.push(SendDropTarget(dt));
        }
        windows::core::BOOL(1)
    }

    unsafe {
        let lparam = LPARAM(&mut state as *mut EnumState as isize);
        let _ = EnumChildWindows(Some(main_hwnd), Some(enum_callback), lparam);
    }

    holder.extend(state.targets);
}
