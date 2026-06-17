# Mothership — Error Handling & Recovery

**Last Updated:** 2026-06-15
**Status:** Final Draft
**Scope:** Cross-cutting concern applicable to all phases

---

## Overview

Mothership is a desktop application with multiple processes (Rust backend, React frontend, Python sidecars, PTY terminals). Each process can fail independently. This document defines how every failure mode is detected, handled, and recovered from.

**Design Principles:**
1. **No silent failures** — Every error is logged and surfaced to the user
2. **Graceful degradation** — The app stays usable even when components fail
3. **Automatic recovery** — Retry before asking the user to intervene
4. **Data safety** — Never lose user data or context due to a crash

**Related Documents:**
- [`MONITORING.md`](./MONITORING.md) — Logging architecture and health check endpoints
- [`SECURITY.md`](./SECURITY.md) — Security-related error handling and audit logging
- [`OFFLINE-BEHAVIOR.md`](./OFFLINE-BEHAVIOR.md) — Network failure handling and offline mode
- [`BACKUP-EXPORT.md`](./BACKUP-EXPORT.md) — Backup before crash recovery

---

## Failure Mode Catalog

### 1. Python Sidecar Crashes

**Scenarios:**
- CrewAI sidecar exits unexpectedly (OOM, unhandled exception, segfault)
- OpenHands SDK sidecar fails to start (missing Python dependency, port conflict)
- Summary Engine sidecar crashes during Ollama inference

**Detection:**
```rust
// src-tauri/src/process.rs
pub struct SidecarManager {
    processes: HashMap<String, ChildProcess>,
    health_checkers: HashMap<String, JoinHandle<()>>,
}

impl SidecarManager {
    fn start_health_check(&self, name: String) {
        let handle = tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(10)).await;
                if !self.is_healthy(&name).await {
                    self.handle_sidecar_failure(&name).await;
                }
            }
        });
        self.health_checkers.insert(name, handle);
    }

    async fn is_healthy(&self, name: &str) -> bool {
        // 1. Check if process is still alive
        // 2. HTTP ping on /health endpoint
        // 3. Verify response within 5s timeout
        match self.http_ping(name, "/health").await {
            Ok(response) => response.status == 200,
            Err(_) => false,
        }
    }
}
```

**Recovery Strategy:**
```
Attempt 1: Auto-restart sidecar (wait 1s)
  ↓ fails
Attempt 2: Auto-restart sidecar (wait 3s)
  ↓ fails
Attempt 3: Auto-restart sidecar (wait 10s)
  ↓ fails
Notify user: "CrewAI sidecar failed to restart. Handoffs will use template summaries."
  ↓ user clicks retry
Attempt 4: Full restart with clean state
  ↓ fails
Disable feature, show degraded mode banner
```

**UI Feedback:**
```tsx
// SidecarStatusBanner.tsx
const SidecarStatusBanner: React.FC<{ sidecar: string; status: SidecarStatus }> = ({ sidecar, status }) => {
  if (status === 'healthy') return null;

  return (
    <div className="bg-yellow-900/50 border-l-4 border-yellow-500 p-3 flex items-center gap-3">
      <AlertTriangle className="w-5 h-5 text-yellow-400" />
      <div className="flex-1">
        <p className="text-sm text-yellow-200">
          {sidecar} is {status === 'crashed' ? 'not responding' : 'restarting...'}
        </p>
        <p className="text-xs text-yellow-400">
          {status === 'crashed'
            ? 'Handoffs will use template summaries until it recovers.'
            : 'Attempting to reconnect...'}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={() => forceRestart(sidecar)}>
        Retry
      </Button>
      <Button variant="ghost" size="sm" onClick={() => dismissBanner(sidecar)}>
        Dismiss
      </Button>
    </div>
  );
};
```

**Logging:**
```rust
// Every crash is logged with full context
struct CrashLog {
    sidecar_name: String,
    timestamp: DateTime<Utc>,
    exit_code: Option<i32>,
    stderr_output: String,
    last_healthy: DateTime<Utc>,
    restart_attempts: u32,
    memory_usage_mb: Option<u64>,
}
```

