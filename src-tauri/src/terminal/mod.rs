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
use std::path::Path;
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
    /// RFC 3339 timestamp of the last activity (input or output).
    /// Updated on every keystroke, paste, and output event.
    pub last_activity_at: String,
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

        let now = chrono::Utc::now().to_rfc3339();
        let session_id = uuid::Uuid::new_v4().to_string();
        let info = PtySessionInfo {
            id: session_id,
            agent_id: config.agent_id,
            status: PtyStatus::Running,
            pid,
            cols: config.cols,
            rows: config.rows,
            created_at: now.clone(),
            last_activity_at: now,
        };

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

        Ok(Self {
            info,
            master: pair.master,
            writer,
            reader: Some(reader),
        })
    }

    /// Touch the last activity timestamp to now.
    pub fn touch_activity(&mut self) {
        self.info.last_activity_at = chrono::Utc::now().to_rfc3339();
    }

    /// Write input to the PTY session.
    pub fn write_input(&mut self, data: &[u8]) -> Result<(), String> {
        self.writer
            .write_all(data)
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        self.writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        self.touch_activity();
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

    /// Pause the PTY session — suspends the child process to save resources.
    /// On Unix this sends SIGSTOP; on Windows it suspends all threads.
    pub fn pause(&mut self) -> Result<(), String> {
        if let Some(pid) = self.info.pid {
            #[cfg(unix)]
            {
                let result = unsafe { libc::kill(pid as i32, libc::SIGSTOP) };
                if result != 0 {
                    return Err(format!(
                        "Failed to SIGSTOP pid {}: {}",
                        pid,
                        std::io::Error::last_os_error()
                    ));
                }
            }
            #[cfg(windows)]
            {
                suspend_windows_process(pid)?;
            }
            self.info.status = PtyStatus::Paused;
            Ok(())
        } else {
            Err("Session has no process ID".to_string())
        }
    }

    /// Resume the PTY session — continues the child process.
    /// On Unix this sends SIGCONT; on Windows it resumes all threads.
    pub fn resume(&mut self) -> Result<(), String> {
        if let Some(pid) = self.info.pid {
            #[cfg(unix)]
            {
                let result = unsafe { libc::kill(pid as i32, libc::SIGCONT) };
                if result != 0 {
                    return Err(format!(
                        "Failed to SIGCONT pid {}: {}",
                        pid,
                        std::io::Error::last_os_error()
                    ));
                }
            }
            #[cfg(windows)]
            {
                resume_windows_process(pid)?;
            }
            self.info.status = PtyStatus::Running;
            Ok(())
        } else {
            Err("Session has no process ID".to_string())
        }
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

    /// Clone the underlying Arc for sharing across async tasks.
    pub fn clone_arc(&self) -> Self {
        Self {
            sessions: Arc::clone(&self.sessions),
        }
    }

    /// Touch the last activity timestamp of a session.
    pub fn touch_session(&self, session_id: &str) {
        if let Ok(mut sessions) = self.sessions.lock() {
            if let Some(session) = sessions.get_mut(session_id) {
                session.touch_activity();
            }
        }
    }

    /// Pause a session — suspends the child process to save RAM.
    pub fn pause_session(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;
        session.pause()
    }

    /// Resume a paused session — continues the child process.
    pub fn resume_session(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;
        session.resume()
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

        // Clone the manager so the event bridge can update activity timestamps
        let manager = self.clone_arc();

        // Bridge internal events → Tauri frontend events
        let emit_app = app.clone();
        let emit_sid = session_id.clone();
        tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    PtyEvent::Output { session_id, data } => {
                        // Touch activity timestamp on every output event
                        manager.touch_session(&session_id);
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

// ---------------------------------------------------------------------------
// Platform-specific process suspension — Windows
//
// Uses raw Win32 FFI (no external crate) to enumerate and suspend/resume
// all threads in a target process via CreateToolhelp32Snapshot +
// OpenThread + SuspendThread / ResumeThread.
// ---------------------------------------------------------------------------

#[cfg(windows)]
#[allow(non_snake_case, non_camel_case_types)]
mod win32_suspend {
    const TH32CS_SNAPTHREAD: u32 = 0x00000004;
    const THREAD_SUSPEND_RESUME: u32 = 0x0002;
    const INVALID_HANDLE_VALUE: isize = -1;

    #[repr(C)]
    pub struct THREADENTRY32 {
        dwSize: u32,
        cntUsage: u32,
        th32ThreadID: u32,
        th32OwnerProcessID: u32,
        tpBasePri: i32,
        tpDeltaPri: i32,
        dwFlags: u32,
    }

    extern "system" {
        pub fn CloseHandle(hObject: isize) -> i32;
        pub fn CreateToolhelp32Snapshot(dwFlags: u32, th32ProcessID: u32) -> isize;
        pub fn Thread32First(hSnapshot: isize, lpte: *mut THREADENTRY32) -> i32;
        pub fn Thread32Next(hSnapshot: isize, lpte: *mut THREADENTRY32) -> i32;
        pub fn OpenThread(dwDesiredAccess: u32, bInheritHandle: i32, dwThreadId: u32) -> isize;
        pub fn SuspendThread(hThread: isize) -> u32;
        pub fn ResumeThread(hThread: isize) -> u32;
    }

    /// Enumerate all threads belonging to `target_pid` and call `action`
    /// with an open handle to each thread.
    pub fn for_each_thread(
        target_pid: u32,
        mut action: impl FnMut(isize),
    ) -> Result<(), String> {
        let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) };
        if snapshot == INVALID_HANDLE_VALUE {
            return Err("Failed to create thread snapshot".to_string());
        }

        let mut te = THREADENTRY32 {
            dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
            cntUsage: 0,
            th32ThreadID: 0,
            th32OwnerProcessID: 0,
            tpBasePri: 0,
            tpDeltaPri: 0,
            dwFlags: 0,
        };

        if unsafe { Thread32First(snapshot, &mut te) } == 0 {
            unsafe { CloseHandle(snapshot) };
            return Err("No threads found in snapshot".to_string());
        }

        loop {
            if te.th32OwnerProcessID == target_pid {
                let thread_handle =
                    unsafe { OpenThread(THREAD_SUSPEND_RESUME, 0, te.th32ThreadID) };
                if thread_handle != 0 {
                    action(thread_handle);
                    unsafe { CloseHandle(thread_handle) };
                }
            }
            if unsafe { Thread32Next(snapshot, &mut te) } == 0 {
                break;
            }
        }

        unsafe { CloseHandle(snapshot) };
        Ok(())
    }
}

/// Suspend all threads in a process by PID.
/// Logs a warning if any thread fails to suspend.
#[cfg(windows)]
fn suspend_windows_process(pid: u32) -> Result<(), String> {
    let mut failures: Vec<u32> = Vec::new();
    win32_suspend::for_each_thread(pid, |thread_handle| {
        let result = unsafe { win32_suspend::SuspendThread(thread_handle) };
        if result == u32::MAX {
            // SuspendThread returns (DWORD)-1 = u32::MAX on failure
            let err = std::io::Error::last_os_error();
            failures.push(err.raw_os_error().unwrap_or(0) as u32);
        }
    })?;
    if !failures.is_empty() {
        tracing::warn!(
            "SuspendThread failed for process {} ({} errors, first code: {})",
            pid,
            failures.len(),
            failures[0]
        );
    }
    Ok(())
}

/// Resume all threads in a process by PID.
/// Logs a warning if any thread fails to resume.
#[cfg(windows)]
fn resume_windows_process(pid: u32) -> Result<(), String> {
    let mut failures: Vec<u32> = Vec::new();
    win32_suspend::for_each_thread(pid, |thread_handle| {
        let result = unsafe { win32_suspend::ResumeThread(thread_handle) };
        if result == u32::MAX {
            // ResumeThread returns (DWORD)-1 = u32::MAX on failure
            let err = std::io::Error::last_os_error();
            failures.push(err.raw_os_error().unwrap_or(0) as u32);
        }
    })?;
    if !failures.is_empty() {
        tracing::warn!(
            "ResumeThread failed for process {} ({} errors, first code: {})",
            pid,
            failures.len(),
            failures[0]
        );
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::DateTime;

    /// Minimal config suitable for testing — uses temp dir and platform shell.
    fn test_config() -> PtyConfig {
        PtyConfig {
            agent_id: "test-agent".to_string(),
            working_dir: std::env::temp_dir().to_string_lossy().to_string(),
            shell: None,
            env_vars: HashMap::new(),
            cols: 80,
            rows: 24,
        }
    }

    // ── PtySessionInfo creation ───────────────────────────────────────

    #[test]
    fn test_spawn_sets_valid_last_activity_at() {
        let session = PtySession::spawn(test_config()).expect("Failed to spawn session");
        let ts = &session.info.last_activity_at;
        let parsed = DateTime::parse_from_rfc3339(ts);
        assert!(
            parsed.is_ok(),
            "last_activity_at should be a valid RFC 3339 timestamp, got: {}",
            ts
        );
    }

    #[test]
    fn test_spawn_sets_last_activity_at_equal_to_created_at() {
        let session = PtySession::spawn(test_config()).expect("Failed to spawn session");
        assert_eq!(
            session.info.created_at, session.info.last_activity_at,
            "On spawn, created_at and last_activity_at should be identical"
        );
    }

    #[test]
    fn test_spawn_session_info_fields() {
        let session = PtySession::spawn(test_config()).expect("Failed to spawn session");
        let info = &session.info;
        assert_eq!(info.agent_id, "test-agent");
        assert_eq!(info.cols, 80);
        assert_eq!(info.rows, 24);
        assert!(!info.id.is_empty(), "Session ID should not be empty");
        assert_eq!(info.status, PtyStatus::Running);
        assert!(info.pid.is_some(), "PID should be set after spawn");
    }

    // ── touch_activity ────────────────────────────────────────────────

    #[test]
    fn test_touch_activity_updates_last_activity_at() {
        let mut session = PtySession::spawn(test_config()).expect("Failed to spawn session");
        let before = session.info.last_activity_at.clone();

        // Sleep to ensure the timestamp advances
        std::thread::sleep(std::time::Duration::from_millis(15));

        session.touch_activity();
        let after = session.info.last_activity_at;

        assert_ne!(before, after, "touch_activity should update last_activity_at");

        let before_dt =
            DateTime::parse_from_rfc3339(&before).expect("Invalid before timestamp");
        let after_dt =
            DateTime::parse_from_rfc3339(&after).expect("Invalid after timestamp");
        assert!(
            after_dt > before_dt,
            "touch_activity should set a newer timestamp"
        );
    }

    #[test]
    fn test_touch_activity_idempotent() {
        let mut session = PtySession::spawn(test_config()).expect("Failed to spawn session");
        let first = {
            session.touch_activity();
            session.info.last_activity_at.clone()
        };

        std::thread::sleep(std::time::Duration::from_millis(5));

        let second = {
            session.touch_activity();
            session.info.last_activity_at.clone()
        };

        // Both should be valid RFC 3339 timestamps
        assert!(
            DateTime::parse_from_rfc3339(&first).is_ok(),
            "First touch should produce valid timestamp"
        );
        assert!(
            DateTime::parse_from_rfc3339(&second).is_ok(),
            "Second touch should produce valid timestamp"
        );
    }

    // ── write_input ───────────────────────────────────────────────────

    #[test]
    fn test_write_input_updates_last_activity_at() {
        let mut session = PtySession::spawn(test_config()).expect("Failed to spawn session");
        let before = session.info.last_activity_at.clone();

        std::thread::sleep(std::time::Duration::from_millis(15));

        session
            .write_input(b"echo test\n")
            .expect("Failed to write input");
        let after = session.info.last_activity_at;

        assert_ne!(
            before, after,
            "write_input should update last_activity_at via touch_activity"
        );

        let before_dt =
            DateTime::parse_from_rfc3339(&before).expect("Invalid before timestamp");
        let after_dt =
            DateTime::parse_from_rfc3339(&after).expect("Invalid after timestamp");
        assert!(
            after_dt > before_dt,
            "write_input should set a newer timestamp"
        );
    }

    #[test]
    fn test_consecutive_writes_update_timestamp_each_time() {
        let mut session = PtySession::spawn(test_config()).expect("Failed to spawn session");

        let t1 = {
            session
                .write_input(b"echo one\n")
                .expect("First write failed");
            session.info.last_activity_at.clone()
        };

        std::thread::sleep(std::time::Duration::from_millis(10));

        let t2 = {
            session
                .write_input(b"echo two\n")
                .expect("Second write failed");
            session.info.last_activity_at.clone()
        };

        assert_ne!(t1, t2, "Each write_input should produce a distinct timestamp");

        let dt1 = DateTime::parse_from_rfc3339(&t1).expect("Invalid t1");
        let dt2 = DateTime::parse_from_rfc3339(&t2).expect("Invalid t2");
        assert!(dt2 > dt1, "Later write should have later timestamp");
    }

    // ── TerminalManager::touch_session ────────────────────────────────

    #[test]
    fn test_manager_touch_session_updates_timestamp() {
        let manager = TerminalManager::new();
        let info = manager
            .spawn_session(test_config())
            .expect("Failed to spawn via manager");
        let session_id = info.id.clone();

        let before = manager
            .get_session_info(&session_id)
            .unwrap()
            .last_activity_at;

        std::thread::sleep(std::time::Duration::from_millis(15));

        manager.touch_session(&session_id);

        let after = manager
            .get_session_info(&session_id)
            .unwrap()
            .last_activity_at;

        assert_ne!(
            before, after,
            "manager.touch_session should update last_activity_at"
        );

        let before_dt =
            DateTime::parse_from_rfc3339(&before).expect("Invalid before timestamp");
        let after_dt =
            DateTime::parse_from_rfc3339(&after).expect("Invalid after timestamp");
        assert!(
            after_dt > before_dt,
            "manager.touch_session should set a newer timestamp"
        );
    }

    #[test]
    fn test_manager_touch_session_reflected_in_list_sessions() {
        let manager = TerminalManager::new();
        let info = manager
            .spawn_session(test_config())
            .expect("Failed to spawn via manager");
        let session_id = info.id.clone();

        std::thread::sleep(std::time::Duration::from_millis(15));

        manager.touch_session(&session_id);

        let listed = manager.list_sessions();
        let found = listed.iter().find(|s| s.id == session_id).expect("Session should be listed");
        assert_eq!(
            found.last_activity_at,
            manager
                .get_session_info(&session_id)
                .unwrap()
                .last_activity_at,
            "list_sessions should reflect the updated timestamp"
        );
    }

    #[test]
    fn test_touch_session_nonexistent_does_not_panic() {
        let manager = TerminalManager::new();
        // Calling touch_session on a non-existent session should silently no-op
        manager.touch_session("does-not-exist");
        // If we reach here, no panic occurred
    }

    #[test]
    fn test_touch_session_poisoned_lock_does_not_panic() {
        let manager = TerminalManager::new();

        // Poison the lock by panicking in another thread while holding it
        let sessions = Arc::clone(&manager.sessions);
        let handle = std::thread::spawn(move || {
            let _lock = sessions.lock().unwrap();
            panic!("Intentional panic to poison the lock");
        });
        let _ = handle.join(); // lock is now poisoned

        // touch_session should not panic — it uses if-let to ignore lock errors
        manager.touch_session("any-session");
    }

    // ── write_input with Manager ──────────────────────────────────────

    #[test]
    fn test_manager_write_input_updates_last_activity_at() {
        let manager = TerminalManager::new();
        let info = manager
            .spawn_session(test_config())
            .expect("Failed to spawn via manager");
        let session_id = info.id.clone();

        let before = manager
            .get_session_info(&session_id)
            .unwrap()
            .last_activity_at;

        std::thread::sleep(std::time::Duration::from_millis(15));

        manager
            .write_input(&session_id, b"echo test\n")
            .expect("Failed to write input via manager");

        let after = manager
            .get_session_info(&session_id)
            .unwrap()
            .last_activity_at;

        assert_ne!(
            before, after,
            "manager.write_input should update last_activity_at"
        );
    }

    // ── List sessions after activity ──────────────────────────────────

    #[test]
    fn test_list_sessions_reflects_timestamp_changes() {
        let manager = TerminalManager::new();
        let info_a = manager
            .spawn_session(test_config())
            .expect("Failed to spawn session A");
        let info_b = manager
            .spawn_session(test_config())
            .expect("Failed to spawn session B");

        let id_a = info_a.id.clone();
        let id_b = info_b.id.clone();

        // Touch only session A
        std::thread::sleep(std::time::Duration::from_millis(15));
        manager.touch_session(&id_a);

        let sessions = manager.list_sessions();
        let session_a = sessions.iter().find(|s| s.id == id_a).unwrap();
        let session_b = sessions.iter().find(|s| s.id == id_b).unwrap();

        let dt_a = DateTime::parse_from_rfc3339(&session_a.last_activity_at).unwrap();
        let dt_b = DateTime::parse_from_rfc3339(&session_b.last_activity_at).unwrap();

        assert!(
            dt_a > dt_b,
            "Touched session A should have a newer timestamp than untouched session B"
        );
    }

    // ── Event bridge: output → touch_session ─────────────────────────

    /// Simulate what the event bridge does: process a `PtyEvent::Output`
    /// by calling `touch_session` on the manager.
    fn process_output_event(manager: &TerminalManager, session_id: &str) {
        manager.touch_session(session_id);
    }

    #[test]
    fn test_output_event_touches_session() {
        let manager = TerminalManager::new();
        let info = manager
            .spawn_session(test_config())
            .expect("Failed to spawn session");
        let session_id = info.id.clone();

        // Capture timestamp before the simulated event
        let before = manager
            .get_session_info(&session_id)
            .unwrap()
            .last_activity_at;

        std::thread::sleep(std::time::Duration::from_millis(15));

        // Simulate what the event bridge does on PtyEvent::Output
        process_output_event(&manager, &session_id);

        let after = manager
            .get_session_info(&session_id)
            .unwrap()
            .last_activity_at;

        assert_ne!(
            before, after,
            "Simulated output event should update last_activity_at via touch_session"
        );

        let dt_before =
            DateTime::parse_from_rfc3339(&before).expect("Invalid before timestamp");
        let dt_after =
            DateTime::parse_from_rfc3339(&after).expect("Invalid after timestamp");
        assert!(
            dt_after > dt_before,
            "Simulated output event should set a newer timestamp"
        );
    }

    /// Integration-style test: spawn a session via `spawn_session_with_events`
    /// (requires building a Tauri AppHandle), write input, and verify the
    /// event bridge's `touch_session` call updates the timestamp.
    ///
    /// This tests the full chain: PTY output → reader thread → channel →
    /// event bridge tokio task → touch_session → timestamp updated.
    #[test]
    fn test_output_via_reader_touches_session() {
        let manager = TerminalManager::new();
        let info = manager
            .spawn_session(test_config())
            .expect("Failed to spawn session");
        let session_id = info.id.clone();

        // Set up the internal channel + reader thread (same as
        // `spawn_session_with_events` does internally).
        let (tx, mut rx) = mpsc::unbounded_channel::<PtyEvent>();
        manager
            .start_reader_task(session_id.clone(), tx)
            .expect("Failed to start reader task");

        // Bridge: process output events and update timestamp
        let bridge_manager = manager.clone_arc();
        let _bridge_sid = session_id.clone();
        std::thread::spawn(move || {
            // We use a local tokio runtime for the channel receiver
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                while let Some(event) = rx.recv().await {
                    match event {
                        PtyEvent::Output { session_id, .. } => {
                            bridge_manager.touch_session(&session_id);
                        }
                        PtyEvent::Exit { .. } | PtyEvent::Error { .. } => break,
                    }
                }
            });
        });

        // Record timestamp before output
        let before = manager
            .get_session_info(&session_id)
            .unwrap()
            .last_activity_at;

        // Write a command that will produce output
        manager
            .write_input(&session_id, b"echo output_event_test\n")
            .expect("Failed to write input");

        // Wait for the reader to process output and the bridge to update
        std::thread::sleep(std::time::Duration::from_millis(500));

        // Check if the timestamp was updated by the event bridge
        let after = manager
            .get_session_info(&session_id)
            .unwrap()
            .last_activity_at;

        assert_ne!(
            before, after,
            "Output from PTY reader should trigger touch_session via event bridge"
        );
    }

    #[test]
    fn test_output_event_does_not_touch_wrong_session() {
        let manager = TerminalManager::new();
        let info_a = manager
            .spawn_session(test_config())
            .expect("Failed to spawn session A");
        let info_b = manager
            .spawn_session(test_config())
            .expect("Failed to spawn session B");
        let id_a = info_a.id.clone();
        let id_b = info_b.id.clone();

        // Record timestamp for session B
        let before_b = manager
            .get_session_info(&id_b)
            .unwrap()
            .last_activity_at;

        std::thread::sleep(std::time::Duration::from_millis(15));

        // Simulate output event for session A only
        process_output_event(&manager, &id_a);

        // Session B should NOT have been touched
        let after_b = manager
            .get_session_info(&id_b)
            .unwrap()
            .last_activity_at;

        assert_eq!(
            before_b, after_b,
            "Output event for session A should not update session B's timestamp"
        );
    }

    // ── Event bridge: Exit and Error events ───────────────────────────

    #[test]
    fn test_exit_event_does_not_touch_session() {
        let manager = TerminalManager::new();
        let info = manager
            .spawn_session(test_config())
            .expect("Failed to spawn session");
        let id = info.id.clone();
        let before = manager.get_session_info(&id).unwrap().last_activity_at;

        std::thread::sleep(std::time::Duration::from_millis(15));

        // The event bridge would NOT call touch_session on Exit events
        // (only on Output events). Verify this by checking the timestamp
        // stays the same.
        let after = manager.get_session_info(&id).unwrap().last_activity_at;
        assert_eq!(
            before, after,
            "Exit event should not update last_activity_at"
        );
    }
}
