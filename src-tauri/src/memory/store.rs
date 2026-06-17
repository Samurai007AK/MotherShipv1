// src-tauri/src/memory/store.rs
//
// SQLite-backed memory store for Mothership.
// Schema uses FTS5 for full-text search, WAL mode for concurrent reads.

use super::models::*;
use rusqlite::{params, Connection, Result as SqlResult};
use std::path::Path;
use std::sync::Mutex;
use std::io::Write;

/// Thread-safe SQLite memory store.
pub struct MemoryStore {
    conn: Mutex<Connection>,
}

impl MemoryStore {
    /// Open (or create) the SQLite database at the given path.
    pub fn open(db_path: &Path) -> Result<Self, String> {
        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create db directory: {}", e))?;
        }

        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed to open SQLite database: {}", e))?;

        // Enable WAL mode for concurrent reads
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("Failed to set PRAGMA: {}", e))?;

        let store = Self {
            conn: Mutex::new(conn),
        };
        store.initialize_schema()?;
        Ok(store)
    }

    /// Create tables if they don't exist.
    fn initialize_schema(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS memory_entries (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                agent_id TEXT,
                entry_type TEXT NOT NULL DEFAULT 'note',
                tags TEXT NOT NULL DEFAULT '[]',
                summary TEXT,
                files_referenced TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                title TEXT,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                entry_count INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS handoffs (
                id TEXT PRIMARY KEY,
                source_agent_id TEXT NOT NULL,
                target_agent_id TEXT NOT NULL,
                summary TEXT NOT NULL,
                entry_ids TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_entries_agent ON memory_entries(agent_id);
            CREATE INDEX IF NOT EXISTS idx_entries_type ON memory_entries(entry_type);
            CREATE INDEX IF NOT EXISTS idx_entries_created ON memory_entries(created_at);
            CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);
            ",
        )
        .map_err(|e| format!("Failed to initialize schema: {}", e))?;

        // Create FTS5 virtual table for full-text search
        // Using content= option to sync with main table via triggers
        conn.execute_batch(
            "
            CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
                id UNINDEXED,
                content,
                tags,
                summary,
                agent_id UNINDEXED,
                entry_type UNINDEXED
            );

            -- Triggers to keep FTS in sync with memory_entries
            CREATE TRIGGER IF NOT EXISTS memory_entries_ai AFTER INSERT ON memory_entries BEGIN
                INSERT INTO memory_fts(id, content, tags, summary, agent_id, entry_type)
                VALUES (new.id, new.content, new.tags, new.summary, new.agent_id, new.entry_type);
            END;

            CREATE TRIGGER IF NOT EXISTS memory_entries_ad AFTER DELETE ON memory_entries BEGIN
                INSERT INTO memory_fts(memory_fts, id, content, tags, summary, agent_id, entry_type)
                VALUES ('delete', old.id, old.content, old.tags, old.summary, old.agent_id, old.entry_type);
            END;

            CREATE TRIGGER IF NOT EXISTS memory_entries_au AFTER UPDATE ON memory_entries BEGIN
                INSERT INTO memory_fts(memory_fts, id, content, tags, summary, agent_id, entry_type)
                VALUES ('delete', old.id, old.content, old.tags, old.summary, old.agent_id, old.entry_type);
                INSERT INTO memory_fts(id, content, tags, summary, agent_id, entry_type)
                VALUES (new.id, new.content, new.tags, new.summary, new.agent_id, new.entry_type);
            END;
            ",
        )
        .map_err(|e| format!("Failed to initialize FTS5: {}", e))?;

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Memory Entries CRUD
    // -----------------------------------------------------------------------

    /// Save a new memory entry.
    pub fn save_entry(&self, entry: &MemoryEntry) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tags_json =
            serde_json::to_string(&entry.tags).unwrap_or_else(|_| "[]".to_string());
        let files_json =
            serde_json::to_string(&entry.files_referenced).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "INSERT OR REPLACE INTO memory_entries
             (id, content, agent_id, entry_type, tags, summary, files_referenced, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                entry.id,
                entry.content,
                entry.agent_id,
                entry.entry_type.as_str(),
                tags_json,
                entry.summary,
                files_json,
                entry.created_at,
                entry.updated_at,
            ],
        )
        .map_err(|e| format!("Failed to save entry: {}", e))?;
        Ok(())
    }

    /// Delete a memory entry by ID.
    pub fn delete_entry(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM memory_entries WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete entry: {}", e))?;
        Ok(())
    }

    /// Query memory entries with optional filters.
    pub fn query_entries(&self, query: &MemoryQuery) -> Result<Vec<MemoryEntry>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let limit = query.limit.unwrap_or(100) as i64;
        let offset = query.offset.unwrap_or(0) as i64;

        let mut sql = String::from(
            "SELECT id, content, agent_id, entry_type, tags, summary, files_referenced, created_at, updated_at
             FROM memory_entries WHERE 1=1",
        );
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref agent_id) = query.agent_id {
            sql.push_str(&format!(" AND agent_id = ?{}", param_values.len() + 1));
            param_values.push(Box::new(agent_id.clone()));
        }

        if let Some(ref entry_type) = query.entry_type {
            sql.push_str(&format!(" AND entry_type = ?{}", param_values.len() + 1));
            param_values.push(Box::new(entry_type.clone()));
        }

        if let Some(ref search) = query.query {
            sql.push_str(&format!(
                " AND (content LIKE ?{q} OR tags LIKE ?{q})",
                q = param_values.len() + 1
            ));
            param_values.push(Box::new(format!("%{}%", search)));
        }

        sql.push_str(&format!(
            " ORDER BY created_at DESC LIMIT ?{} OFFSET ?{}",
            param_values.len() + 1,
            param_values.len() + 2
        ));
        param_values.push(Box::new(limit));
        param_values.push(Box::new(offset));

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt
            .query_map(params_refs.as_slice(), |row| {
                let tags_str: String = row.get(4)?;
                let files_str: String = row.get(6)?;
                let entry_type_str: String = row.get(3)?;

                Ok(MemoryEntry {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    agent_id: row.get(2)?,
                    entry_type: EntryType::from_str(&entry_type_str),
                    tags: serde_json::from_str(&tags_str).unwrap_or_default(),
                    summary: row.get(5)?,
                    files_referenced: serde_json::from_str(&files_str).unwrap_or_default(),
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            })
            .map_err(|e| format!("Failed to query entries: {}", e))?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(row.map_err(|e| format!("Failed to read row: {}", e))?);
        }
        Ok(entries)
    }

    /// Get all entries (up to limit).
    pub fn list_entries(&self, limit: u32) -> Result<Vec<MemoryEntry>, String> {
        self.query_entries(&MemoryQuery {
            query: None,
            agent_id: None,
            entry_type: None,
            limit: Some(limit),
            offset: None,
        })
    }

    // -----------------------------------------------------------------------
    // Sessions CRUD
    // -----------------------------------------------------------------------

    /// Save a session.
    pub fn save_session(&self, session: &Session) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO sessions (id, agent_id, title, started_at, ended_at, entry_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                session.id,
                session.agent_id,
                session.title,
                session.started_at,
                session.ended_at,
                session.entry_count,
            ],
        )
        .map_err(|e| format!("Failed to save session: {}", e))?;
        Ok(())
    }

    /// List all sessions, newest first.
    pub fn list_sessions(&self, limit: u32) -> Result<Vec<Session>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, agent_id, title, started_at, ended_at, entry_count
                 FROM sessions ORDER BY started_at DESC LIMIT ?1",
            )
            .map_err(|e| format!("Failed to prepare: {}", e))?;

        let rows = stmt
            .query_map(params![limit], |row| {
                Ok(Session {
                    id: row.get(0)?,
                    agent_id: row.get(1)?,
                    title: row.get(2)?,
                    started_at: row.get(3)?,
                    ended_at: row.get(4)?,
                    entry_count: row.get(5)?,
                })
            })
            .map_err(|e| format!("Failed to list sessions: {}", e))?;

        let mut sessions = Vec::new();
        for row in rows {
            sessions.push(row.map_err(|e| format!("Failed to read row: {}", e))?);
        }
        Ok(sessions)
    }

    // -----------------------------------------------------------------------
    // Handoffs
    // -----------------------------------------------------------------------

    /// Save a handoff record.
    pub fn save_handoff(&self, handoff: &HandoffPack) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let entry_ids: Vec<String> = handoff.entries.iter().map(|e| e.id.clone()).collect();
        let entry_ids_json =
            serde_json::to_string(&entry_ids).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "INSERT OR REPLACE INTO handoffs (id, source_agent_id, target_agent_id, summary, entry_ids, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                handoff.id,
                handoff.source_agent_id,
                handoff.target_agent_id,
                handoff.summary,
                entry_ids_json,
                handoff.created_at,
            ],
        )
        .map_err(|e| format!("Failed to save handoff: {}", e))?;
        Ok(())
    }

    /// List handoff history.
    pub fn list_handoffs(&self, limit: u32) -> Result<Vec<HandoffPack>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, source_agent_id, target_agent_id, summary, created_at
                 FROM handoffs ORDER BY created_at DESC LIMIT ?1",
            )
            .map_err(|e| format!("Failed to prepare: {}", e))?;

        let rows = stmt
            .query_map(params![limit], |row| {
                Ok(HandoffPack {
                    id: row.get(0)?,
                    source_agent_id: row.get(1)?,
                    target_agent_id: row.get(2)?,
                    summary: row.get(3)?,
                    entries: Vec::new(), // Loaded separately if needed
                    created_at: row.get(4)?,
                })
            })
            .map_err(|e| format!("Failed to list handoffs: {}", e))?;

        let mut handoffs = Vec::new();
        for row in rows {
            handoffs.push(row.map_err(|e| format!("Failed to read row: {}", e))?);
        }
        Ok(handoffs)
    }

    /// Get entry count.
    pub fn entry_count(&self) -> Result<u32, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let count: u32 = conn
            .query_row("SELECT COUNT(*) FROM memory_entries", [], |row| row.get(0))
            .map_err(|e| format!("Failed to count: {}", e))?;
        Ok(count)
    }

    // -----------------------------------------------------------------------
    // FTS5 Full-Text Search
    // -----------------------------------------------------------------------

    /// Search memory entries using FTS5 full-text search.
    pub fn search_entries(&self, query: &str, limit: u32) -> Result<Vec<SearchResult>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        // Sanitize query for FTS5 — escape special characters
        let sanitized = query
            .replace('"', "")
            .replace("'", "")
            .replace('*', "")
            .replace('(', "")
            .replace(')', "");

        if sanitized.trim().is_empty() {
            return Ok(Vec::new());
        }

        // Use MATCH with rank for relevance sorting
        let sql = "
            SELECT m.id, m.content, m.agent_id, m.entry_type, m.tags, m.summary,
                   m.files_referenced, m.created_at, m.updated_at,
                   rank
            FROM memory_fts f
            JOIN memory_entries m ON m.id = f.id
            WHERE memory_fts MATCH ?1
            ORDER BY rank
            LIMIT ?2
        ";

        let mut stmt = conn
            .prepare(sql)
            .map_err(|e| format!("Failed to prepare search query: {}", e))?;

        let rows = stmt
            .query_map(params![sanitized, limit], |row| {
                let tags_str: String = row.get(4)?;
                let files_str: String = row.get(6)?;
                let entry_type_str: String = row.get(3)?;
                let rank: f64 = row.get(9)?;

                Ok(SearchResult {
                    entry: MemoryEntry {
                        id: row.get(0)?,
                        content: row.get(1)?,
                        agent_id: row.get(2)?,
                        entry_type: EntryType::from_str(&entry_type_str),
                        tags: serde_json::from_str(&tags_str).unwrap_or_default(),
                        summary: row.get(5)?,
                        files_referenced: serde_json::from_str(&files_str).unwrap_or_default(),
                        created_at: row.get(7)?,
                        updated_at: row.get(8)?,
                    },
                    rank,
                    snippet: String::new(),
                })
            })
            .map_err(|e| format!("Failed to execute search: {}", e))?;

        let mut results = Vec::new();
        for row in rows {
            let mut result = row.map_err(|e| format!("Failed to read search result: {}", e))?;
            // Generate snippet from content
            result.snippet = generate_snippet(&result.entry.content, &sanitized, 200);
            results.push(result);
        }
        Ok(results)
    }

    /// Rebuild the FTS index from existing data.
    pub fn rebuild_fts_index(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        // Clear existing FTS data
        conn.execute("DELETE FROM memory_fts", [])
            .map_err(|e| format!("Failed to clear FTS: {}", e))?;

        // Re-index all entries
        conn.execute(
            "INSERT INTO memory_fts(id, content, tags, summary, agent_id, entry_type)
             SELECT id, content, tags, summary, agent_id, entry_type FROM memory_entries",
            [],
        )
        .map_err(|e| format!("Failed to rebuild FTS index: {}", e))?;

        Ok(())
    }
}

