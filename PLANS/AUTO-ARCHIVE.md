# Mothership — Auto-Archive System

**Last Updated:** 2026-06-16
**Status:** Design Draft
**Scope:** Automatic session archival on branch change, feature completion, and project switches
**Based on:** [snarktank/ralph](https://github.com/snarktank/ralph) — Branch-change detection pattern

---

## Overview

Mothership's **Auto-Archive** system automatically saves and archives session history when significant state changes occur — primarily when the user switches git branches, completes a feature, or starts a new project. This prevents data loss, keeps sessions organized, and enables easy recovery of previous work.

Inspired by Ralph's simple but effective `.last-branch` file tracking, Mothership extends this pattern with SQLite persistence, UI integration, and intelligent archiving triggers.

---

## How Ralph Archives (Reference Implementation)

Ralph's archiving is triggered by branch changes detected via a `.last-branch` file:

```bash
# From ralph.sh
if [ -f "$PRD_FILE" ] && [ -f "$LAST_BRANCH_FILE" ]; then
    CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null)
    LAST_BRANCH=$(cat "$LAST_BRANCH_FILE" 2>/dev/null)
    
    if [ "$CURRENT_BRANCH" != "$LAST_BRANCH" ]; then
        # Archive the previous run
        DATE=$(date +%Y-%m-%d)
        FOLDER_NAME=$(echo "$LAST_BRANCH" | sed 's|^ralph/||')
        ARCHIVE_FOLDER="$ARCHIVE_DIR/$DATE-$FOLDER_NAME"
        
        mkdir -p "$ARCHIVE_FOLDER"
        cp "$PRD_FILE" "$ARCHIVE_FOLDER/"
        cp "$PROGRESS_FILE" "$ARCHIVE_FOLDER/"
        
        echo "# Ralph Progress Log" > "$PROGRESS_FILE"
        echo "Started: $(date)" >> "$PROGRESS_FILE"
    fi
fi
```

**Key patterns to adopt:**
1. Track last known branch in a simple file
2. Compare current branch to last branch
3. Archive working files to timestamped directory
4. Reset progress for new feature

---

## Mothership Auto-Archive Architecture

### System Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    AUTO-ARCHIVE SYSTEM                                      │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                  Archive Manager (Rust)                               │ │
│  │                                                                      │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │ │
│  │  │ Branch     │  │ Trigger    │  │ Archive    │  │ Restore      │  │ │
│  │  │ Detector   │  │ Evaluator  │  │ Writer     │  │ Manager      │  │ │
│  │  └────────────┘  └────────────┘  └────────────┘  └──────────────┘  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                              │                                             │
│                              ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                  Archive Storage                                      │ │
│  │                                                                      │ │
│  │  ┌────────────────────────────────────────────────────────────┐     │ │
│  │  │  ~/.mothership/archives/                                   │     │ │
│  │  │  ├── 2026-06-16-feature-login/                             │     │ │
│  │  │  │   ├── prd.json                                          │     │ │
│  │  │  │   ├── progress.txt                                      │     │ │
│  │  │  │   ├── loop-state.json                                   │     │ │
│  │  │  │   ├── terminal-snapshots/                               │     │ │
│  │  │  │   └── manifest.json                                     │     │ │
│  │  │  ├── 2026-06-15-feature-auth/                              │     │ │
│  │  │  │   └── ...                                               │     │ │
│  │  │  └── index.json                                            │     │ │
│  │  └────────────────────────────────────────────────────────────┘     │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                              │                                             │
│                              ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                  Zustand Archive Store                                │ │
│  │                                                                      │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │ │
│  │  │ Archives   │  │ Current    │  │ Diff       │  │ Restore      │  │ │
│  │  │ List       │  │ Session    │  │ Viewer     │  │ Actions      │  │ │
│  │  └────────────┘  └────────────┘  └────────────┘  └──────────────┘  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                              │                                             │
│                              ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                  UI Components                                        │ │
│  │                                                                      │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │ │
│  │  │ Archive    │  │ Session    │  │ Diff       │  │ Restore      │  │ │
│  │  │ Sidebar    │  │ History    │  │ Viewer     │  │ Dialog       │  │ │
│  │  └────────────┘  └────────────┘  └────────────┘  └──────────────┘  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Archive Triggers

### Primary Triggers

| Trigger | Detection | Action |
|---------|-----------|--------|
| **Branch Change** | Git branch differs from last known | Archive current session, start fresh |
| **Feature Complete** | All tasks in prd.json pass | Archive as completed feature |
| **Project Switch** | User switches to different project | Archive current project session |
| **Manual Archive** | User clicks "Archive Session" | Archive on demand |
| **App Shutdown** | App is closing | Archive current state |

### Secondary Triggers

| Trigger | Detection | Action |
|---------|-----------|--------|
| **Idle Timeout** | No activity for 30 minutes | Auto-save snapshot |
| **Memory Threshold** | Loop history exceeds 100 iterations | Archive old iterations |
| **Day Change** | Date changes (midnight) | Archive previous day's work |

---

## Branch Detection System

### Rust Implementation

```rust
// src-tauri/src/archive/branch_detector.rs
use std::path::{Path, PathBuf};
use tokio::fs;

pub struct BranchDetector {
    last_branch_file: PathBuf,
    project_path: PathBuf,
}

impl BranchDetector {
    pub fn new(project_path: &Path) -> Self {
        let last_branch_file = project_path.join(".mothership").join(".last-branch");
        
        Self {
            last_branch_file,
            project_path: project_path.to_path_buf(),
        }
    }

    /// Get the current git branch
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

    /// Get the last known branch from tracking file
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

    /// Update the last known branch
    pub async fn set_last_branch(&self, branch: &str) -> Result<(), ArchiveError> {
        // Ensure directory exists
        if let Some(parent) = self.last_branch_file.parent() {
            fs::create_dir_all(parent).await?;
        }
        
        fs::write(&self.last_branch_file, branch).await?;
        
        Ok(())
    }

    /// Check if branch has changed since last check
    pub async fn has_branch_changed(&self) -> Result<BranchChange, ArchiveError> {
        let current = self.get_current_branch().await?;
        let last = self.get_last_branch().await?;
        
        match (current, last) {
            (Some(curr), Some(last)) => {
                if curr != last {
                    Ok(BranchChange::Changed {
                        from: last,
                        to: curr,
                    })
                } else {
                    Ok(BranchChange::NoChange)
                }
            }
            (Some(curr), None) => {
                // First time tracking this project
                self.set_last_branch(&curr).await?;
                Ok(BranchChange::Initial { branch: curr })
            }
            (None, _) => {
                Ok(BranchChange::Detached)
            }
        }
    }

    /// Extract feature name from branch name
    pub fn extract_feature_name(branch: &str) -> String {
        // Remove common prefixes
        let name = branch
            .trim_start_matches("feature/")
            .trim_start_matches("feat/")
            .trim_start_matches("ralph/")
            .trim_start_matches("bugfix/")
            .trim_start_matches("fix/");
        
        // Replace non-alphanumeric with hyphens
        name.chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
            .collect::<String>()
            .trim_matches('-')
            .to_string()
    }
}

#[derive(Debug, Clone)]
pub enum BranchChange {
    NoChange,
    Changed { from: String, to: String },
    Initial { branch: String },
    Detached,
}
```

---

## Archive Manager

### Core Implementation

```rust
// src-tauri/src/archive/mod.rs
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;

pub struct ArchiveManager {
    archive_dir: PathBuf,
    branch_detector: BranchDetector,
    db: MemoryDb,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveEntry {
    pub id: String,
    pub manifest: ArchiveManifest,
    pub path: PathBuf,
    pub size_kb: u64,
}

impl ArchiveManager {
    pub fn new(app_dir: &Path, project_path: &Path, db: MemoryDb) -> Self {
        let archive_dir = app_dir.join("archives");
        let branch_detector = BranchDetector::new(project_path);
        
        Self {
            archive_dir,
            branch_detector,
            db,
        }
    }

    /// Check for branch change and archive if needed
    pub async fn check_and_archive(&self) -> Result<Option<ArchiveEntry>, ArchiveError> {
        let change = self.branch_detector.has_branch_changed().await?;
        
        match change {
            BranchChange::Changed { from, to } => {
                tracing::info!(
                    from = %from,
                    to = %to,
                    "Branch change detected, archiving current session"
                );
                
                let entry = self.archive_current_session(&from).await?;
                self.branch_detector.set_last_branch(&to).await?;
                
                Ok(Some(entry))
            }
            BranchChange::Initial { branch } => {
                tracing::info!(
                    branch = %branch,
                    "Initial branch tracking started"
                );
                Ok(None)
            }
            _ => Ok(None),
        }
    }

    /// Archive the current session
    pub async fn archive_current_session(&self, branch_name: &str) -> Result<ArchiveEntry, ArchiveError> {
        let feature_name = BranchDetector::extract_feature_name(branch_name);
        let timestamp = Utc::now().format("%Y-%m-%d_%H%M%S");
        let archive_name = format!("{}-{}", timestamp, feature_name);
        let archive_path = self.archive_dir.join(&archive_name);
        
        // Create archive directory
        fs::create_dir_all(&archive_path).await?;
        
        // Collect session data
        let session_data = self.collect_session_data().await?;
        
        // Write archive files
        self.write_archive_files(&archive_path, &session_data, branch_name, &feature_name).await?;
        
        // Create manifest
        let manifest = ArchiveManifest {
            id: Uuid::new_v4().to_string(),
            project_id: session_data.project_id,
            branch_name: branch_name.to_string(),
            feature_name,
            created_at: session_data.start_time,
            archived_at: Utc::now(),
            status: session_data.status,
            iteration_count: session_data.iterations.len(),
            tasks_completed: session_data.tasks.iter().filter(|t| t.passes).count(),
            tasks_total: session_data.tasks.len(),
            duration_ms: session_data.duration_ms,
            files_archived: session_data.files_archived,
            tags: Vec::new(),
        };
        
        // Write manifest
        let manifest_json = serde_json::to_string_pretty(&manifest)?;
        fs::write(archive_path.join("manifest.json"), manifest_json).await?;
        
        // Update index
        self.update_archive_index(&manifest).await?;
        
        // Clear current session (reset progress.txt, etc.)
        self.clear_current_session().await?;
        
        let size_kb = fs::metadata(&archive_path)
            .await
            .map(|m| m.len() / 1024)
            .unwrap_or(0);
        
        Ok(ArchiveEntry {
            id: manifest.id,
            manifest,
            path: archive_path,
            size_kb,
        })
    }

    /// Collect current session data
    async fn collect_session_data(&self) -> Result<SessionData, ArchiveError> {
        let project_path = self.branch_detector.project_path.clone();
        
        // Load prd.json
        let prd_path = project_path.join("prd.json");
        let tasks = if prd_path.exists() {
            let content = fs::read_to_string(&prd_path).await?;
            let prd: PrdJson = serde_json::from_str(&content)?;
            prd.user_stories
        } else {
            Vec::new()
        };
        
        // Load progress.txt
        let progress_path = project_path.join("progress.txt");
        let progress_content = if progress_path.exists() {
            fs::read_to_string(&progress_path).await?
        } else {
            String::new()
        };
        
        // Load loop state from SQLite
        let loop_state = self.db.get_current_loop_state().unwrap_or_default();
        
        // Get git commit history
        let git_log = self.get_git_log().await.unwrap_or_default();
        
        Ok(SessionData {
            project_id: project_path.file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_default(),
            tasks,
            progress_content,
            loop_state,
            iterations: loop_state.iterations,
            start_time: loop_state.start_time.unwrap_or_else(Utc::now),
            duration_ms: loop_state.duration_ms,
            status: ArchiveStatus::InProgress,
            files_archived: vec![
                "prd.json".to_string(),
                "progress.txt".to_string(),
                "loop-state.json".to_string(),
            ],
            git_log,
        })
    }

    /// Write archive files
    async fn write_archive_files(
        &self,
        archive_path: &Path,
        data: &SessionData,
        branch_name: &str,
        feature_name: &str,
    ) -> Result<(), ArchiveError> {
        // Write prd.json
        let prd = PrdJson {
            project: feature_name.to_string(),
            branch_name: branch_name.to_string(),
            description: format!("Archived feature: {}", feature_name),
            user_stories: data.tasks.clone(),
        };
        let prd_json = serde_json::to_string_pretty(&prd)?;
        fs::write(archive_path.join("prd.json"), prd_json).await?;
        
        // Write progress.txt
        fs::write(archive_path.join("progress.txt"), &data.progress_content).await?;
        
        // Write loop state
        let loop_json = serde_json::to_string_pretty(&data.loop_state)?;
        fs::write(archive_path.join("loop-state.json"), loop_json).await?;
        
        // Write git log
        fs::write(archive_path.join("git-log.txt"), &data.git_log).await?;
        
        // Create terminal-snapshots directory
        fs::create_dir_all(archive_path.join("terminal-snapshots")).await?;
        
        // Save terminal scrollback if available
        if let Some(scrollback) = self.get_terminal_scrollback().await {
            fs::write(
                archive_path.join("terminal-snapshots").join("scrollback.txt"),
                scrollback,
            ).await?;
        }
        
        Ok(())
    }

    /// Clear current session files
    async fn clear_current_session(&self) -> Result<(), ArchiveError> {
        let project_path = &self.branch_detector.project_path;
        
        // Reset progress.txt
        let progress_header = format!(
            "# Ralph Progress Log\nStarted: {}\n---\n",
            Utc::now().format("%Y-%m-%d %H:%M")
        );
        fs::write(project_path.join("progress.txt"), progress_header).await?;
        
        // Reset prd.json passes to false (for new feature)
        let prd_path = project_path.join("prd.json");
        if prd_path.exists() {
            let content = fs::read_to_string(&prd_path).await?;
            let mut prd: PrdJson = serde_json::from_str(&content)?;
            
            for story in &mut prd.user_stories {
                story.passes = false;
            }
            
            let updated = serde_json::to_string_pretty(&prd)?;
            fs::write(prd_path, updated).await?;
        }
        
        Ok(())
    }

    /// Get git log for the current branch
    async fn get_git_log(&self) -> Result<String, ArchiveError> {
        let output = tokio::process::Command::new("git")
            .args(["log", "--oneline", "-20"])
            .current_dir(&self.branch_detector.project_path)
            .output()
            .await?;
        
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Ok(String::new())
        }
    }

    /// Get terminal scrollback
    async fn get_terminal_scrollback(&self) -> Option<String> {
        // This would integrate with the terminal manager
        // to capture current scrollback buffer
        None
    }

    /// Update archive index
    async fn update_archive_index(&self, manifest: &ArchiveManifest) -> Result<(), ArchiveError> {
        let index_path = self.archive_dir.join("index.json");
        
        let mut index: Vec<ArchiveManifest> = if index_path.exists() {
            let content = fs::read_to_string(&index_path).await?;
            serde_json::from_str(&content)?
        } else {
            Vec::new()
        };
        
        index.push(manifest.clone());
        
        // Sort by archived date (newest first)
        index.sort_by(|a, b| b.archived_at.cmp(&a.archived_at));
        
        let index_json = serde_json::to_string_pretty(&index)?;
        fs::write(index_path, index_json).await?;
        
        Ok(())
    }
}

#[derive(Debug, Clone)]
struct SessionData {
    project_id: String,
    tasks: Vec<Task>,
    progress_content: String,
    loop_state: LoopState,
    iterations: Vec<IterationRecord>,
    start_time: DateTime<Utc>,
    duration_ms: u64,
    status: ArchiveStatus,
    files_archived: Vec<String>,
    git_log: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PrdJson {
    project: String,
    branch_name: String,
    description: String,
    user_stories: Vec<Task>,
}

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
```

---

## Archive Storage Structure

### Directory Layout

```
~/.mothership/archives/
├── index.json                              ← Master index of all archives
├── 2026-06-16_143022-feature-login/        ← Archived session
│   ├── manifest.json                       ← Archive metadata
│   ├── prd.json                            ← Task list at archive time
│   ├── progress.txt                        ← Learnings log
│   ├── loop-state.json                     ← Loop controller state
│   ├── git-log.txt                         ← Git history snapshot
│   └── terminal-snapshots/                 ← Terminal output captures
│       ├── scrollback.txt                  ← Full terminal scrollback
│       └── screenshots/                    ← UI screenshots (if any)
│           └── iteration-5.png
├── 2026-06-15_093015-feature-auth/         ← Another archived session
│   └── ...
└── 2026-06-14_180045-bugfix-api-error/     ← Bug fix session
    └── ...
```

### index.json Schema

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "project_id": "my-app",
    "branch_name": "feature/login",
    "feature_name": "login",
    "created_at": "2026-06-16T10:30:00Z",
    "archived_at": "2026-06-16T14:30:22Z",
    "status": "Completed",
    "iteration_count": 8,
    "tasks_completed": 4,
    "tasks_total": 4,
    "duration_ms": 14400000,
    "files_archived": ["prd.json", "progress.txt", "loop-state.json"],
    "tags": ["feature", "auth"]
  }
]
```

### manifest.json Schema

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "project_id": "my-app",
  "branch_name": "feature/login",
  "feature_name": "login",
  "created_at": "2026-06-16T10:30:00Z",
  "archived_at": "2026-06-16T14:30:22Z",
  "status": "Completed",
  "iteration_count": 8,
  "tasks_completed": 4,
  "tasks_total": 4,
  "duration_ms": 14400000,
  "files_archived": [
    "prd.json",
    "progress.txt",
    "loop-state.json"
  ],
  "tags": ["feature", "auth"],
  "summary": "Implemented login functionality with OAuth support"
}
```