---

### 2. SQLite Database Corruption

**Scenarios:**
- Power loss during write operation
- Disk full during transaction
- Concurrent write contention
- File system corruption
- Manual deletion of database file

**Detection:**
```rust
// src-tauri/src/memory/mod.rs
impl MemoryDb {
    fn verify_integrity(&self) -> Result<DbHealth, DbError> {
        // Run PRAGMA integrity_check
        let result: String = self.conn.query_row(
            "PRAGMA integrity_check", [], |row| row.get(0)
        )?;

        if result != "ok" {
            return Err(DbError::Corruption(result));
        }

        // Check table counts
        let table_count: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table'",
            [], |row| row.get(0)
        )?;

        if table_count < 4 { // We expect at least 4 tables
            return Err(DbError::IncompleteSchema);
        }

        Ok(DbHealth::Ok { table_count })
    }
}
```

**Recovery Strategy:**
```
1. Detect corruption on startup or next query
2. Log full error with PRAGMA integrity_check output
3. Attempt recovery:
   a. Try: .backup command to create recovery copy
   b. Try: Rebuild from WAL journal (if WAL mode was active)
   c. Try: Drop and recreate FTS5 virtual table
4. If unrecoverable:
   a. Export any readable data to JSON backup
   b. Create fresh database with correct schema
   c. Import recoverable data
   d. Notify user: "Memory was rebuilt from backup. Some recent entries may be missing."
5. If backup exists:
   a. Prompt user: "Database corruption detected. Restore from last backup?"
   b. One-click restore from most recent backup
```

**Prevention:**
```sql
-- Always use WAL mode for crash safety
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;  -- Balanced safety/speed
PRAGMA busy_timeout=5000;   -- Wait 5s on lock contention
PRAGMA cache_size=-4000;    -- 4MB cache
```

**Automatic Backup:**
```rust
// Backup before every schema migration
fn backup_before_migration(db_path: &Path) -> Result<PathBuf> {
    let backup_path = db_path.with_extension("db.backup");
    std::fs::copy(db_path, &backup_path)?;
    Ok(backup_path)
}

// Periodic backup (every hour when app is active)
fn scheduled_backup(db: &MemoryDb, backup_dir: &Path) {
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    let backup_path = backup_dir.join(format!("mothership_{}.db", timestamp));
    db.backup_to(&backup_path)?;

    // Keep only last 7 backups
    cleanup_old_backups(backup_dir, 7);
}
```

---

### 3. Terminal Session Crashes

**Scenarios:**
- PTY process exits (command completes, crashes, or is killed)
- node-pty / portable-pty native binding failure
- Terminal buffer overflow (too much output)
- WebSocket connection lost between xterm.js and Rust backend

**Detection:**
```rust
// src-tauri/src/terminal/mod.rs
pub struct TerminalManager {
    sessions: HashMap<String, TerminalSession>,
}

struct TerminalSession {
    agent_id: String,
    pty: PtyMaster,
    output_buffer: Vec<u8>,
    last_activity: DateTime<Utc>,
    status: TerminalStatus,
}

enum TerminalStatus {
    Running,
    Exited { exit_code: i32 },
    Crashed { error: String },
    Disconnected,
}
```

**Recovery Strategy:**
```
1. PTY exit detected (exit code available)
   a. If exit code 0 → Normal completion, keep session in "exited" state
   b. If exit code non-zero → Show error in terminal, offer restart
   c. If signal killed → Show "Process terminated" with signal info

2. Terminal restart flow:
   a. Preserve scrollback buffer (snapshot to JSON)
   b. Kill old PTY if still alive
   c. Spawn new PTY with same agent_id and cwd
   d. Restore scrollback buffer to new terminal
   e. Focus terminal, show "Session restored" toast

3. Buffer overflow prevention:
   a. Cap scrollback at 10,000 lines (configurable)
   b. Implement circular buffer for PTY output
   c. If buffer full, compress old output (keep last 1000 lines full, rest summarized)
```

