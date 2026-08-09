// src-tauri/src/loop_controller/effect_log.rs
//
// EffectLog — Ordered, auditable record of every tool call made during
// loop execution. Enables session time-travel: checkpoint, fork, rewind.
//
// Design (inspired by ACRFence, arXiv:2603.20625):
//   - Every tool call (PTY write, quality gate, file op) is recorded with
//     its input hash, output, and success status.
//   - On restore, the EffectLog enforces replay-or-fork semantics: if a
//     replayed call is semantically identical (same tool + same input hash),
//     it replays safely. If it differs, it forks into a new branch.
//   - Checkpoints are saved to disk as JSON files in the project's
//     .mothership/checkpoints/ directory.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use super::{LoopError, LoopState};

// ---------------------------------------------------------------------------
// EffectEntry — A single recorded tool call
// ---------------------------------------------------------------------------

/// A single recorded tool call with input hash for replay comparison.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectEntry {
    /// Unique identifier for this entry
    pub id: String,
    /// Tool that was called (e.g. "terminal_write", "quality_gate", "file_write")
    pub tool: String,
    /// The semntic input/payload sent to the tool
    pub input: String,
    /// The output/result from the tool
    pub output: String,
    /// When the call was made
    pub timestamp: DateTime<Utc>,
    /// Hash of the input for semantic comparison on replay
    pub input_hash: String,
    /// Whether the call succeeded
    pub success: bool,
}

impl EffectEntry {
    pub fn new(tool: &str, input: &str, output: &str, success: bool) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            tool: tool.to_string(),
            input: input.to_string(),
            output: output.to_string(),
            timestamp: Utc::now(),
            input_hash: hash_str(input),
            success,
        }
    }
}

// ---------------------------------------------------------------------------
// EffectLog — Ordered log of tool calls
// ---------------------------------------------------------------------------

/// Ordered log of all tool calls made during loop execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectLog {
    pub entries: Vec<EffectEntry>,
}

impl EffectLog {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
        }
    }

    /// Record a tool call and return the entry.
    pub fn record(&mut self, tool: &str, input: &str, output: &str, success: bool) -> &EffectEntry {
        let entry = EffectEntry::new(tool, input, output, success);
        self.entries.push(entry);
        self.entries.last().unwrap()
    }

    /// Check if a new call is semantically identical to the original at the given index.
    /// Returns None if the index is out of bounds.
    /// Returns Some(true) if the same tool with the same input hash.
    /// Returns Some(false) if different (should fork).
    pub fn is_semantically_identical(&self, index: usize, tool: &str, input: &str) -> Option<bool> {
        self.entries.get(index).map(|original| {
            original.tool == tool && original.input_hash == hash_str(input)
        })
    }

    /// Get the last N entries.
    pub fn last_n(&self, n: usize) -> &[EffectEntry] {
        let len = self.entries.len();
        let start = if len > n { len - n } else { 0 };
        &self.entries[start..]
    }

    /// Get the number of recorded entries.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Check if the log is empty.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

// ---------------------------------------------------------------------------
// LoopCheckpoint — A snapshot of loop state + effect log
// ---------------------------------------------------------------------------

/// A checkpoint that captures the full loop state and effect log at a point in time.
/// Checkpoints are saved to disk and can be used for restore/fork.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopCheckpoint {
    /// Unique identifier
    pub id: String,
    /// The loop session this checkpoint belongs to
    pub loop_id: String,
    /// Human-readable label
    pub label: String,
    /// When the checkpoint was created
    pub timestamp: DateTime<Utc>,
    /// The iteration number at this checkpoint
    pub iteration: usize,
    /// Snapshot of loop state
    pub state: LoopState,
    /// Snapshot of the effect log up to this point
    pub effect_log: EffectLog,
    /// Branch name ("main" or fork branch name)
    pub branch: String,
    /// Optional parent checkpoint ID (if this was forked from another checkpoint)
    pub parent_id: Option<String>,
    /// Optional human-readable note about this checkpoint
    pub note: Option<String>,
}