---

## Zustand Archive Store

> **Canonical store definitions:** See [`UNIFIED-STORE.md`](./UNIFIED-STORE.md) for the complete, authoritative `useArchiveStore` implementation with cross-store coordination via `useCoordinatorStore`.
>
> **Key stores defined in UNIFIED-STORE.md:**
> - `useArchiveStore` — Session archival, branch detection, restoration, and archive diff viewing
> - `useCoordinatorStore` — Cross-store coordination (auto-archive on branch change, loop completion)
>
> The Rust `BranchDetector` and `ArchiveManager` implementations in this document integrate with these stores via Tauri commands.

---

## Tauri Commands

```rust
// src-tauri/src/commands/archive_commands.rs
use tauri::State;

#[tauri::command]
pub async fn check_branch_change(
    state: State<'_, ArchiveManager>,
) -> Result<bool, String> {
    let change = state.branch_detector.has_branch_changed()
        .await
        .map_err(|e| e.to_string())?;
    
    match change {
        BranchChange::Changed { .. } => Ok(true),
        _ => Ok(false),
    }
}

#[tauri::command]
pub async fn archive_current_session(
    state: State<'_, ArchiveManager>,
) -> Result<ArchiveEntry, String> {
    let branch = state.branch_detector.get_current_branch()
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "main".to_string());
    
    state.archive_current_session(&branch)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_archives(
    state: State<'_, ArchiveManager>,
) -> Result<Vec<ArchiveEntry>, String> {
    let index_path = state.archive_dir.join("index.json");
    
    if !index_path.exists() {
        return Ok(Vec::new());
    }
    
    let content = std::fs::read_to_string(&index_path)
        .map_err(|e| e.to_string())?;
    
    let manifests: Vec<ArchiveManifest> = serde_json::from_str(&content)
        .map_err(|e| e.to_string())?;
    
    let entries: Vec<ArchiveEntry> = manifests.into_iter()
        .map(|m| {
            let path = state.archive_dir.join(format!(
                "{}-{}",
                m.archived_at.format("%Y-%m-%d_%H%M%S"),
                m.feature_name
            ));
            
            let size_kb = std::fs::metadata(&path)
                .map(|m| m.len() / 1024)
                .unwrap_or(0);
            
            ArchiveEntry {
                id: m.id,
                manifest: m,
                path,
                size_kb,
            }
        })
        .collect();
    
    Ok(entries)
}

#[tauri::command]
pub async fn restore_archive(
    archive_id: String,
    state: State<'_, ArchiveManager>,
) -> Result<(), String> {
    let entry = state.find_archive(&archive_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Archive not found")?;
    
    state.restore_archive(&entry)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_archive(
    archive_id: String,
    state: State<'_, ArchiveManager>,
) -> Result<(), String> {
    state.delete_archive(&archive_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_archive_diff(
    archive_id: String,
    state: State<'_, ArchiveManager>,
) -> Result<ArchiveDiff, String> {
    state.get_archive_diff(&archive_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_archive_content(
    archive_id: String,
    file_name: String,
    state: State<'_, ArchiveManager>,
) -> Result<String, String> {
    state.get_archive_file_content(&archive_id, &file_name)
        .await
        .map_err(|e| e.to_string())
}
```