**UI Recovery:**
```tsx
// TerminalCrashOverlay.tsx
const TerminalCrashOverlay: React.FC<{
  session: TerminalSession;
  onRestart: () => void;
  onDiscard: () => void;
}> = ({ session, onRestart, onDiscard }) => {
  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <XCircle className="w-8 h-8 text-red-400" />
          <h3 className="text-lg font-semibold text-white">Terminal Disconnected</h3>
        </div>
        <p className="text-zinc-400 mb-2">
          {session.agentId} terminal exited with code {session.exitCode ?? 'unknown'}.
        </p>
        <p className="text-zinc-500 text-sm mb-6">
          Scrollback buffer preserved ({session.scrollbackLines} lines).
        </p>
        <div className="flex gap-3">
          <Button onClick={onRestart} variant="primary">
            Restart Session
          </Button>
          <Button onClick={onDiscard} variant="outline">
            Discard
          </Button>
        </div>
      </div>
    </div>
  );
};
```

---

### 4. Tauri IPC Failures

**Scenarios:**
- Frontend invokes a Rust command that panics
- IPC channel overloaded (too many concurrent commands)
- Serialization/deserialization errors
- Frontend re-render causes stale command references

**Detection & Handling:**
```typescript
// lib/tauri-safe-invoke.ts
async function safeInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
  options?: { retries?: number; timeout?: number }
): Promise<T> {
  const { retries = 2, timeout = 30000 } = options ?? {};

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await Promise.race([
        invoke<T>(command, args),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`IPC timeout: ${command}`)), timeout)
        ),
      ]);
      return result;
    } catch (error) {
      const isLastAttempt = attempt === retries;

      // Log every failure
      console.error(`IPC call failed: ${command}`, {
        attempt: attempt + 1,
        error,
        args,
      });

      if (isLastAttempt) {
        // Show user-facing error
        showErrorToast(`Operation failed: ${command}`, {
          detail: error instanceof Error ? error.message : String(error),
          action: { label: 'Retry', onClick: () => safeInvoke(command, args, options) },
        });
        throw error;
      }

      // Exponential backoff between retries
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  throw new Error('Unreachable');
}
```

**Rust-side error handling:**
```rust
// All Tauri commands return Result<T, String> for clean IPC
#[tauri::command]
fn write_note(project_id: String, content: String, tags: String) -> Result<String, String> {
    let db = get_db().map_err(|e| format!("Database not available: {}", e))?;

    db.write_note(&project_id, &content, &tags)
        .map_err(|e| format!("Failed to write note: {}", e))?;

    Ok("Note saved".into())
}

// Never panic in Tauri commands — always return Err
#[tauri::command]
fn dangerous_operation() -> Result<String, String> {
    // Use .map_err() instead of .unwrap()
    let data = std::fs::read_to_string("config.json")
        .map_err(|e| format!("Failed to read config: {}", e))?;

    Ok(data)
}
```

---

### 5. Ollama / Local LLM Failures

**Scenarios:**
- Ollama not installed
- Model not downloaded
- Ollama server not running
- Model inference OOM (out of memory)
- Inference timeout (model too slow)

**Detection:**
```rust
#[tauri::command]
async fn check_ollama_status() -> OllamaStatus {
    // 1. Check if ollama binary exists
    let ollama_path = which("ollama").ok();

    // 2. Check if server is running
    let server_running = reqwest::get("http://localhost:11434/api/tags")
        .await
        .is_ok();

    // 3. Check if required model is available
    let models = if server_running {
        get_installed_models().await.unwrap_or_default()
    } else {
        vec![]
    };

    OllamaStatus {
        installed: ollama_path.is_some(),
        server_running,
        available_models: models,
        has_summarization_model: models.iter().any(|m| m.contains("llama3")),
    }
}
```

**Recovery Strategy:**
```
1. Ollama not installed:
   a. Show banner: "Ollama not found. Install it for AI summaries."
   b. Provide download link: https://ollama.ai
   c. Offer template-based fallback (no LLM needed)

2. Model not downloaded:
   a. Show banner: "llama3.2:3b not downloaded. Downloading now..."
   b. Run: ollama pull llama3.2:3b (show progress)
   c. If download fails → offer alternative models or template fallback

3. Inference OOM:
   a. Detect via Ollama error response
   b. Switch to smaller model (3b → 1b)
   c. If still OOM → use template fallback
   d. Notify user: "Model too large for available memory. Using template summary."

4. Inference timeout (>30s):
   a. Cancel inference
   b. Use template fallback
   c. Log: "Ollama inference timed out after 30s"
```

