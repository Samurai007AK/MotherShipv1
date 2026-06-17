# Mothership — SQLite Schema Migrations

**Last Updated:** 2026-06-15
**Status:** Final Draft
**Scope:** Database layer (Phase 1b+)

**Related Documents:**
- [`ERROR-HANDLING.md`](./ERROR-HANDLING.md) — SQLite corruption detection and recovery
- [`BACKUP-EXPORT.md`](./BACKUP-EXPORT.md) — Pre-migration backup strategy
- [`SECURITY.md`](./SECURITY.md) — Optional SQLite encryption via SQLCipher
- [`MONITORING.md`](./MONITORING.md) — Migration logging and performance tracking
- [`CONFIGURATION.md`](./CONFIGURATION.md) — Config schema versioning and migration

## Overview

Mothership stores all memory, sessions, and handoffs in SQLite. As the app evolves, the database schema will change. This document defines how schema migrations are handled to ensure:
- **Zero data loss** — Migrations never delete user data
- **Backward compatibility** — Old data works with new schema
- **Rollback safety** — Every migration can be reversed
- **Atomic operations** — Migrations either fully succeed or fully fail

---

## 1. Migration System Architecture

### 1.1 Design

```
mothership.db
├── schema_version    ← Single table tracking current version
├── _migration_log    ← History of applied migrations
├── projects          ← User data tables
├── sessions
├── memory_entries
├── handoffs
└── ...
```

### 1.2 Version Tracking

```sql
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    description TEXT
);

-- Migration log (for debugging)
CREATE TABLE IF NOT EXISTS _migration_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_version INTEGER NOT NULL,
    to_version INTEGER NOT NULL,
    migration_name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    duration_ms INTEGER,
    success INTEGER NOT NULL DEFAULT 1,
    error_message TEXT
);
```

---

## 2. Migration Framework

### 2.1 Rust Migration Runner

```rust
// src-tauri/src/memory/migrations.rs
use rusqlite::{Connection, params};
use std::time::Instant;

pub struct MigrationRunner {
    conn: Connection,
    migrations: Vec<Migration>,
}

struct Migration {
    version: u32,
    name: String,
    up: Box<dyn Fn(&Connection) -> Result<(), MigrationError>>,
    down: Box<dyn Fn(&Connection) -> Result<(), MigrationError>>,
}

impl MigrationRunner {
    pub fn new(conn: Connection) -> Self {
        Self {
            conn,
            migrations: Self::register_migrations(),
        }
    }

    pub fn run_pending(&mut self) -> Result<(), MigrationError> {
        let current_version = self.get_current_version()?;
        let pending: Vec<&Migration> = self.migrations.iter()
            .filter(|m| m.version > current_version)
            .collect();

        if pending.is_empty() {
            tracing::info!("Database schema is up to date (v{})", current_version);
            return Ok(());
        }

        tracing::info!(
            current = current_version,
            pending = pending.len(),
            "Running database migrations"
        );

        // Begin transaction for all migrations
        self.conn.execute_batch("BEGIN TRANSACTION;")?;

        for migration in pending {
            let start = Instant::now();

            match (migration.up)(&self.conn) {
                Ok(()) => {
                    // Record success
                    self.conn.execute(
                        "INSERT INTO schema_version (version, description) VALUES (?1, ?2)",
                        params![migration.version, &migration.name],
                    )?;

                    self.conn.execute(
                        "INSERT INTO _migration_log (from_version, to_version, migration_name, duration_ms, success) \
                         VALUES (?1, ?2, ?3, ?4, 1)",
                        params![
                            current_version,
                            migration.version,
                            &migration.name,
                            start.elapsed().as_millis() as i64,
                        ],
                    )?;

                    tracing::info!(
                        version = migration.version,
                        name = &migration.name,
                        duration_ms = start.elapsed().as_millis(),
                        "Migration applied successfully"
                    );
                }
                Err(e) => {
                    // Record failure
                    self.conn.execute(
                        "INSERT INTO _migration_log (from_version, to_version, migration_name, duration_ms, success, error_message) \
                         VALUES (?1, ?2, ?3, ?4, 0, ?5)",
                        params![
                            current_version,
                            migration.version,
                            &migration.name,
                            start.elapsed().as_millis() as i64,
                            e.to_string(),
                        ],
                    )?;

                    // Rollback
                    self.conn.execute_batch("ROLLBACK;")?;

                    return Err(MigrationError::MigrationFailed {
                        version: migration.version,
                        name: migration.name.clone(),
                        source: e,
                    });
                }
            }
        }

        // Commit all migrations
        self.conn.execute_batch("COMMIT;")?;

        tracing::info!("All migrations completed successfully");
        Ok(())
    }

    pub fn rollback_to(&mut self, target_version: u32) -> Result<(), MigrationError> {
        let current_version = self.get_current_version()?;

        if target_version >= current_version {
            return Err(MigrationError::InvalidRollback {
                current: current_version,
                target: target_version,
            });
        }

        // Get migrations to rollback (in reverse order)
        let to_rollback: Vec<&Migration> = self.migrations.iter()
            .filter(|m| m.version > target_version && m.version <= current_version)
            .rev()
            .collect();

        self.conn.execute_batch("BEGIN TRANSACTION;")?;

        for migration in to_rollback {
            match (migration.down)(&self.conn) {
                Ok(()) => {
                    self.conn.execute(
                        "DELETE FROM schema_version WHERE version = ?1",
                        params![migration.version],
                    )?;

                    tracing::info!(
                        version = migration.version,
                        name = &migration.name,
                        "Migration rolled back"
                    );
                }
                Err(e) => {
                    self.conn.execute_batch("ROLLBACK;")?;
                    return Err(MigrationError::RollbackFailed {
                        version: migration.version,
                        source: e,
                    });
                }
            }
        }

        self.conn.execute_batch("COMMIT;")?;
        Ok(())
    }

    fn get_current_version(&self) -> Result<u32, MigrationError> {
        // Ensure schema_version table exists
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (datetime('now')),
                description TEXT
            );"
        )?;

        let version: Option<u32> = self.conn.query_row(
            "SELECT MAX(version) FROM schema_version",
            [],
            |row| row.get(0),
        ).unwrap_or(None);

        Ok(version.unwrap_or(0))
    }
}
```

