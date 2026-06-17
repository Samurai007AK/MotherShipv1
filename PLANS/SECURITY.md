# Mothership — Security Architecture

**Last Updated:** 2026-06-15
**Status:** Final Draft
**Scope:** Cross-cutting concern applicable to all phases

---

## Overview

Mothership is a desktop application that:
- Handles API keys for multiple LLM providers (Anthropic, OpenAI, Google, etc.)
- Executes arbitrary code through agent terminals
- Manages file system access for multiple agents
- Runs Python sidecar processes with network access
- Stores conversation history and memory in SQLite

**Threat Model:**
- **Primary concern:** User's own data on their own machine (single-user desktop)
- **Secondary concern:** API key theft if app is compromised
- **Tertiary concern:** Malicious code execution through compromised agents

**Related Documents:**
- [`CONFIGURATION.md`](./CONFIGURATION.md) — Agent permission configuration and defaults
- [`ERROR-HANDLING.md`](./ERROR-HANDLING.md) — Security-related error handling
- [`MONITORING.md`](./MONITORING.md) — Audit logging and security event monitoring
- [`SCHEMA-MIGRATIONS.md`](./SCHEMA-MIGRATIONS.md) — Secure database migration practices

---

## 1. Secrets Management

### 1.1 API Key Storage

**Location:** Platform-native secret storage

```rust
// src-tauri/src/secrets/mod.rs
use keyring::Entry;

pub struct SecretStore {
    service_name: String,
}

impl SecretStore {
    pub fn new() -> Self {
        Self {
            service_name: "mothership".to_string(),
        }
    }

    /// Store an API key using the OS credential manager
    pub fn set_key(&self, provider: &str, key: &str) -> Result<(), SecretError> {
        let entry = Entry::new(&self.service_name, provider)
            .map_err(|e| SecretError::KeyringError(e.to_string()))?;

        entry.set_password(key)
            .map_err(|e| SecretError::WriteError(e.to_string()))?;

        Ok(())
    }

    /// Retrieve an API key from the OS credential manager
    pub fn get_key(&self, provider: &str) -> Result<String, SecretError> {
        let entry = Entry::new(&self.service_name, provider)
            .map_err(|e| SecretError::KeyringError(e.to_string()))?;

        entry.get_password()
            .map_err(|e| match e {
                keyring::Error::NoEntry => SecretError::NotFound,
                _ => SecretError::ReadError(e.to_string()),
            })
    }

    /// Delete an API key
    pub fn delete_key(&self, provider: &str) -> Result<(), SecretError> {
        let entry = Entry::new(&self.service_name, provider)
            .map_err(|e| SecretError::KeyringError(e.to_string()))?;

        entry.delete_credential()
            .map_err(|e| SecretError::DeleteError(e.to_string()))?;

        Ok(())
    }

    /// List all stored providers (not the keys themselves)
    pub fn list_providers(&self) -> Result<Vec<String>, SecretError> {
        // Platform-specific enumeration
        // Windows: Credential Manager
        // macOS: Keychain
        // Linux: Secret Service API
        todo!()
    }
}
```

**Platform specifics:**
| OS | Storage | Encryption |
|---|---|---|
| Windows | Windows Credential Manager | DPAPI (user-scoped) |
| macOS | Keychain | AES-256 (user password) |
| Linux | Secret Service (GNOME Keyring / KWallet) | Depends on backend |

**Never:**
- ❌ Store API keys in plaintext files
- ❌ Store API keys in SQLite database
- ❌ Store API keys in environment variables (visible in process list)
- ❌ Log API keys in any log file
- ❌ Transmit API keys over unencrypted channels

### 1.2 Key Rotation

```rust
#[tauri::command]
fn rotate_api_key(provider: String, new_key: String) -> Result<(), String> {
    // Validate key format before storing
    validate_key_format(&provider, &new_key)?;

    // Store new key
    let store = SecretStore::new();
    store.set_key(&provider, &new_key)?;

    // Test the new key
    let test_result = test_api_key(&provider, &new_key);
    if test_result.is_err() {
        store.delete_key(&provider)?;
        return Err(format!("Key validation failed: {}", test_result.unwrap_err()));
    }

    // Notify all sidecars to refresh
    notify_sidecars_key_change(&provider)?;

    Ok(())
}

fn validate_key_format(provider: &str, key: &str) -> Result<(), String> {
    match provider {
        "anthropic" => {
            if !key.starts_with("sk-ant-") {
                return Err("Invalid Anthropic API key format".into());
            }
        }
        "openai" => {
            if !key.starts_with("sk-") {
                return Err("Invalid OpenAI API key format".into());
            }
        }
        "google" => {
            if key.len() < 20 {
                return Err("Invalid Google API key format".into());
            }
        }
        _ => {} // Unknown provider, accept any format
    }
    Ok(())
}
```