---

## UI Components

### Archive Sidebar

```tsx
// components/archive/ArchiveSidebar.tsx
import { useArchiveStore } from '../../stores/archiveStore'
import { Archive, RotateCcw, Trash2, ChevronRight } from 'lucide-react'
import { Button } from '../ui/button'
import { useEffect } from 'react'

export function ArchiveSidebar() {
  const {
    archives,
    selectedArchiveId,
    isLoading,
    loadArchives,
    selectArchive,
    archiveSession,
    restoreArchive,
    deleteArchive,
  } = useArchiveStore()

  useEffect(() => {
    loadArchives()
  }, [])

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Archive className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-200">
            Archives ({archives.length})
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={archiveSession}
          disabled={isLoading}
        >
          Archive Now
        </Button>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {archives.map((archive) => (
          <div
            key={archive.id}
            className={`p-2 rounded cursor-pointer transition-colors ${
              selectedArchiveId === archive.id
                ? 'bg-zinc-800 border border-zinc-700'
                : 'hover:bg-zinc-800/50'
            }`}
            onClick={() => selectArchive(archive.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-zinc-200 truncate">
                  {archive.featureName}
                </div>
                <div className="text-xs text-zinc-500 truncate">
                  {archive.branchName}
                </div>
              </div>
              <ChevronRight className="w-3 h-3 text-zinc-600" />
            </div>

            <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
              <span>{archive.tasksCompleted}/{archive.tasksTotal} tasks</span>
              <span>•</span>
              <span>{archive.iterationCount} iterations</span>
            </div>

            <div className="flex items-center gap-1 mt-1">
              <span className={`px-1.5 py-0.5 rounded text-xs ${
                archive.status === 'Completed'
                  ? 'bg-green-900/50 text-green-400'
                  : archive.status === 'Failed'
                  ? 'bg-red-900/50 text-red-400'
                  : 'bg-zinc-800 text-zinc-400'
              }`}>
                {archive.status}
              </span>
              <span className="text-xs text-zinc-600">
                {new Date(archive.archivedAt).toLocaleDateString()}
              </span>
            </div>

            {selectedArchiveId === archive.id && (
              <div className="flex gap-1 mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    restoreArchive(archive.id)
                  }}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Restore
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteArchive(archive.id)
                  }}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Delete
                </Button>
              </div>
            )}
          </div>
        ))}

        {archives.length === 0 && (
          <div className="text-xs text-zinc-500 text-center py-4">
            No archives yet. Sessions are archived automatically when branches change.
          </div>
        )}
      </div>
    </div>
  )
}
```