### 2.2 Migration Definition Pattern

```rust
fn register_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            name: "initial_schema".into(),
            up: Box::new(|conn| {
                conn.execute_batch(include_str!("migrations/001_initial.sql"))?;
                Ok(())
            }),
            down: Box::new(|conn| {
                conn.execute_batch(include_str!("migrations/001_initial_down.sql"))?;
                Ok(())
            }),
        },
        Migration {
            version: 2,
            name: "add_memory_tags".into(),
            up: Box::new(|conn| {
                conn.execute_batch(include_str!("migrations/002_add_tags.sql"))?;
                Ok(())
            }),
            down: Box::new(|conn| {
                conn.execute_batch(include_str!("migrations/002_add_tags_down.sql"))?;
                Ok(())
            }),
        },
        // ... more migrations
    ]
}
```

---

## 3. Migration SQL Files

### 3.1 Initial Schema (v1)

```sql
-- migrations/001_initial.sql

-- Projects
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    root_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessions
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    context_snapshot TEXT
);

-- Memory entries
CREATE TABLE memory_entries (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    agent_id TEXT,
    session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK(type IN ('note', 'snapshot', 'decision', 'handoff')),
    content TEXT NOT NULL,
    summary TEXT,
    tags TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Handoffs
CREATE TABLE handoffs (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    from_agent_id TEXT NOT NULL,
    to_agent_id TEXT NOT NULL,
    summary TEXT,
    context_before TEXT,
    context_after TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX idx_sessions_project ON sessions(project_id);
CREATE INDEX idx_memory_project ON memory_entries(project_id);
CREATE INDEX idx_memory_agent ON memory_entries(agent_id);
CREATE INDEX idx_memory_type ON memory_entries(type);
CREATE INDEX idx_memory_created ON memory_entries(created_at);
CREATE INDEX idx_handoffs_project ON handoffs(project_id);
```

### 3.2 Rollback (v1)

```sql
-- migrations/001_initial_down.sql
DROP TABLE IF EXISTS handoffs;
DROP TABLE IF EXISTS memory_entries;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS projects;
```

### 3.3 Add Tags (v2)

```sql
-- migrations/002_add_tags.sql

-- Add tags column if it doesn't exist (safe migration)
-- Note: tags was already in initial schema, this is an example of adding a new column

ALTER TABLE memory_entries ADD COLUMN priority INTEGER DEFAULT 0;
ALTER TABLE memory_entries ADD COLUMN metadata TEXT; -- JSON metadata

CREATE INDEX idx_memory_priority ON memory_entries(priority);
```

### 3.4 Add FTS5 (v3)

