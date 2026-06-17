// src-tauri/src/terminal/mod.rs
//
// Terminal Integration — Per-agent PTY session management.
// Uses portable-pty for cross-platform PTY support (ConPTY on Windows).
//
// Architecture:
//   Frontend (xterm.js) ↔ Tauri Channel ↔ Rust TerminalManager ↔ portable-pty
//
// Each agent gets a dedicated PTY session. Output is streamed to the frontend
// via Tauri IPC Channels for high-throughput, low-latency data flow.

pub mod commands;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Configuration for a new PTY session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtyConfig {
    /// Agent identifier (e.g., "claude", "codex").
    pub agent_id: String,
    /// Working directory for the session.
    pub working_dir: String,
    /// Shell to use (overrides platform default if provided).
    pub shell: Option<String>,
    /// Environment variables to set.
    pub env_vars: HashMap<String, String>,
    /// Terminal width in columns.
    pub cols: u16,
    /// Terminal height in rows.
    pub rows: u16,
}

impl Default for PtyConfig {
    fn default() -> Self {
        Self {
            agent_id: String::new(),
            working_dir: std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default(),
            shell: None,
            env_vars: HashMap::new(),
            cols: 120,
            rows: 30,
        }
    }
}

/// Status of a PTY session.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PtyStatus {
    Starting,
    Running,
    Paused,
    Exited,
    Error(String),
}

/// Information about a PTY session (serializable for frontend).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtySessionInfo {
    pub id: String,
    pub agent_id: String,
    pub status: PtyStatus,
    pub pid: Option<u32>,
    pub cols: u16,
    pub rows: u16,
    pub created_at: String,
}

/// Events emitted from a PTY session (internal channel).
#[derive(Debug, Clone, Serialize)]
pub enum PtyEvent {
    Output { session_id: String, data: String },
    Exit { session_id: String, code: i32 },
    Error { session_id: String, message: String },
}

