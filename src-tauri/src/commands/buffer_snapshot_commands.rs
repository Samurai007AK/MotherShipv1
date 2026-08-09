// src-tauri/src/commands/buffer_snapshot_commands.rs
//
// Tauri IPC commands for persisting terminal buffer snapshots to disk.
// Snapshots are stored per-agent-id so they survive app restarts.
// Each snapshot is a plain text file containing the last N lines of
// the terminal's scrollback buffer.

use std::path::PathBuf;

/// Get the directory where terminal buffer snapshots are stored.
fn buffer_snapshots_dir() -> PathBuf {
    dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("mothership")
        .join("terminal-buffers")
}

/// Save a terminal buffer snapshot for a given agent.
/// The snapshot is written to `{app_data_dir}/mothership/terminal-buffers/{agent_id}.txt`.
#[tauri::command]
pub fn save_terminal_buffer(agent_id: String, content: String) -> Result<(), String> {
    let dir = buffer_snapshots_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create terminal-buffers dir: {}", e))?;

    let file_path = dir.join(format!("{}.txt", agent_id));
    std::fs::write(&file_path, &content)
        .map_err(|e| format!("Failed to save terminal buffer: {}", e))?;

    Ok(())
}

/// Load a terminal buffer snapshot for a given agent.
/// Returns `None` if no snapshot exists for this agent.
#[tauri::command]
pub fn load_terminal_buffer(agent_id: String) -> Result<Option<String>, String> {
    let file_path = buffer_snapshots_dir().join(format!("{}.txt", agent_id));

    if !file_path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to load terminal buffer: {}", e))?;

    Ok(Some(content))
}

/// Clear (delete) a terminal buffer snapshot for a given agent.
/// Called when a terminal session is closed or when the buffer is no longer needed.
#[tauri::command]
pub fn clear_terminal_buffer(agent_id: String) -> Result<(), String> {
    let file_path = buffer_snapshots_dir().join(format!("{}.txt", agent_id));

    if file_path.exists() {
        std::fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to clear terminal buffer: {}", e))?;
    }

    Ok(())
}

/// List all agent IDs that have saved buffer snapshots.
/// Returns the list of agent IDs (file stem names) sorted alphabetically.
#[tauri::command]
pub fn list_terminal_buffers() -> Result<Vec<String>, String> {
    let dir = buffer_snapshots_dir();

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut agents: Vec<String> = Vec::new();
    let entries = std::fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read terminal-buffers dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map(|e| e == "txt").unwrap_or(false) {
            if let Some(stem) = path.file_stem() {
                agents.push(stem.to_string_lossy().to_string());
            }
        }
    }

    agents.sort();
    Ok(agents)
}