```sql
-- migrations/003_add_fts5.sql

-- Create FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
    content,
    summary,
    tags,
    content='memory_entries',
    content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory_entries BEGIN
    INSERT INTO memory_fts(rowid, content, summary, tags)
    VALUES (new.rowid, new.content, new.summary, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory_entries BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, content, summary, tags)
    VALUES ('delete', old.rowid, old.content, old.summary, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory_entries BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, content, summary, tags)
    VALUES ('delete', old.rowid, old.content, old.summary, old.tags);
    INSERT INTO memory_fts(rowid, content, summary, tags)
    VALUES (new.rowid, new.content, new.summary, new.tags);
END;

-- Backfill existing data
INSERT INTO memory_fts(rowid, content, summary, tags)
SELECT rowid, content, summary, tags FROM memory_entries;
```

---

## 4. Data Safety During Migrations

### 4.1 Backup Before Migration

```rust
fn migrate_with_backup(conn: &Connection, db_path: &Path) -> Result<(), MigrationError> {
    // 1. Create backup
    let backup_dir = db_path.parent().unwrap().join("backups");
    std::fs::create_dir_all(&backup_dir).ok();

    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    let backup_path = backup_dir.join(format!("pre_migration_{}.db", timestamp));

    conn.backup_to(&backup_path)
        .map_err(|e| MigrationError::BackupFailed(e.to_string()))?;

    tracing::info!(path = %backup_path.display(), "Pre-migration backup created");

    // 2. Run migrations
    let mut runner = MigrationRunner::new(conn);
    runner.run_pending()?;

    // 3. Verify integrity
    let integrity: String = conn.query_row(
        "PRAGMA integrity_check", [], |row| row.get(0)
    ).map_err(|e| MigrationError::IntegrityCheckFailed(e.to_string()))?;

    if integrity != "ok" {
        return Err(MigrationError::PostMigrationCorruption(integrity));
    }

    // 4. Verify all tables exist
    let table_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table'",
        [], |row| row.get(0)
    ).unwrap_or(0);

    if table_count < 6 { // We expect at least 6 tables after migration
        return Err(MigrationError::IncompleteMigration);
    }

    Ok(())
}
```

### 4.2 Safe Column Addition

```sql
-- Safe pattern: ADD COLUMN with DEFAULT (no table rebuild needed)
ALTER TABLE memory_entries ADD COLUMN metadata TEXT DEFAULT NULL;

-- Safe pattern: ADD COLUMN with computed default
ALTER TABLE memory_entries ADD COLUMN search_vector TEXT;

-- Populate in batches (for large tables)
-- Don't do this in the migration SQL — do it in Rust code with batching
```

### 4.3 Safe Index Creation

```sql
-- Create index CONCURRENTLY (doesn't block reads/writes)
-- Note: SQLite doesn't support CONCURRENTLY, but we can create it in a separate step
CREATE INDEX IF NOT EXISTS idx_memory_search ON memory_entries(content);

-- For large tables, create index in background
-- Use a separate migration or post-migration hook
```

---

## 5. Migration Testing

### 5.1 Test Framework

```rust
#[cfg(test)]
mod migration_tests {
    use super::*;
    use rusqlite::Connection;

    fn test_db() -> Connection {
        Connection::open_in_memory().unwrap()
    }

    #[test]
    fn test_migrate_from_empty() {
        let conn = test_db();
        let mut runner = MigrationRunner::new(conn);

        // Should apply all migrations
        runner.run_pending().unwrap();

        // Verify version
        assert_eq!(runner.get_current_version().unwrap(), LATEST_VERSION);
    }

    #[test]
    fn test_migrate_from_v1() {
        let conn = test_db();

        // Set up v1 schema
        conn.execute_batch(include_str!("migrations/001_initial.sql")).unwrap();
        conn.execute(
            "INSERT INTO schema_version (version, description) VALUES (1, 'initial')",
            [],
        ).unwrap();

        let mut runner = MigrationRunner::new(conn);

        // Should apply only v2+ migrations
        runner.run_pending().unwrap();
        assert_eq!(runner.get_current_version().unwrap(), LATEST_VERSION);
    }

    #[test]
    fn test_rollback() {
        let conn = test_db();
        let mut runner = MigrationRunner::new(conn);

        // Apply all migrations
        runner.run_pending().unwrap();
        assert_eq!(runner.get_current_version().unwrap(), LATEST_VERSION);

        // Rollback to v1
        runner.rollback_to(1).unwrap();
        assert_eq!(runner.get_current_version().unwrap(), 1);
    }

    #[test]
    fn test_migration_preserves_data() {
        let conn = test_db();

        // Set up v1 schema with data
        conn.execute_batch(include_str!("migrations/001_initial.sql")).unwrap();
        conn.execute(
            "INSERT INTO schema_version (version) VALUES (1)", [],
        ).unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, root_path) VALUES ('p1', 'Test', '/tmp')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO memory_entries (id, project_id, type, content) VALUES ('e1', 'p1', 'note', 'Hello')",
            [],
        ).unwrap();

        let mut runner = MigrationRunner::new(conn);

        // Run remaining migrations
        runner.run_pending().unwrap();

        // Verify data preserved
        let count: i32 = runner.conn.query_row(
            "SELECT COUNT(*) FROM memory_entries WHERE id = 'e1'",
            [], |row| row.get(0)
        ).unwrap();

        assert_eq!(count, 1, "Data should be preserved after migration");
    }

    #[test]
    fn test_migration_failure_rolls_back() {
        // Create a migration that will fail
        let mut runner = MigrationRunner::new(test_db());

        // Add a failing migration
        runner.migrations.push(Migration {
            version: 999,
            name: "failing_migration".into(),
            up: Box::new(|_| Err(MigrationError::Custom("intentional failure".into()))),
            down: Box::new(|_| Ok(())),
        });

        // Run should fail
        let result = runner.run_pending();
        assert!(result.is_err());

        // Version should not have changed
        assert_eq!(runner.get_current_version().unwrap(), 0);
    }
}
```

