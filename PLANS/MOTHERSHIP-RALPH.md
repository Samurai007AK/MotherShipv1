# Mothership — Native Ralph: Terminal Loop Engine

**Last Updated:** 2026-06-16
**Status:** Design Draft
**Scope:** Autonomous task execution engine within Mothership's terminal multiplexer
**Based on:** [snarktank/ralph](https://github.com/snarktank/ralph) — Geoffrey Huntley's Ralph pattern

---

## Overview

**Mothership-Ralph** is a native implementation of the Ralph autonomous loop pattern, rebuilt to run entirely within Mothership's terminal multiplexer with Zustand state tracking. Instead of a bash script spawning external AI CLI tools, Mothership-Ralph runs as an integrated Rust + TypeScript system that:

1. Spawns fresh terminal sessions per iteration (like Ralph)
2. Tracks all state in Zustand (real-time UI updates)
3. Persists memory to SQLite + files (Ralph-compatible)
4. Provides visual progress in the loop progress panel
5. Supports pause/resume/cancel from the UI
6. Integrates with quality gates, error recovery, and human-in-the-loop

---

## Architecture

### System Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    MOTHERSHIP-RALPH ENGINE                                 │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                      Zustand Loop Store                              │ │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐  │ │
│  │  │ LoopState  │ │ TaskList   │ │ Iterations │ │ Metrics          │  │ │
│  │  │ (status,   │ │ (prd.json  │ │ (history,  │ │ (duration,       │  │ │
│  │  │  progress) │ │  sync)     │ │  results)  │ │  success rate)   │  │ │
│  │  └────────────┘ └────────────┘ └────────────┘ └──────────────────┘  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                              │                                             │
│                              ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                  Loop Controller (Rust)                               │ │
│  │                                                                      │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │ │
│  │  │ Iterator   │  │ Quality    │  │ Completion │  │ Error        │  │ │
│  │  │ Manager    │  │ Gates      │  │ Detector   │  │ Recovery     │  │ │
│  │  └────────────┘  └────────────┘  └────────────┘  └──────────────┘  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                              │                                             │
│                              ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                  Terminal Multiplexer Layer                           │ │
│  │                                                                      │ │
│  │  ┌────────────────────────────────────────────────────────────┐     │ │
│  │  │  Iteration Session (Fresh PTY per iteration)               │     │ │
│  │  │  • Spawn new terminal with agent CLI                       │     │ │
│  │  │  • Inject prompt + task context                            │     │ │
│  │  │  • Monitor output for completion/error signals             │     │ │
│  │  │  • Extract learnings before session ends                   │     │ │
│  │  └────────────────────────────────────────────────────────────┘     │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                              │                                             │
│                              ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                  Memory Layer                                         │ │
│  │                                                                      │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │ │
│  │  │ prd.json   │  │ progress   │  │ SQLite     │  │ AGENTS.md    │  │ │
│  │  │ (file)     │  │ .txt       │  │ (metrics)  │  │ (patterns)   │  │ │
│  │  └────────────┘  └────────────┘  └────────────┘  └──────────────┘  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| **Zustand Loop Store** | TypeScript | Real-time UI state, task list sync, iteration tracking |
| **Loop Controller** | Rust | Loop lifecycle, quality gates, completion detection, error recovery |
| **Terminal Multiplexer** | xterm.js + node-pty | Fresh PTY per iteration, output monitoring, session management |
| **Memory Layer** | Files + SQLite | Task persistence, learnings log, metrics, conventions |

---

## Zustand Store Design

> **Canonical store definitions:** See [`UNIFIED-STORE.md`](./UNIFIED-STORE.md) for the complete, authoritative TypeScript store implementations.
>
> **Key stores defined in UNIFIED-STORE.md:**
> - `useLoopStore` — Loop execution state, tasks, iterations, metrics, and subscriptions
> - `useQualityGateStore` — Gate validation results, configuration, and history
> - `useArchiveStore` — Session archival, branch detection, and restoration
> - `useCoordinatorStore` — Cross-store coordination and event processing
>
> The Rust `LoopController`, `QualityGate`, and `CompletionDetector` implementations in this document integrate with these stores via Tauri commands.

---

## Loop Controller (Rust)

### Core Implementation

```rust
// src-tauri/src/loop_controller/mod.rs
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopConfig {
    pub id: String,
    pub agent_id: String,
    pub project_path: String,
    pub max_iterations: usize,
    pub timeout_ms: u64,
    pub quality_gate_commands: QualityGateCommands,
    pub auto_commit: bool,
    pub sync_to_agents_md: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityGateCommands {
    pub typecheck: Option<String>,
    pub test: Option<String>,
    pub lint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopState {
    pub id: String,
    pub status: LoopStatus,
    pub current_iteration: usize,
    pub start_time: chrono::DateTime<chrono::Utc>,
    pub end_time: Option<chrono::DateTime<chrono::Utc>>,
    pub tasks: Vec<Task>,
    pub iterations: Vec<IterationRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LoopStatus {
    Idle,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IterationRecord {
    pub iteration: usize,
    pub task_id: String,
    pub action: String,
    pub result: String,
    pub duration_ms: u64,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub success: bool,
    pub files_modified: Vec<String>,
    pub tools_used: Vec<String>,
    pub learnings: Vec<String>,
}

pub struct LoopController {
    config: LoopConfig,
    state: LoopState,
    terminal_manager: TerminalManager,
    quality_gate: QualityGate,
    completion_detector: CompletionDetector,
    event_sender: mpsc::UnboundedSender<LoopEvent>,
}

#[derive(Debug, Clone, Serialize)]
pub enum LoopEvent {
    IterationStarted { iteration: usize, task_id: String },
    IterationCompleted { iteration: usize, success: bool },
    TaskCompleted { task_id: String },
    LoopCompleted { total_iterations: usize },
    Error { message: String },
    ProgressUpdate { progress: f64 },
}

impl LoopController {
    pub fn new(
        config: LoopConfig,
        terminal_manager: TerminalManager,
        event_sender: mpsc::UnboundedSender<LoopEvent>,
    ) -> Self {
        let tasks = load_prd_json(&config.project_path)
            .unwrap_or_default();
        
        Self {
            config: config.clone(),
            state: LoopState {
                id: config.id,
                status: LoopStatus::Idle,
                current_iteration: 0,
                start_time: chrono::Utc::now(),
                end_time: None,
                tasks,
                iterations: Vec::new(),
            },
            terminal_manager,
            quality_gate: QualityGate::new(&config.quality_gate_commands),
            completion_detector: CompletionDetector::new(),
            event_sender,
        }
    }

    pub async fn run(&mut self) -> Result<LoopResult, LoopError> {
        self.state.status = LoopStatus::Running;
        self.state.start_time = chrono::Utc::now();
        
        let mut iteration = 0;
        
        loop {
            // Check stopping conditions
            if self.should_stop()? {
                break;
            }
            
            // Wait if paused
            while self.state.status == LoopStatus::Paused {
                tokio::time::sleep(Duration::from_millis(100)).await;
                
                // Check if cancelled while paused
                if self.state.status == LoopStatus::Cancelled {
                    return Ok(self.build_result());
                }
            }
            
            iteration += 1;
            self.state.current_iteration = iteration;
            
            // Pick next task
            let task = self.pick_next_task()?;
            if task.is_none() {
                // All tasks complete
                self.state.status = LoopStatus::Completed;
                break;
            }
            let task = task.unwrap();
            
            // Emit iteration started event
            self.event_sender.send(LoopEvent::IterationStarted {
                iteration,
                task_id: task.id.clone(),
            }).ok();
            
            // Run iteration
            let record = self.run_iteration(iteration, &task).await?;
            
            // Record result
            self.state.iterations.push(record.clone());
            
            // Emit iteration completed event
            self.event_sender.send(LoopEvent::IterationCompleted {
                iteration,
                success: record.success,
            }).ok();
            
            // Update task status if successful
            if record.success {
                self.update_task_status(&task.id, true, iteration, &record.files_modified)?;
                
                self.event_sender.send(LoopEvent::TaskCompleted {
                    task_id: task.id,
                }).ok();
            }
            
            // Check for completion
            if self.completion_detector.detect(&self.state) {
                self.state.status = LoopStatus::Completed;
                self.event_sender.send(LoopEvent::LoopCompleted {
                    total_iterations: iteration,
                }).ok();
                break;
            }
            
            // Small delay between iterations
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        
        self.state.end_time = Some(chrono::Utc::now());
        
        // Save final state
        self.save_state()?;
        
        Ok(self.build_result())
    }

    fn should_stop(&self) -> Result<bool, LoopError> {
        // Check max iterations
        if self.state.current_iteration >= self.config.max_iterations {
            return Ok(true);
        }
        
        // Check timeout
        let elapsed = chrono::Utc::now()
            .signed_duration_since(self.state.start_time)
            .num_milliseconds() as u64;
        
        if elapsed >= self.config.timeout_ms {
            return Ok(true);
        }
        
        // Check consecutive errors
        let consecutive_errors = self.state.iterations
            .iter()
            .rev()
            .take_while(|r| !r.success)
            .count();
        
        if consecutive_errors >= 3 {
            return Ok(true);
        }
        
        // Check if all tasks complete
        let all_complete = self.state.tasks.iter().all(|t| t.passes);
        if all_complete {
            return Ok(true);
        }
        
        Ok(false)
    }

    fn pick_next_task(&self) -> Result<Option<Task>, LoopError> {
        // Find highest priority task that hasn't passed
        let next_task = self.state.tasks
            .iter()
            .filter(|t| !t.passes)
            .min_by_key(|t| t.priority)
            .cloned();
        
        Ok(next_task)
    }

    async fn run_iteration(
        &self,
        iteration: usize,
        task: &Task,
    ) -> Result<IterationRecord, LoopError> {
        let start_time = chrono::Utc::now();
        
        // Spawn fresh terminal session
        let session = self.terminal_manager.spawn_session(
            &self.config.agent_id,
            &self.config.project_path,
        ).await?;
        
        // Build prompt for this iteration
        let prompt = self.build_iteration_prompt(iteration, task)?;
        
        // Send prompt to terminal
        session.write_input(&prompt).await?;
        
        // Monitor output
        let mut output_buffer = String::new();
        let mut tools_used = Vec::new();
        let mut files_modified = Vec::new();
        
        loop {
            let output = session.read_output(Duration::from_secs(5)).await?;
            output_buffer.push_str(&output);
            
            // Detect tools used
            if let Some(tools) = self.detect_tools_used(&output) {
                tools_used.extend(tools);
            }
            
            // Detect files modified
            if let Some(files) = self.detect_files_modified(&output) {
                files_modified.extend(files);
            }
            
            // Check for completion signal
            if self.completion_detector.detect_in_output(&output_buffer, task) {
                break;
            }
            
            // Check for error
            if self.detect_error(&output_buffer) {
                // Try to recover
                let recovered = self.attempt_recovery(&session, &output_buffer).await;
                if !recovered {
                    return Ok(IterationRecord {
                        iteration,
                        task_id: task.id.clone(),
                        action: "Failed to complete".to_string(),
                        result: output_buffer,
                        duration_ms: start_time
                            .signed_duration_since(chrono::Utc::now())
                            .num_milliseconds() as u64,
                        timestamp: chrono::Utc::now(),
                        success: false,
                        files_modified,
                        tools_used,
                        learnings: Vec::new(),
                    });
                }
            }
            
            // Check for user input needed
            if self.detect_user_input_needed(&output) {
                // Pause and wait for user
                self.event_sender.send(LoopEvent::Error {
                    message: "User input required".to_string(),
                }).ok();
                
                // User provides input via terminal
                // (handled by UI)
            }
        }
        
        // Run quality gates
        let gate_summary = self.quality_gate.validate(&self.config.project_path).await?;
        
        if !gate_summary.passed {
            return Ok(IterationRecord {
                iteration,
                task_id: task.id.clone(),
                action: "Quality gate failed".to_string(),
                result: format!("Quality gates failed: {:?}", gate_summary.results),
                duration_ms: start_time
                    .signed_duration_since(chrono::Utc::now())
                    .num_milliseconds() as u64,
                timestamp: chrono::Utc::now(),
                success: false,
                files_modified,
                tools_used,
                learnings: Vec::new(),
            });
        }
        
        // Commit if auto-commit enabled
        if self.config.auto_commit {
            self.commit_changes(task, &files_modified).await?;
        }
        
        // Extract learnings
        let learnings = self.extract_learnings(&output_buffer);
        
        // Update progress.txt
        self.append_progress_log(iteration, task, &learnings).await?;
        
        // Update AGENTS.md if enabled
        if self.config.sync_to_agents_md {
            self.update_agents_md(&files_modified, &learnings).await?;
        }
        
        let duration_ms = start_time
            .signed_duration_since(chrono::Utc::now())
            .num_milliseconds() as u64;
        
        Ok(IterationRecord {
            iteration,
            task_id: task.id.clone(),
            action: format!("Implemented: {}", task.title),
            result: output_buffer,
            duration_ms,
            timestamp: chrono::Utc::now(),
            success: true,
            files_modified,
            tools_used,
            learnings,
        })
    }

    fn build_iteration_prompt(&self, iteration: usize, task: &Task) -> String {
        let progress_log = self.read_progress_log().unwrap_or_default();
        let patterns = self.extract_patterns(&progress_log);
        
        format!(
            r#"# Ralph Agent Instructions (Iteration {iteration})

You are an autonomous coding agent working on a software project.

## Your Task
1. Read the PRD at `prd.json` (in the same directory as this file)
2. Read the progress log at `progress.txt` (check Codebase Patterns section first)
3. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from main.
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks (e.g., typecheck, lint, test - use whatever your project requires)
7. Update AGENTS.md files if you discover reusable patterns (see below)
8. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
9. Update the PRD to set `passes: true` for the completed story
10. Append your progress to `progress.txt`

## Current Story
**ID:** {task_id}
**Title:** {task_title}
**Description:** {task_description}
**Acceptance Criteria:**
{acceptance_criteria}

## Codebase Patterns
{patterns}

## Stop Condition
After completing a user story, check if ALL stories have `passes: true`.
If ALL stories are complete and passing, reply with:
<promise>COMPLETE</promise>

## Important
- Work on ONE story per iteration
- Commit frequently
- Keep CI green
- Read the Codebase Patterns section in progress.txt before starting
"#,
            iteration = iteration,
            task_id = task.id,
            task_title = task.title,
            task_description = task.description,
            acceptance_criteria = task.acceptance_criteria
                .iter()
                .map(|c| format!("- {}", c))
                .collect::<Vec<_>>()
                .join("\n"),
            patterns = patterns,
        )
    }

    fn detect_error(&self, output: &str) -> bool {
        let error_patterns = [
            "error:",
            "Error:",
            "FAILED",
            "❌",
            "panic:",
            "Exception:",
            "thread 'main' panicked",
        ];
        
        error_patterns.iter().any(|p| output.contains(p))
    }

    async fn attempt_recovery(
        &self,
        session: &TerminalSession,
        output: &str,
    ) -> bool {
        // Try to fix common errors
        if output.contains("ModuleNotFoundError") {
            // Try to install missing module
            session.write_input("pip install ".to_string()).await.ok();
            return true;
        }
        
        if output.contains("Cannot find module") {
            // Try npm install
            session.write_input("npm install".to_string()).await.ok();
            return true;
        }
        
        false
    }

    fn detect_user_input_needed(&self, output: &str) -> bool {
        let input_patterns = [
            "Do you want to",
            "Press enter to continue",
            "Confirm",
            "Yes/No",
        ];
        
        input_patterns.iter().any(|p| output.contains(p))
    }

    fn extract_learnings(&self, output: &str) -> Vec<String> {
        let mut learnings = Vec::new();
        
        // Look for patterns in output
        if output.contains("uses ") {
            learnings.push("Codebase pattern discovered".to_string());
        }
        
        if output.contains("don't forget") || output.contains("don't forget to") {
            learnings.push("Gotcha discovered".to_string());
        }
        
        learnings
    }

    fn extract_patterns(&self, progress_log: &str) -> String {
        // Extract the Codebase Patterns section
        if let Some(start) = progress_log.find("## Codebase Patterns") {
            if let Some(end) = progress_log[start..].find("---") {
                return progress_log[start..start + end].to_string();
            }
        }
        
        "No patterns discovered yet.".to_string()
    }

    async fn commit_changes(
        &self,
        task: &Task,
        files: &[String],
    ) -> Result<(), LoopError> {
        let commit_message = format!("feat: {} - {}", task.id, task.title);
        
        // Stage files
        for file in files {
            self.run_command(&format!("git add {}", file)).await?;
        }
        
        // Commit
        self.run_command(&format!("git commit -m \"{}\"", commit_message)).await?;
        
        Ok(())
    }

    async fn append_progress_log(
        &self,
        iteration: usize,
        task: &Task,
        learnings: &[String],
    ) -> Result<(), LoopError> {
        let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M");
        
        let entry = format!(
            "\n## {} - {}\n- Implemented: {}\n- Files modified: {}\n- **Learnings:**\n{}\n---\n",
            timestamp,
            task.id,
            task.title,
            task.files_modified.join(", "),
            learnings.iter()
                .map(|l| format!("  - {}", l))
                .collect::<Vec<_>>()
                .join("\n"),
        );
        
        // Append to progress.txt
        let progress_path = Path::new(&self.config.project_path)
            .join("progress.txt");
        
        tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&progress_path)
            .await?
            .write_all(entry.as_bytes())
            .await?;
        
        Ok(())
    }

    async fn update_agents_md(
        &self,
        files: &[String],
        learnings: &[String],
    ) -> Result<(), LoopError> {
        // Find AGENTS.md files in directories of modified files
        for file in files {
            if let Some(dir) = Path::new(file).parent() {
                let agents_md = dir.join("AGENTS.md");
                
                if agents_md.exists() {
                    // Append learnings
                    let entry = format!(
                        "\n## Loop Learnings (Iteration {})\n{}\n",
                        self.state.current_iteration,
                        learnings.iter()
                            .map(|l| format!("- {}", l))
                            .collect::<Vec<_>>()
                            .join("\n"),
                    );
                    
                    tokio::fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open(&agents_md)
                        .await?
                        .write_all(entry.as_bytes())
                        .await?;
                }
            }
        }
        
        Ok(())
    }

    fn build_result(&self) -> LoopResult {
        LoopResult {
            status: self.state.status.clone(),
            iterations: self.state.current_iteration,
            duration_ms: self.state.end_time
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

    fn save_state(&self) -> Result<(), LoopError> {
        // Save to SQLite
        invoke("save_loop_state", &self.state).map_err(|e| LoopError::SaveFailed(e.to_string()))?;
        
        // Save prd.json
        save_prd_json(&self.config.project_path, &self.state.tasks)?;
        
        Ok(())
    }
}

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
```

---

## Quality Gates

> **Canonical quality gate implementation:** See [`QUALITY-GATE.md`](./QUALITY-GATE.md) for the complete, production-ready `QualityGate` implementation with auto-detection, error parsing, and parallel execution. The simplified version below shows the LoopController integration pattern.

```rust
// src-tauri/src/loop_controller/quality_gate.rs
pub struct QualityGate {
    commands: QualityGateCommands,
}

/// Simplified gate result for LoopController integration.
/// See QUALITY-GATE.md for the full GateResult with parsed errors.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityGateSummary {
    pub passed: bool,
    pub results: Vec<CommandResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResult {
    pub command: String,
    pub success: bool,
    pub output: String,
    pub duration_ms: u64,
}

impl QualityGate {
    pub fn new(commands: &QualityGateCommands) -> Self {
        Self {
            commands: commands.clone(),
        }
    }

    pub async fn validate(&self, project_path: &str) -> Result<QualityGateSummary, LoopError> {
        let mut results = Vec::new();
        
        // Run typecheck
        if let Some(cmd) = &self.commands.typecheck {
            results.push(self.run_command(cmd, project_path).await?);
        }
        
        // Run tests
        if let Some(cmd) = &self.commands.test {
            results.push(self.run_command(cmd, project_path).await?);
        }
        
        // Run linter
        if let Some(cmd) = &self.commands.lint {
            results.push(self.run_command(cmd, project_path).await?);
        }
        
        let all_passed = results.iter().all(|r| r.success);
        
        Ok(QualityGateSummary {
            passed: all_passed,
            results,
        })
    }

    async fn run_command(&self, cmd: &str, project_path: &str) -> Result<CommandResult, LoopError> {
        let start = std::time::Instant::now();
        
        let output = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(cmd)
            .current_dir(project_path)
            .output()
            .await?;
        
        let duration_ms = start.elapsed().as_millis() as u64;
        
        Ok(CommandResult {
            command: cmd.to_string(),
            success: output.status.success(),
            output: String::from_utf8_lossy(&output.stdout).to_string() 
                + &String::from_utf8_lossy(&output.stderr),
            duration_ms,
        })
    }
}
```

---

## Completion Detector

```rust
// src-tauri/src/loop_controller/completion_detector.rs
pub struct CompletionDetector;

impl CompletionDetector {
    pub fn new() -> Self {
        Self
    }

    pub fn detect(&self, state: &LoopState) -> bool {
        // Signal 1: Explicit completion tag in last iteration output
        if let Some(last_iteration) = state.iterations.last() {
            if last_iteration.result.contains("<promise>COMPLETE</promise>") {
                return true;
            }
        }
        
        // Signal 2: All tasks in prd.json have passes: true
        if state.tasks.iter().all(|t| t.passes) {
            return true;
        }
        
        // Signal 3: No remaining tasks
        let remaining = state.tasks.iter().filter(|t| !t.passes).count();
        if remaining == 0 {
            return true;
        }
        
        false
    }

    pub fn detect_in_output(&self, output: &str, task: &Task) -> bool {
        // Check for explicit completion signal
        if output.contains("<promise>COMPLETE</promise>") {
            return true;
        }
        
        // Check for task-specific completion indicators
        let completion_signals = [
            "Done!",
            "Complete!",
            "All tests pass",
            "Build successful",
            "✓",
            "✅",
        ];
        
        completion_signals.iter().any(|s| output.contains(s))
    }
}
```

---

## Terminal Integration

### Fresh Session Per Iteration

```rust
// src-tauri/src/terminal/iteration_session.rs
pub struct IterationSession {
    session_id: String,
    agent_id: String,
    pty: PtyMaster,
    output_buffer: String,
}

impl IterationSession {
    pub async fn spawn(
        agent_id: &str,
        project_path: &str,
    ) -> Result<Self, LoopError> {
        let session_id = Uuid::new_v4().to_string();
        
        // Spawn fresh PTY
        let pty = spawn_pty(agent_id, project_path).await?;
        
        Ok(Self {
            session_id,
            agent_id: agent_id.to_string(),
            pty,
            output_buffer: String::new(),
        })
    }

    pub async fn write_input(&self, input: &str) -> Result<(), LoopError> {
        self.pty.write_all(input.as_bytes())
            .map_err(|e| LoopError::TerminalFailed(e.to_string()))?;
        
        Ok(())
    }

    pub async fn read_output(&mut self, timeout: Duration) -> Result<String, LoopError> {
        let mut buffer = [0u8; 4096];
        let mut output = String::new();
        
        // Read with timeout
        let result = tokio::time::timeout(
            timeout,
            async {
                loop {
                    match self.pty.read(&mut buffer) {
                        Ok(0) => break,
                        Ok(n) => {
                            let chunk = String::from_utf8_lossy(&buffer[..n]);
                            output.push_str(&chunk);
                            self.output_buffer.push_str(&chunk);
                        }
                        Err(e) => return Err(e),
                    }
                }
                Ok(output)
            }
        ).await;
        
        match result {
            Ok(Ok(output)) => Ok(output),
            Ok(Err(e)) => Err(LoopError::TerminalFailed(e.to_string())),
            Err(_) => Ok(String::new()), // Timeout, return empty
        }
    }

    pub fn get_full_output(&self) -> &str {
        &self.output_buffer
    }
}

fn spawn_pty(agent_id: &str, project_path: &str) -> Result<PtyMaster, LoopError> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize::new(24, 120, 0, 0))
        .map_err(|e| LoopError::TerminalFailed(e.to_string()))?;
    
    // Determine shell based on OS
    #[cfg(target_os = "windows")]
    let shell = "cmd.exe";
    
    #[cfg(not(target_os = "windows"))]
    let shell = "bash";
    
    // Spawn shell in PTY
    let mut cmd = Command::new(shell);
    cmd.current_dir(project_path);
    
    // Set environment variables for agent
    cmd.env("RALPH_AGENT", agent_id);
    cmd.env("RALPH_PROJECT", project_path);
    
    pair.slave.spawn(cmd)
        .map_err(|e| LoopError::TerminalFailed(e.to_string()))?;
    
    Ok(pair.master)
}
```

---

## Tauri Commands

```rust
// src-tauri/src/commands/loop_commands.rs
use tauri::State;
use std::sync::Arc;
use tokio::sync::RwLock;

#[tauri::command]
pub async fn start_loop(
    loop_id: String,
    config: LoopConfig,
    state: State<'_, Arc<RwLock<LoopController>>>,
) -> Result<(), String> {
    let mut controller = state.write().await;
    controller.update_config(config);
    
    // Start loop in background
    let controller_clone = state.clone();
    tokio::spawn(async move {
        let mut ctrl = controller_clone.write().await;
        if let Err(e) = ctrl.run().await {
            eprintln!("Loop failed: {}", e);
        }
    });
    
    Ok(())
}

#[tauri::command]
pub async fn pause_loop(
    loop_id: String,
    state: State<'_, Arc<RwLock<LoopController>>>,
) -> Result<(), String> {
    let mut controller = state.write().await;
    controller.pause();
    Ok(())
}

#[tauri::command]
pub async fn resume_loop(
    loop_id: String,
    state: State<'_, Arc<RwLock<LoopController>>>,
) -> Result<(), String> {
    let mut controller = state.write().await;
    controller.resume();
    Ok(())
}

#[tauri::command]
pub async fn cancel_loop(
    loop_id: String,
    state: State<'_, Arc<RwLock<LoopController>>>,
) -> Result<(), String> {
    let mut controller = state.write().await;
    controller.cancel();
    Ok(())
}

#[tauri::command]
pub async fn get_loop_state(
    loop_id: String,
    state: State<'_, Arc<RwLock<LoopController>>>,
) -> Result<LoopState, String> {
    let controller = state.read().await;
    Ok(controller.get_state().clone())
}

#[tauri::command]
pub async fn get_loop_metrics(
    loop_id: String,
    state: State<'_, Arc<RwLock<LoopController>>>,
) -> Result<LoopMetrics, String> {
    let controller = state.read().await;
    Ok(controller.get_metrics())
}
```

---

## UI Components

### Loop Progress Panel

```tsx
// components/loop/LoopProgressPanel.tsx
import { useLoopStore } from '../../stores/loopStore'
import { Button } from '../ui/button'
import { Loader2, CheckCircle2, XCircle, Pause, Play, X } from 'lucide-react'

export function LoopProgressPanel() {
  const {
    status,
    currentIteration,
    maxIterations,
    progress,
    currentTask,
    currentAction,
    iterations,
    startTime,
    errorsEncountered,
    consecutiveErrors,
    pauseLoop,
    resumeLoop,
    cancelLoop,
    retryFromIteration,
  } = useLoopStore()

  const progressPercent = Math.round(progress * 100)
  const isRunning = status === 'running'
  const isPaused = status === 'paused'
  const isCompleted = status === 'completed'
  const isFailed = status === 'failed'

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isRunning && (
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          )}
          {isCompleted && (
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          )}
          {isFailed && (
            <XCircle className="w-4 h-4 text-red-400" />
          )}
          {isPaused && (
            <Pause className="w-4 h-4 text-yellow-400" />
          )}
          <span className="text-sm font-medium text-zinc-200">
            Loop {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>
        <span className="text-xs text-zinc-500">
          Iteration {currentIteration} / {maxIterations}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-zinc-800 rounded-full h-2 mb-3">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Task Info */}
      {currentTask && (
        <div className="text-xs text-zinc-400 mb-3">
          <span className="text-zinc-500">Current:</span>{' '}
          <span className="text-zinc-300">{currentTask.title}</span>
        </div>
      )}

      {/* Current Action */}
      {currentAction && (
        <div className="text-xs text-zinc-400 mb-3">
          <span className="text-zinc-500">Action:</span>{' '}
          <span className="text-zinc-300">{currentAction}</span>
        </div>
      )}

      {/* Error Warning */}
      {consecutiveErrors > 0 && (
        <div className="text-xs text-yellow-400 mb-3">
          ⚠️ {consecutiveErrors} consecutive error{consecutiveErrors > 1 ? 's' : ''}
        </div>
      )}

      {/* History Timeline */}
      <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
        {iterations.slice(-5).map((record) => (
          <div key={record.iteration} className="flex items-start gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full mt-1 ${
              record.success ? 'bg-green-400' : 'bg-red-400'
            }`} />
            <div className="flex-1">
              <span className="text-zinc-300">
                Iteration {record.iteration}:
              </span>{' '}
              <span className="text-zinc-500">
                {record.action}
              </span>
              <span className="text-zinc-600 ml-2">
                ({record.durationMs}ms)
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {isRunning && (
          <Button
            variant="outline"
            size="sm"
            onClick={pauseLoop}
          >
            <Pause className="w-3 h-3 mr-1" />
            Pause
          </Button>
        )}
        {isPaused && (
          <Button
            variant="primary"
            size="sm"
            onClick={resumeLoop}
          >
            <Play className="w-3 h-3 mr-1" />
            Resume
          </Button>
        )}
        {(isRunning || isPaused) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={cancelLoop}
          >
            <X className="w-3 h-3 mr-1" />
            Cancel
          </Button>
        )}
        {isFailed && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => retryFromIteration(currentIteration)}
          >
            Retry
          </Button>
        )}
      </div>
    </div>
  )
}
```

### Task List Component

```tsx
// components/loop/TaskList.tsx
import { useLoopStore } from '../../stores/loopStore'
import { CheckCircle2, Circle, Clock } from 'lucide-react'

