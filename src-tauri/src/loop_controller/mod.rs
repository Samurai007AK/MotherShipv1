// src-tauri/src/loop_controller/mod.rs
//
// Loop Controller — Core autonomous execution engine.
// Canonical type definitions live in this module.
// This module implements the LoopController that runs agentic iterations
// until all tasks are complete or a stopping condition is met.

pub mod completion_detector;
pub mod effect_log;

use crate::quality_gate::code_reviewer::CodeReviewer;
use effect_log::{EffectLog, LoopCheckpoint};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicU8, Ordering};
use std::time::Duration;
use tokio::sync::mpsc;

use crate::terminal::{PtyConfig, TerminalManager};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Loop configuration. See GLOSSARY.md for the TypeScript equivalent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopConfig {
    pub agent_id: String,
    pub project_path: String,
    pub max_iterations: usize,
    pub timeout_ms: u64,
    pub quality_gate_commands: QualityGateCommands,
    pub auto_commit: bool,
    pub sync_to_agents_md: bool,
    pub auto_archive: bool,
}

/// Simplified quality gate commands for LoopController integration.
/// The full QualityGateConfig lives in `quality_gate::QualityGateConfig`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityGateCommands {
    pub typecheck: Option<String>,
    pub test: Option<String>,
    pub lint: Option<String>,
    pub ai_review: bool,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/// Loop lifecycle status.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum LoopStatus {
    Idle,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

/// Runtime state of the loop controller.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopState {
    pub id: String,
    pub status: LoopStatus,
    pub current_iteration: usize,
    pub start_time: DateTime<Utc>,
    pub end_time: Option<DateTime<Utc>>,
    pub tasks: Vec<Task>,
    pub iterations: Vec<IterationRecord>,
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/// A single user story from prd.json.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub acceptance_criteria: Vec<String>,
    pub priority: usize,
    pub passes: bool,
    pub notes: String,
    pub iteration_completed: Option<usize>,
    pub files_modified: Vec<String>,
}

/// Record of a single loop iteration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IterationRecord {
    pub iteration: usize,
    pub task_id: String,
    pub action: String,
    pub result: String,
    pub duration_ms: u64,
    pub timestamp: DateTime<Utc>,
    pub success: bool,
    pub files_modified: Vec<String>,
    pub tools_used: Vec<String>,
    pub learnings: Vec<String>,
}

/// Simplified gate result for LoopController internal use.
/// See QUALITY-GATE.md for the full `GateResult` with parsed errors.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityGateSummary {
    pub passed: bool,
    pub results: Vec<CommandResult>,
}

/// Simplified command result (no parsed errors).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResult {
    pub command: String,
    pub success: bool,
    pub output: String,
    pub duration_ms: u64,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/// Events emitted by the loop controller for UI updates.
#[derive(Debug, Clone, Serialize)]
pub enum LoopEvent {
    IterationStarted { iteration: usize, task_id: String },
    IterationCompleted { iteration: usize, success: bool },
    TaskCompleted { task_id: String },
    LoopCompleted { total_iterations: usize },
    Error { message: String },
    ProgressUpdate { progress: f64 },
    SessionArchived { archive_id: String },
    /// A checkpoint was auto-saved after an iteration
    CheckpointSaved { iteration: usize, label: String },
}

// ---------------------------------------------------------------------------
// Results & Errors
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopResult {
    pub status: LoopStatus,
    pub iterations: usize,
    pub duration_ms: u64,
    pub tasks_completed: usize,
    pub tasks_total: usize,
    pub history: Vec<IterationRecord>,
}

#[derive(Debug, thiserror::Error)]
pub enum LoopError {
    #[error("Terminal session failed: {0}")]
    TerminalFailed(String),

    #[error("Quality gate failed: {0}")]
    QualityGateFailed(String),

    #[error("Max iterations reached")]
    MaxIterations,

    #[error("Timeout exceeded")]
    Timeout,

