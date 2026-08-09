// src-tauri/src/archive/branch_detector.rs
//
// BranchDetector — Git branch change detection for auto-archiving.
// Uses a .last-branch file (inspired by Ralph's .last-branch pattern).

use std::path::{Path, PathBuf};
use tokio::fs;

/// Detects git branch changes by comparing the current branch against
/// a previously recorded branch in `.mothership/.last-branch`.
pub struct BranchDetector {
    last_branch_file: PathBuf,
    pub project_path: PathBuf,
}

impl BranchDetector {
    pub fn new(project_path: &Path) -> Self {
        let last_branch_file = project_path.join(".mothership").join(".last-branch");
        Self {
            last_branch_file,
            project_path: project_path.to_path_buf(),
        }
    }

    /// Get the current git branch.
    pub async fn get_current_branch(&self) -> Result<Option<String>, ArchiveError> {
        let output = tokio::process::Command::new("git")
            .args(["branch", "--show-current"])
            .current_dir(&self.project_path)
            .output()
            .await?;

        if output.status.success() {
            let branch = String::from_utf8_lossy(&output.stdout)
                .trim()
                .to_string();
            if branch.is_empty() {
                return Ok(None);
            }
            Ok(Some(branch))
        } else {
            Ok(None)
        }
    }

    /// Get the last known branch from the tracking file.
    pub async fn get_last_branch(&self) -> Result<Option<String>, ArchiveError> {
        if !self.last_branch_file.exists() {
            return Ok(None);
        }
        let content = fs::read_to_string(&self.last_branch_file).await?;
        let branch = content.trim().to_string();
        if branch.is_empty() {
            return Ok(None);
        }
        Ok(Some(branch))
    }

    /// Update the last known branch.
    pub async fn set_last_branch(&self, branch: &str) -> Result<(), ArchiveError> {
        if let Some(parent) = self.last_branch_file.parent() {
            fs::create_dir_all(parent).await?;
        }
        fs::write(&self.last_branch_file, branch).await?;
        Ok(())
    }

    /// Check if the branch has changed since the last recorded branch.
    pub async fn has_branch_changed(&self) -> Result<BranchChange, ArchiveError> {
        let current = self.get_current_branch().await?;
        let last = self.get_last_branch().await?;

        match (current, last) {
            (Some(curr), Some(last)) if curr != last => {
                Ok(BranchChange::Changed { from: last, to: curr })
            }
            (Some(curr), None) => {
                self.set_last_branch(&curr).await?;
                Ok(BranchChange::Initial { branch: curr })
            }
            (Some(_), Some(_)) => Ok(BranchChange::NoChange),
            (None, _) => Ok(BranchChange::Detached),
        }
    }

    /// Extract a human-readable feature name from a branch name.
    pub fn extract_feature_name(branch: &str) -> String {
        let name = branch
            .trim_start_matches("feature/")
            .trim_start_matches("feat/")
            .trim_start_matches("ralph/")
            .trim_start_matches("bugfix/")
            .trim_start_matches("fix/");

        name.chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
            .collect::<String>()
            .trim_matches('-')
            .to_string()
    }
}

use super::ArchiveError;

/// Result of a branch change check.
#[derive(Debug, Clone)]
pub enum BranchChange {
    NoChange,
    Changed { from: String, to: String },
    Initial { branch: String },
    Detached,
}
