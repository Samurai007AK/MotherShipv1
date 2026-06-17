# Mothership — Backup & Export

**Last Updated:** 2026-06-15
**Status:** Final Draft
**Scope:** Data persistence and portability (Phase 2+)

---

## Overview

Users invest significant time building memory, notes, and context in Mothership. This document ensures that data is never lost and can be moved between machines or shared with collaborators.

**Key Principles:**
1. **Automatic backups** — Every important data change is backed up
2. **One-click export** — Users can export everything in a readable format
3. **Portable format** — Exports are JSON/Markdown, not proprietary
4. **Selective export** — Export specific projects, agents, or time ranges

**Related Documents:**
- [`SCHEMA-MIGRATIONS.md`](./SCHEMA-MIGRATIONS.md) — Pre-migration backup strategy, restore after failed migration
- [`ERROR-HANDLING.md`](./ERROR-HANDLING.md) — Backup before crash recovery, data preservation
- [`SECURITY.md`](./SECURITY.md) — API key redaction in exports, sensitive data handling
- [`OFFLINE-BEHAVIOR.md`](./OFFLINE-BEHAVIOR.md) — Offline data persistence, sync when reconnected

---

## 1. Automatic Backup System

### 1.1 Backup Types

| Type | Trigger | Retention | Location |
|---|---|---|---|
| **Pre-migration** | Before schema migration | Permanent | `~/.mothership/backups/` |
| **Periodic** | Every hour when app is active | 7 days | `~/.mothership/backups/` |
| **Pre-export** | Before user exports data | Until export completes | `~/.mothership/backups/` |
| **On-error** | Before crash recovery | 30 days | `~/.mothership/backups/` |

### 1.2 Backup Implementation

```rust
// src-tauri/src/backup/mod.rs
pub struct BackupManager {
    backup_dir: PathBuf,
    max_backups: usize,
    retention_days: u32,
}

impl BackupManager {
    pub fn new(app_dir: &Path) -> Self {
        let backup_dir = app_dir.join("backups");
        std::fs::create_dir_all(&backup_dir).ok();

        Self {
            backup_dir,
            max_backups: 10,
            retention_days: 7,
        }
    }

    /// Create a backup of the SQLite database
    pub fn backup_database(&self, db_path: &Path, reason: &str) -> Result<PathBuf, BackupError> {
        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let filename = format!("mothership_{}_{}.db", reason, timestamp);
        let backup_path = self.backup_dir.join(&filename);

        // Use SQLite backup API for consistency
        let conn = Connection::open(db_path)?;
        conn.backup_to(&backup_path)?;

        tracing::info!(
            path = %backup_path.display(),
            reason = reason,
            size_kb = std::fs::metadata(&backup_path)
                .map(|m| m.len() / 1024)
                .unwrap_or(0),
            "Database backup created"
        );

        // Cleanup old backups
        self.cleanup_old_backups()?;

        Ok(backup_path)
    }

    /// Create a full project backup (DB + config + memory)
    pub fn backup_project(&self, project_dir: &Path) -> Result<PathBuf, BackupError> {
        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let backup_name = format!("project_{}", timestamp);
        let backup_dir = self.backup_dir.join(&backup_name);
        std::fs::create_dir_all(&backup_dir)?;

        // Copy database
        let db_path = project_dir.join("memory.db");
        if db_path.exists() {
            std::fs::copy(&db_path, backup_dir.join("memory.db"))?;
        }

        // Copy config
        let config_path = project_dir.join("project.json");
        if config_path.exists() {
            std::fs::copy(&config_path, backup_dir.join("project.json"))?;
        }

        // Copy agent overrides
        let agents_path = project_dir.join(".agents.json");
        if agents_path.exists() {
            std::fs::copy(&agents_path, backup_dir.join(".agents.json"))?;
        }

        // Create manifest
        let manifest = BackupManifest {
            created_at: Utc::now(),
            app_version: env!("CARGO_PKG_VERSION").into(),
            project_id: project_dir.file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_default(),
            files: std::fs::read_dir(&backup_dir)?
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect(),
        };

        let manifest_json = serde_json::to_string_pretty(&manifest)?;
        std::fs::write(backup_dir.join("manifest.json"), manifest_json)?;

        Ok(backup_dir)
    }

    /// Periodic backup (called by scheduler)
    pub fn periodic_backup(&self, db_path: &Path) -> Result<(), BackupError> {
        // Only backup if database exists and has changed since last backup
        let last_backup = self.get_last_backup_time()?;
        let db_modified = std::fs::metadata(db_path)?
            .modified()?
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs();

        if let Some(last) = last_backup {
            if db_modified <= last {
                return Ok(()); // No changes, skip backup
            }
        }

        self.backup_database(db_path, "periodic")?;
        Ok(())
    }

    fn cleanup_old_backups(&self) -> Result<(), BackupError> {
        let mut backups: Vec<_> = std::fs::read_dir(&self.backup_dir)?
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|ext| ext == "db").unwrap_or(false))
            .collect();

        // Sort by modification time (oldest first)
        backups.sort_by_key(|e| {
            e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH)
        });

        // Remove oldest backups if over limit
        while backups.len() > self.max_backups {
            if let Some(oldest) = backups.first() {
                tracing::info!(path = %oldest.path().display(), "Removing old backup");
                std::fs::remove_file(oldest.path())?;
                backups.remove(0);
            }
        }

        // Remove backups older than retention period
        let cutoff = Utc::now() - chrono::Duration::days(self.retention_days as i64);
        for backup in &backups {
            if let Ok(metadata) = backup.metadata() {
                if let Ok(modified) = metadata.modified() {
                    let modified_dt: DateTime<Utc> = modified.into();
                    if modified_dt < cutoff {
                        std::fs::remove_file(backup.path())?;
                    }
                }
            }
        }

        Ok(())
    }

    fn get_last_backup_time(&self) -> Result<Option<u64>, BackupError> {
        let latest = std::fs::read_dir(&self.backup_dir)?
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|ext| ext == "db").unwrap_or(false))
            .max_by_key(|e| {
                e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH)
            });

        match latest {
            Some(entry) => {
                let modified = entry.metadata()?.modified()?
                    .duration_since(std::time::UNIX_EPOCH)?
                    .as_secs();
                Ok(Some(modified))
            }
            None => Ok(None),
        }
    }
}
```

