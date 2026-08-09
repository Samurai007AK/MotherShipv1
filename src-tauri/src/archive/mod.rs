// src-tauri/src/archive/mod.rs
//
// Archive Manager — Automatic session archival on branch change, feature
// completion, and project switches. See AUTO-ARCHIVE.md for the design.

pub mod branch_detector;

use branch_detector::{BranchChange, BranchDetector};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use super::loop_controller::{IterationRecord, Task};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Metadata for an archived session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveManifest {
    pub id: String,
    pub project_id: String,
    pub branch_name: String,
    pub feature_name: String,
    pub created_at: DateTime<Utc>,
    pub archived_at: DateTime<Utc>,
    pub status: ArchiveStatus,
    pub iteration_count: usize,
    pub tasks_completed: usize,
    pub tasks_total: usize,
    pub duration_ms: u64,
    pub files_archived: Vec<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ArchiveStatus {
    InProgress,
    Completed,
    Failed,
    Cancelled,
}

/// An archive entry with path and size info.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveEntry {
    pub id: String,
    pub manifest: ArchiveManifest,
    pub path: PathBuf,
    pub size_kb: u64,
}

/// Diff between an archive and the current session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveDiff {
    pub tasks_added: Vec<Task>,
    pub tasks_removed: Vec<Task>,
    pub tasks_completed: Vec<Task>,
    pub iterations_added: Vec<IterationRecord>,
    pub files_modified: Vec<String>,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum ArchiveError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Git error: {0}")]
    Git(String),

    #[error("Database error: {0}")]
    Database(String),
}

// ---------------------------------------------------------------------------
// ArchiveManager
// ---------------------------------------------------------------------------

pub struct ArchiveManager {
    archive_dir: PathBuf,
    pub branch_detector: BranchDetector,
}

impl ArchiveManager {
    pub fn new(app_dir: &Path, project_path: &Path) -> Self {
        let archive_dir = app_dir.join("archives");
        let branch_detector = BranchDetector::new(project_path);
        Self {
            archive_dir,
            branch_detector,
        }
    }

    /// Check for branch change and archive if needed.
    pub async fn check_and_archive(&self) -> Result<Option<ArchiveEntry>, ArchiveError> {
        let change = self.branch_detector.has_branch_changed().await?;

        match change {
            BranchChange::Changed { from, to } => {
                tracing::info!(from = %from, to = %to, "Branch change detected");
                let entry = self.archive_current_session(&from).await?;
                self.branch_detector.set_last_branch(&to).await?;
                Ok(Some(entry))
            }
            BranchChange::Initial { branch } => {
                tracing::info!(branch = %branch, "Initial branch tracking");
                Ok(None)
            }
            _ => Ok(None),
        }
    }

    /// Archive the current session.
    pub async fn archive_current_session(
        &self,
        branch_name: &str,
    ) -> Result<ArchiveEntry, ArchiveError> {
        let feature_name = BranchDetector::extract_feature_name(branch_name);
        let timestamp = Utc::now().format("%Y-%m-%d_%H%M%S");
        let archive_name = format!("{}-{}", timestamp, feature_name);
        let archive_path = self.archive_dir.join(&archive_name);

        tokio::fs::create_dir_all(&archive_path).await?;

        // Collect session data
        let session_data = self.collect_session_data().await?;

        // Write archive files
        self.write_archive_files(&archive_path, &session_data, branch_name, &feature_name)
            .await?;

        // Create manifest
        let manifest = ArchiveManifest {
            id: uuid::Uuid::new_v4().to_string(),
            project_id: session_data.project_id,
            branch_name: branch_name.to_string(),
            feature_name,
            created_at: session_data.start_time,
            archived_at: Utc::now(),
            status: ArchiveStatus::InProgress,
            iteration_count: session_data.iterations.len(),
            tasks_completed: session_data.tasks.iter().filter(|t| t.passes).count(),
            tasks_total: session_data.tasks.len(),
            duration_ms: session_data.duration_ms,
            files_archived: session_data.files_archived,
            tags: Vec::new(),
        };

        let manifest_id = manifest.id.clone();
        let manifest_json = serde_json::to_string_pretty(&manifest)?;
        tokio::fs::write(archive_path.join("manifest.json"), manifest_json).await?;

        // Update index
        self.update_archive_index(&manifest).await?;

        let size_kb = tokio::fs::metadata(&archive_path)
            .await
            .map(|m| m.len() / 1024)
            .unwrap_or(0);

        Ok(ArchiveEntry {
            id: manifest_id,
            manifest,
            path: archive_path,
            size_kb,
        })
    }

