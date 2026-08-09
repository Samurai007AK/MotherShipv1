use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

// ── Agent status derived from terminal output ─────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AgentHeuristicStatus {
    /// Agent is actively working — generating output, running commands
    Working,
    /// Agent is blocked — waiting for input, running long task, or stuck
    Blocked,
    /// Agent has completed a task
    Done,
    /// Agent is idle — no recent output
    Idle,
    /// Agent encountered an error
    Error,
}

impl AgentHeuristicStatus {
    pub fn to_status_string(&self) -> &str {
        match self {
            Self::Working => "running",
            Self::Blocked => "running",   // Still technically running
            Self::Done => "idle",
            Self::Idle => "idle",
            Self::Error => "error",
        }
    }

    pub fn emoji(&self) -> &str {
        match self {
            Self::Working => "🟡",
            Self::Blocked => "🔴",
            Self::Done => "🔵",
            Self::Idle => "🟢",
            Self::Error => "⛔",
        }
    }
}

// ── Status patterns ───────────────────────────────────────────────────

/// Patterns that indicate an agent is currently working
const WORKING_PATTERNS: &[&str] = &[
    "generating",
    "analyzing",
    "processing",
    "thinking",
    "compiling",
    "building",
    "writing",
    "searching",
    "fetching",
    "downloading",
    "installing",
    "running",
    "executing",
    "deploying",
    "testing",
    "checking",
    "linting",
    "formatting",
    "refactoring",
    "optimizing",
    "investigating",
    "researching",
];

/// Patterns that indicate an agent is blocked
const BLOCKED_PATTERNS: &[&str] = &[
    "waiting",
    "pending",
    "blocked",
    "stuck",
    "hang on",
    "please wait",
    "in progress...",
    "[...]",
    "api rate limit",
    "rate limited",
    "timeout",
    "timed out",
    "retrying",
];

/// Patterns that indicate an agent has completed a task
const DONE_PATTERNS: &[&str] = &[
    "done",
    "complete",
    "finished",
    "success",
    "successful",
    "completed",
    "task completed",
    "all done",
    "✅ done",
    "✅ complete",
    "✓ done",
    "✓ complete",
    "[done]",
    "[complete]",
    "summary:",
    "here's what i did",
    "i have completed",
    "finished processing",
];

/// Patterns that indicate an agent error
const ERROR_PATTERNS: &[&str] = &[
    "error:",
    "error!",
    "failed:",
    "failed!",
    "failure:",
    "exception:",
    "unexpected error",
    "internal error",
    "something went wrong",
    "unable to",
    "could not",
    "permission denied",
    "command not found",
    "not found",
    "syntax error",
    "compile error",
    "compilation error",
    "test failed",
    "exit code",
    "non-zero exit",
    "crashed",
    "panic:",
    "aborting",
    "fatal:",
];

// ── Heuristic Engine ──────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct AgentOutputBuffer {
    pub agent_id: String,
    pub recent_lines: Vec<String>,
    pub last_status: AgentHeuristicStatus,
    pub status_confidence: f32,  // 0.0 to 1.0
    pub last_activity: std::time::Instant,
    pub output_count: u64,
}

impl AgentOutputBuffer {
    pub fn new(agent_id: &str) -> Self {
        Self {
            agent_id: agent_id.to_string(),
            recent_lines: Vec::with_capacity(50),
            last_status: AgentHeuristicStatus::Idle,
            status_confidence: 0.5,
            last_activity: std::time::Instant::now(),
            output_count: 0,
        }
    }

    /// Feed a line of terminal output and compute a new status
    pub fn feed_line(&mut self, line: &str) -> AgentHeuristicStatus {
        self.recent_lines.push(line.to_string());
        if self.recent_lines.len() > 50 {
            self.recent_lines.remove(0);
        }
        self.output_count += 1;
        self.last_activity = std::time::Instant::now();

        self.compute_status(line)
    }

