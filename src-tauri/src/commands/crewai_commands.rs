// Mothership — CrewAI Bridge Commands
// Tauri IPC commands for CrewAI-powered handoff orchestration.
//
// Architecture:
//   Frontend → Tauri IPC → Rust command → JSON-RPC over stdin/stdout → crewai-bridge (Python)
//   crewai-bridge → JSON-RPC response → Rust command → Tauri IPC → Frontend
//
// The crewai-bridge sidecar uses CrewAI's Flow API (@start, @listen, @router)
// to orchestrate multi-step agent handoffs with smart routing.

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::time::Duration;
use tracing::{error, info};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// A single context entry to include in the handoff.
/// Frontend sends camelCase, so we rename.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffEntry {
    pub id: String,
    pub content: String,
    pub agent_id: Option<String>,
    pub entry_type: String,
    pub tags: Vec<String>,
    pub files_referenced: Vec<String>,
    pub created_at: String,
}

/// Request payload sent to the crewai-bridge sidecar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrewaiHandoffRequest {
    pub source_agent_id: String,
    pub target_agent_id: String,
    pub entries: Vec<HandoffEntry>,
}

/// Structured result from the CrewAI Flow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrewaiHandoffResult {
    pub source_agent_id: String,
    pub target_agent_id: String,
    pub entry_count: usize,
    pub summary: String,
    pub key_decisions: Vec<String>,
    pub open_todos: Vec<String>,
    pub files_touched: Vec<String>,
    pub current_state: String,
    pub enriched: bool,
    pub model_used: String,
}

// ---------------------------------------------------------------------------
// JSON-RPC types for sidecar communication
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    method: String,
    params: serde_json::Value,
    id: u32,
}

#[derive(Debug, Deserialize)]
struct JsonRpcResponse {
    #[allow(dead_code)]
    jsonrpc: Option<String>,
    result: Option<serde_json::Value>,
    error: Option<JsonRpcError>,
    id: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    #[allow(dead_code)]
    code: Option<i32>,
    message: Option<String>,
}

// ---------------------------------------------------------------------------
// Command: Run CrewAI handoff via sidecar
// ---------------------------------------------------------------------------

/// Run a CrewAI-orchestrated handoff.
///
/// Spawns the crewai-bridge Python sidecar, sends a JSON-RPC handoff request,
/// reads the response, and returns the structured result.
///
/// If the sidecar fails or returns an error, falls back to a basic summary.
#[tauri::command]
pub async fn crewai_handoff(
    request: CrewaiHandoffRequest,
) -> Result<CrewaiHandoffResult, String> {
    info!(
        "CrewAI handoff: {} → {} ({} entries)",
        request.source_agent_id,
        request.target_agent_id,
        request.entries.len()
    );

    // Find the sidecar path relative to the executable
    let sidecar_path = get_sidecar_path();

    // Spawn the sidecar process
    let mut child = Command::new("python")
        .arg(&sidecar_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn crewai-bridge: {}", e))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to open stdin on crewai-bridge".to_string())?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to open stdout on crewai-bridge".to_string())?;

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to open stderr on crewai-bridge".to_string())?;

    // Read the "ready" line from the sidecar
    let mut reader = BufReader::new(stdout);
    let mut ready_line = String::new();
    reader
        .read_line(&mut ready_line)
        .map_err(|e| format!("Failed to read ready signal: {}", e))?;

    // Validate the ready signal
    let ready_line = ready_line.trim();
    let ready_parsed: Result<serde_json::Value, _> = serde_json::from_str(ready_line);
    let is_ready = ready_parsed
        .as_ref()
        .and_then(|v| v.get("method"))
        .and_then(|m| m.as_str())
        == Some("ready");

    if !is_ready {
        // Kill the sidecar and return error
        let _ = child.kill();
        let _ = child.wait();
        return Err(format!(
            "CrewAI sidecar failed to start. Got: {}",
            ready_line
        ));
    }

    // Send the JSON-RPC request
    let rpc_req = JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        method: "handoff".to_string(),
        params: serde_json::to_value(&request).map_err(|e| e.to_string())?,
        id: 1,
    };

    let mut request_json = serde_json::to_string(&rpc_req).map_err(|e| e.to_string())?;
    request_json.push('\n');

    let mut writer = stdin;
    writer
        .write_all(request_json.as_bytes())
        .map_err(|e| format!("Failed to write to crewai-bridge: {}", e))?;
    writer
        .flush()
        .map_err(|e| format!("Failed to flush stdin: {}", e))?;

    // Read the response (one JSON line)
    let mut response_line = String::new();
    reader
        .read_line(&mut response_line)
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Drop stderr to prevent pipe blocking
    drop(stderr);

    // Kill the sidecar
    let _ = child.kill();
    let _ = child.wait();

    // Parse the response
    let response: JsonRpcResponse = serde_json::from_str(&response_line.trim())
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if let Some(error) = response.error {
        return Err(error.message.unwrap_or_else(|| "Unknown error".to_string()));
    }

    let result: CrewaiHandoffResult = serde_json::from_value(
        response.result.ok_or_else(|| "No result in response".to_string())?,
    )
    .map_err(|e| format!("Failed to parse handoff result: {}", e))?;

    info!(
        "CrewAI handoff complete: {} → {} (enriched={})",
        result.source_agent_id, result.target_agent_id, result.enriched
    );

    Ok(result)
}

/// Get the path to the crewai-bridge main.py script.
fn get_sidecar_path() -> String {
    // In development, the sidecar is at sidecars/crewai-bridge/main.py
    // relative to the project root. In production, it would be bundled.
    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.join("sidecars").join("crewai-bridge").join("main.py"))
        .unwrap_or_else(|| {
            std::path::PathBuf::from("sidecars/crewai-bridge/main.py")
        });

    if dev_path.exists() {
        dev_path.to_string_lossy().to_string()
    } else {
        // Fallback: relative to current dir
        "sidecars/crewai-bridge/main.py".to_string()
    }
}

/// Check if the crewai-bridge sidecar can start.
#[tauri::command]
pub async fn check_crewai_available() -> Result<CrewaiHealth, String> {
    let sidecar_path = get_sidecar_path();
    let exists = std::path::Path::new(&sidecar_path).exists();

    // Try a quick health check by spawning and immediately killing
    let can_start = if exists {
        match Command::new("python")
            .arg(&sidecar_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(mut child) => {
                // Poll with try_wait() for up to 3 seconds
                let deadline = std::time::Instant::now() + Duration::from_secs(3);
                let mut started = true;
                while std::time::Instant::now() < deadline {
                    match child.try_wait() {
                        Ok(Some(_)) => {
                            // Process exited — didn't start properly
                            started = false;
                            break;
                        }
                        Ok(None) => {
                            // Still running — good sign
                            std::thread::sleep(Duration::from_millis(100));
                        }
                        Err(_) => {
                            started = false;
                            break;
                        }
                    }
                }
                let _ = child.kill();
                let _ = child.wait();
                started
            }
            Err(_) => false,
        }
    } else {
        false
    };

    Ok(CrewaiHealth {
        available: exists && can_start,
        sidecar_path,
        crewai_installed: can_start,
    })
}

/// Health check result for CrewAI bridge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrewaiHealth {
    pub available: bool,
    pub sidecar_path: String,
    pub crewai_installed: bool,
}