    #[error("User cancelled")]
    Cancelled,

    #[error("Failed to save state: {0}")]
    SaveFailed(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

// ---------------------------------------------------------------------------
// LoopController
// ---------------------------------------------------------------------------

/// Control signal values shared between the running loop and commands.
pub const LOOP_SIGNAL_NONE: u8 = 0;
pub const LOOP_SIGNAL_PAUSE: u8 = 1;
pub const LOOP_SIGNAL_RESUME: u8 = 2;
pub const LOOP_SIGNAL_CANCEL: u8 = 3;

/// The core loop controller that manages autonomous task execution.
pub struct LoopController {
    config: LoopConfig,
    state: LoopState,
    event_sender: mpsc::UnboundedSender<LoopEvent>,
    /// Shared atomic signal for external pause/resume/cancel.
    /// Both the shared-state controller and the background task's clone
    /// point to the same Arc<AtomicU8>, so pause/resume/cancel commands
    /// modify a signal that the running loop can see immediately.
    cancel_signal: Arc<AtomicU8>,
    /// Effect log recording every tool call for checkpoint/fork/rewind.
    pub effect_log: EffectLog,
}

impl LoopController {
    /// Create a new loop controller with a shared cancel signal.
    ///
    /// The cancel_signal is wrapped in an Arc so that both the original
    /// controller (stored in Tauri state) and a clone (running in a
    /// background task) see the same signal. This allows pause/resume/
    /// cancel commands to interrupt the running loop immediately.
    pub fn new(
        config: LoopConfig,
        event_sender: mpsc::UnboundedSender<LoopEvent>,
    ) -> Self {
        let tasks = Self::load_prd_json(&config.project_path).unwrap_or_default();

        Self {
            config: config.clone(),
            state: LoopState {
                id: uuid::Uuid::new_v4().to_string(),
                status: LoopStatus::Idle,
                current_iteration: 0,
                start_time: Utc::now(),
                end_time: None,
                tasks,
                iterations: Vec::new(),
            },
            event_sender,
            cancel_signal: Arc::new(AtomicU8::new(LOOP_SIGNAL_NONE)),
            effect_log: EffectLog::new(),
        }
    }

    /// Clone the controller — the cancel_signal Arc is shared, so
    /// pause/resume/cancel on one clone affects all clones.
    /// The effect_log is cloned independently (each clone gets its own log
    /// that will be merged back when the background task completes).
    pub fn clone_for_bg(&self) -> Self {
        Self {
            config: self.config.clone(),
            state: self.state.clone(),
            event_sender: self.event_sender.clone(),
            cancel_signal: Arc::clone(&self.cancel_signal),
            effect_log: EffectLog::new(),
        }
    }

    /// Main loop execution. Runs iterations until a stopping condition is met.
    /// Requires a TerminalManager for spawning PTY sessions for each iteration.
    pub async fn run(
        &mut self,
        tm: &TerminalManager,
    ) -> Result<LoopResult, LoopError> {
        self.state.status = LoopStatus::Running;
        self.state.start_time = Utc::now();

        let mut iteration = 0;

        loop {
            // Check external control signal first
            self.apply_signal();
            // Check if cancelled before proceeding
            if self.state.status == LoopStatus::Cancelled {
                self.state.end_time = Some(Utc::now());
                return Ok(self.build_result());
            }

            // Check stopping conditions
            if self.should_stop()? {
                break;
            }

            // Wait if paused (also checks external signal)
            while self.state.status == LoopStatus::Paused {
                self.apply_signal();
                if self.state.status == LoopStatus::Cancelled {
                    self.state.end_time = Some(Utc::now());
                    return Ok(self.build_result());
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }

            iteration += 1;
            self.state.current_iteration = iteration;

            // Pick next task
            let task = match self.pick_next_task() {
                Some(t) => t,
                None => {
                    self.state.status = LoopStatus::Completed;
                    break;
                }
            };

            // Emit iteration started
            self.event_sender
                .send(LoopEvent::IterationStarted {
                    iteration,
                    task_id: task.id.clone(),
                })
                .ok();

            // Run iteration with terminal manager
            let record = self.run_iteration(iteration, &task, tm).await;

            // Record result
            self.state.iterations.push(record.clone());

            // Emit iteration completed
            self.event_sender
                .send(LoopEvent::IterationCompleted {
                    iteration,
                    success: record.success,
                })
                .ok();

            // Auto-save checkpoint after each iteration
            if let Err(e) = self.save_checkpoint(
                &format!("Iteration {}", iteration),
                Some(format!("Auto-checkpoint after iteration {} for task '{}'", iteration, task.title)),
            ) {
                tracing::warn!("Failed to save checkpoint: {}", e);
            }

            // Emit checkpoint saved event
            self.event_sender
                .send(LoopEvent::CheckpointSaved {
                    iteration,
                    label: format!("Iteration {}", iteration),
                })
                .ok();

            // Update task status if successful
            if record.success {
                self.update_task_status(&task.id, true, iteration);
                self.event_sender
                    .send(LoopEvent::TaskCompleted {
                        task_id: task.id.clone(),
                    })
                    .ok();
            }

            // Check for completion
            if self.is_complete() {
                self.state.status = LoopStatus::Completed;
                self.event_sender
                    .send(LoopEvent::LoopCompleted {
                        total_iterations: iteration,
                    })
                    .ok();
                break;
            }

            // Small delay between iterations
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }

        self.state.end_time = Some(Utc::now());
        Ok(self.build_result())
    }

    /// Pause the loop — sets both local state and shared atomic signal.
    pub fn pause(&mut self) {
        if self.state.status == LoopStatus::Running {
            self.state.status = LoopStatus::Paused;
            self.cancel_signal.store(LOOP_SIGNAL_PAUSE, Ordering::Release);
        }
    }

    /// Resume the loop — sets both local state and shared atomic signal.
    pub fn resume(&mut self) {
        if self.state.status == LoopStatus::Paused {
            self.state.status = LoopStatus::Running;
            self.cancel_signal.store(LOOP_SIGNAL_RESUME, Ordering::Release);
        }
    }

    /// Cancel the loop — sets both local state and shared atomic signal.
    pub fn cancel(&mut self) {
        self.state.status = LoopStatus::Cancelled;
        self.cancel_signal.store(LOOP_SIGNAL_CANCEL, Ordering::Release);
    }

    /// Read the external control signal and apply it to local state.
    /// This bridges commands sent to the shared-state controller clone
    /// (e.g. by pause_loop/resume_loop/cancel_loop) to the running
    /// background task's controller instance.
    fn apply_signal(&mut self) {
        let signal = self.cancel_signal.load(Ordering::Acquire);
        if signal == LOOP_SIGNAL_NONE {
            return;
        }
        // Reset the signal immediately to prevent double-processing
        self.cancel_signal.store(LOOP_SIGNAL_NONE, Ordering::Release);

        match signal {
            LOOP_SIGNAL_PAUSE => {
                if self.state.status == LoopStatus::Running {
                    self.state.status = LoopStatus::Paused;
                }
            }
            LOOP_SIGNAL_RESUME => {
                if self.state.status == LoopStatus::Paused {
                    self.state.status = LoopStatus::Running;
                }
            }
            LOOP_SIGNAL_CANCEL => {
                self.state.status = LoopStatus::Cancelled;
            }
            _ => {}
        }
    }

    /// Get a reference to the current state.
    pub fn get_state(&self) -> &LoopState {
        &self.state
    }

    // -- Private helpers ---------------------------------------------------

    fn should_stop(&self) -> Result<bool, LoopError> {
        if self.state.current_iteration >= self.config.max_iterations {
            return Ok(true);
        }

        let elapsed = Utc::now()
            .signed_duration_since(self.state.start_time)
            .num_milliseconds() as u64;
        if elapsed >= self.config.timeout_ms {
            return Ok(true);
        }

        // Check consecutive errors
        let consecutive_errors = self
            .state
            .iterations
            .iter()
            .rev()
            .take_while(|r| !r.success)
            .count();
        if consecutive_errors >= 3 {
            return Ok(true);
        }

        if self.state.tasks.iter().all(|t| t.passes) {
            return Ok(true);
        }

        Ok(false)
    }

    fn pick_next_task(&self) -> Option<Task> {
        self.state
            .tasks
            .iter()
            .filter(|t| !t.passes)
            .min_by_key(|t| t.priority)
            .cloned()
    }

    /// Save a checkpoint of the current loop state and effect log.
    pub fn save_checkpoint(&self, label: &str, note: Option<String>) -> Result<LoopCheckpoint, LoopError> {
        let cp = LoopCheckpoint::new(
            &self.state.id,
            label,
            self.state.current_iteration,
            &self.state,
            &self.effect_log,
            "main",
            None,
            note,
        );
        let path = cp.save_to_disk(&self.config.project_path)?;
        tracing::info!("Checkpoint saved: {:?}", path);
        Ok(cp)
    }

    /// Restore from a checkpoint — replaces current state and effect log.
    /// This enables time-travel: rewinding to a previous state.
    pub fn restore_checkpoint(&mut self, checkpoint: &LoopCheckpoint) {
        self.state = checkpoint.state.clone();
        self.effect_log = checkpoint.effect_log.clone();
        self.state.status = LoopStatus::Running;
        tracing::info!(
            "Restored checkpoint '{}' at iteration {}",
            checkpoint.label,
            checkpoint.iteration
        );
    }

    /// Fork from a checkpoint — creates a new branch with a fresh loop_id.
    /// The new controller has the state + effect log from the checkpoint
    /// but a new loop_id, so it's treated as a separate session.
    pub fn fork_from_checkpoint(
        &self,
        checkpoint: &LoopCheckpoint,
        branch_label: &str,
    ) -> Result<LoopCheckpoint, LoopError> {
        let forked_cp = LoopCheckpoint::new(
            &self.state.id,
            &format!("Fork: {}", branch_label),
            checkpoint.iteration,
            &checkpoint.state,
            &checkpoint.effect_log,
            branch_label,
            Some(checkpoint.id.clone()),
            Some(format!("Forked from checkpoint '{}' at iteration {}", checkpoint.label, checkpoint.iteration)),
        );
        let path = forked_cp.save_to_disk(&self.config.project_path)?;
        tracing::info!("Fork checkpoint saved: {:?}", path);
        Ok(forked_cp)
    }

    /// List all checkpoints for this loop session's project.
    pub fn list_checkpoints(&self) -> Result<Vec<LoopCheckpoint>, LoopError> {
        LoopCheckpoint::list(&self.config.project_path)
    }

    /// Get the effect log for inspection.
    pub fn get_effect_log(&self) -> &EffectLog {
        &self.effect_log
    }

    /// Run a single iteration. Spawns a fresh terminal session, sends the
    /// prompt, monitors output, and returns the iteration record.
    async fn run_iteration(
        &mut self,
        iteration: usize,
        task: &Task,
        tm: &TerminalManager,
    ) -> IterationRecord {
        let start = Utc::now();

        // Build iteration prompt from the task
        let prompt = self.build_iteration_prompt(iteration, task);

        // Spawn a PTY session for this iteration
        let config = PtyConfig {
            agent_id: self.config.agent_id.clone(),
            working_dir: self.config.project_path.clone(),
            shell: None,
            env_vars: std::collections::HashMap::new(),
            cols: 120,
            rows: 30,
        };

        let session_info = match tm.spawn_session(config) {
            Ok(info) => info,
            Err(e) => {
                self.effect_log.record(
                    "terminal_spawn",
                    &format!("agent={}, dir={}", self.config.agent_id, self.config.project_path),
                    &format!("Failed: {}", e),
                    false,
                );
                let duration = Utc::now().signed_duration_since(start).num_milliseconds() as u64;
                return IterationRecord {
                    iteration,
                    task_id: task.id.clone(),
                    action: format!("Implement: {}", task.title),
                    result: format!("Failed to spawn terminal: {}", e),
                    duration_ms: duration,
                    timestamp: Utc::now(),
                    success: false,
                    files_modified: Vec::new(),
                    tools_used: Vec::new(),
                    learnings: Vec::new(),
                };
            }
        };
        let session_id = session_info.id.clone();

        self.effect_log.record(
            "terminal_spawn",
            &format!("agent={}, dir={}, session={}", self.config.agent_id, self.config.project_path, session_id),
            "Session spawned successfully",
            true,
        );

        // Set up a channel to receive PTY output
        let (tx, mut rx) = mpsc::unbounded_channel::<crate::terminal::PtyEvent>();
        if let Err(e) = tm.start_reader_task(session_id.clone(), tx) {
            let _ = tm.close_session(&session_id);
            self.effect_log.record(
                "terminal_reader",
                &format!("session={}", session_id),
                &format!("Failed: {}", e),
                false,
            );
            let duration = Utc::now().signed_duration_since(start).num_milliseconds() as u64;
            return IterationRecord {
                iteration,
                task_id: task.id.clone(),
                action: format!("Implement: {}", task.title),
                result: format!("Failed to start reader: {}", e),
                duration_ms: duration,
                timestamp: Utc::now(),
                success: false,
                files_modified: Vec::new(),
                tools_used: Vec::new(),
                learnings: Vec::new(),
            };
        }

        self.effect_log.record(
            "terminal_reader",
            &format!("session={}", session_id),
            "Reader started successfully",
            true,
        );

        // Send the prompt to the terminal
        let command = format!(
            "echo '=== ITERATION {iteration}: {title} ==='\n{prompt}\necho '=== ITERATION DONE ==='\n",
            iteration = iteration,
            title = task.title.replace('\'', "'\\''"),
            prompt = prompt.replace('\'', "'\\''"),
        );
        if let Err(e) = tm.write_input(&session_id, command.as_bytes()) {
            let _ = tm.close_session(&session_id);
            self.effect_log.record(
                "terminal_write",
                &format!("session={}", session_id),
                &format!("Failed to write prompt: {}", e),
                false,
            );
            let duration = Utc::now().signed_duration_since(start).num_milliseconds() as u64;
            return IterationRecord {
                iteration,
                task_id: task.id.clone(),
                action: format!("Implement: {}", task.title),
                result: format!("Failed to write prompt: {}", e),
                duration_ms: duration,
                timestamp: Utc::now(),
                success: false,
                files_modified: Vec::new(),
                tools_used: Vec::new(),
                learnings: Vec::new(),
            };
        }

        self.effect_log.record(
            "terminal_write",
            &command,
            "Prompt sent successfully",
            true,
        );

        // Monitor output for completion signals
        let mut output = String::new();
        let mut completed = false;
        let timeout = Duration::from_millis(self.config.timeout_ms);
        let poll_interval = Duration::from_millis(200);
        let mut elapsed = Duration::from_millis(0);

        // Use CompletionDetector to check for completion signals
        let detector = completion_detector::CompletionDetector::new();

        // Poll for output and completion
        while elapsed < timeout {
            tokio::select! {
                Some(event) = rx.recv() => {
                    match event {
                        crate::terminal::PtyEvent::Output { data, .. } => {
                            output.push_str(&data);
                            // Check for completion signal in the output
                            if detector.detect_in_output(&output, task) {
                                completed = true;
                                break;
                            }
                        }
                        crate::terminal::PtyEvent::Exit { .. } => {
                            completed = true;
                            break;
                        }
                        crate::terminal::PtyEvent::Error { message, .. } => {
                            output.push_str(&format!("\nPTY Error: {}", message));
                            completed = true;
                            break;
                        }
                    }
                }
                _ = tokio::time::sleep(poll_interval) => {
                    elapsed += poll_interval;
                    // Check if iteration is already complete via other signals
                    if self.is_iteration_complete() {
                        completed = true;
                        break;
                    }
                }
            }

            // Check external control signal and local state for pause/cancel
            self.apply_signal();
            if self.state.status == LoopStatus::Cancelled {
                completed = true;
                break;
            }
            while self.state.status == LoopStatus::Paused {
                self.apply_signal();
                if self.state.status == LoopStatus::Cancelled {
                    completed = true;
                    break;
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        }

        // Close the PTY session
        let _ = tm.close_session(&session_id);
        self.effect_log.record(
            "terminal_close",
            &session_id,
            "Session closed",
            true,
        );

        // Run quality gates
        let (quality_passed, gate_results) = self.run_quality_gates().await;

        // Record quality gate results in effect log
        for gate in &gate_results {
            self.effect_log.record(
                "quality_gate",
                &gate.command,
                &gate.output,
                gate.success,
            );
        }

        // Extract learnings from output
        let learnings = self.extract_learnings(&output);

        // Determine files modified from output (simplified: look for "modified:" lines)
        let files_modified: Vec<String> = output
            .lines()
            .filter(|l| {
                let lower = l.to_lowercase();
                lower.contains("modified:") || lower.contains("changed:") || lower.contains("created:")
            })
            .map(|l| l.trim().to_string())
            .collect();

        let duration_ms = Utc::now()
            .signed_duration_since(start)
            .num_milliseconds() as u64;

        // Truncate result to a reasonable size
        let result = if output.len() > 20000 {
            format!("{}...\n[truncated {} bytes]", &output[..20000], output.len() - 20000)
        } else {
            output.clone()
        };

        IterationRecord {
            iteration,
            task_id: task.id.clone(),
            action: format!("Implement: {}", task.title),
            result,
            duration_ms,
            timestamp: Utc::now(),
            success: completed && quality_passed,
            files_modified,
            tools_used: vec!["terminal".to_string(), "quality_gate".to_string()],
            learnings,
        }
    }

    /// Build an iteration prompt from the task definition.
    fn build_iteration_prompt(&self, _iteration: usize, task: &Task) -> String {
        let criteria = task
            .acceptance_criteria
            .iter()
            .enumerate()
            .map(|(i, c)| format!("  {}. {}", i + 1, c))
            .collect::<Vec<_>>()
            .join("\n");

        format!(
            r"Task: {title}

Description:
{description}

Acceptance Criteria:
{criteria}

Priority: {priority}

Please implement this task. After completing the implementation:
1. Signal completion with: <promise>COMPLETE</promise>
2. List any files you modified (prefix with 'modified: ')
3. Note any important decisions made (prefix with 'decision: ')
4. Note any lessons learned (prefix with 'learned: ')",
            title = task.title,
            description = task.description,
            criteria = if criteria.is_empty() { "None specified".to_string() } else { criteria },
            priority = task.priority,
        )
    }

    /// Run configured quality gate commands (typecheck, test, lint, ai_review) as subprocesses.
    async fn run_quality_gates(&self) -> (bool, Vec<CommandResult>) {
        let mut all_passed = true;
        let mut results = Vec::new();

        let commands = [
            ("typecheck", &self.config.quality_gate_commands.typecheck),
            ("test", &self.config.quality_gate_commands.test),
            ("lint", &self.config.quality_gate_commands.lint),
        ];

        for (_name, cmd_opt) in &commands {
            if let Some(cmd_str) = cmd_opt {
                let start = std::time::Instant::now();
                // Parse the command string into program and args
                let parts: Vec<&str> = cmd_str.split_whitespace().collect();
                let program = parts.first().unwrap_or(&"");
                let args = &parts[1..];

                let output = std::process::Command::new(program)
                    .args(args)
                    .current_dir(&self.config.project_path)
                    .output()
                    .ok();

                let duration = start.elapsed().as_millis() as u64;

                match output {
                    Some(out) => {
                        let success = out.status.success();
                        let stdout_str = String::from_utf8_lossy(&out.stdout).to_string();
                        let result_str = if stdout_str.len() > 500 {
                            format!("{}...\n[truncated]", &stdout_str[..500])
                        } else {
                            stdout_str
                        };
                        results.push(CommandResult {
                            command: cmd_str.to_string(),
                            success,
                            output: result_str,
                            duration_ms: duration,
                        });
                        if !success {
                            all_passed = false;
                        }
                    }
                    None => {
                        results.push(CommandResult {
                            command: cmd_str.to_string(),
                            success: false,
                            output: format!("Failed to execute: {}", cmd_str),
                            duration_ms: duration,
                        });
                        all_passed = false;
                    }
                }
            }
        }

        // Run AI code review if enabled
        if self.config.quality_gate_commands.ai_review {
            let start = std::time::Instant::now();
            let mut reviewer = CodeReviewer::new(&self.config.project_path);
            if let Some(review) = reviewer.run_review().await {
                let duration = start.elapsed().as_millis() as u64;
                let review_passed = review.passed;
                results.push(CommandResult {
                    command: "ocr review --format json".to_string(),
                    success: review_passed,
                    output: review.summary.clone(),
                    duration_ms: duration,
                });
                if !review_passed {
                    all_passed = false;
                }
            }
        }

        (all_passed, results)
    }

    /// Extract learnings from terminal output.
    fn extract_learnings(&self, output: &str) -> Vec<String> {
        let mut learnings = Vec::new();
        for line in output.lines() {
            let lower = line.to_lowercase();
            if lower.contains("learned:") || lower.contains("lesson:") {
                let cleaned = line.trim().to_string();
                if !cleaned.is_empty() {
                    learnings.push(cleaned);
                }
            }
        }
        learnings
    }

    /// Check if iteration is complete based on state signals.
    fn is_iteration_complete(&self) -> bool {
        // Currently a simple check — can be expanded
        false
    }

    fn update_task_status(&mut self, task_id: &str, passes: bool, iteration: usize) {
        if let Some(task) = self.state.tasks.iter_mut().find(|t| t.id == task_id) {
            task.passes = passes;
            task.iteration_completed = Some(iteration);
        }
    }

    fn is_complete(&self) -> bool {
        self.state.tasks.iter().all(|t| t.passes)
    }

    fn build_result(&self) -> LoopResult {
        LoopResult {
            status: self.state.status.clone(),
            iterations: self.state.current_iteration,
            duration_ms: self
                .state
                .end_time
                .map(|end| {
                    end.signed_duration_since(self.state.start_time)
                        .num_milliseconds() as u64
                })
                .unwrap_or(0),
            tasks_completed: self.state.tasks.iter().filter(|t| t.passes).count(),
            tasks_total: self.state.tasks.len(),
            history: self.state.iterations.clone(),
        }
    }

    /// Load tasks from prd.json.
    fn load_prd_json(project_path: &str) -> Result<Vec<Task>, LoopError> {
        let prd_path = Path::new(project_path).join("prd.json");
        if !prd_path.exists() {
            return Ok(Vec::new());
        }
        let content = std::fs::read_to_string(&prd_path)?;
        let prd: PrdJson = serde_json::from_str(&content)?;
        Ok(prd.user_stories)
    }
}

// ---------------------------------------------------------------------------
// prd.json schema
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PrdJson {
    project: String,
    #[serde(rename = "branchName")]
    branch_name: String,
    description: String,
    #[serde(rename = "userStories")]
    user_stories: Vec<Task>,
}