impl LoopCheckpoint {
    /// Create a new checkpoint from loop state and effect log.
    pub fn new(
        loop_id: &str,
        label: &str,
        iteration: usize,
        state: &LoopState,
        effect_log: &EffectLog,
        branch: &str,
        parent_id: Option<String>,
        note: Option<String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            loop_id: loop_id.to_string(),
            label: label.to_string(),
            timestamp: Utc::now(),
            iteration,
            state: state.clone(),
            effect_log: effect_log.clone(),
            branch: branch.to_string(),
            parent_id,
            note,
        }
    }

    /// Get the directory where checkpoints are stored for a given project.
    pub fn checkpoints_dir(project_path: &str) -> PathBuf {
        Path::new(project_path).join(".mothership").join("checkpoints")
    }

    /// Save this checkpoint to disk.
    pub fn save_to_disk(&self, project_path: &str) -> Result<PathBuf, LoopError> {
        let dir = Self::checkpoints_dir(project_path);
        std::fs::create_dir_all(&dir)?;

        let filename = format!(
            "{}_{}_{}_{}.json",
            self.loop_id,
            self.iteration,
            self.branch.replace(' ', "_"),
            self.id.split('-').next().unwrap_or(&self.id)
        );
        let path = dir.join(&filename);
        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(&path, content)?;
        Ok(path)
    }

    /// Load a checkpoint from a JSON file path.
    pub fn load_from_disk(path: &Path) -> Result<Self, LoopError> {
        let content = std::fs::read_to_string(path)?;
        let checkpoint: Self = serde_json::from_str(&content)?;
        Ok(checkpoint)
    }

    /// List all checkpoints for a given project, sorted by timestamp (newest first).
    pub fn list(project_path: &str) -> Result<Vec<Self>, LoopError> {
        let dir = Self::checkpoints_dir(project_path);
        if !dir.exists() {
            // Try legacy location
            let legacy_dir = Path::new(project_path).join(".mothership");
            if !legacy_dir.exists() {
                return Ok(Vec::new());
            }
            return Ok(Vec::new());
        }

        let mut checkpoints = Vec::new();
        for entry in std::fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "json") {
                if let Ok(cp) = Self::load_from_disk(&path) {
                    checkpoints.push(cp);
                }
            }
        }

        // Sort by timestamp descending (newest first)
        checkpoints.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        Ok(checkpoints)
    }

    /// Load the most recent checkpoint for a given loop session.
    pub fn latest(project_path: &str, loop_id: &str) -> Result<Option<Self>, LoopError> {
        let checkpoints = Self::list(project_path)?;
        Ok(checkpoints
            .into_iter()
            .find(|cp| cp.loop_id == loop_id))
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Hash a string for semantic comparison.
fn hash_str(s: &str) -> String {
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish().to_string()
}

/// Format an effect entry for display in the frontend.
pub fn format_effect_entry(entry: &EffectEntry) -> String {
    let status = if entry.success { "✓" } else { "✗" };
    let input_preview = if entry.input.len() > 80 {
        format!("{}...", &entry.input[..80])
    } else {
        entry.input.clone()
    };
    let output_preview = if entry.output.len() > 200 {
        format!("{}...", &entry.output[..200])
    } else {
        entry.output.clone()
    };

    format!(
        "[{status}] {tool}: {input} → {output}",
        status = status,
        tool = entry.tool,
        input = input_preview,
        output = output_preview,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_record_entry() {
        let mut log = EffectLog::new();
        log.record("terminal_write", "echo hello", "hello\n", true);
        assert_eq!(log.len(), 1);
        assert_eq!(log.entries[0].tool, "terminal_write");
        assert!(log.entries[0].success);
    }

    #[test]
    fn test_semantic_identity() {
        let mut log = EffectLog::new();
        log.record("terminal_write", "echo hello", "hello\n", true);

        // Same input should be identical
        assert_eq!(
            log.is_semantically_identical(0, "terminal_write", "echo hello"),
            Some(true)
        );

        // Different input should not be identical
        assert_eq!(
            log.is_semantically_identical(0, "terminal_write", "echo world"),
            Some(false)
        );

        // Different tool should not be identical
        assert_eq!(
            log.is_semantically_identical(0, "file_write", "echo hello"),
            Some(false)
        );

        // Out of bounds
        assert_eq!(
            log.is_semantically_identical(5, "terminal_write", "echo hello"),
            None
        );
    }

    #[test]
    fn test_last_n() {
        let mut log = EffectLog::new();
        for i in 0..10 {
            log.record("test", &format!("input {}", i), &format!("output {}", i), true);
        }
        assert_eq!(log.last_n(3).len(), 3);
        assert_eq!(log.last_n(3)[0].input, "input 7");
        assert_eq!(log.last_n(20).len(), 10);
    }

    #[test]
    fn test_checkpoint_save_load() {
        use std::io::Write;

        let mut log = EffectLog::new();
        log.record("terminal_write", "echo test", "test\n", true);

        let state = LoopState {
            id: "loop-1".to_string(),
            status: super::super::LoopStatus::Running,
            current_iteration: 1,
            start_time: Utc::now(),
            end_time: None,
            tasks: Vec::new(),
            iterations: Vec::new(),
        };

        let cp = LoopCheckpoint::new(
            "loop-1",
            "After first iteration",
            1,
            &state,
            &log,
            "main",
            None,
            Some("Test checkpoint"),
        );

        // Save to temp dir
        let tmp_dir = std::env::temp_dir().join("mothership_test_checkpoints");
        let _ = std::fs::remove_dir_all(&tmp_dir);
        std::fs::create_dir_all(&tmp_dir).unwrap();

        // Write a .mothership dir marker so list works
        let project_dir = tmp_dir.join("test_project");
        std::fs::create_dir_all(&project_dir).unwrap();

        let saved_path = cp.save_to_disk(project_dir.to_str().unwrap()).unwrap();
        assert!(saved_path.exists(), "Checkpoint file should exist");

        // Load it back
        let loaded = LoopCheckpoint::load_from_disk(&saved_path).unwrap();
        assert_eq!(loaded.loop_id, "loop-1");
        assert_eq!(loaded.label, "After first iteration");
        assert_eq!(loaded.iteration, 1);
        assert_eq!(loaded.branch, "main");
        assert_eq!(loaded.effect_log.len(), 1);

        // Cleanup
        let _ = std::fs::remove_dir_all(&tmp_dir);
    }

    #[test]
    fn test_list_checkpoints_empty() {
        let tmp_dir = std::env::temp_dir().join("mothership_test_empty");
        let _ = std::fs::remove_dir_all(&tmp_dir);
        std::fs::create_dir_all(&tmp_dir).unwrap();

        let checkpoints = LoopCheckpoint::list(tmp_dir.to_str().unwrap()).unwrap();
        assert!(checkpoints.is_empty());
    }

    #[test]
    fn test_format_effect_entry() {
        let entry = EffectEntry::new("terminal_write", "echo hello", "hello\n", true);
        let formatted = format_effect_entry(&entry);
        assert!(formatted.contains("✓"));
        assert!(formatted.contains("terminal_write"));
        assert!(formatted.contains("echo hello"));
    }
}