    /// Restore an archived session.
    pub async fn restore_archive(&self, entry: &ArchiveEntry) -> Result<(), ArchiveError> {
        // TODO: Copy prd.json, progress.txt, loop-state.json back to project
        // TODO: Reset current session state
        tracing::info!(archive_id = %entry.id, "Restoring archive");
        Ok(())
    }

    /// Delete an archive.
    pub async fn delete_archive(&self, archive_id: &str) -> Result<(), ArchiveError> {
        // TODO: Find archive by ID, remove directory, update index
        tracing::info!(archive_id, "Deleting archive");
        Ok(())
    }

    /// Get the diff between an archive and the current session.
    pub async fn get_archive_diff(&self, _archive_id: &str) -> Result<ArchiveDiff, ArchiveError> {
        // TODO: Compare archive tasks/iterations with current session
        Ok(ArchiveDiff {
            tasks_added: Vec::new(),
            tasks_removed: Vec::new(),
            tasks_completed: Vec::new(),
            iterations_added: Vec::new(),
            files_modified: Vec::new(),
        })
    }

    // -- Private helpers ---------------------------------------------------

    async fn collect_session_data(&self) -> Result<SessionData, ArchiveError> {
        let project_path = self.branch_detector.project_path.clone();

        // Load prd.json
        let prd_path = project_path.join("prd.json");
        let tasks = if prd_path.exists() {
            let content = tokio::fs::read_to_string(&prd_path).await?;
            let prd: PrdJson = serde_json::from_str(&content)?;
            prd.user_stories
        } else {
            Vec::new()
        };

        // Load progress.txt
        let progress_path = project_path.join("progress.txt");
        let progress_content = if progress_path.exists() {
            tokio::fs::read_to_string(&progress_path).await?
        } else {
            String::new()
        };

        Ok(SessionData {
            project_id: project_path
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_default(),
            tasks,
            progress_content,
            iterations: Vec::new(),
            start_time: Utc::now(),
            duration_ms: 0,
            files_archived: vec![
                "prd.json".into(),
                "progress.txt".into(),
                "loop-state.json".into(),
            ],
        })
    }

    async fn write_archive_files(
        &self,
        archive_path: &Path,
        data: &SessionData,
        branch_name: &str,
        feature_name: &str,
    ) -> Result<(), ArchiveError> {
        let prd = PrdJson {
            project: feature_name.to_string(),
            branch_name: branch_name.to_string(),
            description: format!("Archived feature: {}", feature_name),
            user_stories: data.tasks.clone(),
        };
        let prd_json = serde_json::to_string_pretty(&prd)?;
        tokio::fs::write(archive_path.join("prd.json"), prd_json).await?;

        tokio::fs::write(archive_path.join("progress.txt"), &data.progress_content).await?;

        tokio::fs::create_dir_all(archive_path.join("terminal-snapshots")).await?;

        Ok(())
    }

    async fn update_archive_index(&self, manifest: &ArchiveManifest) -> Result<(), ArchiveError> {
        let index_path = self.archive_dir.join("index.json");

        let mut index: Vec<ArchiveManifest> = if index_path.exists() {
            let content = tokio::fs::read_to_string(&index_path).await?;
            serde_json::from_str(&content)?
        } else {
            Vec::new()
        };

        index.push(manifest.clone());
        index.sort_by(|a, b| b.archived_at.cmp(&a.archived_at));

        let index_json = serde_json::to_string_pretty(&index)?;
        tokio::fs::write(index_path, index_json).await?;

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct SessionData {
    project_id: String,
    tasks: Vec<Task>,
    progress_content: String,
    iterations: Vec<IterationRecord>,
    start_time: DateTime<Utc>,
    duration_ms: u64,
    files_archived: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PrdJson {
    project: String,
    #[serde(rename = "branchName")]
    branch_name: String,
    description: String,
    #[serde(rename = "userStories")]
    user_stories: Vec<Task>,
}
