// src-tauri/src/terminal/commands.rs
//
// Tauri IPC commands for terminal/PTY operations.
// PTY output is streamed to the frontend via Tauri event channels.

use super::{PtyConfig, PtySessionInfo, TerminalManager};
use tauri::{AppHandle, State};

/// Spawn a new PTY session for an agent and start streaming output via events.
///
/// Events emitted:
/// - `terminal-output` { sessionId, data } — PTY output data
/// - `terminal-exit` { sessionId, code } — PTY process exited
/// - `terminal-error` { sessionId, message } — PTY read error
#[tauri::command]
pub async fn spawn_terminal_session(
    app: AppHandle,
    config: PtyConfig,
    state: State<'_, TerminalManager>,
) -> Result<PtySessionInfo, String> {
    state.spawn_session_with_events(config, app)
}

/// Write input to a PTY session (keystrokes, commands, etc.).
#[tauri::command]
pub async fn write_terminal_input(
    session_id: String,
    data: String,
    state: State<'_, TerminalManager>,
) -> Result<(), String> {
    state.write_input(&session_id, data.as_bytes())
}

/// Resize a PTY session.
#[tauri::command]
pub async fn resize_terminal_session(
    session_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, TerminalManager>,
) -> Result<(), String> {
    state.resize(&session_id, cols, rows)
}

/// Close a PTY session.
#[tauri::command]
pub async fn close_terminal_session(
    session_id: String,
    state: State<'_, TerminalManager>,
) -> Result<(), String> {
    state.close_session(&session_id)
}

/// List all active PTY sessions.
#[tauri::command]
pub async fn list_terminal_sessions(
    state: State<'_, TerminalManager>,
) -> Result<Vec<PtySessionInfo>, String> {
    Ok(state.list_sessions())
}

/// Get info about a specific PTY session.
#[tauri::command]
pub async fn get_terminal_session(
    session_id: String,
    state: State<'_, TerminalManager>,
) -> Result<Option<PtySessionInfo>, String> {
    Ok(state.get_session_info(&session_id))
}

/// Pause a PTY session — suspends the child process to save RAM.
/// The session can be resumed later with `resume_terminal_session`.
#[tauri::command]
pub async fn pause_terminal_session(
    session_id: String,
    state: State<'_, TerminalManager>,
) -> Result<(), String> {
    state.pause_session(&session_id)
}

/// Resume a paused PTY session — continues the child process.
#[tauri::command]
pub async fn resume_terminal_session(
    session_id: String,
    state: State<'_, TerminalManager>,
) -> Result<(), String> {
    state.resume_session(&session_id)
}
