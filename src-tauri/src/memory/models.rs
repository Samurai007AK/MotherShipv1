// src-tauri/src/memory/models.rs
//
// Data models for the Mothership memory layer.
// These structs are persisted in SQLite and serialized to/from the frontend.

use serde::{Deserialize, Serialize};

/// A memory note — user-created or agent-generated knowledge snippet.
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
