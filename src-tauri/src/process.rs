// Mothership — Sidecar Process Manager
// Manages the lifecycle of external Python sidecar processes.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Instant;
use tracing::{info, warn, error};

/// Status of a sidecar process.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SidecarStatus {
    /// Process not started.
    Stopped,
    /// Process is running.
    Running,
    /// Process exited with an error.
    Failed(String),
}

/// Metadata about a running sidecar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarInfo {
    pub name: String,
    pub status: SidecarStatus,
    pub pid: Option<u32>,
    pub started_at: Option<String>,
    pub uptime_secs: Option<u64>,
}

/// Internal record of a managed sidecar process.
struct SidecarProcess {
    child: Child,
    name: String,
    started_at: Instant,
}

/// Manages sidecar processes (Python scripts or binaries).
pub struct SidecarManager {
    processes: Mutex<HashMap<String, SidecarProcess>>,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            processes: Mutex::new(HashMap::new()),
        }
    }

    /// Spawn a sidecar process.
    ///
    /// `name` — unique identifier (e.g. "hello-bridge")
    /// `command` — path to the executable or python script
    /// `args` — arguments to pass
    pub fn spawn(&self, name: &str, command: &str, args: &[&str]) -> Result<SidecarInfo, String> {
        let mut processes = self.processes.lock().map_err(|e| e.to_string())?;

        // Kill existing process with the same name if it exists
        if let Some(mut existing) = processes.remove(name) {
            warn!("Killing existing sidecar '{}' (pid={})", name, existing.child.id());
            let _ = existing.child.kill();
            let _ = existing.child.wait();
        }

        info!("Spawning sidecar '{}' with command: {} {:?}", name, command, args);

        let child = Command::new(command)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                let msg = format!("Failed to spawn sidecar '{}': {}", name, e);
                error!("{}", msg);
                msg
            })?;

        let pid = child.id();
        info!("Sidecar '{}' spawned with pid={}", name, pid);

        let process = SidecarProcess {
            child,
            name: name.to_string(),
            started_at: Instant::now(),
        };

        let info = SidecarInfo {
            name: name.to_string(),
            status: SidecarStatus::Running,
            pid: Some(pid),
            started_at: Some(chrono::Utc::now().to_rfc3339()),
            uptime_secs: Some(0),
        };

        processes.insert(name.to_string(), process);
        Ok(info)
    }

    /// Kill a sidecar process by name.
    pub fn kill(&self, name: &str) -> Result<(), String> {
        let mut processes = self.processes.lock().map_err(|e| e.to_string())?;

        if let Some(mut process) = processes.remove(name) {
            info!("Killing sidecar '{}' (pid={})", name, process.child.id());
            process.child.kill().map_err(|e| {
                let msg = format!("Failed to kill sidecar '{}': {}", name, e);
                error!("{}", msg);
                msg
            })?;
            process.child.wait().map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err(format!("Sidecar '{}' not found", name))
        }
    }

    /// Check if a sidecar is running and healthy.
    pub fn is_healthy(&self, name: &str) -> bool {
        let mut processes = match self.processes.lock() {
            Ok(p) => p,
            Err(_) => return false,
        };

        if let Some(process) = processes.get_mut(name) {
            match process.child.try_wait() {
                Ok(Some(status)) => {
                    // Process has exited
                    warn!("Sidecar '{}' exited with status: {}", name, status);
                    processes.remove(name);
                    false
                }
                Ok(None) => true, // Still running
                Err(e) => {
                    error!("Error checking sidecar '{}': {}", name, e);
                    false
                }
            }
        } else {
            false
        }
    }

    /// Restart a sidecar process.
    pub fn restart(&self, name: &str) -> Result<SidecarInfo, String> {
        // We need to extract the command info before killing
        // For now, return an error — the caller should kill + spawn
        self.kill(name)?;
        Err(format!(
            "Sidecar '{}' killed. Re-spawn with the original command.",
            name
        ))
    }

    /// List all managed sidecars and their status.
    pub fn list(&self) -> Vec<SidecarInfo> {
        let mut processes = match self.processes.lock() {
            Ok(p) => p,
            Err(_) => return vec![],
        };

        let mut result = Vec::new();
        let mut to_remove = Vec::new();

        for (name, process) in processes.iter_mut() {
            match process.child.try_wait() {
                Ok(Some(status)) => {
                    result.push(SidecarInfo {
                        name: name.clone(),
                        status: SidecarStatus::Failed(status.to_string()),
                        pid: Some(process.child.id()),
                        started_at: Some(chrono::Utc::now().to_rfc3339()),
                        uptime_secs: Some(process.started_at.elapsed().as_secs()),
                    });
                    to_remove.push(name.clone());
                }
                Ok(None) => {
                    result.push(SidecarInfo {
                        name: name.clone(),
                        status: SidecarStatus::Running,
                        pid: Some(process.child.id()),
                        started_at: Some(chrono::Utc::now().to_rfc3339()),
                        uptime_secs: Some(process.started_at.elapsed().as_secs()),
                    });
                }
                Err(e) => {
                    result.push(SidecarInfo {
                        name: name.clone(),
                        status: SidecarStatus::Failed(e.to_string()),
                        pid: None,
                        started_at: None,
                        uptime_secs: None,
                    });
                    to_remove.push(name.clone());
                }
            }
        }

        for name in to_remove {
            processes.remove(&name);
        }

        result
    }

    /// Kill all managed sidecar processes.
    pub fn kill_all(&self) -> Result<(), String> {
        let mut processes = self.processes.lock().map_err(|e| e.to_string())?;

        for (name, mut process) in processes.drain() {
            info!("Killing sidecar '{}' on shutdown", name);
            let _ = process.child.kill();
            let _ = process.child.wait();
        }

        Ok(())
    }
}