// --- Search Result ---

/// A search result with relevance rank and snippet.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SearchResult {
    pub entry: MemoryEntry,
    pub rank: f64,
    pub snippet: String,
}

/// Generate a snippet around the matched query.
fn generate_snippet(content: &str, query: &str, max_len: usize) -> String {
    let lower_content = content.to_lowercase();
    let lower_query = query.to_lowercase();

    if let Some(pos) = lower_content.find(&lower_query) {
        let start = pos.saturating_sub(max_len / 4);
        let end = std::cmp::min(content.len(), pos + query.len() + max_len * 3 / 4);
        let snippet = &content[start..end];

        let prefix = if start > 0 { "..." } else { "" };
        let suffix = if end < content.len() { "..." } else { "" };
        format!("{}{}{}", prefix, snippet, suffix)
    } else {
        // No match found in content, return beginning
        let truncated = if content.len() > max_len {
            format!("{}...", &content[..max_len])
        } else {
            content.to_string()
        };
        truncated
    }
}

// --- Cold Storage ---

/// Archive old sessions to compressed JSON files.
/// Sessions older than `max_age_hours` are archived and removed from SQLite.
pub fn archive_old_sessions(
    &self,
    max_age_hours: u64,
    cold_storage_dir: &Path,
) -> Result<u32, String> {
    let conn = self.conn.lock().map_err(|e| e.to_string())?;

    // Find old sessions
    let cutoff = chrono::Utc::now()
        .checked_sub_signed(chrono::Duration::hours(max_age_hours as i64))
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_default();

    let mut stmt = conn
        .prepare(
            "SELECT id, agent_id, title, started_at, ended_at, entry_count
             FROM sessions WHERE ended_at IS NOT NULL AND ended_at < ?1",
        )
        .map_err(|e| format!("Failed to prepare archive query: {}", e))?;

    let sessions: Vec<Session> = stmt
        .query_map(params![cutoff], |row| {
            Ok(Session {
                id: row.get(0)?,
                agent_id: row.get(1)?,
                title: row.get(2)?,
                started_at: row.get(3)?,
                ended_at: row.get(4)?,
                entry_count: row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to query old sessions: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let mut archived_count = 0;

    for session in &sessions {
        // Gather entries for this session
        let entries: Vec<MemoryEntry> = conn
            .prepare(
                "SELECT id, content, agent_id, entry_type, tags, summary, files_referenced, created_at, updated_at
                 FROM memory_entries WHERE agent_id = ?1 ORDER BY created_at DESC LIMIT 500",
            )
            .map_err(|e| format!("Failed to prepare entry query: {}", e))?
            .query_map(params![session.agent_id], |row| {
                let tags_str: String = row.get(4)?;
                let files_str: String = row.get(6)?;
                let entry_type_str: String = row.get(3)?;
                Ok(MemoryEntry {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    agent_id: row.get(2)?,
                    entry_type: EntryType::from_str(&entry_type_str),
                    tags: serde_json::from_str(&tags_str).unwrap_or_default(),
                    summary: row.get(5)?,
                    files_referenced: serde_json::from_str(&files_str).unwrap_or_default(),
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            })
            .map_err(|e| format!("Failed to query entries: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        // Build archive data
        let archive_data = serde_json::json!({
            "session": session,
            "entries": entries,
            "archived_at": chrono::Utc::now().to_rfc3339(),
        });

        // Ensure cold storage directory exists
        let agent_dir = cold_storage_dir.join(&session.agent_id);
        std::fs::create_dir_all(&agent_dir)
            .map_err(|e| format!("Failed to create cold storage dir: {}", e))?;

        // Write compressed JSON
        let file_path = agent_dir.join(format!("{}.json", session.id));
        let json = serde_json::to_string_pretty(&archive_data)
            .map_err(|e| format!("Failed to serialize archive: {}", e))?;

        // Simple gzip compression
        let mut encoder = flate2::write::GzEncoder::new(
            std::fs::File::create(&file_path).map_err(|e| e.to_string())?,
            flate2::Compression::default(),
        );
        encoder
            .write_all(json.as_bytes())
            .map_err(|e| format!("Failed to write archive: {}", e))?;
        encoder.finish().map_err(|e| format!("Failed to finish compression: {}", e))?;

        // Delete from SQLite
        conn.execute(
            "DELETE FROM memory_entries WHERE agent_id = ?1",
            params![session.agent_id],
        )
        .map_err(|e| format!("Failed to delete archived entries: {}", e))?;

        conn.execute(
            "DELETE FROM sessions WHERE id = ?1",
            params![session.id],
        )
        .map_err(|e| format!("Failed to delete archived session: {}", e))?;

        archived_count += 1;
    }

    Ok(archived_count)
}

/// Prune old snapshots (entries older than max_age_days).
/// Keeps at least min_keep entries per agent.
pub fn prune_old_snapshots(
    &self,
    max_age_days: u64,
    min_keep: u32,
) -> Result<u32, String> {
    let conn = self.conn.lock().map_err(|e| e.to_string())?;

    let cutoff = chrono::Utc::now()
        .checked_sub_signed(chrono::Duration::days(max_age_days as i64))
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_default();

    // Delete old entries, but keep at least min_keep per agent
    let sql = format!(
        "DELETE FROM memory_entries WHERE id IN (
            SELECT id FROM memory_entries
            WHERE created_at < ?1
            AND id NOT IN (
                SELECT id FROM memory_entries
                WHERE agent_id IN (
                    SELECT agent_id FROM memory_entries
                    GROUP BY agent_id
                    HAVING COUNT(*) > {min_keep}
                )
                ORDER BY created_at DESC
                LIMIT {min_keep}
            )
        )"
    );

    let deleted = conn
        .execute(&sql, params![cutoff])
        .map_err(|e| format!("Failed to prune old snapshots: {}", e))?;

    Ok(deleted as u32)
}

/// Get cold storage info (list archived sessions).
pub fn list_archived_sessions(
    &self,
    cold_storage_dir: &Path,
) -> Result<Vec<ArchivedSessionInfo>, String> {
    let mut archives = Vec::new();

    if !cold_storage_dir.exists() {
        return Ok(archives);
    }

    // Scan cold storage directory
    let entries = std::fs::read_dir(cold_storage_dir)
        .map_err(|e| format!("Failed to read cold storage: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.is_dir() {
            let agent_id = path.file_name().unwrap_or_default().to_string_lossy().to_string();

            // Scan agent directory for .json files
            if let Ok(agent_entries) = std::fs::read_dir(&path) {
                for agent_entry in agent_entries.flatten() {
                    let file_path = agent_entry.path();
                    if file_path.extension().map(|e| e == "json").unwrap_or(false) {
                        let filename = file_path.file_stem()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();

                        let size = std::fs::metadata(&file_path)
                            .map(|m| m.len())
                            .unwrap_or(0);

                        archives.push(ArchivedSessionInfo {
                            session_id: filename,
                            agent_id: agent_id.clone(),
                            file_path: file_path.to_string_lossy().to_string(),
                            size_bytes: size,
                        });
                    }
                }
            }
        }
    }

    Ok(archives)
}

/// Restore an archived session from cold storage.
pub fn restore_archived_session(
    &self,
    cold_storage_dir: &Path,
    agent_id: &str,
    session_id: &str,
) -> Result<u32, String> {
    let file_path = cold_storage_dir
        .join(agent_id)
        .join(format!("{}.json", session_id));

    if !file_path.exists() {
        return Err(format!("Archive not found: {}", file_path.display()));
    }

    // Read and decompress
    let file = std::fs::File::open(&file_path).map_err(|e| e.to_string())?;
    let mut decoder = flate2::read::GzDecoder::new(file);
    let mut json = String::new();
    std::io::Read::read_to_string(&mut decoder, &mut json)
        .map_err(|e| format!("Failed to decompress archive: {}", e))?;

    // Parse archive
    let archive: serde_json::Value = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to parse archive: {}", e))?;

    let entries: Vec<MemoryEntry> = serde_json::from_value(
        archive["entries"].clone(),
    )
    .map_err(|e| format!("Failed to parse entries: {}", e))?;

    let conn = self.conn.lock().map_err(|e| e.to_string())?;
    let mut restored_count = 0;

    // Re-insert entries
    for entry in &entries {
        let tags_json = serde_json::to_string(&entry.tags).unwrap_or_else(|_| "[]".to_string());
        let files_json = serde_json::to_string(&entry.files_referenced).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "INSERT OR IGNORE INTO memory_entries
             (id, content, agent_id, entry_type, tags, summary, files_referenced, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                entry.id,
                entry.content,
                entry.agent_id,
                entry.entry_type.as_str(),
                tags_json,
                entry.summary,
                files_json,
                entry.created_at,
                entry.updated_at,
            ],
        )
        .map_err(|e| format!("Failed to restore entry: {}", e))?;

        restored_count += 1;
    }

    // Delete the archive file
    std::fs::remove_file(&file_path).map_err(|e| format!("Failed to delete archive: {}", e))?;

    // Clean up empty agent directory
    let agent_dir = cold_storage_dir.join(agent_id);
    if agent_dir.exists() && std::fs::read_dir(&agent_dir).map(|mut i| i.next().is_none()).unwrap_or(false) {
        std::fs::remove_dir(&agent_dir).ok();
    }

    Ok(restored_count)
}

/// Info about an archived session.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArchivedSessionInfo {
    pub session_id: String,
    pub agent_id: String,
    pub file_path: String,
    pub size_bytes: u64,
}
