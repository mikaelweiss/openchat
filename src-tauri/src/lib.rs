#![allow(unexpected_cfgs)] // objc v0.2 macros trigger this

mod ollama;
mod system_info;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod search;
#[cfg(target_os = "ios")]
mod keychain;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, Position, LogicalPosition, AppHandle};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::str::FromStr;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::sync::Mutex;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
static REGISTERED_SHORTCUTS: Mutex<Vec<String>> = Mutex::new(Vec::new());

#[cfg(target_os = "macos")]
static PREVIOUS_APP_PID: Mutex<Option<i32>> = Mutex::new(None);

#[cfg(target_os = "macos")]
static SHOW_DOCK_ICON: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(true);

#[cfg(target_os = "macos")]
fn save_frontmost_app() {
    use objc::{class, msg_send, sel, sel_impl};
    use objc::runtime::Object;
    unsafe {
        let workspace: *mut Object = msg_send![class!(NSWorkspace), sharedWorkspace];
        let frontmost: *mut Object = msg_send![workspace, frontmostApplication];
        if frontmost.is_null() {
            return;
        }
        let pid: i32 = msg_send![frontmost, processIdentifier];
        let our_pid = std::process::id() as i32;
        if pid != our_pid {
            if let Ok(mut prev) = PREVIOUS_APP_PID.lock() {
                *prev = Some(pid);
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn activate_previous_app() {
    use objc::{class, msg_send, sel, sel_impl};
    use objc::runtime::Object;
    if let Ok(mut prev) = PREVIOUS_APP_PID.lock() {
        if let Some(pid) = prev.take() {
            unsafe {
                let app: *mut Object = msg_send![
                    class!(NSRunningApplication),
                    runningApplicationWithProcessIdentifier: pid
                ];
                if !app.is_null() {
                    let _: bool = msg_send![app, activateWithOptions: 2usize];
                }
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn set_activation_policy_accessory() {
    use objc::{class, msg_send, sel, sel_impl};
    use objc::runtime::Object;
    unsafe {
        let app: *mut Object = msg_send![class!(NSApplication), sharedApplication];
        let _: () = msg_send![app, setActivationPolicy: 1i64]; // NSApplicationActivationPolicyAccessory = 1
    }
}

#[cfg(target_os = "macos")]
fn set_activation_policy_regular() {
    use objc::{class, msg_send, sel, sel_impl};
    use objc::runtime::Object;
    unsafe {
        let app: *mut Object = msg_send![class!(NSApplication), sharedApplication];
        let _: () = msg_send![app, setActivationPolicy: 0i64]; // NSApplicationActivationPolicyRegular = 0
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn toggle_mini_window(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("mini-chat") {
        let is_visible = window.is_visible()
            .map_err(|e| format!("Failed to check window visibility: {}", e))?;
        let is_focused = window.is_focused()
            .map_err(|e| format!("Failed to check window focus: {}", e))?;

        if is_visible && is_focused {
            #[cfg(target_os = "macos")]
            activate_previous_app();
            window.hide()
                .map_err(|e| format!("Failed to hide mini window: {}", e))?;
            Ok(false)
        } else {
            #[cfg(target_os = "macos")]
            save_frontmost_app();
            window.show()
                .map_err(|e| format!("Failed to show mini window: {}", e))?;
            window.set_focus()
                .map_err(|e| format!("Failed to focus mini window: {}", e))?;
            Ok(true)
        }
    } else {
        #[cfg(target_os = "macos")]
        save_frontmost_app();
        let mini_window = WebviewWindowBuilder::new(
            &app,
            "mini-chat",
            WebviewUrl::App("index.html?window=mini".into())
        )
        .title("Mini Chat")
        .hidden_title(true)
        .inner_size(400.0, 600.0)
        .min_inner_size(400.0, 400.0)
        .max_inner_size(600.0, 1200.0)
        .resizable(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .decorations(true)
        .build()
        .map_err(|e| format!("Failed to create mini window: {}", e))?;

        if let Err(e) = mini_window.set_visible_on_all_workspaces(true) {
            eprintln!("Warning: Failed to set mini window on all workspaces: {}", e);
        }

        if let Ok(monitor) = mini_window.primary_monitor() {
            if let Some(monitor) = monitor {
                let screen_size = monitor.size();
                let window_size = mini_window.inner_size().unwrap_or(tauri::PhysicalSize { width: 400, height: 600 });

                let x = screen_size.width as f64 - window_size.width as f64 - 80.0;
                let y = screen_size.height as f64 - window_size.height as f64 - 80.0;

                if let Err(e) = mini_window.set_position(Position::Physical(tauri::PhysicalPosition { x: x as i32, y: y as i32 })) {
                    eprintln!("Warning: Failed to set mini window position: {}", e);
                }
            } else {
                if let Err(e) = mini_window.set_position(Position::Logical(LogicalPosition { x: 100.0, y: 100.0 })) {
                    eprintln!("Warning: Failed to set fallback mini window position: {}", e);
                }
            }
        } else {
            if let Err(e) = mini_window.set_position(Position::Logical(LogicalPosition { x: 100.0, y: 100.0 })) {
                eprintln!("Warning: Failed to set fallback mini window position: {}", e);
            }
        }

        Ok(true)
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn close_mini_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("mini-chat") {
        #[cfg(target_os = "macos")]
        activate_previous_app();
        window.close()
            .map_err(|e| format!("Failed to close mini window: {}", e))?;
    }
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    set_activation_policy_regular();

    if let Some(window) = app.get_webview_window("main") {
        window.unminimize()
            .map_err(|e| format!("Failed to unminimize main window: {}", e))?;
        window.show()
            .map_err(|e| format!("Failed to show main window: {}", e))?;
        window.set_focus()
            .map_err(|e| format!("Failed to focus main window: {}", e))?;
    } else {
        let window = WebviewWindowBuilder::new(
            &app,
            "main",
            WebviewUrl::App("index.html".into())
        )
        .title("Open Chat")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .resizable(true)
        .build()
        .map_err(|e| format!("Failed to create main window: {}", e))?;
        window.show()
            .map_err(|e| format!("Failed to show main window: {}", e))?;
        window.set_focus()
            .map_err(|e| format!("Failed to focus main window: {}", e))?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
#[tauri::command]
async fn set_dock_icon_visibility(visible: bool) -> Result<(), String> {
    SHOW_DOCK_ICON.store(visible, std::sync::atomic::Ordering::Relaxed);
    if visible {
        set_activation_policy_regular();
    } else {
        set_activation_policy_accessory();
    }
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn register_global_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    if shortcut.trim().is_empty() {
        unregister_all_shortcuts(&app)?;
        return Ok(());
    }

    let parsed_shortcut = Shortcut::from_str(&shortcut)
        .map_err(|e| format!("Invalid shortcut format '{}': {}", shortcut, e))?;

    unregister_all_shortcuts(&app)?;

    app.global_shortcut()
        .register(parsed_shortcut.clone())
        .map_err(|e| {
            if e.to_string().contains("already registered") {
                format!("Shortcut '{}' is already in use by another application", shortcut)
            } else if e.to_string().contains("permission") {
                format!("Permission denied to register global shortcut '{}'. Please check system accessibility settings.", shortcut)
            } else {
                format!("Failed to register global shortcut '{}': {}", shortcut, e)
            }
        })?;

    if let Ok(mut shortcuts) = REGISTERED_SHORTCUTS.lock() {
        shortcuts.clear();
        shortcuts.push(shortcut);
    }

    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn unregister_global_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    if shortcut.trim().is_empty() {
        return Ok(());
    }

    let parsed_shortcut = Shortcut::from_str(&shortcut)
        .map_err(|e| format!("Invalid shortcut format '{}': {}", shortcut, e))?;

    app.global_shortcut()
        .unregister(parsed_shortcut)
        .map_err(|e| format!("Failed to unregister shortcut '{}': {}", shortcut, e))?;

    if let Ok(mut shortcuts) = REGISTERED_SHORTCUTS.lock() {
        shortcuts.retain(|s| s != &shortcut);
    }

    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn unregister_all_shortcuts(app: &AppHandle) -> Result<(), String> {
    if let Err(e) = app.global_shortcut().unregister_all() {
        eprintln!("Warning: Failed to unregister all shortcuts: {}", e);
    }

    if let Ok(mut shortcuts) = REGISTERED_SHORTCUTS.lock() {
        shortcuts.clear();
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_http::init());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder
            .plugin(tauri_plugin_keyring::init())
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(|app, _shortcut, event| {
                        use tauri_plugin_global_shortcut::ShortcutState;
                        if event.state == ShortcutState::Pressed {
                            let app_handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) = toggle_mini_window(app_handle).await {
                                    eprintln!("Failed to toggle mini window from global shortcut: {}", e);
                                }
                            });
                        }
                    })
                    .build()
            );
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder
            .setup(|app| {
                use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};

                use tauri::menu::{Menu, MenuItem};

                let app_handle = app.handle().clone();
                let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/swirl.png"))
                    .expect("Failed to load tray icon");

                let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&settings_item, &quit_item])?;

                TrayIconBuilder::new()
                    .icon(tray_icon)
                    .tooltip("Open Chat")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "settings" => {
                            let handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) = show_main_window(handle.clone()).await {
                                    eprintln!("Failed to show main window: {}", e);
                                    return;
                                }
                                // Wait for the window to be ready before emitting
                                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                                let _ = handle.emit("open-settings", ());
                            });
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(move |_tray, event| match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } => {
                            let handle = app_handle.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) = toggle_mini_window(handle).await {
                                    eprintln!("Failed to toggle mini window from tray: {}", e);
                                }
                            });
                        }
                        _ => {}
                    })
                    .build(app)?;

                Ok(())
            })
            .on_window_event(|window, event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if window.label() == "main" {
                        api.prevent_close();
                        let _ = window.hide();
                        #[cfg(target_os = "macos")]
                        {
                            if !SHOW_DOCK_ICON.load(std::sync::atomic::Ordering::Relaxed) {
                                set_activation_policy_accessory();
                            }
                        }
                    }
                }
            })
            .invoke_handler(tauri::generate_handler![
                greet,
                toggle_mini_window,
                close_mini_window,
                show_main_window,
                set_dock_icon_visibility,
                register_global_shortcut,
                unregister_global_shortcut,
                ollama::detect_ollama,
                ollama::start_ollama,
                ollama::stop_ollama,
                ollama::discover_models,
                system_info::get_system_info,
                system_info::validate_model_system_compatibility,
                search::tool_web_search
            ])
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }

    #[cfg(target_os = "ios")]
    {
        builder.invoke_handler(tauri::generate_handler![
            greet,
            ollama::detect_ollama,
            ollama::start_ollama,
            ollama::stop_ollama,
            ollama::discover_models,
            system_info::get_system_info,
            system_info::validate_model_system_compatibility,
            keychain::keychain_save,
            keychain::keychain_get,
            keychain::keychain_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    }

    #[cfg(target_os = "android")]
    {
        builder.invoke_handler(tauri::generate_handler![
            greet,
            ollama::detect_ollama,
            ollama::start_ollama,
            ollama::stop_ollama,
            ollama::discover_models,
            system_info::get_system_info,
            system_info::validate_model_system_compatibility
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    }
}
