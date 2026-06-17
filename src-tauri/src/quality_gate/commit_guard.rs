// src-tauri/src/quality_gate/commit_guard.rs
//
// CommitGuard — Pre-commit validation that ensures quality gates pass
// before any git commit is made.

use super::{QualityGate, QualityGateError, QualityGateReport};

pub struct CommitGuard {
    quality_gate: QualityGate,
    auto_commit: bool,
}

impl CommitGuard {
    pub fn new(quality_gate: QualityGate, auto_commit: bool) -> Self {
        Self {
            quality_gate,
            auto_commit,
        }
    }

    /// Validate before commit. If gates pass and auto_commit is enabled,
    /// stages and commits the files.
    pub async fn validate_and_commit(
        &self,
        message: &str,
        files: &[String],
    ) -> Result<CommitResult, CommitGuardError> {
        let report = self.quality_gate.run_all().await?;

        if !report.commit_allowed {
            return Ok(CommitResult {
                committed: false,
                report: Some(report),
                error: Some("Quality gates failed".into()),
            });
        }

        if self.auto_commit {
            self.commit_changes(message, files).await?;
            Ok(CommitResult {
                committed: true,
                report: Some(report),
                error: None,
            })
        } else {
            Ok(CommitResult {
                committed: false,
                report: Some(report),
                error: None,
            })
        }
    }

    async fn commit_changes(
        &self,
        message: &str,
        files: &[String],
    ) -> Result<(), CommitGuardError> {
        for file in files {
            let output = tokio::process::Command::new("git")
                .args(["add", file])
                .output()
                .await?;

            if !output.status.success() {
                return Err(CommitGuardError::GitError {
                    command: format!("git add {}", file),
                    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                });
            }
        }

        let output = tokio::process::Command::new("git")
            .args(["commit", "-m", message])
            .output()
            .await?;

        if !output.status.success() {
            return Err(CommitGuardError::GitError {
                command: format!("git commit -m {}", message),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            });
        }

        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct CommitResult {
    pub committed: bool,
    pub report: Option<QualityGateReport>,
    pub error: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum CommitGuardError {
    #[error("Git error on '{command}': {stderr}")]
    GitError { command: String, stderr: String },

    #[error("Quality gate error: {0}")]
    QualityGate(#[from] QualityGateError),
}
