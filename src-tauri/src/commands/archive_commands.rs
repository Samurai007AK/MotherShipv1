// src-tauri/src/commands/archive_commands.rs
//
// Tauri IPC commands for archive operations.

use crate::archive::{ArchiveDiff, ArchiveEntry, ArchiveManager};
use tauri::State;

/// Check if the git branch has changed since the last check.
#[tauri::command]
pub async fn check_branch_change(
    state: State<'_, ArchiveManager>,
) -> Result<bool, String> {
    let change = state
        .branch_detector
        .has_branch_changed()
        .await
        .map_err(|e| e.to_string())?;

    Ok(matches!(change, crate::archive::branch_detector::BranchChange::Changed { .. }))
}

/// Archive the current session.
#[tauri::command]
pub async fn archive_current_session(
    state: State<'_, ArchiveManager>,
) -> Result<ArchiveEntry, String> {
    let branch = state
        .branch_detector
        .get_current_branch()
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "main".into());

    state
        .archive_current_session(&branch)
        .await
        .map_err(|e| e.to_string())
}

/// List all archives.
#[tauri::command]
pub async fn list_archives(
    _state: State<'_, ArchiveManager>,
) -> Result<Vec<ArchiveEntry>, String> {
    // TODO: Read index.json and return entries
    Ok(Vec::new())
}

/// Restore an archived session.
#[tauri::command]
pub async fn restore_archive(
    archive_id: String,
    state: State<'_, ArchiveManager>,
) -> Result<(), String> {
    // TODO: Find entry by ID and restore
    tracing::info!(archive_id, "Restore requested");
    Ok(())
}

/// Delete an archive.
#[tauri::command]
pub async fn delete_archive(
    archive_id: String,
    state: State<'_, ArchiveManager>,
) -> Result<(), String> {
    state
        .delete_archive(&archive_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get the diff between an archive and the current session.
#[tauri::command]
pub async fn get_archive_diff(
    archive_id: String,
    state: State<'_, ArchiveManager>,
) -> Result<ArchiveDiff, String> {
    state
        .get_archive_diff(&archive_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get the content of a file within an archive.
#[tauri::command]
pub async fn get_archive_content(
    _archive_id: String,
    _file_name: String,
    _state: State<'_, ArchiveManager>,
) -> Result<String, String> {
    // TODO: Read file from archive directory
    Ok(String::new())
}