### 1.3 Key Usage Logging (Audit Trail)

```rust
// Log when keys are used (but NEVER log the key itself)
struct KeyUsageLog {
    provider: String,        // "anthropic" — OK
    timestamp: DateTime<Utc>,
    action: String,          // "api_call", "key_stored", "key_rotated"
    agent_id: Option<String>,
    // NEVER include: key_value, key_prefix, key_hash
}

impl KeyUsageLog {
    fn log_usage(&self, provider: &str, action: &str) {
        // Truncate provider name for safety
        let safe_provider = provider.chars().take(20).collect::<String>();
        tracing::info!(
            provider = %safe_provider,
            action = %action,
            "API key operation"
        );
    }
}
```

---

## 2. Process Isolation

### 2.1 Python Sidecar Sandboxing

**Goal:** Each Python sidecar runs in isolation. A crash or compromise in one sidecar cannot affect others or the main app.

```rust
// Sidecar isolation configuration
pub struct SidecarConfig {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env_vars: HashMap<String, String>,
    pub working_directory: PathBuf,
    pub resource_limits: ResourceLimits,
    pub network_access: NetworkPolicy,
}

struct ResourceLimits {
    pub max_memory_mb: u64,        // 256MB per sidecar
    pub max_cpu_percent: f32,      // 50% of one core
    pub max_runtime_secs: u64,     // 3600 (1 hour max, then restart)
}

enum NetworkPolicy {
    LocalOnly,                     // Can only connect to localhost
    LocalAndProviders,             // Can connect to localhost + known API endpoints
    Unrestricted,                  // Full network access (not recommended)
}
```

**Implementation:**
```rust
impl SidecarManager {
    fn spawn_isolated(&self, config: SidecarConfig) -> Result<ChildProcess> {
        let mut cmd = Command::new(&config.command);
        cmd.args(&config.args);

        // Set working directory
        cmd.current_dir(&config.working_directory);

        // Pass only necessary env vars (never pass all parent env)
        cmd.env_clear();
        for (key, value) in &config.env_vars {
            cmd.env(key, value);
        }

        // On Windows: use job objects for resource limits
        // On Linux/macOS: use cgroups or ulimits
        #[cfg(target_os = "windows")]
        {
            // Create a Job Object with memory and CPU limits
            let job = create_job_object_with_limits(
                config.resource_limits.max_memory_mb,
                config.resource_limits.max_cpu_percent,
            );
            cmd.spawn_in_job_object(job);
        }

        let child = cmd.spawn()?;

        // Start resource monitoring
        self.start_resource_monitor(child.id(), config.resource_limits)?;

        Ok(child)
    }
}
```

### 2.2 Terminal Session Isolation

Each agent terminal is isolated:

```rust
pub struct TerminalIsolation {
    /// Each terminal gets its own PTY (no shared TTY)
    pub pty_isolation: bool,

    /// Working directory per agent (can be different)
    pub working_directory: PathBuf,

    /// Environment variables per agent (filtered)
    pub env_vars: HashMap<String, String>,

    /// File system access restrictions
    pub fs_permissions: FsPermissions,

    /// Network access restrictions
    pub network_policy: NetworkPolicy,
}

struct FsPermissions {
    /// Directories this agent can read
    pub readable: Vec<PathBuf>,

    /// Directories this agent can write
    pub writable: Vec<PathBuf>,

    /// Directories this agent cannot access (deny list)
    pub denied: Vec<PathBuf>,
}

impl Default for FsPermissions {
    fn default() -> Self {
        Self {
            readable: vec![
                PathBuf::from("E:\\Mother"),  // Project root
            ],
            writable: vec![
                PathBuf::from("E:\\Mother"),  // Project root
            ],
            denied: vec![
                PathBuf::from("~/.mothership/secrets"),  // Never access secrets
                PathBuf::from("C:\\Windows\\System32"),   // Never touch system
            ],
        }
    }
}
```