### 1.3 Backup Scheduler

```rust
// src-tauri/src/backup/scheduler.rs
pub struct BackupScheduler {
    manager: BackupManager,
    interval: Duration,
}

impl BackupScheduler {
    pub fn start(&self, db_path: PathBuf) {
        let manager = self.manager.clone();
        let interval = self.interval;

        tokio::spawn(async move {
            let mut interval_timer = tokio::time::interval(interval);

            loop {
                interval_timer.tick().await;

                if let Err(e) = manager.periodic_backup(&db_path) {
                    tracing::error!("Periodic backup failed: {}", e);
                }
            }
        });
    }
}
```

---

## 2. Export System

### 2.1 Export Formats

| Format | Contents | Use Case |
|---|---|---|
| **JSON** | All data, structured | Machine-readable, importable |
| **Markdown** | Notes, decisions, handoffs | Human-readable, shareable |
| **CSV** | Memory entries, search results | Spreadsheet analysis |
| **PDF** | Formatted report | Printing, sharing |

### 2.2 Export Implementation

```rust
// src-tauri/src/export/mod.rs
pub struct ExportManager {
    db: MemoryDb,
}

impl ExportManager {
    /// Export project to JSON
    pub fn export_json(&self, project_id: &str, options: &ExportOptions) -> Result<String, ExportError> {
        let data = self.collect_export_data(project_id, options)?;

        // Sanitize sensitive data
        let sanitized = self.sanitize_export(data)?;

        serde_json::to_string_pretty(&sanitized)
            .map_err(|e| ExportError::SerializationError(e.to_string()))
    }

    /// Export project to Markdown
    pub fn export_markdown(&self, project_id: &str, options: &ExportOptions) -> Result<String, ExportError> {
        let data = self.collect_export_data(project_id, options)?;

        let mut md = String::new();
        md.push_str(&format!("# {} — Memory Export\n\n", data.project.name));
        md.push_str(&format!("**Exported:** {}\n", Utc::now().format("%Y-%m-%d %H:%M UTC")));
        md.push_str(&format!("**App Version:** {}\n\n", data.app_version));

        // Notes
        if !data.notes.is_empty() {
            md.push_str("## Notes\n\n");
            for note in &data.notes {
                md.push_str(&format!("### {} ({})\n\n", note.agent_id, note.created_at));
                md.push_str(&format!("{}\n\n", note.content));
                if let Some(summary) = &note.summary {
                    md.push_str(&format!("> Summary: {}\n\n", summary));
                }
            }
        }

        // Decisions
        if !data.decisions.is_empty() {
            md.push_str("## Decisions\n\n");
            for decision in &data.decisions {
                md.push_str(&format!("- **{}**: {}\n", decision.agent_id, decision.content));
            }
            md.push('\n');
        }

        // Handoffs
        if !data.handoffs.is_empty() {
            md.push_str("## Handoff History\n\n");
            md.push_str("| Time | From | To | Summary |\n");
            md.push_str("|------|------|----|---------|\n");
            for handoff in &data.handoffs {
                md.push_str(&format!(
                    "| {} | {} | {} | {} |\n",
                    handoff.created_at.format("%H:%M"),
                    handoff.from_agent_id,
                    handoff.to_agent_id,
                    truncate(&handoff.summary.unwrap_or_default(), 50),
                ));
            }
            md.push('\n');
        }

        Ok(md)
    }

    /// Export to CSV
    pub fn export_csv(&self, project_id: &str, options: &ExportOptions) -> Result<String, ExportError> {
        let data = self.collect_export_data(project_id, options)?;
        let mut wtr = csv::Writer::from_writer(vec![]);

        // Write header
        wtr.write_record(&["id", "type", "agent", "content", "summary", "tags", "created_at"])?;

        // Write rows
        for entry in &data.entries {
            wtr.write_record(&[
                &entry.id,
                &entry.entry_type,
                &entry.agent_id,
                &entry.content,
                &entry.summary.as_deref().unwrap_or(""),
                &entry.tags.as_deref().unwrap_or(""),
                &entry.created_at.to_rfc3339(),
            ])?;
        }

        String::from_utf8(wtr.into_inner()?)
            .map_err(|e| ExportError::EncodingError(e.to_string()))
    }

    fn collect_export_data(&self, project_id: &str, options: &ExportOptions) -> Result<ExportData, ExportError> {
        let project = self.db.get_project(project_id)?
            .ok_or(ExportError::ProjectNotFound)?;

        let entries = if let Some(range) = &options.date_range {
            self.db.get_entries_in_range(project_id, &range.start, &range.end)?
        } else {
            self.db.get_all_entries(project_id)?
        };

        let handoffs = self.db.get_handoffs(project_id)?;

        Ok(ExportData {
            project,
            entries,
            handoffs,
            app_version: env!("CARGO_PKG_VERSION").into(),
            exported_at: Utc::now(),
        })
    }

    fn sanitize_export(&self, data: ExportData) -> Result<ExportData, ExportError> {
        // Remove API keys from content
        let sanitized_entries = data.entries.into_iter()
            .map(|mut entry| {
                entry.content = remove_api_keys(&entry.content);
                if let Some(summary) = &entry.summary {
                    entry.summary = Some(remove_api_keys(summary));
                }
                entry
            })
            .collect();

        Ok(ExportData {
            entries: sanitized_entries,
            ..data
        })
    }
}
```

