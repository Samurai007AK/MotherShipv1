// src-tauri/src/execution_engine/mod.rs
//
// Enhanced Execution Engine — Parallel agent execution with context sharing.
//
// Architecture:
//   An ExecutionGroup defines a set of agents that run in parallel with
//   shared context. Each agent gets its own PTY session (via TerminalManager),
//   receives its prompt, and streams output back. A shared context bus allows
//   agents to read/write context entries during execution.
//
//   Execution lifecycle:
//     Pending → Spawning → Running (all agents) → Completed / Error
//
//   Each agent lifecycle:
//     Pending → Spawning → Running → Completed / Error

pub mod commands;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};

use crate::terminal::{PtyConfig, TerminalManager};
use tauri::Emitter;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Status of the overall execution group.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ExecutionGroupStatus {
    Pending,
    Spawning,
    Running,
    Completed,
    Error(String),
}

/// Status of an individual agent within an execution group.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AgentExecutionStatus {
    Pending,
    Spawning,
    Running,
    Completed,
    Error(String),
}

/// An agent participating in an execution group.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionAgent {
    /// Agent identifier (matches agentStore.id).
    pub agent_id: String,
    /// The prompt to send to this agent's terminal.
    pub prompt: String,
    /// Current execution status.
    pub status: AgentExecutionStatus,
    /// Output captured so far.
    pub output: String,
    /// Error message if status is Error.
    pub error: Option<String>,
    /// PTY session ID (if spawned).
    pub session_id: Option<String>,
    /// When this agent started executing.
    pub started_at: Option<DateTime<Utc>>,
    /// When this agent completed (or errored).
    pub completed_at: Option<DateTime<Utc>>,
}

/// A shared context entry that all agents in the group can access.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedContextEntry {
    /// Who wrote this entry (agent_id or "system").
    pub source: String,
    /// The context content.
    pub content: String,
    /// When this entry was created.
    pub created_at: DateTime<Utc>,
}

/// An execution group — a set of agents running in parallel with shared context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionGroup {
    /// Unique identifier for this execution group.
    pub id: String,
    /// Human-readable name.
    pub name: String,
    /// Overall status.
    pub status: ExecutionGroupStatus,
    /// Agents in this group.
    pub agents: Vec<ExecutionAgent>,
    /// Shared context visible to all agents.
    pub shared_context: Vec<SharedContextEntry>,
    /// When this group was created.
    pub created_at: DateTime<Utc>,
    /// When this group completed (or errored).
    pub completed_at: Option<DateTime<Utc>>,
}

/// Configuration for creating a new execution group.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionGroupConfig {
    /// Human-readable name for the group.
    pub name: String,
    /// Agents to execute, with their prompts.
    pub agents: Vec<ExecutionAgentConfig>,
    /// Initial shared context to provide to all agents.
    pub initial_context: Option<String>,
}

/// Configuration for a single agent in an execution group.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionAgentConfig {
    /// Agent identifier.
    pub agent_id: String,
    /// Prompt to send to this agent.
    pub prompt: String,
}

/// Result of a completed execution group.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub group_id: String,
    pub status: ExecutionGroupStatus,
    pub agent_results: Vec<AgentResult>,
    pub total_duration_ms: u64,
}

/// Result of a single agent's execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentResult {
    pub agent_id: String,
    pub status: AgentExecutionStatus,
    pub output: String,
    pub error: Option<String>,
    pub duration_ms: u64,
}

/// Events emitted by the execution engine to the frontend.
#[derive(Debug, Clone, Serialize)]
pub enum ExecutionEvent {
    GroupStatusChanged {
        group_id: String,
        status: ExecutionGroupStatus,
    },
    AgentStatusChanged {
        group_id: String,
        agent_id: String,
        status: AgentExecutionStatus,
    },
    AgentOutput {
        group_id: String,
        agent_id: String,
        data: String,
    },
    ContextAdded {
        group_id: String,
        entry: SharedContextEntry,
    },
    GroupCompleted {
        group_id: String,
        result: ExecutionResult,
    },
}

// ---------------------------------------------------------------------------
// ExecutionEngine
// ---------------------------------------------------------------------------

