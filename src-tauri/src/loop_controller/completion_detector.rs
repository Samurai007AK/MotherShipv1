// src-tauri/src/loop_controller/completion_detector.rs
//
// Multi-signal completion detection for loop iterations.
// See GLOSSARY.md and LOOPS.md for the design rationale.

use super::{LoopState, Task};

/// Detects whether a loop or iteration is complete using multiple signals.
pub struct CompletionDetector;

impl CompletionDetector {
    pub fn new() -> Self {
        Self
    }

    /// Check if the entire loop is complete (all tasks done).
    pub fn detect(&self, state: &LoopState) -> bool {
        // Signal 1: Explicit completion tag in last iteration output
        if let Some(last) = state.iterations.last() {
            if last.result.contains("<promise>COMPLETE</promise>") {
                return true;
            }
        }

        // Signal 2: All tasks have passes: true
        state.tasks.iter().all(|t| t.passes)
    }

    /// Check if a single iteration's output signals completion for its task.
    pub fn detect_in_output(&self, output: &str, _task: &Task) -> bool {
        // Explicit completion signal
        if output.contains("<promise>COMPLETE</promise>") {
            return true;
        }

        // Common completion indicators
        const SIGNALS: &[&str] = &[
            "Done!",
            "Complete!",
            "All tests pass",
            "Build successful",
            "✓",
            "✅",
        ];

        SIGNALS.iter().any(|s| output.contains(s))
    }
}
