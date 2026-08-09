// Mothership — CrewAI Bridge Commands
// Tauri IPC commands for CrewAI-powered handoff orchestration.
//
// Architecture:
//   Frontend → Tauri IPC → Rust command → JSON-RPC over stdin/stdout → crewai-bridge (Python)
//   crewai-bridge emits progress on stderr → Rust reads stderr → Tauri events → Frontend
//   crewai-bridge responds on stdout → JSON-RPC response → Rust command → Tauri IPC → Frontend
//
// Sidecar Lifecycle (managed by CrewaiBridgeConnection):
//   1. start_crewai_sidecar: Spawn sidecar, read "ready" signal, begin stderr reader task
//   2. crewai_handoff: Send JSON-RPC via persistent stdin, read response from stdout
//   3. stop_crewai_sidecar: Kill sidecar, clean up handles
//   4. check_crewai_available: Quick availability check (spawns test process)
//
// The crewai-bridge sidecar uses CrewAI's Flow API (@start, @listen, @router)
// to orchestrate multi-step agent handoffs with smart routing.
//
// Progress events are emitted to the frontend during flow execution:
//   - "crewai-flow-progress": { stage: string, progress: number, message: string }

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tracing::{error, info};

// ---------------------------------------------------------------------------
// Persistent Sidecar Connection State
// ---------------------------------------------------------------------------

/// A running crewai-bridge sidecar process with its I/O handles.
pub struct CrewaiBridgeConnection {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    stdout: Option<ChildStdout>,
}

/// Shared mutable state for the CrewAI bridge connection.
pub type SharedCrewaiBridge = Arc<Mutex<CrewaiBridgeConnection>>;

impl CrewaiBridgeConnection {
    pub fn new() -> Self {
        Self {
            child: None,
            stdin: None,
            stdout: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// A single context entry to include in the handoff.
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

/// Progress payload emitted to the frontend during flow execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowProgressPayload {
    pub stage: String,
    pub progress: u8,
    pub message: String,
}

/// Health check result for CrewAI bridge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrewaiHealth {
    pub available: bool,
    pub sidecar_path: String,
    pub running: bool,
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
// Stderr progress notification (sent from Python sidecar)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct StderrProgress {
    #[allow(dead_code)]
    jsonrpc: Option<String>,
    method: Option<String>,
    params: Option<FlowProgressPayload>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Check if the bridge's child process is still alive via try_wait.
fn child_is_alive(child: &mut Child) -> bool {
    matches!(child.try_wait(), Ok(None))
}

/// Emit a progress event to the frontend.
fn emit_progress(app: &AppHandle, stage: &str, progress: u8, message: String) {
    let _ = app.emit(
        "crewai-flow-progress",
        FlowProgressPayload {
            stage: stage.to_string(),
            progress,
            message,
        },
    );
}

/// Get the path to the crewai-bridge main.py script.
fn get_sidecar_path() -> String {
    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.join("sidecars").join("crewai-bridge").join("main.py"))
        .unwrap_or_else(|| std::path::PathBuf::from("sidecars/crewai-bridge/main.py"));

    if dev_path.exists() {
        dev_path.to_string_lossy().to_string()
    } else {
        "sidecars/crewai-bridge/main.py".to_string()
    }
}

// ---------------------------------------------------------------------------
// Internal: start sidecar (used by both start_crewai_sidecar and lazy init)
// ---------------------------------------------------------------------------

async fn _start_sidecar_inner(
    bridge: &SharedCrewaiBridge,
    app: &AppHandle,
) -> Result<String, String> {
    let sidecar_path = get_sidecar_path();

    // Check if already running via bridge state
    {
        let mut guard = bridge.lock().await;
        if let Some(child) = guard.child.as_mut() {
            if child_is_alive(child) {
                return Ok("crewai-bridge already running".to_string());
            }
        }
    }

    info!("Starting crewai-bridge sidecar from: {}", sidecar_path);

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

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to open stderr on crewai-bridge".to_string())?;

    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to open stdout on crewai-bridge".to_string())?;

    // Read the "ready" signal by BORROWING stdout (does not consume it)
    // &mut ChildStdout implements Read, so BufReader::new(&mut stdout) works.
    // After this scope, stdout is still valid and can be stored for later use.
    {
        let mut reader = BufReader::new(&mut stdout);
        let mut ready_line = String::new();
        reader
            .read_line(&mut ready_line)
            .map_err(|e| format!("Failed to read ready signal: {}", e))?;

        let ready_line = ready_line.trim();
        let ready_parsed: Result<serde_json::Value, _> = serde_json::from_str(ready_line);
        let is_ready = ready_parsed
            .ok()
            .as_ref()
            .and_then(|v| v.get("method").and_then(|m| m.as_str()))
            == Some("ready");

        if !is_ready {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "CrewAI sidecar failed to start. Got: {}",
                ready_line
            ));
        }
    }
    // stdout is still alive here — the BufReader only borrowed it

    // Background task: read stderr for progress events and forward to frontend
    let app_clone = app.clone();
    tokio::spawn(async move {
        let stderr_reader = BufReader::new(stderr);
        for line in stderr_reader.lines() {
            match line {
                Ok(line) => {
                    let trimmed = line.trim().to_string();
                    if trimmed.is_empty() {
                        continue;
                    }
                    if let Ok(progress) = serde_json::from_str::<StderrProgress>(&trimmed) {
                        if progress.method.as_deref() == Some("flow_progress") {
                            if let Some(params) = progress.params {
                                let _ = app_clone.emit("crewai-flow-progress", params);
                            }
                        }
                    }
                }
                Err(e) => {
                    error!("Error reading crewai-bridge stderr: {}", e);
                    break;
                }
            }
        }
        info!("crewai-bridge stderr reader stopped");
    });

    // Store the connection handles
    let mut bridge_guard = bridge.lock().await;
    bridge_guard.child = Some(child);
    bridge_guard.stdin = Some(stdin);
    bridge_guard.stdout = Some(stdout);

    info!("crewai-bridge sidecar started and ready");
    Ok("crewai-bridge started".to_string())
}

