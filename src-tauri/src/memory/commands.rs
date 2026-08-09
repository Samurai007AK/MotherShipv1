// src-tauri/src/memory/commands.rs
//
// Tauri IPC commands for memory operations.
// These bridge the frontend memoryStore to the Rust SQLite backend.

use super::models::*;
use super::store::{MemoryStore, SearchResult};
use tauri::State;

/// Save a memory entry (insert or update).
#[tauri::command]
pub async fn save_memory(
    entry: MemoryEntry,
    state: State<'_, MemoryStore>,
) -> Result<(), String> {
    state.save_entry(&entry)
}

/// Delete a memory entry by ID.
#[tauri::command]
pub async fn delete_memory(
    id: String,
    state: State<'_, MemoryStore>,
) -> Result<(), String> {
    state.delete_entry(&id)
}

/// Query memory entries with optional filters.
#[tauri::command]
pub async fn query_memory(
    query: MemoryQuery,
    state: State<'_, MemoryStore>,
) -> Result<Vec<MemoryEntry>, String> {
    state.query_entries(&query)
}

/// List all memory entries (up to limit).
#[tauri::command]
pub async fn list_memory(
    limit: Option<u32>,
    state: State<'_, MemoryStore>,
) -> Result<Vec<MemoryEntry>, String> {
    state.list_entries(limit.unwrap_or(200))
}

/// List all sessions.
#[tauri::command]
pub async fn list_memory_sessions(
    limit: Option<u32>,
    state: State<'_, MemoryStore>,
) -> Result<Vec<Session>, String> {
    state.list_sessions(limit.unwrap_or(50))
}

/// Save a session.
#[tauri::command]
pub async fn save_session(
    session: Session,
    state: State<'_, MemoryStore>,
) -> Result<(), String> {
    state.save_session(&session)
}

/// Save a handoff record.
#[tauri::command]
pub async fn save_handoff(
    handoff: HandoffPack,
    state: State<'_, MemoryStore>,
) -> Result<(), String> {
    // Save each entry in the handoff pack
    for entry in &handoff.entries {
        state.save_entry(entry)?;
    }
    // Save the handoff metadata
    state.save_handoff(&handoff)
}

/// List handoff history.
#[tauri::command]
pub async fn list_handoffs(
    limit: Option<u32>,
    state: State<'_, MemoryStore>,
) -> Result<Vec<HandoffPack>, String> {
    state.list_handoffs(limit.unwrap_or(50))
}

/// Get total entry count.
#[tauri::command]
pub async fn memory_entry_count(
    state: State<'_, MemoryStore>,
) -> Result<u32, String> {
    state.entry_count()
}

/// Search memory entries using FTS5 full-text search.
#[tauri::command]
pub async fn search_memory(
    query: String,
    limit: Option<u32>,
    state: State<'_, MemoryStore>,
) -> Result<Vec<SearchResult>, String> {
    state.search_entries(&query, limit.unwrap_or(20))
}

/// Rebuild the FTS index from existing data.
#[tauri::command]
pub async fn rebuild_fts_index(
    state: State<'_, MemoryStore>,
) -> Result<(), String> {
    state.rebuild_fts_index()
}

/// Archive old sessions to cold storage.
#[tauri::command]
pub async fn archive_old_sessions(
    max_age_hours: u64,
    state: State<'_, MemoryStore>,
) -> Result<u32, String> {
    let cold_dir = get_cold_storage_dir();
    state.archive_old_sessions(max_age_hours, &cold_dir)
}

/// Prune old snapshots from the database.
#[tauri::command]
pub async fn prune_old_snapshots(
    max_age_days: u64,
    min_keep: u32,
    state: State<'_, MemoryStore>,
) -> Result<u32, String> {
    state.prune_old_snapshots(max_age_days, min_keep)
}

/// List archived sessions in cold storage.
#[tauri::command]
pub async fn list_archived_sessions(
    state: State<'_, MemoryStore>,
) -> Result<Vec<super::store::ArchivedSessionInfo>, String> {
    let cold_dir = get_cold_storage_dir();
    state.list_archived_sessions(&cold_dir)
}

/// Restore an archived session from cold storage.
#[tauri::command]
pub async fn restore_archived_session(
    agent_id: String,
    session_id: String,
    state: State<'_, MemoryStore>,
) -> Result<u32, String> {
    let cold_dir = get_cold_storage_dir();
    state.restore_archived_session(&cold_dir, &agent_id, &session_id)
}

/// Get the cold storage directory path.
fn get_cold_storage_dir() -> std::path::PathBuf {
    dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("mothership")
        .join("cold")
}

// -----------------------------------------------------------------------
// Episode Memory Commands (Auto-Captured Tier)
// -----------------------------------------------------------------------

/// Save an episode entry (auto-captured interaction segment).
#[tauri::command]
pub async fn save_episode_memory(
    episode: EpisodeEntry,
    state: State<'_, MemoryStore>,
) -> Result<Vec<ReconsolidationFlag>, String> {
    state.save_episode(&episode)?;
    // Run conflict detection after saving
    state.detect_conflicts(&episode)
}

/// Query episode entries with optional filters.
#[tauri::command]
pub async fn query_episode_memory(
    agent_id: Option<String>,
    trigger: Option<String>,
    source: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
    state: State<'_, MemoryStore>,
) -> Result<Vec<EpisodeEntry>, String> {
    state.query_episodes(
        agent_id.as_deref(),
        trigger.as_deref(),
        source.as_deref(),
        limit.unwrap_or(50),
        offset.unwrap_or(0),
    )
}

/// Delete an episode entry.
#[tauri::command]
pub async fn delete_episode_memory(
    id: String,
    state: State<'_, MemoryStore>,
) -> Result<(), String> {
    state.delete_episode(&id)
}

