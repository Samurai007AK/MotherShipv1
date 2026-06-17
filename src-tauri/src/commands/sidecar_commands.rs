// Mothership — Sidecar IPC Commands
// Tauri invoke handlers for sidecar lifecycle management.

use crate::process::{SidecarManager, SidecarInfo};
use std::sync::Arc;
use tauri::State;

/// Spawn a sidecar process.
#[tauri::command]
pub async fn spawn_sidecar(
    manager: State<'_, Arc<SidecarManager>>,
    name: String,
    command: String,
    args: Vec<String>,
) -> Result<SidecarInfo, String> {
    let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    manager.spawn(&name, &command, &args_refs)
}

/// Kill a sidecar process by name.
#[tauri::command]
pub async fn kill_sidecar(
    manager: State<'_, Arc<SidecarManager>>,
    name: String,
) -> Result<(), String> {
    manager.kill(&name)
}

/// Check if a sidecar is healthy.
#[tauri::command]
pub async fn check_sidecar_health(
    manager: State<'_, Arc<SidecarManager>>,
    name: String,
) -> Result<bool, String> {
    Ok(manager.is_healthy(&name))
}

/// List all sidecars and their status.
#[tauri::command]
pub async fn list_sidecars(
    manager: State<'_, Arc<SidecarManager>>,
) -> Result<Vec<SidecarInfo>, String> {
    Ok(manager.list())
}