**Template Fallback (No LLM):**
```typescript
function templateBasedSummary(context: ContextSnapshot[]): string {
  const files = [...new Set(context.flatMap(s => s.openFiles))];
  const branches = [...new Set(context.map(s => s.branch).filter(Boolean))];
  const gitCommits = context.filter(s => s.trigger === 'git_activity');

  return [
    `## Session Summary`,
    ``,
    `**Duration:** ${formatDuration(context)}`,
    `**Branches:** ${branches.join(', ') || 'none'}`,
    `**Files touched:** ${files.length} files`,
    files.slice(0, 10).map(f => `  - ${f}`).join('\n'),
    ``,
    `**Git activity:** ${gitCommits.length} commits/operations`,
    ``,
    `**Last prompt:**`,
    context[context.length - 1]?.prompt?.slice(0, 500) || 'No prompt captured',
  ].join('\n');
}
```

---

### 6. WebView Failures (Phase 3)

**Scenarios:**
- WebView2 not installed (Windows)
- Website blocks embedded WebView
- Authentication cookies expired
- Navigation errors (404, timeout)

**Detection & Recovery:**
```rust
#[tauri::command]
async fn spawn_browser_agent(agent_id: String, url: String) -> Result<(), String> {
    // 1. Check WebView2 availability
    #[cfg(target_os = "windows")]
    {
        if !webview2_available() {
            return Err(
                "WebView2 Runtime not installed. Download from: \
                 https://developer.microsoft.com/en-us/microsoft-edge/webview2/".into()
            );
        }
    }

    // 2. Attempt to load URL
    // 3. If blocked (detect via navigation event):
    //    a. Show "Open in external browser" button
    //    b. Log the URL for context

    // 4. If auth expired:
    //    a. Show login prompt in WebView
    //    b. Capture new cookies
    //    c. Resume automation

    Ok(())
}
```

**UI Fallback:**
```tsx
// WebViewErrorFallback.tsx
const WebViewErrorFallback: React.FC<{
  url: string;
  error: string;
  onOpenExternal: () => void;
}> = ({ url, error, onOpenExternal }) => {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
      <Globe className="w-12 h-12 text-zinc-500" />
      <h3 className="text-lg font-medium text-white">Unable to load agent</h3>
      <p className="text-zinc-400 text-sm text-center max-w-md">{error}</p>
      <div className="flex gap-3">
        <Button onClick={onOpenExternal} variant="primary">
          Open in Browser
        </Button>
        <Button onClick={() => window.location.reload()} variant="outline">
          Retry
        </Button>
      </div>
    </div>
  );
};
```

---

### 7. Memory Exhaustion (RAM)

**Scenarios:**
- Multiple terminals open simultaneously
- Ollama model loaded alongside app
- Memory leak in long-running sessions
- Too many context snapshots accumulated

**Prevention & Detection:**
```rust
// src-tauri/src/process/watcher.rs
pub struct MemoryWatcher {
    check_interval: Duration,
    thresholds: MemoryThresholds,
}

struct MemoryThresholds {
    warning_mb: u64,   // 250MB
    critical_mb: u64,  // 350MB
    target_idle_mb: u64, // 200MB
}

impl MemoryWatcher {
    async fn check(&self) -> MemoryStatus {
        let usage = get_process_memory_mb();

        match usage {
            u if u >= self.thresholds.critical_mb => MemoryStatus::Critical(u),
            u if u >= self.thresholds.warning_mb => MemoryStatus::Warning(u),
            _ => MemoryStatus::Healthy(usage),
        }
    }

