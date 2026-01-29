mod ollama;
mod system_info;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, Position, LogicalPosition, AppHandle};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::str::FromStr;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::sync::Mutex;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
static REGISTERED_SHORTCUTS: Mutex<Vec<String>> = Mutex::new(Vec::new());

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
async fn toggle_mini_window(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("mini-chat") {
        let is_visible = window.is_visible()
            .map_err(|e| format!("Failed to check window visibility: {}", e))?;
        let is_focused = window.is_focused()
            .map_err(|e| format!("Failed to check window focus: {}", e))?;

        if is_visible && is_focused {
            window.hide()
                .map_err(|e| format!("Failed to hide mini window: {}", e))?;
            Ok(false)
        } else {
            window.show()
                .map_err(|e| format!("Failed to show mini window: {}", e))?;
            window.set_focus()
                .map_err(|e| format!("Failed to focus mini window: {}", e))?;
            Ok(true)
        }
    } else {
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
        window.close()
            .map_err(|e| format!("Failed to close mini window: {}", e))?;
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
        .plugin(tauri_plugin_os::init());

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

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        builder = builder.plugin(tauri_plugin_keychain::init());
    }

    #[cfg(target_os = "ios")]
    {
        builder = builder.plugin(tauri_plugin_local_llm::init());
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder.invoke_handler(tauri::generate_handler![
            greet,
            toggle_mini_window,
            close_mini_window,
            register_global_shortcut,
            unregister_global_shortcut,
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

    #[cfg(any(target_os = "android", target_os = "ios"))]
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