### 2.3 Process Communication Security

```rust
// IPC between frontend and Rust backend
// Tauri's IPC is already secure (same-process, no network exposure)
// But we add validation on every command

#[tauri::command]
fn write_to_agent_terminal(
    session_id: String,
    data: String,
    state: State<AppState>,
) -> Result<(), String> {
    // 1. Validate session_id exists
    let session = state.terminal_manager.get_session(&session_id)
        .ok_or("Invalid session ID")?;

    // 2. Validate data length (prevent buffer overflow)
    if data.len() > 1_000_000 { // 1MB max
        return Err("Input too large".into());
    }

    // 3. Validate data is valid UTF-8
    if String::from_utf8(data.as_bytes().to_vec()).is_err() {
        return Err("Invalid UTF-8 data".into());
    }

    // 4. Check agent permissions
    if !state.permission_manager.can_write_to(session.agent_id(), &session_id) {
        return Err("Permission denied".into());
    }

    // 5. Write to PTY
    session.write_input(&data)?;

    Ok(())
}
```

---

## 3. File System Security

### 3.1 Sandboxed File Access

```rust
pub struct FileSystemGuard {
    project_root: PathBuf,
    allowed_paths: Vec<PathBuf>,
    blocked_paths: Vec<PathBuf>,
}

impl FileSystemGuard {
    pub fn new(project_root: PathBuf) -> Self {
        Self {
            project_root: project_root.clone(),
            allowed_paths: vec![
                project_root.clone(),
                PathBuf::from(std::env::temp_dir()),
            ],
            blocked_paths: vec![
                // System directories
                PathBuf::from("C:\\Windows\\System32"),
                PathBuf::from("/usr/bin"),
                PathBuf::from("/etc"),
                // App secrets
                dirs::home_dir().unwrap().join(".mothership").join("secrets"),
                // Other projects
                // (configured by user)
            ],
        }
    }

    pub fn can_access(&self, path: &Path) -> bool {
        // Check blocked paths first
        for blocked in &self.blocked_paths {
            if path.starts_with(blocked) {
                return false;
            }
        }

        // Check allowed paths
        for allowed in &self.allowed_paths {
            if path.starts_with(allowed) {
                return true;
            }
        }

        false
    }

    pub fn safe_read(&self, path: &Path) -> Result<String, FsError> {
        if !self.can_access(path) {
            return Err(FsError::AccessDenied {
                path: path.to_path_buf(),
                reason: "Path not in allowed list".into(),
            });
        }

        std::fs::read_to_string(path).map_err(|e| FsError::IoError(e))
    }

    pub fn safe_write(&self, path: &Path, content: &str) -> Result<(), FsError> {
        if !self.can_access(path) {
            return Err(FsError::AccessDenied {
                path: path.to_path_buf(),
                reason: "Path not in writable list".into(),
            });
        }

        // Create backup before writing
        if path.exists() {
            let backup = path.with_extension("bak");
            std::fs::copy(path, &backup)?;
        }

        std::fs::write(path, content).map_err(|e| FsError::IoError(e))
    }
}
```

### 3.2 Path Traversal Prevention

```rust
/// Normalize and validate paths to prevent traversal attacks
fn safe_path(base: &Path, user_input: &str) -> Result<PathBuf, PathError> {
    // Remove any null bytes
    if user_input.contains('\0') {
        return Err(PathError::InvalidPath);
    }

    // Normalize the path
    let normalized = PathBuf::from(user_input)
        .components()
        .filter(|c| !matches!(c, Component::ParentDir))  // Remove ../
        .filter(|c| !matches!(c, Component::Normal(_)) || !c.as_os_str().is_empty())
        .collect::<PathBuf>();

    let full_path = base.join(&normalized);

    // Verify the resolved path is still under base
    let resolved = full_path.canonicalize().unwrap_or(full_path.clone());
    let base_resolved = base.canonicalize().unwrap_or(base.clone());

    if !resolved.starts_with(&base_resolved) {
        return Err(PathError::TraversalAttempt);
    }

    Ok(resolved)
}
```

---

## 4. Memory & Data Security

### 4.1 SQLite Encryption (Optional)

