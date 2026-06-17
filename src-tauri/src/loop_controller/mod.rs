// src-tauri/src/loop_controller/mod.rs
//
// Loop Controller — Core autonomous execution engine.
// Canonical type definitions live in PLANS/MOTHERSHIP-RALPH-GLOSSARY.md.
// This module implements the LoopController that runs agentic iterations
// until all tasks are complete or a stopping condition is met.

pub mod completion_detector;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::sync::mpsc;

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
}

// ---------------------------------------------------------------------------
// LoopController
// ---------------------------------------------------------------------------

/// The core loop controller that manages autonomous task execution.
pub struct LoopController {
    config: LoopConfig,
    state: LoopState,
    event_sender: mpsc::UnboundedSender<LoopEvent>,
}

impl LoopController {
    /// Create a new loop controller.
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
        }
    }

    /// Main loop execution. Runs iterations until a stopping condition is met.
    pub async fn run(&mut self) -> Result<LoopResult, LoopError> {
        self.state.status = LoopStatus::Running;
        self.state.start_time = Utc::now();

        let mut iteration = 0;

        loop {
            // Check stopping conditions
            if self.should_stop()? {
                break;
            }

            // Wait if paused
            while self.state.status == LoopStatus::Paused {
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                if self.state.status == LoopStatus::Cancelled {
                    return Ok(self.build_result());
                }
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

            // Run iteration (spawn terminal, send prompt, monitor output)
            let record = self.run_iteration(iteration, &task).await;

            // Record result
            self.state.iterations.push(record.clone());

            // Emit iteration completed
            self.event_sender
                .send(LoopEvent::IterationCompleted {
                    iteration,
                    success: record.success,
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

    /// Pause the loop.
    pub fn pause(&mut self) {
        if self.state.status == LoopStatus::Running {
            self.state.status = LoopStatus::Paused;
        }
    }

    /// Resume the loop.
    pub fn resume(&mut self) {
        if self.state.status == LoopStatus::Paused {
            self.state.status = LoopStatus::Running;
        }
    }

    /// Cancel the loop.
    pub fn cancel(&mut self) {
        self.state.status = LoopStatus::Cancelled;
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

    /// Run a single iteration. Spawns a fresh terminal session, sends the
    /// prompt, monitors output, and returns the iteration record.
    async fn run_iteration(&self, iteration: usize, task: &Task) -> IterationRecord {
        let start = Utc::now();

        // TODO: Spawn fresh terminal session via TerminalManager
        // TODO: Build iteration prompt with progress.txt patterns
        // TODO: Send prompt, monitor output for completion signal
        // TODO: Run quality gates before commit
        // TODO: Extract learnings, update progress.txt and AGENTS.md

        let duration_ms = Utc::now()
            .signed_duration_since(start)
            .num_milliseconds() as u64;

        IterationRecord {
            iteration,
            task_id: task.id.clone(),
            action: format!("Implement: {}", task.title),
            result: String::new(),
            duration_ms,
            timestamp: Utc::now(),
            success: false, // TODO: set based on actual execution
            files_modified: Vec::new(),
            tools_used: Vec::new(),
            learnings: Vec::new(),
        }
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