/// Payload emitted to the frontend via Tauri events.
#[derive(Debug, Clone, Serialize)]
pub struct TerminalOutputPayload {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TerminalExitPayload {
    pub session_id: String,
    pub code: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct TerminalErrorPayload {
    pub session_id: String,
    pub message: String,
}

// ---------------------------------------------------------------------------
// PtySession
// ---------------------------------------------------------------------------

/// A single PTY session wrapping a portable-pty master handle.
pub struct PtySession {
    pub info: PtySessionInfo,
    #[allow(dead_code)]
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    reader: Option<Box<dyn Read + Send>>,
}

impl PtySession {
    /// Spawn a new PTY session.
    pub fn spawn(config: PtyConfig) -> Result<Self, String> {
        let pty_system = portable_pty::native_pty_system();

        let size = portable_pty::PtySize {
            rows: config.rows,
            cols: config.cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(size)
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        // Determine shell
        #[cfg(target_os = "windows")]
        let shell_cmd = config.shell.unwrap_or_else(|| {
            std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
        });

        #[cfg(not(target_os = "windows"))]
        let shell_cmd = config.shell.unwrap_or_else(|| {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        });

        let mut cmd = portable_pty::CommandBuilder::new(&shell_cmd);
        cmd.cwd(Path::new(&config.working_dir));

        for (key, value) in &config.env_vars {
            cmd.env(key, value);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {}", e))?;

        let pid = child.process_id();

        let session_id = uuid::Uuid::new_v4().to_string();
        let info = PtySessionInfo {
            id: session_id,
            agent_id: config.agent_id,
            status: PtyStatus::Running,
            pid,
            cols: config.cols,
            rows: config.rows,
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

        let reader = pair
            .master
            .take_reader()
            .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

        Ok(Self {
            info,
            master: pair.master,
            writer,
            reader: Some(reader),
        })
    }

    /// Write input to the PTY session.
    pub fn write_input(&mut self, data: &[u8]) -> Result<(), String> {
        self.writer
            .write_all(data)
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        self.writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        Ok(())
    }

    /// Resize the PTY session.
    pub fn resize(&mut self, cols: u16, rows: u16) -> Result<(), String> {
        self.master
            .resize(portable_pty::PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {}", e))?;
        self.info.cols = cols;
        self.info.rows = rows;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// TerminalManager
// ---------------------------------------------------------------------------

/// Manages all PTY sessions for the application.
/// Thread-safe via Arc<Mutex<...>> for access from async Tauri commands.
pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Spawn a new PTY session and return its info.
    pub fn spawn_session(&self, config: PtyConfig) -> Result<PtySessionInfo, String> {
        let session = PtySession::spawn(config)?;
        let info = session.info.clone();

        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        sessions.insert(info.id.clone(), session);

        Ok(info)
    }

    /// Write input to a session.
    pub fn write_input(&self, session_id: &str, data: &[u8]) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;
        session.write_input(data)
    }

    /// Resize a session.
    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;
        session.resize(cols, rows)
    }

    /// Close a session.
    pub fn close_session(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        sessions
            .remove(session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;
        Ok(())
    }

    /// Get info about all active sessions.
    pub fn list_sessions(&self) -> Vec<PtySessionInfo> {
        let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        sessions.values().map(|s| s.info.clone()).collect()
    }

    /// Get info about a specific session.
    pub fn get_session_info(&self, session_id: &str) -> Option<PtySessionInfo> {
        let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        sessions.get(session_id).map(|s| s.info.clone())
    }

    /// Start a background reader task that streams PTY output via a channel.
    /// Takes the reader from the session (can only be called once per session).
    pub fn start_reader_task(
        &self,
        session_id: String,
        tx: mpsc::UnboundedSender<PtyEvent>,
    ) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get_mut(&session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;

        // Take the reader from the session (consumes it)
        let mut reader = session
            .reader
            .take()
            .ok_or_else(|| format!("Reader already taken for session {}", session_id))?;

        // Drop the lock before spawning the thread
        drop(sessions);

        // Spawn a background thread to read from PTY
        let sid = session_id;
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        let _ = tx.send(PtyEvent::Exit {
                            session_id: sid.clone(),
                            code: 0,
                        });
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        if tx
                            .send(PtyEvent::Output {
                                session_id: sid.clone(),
                                data,
                            })
                            .is_err()
                        {
                            break; // Receiver dropped
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(PtyEvent::Error {
                            session_id: sid.clone(),
                            message: e.to_string(),
                        });
                        break;
                    }
                }
            }
        });

        Ok(())
    }

    /// Spawn a new PTY session, start the reader task, and bridge events to
    /// the Tauri frontend via `app.emit()`. This is the primary entry point
    /// called by the `spawn_terminal_session` command.
    pub fn spawn_session_with_events(
        &self,
        config: PtyConfig,
        app: AppHandle,
    ) -> Result<PtySessionInfo, String> {
        let info = self.spawn_session(config)?;
        let session_id = info.id.clone();

        // Create an internal channel for the reader thread
        let (tx, mut rx) = mpsc::unbounded_channel::<PtyEvent>();

        // Start the background reader task
        self.start_reader_task(session_id.clone(), tx)?;

        // Bridge internal events → Tauri frontend events
        let emit_app = app.clone();
        let emit_sid = session_id.clone();
        tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    PtyEvent::Output { session_id, data } => {
                        let _ = emit_app.emit(
                            "terminal-output",
                            TerminalOutputPayload {
                                session_id,
                                data,
                            },
                        );
                    }
                    PtyEvent::Exit { session_id, code } => {
                        let _ = emit_app.emit(
                            "terminal-exit",
                            TerminalExitPayload {
                                session_id,
                                code,
                            },
                        );
                        break; // Session ended, stop bridging
                    }
                    PtyEvent::Error { session_id, message } => {
                        let _ = emit_app.emit(
                            "terminal-error",
                            TerminalErrorPayload {
                                session_id,
                                message,
                            },
                        );
                        break; // Error, stop bridging
                    }
                }
            }
            tracing::debug!("Event bridge stopped for session {}", emit_sid);
        });

        Ok(info)
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}