/// Payload emitted to the frontend via Tauri events.
#[derive(Debug, Clone, Serialize)]
pub struct ExecutionOutputPayload {
    pub group_id: String,
    pub agent_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExecutionStatusPayload {
    pub group_id: String,
    pub agent_id: Option<String>,
    pub status: String,
}

/// Manages parallel agent execution groups.
pub struct ExecutionEngine {
    /// Active execution groups, keyed by group ID.
    groups: Arc<RwLock<HashMap<String, ExecutionGroup>>>,
    /// Event sender for bridging to frontend.
    event_tx: mpsc::UnboundedSender<ExecutionEvent>,
    /// Tauri app handle for emitting events to frontend.
    app_handle: Option<tauri::AppHandle>,
}

impl ExecutionEngine {
    pub fn new(event_tx: mpsc::UnboundedSender<ExecutionEvent>) -> Self {
        Self {
            groups: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
            app_handle: None,
        }
    }

    /// Set the Tauri app handle for bridging events to the frontend.
    pub fn set_app_handle(&mut self, app: tauri::AppHandle) {
        self.app_handle = Some(app);
    }

    /// Create a new execution group and start executing it.
    /// Returns the group ID immediately; execution happens in background.
    pub async fn start_group(
        &self,
        config: ExecutionGroupConfig,
        terminal_manager: &TerminalManager,
    ) -> Result<String, String> {
        let group_id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now();

        let agents: Vec<ExecutionAgent> = config
            .agents
            .into_iter()
            .map(|a| ExecutionAgent {
                agent_id: a.agent_id,
                prompt: a.prompt,
                status: AgentExecutionStatus::Pending,
                output: String::new(),
                error: None,
                session_id: None,
                started_at: None,
                completed_at: None,
            })
            .collect();

        let initial_context = config.initial_context.map(|content| SharedContextEntry {
            source: "system".to_string(),
            content,
            created_at: now,
        });

        let group = ExecutionGroup {
            id: group_id.clone(),
            name: config.name,
            status: ExecutionGroupStatus::Spawning,
            agents,
            shared_context: initial_context.into_iter().collect(),
            created_at: now,
            completed_at: None,
        };

        // Store group
        {
            let mut groups = self.groups.write().await;
            groups.insert(group_id.clone(), group);
        }

        // Emit spawning status
        self.emit(ExecutionEvent::GroupStatusChanged {
            group_id: group_id.clone(),
            status: ExecutionGroupStatus::Spawning,
        })
        .ok();

        // Start execution in background
        let engine_clone = self.groups.clone();
        let event_tx = self.event_tx.clone();
        let group_id_clone = group_id.clone();
        let tm = terminal_manager.clone_arc();
        let app = self.app_handle.clone();

        tokio::spawn(async move {
            if let Err(err) = Self::execute_group(
                &engine_clone,
                &event_tx,
                &group_id_clone,
                &tm,
            )
            .await
            {
                let err_msg = err.to_string();
                tracing::error!("Execution group {} failed: {}", group_id_clone, err_msg);
                // Set group to error
                let mut groups = engine_clone.write().await;
                if let Some(g) = groups.get_mut(&group_id_clone) {
                    g.status = ExecutionGroupStatus::Error(err_msg.clone());
                    g.completed_at = Some(Utc::now());
                }
                // Emit via Tauri event if app handle available
                if let Some(ref app) = app {
                    let _ = app.emit("execution-status", ExecutionStatusPayload {
                        group_id: group_id_clone.clone(),
                        agent_id: None,
                        status: format!("Error({})", err_msg),
                    });
                }
            }
        });

        Ok(group_id)
    }

