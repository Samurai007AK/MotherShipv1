// src-tauri/src/commands/loop_commands.rs
//
// Tauri IPC commands for the autonomous loop controller.
// start_loop now spawns a background task that runs iterations with
// real terminal sessions, prompts, output monitoring, and quality gates.

use crate::loop_controller::{LoopConfig, LoopController, LoopEvent, LoopState};
use crate::terminal::TerminalManager;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{RwLock, mpsc};

/// Start a new loop — spawns a background task that runs iterations.
#[tauri::command]
pub async fn start_loop(
    _loop_id: String,
    config: LoopConfig,
    app: AppHandle,
    state: State<'_, Arc<RwLock<Option<LoopController>>>>,
    terminal_manager: State<'_, TerminalManager>,
) -> Result<(), String> {
    // Create an event channel for the loop controller
    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<LoopEvent>();

    // Create the loop controller (includes a shared Arc<AtomicU8> for control signals)
    let controller = LoopController::new(config, event_tx);

    // Clone the controller for the background task — the cancel_signal Arc
    // is shared between both clones, so pause/resume/cancel commands sent
    // to the shared-state controller will be seen by the background task.
    let bg_controller = controller.clone_for_bg();

    // Store the original controller in shared state (pause/resume/cancel
    // commands will modify its cancel_signal, which the background task
    // sees through the shared Arc).
    {
        let mut guard = state.write().await;
        *guard = Some(controller);
    }

    // Clone references for the background task
    // State<T> derefs to T, so &state gives us &Arc<RwLock<...>>
    let state_ref: &Arc<RwLock<Option<LoopController>>> = &state;
    let state_clone = Arc::clone(state_ref);
    let tm = terminal_manager.clone_arc();
    let app_clone = app.clone();

    // Spawn background task that runs the loop
    tokio::spawn(async move {
        let mut controller = bg_controller;
        tracing::info!("Loop background task started");

        // Bridge events from the channel to Tauri frontend
        let app_bridge = app_clone.clone();
        let bridge_handle = tokio::spawn(async move {
            while let Some(event) = event_rx.recv().await {
                match &event {
                    LoopEvent::IterationStarted { iteration, task_id } => {
                        let _ = app_bridge.emit("loop-progress", serde_json::json!({
                            "type": "iteration_started",
                            "iteration": iteration,
                            "task_id": task_id,
                        }));
                    }
                    LoopEvent::IterationCompleted { iteration, success } => {
                        let _ = app_bridge.emit("loop-progress", serde_json::json!({
                            "type": "iteration_completed",
                            "iteration": iteration,
                            "success": success,
                        }));
                    }
                    LoopEvent::TaskCompleted { task_id } => {
                        let _ = app_bridge.emit("loop-progress", serde_json::json!({
                            "type": "task_completed",
                            "task_id": task_id,
                        }));
                    }
                    LoopEvent::LoopCompleted { total_iterations } => {
                        let _ = app_bridge.emit("loop-progress", serde_json::json!({
                            "type": "loop_completed",
                            "total_iterations": total_iterations,
                        }));
                    }
                    LoopEvent::Error { message } => {
                        let _ = app_bridge.emit("loop-progress", serde_json::json!({
                            "type": "error",
                            "message": message,
                        }));
                    }
                    LoopEvent::ProgressUpdate { progress } => {
                        let _ = app_bridge.emit("loop-progress", serde_json::json!({
                            "type": "progress",
                            "progress": progress,
                        }));
                    }
                    LoopEvent::SessionArchived { archive_id } => {
                        let _ = app_bridge.emit("loop-progress", serde_json::json!({
                            "type": "session_archived",
                            "archive_id": archive_id,
                        }));
                    }
                    LoopEvent::CheckpointSaved { iteration, label } => {
                        let _ = app_bridge.emit("loop-progress", serde_json::json!({
                            "type": "checkpoint_saved",
                            "iteration": iteration,
                            "label": label,
                        }));
                    }
                }
            }
        });

        // Run the loop with terminal manager
        let result = controller.run(&tm).await;

        match &result {
            Ok(r) => {
                tracing::info!(
                    "Loop completed: {} iterations, {} tasks done",
                    r.iterations, r.tasks_completed
                );
                let _ = app_clone.emit("loop-status", serde_json::json!({
                    "status": "completed",
                    "iterations": r.iterations,
                    "tasks_completed": r.tasks_completed,
                    "tasks_total": r.tasks_total,
                    "duration_ms": r.duration_ms,
                }));
            }
            Err(e) => {
                tracing::error!("Loop failed: {}", e);
                let _ = app_clone.emit("loop-status", serde_json::json!({
                    "status": "failed",
                    "error": e.to_string(),
                }));
            }
        }

        // Wait for event bridge to finish
        bridge_handle.await.ok();

        // Store the completed/failed controller back in shared state
        {
            let mut guard = state_clone.write().await;
            *guard = Some(controller);
        }
    });

    tracing::info!("Loop started in background");
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
