// src-tauri/src/commands/browser_commands.rs
//
// IPC commands for creating and managing Tauri WebView windows that serve as
// browser tabs for the BrowserConnector. Each tab becomes a labelled secondary
// WebviewWindow.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewWindowBuilder, WebviewUrl};

/// Information about an open browser WebView window.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserWindowInfo {
    pub label: String,
    pub url: String,
    pub title: String,
}

/// Create a new browser WebView window with the given URL.
///
/// The window is labelled `browser-{tab_id}` so the frontend can reference it
/// later for navigation, refresh, or close.
#[tauri::command]
pub async fn create_browser_window(
    app: AppHandle,
    tab_id: String,
    url: String,
) -> Result<BrowserWindowInfo, String> {
    let label = format!("browser-{}", tab_id);

    // Parse the URL — if it fails, reject early
    let parsed_url: url::Url = url.parse().map_err(|e| format!("Invalid URL: {}", e))?;
    let url_str = parsed_url.to_string();

    // Check if a window with this label already exists
    if let Some(window) = app.get_webview_window(&label) {
        // Already exists — just navigate
        window
            .navigate(parsed_url)
            .map_err(|e| format!("Failed to navigate: {}", e))?;
        return Ok(BrowserWindowInfo {
            label,
            url: url_str.clone(),
            title: url_str,
        });
    }

    // Build the WebView window
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed_url))
        .title("Mothership — Browser")
        .inner_size(900.0, 650.0)
        .min_inner_size(400.0, 300.0)
        .resizable(true)
        .decorations(true)
        .center()
        .build()
        .map_err(|e| format!("Failed to create browser window: {}", e))?;

    Ok(BrowserWindowInfo {
        label,
        url: url_str.clone(),
        title: url_str,
    })
}

/// Navigate an existing browser WebView window to a new URL.
#[tauri::command]
pub async fn navigate_browser_window(
    app: AppHandle,
    tab_id: String,
    url: String,
) -> Result<BrowserWindowInfo, String> {
    let label = format!("browser-{}", tab_id);
    let parsed_url: url::Url = url.parse().map_err(|e| format!("Invalid URL: {}", e))?;
    let url_str = parsed_url.to_string();

    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Browser window '{}' not found", label))?;

    window
        .navigate(parsed_url)
        .map_err(|e| format!("Failed to navigate: {}", e))?;

    // Focus the window so the user sees it
    let _ = window.set_focus();

    Ok(BrowserWindowInfo {
        label,
        url: url_str.clone(),
        title: url_str,
    })
}

/// Close a browser WebView window by tab_id.
#[tauri::command]
pub async fn close_browser_window(
    app: AppHandle,
    tab_id: String,
) -> Result<(), String> {
    let label = format!("browser-{}", tab_id);

    if let Some(window) = app.get_webview_window(&label) {
        window
            .close()
            .map_err(|e| format!("Failed to close browser window: {}", e))?;
    }
    // If window doesn't exist, it's already closed — no-op

    Ok(())
}

/// List all open browser WebView windows (those with labels starting with "browser-").
#[tauri::command]
pub async fn list_browser_windows(app: AppHandle) -> Result<Vec<BrowserWindowInfo>, String> {
    let windows = app.webview_windows();
    let mut browsers = Vec::new();

    for (label, window) in &windows {
        if label.starts_with("browser-") {
            let url = window.url().map(|u| u.to_string()).unwrap_or_else(|_| String::new());
            let title = window.title().unwrap_or_else(|_| "Browser".into());
            browsers.push(BrowserWindowInfo {
                label: label.clone(),
                url,
                title,
            });
        }
    }

    Ok(browsers)
}