    /// Internal: execute all agents in a group in parallel.
    async fn execute_group(
        groups: &Arc<RwLock<HashMap<String, ExecutionGroup>>>,
        event_tx: &mpsc::UnboundedSender<ExecutionEvent>,
        group_id: &str,
        terminal_manager: &TerminalManager,
    ) -> Result<(), String> {
        // Get the agents to run
        let agents: Vec<(usize, String, String)> = {
            let g = groups.read().await;
            g.get(group_id)
                .map(|g| {
                    g.agents
                        .iter()
                        .enumerate()
                        .map(|(i, a)| (i, a.agent_id.clone(), a.prompt.clone()))
                        .collect()
                })
                .ok_or_else(|| format!("Group {} not found", group_id))?
        };

        if agents.is_empty() {
            return Err("No agents in execution group".to_string());
        }

        // Set group to running
        {
            let mut g = groups.write().await;
            if let Some(g) = g.get_mut(group_id) {
                g.status = ExecutionGroupStatus::Running;
            }
        }
        let _ = event_tx.send(ExecutionEvent::GroupStatusChanged {
            group_id: group_id.to_string(),
            status: ExecutionGroupStatus::Running,
        });

        // Run all agents concurrently using futures::future::join_all
        // Each agent gets its own PTY session via cloned TerminalManager
        let tm = terminal_manager.clone_arc();
        let mut agent_futures = Vec::new();

        for (_, agent_id, prompt) in &agents {
            let groups = Arc::clone(groups);
            let event_tx = event_tx.clone();
            let gid = group_id.to_string();
            let aid = agent_id.clone();
            let prompt = prompt.clone();
            let tm = tm.clone_arc();

            agent_futures.push(Self::execute_agent(
                groups, event_tx, gid, aid, prompt, tm,
            ));
        }

        let results = futures::future::join_all(agent_futures).await;
        let mut all_ok = true;
        for result in &results {
            if let Err(e) = result {
                tracing::error!("Agent execution failed: {}", e);
                all_ok = false;
            }
        }

        // Check if any agent failed
        let failed: Vec<String> = {
            let g = groups.read().await;
            g.get(group_id)
                .map(|g| {
                    g.agents
                        .iter()
                        .filter(|a| matches!(a.status, AgentExecutionStatus::Error(_)))
                        .map(|a| a.agent_id.clone())
                        .collect()
                })
                .unwrap_or_default()
        };

        // Build result
        let agent_results: Vec<AgentResult> = {
            let g = groups.read().await;
            g.get(group_id)
                .map(|g| {
                    g.agents
                        .iter()
                        .map(|a| {
                            let duration = match (&a.started_at, &a.completed_at) {
                                (Some(start), Some(end)) => {
                                    end.signed_duration_since(*start)
                                        .num_milliseconds() as u64
                                }
                                _ => 0,
                            };
                            AgentResult {
                                agent_id: a.agent_id.clone(),
                                status: a.status.clone(),
                                output: a.output.clone(),
                                error: a.error.clone(),
                                duration_ms: duration,
                            }
                        })
                        .collect()
                })
                .unwrap_or_default()
        };

        let start_time = {
            let g = groups.read().await;
            g.get(group_id).map(|g| g.created_at)
        };

        let total_duration = start_time
            .map(|start| {
                Utc::now().signed_duration_since(start).num_milliseconds() as u64
            })
            .unwrap_or(0);

        let final_status = if failed.is_empty() {
            ExecutionGroupStatus::Completed
        } else {
            ExecutionGroupStatus::Error(format!(
                "Agents failed: {}",
                failed.join(", ")
            ))
        };

        // Update group
        {
            let mut g = groups.write().await;
            if let Some(g) = g.get_mut(group_id) {
                g.status = final_status.clone();
                g.completed_at = Some(Utc::now());
            }
        }

        // Emit completion
        let result = ExecutionResult {
            group_id: group_id.to_string(),
            status: final_status,
            agent_results,
            total_duration_ms: total_duration,
        };

        let _ = event_tx.send(ExecutionEvent::GroupCompleted {
            group_id: group_id.to_string(),
            result: result.clone(),
        });

        if all_ok && failed.is_empty() {
            Ok(())
        } else {
            Err(format!("Some agents failed: {}", failed.join(", ")))
        }
    }