### Archive Diff Viewer

```tsx
// components/archive/ArchiveDiffViewer.tsx
import { useArchiveStore } from '../../stores/archiveStore'
import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Plus, Minus, FileCode } from 'lucide-react'

interface ArchiveDiff {
  tasksAdded: Task[]
  tasksRemoved: Task[]
  tasksCompleted: Task[]
  iterationsAdded: IterationRecord[]
  filesModified: string[]
}

export function ArchiveDiffViewer({ archiveId }: { archiveId: string }) {
  const { getArchiveDiff } = useArchiveStore()
  const [diff, setDiff] = useState<ArchiveDiff | null>(null)

  useEffect(() => {
    getArchiveDiff(archiveId).then(setDiff)
  }, [archiveId])

  if (!diff) {
    return <div className="text-xs text-zinc-500">Loading diff...</div>
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-zinc-200 mb-3">
        Archive Changes
      </h3>

      {/* Tasks Completed */}
      {diff.tasksCompleted.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-zinc-500 mb-1">Tasks Completed</div>
          <div className="space-y-1">
            {diff.tasksCompleted.map((task) => (
              <div key={task.id} className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="w-3 h-3 text-green-400" />
                <span className="text-zinc-300">{task.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tasks Added */}
      {diff.tasksAdded.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-zinc-500 mb-1">Tasks Added</div>
          <div className="space-y-1">
            {diff.tasksAdded.map((task) => (
              <div key={task.id} className="flex items-center gap-2 text-xs">
                <Plus className="w-3 h-3 text-blue-400" />
                <span className="text-zinc-300">{task.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tasks Removed */}
      {diff.tasksRemoved.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-zinc-500 mb-1">Tasks Removed</div>
          <div className="space-y-1">
            {diff.tasksRemoved.map((task) => (
              <div key={task.id} className="flex items-center gap-2 text-xs">
                <Minus className="w-3 h-3 text-red-400" />
                <span className="text-zinc-400 line-through">{task.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Files Modified */}
      {diff.filesModified.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-zinc-500 mb-1">Files Modified</div>
          <div className="space-y-1">
            {diff.filesModified.map((file) => (
              <div key={file} className="flex items-center gap-2 text-xs">
                <FileCode className="w-3 h-3 text-zinc-400" />
                <span className="text-zinc-300 font-mono">{file}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Iterations Summary */}
      <div className="text-xs text-zinc-500">
        {diff.iterationsAdded.length} iterations in this archive
      </div>
    </div>
  )
}
```