// ---------------------------------------------------------------------------
// Command: Start crewai-bridge sidecar (persistent)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn start_crewai_sidecar(
    bridge: State<'_, SharedCrewaiBridge>,
    app: AppHandle,
) -> Result<String, String> {
    _start_sidecar_inner(&bridge, &app).await
}

// ---------------------------------------------------------------------------
// Command: Run CrewAI handoff via persistent sidecar
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn crewai_handoff(
    request: CrewaiHandoffRequest,
    bridge: State<'_, SharedCrewaiBridge>,
    app: AppHandle,
) -> Result<CrewaiHandoffResult, String> {
    info!(
        "CrewAI handoff: {} → {} ({} entries)",
        request.source_agent_id,
        request.target_agent_id,
        request.entries.len()
    );

    emit_progress(
        &app,
        "connecting",
        5,
        "Connecting to CrewAI bridge...".to_string(),
    );

    // Lazy init: start sidecar if not running
    {
        // Check if child is present and alive (we assume alive if present —
        // a dead process will be caught on the next I/O operation)
        let running = {
            let mut guard = bridge.lock().await;
            guard.child.as_mut().is_some_and(|c| c.try_wait().ok().flatten().is_none())
        };
        if !running {
            info!("crewai-bridge not running — auto-starting");
            _start_sidecar_inner(&bridge, &app).await?;
        }
    }

    emit_progress(
        &app,
        "preparing",
        10,
        format!(
            "Preparing handoff: {} → {}",
            request.source_agent_id, request.target_agent_id
        ),
    );

    // Acquire bridge lock for I/O
    let mut bridge_guard = bridge.lock().await;

    // Build and send JSON-RPC request
    let rpc_req = JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        method: "handoff".to_string(),
        params: serde_json::to_value(&request).map_err(|e| e.to_string())?,
        id: 1,
    };

    let mut request_json = serde_json::to_string(&rpc_req).map_err(|e| e.to_string())?;
    request_json.push('\n');

    let stdin = bridge_guard
        .stdin
        .as_mut()
        .ok_or_else(|| "CrewAI bridge stdin not available".to_string())?;

    stdin
        .write_all(request_json.as_bytes())
        .map_err(|e| format!("Failed to write to crewai-bridge: {}", e))?;
    stdin
        .flush()
        .map_err(|e| format!("Failed to flush stdin: {}", e))?;

    // Read response from the stored stdout handle (not from child.stdout,
    // which was taken during startup and stored separately)
    let stdout = bridge_guard
        .stdout
        .as_mut()
        .ok_or_else(|| "CrewAI bridge stdout not available".to_string())?;

    // &mut ChildStdout implements Read, so BufReader::new(&mut *stdout) works
    let mut reader = BufReader::new(&mut *stdout);
    let mut response_line = String::new();
    reader
        .read_line(&mut response_line)
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Release the lock — we're done with I/O
    drop(bridge_guard);

    emit_progress(&app, "complete", 100, "Handoff complete".to_string());

    // Parse the response
    let response: JsonRpcResponse = serde_json::from_str(&response_line.trim())
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if let Some(error) = response.error {
        return Err(error.message.unwrap_or_else(|| "Unknown error".to_string()));
    }

    let result: CrewaiHandoffResult = serde_json::from_value(
        response
            .result
            .ok_or_else(|| "No result in response".to_string())?,
    )
    .map_err(|e| format!("Failed to parse handoff result: {}", e))?;

    info!(
        "CrewAI handoff complete: {} → {} (enriched={})",
        result.source_agent_id, result.target_agent_id, result.enriched
    );

    Ok(result)
}

// ---------------------------------------------------------------------------
// Command: Stop crewai-bridge sidecar
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn stop_crewai_sidecar(
    bridge: State<'_, SharedCrewaiBridge>,
) -> Result<String, String> {
    info!("Stopping crewai-bridge sidecar");

    let mut bridge_guard = bridge.lock().await;
    if let Some(mut child) = bridge_guard.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    bridge_guard.stdin = None;
    bridge_guard.stdout = None;

    info!("crewai-bridge sidecar stopped");
    Ok("crewai-bridge stopped".to_string())
}

// ---------------------------------------------------------------------------
// Command: Check CrewAI availability
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn check_crewai_available(
    bridge: State<'_, SharedCrewaiBridge>,
) -> Result<CrewaiHealth, String> {
    let sidecar_path = get_sidecar_path();
    let exists = std::path::Path::new(&sidecar_path).exists();

    // Check if the persistent sidecar is already running
    let is_running = {
        let guard = bridge.lock().await;
        guard
            .child
            .as_ref()
            .is_some_and(|_| true) // at least we have a recorded child
    };

    // Try a quick health check by spawning and immediately killing
    let can_start = if exists && !is_running {
        match Command::new("python")
            .arg(&sidecar_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(mut child) => {
                std::thread::sleep(std::time::Duration::from_millis(200));
                let started = child.try_wait().ok().flatten().is_none();
                let _ = child.kill();
                let _ = child.wait();
                started
            }
            Err(_) => false,
        }
    } else {
        exists // if we have a child recorded OR the file exists, it's available
    };

    Ok(CrewaiHealth {
        available: exists && can_start,
        sidecar_path,
        running: is_running,
    })
}