    /// Compute the heuristic status from a single line of output
    fn compute_status(&self, line: &str) -> AgentHeuristicStatus {
        let lower = line.to_lowercase();

        // Check error patterns first (highest priority)
        if matches_pattern(&lower, ERROR_PATTERNS) {
            return AgentHeuristicStatus::Error;
        }

        // Check done patterns
        if matches_pattern(&lower, DONE_PATTERNS) {
            return AgentHeuristicStatus::Done;
        }

        // Check blocked patterns
        if matches_pattern(&lower, BLOCKED_PATTERNS) {
            return AgentHeuristicStatus::Blocked;
        }

        // Check working patterns
        if matches_pattern(&lower, WORKING_PATTERNS) && self.output_count > 0 {
            return AgentHeuristicStatus::Working;
        }

        // If we have recent output, assume working
        let idle_threshold = std::time::Duration::from_secs(30);
        if self.last_activity.elapsed() < idle_threshold && self.output_count > 0 {
            return AgentHeuristicStatus::Working;
        }

        AgentHeuristicStatus::Idle
    }

    /// Check if agent has been idle for too long
    pub fn is_stale(&self, timeout_secs: u64) -> bool {
        self.last_activity.elapsed() > std::time::Duration::from_secs(timeout_secs)
    }

    /// Get current status with staleness check
    pub fn get_status(&self, timeout_secs: u64) -> AgentHeuristicStatus {
        if self.is_stale(timeout_secs) {
            AgentHeuristicStatus::Idle
        } else {
            self.last_status.clone()
        }
    }
}

fn matches_pattern(text: &str, patterns: &[&str]) -> bool {
    patterns.iter().any(|p| text.contains(p))
}

// ── Global state ──────────────────────────────────────────────────────

pub struct StatusHeuristicsState {
    buffers: HashMap<String, AgentOutputBuffer>,
}

impl StatusHeuristicsState {
    pub fn new() -> Self {
        Self {
            buffers: HashMap::new(),
        }
    }

    pub fn feed_agent_output(&mut self, agent_id: &str, line: &str) -> AgentHeuristicStatus {
        let buffer = self.buffers.entry(agent_id.to_string())
            .or_insert_with(|| AgentOutputBuffer::new(agent_id));
        let status = buffer.feed_line(line);
        buffer.last_status = status.clone();
        status
    }

    pub fn get_agent_status(&self, agent_id: &str, timeout_secs: u64) -> Option<AgentHeuristicStatus> {
        self.buffers.get(agent_id).map(|b| b.get_status(timeout_secs))
    }

    pub fn get_all_statuses(&self, timeout_secs: u64) -> Vec<(String, AgentHeuristicStatus)> {
        self.buffers.iter()
            .map(|(id, buf)| (id.clone(), buf.get_status(timeout_secs)))
            .collect()
    }
}

// ── Tauri Commands ────────────────────────────────────────────────────

#[tauri::command]
pub fn feed_terminal_status(
    state: tauri::State<'_, Mutex<StatusHeuristicsState>>,
    agent_id: String,
    line: String,
) -> Result<String, String> {
    let mut heuristics = state.lock().map_err(|e| e.to_string())?;
    let status = heuristics.feed_agent_output(&agent_id, &line);
    Ok(serde_json::json!({
        "status": status.to_status_string(),
        "emoji": status.emoji(),
    }).to_string())
}

#[tauri::command]
pub fn get_agent_heuristic_status(
    state: tauri::State<'_, Mutex<StatusHeuristicsState>>,
    agent_id: String,
    timeout_secs: Option<u64>,
) -> Result<Option<String>, String> {
    let heuristics = state.lock().map_err(|e| e.to_string())?;
    let timeout = timeout_secs.unwrap_or(30);
    let status = heuristics.get_agent_status(&agent_id, timeout);
    Ok(status.map(|s| s.to_status_string().to_string()))
}

#[tauri::command]
pub fn get_all_heuristic_statuses(
    state: tauri::State<'_, Mutex<StatusHeuristicsState>>,
    timeout_secs: Option<u64>,
) -> Result<Vec<(String, String)>, String> {
    let heuristics = state.lock().map_err(|e| e.to_string())?;
    let timeout = timeout_secs.unwrap_or(30);
    Ok(heuristics.get_all_statuses(timeout)
        .into_iter()
        .map(|(id, s)| (id, s.to_status_string().to_string()))
        .collect())
}
