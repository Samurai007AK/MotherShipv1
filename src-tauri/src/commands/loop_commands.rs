// src-tauri/src/commands/loop_commands.rs
//
// Tauri IPC commands for loop controller operations.

use crate::loop_controller::{LoopConfig, LoopController, LoopState};
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

/// Start a new loop execution.
#[tauri::command]
pub async fn start_loop(
    _loop_id: String,
    config: LoopConfig,
    state: State<'_, Arc<RwLock<Option<LoopController>>>>,
) -> Result<(), String> {
    // TODO: Create LoopController, store in state, spawn run() in background
    tracing::info!(agent = %config.agent_id, "Starting loop");
    Ok(())
}

/// Pause a running loop.
#[tauri::command]
pub async fn pause_loop(
    _loop_id: String,
    state: State<'_, Arc<RwLock<Option<LoopController>>>>,
) -> Result<(), String> {
    let mut guard = state.write().await;
    if let Some(controller) = guard.as_mut() {
        controller.pause();
    }
    Ok(())
}

/// Resume a paused loop.
#[tauri::command]
pub async fn resume_loop(
    _loop_id: String,
    state: State<'_, Arc<RwLock<Option<LoopController>>>>,
) -> Result<(), String> {
    let mut guard = state.write().await;
    if let Some(controller) = guard.as_mut() {
        controller.resume();
    }
    Ok(())
}

/// Cancel a running or paused loop.
#[tauri::command]
pub async fn cancel_loop(
    _loop_id: String,
    state: State<'_, Arc<RwLock<Option<LoopController>>>>,
) -> Result<(), String> {
    let mut guard = state.write().await;
    if let Some(controller) = guard.as_mut() {
        controller.cancel();
    }
    Ok(())
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

/// Retry a loop from a specific iteration.
#[tauri::command]
pub async fn retry_loop(
    _loop_id: String,
    _from_iteration: usize,
    _state: State<'_, Arc<RwLock<Option<LoopController>>>>,
) -> Result<(), String> {
    // TODO: Reset loop state to the specified iteration and resume
    tracing::info!("Retrying loop from iteration");
    Ok(())
}
