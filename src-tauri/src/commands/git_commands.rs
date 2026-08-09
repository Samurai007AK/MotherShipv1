// src-tauri/src/commands/git_commands.rs
//
// Tauri IPC commands for Git worktree-based workspace isolation.
// Each workspace = one git branch with its own worktree directory.
// This enables running multiple agents in parallel without conflicts.
//
// Pattern inspired by Superset and Pane — automated worktree management
// that integrates with Mothership's shared memory layer.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

/// Information about a git worktree workspace.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInfo {
    /// Unique workspace identifier.
    pub id: String,
    /// Name of the git branch for this workspace.
    pub branch_name: String,
    /// Absolute path to the worktree directory.
    pub worktree_path: String,
    /// Project root path (parent repo).
    pub project_root: String,
    /// Current status (creating, active, archived, error).
    pub status: String,
    /// Agent assigned to this workspace (optional).
    pub agent_id: Option<String>,
    /// When the workspace was created.
    pub created_at: String,
    /// Git status summary (ahead/behind counts).
    pub ahead_behind: Option<String>,
    /// Whether the workspace has uncommitted changes.
    pub has_uncommitted: bool,
    /// Number of commits ahead of base branch.
    pub commits_ahead: i32,
    /// Number of commits behind base branch.
    pub commits_behind: i32,
}

/// Git diff output for a workspace.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeDiff {
    /// The branch name.
    pub branch_name: String,
    /// Raw diff output (unified format).
    pub diff_text: String,
    /// Number of files changed.
    pub files_changed: usize,
    /// Number of insertions.
    pub insertions: usize,
    /// Number of deletions.
    pub deletions: usize,
    /// List of changed files with their status.
    pub changed_files: Vec<ChangedFile>,
}

/// A single changed file in a worktree diff.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangedFile {
    /// File path relative to repo root.
    pub path: String,
    /// Status (M = modified, A = added, D = deleted, R = renamed, ?? = untracked).
    pub status: String,
    /// Number of insertions in this file.
    pub insertions: usize,
    /// Number of deletions in this file.
    pub deletions: usize,
}

/// Old and new file content for a single changed file, used by the diff viewer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContentPair {
    /// File path relative to repo root.
    pub path: String,
    /// Status (M = modified, A = added, D = deleted).
    pub status: String,
    /// Original file content from HEAD (empty for new/added files).
    pub old_content: String,
    /// Current file content on disk (empty for deleted files).
    pub new_content: String,
    /// Number of insertions.
    pub insertions: usize,
    /// Number of deletions.
    pub deletions: usize,
    /// Programming language hint derived from file extension.
    pub language: String,
}

/// Result of creating a worktree workspace.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorktreeResult {
    pub success: bool,
    pub workspace: Option<WorktreeInfo>,
    pub error: Option<String>,
}

/// Project information with git status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectGitInfo {
    pub root_path: String,
    pub current_branch: String,
    pub has_remotes: bool,
    pub remote_name: Option<String>,
    pub has_uncommitted: bool,
}

/// A single workspace preset — a named configuration for creating worktrees.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresetDefinition {
    /// Display name for this preset.
    pub name: String,
    /// Description of what this preset does.
    pub description: Option<String>,
    /// Base branch to create the worktree from.
    pub base_branch: Option<String>,
    /// Shell commands to run on workspace creation (setup).
    pub setup: Vec<String>,
    /// Shell commands to run on workspace deletion (teardown).
    pub teardown: Vec<String>,
    /// Shell commands to run the workspace (e.g., dev server).
    pub run: Vec<String>,
    /// Environment variables to set during commands.
    pub env: Option<std::collections::HashMap<String, String>>,
    /// Agent ID to assign by default.
    pub agent_id: Option<String>,
}

/// The full workspace preset configuration, read from .mothership/config.json.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspacePresetConfig {
    /// Commands to run when creating ANY workspace.
    pub setup: Vec<String>,
    /// Commands to run when deleting ANY workspace.
    pub teardown: Vec<String>,
    /// Named preset configurations.
    pub presets: Vec<PresetDefinition>,
}

impl Default for WorkspacePresetConfig {
    fn default() -> Self {
        Self {
            setup: Vec::new(),
            teardown: Vec::new(),
            presets: Vec::new(),
        }
    }
}

/// Result of running a lifecycle command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifecycleResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// A single port allocation for a worktree service.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortAllocation {
    /// The allocated port number.
    pub port: u16,
    /// Name of the service using this port (e.g., "web", "api").
    pub service: String,
    /// Worktree ID that owns this allocation.
    pub worktree_id: String,
    /// ISO timestamp when the port was allocated.
    pub allocated_at: String,
}