```rust
// For users who want encrypted memory
use rusqlite::Connection;

fn open_encrypted_db(path: &Path, password: &str) -> Result<Connection, DbError> {
    // Use SQLCipher for encryption at rest
    let conn = Connection::open(path)?;

    // Derive key from password
    let key = derive_key(password)?;

    // Set encryption key
    conn.execute_batch(&format!("PRAGMA key = \"x'{}'\";", hex::encode(&key)))?;

    // Verify decryption worked
    let result: String = conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get(0))?;
    if result.is_empty() {
        return Err(DbError::DecryptionFailed);
    }

    Ok(conn)
}

fn derive_key(password: &str) -> Result<[u8; 32], DbError> {
    // Use Argon2id for key derivation (memory-hard, resistant to GPU attacks)
    use argon2::Argon2;

    let mut key = [0u8; 32];
    Argon2::default().hash_password_into(
        password.as_bytes(),
        b"mothership-salt-v1",  // Fixed salt (OK for single-user desktop)
        &mut key,
    ).map_err(|e| DbError::KeyDerivationFailed(e.to_string()))?;

    Ok(key)
}
```

### 4.2 Memory Entry Sanitization

```rust
/// Sanitize memory entries to prevent injection attacks
fn sanitize_memory_content(content: &str) -> String {
    // Remove any embedded secrets
    let sanitized = remove_api_keys(content);

    // Remove any personally identifiable information (optional)
    // let sanitized = redact_pii(&sanitized);

    // Ensure content is valid UTF-8 and doesn't contain control characters
    sanitized.chars()
        .filter(|c| !c.is_control() || *c == '\n' || *c == '\t')
        .collect()
}

/// Detect and redact API keys from content
fn remove_api_keys(content: &str) -> String {
    let patterns = [
        (r"sk-ant-[a-zA-Z0-9_-]{20,}", "sk-ant-[REDACTED]"),
        (r"sk-[a-zA-Z0-9]{20,}", "sk-[REDACTED]"),
        (r"AIza[a-zA-Z0-9_-]{35}", "AIza[REDACTED]"),
        (r"ghp_[a-zA-Z0-9]{36}", "ghp_[REDACTED]"),
    ];

    let mut result = content.to_string();
    for (pattern, replacement) in &patterns {
        let re = regex::Regex::new(pattern).unwrap();
        result = re.replace_all(&result, *replacement).to_string();
    }

    result
}
```

### 4.3 Export Security

```rust
/// When exporting memory/project data, sanitize sensitive information
fn export_project_data(project_id: &str) -> Result<ExportData, ExportError> {
    let db = get_db()?;

    // Get all memory entries
    let entries = db.get_all_entries(project_id)?;

    // Sanitize each entry
    let sanitized: Vec<MemoryEntry> = entries.into_iter()
        .map(|e| {
            MemoryEntry {
                content: sanitize_memory_content(&e.content),
                summary: e.summary.map(|s| sanitize_memory_content(&s)),
                ..e
            }
        })
        .collect();

    // Strip any internal IDs that could be exploited
    Ok(ExportData {
        entries: sanitized,
        exported_at: Utc::now(),
        version: "1.0".into(),
        // Never include: database paths, API keys, internal session IDs
    })
}
```

---

## 5. Agent Permission Model