    async fn handle_critical(&self) {
        // 1. Pause all hidden terminal sessions
        pause_hidden_terminals();

        // 2. Unmount inactive React components
        unmount_inactive_panels();

        // 3. Flush and compress memory entries
        flush_memory_writes();
        compress_old_snapshots();

        // 4. If still critical, prompt user
        show_memory_warning(
            "Mothership is using a lot of memory. Consider closing unused terminals."
        );
    }
}
```

**Automatic RAM Management:**
```typescript
// hooks/useMemoryManager.ts
function useMemoryManager() {
  useEffect(() => {
    // Pause terminals hidden for > 5 minutes
    const pauseInterval = setInterval(() => {
      hiddenSessions.forEach(session => {
        if (Date.now() - session.lastVisible > 5 * 60 * 1000) {
          invoke('pause_terminal', { sessionId: session.id });
        }
      });
    }, 60_000);

    // Unmount inactive panels after 10 minutes
    const unmountInterval = setInterval(() => {
      inactivePanels.forEach(panel => {
        if (Date.now() - panel.lastActive > 10 * 60 * 1000) {
          panel.unmount();
        }
      });
    }, 120_000);

    return () => {
      clearInterval(pauseInterval);
      clearInterval(unmountInterval);
    };
  }, []);
}
```

---

### 8. Network Failures (API Agents)

**Scenarios:**
- Internet connection lost
- API rate limiting (429 responses)
- API key expired or invalid
- DNS resolution failure

**Handling:**
```typescript
// lib/api-error-handler.ts
async function handleApiError(error: ApiError, agentId: string): Promise<ErrorAction> {
  switch (error.status) {
    case 0: // Network error
      return {
        type: 'retry',
        delay: 5000,
        message: 'Network unavailable. Retrying in 5s...',
        fallback: 'Use local Ollama model',
      };

    case 401: // Unauthorized
      return {
        type: 'action_required',
        message: `API key for ${agentId} is invalid or expired.`,
        action: {
          label: 'Update API Key',
          onClick: () => openSettings('api-keys', agentId),
        },
      };

    case 429: // Rate limited
      const retryAfter = error.headers['retry-after'] ?? 60;
      return {
        type: 'retry',
        delay: retryAfter * 1000,
        message: `Rate limited. Retrying in ${retryAfter}s...`,
        fallback: 'Switch to another agent',
      };

    case 500: // Server error
      return {
        type: 'retry',
        delay: 30_000,
        message: `${agentId} server error. Retrying in 30s...`,
      };

    default:
      return {
        type: 'notify',
        message: `Unexpected error from ${agentId}: ${error.message}`,
      };
  }
}
```

**Offline Mode:**
```typescript
// When offline, automatically:
// 1. Switch API agents to "offline" status
// 2. Route requests to local Ollama (if available)
// 3. Queue messages for later delivery
// 4. Show offline banner in UI

const offlineBanner = (
  <div className="bg-orange-900/50 border-l-4 border-orange-500 p-3">
    <p className="text-sm text-orange-200">
      You're offline. API agents unavailable. Local Ollama {ollamaAvailable ? 'is' : 'is not'} available.
    </p>
  </div>
);
```

---

### 9. IPC Named Pipe Failures (Windows)

**Scenarios:**
- Named pipe server not started
- Pipe broken (process crashed)
- Pipe access denied
- Pipe buffer full

**Handling:**
```rust
// Named pipe error handling for Windows IPC
impl PipeManager {
    fn connect(&self, pipe_name: &str) -> Result<PipeClient, PipeError> {
        let client = NamedPipeClient::connect(pipe_name).map_err(|e| {
            match e.kind() {
                ErrorKind::NotFound => PipeError::ServerNotRunning,
                ErrorKind::PermissionDenied => PipeError::AccessDenied,
                ErrorKind::BrokenPipe => PipeError::Disconnected,
                _ => PipeError::Unknown(e),
            }
        })?;
        Ok(client)
    }