    /// Execute a single agent within a group.
    /// Takes owned values to avoid lifetime issues with concurrent execution.
    async fn execute_agent(
        groups: Arc<RwLock<HashMap<String, ExecutionGroup>>>,
        event_tx: mpsc::UnboundedSender<ExecutionEvent>,
        group_id: String,
        agent_id: String,
        prompt: String,
        terminal_manager: TerminalManager,
    ) -> Result<(), String> {
        let now = Utc::now();

        // Update agent status to Spawning
        {
            let mut g = groups.write().await;
            if let Some(g) = g.get_mut(&group_id) {
                if let Some(a) = g.agents.iter_mut().find(|a| a.agent_id == agent_id) {
                    a.status = AgentExecutionStatus::Spawning;
                }
            }
        }
        let _ = event_tx.send(ExecutionEvent::AgentStatusChanged {
            group_id: group_id.clone(),
            agent_id: agent_id.clone(),
            status: AgentExecutionStatus::Spawning,
        });

        // Build prompt with shared context
        let full_prompt = {
            let g = groups.read().await;
            let context_str = g
                .get(&group_id)
                .map(|g| {
                    g.shared_context
                        .iter()
                        .map(|e| format!("[{}] {}: {}", e.created_at.format("%H:%M:%S"), e.source, e.content))
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default();

            if context_str.is_empty() {
                prompt
            } else {
                format!(
                    "Shared Context:\n{context_str}\n\nYour Task:\n{prompt}"
                )
            }
        };

        // Spawn a PTY session for this agent
        let config = PtyConfig {
            agent_id: agent_id.clone(),
            working_dir: std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default(),
            env_vars: std::collections::HashMap::new(),
            cols: 120,
            rows: 30,
            shell: None,
        };

        let session_id = match terminal_manager.spawn_session(config) {
            Ok(info) => info.id.clone(),
            Err(e) => {
                let mut g = groups.write().await;
                if let Some(g) = g.get_mut(&group_id) {
                    if let Some(a) = g.agents.iter_mut().find(|a| a.agent_id == agent_id) {
                        a.status = AgentExecutionStatus::Error(e.clone());
                        a.error = Some(e.clone());
                        a.completed_at = Some(Utc::now());
                    }
                }
                return Err(e);
            }
        };

        // Start reader task with a channel
        let (tx, mut rx) = mpsc::unbounded_channel::<crate::terminal::PtyEvent>();
        terminal_manager.start_reader_task(session_id.clone(), tx)?;

        // Update agent status to Running
        {
            let mut g = groups.write().await;
            if let Some(g) = g.get_mut(&group_id) {
                if let Some(a) = g.agents.iter_mut().find(|a| a.agent_id == agent_id) {
                    a.status = AgentExecutionStatus::Running;
                    a.session_id = Some(session_id.clone());
                    a.started_at = Some(now);
                }
            }
        }
        let _ = event_tx.send(ExecutionEvent::AgentStatusChanged {
            group_id: group_id.clone(),
            agent_id: agent_id.clone(),
            status: AgentExecutionStatus::Running,
        });

        // Send the prompt to the terminal
        let input = format!("echo '=== EXECUTING ===' && {}\n", full_prompt.replace('\'', "'\\''"));
        terminal_manager.write_input(&session_id, input.as_bytes())?;

        // Collect output
        let mut output = String::new();
        let mut timeout = tokio::time::interval(std::time::Duration::from_secs(30));

        loop {
            tokio::select! {
                Some(event) = rx.recv() => {
                    match event {
                        crate::terminal::PtyEvent::Output { session_id: _, data } => {
                            output.push_str(&data);
                            let _ = event_tx.send(ExecutionEvent::AgentOutput {
                                group_id: group_id.clone(),
                                agent_id: agent_id.clone(),
                                data: data.clone(),
                            });
                            let mut g = groups.write().await;
                            if let Some(g) = g.get_mut(&group_id) {
                                if let Some(a) = g.agents.iter_mut().find(|a| a.agent_id == agent_id) {
                                    a.output = output.clone();
                                }
                            }
                        }
                        crate::terminal::PtyEvent::Exit { session_id: _, code } => {
                            tracing::info!("Agent {} session exited with code {}", agent_id, code);
                            break;
                        }
                        crate::terminal::PtyEvent::Error { session_id: _, message } => {
                            let _ = terminal_manager.close_session(&session_id);
                            let mut g = groups.write().await;
                            if let Some(g) = g.get_mut(&group_id) {
                                if let Some(a) = g.agents.iter_mut().find(|a| a.agent_id == agent_id) {
                                    a.status = AgentExecutionStatus::Error(message.clone());
                                    a.error = Some(message.clone());
                                    a.completed_at = Some(Utc::now());
                                }
                            }
                            let _ = event_tx.send(ExecutionEvent::AgentStatusChanged {
                                group_id: group_id.clone(),
                                agent_id: agent_id.clone(),
                                status: AgentExecutionStatus::Error(message.clone()),
                            });
                            return Err(message);
                        }
                    }
                }
                _ = timeout.tick() => {
                    tracing::debug!("Agent {} still executing after 30s", agent_id);
                }
            }
        }

        // Close PTY session on completion
        let _ = terminal_manager.close_session(&session_id);

        // Mark agent as completed
        {
            let mut g = groups.write().await;
            if let Some(g) = g.get_mut(&group_id) {
                if let Some(a) = g.agents.iter_mut().find(|a| a.agent_id == agent_id) {
                    a.status = AgentExecutionStatus::Completed;
                    a.output = output.clone();
                    a.completed_at = Some(Utc::now());
                }
            }
        }
        let _ = event_tx.send(ExecutionEvent::AgentStatusChanged {
            group_id: group_id.clone(),
            agent_id: agent_id.clone(),
            status: AgentExecutionStatus::Completed,
        });

        Ok(())
    }

    /// Add a context entry to a running group (agents can share context mid-execution).
    pub async fn add_context(
        &self,
        group_id: &str,
        source: &str,
        content: &str,
    ) -> Result<(), String> {
        let entry = SharedContextEntry {
            source: source.to_string(),
            content: content.to_string(),
            created_at: Utc::now(),
        };

        {
            let mut groups = self.groups.write().await;
            let group = groups
                .get_mut(group_id)
                .ok_or_else(|| format!("Group {} not found", group_id))?;
            group.shared_context.push(entry.clone());
        }

        self.emit(ExecutionEvent::ContextAdded {
            group_id: group_id.to_string(),
            entry,
        })
        .ok();

        Ok(())
    }

    /// Get the current state of a group.
    pub async fn get_group(&self, group_id: &str) -> Option<ExecutionGroup> {
        let groups = self.groups.read().await;
        groups.get(group_id).cloned()
    }

    /// List all groups.
    pub async fn list_groups(&self) -> Vec<ExecutionGroup> {
        let groups = self.groups.read().await;
        groups.values().cloned().collect()
    }

    /// Cancel a running group.
    pub async fn cancel_group(&self, group_id: &str) -> Result<(), String> {
        // Get all session IDs from the group
        let sessions: Vec<String> = {
            let mut groups = self.groups.write().await;
            let group = groups
                .get_mut(group_id)
                .ok_or_else(|| format!("Group {} not found", group_id))?;

            if group.status != ExecutionGroupStatus::Running {
                return Err("Group is not running".to_string());
            }

            group.status = ExecutionGroupStatus::Error("Cancelled by user".to_string());
            group.completed_at = Some(Utc::now());

            group
                .agents
                .iter()
                .filter_map(|a| a.session_id.clone())
                .collect()
        };

        // Close all sessions (best-effort)
        for sid in &sessions {
            tracing::info!("Cancelling session {}", sid);
        }

        let _ = self.emit(ExecutionEvent::GroupStatusChanged {
            group_id: group_id.to_string(),
            status: ExecutionGroupStatus::Error("Cancelled by user".to_string()),
        });

        Ok(())
    }

    fn emit(&self, event: ExecutionEvent) -> Result<(), String> {
        // Send to internal channel
        self.event_tx
            .send(event.clone())
            .ok();

        // Also bridge to frontend via Tauri events
        if let Some(ref app) = self.app_handle {
            match event {
                ExecutionEvent::AgentOutput { group_id, agent_id, data } => {
                    let _ = app.emit("execution-output", ExecutionOutputPayload {
                        group_id,
                        agent_id,
                        data,
                    });
                }
                ExecutionEvent::GroupStatusChanged { group_id, status } => {
                    let _ = app.emit("execution-status", ExecutionStatusPayload {
                        group_id,
                        agent_id: None,
                        status: format!("{:?}", status),
                    });
                }
                ExecutionEvent::AgentStatusChanged { group_id, agent_id, status } => {
                    let _ = app.emit("execution-status", ExecutionStatusPayload {
                        group_id,
                        agent_id: Some(agent_id),
                        status: format!("{:?}", status),
                    });
                }
                ExecutionEvent::ContextAdded { group_id, .. } => {
                    let _ = app.emit("execution-context", serde_json::json!({
                        "group_id": group_id,
                    }));
                }
                ExecutionEvent::GroupCompleted { group_id, .. } => {
                    let _ = app.emit("execution-status", ExecutionStatusPayload {
                        group_id,
                        agent_id: None,
                        status: "Completed".to_string(),
                    });
                }
            }
        }

        Ok(())
    }
}

// No Default impl — must use ExecutionEngine::new() with a live channel
