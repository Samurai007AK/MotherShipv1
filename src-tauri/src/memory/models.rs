// src-tauri/src/memory/models.rs
//
// Data models for the Mothership memory layer.
// These structs are persisted in SQLite and serialized to/from the frontend.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Note Memory (Curated Tier) — user-created or agent-generated knowledge
// ---------------------------------------------------------------------------

/// A curated memory note — stable, persistent knowledge. This is the
/// existing memory_entries table, now treated as the "note memory" tier.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: String,
    pub content: String,
    pub agent_id: Option<String>,
    pub entry_type: EntryType,
    pub tags: Vec<String>,
    pub summary: Option<String>,
    pub files_referenced: Vec<String>,
    pub created_at: String, // ISO 8601
    pub updated_at: String, // ISO 8601
}

// ---------------------------------------------------------------------------
// Episode Memory (Auto-Captured Tier) — raw interaction segments
// ---------------------------------------------------------------------------

/// An auto-captured episode entry — raw terminal output, tool calls, or
/// agent activity. These are stored in a separate high-volume table with
/// TTL and auto-summarization. Can be promoted to note memory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpisodeEntry {
    pub id: String,
    pub agent_id: Option<String>,
    /// Trigger type (e.g. "terminal_output", "tool_call", "git_activity")
    pub trigger: String,
    /// The raw content (may be truncated)
    pub content: String,
    /// Auto-generated summary after capture (populated asynchronously)
    pub summary: Option<String>,
    /// Source system (e.g. "terminal", "git", "file_edit")
    pub source: String,
    /// Flexible metadata as JSON blob
    pub metadata: String,
    /// When the episode was captured
    pub created_at: String,
    /// When this episode expires (auto-pruned after this date)
    pub expires_at: Option<String>,
    /// Whether this episode was promoted to note memory
    pub is_promoted: bool,
}

/// A reconsolidation flag — indicates a potential conflict between
/// episode memory and note memory that needs user review.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconsolidationFlag {
    pub id: String,
    /// The episode entry that triggered the conflict
    pub episode_id: String,
    /// The note entry that conflicts
    pub note_id: String,
    /// Description of the conflict
    pub description: String,
    /// Confidence level (0.0 - 1.0)
    pub confidence: f64,
    /// Resolution status
    pub status: FlagStatus,
    pub created_at: String,
    pub resolved_at: Option<String>,
}

/// Status of a reconsolidation flag.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FlagStatus {
    Open,
    Resolved,
    Dismissed,
}

/// Type of memory entry.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EntryType {
    Note,
    Prompt,
    Output,
    Summary,
    Handoff,
    Decision,
}

impl FlagStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            FlagStatus::Open => "open",
            FlagStatus::Resolved => "resolved",
            FlagStatus::Dismissed => "dismissed",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "open" => FlagStatus::Open,
            "resolved" => FlagStatus::Resolved,
            "dismissed" => FlagStatus::Dismissed,
            _ => FlagStatus::Open,
        }
    }
}

impl EntryType {
    pub fn as_str(&self) -> &'static str {
        match self {
            EntryType::Note => "note",
            EntryType::Prompt => "prompt",
            EntryType::Output => "output",
            EntryType::Summary => "summary",
            EntryType::Handoff => "handoff",
            EntryType::Decision => "decision",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "note" => EntryType::Note,
            "prompt" => EntryType::Prompt,
            "output" => EntryType::Output,
            "summary" => EntryType::Summary,
            "handoff" => EntryType::Handoff,
            "decision" => EntryType::Decision,
            _ => EntryType::Note,
        }
    }
}

/// A session — represents a work session with an agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub agent_id: String,
    pub title: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub entry_count: u32,
}

/// A project — top-level grouping for sessions and memory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// A context handoff pack — compiled context for agent-to-agent transfer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffPack {
    pub id: String,
    pub source_agent_id: String,
    pub target_agent_id: String,
    pub entries: Vec<MemoryEntry>,
    pub summary: String,
    pub created_at: String,
}

/// Query parameters for searching memory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryQuery {
    pub query: Option<String>,
    pub agent_id: Option<String>,
    pub entry_type: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}