### 5.1 Permission Levels

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PermissionLevel {
    /// Can only read files in project directory
    ReadOnly,

    /// Can read and write files in project directory
    ReadWrite,

    /// Can read/write + execute commands in terminal
    FullAccess,

    /// Can access network (for API agents)
    NetworkAccess,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentPermissions {
    pub agent_id: String,
    pub level: PermissionLevel,
    pub file_access: FileAccessScope,
    pub terminal_access: bool,
    pub network_access: bool,
    pub memory_access: MemoryAccessScope,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileAccessScope {
    pub readable_dirs: Vec<String>,
    pub writable_dirs: Vec<String>,
    pub denied_dirs: Vec<String>,
    pub max_file_size_mb: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MemoryAccessScope {
    /// Can only read/write its own memory entries
    OwnOnly,
    /// Can read all memory, write only its own
    ReadAll,
    /// Can read/write all memory entries
    FullAccess,
}
```

### 5.2 Default Agent Permissions

```rust
fn default_permissions(agent_id: &str) -> AgentPermissions {
    match agent_id {
        // CLI agents: full access to project directory
        "claude" | "codex" | "opencode" => AgentPermissions {
            agent_id: agent_id.into(),
            level: PermissionLevel::FullAccess,
            file_access: FileAccessScope {
                readable_dirs: vec!["E:\\Mother".into()],
                writable_dirs: vec!["E:\\Mother".into()],
                denied_dirs: vec![
                    "~/.mothership/secrets".into(),
                ],
                max_file_size_mb: 100,
            },
            terminal_access: true,
            network_access: false,  // CLI agents don't need network
            memory_access: MemoryAccessScope::ReadAll,
        },

        // API agents: read-only file access, network required
        "deepseek" | "mistral" | "kimi" | "qwen" => AgentPermissions {
            agent_id: agent_id.into(),
            level: PermissionLevel::ReadOnly,
            file_access: FileAccessScope {
                readable_dirs: vec!["E:\\Mother".into()],
                writable_dirs: vec![],  // API agents can't write files
                denied_dirs: vec![],
                max_file_size_mb: 10,
            },
            terminal_access: false,
            network_access: true,
            memory_access: MemoryAccessScope::OwnOnly,
        },

        // Browser agents: no file access, network required
        "chatgpt" | "gemini" | "claude_web" => AgentPermissions {
            agent_id: agent_id.into(),
            level: PermissionLevel::ReadOnly,
            file_access: FileAccessScope {
                readable_dirs: vec![],
                writable_dirs: vec![],
                denied_dirs: vec![],
                max_file_size_mb: 0,
            },
            terminal_access: false,
            network_access: true,
            memory_access: MemoryAccessScope::OwnOnly,
        },

        // Local models: read-only, no network
        "ollama" => AgentPermissions {
            agent_id: agent_id.into(),
            level: PermissionLevel::ReadOnly,
            file_access: FileAccessScope {
                readable_dirs: vec!["E:\\Mother".into()],
                writable_dirs: vec![],
                denied_dirs: vec![],
                max_file_size_mb: 10,
            },
            terminal_access: false,
            network_access: false,
            memory_access: MemoryAccessScope::OwnOnly,
        },

        // Default: most restrictive
        _ => AgentPermissions {
            agent_id: agent_id.into(),
            level: PermissionLevel::ReadOnly,
            file_access: FileAccessScope {
                readable_dirs: vec!["E:\\Mother".into()],
                writable_dirs: vec![],
                denied_dirs: vec![],
                max_file_size_mb: 0,
            },
            terminal_access: false,
            network_access: false,
            memory_access: MemoryAccessScope::OwnOnly,
        },
    }
}
```

### 5.3 Permission Checks

```rust
/// Check if an agent can perform an action
pub fn check_permission(
    agent_id: &str,
    action: &Action,
    resource: &Resource,
) -> Result<(), PermissionError> {
    let permissions = get_agent_permissions(agent_id)?;

    match action {
        Action::ReadFile(path) => {
            if !permissions.file_access.readable_dirs.iter().any(|d| path.starts_with(d)) {
                return Err(PermissionError::FileReadDenied {
                    agent: agent_id.into(),
                    path: path.clone(),
                });
            }
        }

        Action::WriteFile(path) => {
            if !permissions.file_access.writable_dirs.iter().any(|d| path.starts_with(d)) {
                return Err(PermissionError::FileWriteDenied {
                    agent: agent_id.into(),
                    path: path.clone(),
                });
            }
        }

        Action::ExecuteCommand(cmd) => {
            if !permissions.terminal_access {
                return Err(PermissionError::TerminalDenied {
                    agent: agent_id.into(),
                });
            }
        }

        Action::NetworkRequest(url) => {
            if !permissions.network_access {
                return Err(PermissionError::NetworkDenied {
                    agent: agent_id.into(),
                    url: url.clone(),
                });
            }
        }

        Action::ReadMemory(entry_id) => {
            match &permissions.memory_access {
                MemoryAccessScope::OwnOnly => {
                    // Check if entry belongs to this agent
                }
                MemoryAccessScope::ReadAll => {}
                MemoryAccessScope::FullAccess => {}
            }
        }
    }

    Ok(())
}
```

---

## 6. Network Security

### 6.1 Outbound Connection Validation

```rust
/// Validate outbound connections against allowlist
pub struct NetworkGuard {
    allowed_domains: Vec<String>,
    blocked_domains: Vec<String>,
}

impl NetworkGuard {
    pub fn new() -> Self {
        Self {
            allowed_domains: vec![
                // LLM providers
                "api.anthropic.com".into(),
                "api.openai.com".into(),
                "generativelanguage.googleapis.com".into(),
                "api.deepseek.com".into(),
                // Ollama (local only)
                "localhost:11434".into(),
                // Update server
                "updates.mothership.app".into(),
            ],
            blocked_domains: vec![
                // Never connect to these
                "evil.example.com".into(),
            ],
        }
    }

    pub fn is_allowed(&self, url: &str) -> bool {
        let parsed = url::Url::parse(url).ok()?;
        let host = parsed.host_str()?;

        // Check blocked list first
        if self.blocked_domains.iter().any(|d| host.contains(d)) {
            return false;
        }

        // Check allowed list
        self.allowed_domains.iter().any(|d| host.contains(d))
    }
}
```

### 6.2 TLS Enforcement

```rust
/// All outbound connections MUST use TLS
fn secure_request(url: &str) -> Result<reqwest::RequestBuilder, NetworkError> {
    let parsed = url::Url::parse(url)?;

    if parsed.scheme() != "https" && !parsed.host_str().unwrap_or("").starts_with("localhost") {
        return Err(NetworkError::InsecureConnection {
            url: url.into(),
            reason: "HTTP not allowed for non-localhost URLs".into(),
        });
    }

    let client = reqwest::Client::builder()
        .min_tls_version(reqwest::tls::Version::TLS_1_2)
        .timeout(Duration::from_secs(30))
        .build()?;

    Ok(client.get(url))
}
```

---

## 7. Audit Logging

```rust
/// Security-relevant events are logged for audit purposes
pub struct AuditLogger {
    log_path: PathBuf,
}

#[derive(Serialize)]
struct AuditEvent {
    timestamp: DateTime<Utc>,
    event_type: AuditEventType,
    agent_id: Option<String>,
    details: String,
    success: bool,
}

#[derive(Serialize)]
enum AuditEventType {
    // Authentication
    KeyStored,
    KeyRetrieved,
    KeyRotated,
    KeyDeleted,

    // File access
    FileRead,
    FileWrite,
    FileDelete,

    // Terminal
    TerminalSpawned,
    TerminalInput,

    // Memory
    MemoryRead,
    MemoryWrite,
    MemoryExport,

    // Network
    NetworkRequest,
    NetworkBlocked,

    // Permission
    PermissionDenied,
    PermissionGranted,

    // Sidecar
    SidecarStarted,
    SidecarCrashed,
    SidecarRestarted,
}

impl AuditLogger {
    fn log(&self, event: AuditEvent) {
        // Append to audit log (never deleted, rotated monthly)
        let json = serde_json::to_string(&event).unwrap();
        std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_path)
            .and_then(|mut f| {
                writeln!(f, "{}", json)
            })
            .ok(); // Don't fail on audit log errors
    }
}
```

---

## 8. Security Checklist by Phase

| Phase | Security Tasks |
|---|---|
| **Phase 0** | Set up SecretStore, validate Tauri IPC security, add filesystem guard |
| **Phase 1a** | Terminal isolation per agent, permission model for agents |
| **Phase 1b** | Memory entry sanitization, SQLite encryption option |
| **Phase 2** | API key redaction in exports, network guard for sidecars |
| **Phase 3** | WebView isolation, browser cookie handling |
| **Phase 4** | Security audit, penetration testing, code signing |

---

## 9. Security Considerations for Open Source

If Mothership is open-sourced:

1. **Never commit secrets** — `.gitignore` includes `.env`, `secrets/`, `*.key`
2. **Dependency auditing** — Run `cargo audit` and `npm audit` regularly
3. **Signed releases** — Sign Windows builds with code signing certificate
4. **Security policy** — Add `SECURITY.md` with vulnerability reporting instructions
5. **License** — Choose a license that allows forking but requires attribution

---

## Implementation Checklist

- [ ] SecretStore with platform-native credential manager
- [ ] API key format validation per provider
- [ ] Key rotation with validation
- [ ] Audit logging for security events
- [ ] Sidecar sandboxing (resource limits, env isolation)
- [ ] Terminal session isolation
- [ ] FileSystemGuard with allow/deny lists
- [ ] Path traversal prevention
- [ ] Memory entry sanitization (API key redaction)
- [ ] Export sanitization
- [ ] Agent permission model (4 levels)
- [ ] Default permissions per agent type
- [ ] Network guard with domain allowlist
- [ ] TLS enforcement for outbound connections
- [ ] SQLite encryption option (SQLCipher)