export function TaskList() {
  const { tasks, currentTask } = useLoopStore()

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-zinc-200 mb-3">
        Tasks ({tasks.filter(t => t.passes).length} / {tasks.length})
      </h3>
      
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {tasks
          .sort((a, b) => a.priority - b.priority)
          .map((task) => (
            <div
              key={task.id}
              className={`flex items-start gap-2 p-2 rounded ${
                currentTask?.id === task.id
                  ? 'bg-zinc-800 border border-zinc-700'
                  : 'hover:bg-zinc-800/50'
              }`}
            >
              {task.passes ? (
                <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />
              ) : currentTask?.id === task.id ? (
                <Clock className="w-4 h-4 text-blue-400 mt-0.5 animate-pulse" />
              ) : (
                <Circle className="w-4 h-4 text-zinc-600 mt-0.5" />
              )}
              
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-zinc-200 truncate">
                  {task.title}
                </div>
                <div className="text-xs text-zinc-500 truncate">
                  {task.description}
                </div>
              </div>
              
              <div className="text-xs text-zinc-600">
                P{task.priority}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
```

---

## Integration with Ralph's File Format

### prd.json Compatibility

Mothership-Ralph reads and writes the same `prd.json` format as Ralph:

```json
{
  "project": "MyApp",
  "branchName": "ralph/task-priority",
  "description": "Task Priority System",
  "userStories": [
    {
      "id": "US-001",
      "title": "Add priority field to database",
      "description": "As a developer, I need to store task priority.",
      "acceptanceCriteria": [
        "Add priority column to tasks table: 'high' | 'medium' | 'low'",
        "Generate and run migration successfully",
        "Typecheck passes"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
```

### File Sync Functions

```typescript
// lib/ralph-sync.ts
import { invoke } from '@tauri-apps/api/core'

export async function loadPrdJson(projectPath: string): Promise<Task[]> {
  const content = await invoke('read_file', {
    path: `${projectPath}/prd.json`
  })
  
  const prd = JSON.parse(content as string)
  
  return prd.userStories.map((story: any) => ({
    id: story.id,
    title: story.title,
    description: story.description,
    acceptanceCriteria: story.acceptanceCriteria || [],
    priority: story.priority,
    passes: story.passes,
    notes: story.notes || '',
  }))
}

export async function syncPrdJson(
  projectPath: string,
  tasks: Task[]
): Promise<void> {
  const prd = {
    project: 'Mothership Project',
    branchName: 'ralph/tasks',
    description: 'Autonomous task execution',
    userStories: tasks.map(task => ({
      id: task.id,
      title: task.title,
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria,
      priority: task.priority,
      passes: task.passes,
      notes: task.notes,
    }))
  }
  
  await invoke('write_file', {
    path: `${projectPath}/prd.json`,
    content: JSON.stringify(prd, null, 2)
  })
}
```

---

## Comparison: Ralph vs Mothership-Ralph

| Aspect | Ralph (Original) | Mothership-Ralph |
|--------|------------------|------------------|
| **Loop Engine** | Bash script | Rust state machine |
| **Context** | Fresh per iteration | Fresh PTY per iteration |
| **Memory** | Files only | Files + SQLite + Zustand |
| **Task Tracking** | prd.json (manual) | prd.json (auto-synced) |
| **Quality Gates** | In prompt | Rust QualityGate component |
| **Completion Detection** | String match | Multi-signal detector |
| **Error Recovery** | Skip iteration | Auto-recovery + retry |
| **UI Progress** | None | Real-time progress panel |
| **Human-in-Loop** | No | Pause for approval |
| **Metrics** | None | SQLite + Zustand metrics |
| **Archiving** | Manual | Auto-archive on branch change |

---

## Implementation Checklist

- [ ] Zustand loop store (see [UNIFIED-STORE.md](./UNIFIED-STORE.md) for canonical definitions)
  - [ ] LoopState interface
  - [ ] Task management actions
  - [ ] Iteration recording
  - [ ] Metrics tracking
  - [ ] Subscriptions for auto-sync

- [ ] Loop Controller (Rust)
  - [ ] State machine implementation
  - [ ] Iterator manager
  - [ ] Quality gate component (see [QUALITY-GATE.md](./QUALITY-GATE.md) for canonical implementation)
  - [ ] Completion detector
  - [ ] Error recovery

- [ ] Terminal Integration
  - [ ] Fresh PTY per iteration
  - [ ] Output monitoring
  - [ ] Completion signal detection
  - [ ] Error pattern detection

- [ ] Memory Layer
  - [ ] prd.json read/write
  - [ ] progress.txt append
  - [ ] AGENTS.md update
  - [ ] SQLite metrics storage

- [ ] UI Components
  - [ ] LoopProgressPanel
  - [ ] TaskList
  - [ ] IterationHistory
  - [ ] MetricsDashboard

- [ ] Tauri Commands
  - [ ] start_loop
  - [ ] pause_loop
  - [ ] resume_loop
  - [ ] cancel_loop
  - [ ] get_loop_state
  - [ ] get_loop_metrics

---

## References

- [Ralph GitHub](https://github.com/snarktank/ralph) — Original implementation
- [Geoffrey Huntley's Ralph article](https://ghuntley.com/ralph/) — Pattern explanation
- [LOOPS.md](./LOOPS.md) — Mothership loop architecture (abstract reference)
- [UNIFIED-STORE.md](./UNIFIED-STORE.md) — Canonical Zustand store definitions
- [QUALITY-GATE.md](./QUALITY-GATE.md) — Canonical quality gate implementation
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Mothership system architecture
- [PHASE-1A-CORE.md](./PHASE-1A-CORE.md) — Terminal multiplexer implementation

---

*Last updated: 2026-06-16*