/// Promote an episode entry to curated note memory.
#[tauri::command]
pub async fn promote_episode_memory(
    episode_id: String,
    state: State<'_, MemoryStore>,
) -> Result<MemoryEntry, String> {
    state.promote_episode(&episode_id)
}

/// Prune expired episode entries.
#[tauri::command]
pub async fn prune_expired_episodes(
    state: State<'_, MemoryStore>,
) -> Result<u32, String> {
    state.prune_expired_episodes()
}

/// Get episode memory summary statistics.
#[tauri::command]
pub async fn get_episode_memory_stats(
    state: State<'_, MemoryStore>,
) -> Result<(u32, u32), String> {
    state.episode_count()
}

// -----------------------------------------------------------------------
// Reconsolidation Commands
// -----------------------------------------------------------------------

/// List reconsolidation flags (potential conflicts).
#[tauri::command]
pub async fn list_reconsolidation_flags(
    status: Option<String>,
    limit: Option<u32>,
    state: State<'_, MemoryStore>,
) -> Result<Vec<ReconsolidationFlag>, String> {
    state.list_reconsolidation_flags(status.as_deref(), limit.unwrap_or(50))
}

/// Resolve a reconsolidation flag.
#[tauri::command]
pub async fn resolve_reconsolidation_flag(
    flag_id: String,
    resolution: String,
    state: State<'_, MemoryStore>,
) -> Result<(), String> {
    state.resolve_flag(&flag_id, &resolution)
}

/// Save a context snapshot from the event-driven capture system.
/// Now saves as an EpisodeEntry (auto-captured tier with TTL) instead of
/// a direct MemoryEntry. Episodes expire after 30 days and can be promoted
/// to note memory if the user wants to keep them.
#[tauri::command]
pub async fn save_context_snapshot(
    snapshot: ContextSnapshotData,
    state: State<'_, MemoryStore>,
) -> Result<Vec<ReconsolidationFlag>, String> {
    let now = chrono::Utc::now();
    let created_at = now.to_rfc3339();
    let expires_at = now
        .checked_add_signed(chrono::Duration::days(30))
        .map(|dt| dt.to_rfc3339());

    // Build content from snapshot
    let mut content_parts = Vec::new();
    content_parts.push(format!("Trigger: {}", snapshot.trigger));

    if let Some(ref branch) = snapshot.branch {
        content_parts.push(format!("Branch: {}", branch));
    }

    if !snapshot.decisions.is_empty() {
        content_parts.push(format!("Decisions: {}", snapshot.decisions.join("; ")));
    }

    if !snapshot.open_files.is_empty() {
        content_parts.push(format!("Files: {}", snapshot.open_files.join(", ")));
    }

    if !snapshot.output_tail.is_empty() {
        // Truncate output tail to keep entry reasonable
        let tail: String = snapshot.output_tail.chars().take(2000).collect();
        content_parts.push(format!("Output:\n{}", tail));
    }

    let content = content_parts.join("\n");

    // Build metadata as JSON blob (use references to avoid moving strings)
    let metadata = serde_json::json!({
        "trigger": &snapshot.trigger,
        "branch": &snapshot.branch,
        "decisions_count": snapshot.decisions.len(),
        "files_count": snapshot.open_files.len(),
        "output_tail_length": snapshot.output_tail.len(),
        "memory_size": snapshot.memory_size,
    });

    let episode = EpisodeEntry {
        id: uuid::Uuid::new_v4().to_string(),
        agent_id: Some(snapshot.agent_id.clone()),
        trigger: snapshot.trigger,
        content,
        summary: None,
        source: "context_capture".to_string(),
        metadata: metadata.to_string(),
        created_at: created_at.clone(),
        expires_at,
        is_promoted: false,
    };

    state.save_episode(&episode)?;
    // Run reconsolidation conflict detection against existing notes
    state.detect_conflicts(&episode)
}

/// Data payload for context snapshot capture.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ContextSnapshotData {
    pub trigger: String,
    pub agent_id: String,
    pub output_tail: String,
    pub branch: Option<String>,
    pub open_files: Vec<String>,
    pub decisions: Vec<String>,
    pub memory_size: usize,
}

/// Compile a context handoff pack for agent-to-agent transfer.
/// Gathers recent entries from the source agent and creates a summary.
#[tauri::command]
pub async fn compile_handoff(
    source_agent_id: String,
    target_agent_id: String,
    entry_count: Option<u32>,
    state: State<'_, MemoryStore>,
) -> Result<HandoffPack, String> {
    // Query recent entries from the source agent
    let entries = state.query_entries(&MemoryQuery {
        query: None,
        agent_id: Some(source_agent_id.clone()),
        entry_type: None,
        limit: Some(entry_count.unwrap_or(20)),
        offset: None,
    })?;

    // Build summary from entries
    let summary_parts: Vec<String> = entries
        .iter()
        .take(5)
        .map(|e| {
            let prefix = match e.entry_type {
                EntryType::Decision => "Decision: ",
                EntryType::Handoff => "Handoff: ",
                EntryType::Summary => "Summary: ",
                _ => "",
            };
            format!(
                "{}{}", prefix,
                if e.content.len() > 120 {
                    format!("{}...", &e.content[..120])
                } else {
                    e.content.clone()
                }
            )
        })
        .collect();

    let summary = if summary_parts.is_empty() {
        format!("No recent context from {}", source_agent_id)
    } else {
        summary_parts.join("\n")
    };

    let handoff = HandoffPack {
        id: uuid::Uuid::new_v4().to_string(),
        source_agent_id,
        target_agent_id,
        entries,
        summary,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    // Persist the handoff
    state.save_handoff(&handoff)?;

    Ok(handoff)
}