### Archive Restore Dialog

```tsx
// components/archive/RestoreDialog.tsx
import { useArchiveStore } from '../../stores/archiveStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { AlertTriangle } from 'lucide-react'

interface RestoreDialogProps {
  archiveId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RestoreDialog({ archiveId, open, onOpenChange }: RestoreDialogProps) {
  const { archives, restoreArchive, isLoading } = useArchiveStore()
  
  const archive = archives.find(a => a.id === archiveId)

  const handleRestore = async () => {
    if (!archiveId) return
    
    await restoreArchive(archiveId)
    onOpenChange(false)
  }

  if (!archive) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore Archive</DialogTitle>
          <DialogDescription>
            This will restore the archived session and replace your current work.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-yellow-900/20 border border-yellow-800 rounded p-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5" />
          <div className="text-sm text-yellow-200">
            <p className="font-medium">Warning</p>
            <p className="mt-1">
              Your current session will be archived before restoring.
              This action can be undone by restoring the new archive.
            </p>
          </div>
        </div>

        <div className="bg-zinc-800 rounded p-3">
          <div className="text-xs text-zinc-500 mb-1">Restoring:</div>
          <div className="text-sm text-zinc-200 font-medium">{archive.featureName}</div>
          <div className="text-xs text-zinc-400 mt-1">
            {archive.branchName} • {archive.tasksCompleted}/{archive.tasksTotal} tasks • {archive.iterationCount} iterations
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleRestore} disabled={isLoading}>
            {isLoading ? 'Restoring...' : 'Restore'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

---

## Auto-Archive Integration with Loop Controller

### Hook into Loop Events

```rust
// In LoopController::run()
impl LoopController {
    pub async fn run(&mut self) -> Result<LoopResult, LoopError> {
        // ... existing loop code ...
        
        // After each iteration, check for branch change
        if self.iteration % 5 == 0 { // Check every 5 iterations
            if let Some(entry) = self.archive_manager.check_and_archive().await? {
                tracing::info!(
                    archive_id = %entry.id,
                    "Session archived due to branch change"
                );
                
                // Notify frontend
                self.event_sender.send(LoopEvent::SessionArchived {
                    archive_id: entry.id,
                }).ok();
            }
        }
        
        // ... rest of loop ...
    }
}
```

### Auto-Archive on App Shutdown

```rust
// src-tauri/src/main.rs
impl App {
    fn on_close_requested(&self) {
        // Archive current session before closing
        let archive_manager = self.archive_manager.clone();
        
        tokio::spawn(async move {
            if let Err(e) = archive_manager.archive_current_session("app-shutdown").await {
                tracing::error!("Failed to archive on shutdown: {}", e);
            }
        });
    }
}
```

---

## Comparison: Ralph vs Mothership Auto-Archive

| Aspect | Ralph | Mothership |
|--------|-------|------------|
| **Trigger** | Branch change only | Branch change + feature complete + idle + shutdown |
| **Storage** | File copy to archive/ | Structured archive with manifest |
| **Metadata** | None | Full manifest with metrics |
| **UI** | None | Archive sidebar + diff viewer |
| **Restore** | Manual file copy | One-click restore |
| **Search** | None | Filter by branch, status, date |
| **Cleanup** | Manual | Auto-cleanup with retention policy |
| **Diff Viewing** | None | Full diff of tasks and iterations |

---

## Implementation Checklist

> **Store definitions:** See [UNIFIED-STORE.md](./UNIFIED-STORE.md) for canonical `useArchiveStore` and `useCoordinatorStore` implementations.

- [ ] BranchDetector (Rust)
  - [ ] Get current git branch
  - [ ] Track last branch in .last-branch file
  - [ ] Detect branch changes
  - [ ] Extract feature names from branches

- [ ] ArchiveManager (Rust)
  - [ ] Archive current session
  - [ ] Collect session data (prd.json, progress.txt, loop state)
  - [ ] Write archive files
  - [ ] Create manifest
  - [ ] Update archive index
  - [ ] Clear current session

- [ ] RestoreManager (Rust)
  - [ ] Find archive by ID
  - [ ] Restore archive files
  - [ ] Update current session

- [ ] Zustand Archive Store (see [UNIFIED-STORE.md](./UNIFIED-STORE.md))
  - [ ] Load archives list
  - [ ] Archive session action
  - [ ] Restore archive action
  - [ ] Delete archive action
  - [ ] Branch change detection

- [ ] Tauri Commands
  - [ ] check_branch_change
  - [ ] archive_current_session
  - [ ] list_archives
  - [ ] restore_archive
  - [ ] delete_archive
  - [ ] get_archive_diff

- [ ] UI Components
  - [ ] ArchiveSidebar
  - [ ] ArchiveDiffViewer
  - [ ] RestoreDialog
  - [ ] ArchiveSearch

- [ ] Integration
  - [ ] Hook into LoopController events
  - [ ] Auto-archive on app shutdown
  - [ ] Auto-archive on branch change
  - [ ] Retention policy (keep last 30 archives)

---

## References

- [Ralph GitHub](https://github.com/snarktank/ralph) — Original archiving implementation
- [Geoffrey Huntley's Ralph article](https://ghuntley.com/ralph/) — Pattern explanation
- [MOTHERSHIP-RALPH.md](./MOTHERSHIP-RALPH.md) — Loop engine design
- [UNIFIED-STORE.md](./UNIFIED-STORE.md) — Canonical Zustand store definitions
- [BACKUP-EXPORT.md](./BACKUP-EXPORT.md) — Related backup system
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture

---

*Last updated: 2026-06-16*