    fn reconnect_with_backoff(&self, pipe_name: &str) -> Result<PipeClient, PipeError> {
        let delays = [100, 500, 1000, 3000, 5000]; // ms

        for delay in delays {
            if let Ok(client) = self.connect(pipe_name) {
                return Ok(client);
            }
            std::thread::sleep(Duration::from_millis(delay));
        }

        Err(PipeError::MaxRetriesExceeded)
    }
}
```

---

## Error Severity Levels

| Level | Description | User Action Required | Auto-Recovery |
|---|---|---|---|
| **CRITICAL** | Core functionality broken (DB, shell) | Yes — restart app | No |
| **HIGH** | Major feature unavailable (sidecar, terminal) | Optional — retry or degrade | Yes — retry with backoff |
| **MEDIUM** | Minor feature degraded (search, summary) | No — still usable | Yes — fallback mode |
| **LOW** | Cosmetic or non-blocking (UI glitch) | No | Yes — auto-refresh |

---

## Error Reporting & Telemetry

**Local Error Log:**
```
~/.mothership/logs/
├── mothership.log           ← Main app log (rotated daily)
├── sidecar_crewai.log       ← CrewAI sidecar log
├── sidecar_openhands.log    ← OpenHands sidecar log
├── sidecar_summary.log      ← Summary engine log
├── crash_reports/           ← Crash dumps (if enabled)
│   ├── 2026-06-15_103022.json
│   └── ...
└── performance/             ← Performance metrics
    ├── memory_usage.csv
    └── ipc_latency.csv
```

**Log Format:**
```json
{
  "timestamp": "2026-06-15T10:30:22.123Z",
  "level": "ERROR",
  "component": "sidecar-manager",
  "message": "CrewAI sidecar crashed",
  "context": {
    "pid": 12345,
    "exit_code": 137,
    "restart_attempt": 2,
    "memory_mb": 180
  },
  "stack_trace": "..."
}
```

**User-Facing Error Display:**
```tsx
// ErrorToast.tsx — consistent error display
const ErrorToast: React.FC<{ error: AppError }> = ({ error }) => {
  return (
    <div className="bg-red-950 border border-red-800 rounded-lg p-4 max-w-md">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-red-200">{error.title}</p>
          <p className="text-xs text-red-400 mt-1">{error.message}</p>
          {error.action && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 border-red-700 text-red-300"
              onClick={error.action.onClick}
            >
              {error.action.label}
            </Button>
          )}
        </div>
        <button onClick={error.dismiss} className="text-red-500 hover:text-red-300">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
```

---

## Error Recovery Matrix

| Component | Failure | Detection | Recovery | Max Retries | Degradation |
|---|---|---|---|---|---|
| CrewAI sidecar | Crash | Health check (10s) | Auto-restart | 3 | Template summaries |
| OpenHands sidecar | Crash | Health check (10s) | Auto-restart | 3 | Manual agent only |
| Summary engine | Crash | Health check (10s) | Auto-restart | 3 | Template fallback |
| SQLite DB | Corruption | Integrity check | Backup restore | 1 | Read-only mode |
| Terminal PTY | Exit | Process watch | Restart + restore | 2 | New session |
| WebSocket | Disconnect | Heartbeat (5s) | Auto-reconnect | 5 | IPC fallback |
| Ollama | Not running | HTTP ping | Prompt install | 1 | Template summary |
| WebView2 | Not installed | Detection check | Prompt install | 0 | External browser |
| API agent | Network error | HTTP status | Retry w/ backoff | 3 | Local model |
| API agent | 429 rate limit | HTTP 429 | Wait + retry | 2 | Switch agent |
| Named pipe | Broken | Write failure | Reconnect w/ backoff | 5 | Error message |
| Memory | > 350MB | Periodic check | Pause sessions | N/A | Forced cleanup |

---

## Implementation Checklist

- [ ] SidecarManager with health checks and auto-restart
- [ ] SQLite integrity check on startup
- [ ] Automatic backup before migrations
- [ ] Terminal crash recovery with scrollback preservation
- [ ] safeInvoke wrapper with retries and timeout
- [ ] Ollama status check and fallback chain
- [ ] Memory watcher with pause/unmount triggers
- [ ] API error handler with retry logic
- [ ] Named pipe reconnect with exponential backoff
- [ ] Error toast component (consistent UI)
- [ ] Local log rotation (daily, 30-day retention)
- [ ] Error severity classification system
