// src-tauri/src/commands/checkpoint_commands.rs
//
// Tauri IPC commands for Session Time-Travel — checkpoint save, restore,
// fork, and list operations for the autonomous loop controller.
//
// These commands enable the frontend to:
//   - Save a manual checkpoint at any point
//   - List all checkpoints for the current session
//   - Restore (rewind) to a previous checkpoint
//   - Fork from a checkpoint into a new branch
//   - Inspect the effect log at any checkpoint

use crate::loop_controller::effect_log::{EffectLog, LoopCheckpoint};
use crate::loop_controller::{LoopController, LoopState};
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

/// Save a manual checkpoint with a custom label.
#[tauri::command]
pub async fn save_loop_checkpoint(
    label: String,
    note: Option<String>,
    state: State<'_, Arc<RwLock<Option<LoopController>>>>,
) -> Result<LoopCheckpoint, String> {
    let guard = state.read().await;
    match guard.as_ref() {
        Some(controller) => {
            controller.save_checkpoint(&label, note).map_err(|e| e.to_string())
        }
        None => Err("No active loop session".to_string()),
    }
}

/// List all checkpoints for the current loop session's project.
#[tauri::command]
pub async fn list_loop_checkpoints(
    state: State<'_, Arc<RwLock<Option<LoopController>>>>,
) -> Result<Vec<LoopCheckpoint>, String> {
    let guard = state.read().await;
    match guard.as_ref() {
        Some(controller) => {
            controller.list_checkpoints().map_err(|e| e.to_string())
        }
        None => Err("No active loop session".to_string()),
    }
}

/// Restore (rewind) to a previous checkpoint by its ID.
/// This replaces the controller's state and effect log with the checkpoint's,
/// effectively time-traveling back to that point. The loop can then be
/// resumed from the checkpoint.
#[tauri::command]
pub async fn restore_loop_checkpoint(
    checkpoint_id: String,
    state: State<'_, Arc<RwLock<Option<LoopController>>>>,
) -> Result<(), String> {
    let guard = state.read().await;
    let controller = guard.as_ref().ok_or("No active loop session")?;

    // Find the checkpoint by ID in the project's checkpoint directory
    let checkpoints = controller.list_checkpoints().map_err(|e| e.to_string())?;
    let checkpoint = checkpoints
        .into_iter()
        .find(|cp| cp.id == checkpoint_id)
        .ok_or_else(|| format!("Checkpoint not found: {}", checkpoint_id))?;

    // Drop the read guard before acquiring write guard
    drop(guard);

    // Restore the checkpoint
    let mut guard = state.write().await;
    if let Some(controller) = guard.as_mut() {
        controller.restore_checkpoint(&checkpoint);
        Ok(())
    } else {
        Err("No active loop session".to_string())
    }
}

/// Fork from a checkpoint — creates a new branch that can be explored
/// independently. The checkpoint is saved to disk with a new branch label.
#[tauri::command]
pub async fn fork_loop_checkpoint(
    checkpoint_id: String,
    branch_label: String,
    state: State<'_, Arc<RwLock<Option<LoopController>>>>,
) -> Result<LoopCheckpoint, String> {
    let guard = state.read().await;
    let controller = guard.as_ref().ok_or("No active loop session")?;

    // Find the checkpoint by ID
    let checkpoints = controller.list_checkpoints().map_err(|e| e.to_string())?;
    let checkpoint = checkpoints
        .into_iter()
        .find(|cp| cp.id == checkpoint_id)
        .ok_or_else(|| format!("Checkpoint not found: {}", checkpoint_id))?;

    // Fork from the checkpoint (saves a new checkpoint with branch label)
    controller
        .fork_from_checkpoint(&checkpoint, &branch_label)
        .map_err(|e| e.to_string())
}

/// Get the effect log from the current loop controller.
#[tauri::command]
pub async fn get_loop_effect_log(
    state: State<'_, Arc<RwLock<Option<LoopController>>>>,
) -> Result<EffectLog, String> {
    let guard = state.read().await;
    match guard.as_ref() {
        Some(controller) => Ok(controller.get_effect_log().clone()),
        None => Err("No active loop session".to_string()),
    }
}

/// Get the current loop state.
#[tauri::command]
pub async fn get_loop_state(
    _loop_id: String,
    state: State<'_, Arc<RwLock<Option<LoopController>>>>,
) -> Result<Option<LoopState>, String> {
    let guard = state.read().await;
    Ok(guard.as_ref().map(|c| c.get_state().clone()))
}
