// src-tauri/src/execution_engine/commands.rs
//
// Tauri IPC commands for the Enhanced Execution Engine.

use crate::execution_engine::{ExecutionEngine, ExecutionGroup, ExecutionGroupConfig};
use crate::terminal::TerminalManager;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

/// Start a new execution group — runs multiple agents in parallel.
#[tauri::command]
pub async fn start_execution_group(
    config: ExecutionGroupConfig,
    engine: State<'_, Arc<RwLock<ExecutionEngine>>>,
    terminal_manager: State<'_, TerminalManager>,
) -> Result<String, String> {
    let engine = engine.read().await;
    engine.start_group(config, &terminal_manager).await
}

/// Get the current state of an execution group.
#[tauri::command]
pub async fn get_execution_group(
    group_id: String,
    engine: State<'_, Arc<RwLock<ExecutionEngine>>>,
) -> Result<Option<ExecutionGroup>, String> {
    let engine = engine.read().await;
    Ok(engine.get_group(&group_id).await)
}

/// List all execution groups.
#[tauri::command]
pub async fn list_execution_groups(
    engine: State<'_, Arc<RwLock<ExecutionEngine>>>,
) -> Result<Vec<ExecutionGroup>, String> {
    let engine = engine.read().await;
    Ok(engine.list_groups().await)
}

/// Cancel a running execution group.
#[tauri::command]
pub async fn cancel_execution_group(
    group_id: String,
    engine: State<'_, Arc<RwLock<ExecutionEngine>>>,
) -> Result<(), String> {
    let engine = engine.read().await;
    engine.cancel_group(&group_id).await
}

/// Add shared context to a running execution group.
#[tauri::command]
pub async fn add_execution_context(
    group_id: String,
    source: String,
    content: String,
    engine: State<'_, Arc<RwLock<ExecutionEngine>>>,
) -> Result<(), String> {
    let engine = engine.read().await;
    engine.add_context(&group_id, &source, &content).await
}