### 5.2 Migration Test Data

```rust
fn create_test_data(conn: &Connection) {
    conn.execute_batch("
        INSERT INTO projects (id, name, root_path) VALUES
            ('proj-1', 'Test Project', '/tmp/test'),
            ('proj-2', 'Another Project', '/tmp/another');

        INSERT INTO sessions (id, project_id, agent_id) VALUES
            ('sess-1', 'proj-1', 'claude'),
            ('sess-2', 'proj-1', 'codex'),
            ('sess-3', 'proj-2', 'claude');

        INSERT INTO memory_entries (id, project_id, agent_id, type, content) VALUES
            ('mem-1', 'proj-1', 'claude', 'note', 'First note'),
            ('mem-2', 'proj-1', 'claude', 'snapshot', '{\"prompt\": \"test\"}'),
            ('mem-3', 'proj-1', 'codex', 'decision', 'Use TypeScript'),
            ('mem-4', 'proj-2', 'claude', 'note', 'Project 2 note');

        INSERT INTO handoffs (id, project_id, from_agent_id, to_agent_id, summary) VALUES
            ('h-1', 'proj-1', 'claude', 'codex', 'Switching to code review');
    ").unwrap();
}
```

---

## 6. Version Compatibility Matrix

| App Version | Schema Version | Migration Range | Notes |
|---|---|---|---|
| 0.1.0 | v1 | — | Initial release |
| 0.2.0 | v2 | v1→v2 | Add metadata column |
| 0.3.0 | v3 | v2→v3 | Add FTS5 search |
| 0.4.0 | v4 | v3→v4 | Add cold storage tables |
| 1.0.0 | v5 | v4→v5 | Encryption support |

---

## 7. Rollback Procedures

### 7.1 Automatic Rollback (Migration Failure)

```rust
// If any migration fails, the entire transaction is rolled back
// The app should:
// 1. Log the error
// 2. Show user-friendly message
// 3. Offer to restore from backup
```

### 7.2 Manual Rollback (User Initiated)

```typescript
// Settings → Advanced → Database → Rollback to Version
const RollbackDialog: React.FC = () => {
  const [targetVersion, setTargetVersion] = useState<number | null>(null);

  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rollback Database</DialogTitle>
          <DialogDescription>
            This will revert the database schema to a previous version.
            A backup will be created before rollback.
          </DialogDescription>
        </DialogHeader>

        <Select onValueChange={v => setTargetVersion(parseInt(v))}>
          <SelectItem value="1">Version 1 — Initial schema</SelectItem>
          <SelectItem value="2">Version 2 — With metadata</SelectItem>
          <SelectItem value="3">Version 3 — With search</SelectItem>
        </Select>

        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!targetVersion}
            onClick={() => invoke('rollback_database', { version: targetVersion })}
          >
            Rollback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

---

## Implementation Checklist

- [ ] MigrationRunner struct
- [ ] schema_version table
- [ ] _migration_log table
- [ ] Initial schema migration (v1)
- [ ] Add tags/metadata migration (v2)
- [ ] Add FTS5 migration (v3)
- [ ] Backup before migration
- [ ] Integrity check after migration
- [ ] Data preservation verification
- [ ] Rollback support
- [ ] Migration tests (empty, from v1, rollback, preserve data)
- [ ] UI for manual rollback