// ──────────────────────────────────────────────────────────────────────────
// Port Allocation
// ──────────────────────────────────────────────────────────────────────────

const PORT_RANGE_START: u16 = 40000;
const PORT_RANGE_END: u16 = 50000;

/// Load current port allocations from the project's .mothership/port-allocations.json.
fn load_port_allocations(project_root: &str) -> Vec<PortAllocation> {
    let path = PathBuf::from(project_root)
        .join(".mothership")
        .join("port-allocations.json");

    if !path.exists() {
        return Vec::new();
    }

    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Save port allocations to the project's .mothership/port-allocations.json.
fn save_port_allocations(project_root: &str, allocations: &[PortAllocation]) -> Result<(), String> {
    let mothership_dir = PathBuf::from(project_root).join(".mothership");
    std::fs::create_dir_all(&mothership_dir)
        .map_err(|e| format!("Failed to create .mothership directory: {}", e))?;

    let path = mothership_dir.join("port-allocations.json");
    let content = serde_json::to_string_pretty(allocations)
        .map_err(|e| format!("Failed to serialize port allocations: {}", e))?;

    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write port allocations: {}", e))?;

    Ok(())
}

/// Find the next available port in the range that isn't currently allocated.
fn find_available_port(allocations: &[PortAllocation]) -> u16 {
    let used: std::collections::HashSet<u16> =
        allocations.iter().map(|a| a.port).collect();

    for port in PORT_RANGE_START..=PORT_RANGE_END {
        if !used.contains(&port) {
            return port;
        }
    }

    // If everything is allocated (unlikely with 10,000 ports), return last + 1
    PORT_RANGE_END + 1
}

/// Allocate a unique port for a service in a worktree.
#[tauri::command]
pub async fn allocate_worktree_port(
    project_path: String,
    worktree_id: String,
    service: String,
) -> Result<PortAllocation, String> {
    let root = get_git_root(&project_path)?;
    let mut allocations = load_port_allocations(&root);

    // Check if this worktree already has a port for this service
    if let Some(existing) = allocations.iter().find(|a| a.worktree_id == worktree_id && a.service == service) {
        return Ok(existing.clone());
    }

    let port = find_available_port(&allocations);
    if port > PORT_RANGE_END {
        return Err("No available ports in range 40000-50000".to_string());
    }

    let allocation = PortAllocation {
        port,
        service: service.clone(),
        worktree_id: worktree_id.clone(),
        allocated_at: chrono::Utc::now().to_rfc3339(),
    };

    allocations.push(allocation.clone());
    save_port_allocations(&root, &allocations)?;

    Ok(allocation)
}

/// List all port allocations for a specific worktree.
#[tauri::command]
pub async fn list_worktree_ports(
    project_path: String,
    worktree_id: String,
) -> Result<Vec<PortAllocation>, String> {
    let root = get_git_root(&project_path)?;
    let allocations = load_port_allocations(&root);

    Ok(allocations
        .into_iter()
        .filter(|a| a.worktree_id == worktree_id)
        .collect())
}

/// List all port allocations across all worktrees.
#[tauri::command]
pub async fn list_all_port_allocations(
    project_path: String,
) -> Result<Vec<PortAllocation>, String> {
    let root = get_git_root(&project_path)?;
    Ok(load_port_allocations(&root))
}

/// Release a specific port allocation (e.g., when a worktree is deleted).
#[tauri::command]
pub async fn release_worktree_port(
    project_path: String,
    worktree_id: String,
    service: String,
) -> Result<(), String> {
    let root = get_git_root(&project_path)?;
    let mut allocations = load_port_allocations(&root);

    allocations.retain(|a| !(a.worktree_id == worktree_id && a.service == service));
    save_port_allocations(&root, &allocations)?;

    Ok(())
}

/// Release all ports for a worktree (called when a worktree is deleted).
#[tauri::command]
pub async fn release_all_worktree_ports(
    project_path: String,
    worktree_id: String,
) -> Result<(), String> {
    let root = get_git_root(&project_path)?;
    let mut allocations = load_port_allocations(&root);

    allocations.retain(|a| a.worktree_id != worktree_id);
    save_port_allocations(&root, &allocations)?;

    Ok(())
}

// ──────────────────────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────────────────────

/// Run a git command in a given directory and return stdout as a trimmed string.
fn run_git(dir: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("Git error: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Run a git command that can fail (non-fatal) and return Ok with empty string on failure.
fn try_run_git(dir: &str, args: &[&str]) -> String {
    run_git(dir, args).unwrap_or_default()
}

/// Generate a sanitized branch name from a task name.
fn sanitize_branch_name(name: &str) -> String {
    let sanitized: String = name
        .to_lowercase()
        .chars()
        .map(|c| match c {
            'a'..='z' | '0'..='9' | '-' | '_' => c,
            ' ' => '-',
            '/' | '\\' | '.' => '-',
            _ => '-',
        })
        .collect();

    // Collapse multiple dashes
    let collapsed: String = sanitized
        .chars()
        .fold(String::new(), |mut acc, c| {
            if c == '-' && acc.ends_with('-') {
                // skip duplicate
            } else {
                acc.push(c);
            }
            acc
        });

    // Trim leading/trailing dashes
    let trimmed = collapsed.trim_matches('-').to_string();

    if trimmed.is_empty() {
        "task".to_string()
    } else {
        trimmed
    }
}

/// Get the root directory of a git repository.
fn get_git_root(dir: &str) -> Result<String, String> {
    run_git(dir, &["rev-parse", "--show-toplevel"])
}

/// Check if a directory is inside a git repository.
fn is_git_repo(dir: &str) -> bool {
    run_git(dir, &["rev-parse", "--git-dir"]).is_ok()
}

// ──────────────────────────────────────────────────────────────────────────
// Tauri Commands
// ──────────────────────────────────────────────────────────────────────────

/// Detect if the current directory is a git repo and return project info.
#[tauri::command]
pub async fn detect_git_project(path: Option<String>) -> Result<ProjectGitInfo, String> {
    let dir = path.unwrap_or_else(|| ".".to_string());
    let abs_path = std::fs::canonicalize(&dir)
        .map_err(|e| format!("Invalid path '{}': {}", dir, e))?
        .to_string_lossy()
        .to_string();

    if !is_git_repo(&abs_path) {
        return Err(format!("'{}' is not a git repository", abs_path));
    }

    let current_branch = run_git(&abs_path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "HEAD".to_string());

    // Check for remotes
    let remotes = run_git(&abs_path, &["remote"]).unwrap_or_default();
    let has_remotes = !remotes.is_empty();
    let remote_name = if has_remotes {
        remotes.lines().next().map(|s| s.to_string())
    } else {
        None
    };

    // Check for uncommitted changes
    let status = try_run_git(&abs_path, &["status", "--porcelain"]);
    let has_uncommitted = !status.trim().is_empty();

    Ok(ProjectGitInfo {
        root_path: abs_path,
        current_branch,
        has_remotes,
        remote_name,
        has_uncommitted,
    })
}

/// Create a new worktree workspace with its own branch.
///
/// 1. Creates a new branch from the base branch (default: main)
/// 2. Creates a git worktree in a `.mothership/worktrees/<branch>` directory
/// 3. Returns the workspace info so a PTY session can be spawned in it
#[tauri::command]
pub async fn create_worktree_workspace(
    project_path: String,
    task_name: String,
    base_branch: Option<String>,
    agent_id: Option<String>,
) -> Result<CreateWorktreeResult, String> {
    let root = get_git_root(&project_path)?;
    let base = base_branch.unwrap_or_else(|| "main".to_string());
    let branch_name = sanitize_branch_name(&task_name);
    let id = format!("wt-{}", branch_name);

    // Create the .mothership/worktrees directory if it doesn't exist
    let mothership_dir = PathBuf::from(&root).join(".mothership");
    let worktrees_dir = mothership_dir.join("worktrees");
    std::fs::create_dir_all(&worktrees_dir)
        .map_err(|e| format!("Failed to create worktrees directory: {}", e))?;

    let worktree_path = worktrees_dir.join(&branch_name);

    // Check if branch already exists
    let branch_exists = run_git(&root, &["branch", "--list", &branch_name])
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    if branch_exists {
        // Branch exists — check if it already has a worktree
        let existing = try_run_git(&root, &["worktree", "list", "--porcelain"]);
        if existing.contains(&branch_name) {
            // Worktree already exists — re-use it
            let created_at = chrono::Utc::now().to_rfc3339();
            let ahead_behind = get_ahead_behind(&root, &branch_name, &base);
            let (has_uncommitted, commits_ahead, commits_behind) = parse_ahead_behind(&ahead_behind);

            return Ok(CreateWorktreeResult {
                success: true,
                workspace: Some(WorktreeInfo {
                    id,
                    branch_name: branch_name.clone(),
                    worktree_path: worktree_path.to_string_lossy().to_string(),
                    project_root: root.clone(),
                    status: "active".to_string(),
                    agent_id: agent_id.clone(),
                    created_at: created_at.clone(),
                    ahead_behind: Some(ahead_behind.clone()),
                    has_uncommitted,
                    commits_ahead,
                    commits_behind,
                }),
                error: None,
            });
        }
    } else {
        // Create the new branch from base
        run_git(&root, &["branch", &branch_name, &base])
            .map_err(|e| format!("Failed to create branch '{}': {}", branch_name, e))?;
    }

    // Create the worktree
    let wt_path_str = worktree_path.to_string_lossy().to_string();
    run_git(
        &root,
        &["worktree", "add", &wt_path_str, &branch_name],
    )
    .map_err(|e| format!("Failed to create worktree for '{}': {}", branch_name, e))?;

    let created_at = chrono::Utc::now().to_rfc3339();
    let ahead_behind = get_ahead_behind(&root, &branch_name, &base);
    let (has_uncommitted, commits_ahead, commits_behind) = parse_ahead_behind(&ahead_behind);

    // Add a .mothership-workspace metadata file to the worktree
    let metadata = serde_json::json!({
        "id": id,
        "branch_name": branch_name,
        "agent_id": agent_id,
        "created_at": created_at,
        "task_name": task_name,
        "base_branch": base,
    });

    let metadata_path = worktree_path.join(".mothership-workspace");
    std::fs::write(
        &metadata_path,
        serde_json::to_string_pretty(&metadata).unwrap_or_default(),
    )
    .map_err(|e| format!("Failed to write workspace metadata: {}", e))?;

    Ok(CreateWorktreeResult {
        success: true,
        workspace: Some(WorktreeInfo {
            id,
            branch_name,
            worktree_path: wt_path_str,
            project_root: root,
            status: "active".to_string(),
            agent_id,
            created_at,
            ahead_behind: Some(ahead_behind),
            has_uncommitted,
            commits_ahead,
            commits_behind,
        }),
        error: None,
    })
}

/// List all worktree workspaces managed by Mothership.
#[tauri::command]
pub async fn list_worktree_workspaces(project_path: String) -> Result<Vec<WorktreeInfo>, String> {
    let root = get_git_root(&project_path)?;
    let worktrees_dir = PathBuf::from(&root).join(".mothership").join("worktrees");

    if !worktrees_dir.exists() {
        return Ok(Vec::new());
    }

    let mut workspaces = Vec::new();

    let entries = std::fs::read_dir(&worktrees_dir)
        .map_err(|e| format!("Failed to read worktrees directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if !path.is_dir() {
            continue;
        }

        let branch_name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // Read the metadata file
        let metadata_path = path.join(".mothership-workspace");
        let metadata_str = std::fs::read_to_string(&metadata_path).unwrap_or_default();
        let metadata: serde_json::Value =
            serde_json::from_str(&metadata_str).unwrap_or(serde_json::Value::Null);

        let id = metadata
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or(&format!("wt-{}", branch_name))
            .to_string();
        let agent_id = metadata
            .get("agent_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let created_at = metadata
            .get("created_at")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // Check if worktree still exists in git
        let wt_check = try_run_git(&root, &["worktree", "list", "--porcelain"]);
        let is_active = wt_check.contains(&branch_name);

        let ahead_behind = if is_active {
            get_ahead_behind(&root, &branch_name, "main")
        } else {
            String::new()
        };

        let (has_uncommitted, commits_ahead, commits_behind) = if is_active {
            let wt_path_str = path.to_string_lossy().to_string();
            let status = try_run_git(&wt_path_str, &["status", "--porcelain"]);
            let ab = parse_ahead_behind(&ahead_behind);
            (!status.trim().is_empty(), ab.1, ab.2)
        } else {
            (false, 0, 0)
        };

        workspaces.push(WorktreeInfo {
            id,
            branch_name,
            worktree_path: path.to_string_lossy().to_string(),
            project_root: root.clone(),
            status: if is_active { "active".to_string() } else { "orphaned".to_string() },
            agent_id,
            created_at,
            ahead_behind: if ahead_behind.is_empty() {
                None
            } else {
                Some(ahead_behind)
            },
            has_uncommitted,
            commits_ahead,
            commits_behind,
        });
    }

    // Sort by created_at descending (newest first)
    workspaces.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(workspaces)
}

/// Get git status for a specific worktree workspace.
#[tauri::command]
pub async fn get_worktree_status(worktree_path: String) -> Result<WorktreeInfo, String> {
    let path_str = worktree_path.clone();
    let path = PathBuf::from(&path_str);

    if !path.exists() {
        return Err(format!("Worktree path does not exist: {}", path_str));
    }

    // Get branch name
    let branch_name = run_git(&path_str, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "unknown".to_string());

    // Get the project root
    let root = get_git_root(&path_str).unwrap_or_default();

    // Get ahead/behind
    let ahead_behind = get_ahead_behind(&root, &branch_name, "main");
    let (has_uncommitted, commits_ahead, commits_behind) = {
        let status = try_run_git(&path_str, &["status", "--porcelain"]);
        let ab = parse_ahead_behind(&ahead_behind);
        (!status.trim().is_empty(), ab.1, ab.2)
    };

    // Read metadata
    let metadata_path = path.join(".mothership-workspace");
    let metadata_str = std::fs::read_to_string(&metadata_path).unwrap_or_default();
    let metadata: serde_json::Value =
        serde_json::from_str(&metadata_str).unwrap_or(serde_json::Value::Null);
    let id = metadata
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or(&format!("wt-{}", branch_name))
        .to_string();
    let agent_id = metadata
        .get("agent_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let created_at = metadata
        .get("created_at")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Check if worktree is registered in git
    let wt_check = try_run_git(&root, &["worktree", "list", "--porcelain"]);
    let is_active = wt_check.contains(&branch_name);

    Ok(WorktreeInfo {
        id,
        branch_name,
        worktree_path: path_str,
        project_root: root,
        status: if is_active { "active".to_string() } else { "orphaned".to_string() },
        agent_id,
        created_at,
        ahead_behind: if ahead_behind.is_empty() {
            None
        } else {
            Some(ahead_behind)
        },
        has_uncommitted,
        commits_ahead,
        commits_behind,
    })
}

/// Get the git diff for a worktree workspace (uncommitted changes vs HEAD).
#[tauri::command]
pub async fn get_worktree_diff(worktree_path: String) -> Result<WorktreeDiff, String> {
    let path_str = worktree_path.clone();

    // Get branch name
    let branch_name = run_git(&path_str, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "unknown".to_string());

    // Get the full diff (uncommitted changes)
    let diff_text = try_run_git(&path_str, &["diff", "HEAD"]);
    // Also get staged changes
    let staged_diff = try_run_git(&path_str, &["diff", "--cached"]);
    // Combine both
    let full_diff = if staged_diff.is_empty() {
        diff_text.clone()
    } else if diff_text.is_empty() {
        staged_diff.clone()
    } else {
        format!("{}\n{}", staged_diff, diff_text)
    };

    // Parse diff stats
    let _diff_stat = try_run_git(&path_str, &["diff", "HEAD", "--stat"]);
    let _staged_stat = try_run_git(&path_str, &["diff", "--cached", "--stat"]);

    // Get changed files from git status --porcelain
    let status_output = try_run_git(&path_str, &["status", "--porcelain"]);
    let mut changed_files = Vec::new();
    let mut total_insertions = 0usize;
    let mut total_deletions = 0usize;

    for line in status_output.lines() {
        if line.len() < 3 {
            continue;
        }
        let status = &line[0..2].trim().to_string();
        let path = &line[3..].trim().to_string();

        // Count insertions/deletions from numstat
        let numstat = try_run_git(&path_str, &["diff", "HEAD", "--", path, "--numstat"]);
        let (ins, del) = if numstat.is_empty() {
            (0, 0)
        } else {
            let parts: Vec<&str> = numstat.split_whitespace().collect();
            let ins = parts.first().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
            let del = parts.get(1).and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
            (ins, del)
        };

        total_insertions += ins;
        total_deletions += del;

        changed_files.push(ChangedFile {
            path: path.clone(),
            status: status.clone(),
            insertions: ins,
            deletions: del,
        });
    }

    Ok(WorktreeDiff {
        branch_name,
        diff_text: full_diff,
        files_changed: changed_files.len(),
        insertions: total_insertions,
        deletions: total_deletions,
        changed_files,
    })
}

/// Delete (archive) a worktree workspace and optionally its branch.
#[tauri::command]
pub async fn delete_worktree_workspace(
    worktree_path: String,
    delete_branch: Option<bool>,
) -> Result<(), String> {
    let path_str = worktree_path.clone();

    // Get branch name before removing
    let branch_name = run_git(&path_str, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "unknown".to_string());

    // Get the project root
    let root = get_git_root(&path_str).unwrap_or_default();

    // Remove the worktree
    run_git(&root, &["worktree", "remove", &path_str])
        .or_else(|_| {
            // If regular remove fails, try force
            run_git(&root, &["worktree", "remove", "--force", &path_str])
        })
        .map_err(|e| format!("Failed to remove worktree: {}", e))?;

    // Optionally delete the branch
    if delete_branch.unwrap_or(false) && branch_name != "main" && branch_name != "master" {
        // First switch to main/master if we're on this branch
        let _ = run_git(&root, &["checkout", "main"]);
        let _ = run_git(&root, &["branch", "-D", &branch_name]);
    }

    // Clean up the worktree directory if it still exists
    let wt_path = PathBuf::from(&path_str);
    if wt_path.exists() {
        std::fs::remove_dir_all(&wt_path).ok();
    }

    Ok(())
}

/// Sync (rebase) a worktree workspace against its base branch.
#[tauri::command]
pub async fn sync_worktree_workspace(
    worktree_path: String,
    base_branch: Option<String>,
) -> Result<String, String> {
    let path_str = worktree_path.clone();
    let base = base_branch.unwrap_or_else(|| "main".to_string());

    // Fetch latest from remote if available
    let _ = run_git(&path_str, &["fetch", "origin", &base]);

    // Rebase onto base branch
    run_git(&path_str, &["rebase", &base])
        .map_err(|e| format!("Failed to rebase: {}", e))?;

    Ok(format!("Successfully rebased onto {}", base))
}

/// Commit all uncommitted changes in a worktree workspace.
#[tauri::command]
pub async fn commit_worktree_changes(
    worktree_path: String,
    message: String,
) -> Result<String, String> {
    let path_str = worktree_path.clone();

    // Stage all changes
    run_git(&path_str, &["add", "-A"])
        .map_err(|e| format!("Failed to stage changes: {}", e))?;

    // Check if there's anything to commit
    let status = try_run_git(&path_str, &["status", "--porcelain"]);
    if status.trim().is_empty() {
        return Err("No changes to commit".to_string());
    }

    // Commit
    run_git(&path_str, &["commit", "-m", &message])
        .map_err(|e| format!("Failed to commit: {}", e))?;

    // Get the commit hash
    let hash = try_run_git(&path_str, &["rev-parse", "HEAD"]);

    Ok(format!("Committed as {}", hash.trim()))
}

/// Push a worktree workspace branch to remote.
#[tauri::command]
pub async fn push_worktree_branch(worktree_path: String) -> Result<String, String> {
    let path_str = worktree_path.clone();

    let branch_name = run_git(&path_str, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "unknown".to_string());

    // Get the project root for push from there
    let root = get_git_root(&path_str)?;

    run_git(&root, &["push", "origin", &branch_name])
        .map_err(|e| format!("Failed to push: {}", e))?;

    Ok(format!("Pushed {} to origin", branch_name))
}

/// Get old/new file content pairs for each changed file in a worktree.
/// Used by the diff viewer for syntax-highlighted side-by-side display.
#[tauri::command]
pub async fn get_worktree_file_diffs(worktree_path: String) -> Result<Vec<FileContentPair>, String> {
    let path_str = worktree_path.clone();
    let wt_path = std::path::Path::new(&path_str);

    // Get list of changed files (unstaged + staged)
    let diff_files = try_run_git(&path_str, &["diff", "HEAD", "--name-only"]);
    let staged_files = try_run_git(&path_str, &["diff", "--cached", "--name-only"]);
    let untracked = try_run_git(&path_str, &["ls-files", "--others", "--exclude-standard"]);

    let mut all_files: Vec<String> = Vec::new();
    for line in diff_files.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() && !all_files.contains(&trimmed.to_string()) {
            all_files.push(trimmed.to_string());
        }
    }
    for line in staged_files.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() && !all_files.contains(&trimmed.to_string()) {
            all_files.push(trimmed.to_string());
        }
    }
    // Untracked files are "added" in the diff view
    let mut is_untracked = Vec::new();
    for line in untracked.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            if !all_files.contains(&trimmed.to_string()) {
                all_files.push(trimmed.to_string());
            }
            is_untracked.push(trimmed.to_string());
        }
    }

    let mut pairs = Vec::new();
    for file_path in &all_files {
        // Determine status
        let is_new = is_untracked.contains(file_path);
        let is_deleted = !wt_path.join(file_path).exists();

        let status = if is_new {
            "A"
        } else if is_deleted {
            "D"
        } else {
            "M"
        };

        // Get old content from HEAD (skip for new files)
        let old_content = if !is_new {
            try_run_git(&path_str, &["show", &format!("HEAD:{}", file_path)])
        } else {
            String::new()
        };

        // Get new content from working tree (skip for deleted files)
        let new_content = if !is_deleted {
            std::fs::read_to_string(wt_path.join(file_path)).unwrap_or_default()
        } else {
            String::new()
        };

        // Count changes
        let numstat = try_run_git(&path_str, &["diff", "HEAD", "--", file_path, "--numstat"]);
        let (ins, del) = if numstat.is_empty() {
            if is_new {
                // Count lines in new file
                let line_count = new_content.lines().count();
                (line_count, 0)
            } else {
                (0, 0)
            }
        } else {
            let parts: Vec<&str> = numstat.split_whitespace().collect();
            let ins_val = parts.first().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
            let del_val = parts.get(1).and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
            (ins_val, del_val)
        };

        // Derive language from file extension
        let ext = std::path::Path::new(file_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let language = match ext.as_str() {
            "ts" | "tsx" => "typescript",
            "js" | "jsx" | "mjs" => "javascript",
            "rs" => "rust",
            "py" => "python",
            "go" => "go",
            "java" => "java",
            "rb" => "ruby",
            "php" => "php",
            "c" | "h" => "c",
            "cpp" | "cc" | "cxx" | "hpp" => "cpp",
            "css" | "scss" | "sass" | "less" => "css",
            "html" | "htm" => "html",
            "json" => "json",
            "yaml" | "yml" => "yaml",
            "md" | "mdx" => "markdown",
            "sql" => "sql",
            "sh" | "bash" | "zsh" => "bash",
            "toml" => "toml",
            "xml" | "svg" => "xml",
            "vue" => "vue",
            "svelte" => "svelte",
            "astro" => "astro",
            _ => "text",
        }.to_string();

        pairs.push(FileContentPair {
            path: file_path.clone(),
            status: status.to_string(),
            old_content,
            new_content,
            insertions: ins,
            deletions: del,
            language,
        });
    }

    // Sort: added files first, then modified, then deleted
    pairs.sort_by(|a, b| {
        let order = |s: &str| match s {
            "A" => 0,
            "M" => 1,
            "D" => 2,
            _ => 3,
        };
        order(&a.status).cmp(&order(&b.status))
    });

    Ok(pairs)
}

/// Read the workspace preset configuration from .mothership/config.json.
#[tauri::command]
pub async fn read_preset_config(project_path: String) -> Result<WorkspacePresetConfig, String> {
    let root = get_git_root(&project_path)?;
    let config_path = PathBuf::from(&root).join(".mothership").join("config.json");

    if !config_path.exists() {
        return Ok(WorkspacePresetConfig::default());
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let config: WorkspacePresetConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    Ok(config)
}

/// Save the workspace preset configuration to .mothership/config.json.
#[tauri::command]
pub async fn save_preset_config(
    project_path: String,
    config: WorkspacePresetConfig,
) -> Result<(), String> {
    let root = get_git_root(&project_path)?;
    let mothership_dir = PathBuf::from(&root).join(".mothership");
    std::fs::create_dir_all(&mothership_dir)
        .map_err(|e| format!("Failed to create .mothership directory: {}", e))?;

    let config_path = mothership_dir.join("config.json");
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    std::fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

/// Run a list of shell commands in a given working directory, with optional env vars.
/// Returns the combined output and exit code.
fn run_commands(
    commands: &[String],
    work_dir: &str,
    env: &Option<std::collections::HashMap<String, String>>,
) -> LifecycleResult {
    use std::process::Stdio;

    let mut combined_stdout = String::new();
    let mut combined_stderr = String::new();
    let mut last_exit = 0;

    for cmd_str in commands {
        let shell = if cfg!(windows) { "cmd" } else { "sh" };
        let shell_flag = if cfg!(windows) { "/C" } else { "-c" };

        let mut command = Command::new(shell);
        command.arg(shell_flag).arg(cmd_str).current_dir(work_dir);

        // Set environment variables if provided
        if let Some(vars) = env {
            for (key, value) in vars {
                command.env(key, value);
            }
        }

        // Also set the SUPERSET_WORKSPACE_NAME env var (for compatibility with Superset scripts)
        if let Some(dir_name) = std::path::Path::new(work_dir).file_name() {
            command.env("SUPERSET_WORKSPACE_NAME", dir_name.to_string_lossy().as_ref());
        }

        // Set the workspace root path
        command.env("MOTHERSHIP_ROOT_PATH", work_dir);

        match command.stdout(Stdio::piped()).stderr(Stdio::piped()).output() {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();

                if !stdout.is_empty() {
                    combined_stdout.push_str(&stdout);
                    combined_stdout.push('\n');
                }
                if !stderr.is_empty() {
                    combined_stderr.push_str(&stderr);
                    combined_stderr.push('\n');
                }

                last_exit = output.status.code().unwrap_or(-1);
                if !output.status.success() {
                    break;
                }
            }
            Err(e) => {
                combined_stderr.push_str(&format!("Failed to run command '{}': {}", cmd_str, e));
                last_exit = -1;
                break;
            }
        }
    }

    LifecycleResult {
        success: last_exit == 0,
        stdout: combined_stdout.trim().to_string(),
        stderr: combined_stderr.trim().to_string(),
        exit_code: last_exit,
    }
}

/// Check if an editor command (e.g., code, cursor) is available on the system.
/// On Windows uses `where`, on Unix uses `which`.
#[tauri::command]
pub async fn check_editor_available(editor: String) -> Result<bool, String> {
    let shell = if cfg!(windows) { "cmd" } else { "sh" };
    let flag = if cfg!(windows) { "/C" } else { "-c" };
    let cmd = if cfg!(windows) {
        format!("where {}", editor)
    } else {
        format!("which {}", editor)
    };

    match std::process::Command::new(shell)
        .arg(flag)
        .arg(&cmd)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output()
    {
        Ok(output) => Ok(output.status.success()),
        Err(_) => Ok(false),
    }
}

/// Open a directory in the specified editor (code, cursor, or custom).
#[tauri::command]
pub async fn open_in_editor(path: String, editor: String) -> Result<String, String> {
    // Use the appropriate shell command
    let shell = if cfg!(windows) { "cmd" } else { "sh" };
    let flag = if cfg!(windows) { "/C" } else { "-c" };
    let cmd = format!("{} {}", editor, path);

    let output = std::process::Command::new(shell)
        .arg(flag)
        .arg(&cmd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to launch '{}': {}", editor, e))?;

    if output.status.success() {
        Ok(format!("Opened {} in {}", path, editor))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Some editors (like VS Code) fork and return immediately, but
        // some CLI usage patterns print to stderr even on success.
        // Only treat as error for exit codes other than 0.
        if output.status.code().unwrap_or(-1) != 0 {
            Err(format!("Failed to open in '{}': {} (exit code: {:?})",
                editor, stderr.trim(), output.status.code()))
        } else {
            Ok(format!("Opened {} in {}", path, editor))
        }
    }
}

/// Run the global setup commands from the preset config in a worktree directory.
/// Typically called right after creating a new worktree workspace.
#[tauri::command]
pub async fn run_preset_setup(
    worktree_path: String,
    setup_commands: Vec<String>,
    env: Option<std::collections::HashMap<String, String>>,
) -> Result<LifecycleResult, String> {
    let path = worktree_path.clone();
    if !std::path::Path::new(&path).exists() {
        return Err(format!("Worktree path does not exist: {}", path));
    }

    Ok(run_commands(&setup_commands, &path, &env))
}

/// Run the global teardown commands from the preset config in a worktree directory.
/// Typically called right before deleting a worktree workspace.
#[tauri::command]
pub async fn run_preset_teardown(
    worktree_path: String,
    teardown_commands: Vec<String>,
    env: Option<std::collections::HashMap<String, String>>,
) -> Result<LifecycleResult, String> {
    let path = worktree_path.clone();
    if !std::path::Path::new(&path).exists() {
        return Err(format!("Worktree path does not exist: {}", path));
    }

    Ok(run_commands(&teardown_commands, &path, &env))
}

/// Check if a directory is available for worktree operations.
#[tauri::command]
pub async fn check_git_available(project_path: String) -> Result<ProjectGitInfo, String> {
    detect_git_project(Some(project_path)).await
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/// Get ahead/behind counts between a branch and a base branch.
fn get_ahead_behind(root: &str, branch: &str, base: &str) -> String {
    // Check if base branch exists
    let base_exists = run_git(root, &["rev-parse", "--verify", base])
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    if !base_exists {
        return String::new();
    }

    // Get the merge-base
    let merge_base = try_run_git(root, &["merge-base", branch, base]);
    if merge_base.is_empty() {
        return String::new();
    }

    let ahead = try_run_git(root, &["rev-list", "--count", &format!("{}..{}", merge_base.trim(), branch)])
        .trim()
        .to_string();
    let behind = try_run_git(root, &["rev-list", "--count", &format!("{}..{}", branch, merge_base.trim())])
        .trim()
        .to_string();

    if ahead == "0" && behind == "0" {
        "up to date".to_string()
    } else {
        format!("↑{} ↓{}", ahead, behind)
    }
}

/// Parse ahead/behind string to structured data.
fn parse_ahead_behind(ab: &str) -> (bool, i32, i32) {
    if ab.is_empty() || ab == "up to date" {
        return (false, 0, 0);
    }

    let parts: Vec<&str> = ab.split_whitespace().collect();
    let ahead = parts
        .first()
        .and_then(|s| s.strip_prefix('↑'))
        .and_then(|s| s.parse::<i32>().ok())
        .unwrap_or(0);
    let behind = parts
        .get(1)
        .and_then(|s| s.strip_prefix('↓'))
        .and_then(|s| s.parse::<i32>().ok())
        .unwrap_or(0);

    (ahead > 0 || behind > 0, ahead, behind)
}