### 2.3 Export UI

```tsx
// src/components/export/ExportDialog.tsx
const ExportDialog: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [format, setFormat] = useState<'json' | 'markdown' | 'csv'>('markdown');
  const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>({});
  const [includeSnapshots, setIncludeSnapshots] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const result = await invoke<string>('export_project', {
        projectId,
        format,
        dateRange: dateRange.start && dateRange.end ? {
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString(),
        } : null,
        includeSnapshots,
      });

      // Save file
      const blob = new Blob([result], { type: getMimeType(format) });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mothership_export_${format}_${Date.now()}.${format === 'markdown' ? 'md' : format}`;
      a.click();
      URL.revokeObjectURL(url);

      showToast({ title: 'Export complete', description: `Exported as ${format.toUpperCase()}` });
    } catch (e) {
      showToast({ title: 'Export failed', description: String(e), variant: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Project</DialogTitle>
          <DialogDescription>
            Export your memory, notes, and handoff history.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Format selection */}
          <div className="space-y-2">
            <Label>Format</Label>
            <div className="flex gap-2">
              {(['json', 'markdown', 'csv'] as const).map(f => (
                <Button
                  key={f}
                  variant={format === f ? 'default' : 'outline'}
                  onClick={() => setFormat(f)}
                >
                  {f === 'json' ? 'JSON' : f === 'markdown' ? 'Markdown' : 'CSV'}
                </Button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="space-y-2">
            <Label>Date Range (optional)</Label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={dateRange.start?.toISOString().split('T')[0] ?? ''}
                onChange={e => setDateRange(r => ({ ...r, start: new Date(e.target.value) }))}
              />
              <span className="self-center">to</span>
              <Input
                type="date"
                value={dateRange.end?.toISOString().split('T')[0] ?? ''}
                onChange={e => setDateRange(r => ({ ...r, end: new Date(e.target.value) }))}
              />
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="snapshots"
              checked={includeSnapshots}
              onCheckedChange={setIncludeSnapshots}
            />
            <Label htmlFor="snapshots">Include context snapshots</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => {}}>Cancel</Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

---

## 3. Import System

### 3.1 Import Sources

| Source | Format | Use Case |
|---|---|---|
| **Mothership export** | JSON | Restore from backup |
| **Markdown file** | .md | Import notes |
| **CSV** | .csv | Bulk import entries |
| **Paste** | Text | Quick note import |

### 3.2 Import Implementation

```rust
impl ExportManager {
    /// Import from Mothership JSON export
    pub fn import_json(&self, project_id: &str, json: &str) -> Result<ImportResult, ExportError> {
        let data: ExportData = serde_json::from_str(json)?;

        let mut imported = 0;
        let mut skipped = 0;

        for entry in &data.entries {
            // Check for duplicates
            if self.db.entry_exists(&entry.id)? {
                skipped += 1;
                continue;
            }

            self.db.write_note(
                project_id,
                &entry.content,
                entry.tags.as_deref().unwrap_or(""),
            )?;
            imported += 1;
        }

        for handoff in &data.handoffs {
            if !self.db.handoff_exists(&handoff.id)? {
                self.db.record_handoff(
                    project_id,
                    &handoff.from_agent_id,
                    &handoff.to_agent_id,
                    handoff.summary.as_deref().unwrap_or(""),
                    handoff.context_before.as_deref().unwrap_or(""),
                )?;
                imported += 1;
            }
        }

        Ok(ImportResult { imported, skipped })
    }

    /// Import from Markdown file
    pub fn import_markdown(&self, project_id: &str, markdown: &str) -> Result<ImportResult, ExportError> {
        let mut imported = 0;
        let mut current_section = String::new();
        let mut current_content = String::new();

        for line in markdown.lines() {
            if line.starts_with("## ") {
                // Save previous section
                if !current_content.is_empty() {
                    self.db.write_note(
                        project_id,
                        &current_content,
                        &current_section,
                    )?;
                    imported += 1;
                }

                current_section = line[3..].to_string();
                current_content.clear();
            } else if !line.starts_with("# ") && !line.starts_with("|") && !line.starts_with("---") {
                current_content.push_str(line);
                current_content.push('\n');
            }
        }

        // Save last section
        if !current_content.is_empty() {
            self.db.write_note(project_id, &current_content, &current_section)?;
            imported += 1;
        }

        Ok(ImportResult { imported, skipped: 0 })
    }

    /// Import from CSV
    pub fn import_csv(&self, project_id: &str, csv: &str) -> Result<ImportResult, ExportError> {
        let mut rdr = csv::Reader::from_reader(csv.as_bytes());
        let mut imported = 0;

        for result in rdr.records() {
            let record = record?;

            if let Some(content) = record.get(3) { // content column
                let tags = record.get(5).unwrap_or("");
                self.db.write_note(project_id, content, tags)?;
                imported += 1;
            }
        }

        Ok(ImportResult { imported, skipped: 0 })
    }
}
```

### 3.3 Import UI

```tsx
// src/components/export/ImportDialog.tsx
const ImportDialog: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'auto' | 'json' | 'markdown' | 'csv'>('auto');
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleImport = async () => {
    if (!file) return;

    setIsImporting(true);
    const content = await file.text();

    try {
      const detectedFormat = format === 'auto'
        ? detectFormat(file.name)
        : format;

      const importResult = await invoke<ImportResult>('import_data', {
        projectId,
        content,
        format: detectedFormat,
      });

      setResult(importResult);
      showToast({
        title: 'Import complete',
        description: `Imported ${importResult.imported} entries, skipped ${importResult.skipped}`,
      });
    } catch (e) {
      showToast({ title: 'Import failed', description: String(e), variant: 'error' });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Data</DialogTitle>
          <DialogDescription>
            Import notes, memory entries, or handoff history.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>File</Label>
            <Input
              type="file"
              accept=".json,.md,.csv"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-2">
            <Label>Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectItem value="auto">Auto-detect</SelectItem>
              <SelectItem value="json">JSON (Mothership export)</SelectItem>
              <SelectItem value="markdown">Markdown</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
            </Select>
          </div>

          {result && (
            <div className="bg-green-900/20 border border-green-800 rounded p-3">
              <p className="text-sm text-green-200">
                Imported {result.imported} entries, skipped {result.skipped} duplicates.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => {}}>Cancel</Button>
          <Button onClick={handleImport} disabled={!file || isImporting}>
            {isImporting ? 'Importing...' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

---

## 4. Restore from Backup

### 4.1 Restore Implementation

```rust
impl BackupManager {
    /// List available backups
    pub fn list_backups(&self) -> Result<Vec<BackupInfo>, BackupError> {
        let mut backups: Vec<BackupInfo> = Vec::new();

        for entry in std::fs::read_dir(&self.backup_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().map(|e| e == "db").unwrap_or(false) {
                let metadata = entry.metadata()?;
                backups.push(BackupInfo {
                    filename: path.file_name().unwrap().to_string_lossy().to_string(),
                    path: path.clone(),
                    size_kb: metadata.len() / 1024,
                    created_at: metadata.modified()?.into(),
                });
            }
        }

        backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(backups)
    }

    /// Restore from a backup
    pub fn restore(&self, backup_path: &Path, target_path: &Path) -> Result<(), BackupError> {
        // 1. Verify backup integrity
        let conn = Connection::open(backup_path)?;
        let integrity: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
        if integrity != "ok" {
            return Err(BackupError::CorruptedBackup);
        }

        // 2. Create backup of current database
        if target_path.exists() {
            self.backup_database(target_path, "pre_restore")?;
        }

        // 3. Copy backup to target
        std::fs::copy(backup_path, target_path)?;

        tracing::info!(
            backup = %backup_path.display(),
            target = %target_path.display(),
            "Database restored from backup"
        );

        Ok(())
    }
}
```

### 4.2 Restore UI

```tsx
// src/components/settings/RestoreDialog.tsx
const RestoreDialog: React.FC = () => {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);

  useEffect(() => {
    invoke<BackupInfo[]>('list_backups').then(setBackups);
  }, []);

  const handleRestore = async () => {
    if (!selectedBackup) return;

    await invoke('restore_backup', { backupPath: selectedBackup });
    showToast({ title: 'Restore complete', description: 'App will restart.' });
    window.location.reload();
  };

  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore from Backup</DialogTitle>
          <DialogDescription>
            Select a backup to restore. Current data will be backed up first.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {backups.map(backup => (
            <div
              key={backup.filename}
              className={cn(
                'p-3 border rounded cursor-pointer',
                selectedBackup === backup.path
                  ? 'border-blue-500 bg-blue-900/20'
                  : 'border-zinc-700 hover:border-zinc-500'
              )}
              onClick={() => setSelectedBackup(backup.path)}
            >
              <p className="font-medium">{backup.filename}</p>
              <p className="text-sm text-zinc-400">
                {backup.size_kb} KB • {formatDate(backup.created_at)}
              </p>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => {}}>Cancel</Button>
          <Button onClick={handleRestore} disabled={!selectedBackup} variant="destructive">
            Restore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

---

## 5. Backup Directory Structure

```
~/.mothership/backups/
├── mothership_periodic_20260615_103000.db      ← Periodic backup
├── mothership_periodic_20260615_113000.db
├── mothership_migration_20260615_120000.db     ← Pre-migration
├── mothership_pre_restore_20260615_130000.db   ← Pre-restore
├── project_20260615_140000/                     ← Full project backup
│   ├── memory.db
│   ├── project.json
│   └── manifest.json
└── ... (max 10 backups, 7-day retention)
```

---

## Implementation Checklist

- [ ] BackupManager with periodic backups
- [ ] Pre-migration backup
- [ ] Pre-restore backup
- [ ] Export to JSON
- [ ] Export to Markdown
- [ ] Export to CSV
- [ ] Export dialog UI
- [ ] Import from JSON
- [ ] Import from Markdown
- [ ] Import from CSV
- [ ] Import dialog UI
- [ ] Restore from backup
- [ ] Backup list UI
- [ ] Restore dialog UI
- [ ] API key redaction in exports
- [ ] Backup cleanup (7-day retention, max 10)
