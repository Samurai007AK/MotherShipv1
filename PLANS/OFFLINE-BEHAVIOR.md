# Mothership — Offline Behavior

**Last Updated:** 2026-06-15
**Status:** Final Draft
**Scope:** Cross-cutting concern applicable to all phases

---

## Overview

Mothership is designed as a **local-first** desktop application. Core functionality (terminals, memory, handoffs) should work without internet. API-dependent features (cloud LLMs, browser agents) degrade gracefully when offline.

**Design Principles:**
1. **Local-first** — Core features always work, even offline
2. **Graceful degradation** — Show what's available, explain what's missing
3. **Automatic recovery** — Reconnect and sync when back online
4. **No data loss** — Offline actions are queued and processed when reconnected

**Related Documents:**
- [`ERROR-HANDLING.md`](./ERROR-HANDLING.md) — Network failure detection, retry logic, offline mode triggers
- [`MONITORING.md`](./MONITORING.md) — Connectivity status monitoring, network health checks
- [`CONFIGURATION.md`](./CONFIGURATION.md) — Ollama endpoint configuration, fallback settings
- [`BACKUP-EXPORT.md`](./BACKUP-EXPORT.md) — Offline data persistence, sync when reconnected

---

## 1. Connectivity Detection

### 1.1 Network Status Monitor

```rust
// src-tauri/src/network/monitor.rs
pub struct NetworkMonitor {
    status: Arc<RwLock<NetworkStatus>>,
    check_interval: Duration,
    listeners: Vec<Box<dyn Fn(NetworkStatus) + Send + Sync>>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum NetworkStatus {
    Online { latency_ms: Option<u64> },
    Offline { since: DateTime<Utc> },
    Degraded { reason: String },  // Partial connectivity
}

impl NetworkMonitor {
    pub async fn check_status(&self) -> NetworkStatus {
        // 1. Check basic connectivity (ping DNS)
        let dns_ok = self.check_dns().await;

        // 2. Check specific endpoints
        let endpoints = self.check_endpoints().await;

        // 3. Determine status
        if !dns_ok {
            NetworkStatus::Offline { since: Utc::now() }
        } else if endpoints.iter().all(|e| e.available) {
            NetworkStatus::Online { latency_ms: endpoints.first().and_then(|e| e.latency) }
        } else {
            let unavailable: Vec<&str> = endpoints.iter()
                .filter(|e| !e.available)
                .map(|e| e.name.as_str())
                .collect();
            NetworkStatus::Degraded {
                reason: format!("Unreachable: {}", unavailable.join(", ")),
            }
        }
    }

    async fn check_dns(&self) -> bool {
        // Quick DNS resolution check
        use std::net::ToSocketAddrs;
        "dns.google:443".to_socket_addrs().is_ok()
    }

    async fn check_endpoints(&self) -> Vec<EndpointStatus> {
        let endpoints = vec![
            EndpointCheck {
                name: "Anthropic API".into(),
                url: "https://api.anthropic.com".into(),
                required_for: vec!["claude".into()],
            },
            EndpointCheck {
                name: "OpenAI API".into(),
                url: "https://api.openai.com".into(),
                required_for: vec!["codex".into(), "chatgpt".into()],
            },
            EndpointCheck {
                name: "Ollama (local)".into(),
                url: "http://localhost:11434".into(),
                required_for: vec!["ollama".into()],
            },
        ];

        let mut results = Vec::new();
        for endpoint in endpoints {
            let start = Instant::now();
            let available = reqwest::Client::new()
                .head(&endpoint.url)
                .timeout(Duration::from_secs(3))
                .send()
                .await
                .map(|r| r.status().is_success() || r.status().as_u16() == 404)
                .unwrap_or(false);

            results.push(EndpointStatus {
                name: endpoint.name,
                url: endpoint.url,
                available,
                latency: if available { Some(start.elapsed().as_millis() as u64) } else { None },
                required_for: endpoint.required_for,
            });
        }
        results
    }
}
```

### 1.2 Frontend Network Status

```typescript
// src/hooks/useNetworkStatus.ts
export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>('online');

  useEffect(() => {
    // Listen for Tauri network events
    const unlisten = listen<NetworkStatus>('network-status-changed', (event) => {
      setStatus(event.payload);
    });

    // Also check on visibility change (tab becomes active)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        invoke('check_network_status').then(setStatus);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unlisten.then(fn => fn());
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return status;
}

// Network status banner component
const OfflineBanner: React.FC = () => {
  const status = useNetworkStatus();

  if (status === 'online') return null;

  return (
    <div className="bg-orange-900/50 border-b border-orange-800 px-4 py-2 flex items-center gap-3">
      <WifiOff className="w-4 h-4 text-orange-400" />
      <div className="flex-1">
        <p className="text-sm text-orange-200">
          {status === 'offline'
            ? "You're offline. Local features are available."
            : `Partial connectivity: ${status.reason}`}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => invoke('check_network_status').then(/* refresh */)}
        className="text-orange-300 hover:text-orange-100"
      >
        Retry
      </Button>
    </div>
  );
};
```

---

## 2. Feature Availability Matrix

### 2.1 Online vs Offline Capabilities

| Feature | Online | Offline | Notes |
|---|---|---|---|
| **Terminal sessions** | ✅ Full | ✅ Full | Local PTY, no network needed |
| **Memory notes** | ✅ Full | ✅ Full | SQLite local storage |
| **Context capture** | ✅ Full | ✅ Full | Snapshot to local DB |
| **Manual handoff** | ✅ Full | ✅ Full | Template summary only |
| **Local Ollama** | ✅ Full | ✅ Full | Local inference, no network |
| **FTS5 search** | ✅ Full | ✅ Full | Local SQLite search |
| **Quick switcher** | ✅ Full | ✅ Full | Local state only |
| **Auto-summary (Ollama)** | ✅ Full | ✅ Full | If model downloaded |
| **Claude (API)** | ✅ Full | ❌ Unavailable | Requires API |
| **Codex (API)** | ✅ Full | ❌ Unavailable | Requires API |
| **ChatGPT (web)** | ✅ Full | ❌ Unavailable | Requires internet |
| **Gemini (web)** | ✅ Full | ❌ Unavailable | Requires internet |
| **DeepSeek (API)** | ✅ Full | ❌ Unavailable | Requires API |
| **Browser agents** | ✅ Full | ❌ Unavailable | Requires internet |
| **Task graph** | ✅ Full | ✅ Full | From local data |
| **Auto-update** | ✅ Full | ❌ Delayed | Queued until online |

### 2.2 Agent Status When Offline

```typescript
// When network goes offline, update agent statuses
function handleOffline(agents: Agent[]): Agent[] {
  return agents.map(agent => {
    switch (agent.type) {
      case 'local-cli':
        return agent; // Local agents unaffected
      case 'local-model':
        return agent; // Ollama unaffected
      case 'browser':
        return { ...agent, status: 'offline' as const };
      case 'api':
        return { ...agent, status: 'offline' as const };
      default:
        return agent;
    }
  });
}
```

---

## 3. Offline Action Queue

### 3.1 Queue Manager

```rust
// src-tauri/src/offline/queue.rs
pub struct OfflineQueue {
    queue_path: PathBuf,
    items: Vec<QueuedAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct QueuedAction {
    id: String,
    action_type: String,
    payload: serde_json::Value,
    created_at: DateTime<Utc>,
    retry_count: u32,
    max_retries: u32,
}

impl OfflineQueue {
    pub fn new(app_dir: &Path) -> Self {
        let queue_path = app_dir.join("offline_queue.json");
        let items = if queue_path.exists() {
            let content = std::fs::read_to_string(&queue_path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            Vec::new()
        };

        Self { queue_path, items }
    }

    pub fn enqueue(&mut self, action_type: &str, payload: serde_json::Value) {
        self.items.push(QueuedAction {
            id: uuid::Uuid::new_v4().to_string(),
            action_type: action_type.into(),
            payload,
            created_at: Utc::now(),
            retry_count: 0,
            max_retries: 3,
        });
        self.save();
    }

    pub async fn process_queue(&mut self, processor: &dyn ActionProcessor) -> QueueResult {
        let mut results = Vec::new();
        let mut remaining = Vec::new();

        for action in self.items.drain(..) {
            match processor.process(&action).await {
                Ok(result) => {
                    results.push(ProcessedAction {
                        id: action.id.clone(),
                        status: "completed".into(),
                        result,
                    });
                }
                Err(e) if action.retry_count < action.max_retries => {
                    let mut retry = action;
                    retry.retry_count += 1;
                    remaining.push(retry);
                }
                Err(e) => {
                    results.push(ProcessedAction {
                        id: action.id.clone(),
                        status: "failed".into(),
                        result: format!("Failed after {} retries: {}", action.retry_count, e),
                    });
                }
            }
        }

        self.items = remaining;
        self.save();

        QueueResult { processed: results, remaining: self.items.len() }
    }

    fn save(&self) {
        let json = serde_json::to_string_pretty(&self.items).unwrap_or_default();
        std::fs::write(&self.queue_path, json).ok();
    }
}
```

### 3.2 Queued Actions

```typescript
// Actions that can be queued for offline
type QueuedActionType =
  | 'send_to_agent'        // Queue API call for later
  | 'sync_memory'          // Sync memory when online
  | 'update_check'         // Check for updates when online
  | 'handoff_summary';      // Generate summary with Ollama when available

// Example: Queue an API call when offline
async function sendToAgentOffline(agentId: string, prompt: string) {
  const status = await invoke<NetworkStatus>('get_network_status');

  if (status === 'offline' || status.type === 'degraded') {
    // Check if it's an API agent
    const agent = getAgent(agentId);
    if (agent.type === 'api' || agent.type === 'browser') {
      // Queue for later
      await invoke('queue_action', {
        actionType: 'send_to_agent',
        payload: { agentId, prompt, queuedAt: new Date().toISOString() },
      });

      showToast({
        title: 'Message queued',
        description: `${agent.name} is unavailable offline. Message will be sent when you're back online.`,
        duration: 5000,
      });

      return;
    }
  }

  // Local agent or online — send immediately
  await invoke('send_to_agent', { agentId, prompt });
}
```

---

## 4. Local Inference (Ollama)

### 4.1 Offline LLM Availability

```rust
// src-tauri/src/ollama/offline.rs
pub struct OfflineInference {
    ollama_endpoint: String,
    available_models: Vec<String>,
    last_check: DateTime<Utc>,
}

impl OfflineInference {
    pub async fn check_availability(&mut self) -> OfflineLLMStatus {
        // Check if Ollama is running locally
        let ollama_running = reqwest::Client::new()
            .get(&format!("{}/api/tags", self.ollama_endpoint))
            .timeout(Duration::from_secs(2))
            .send()
            .await
            .is_ok();

        if !ollama_running {
            return OfflineLLMStatus {
                available: false,
                reason: "Ollama not running".into(),
                models: vec![],
            };
        }

        // Get available models
        let resp = reqwest::Client::new()
            .get(&format!("{}/api/tags", self.ollama_endpoint))
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => {
                let data: OllamaModels = r.json().await.unwrap_or_default();
                self.available_models = data.models.iter().map(|m| m.name.clone()).collect();
                self.last_check = Utc::now();

                OfflineLLMStatus {
                    available: !self.available_models.is_empty(),
                    reason: if self.available_models.is_empty() {
                        "No models downloaded".into()
                    } else {
                        "Ready".into()
                    },
                    models: self.available_models.clone(),
                }
            }
            _ => OfflineLLMStatus {
                available: false,
                reason: "Cannot connect to Ollama".into(),
                models: vec![],
            },
        }
    }

    pub async fn generate(&self, model: &str, prompt: &str) -> Result<String, InferenceError> {
        let resp = reqwest::Client::new()
            .post(&format!("{}/api/generate", self.ollama_endpoint))
            .json(&serde_json::json!({
                "model": model,
                "prompt": prompt,
                "stream": false,
            }))
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| InferenceError::ConnectionFailed(e.to_string()))?;

        let data: OllamaResponse = resp.json().await
            .map_err(|e| InferenceError::ParseError(e.to_string()))?;

        Ok(data.response)
    }
}
```

### 4.2 Fallback Chain

```typescript
// When summarizing, try in order:
// 1. Ollama llama3.2:3b (fast, local)
// 2. Ollama llama3.1:8b (better quality, local)
// 3. Template-based summary (no LLM needed)

async function summarizeWithFallback(context: ContextSnapshot[]): Promise<string> {
  const ollamaStatus = await invoke<OfflineLLMStatus>('check_ollama_status');

  if (ollamaStatus.available) {
    // Try models in order of preference
    const models = ['llama3.2:3b', 'llama3.1:8b', 'llama3.2:1b'];

    for (const model of models) {
      if (ollamaStatus.models.includes(model)) {
        try {
          const summary = await invoke<string>('generate_summary', {
            model,
            context: JSON.stringify(context),
          });
          return summary;
        } catch (e) {
          console.warn(`Summary generation failed with ${model}:`, e);
          continue;
        }
      }
    }
  }

  // Fallback: template-based summary
  return templateSummary(context);
}
```

---

## 5. Data Sync (Future)

### 5.1 Sync Architecture

```
Local SQLite
    ↓ (on reconnect)
Sync Manager
    ↓
Conflict Resolution
    ↓
Cloud Storage (optional — Phase 4+)
```

### 5.2 Conflict Resolution Strategy

```rust
#[derive(Debug, Clone)]
enum ConflictResolution {
    /// Local wins — most recent local edit is kept
    LocalFirst,
    /// Remote wins — most recent remote edit is kept
    RemoteFirst,
    /// Manual — user chooses which to keep
    Manual,
    /// Merge — combine both changes
    Merge,
}

fn resolve_conflict(local: &MemoryEntry, remote: &MemoryEntry) -> ConflictResolution {
    // Default: local wins for user-created content
    // Remote wins for auto-generated content (snapshots, summaries)

    match (local.entry_type, remote.entry_type) {
        (EntryType::Note, EntryType::Note) => ConflictResolution::LocalFirst,
        (EntryType::Snapshot, EntryType::Snapshot) => ConflictResolution::RemoteFirst,
        (EntryType::Decision, EntryType::Decision) => ConflictResolution::Manual,
        _ => ConflictResolution::Merge,
    }
}
```

---

## 6. Offline Mode UI

### 6.1 Status Indicator

```tsx
// Top-right corner shows connectivity status
const ConnectivityIndicator: React.FC = () => {
  const status = useNetworkStatus();
  const ollamaStatus = useOllamaStatus();

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex items-center gap-1">
        {status === 'online' ? (
          <Wifi className="w-3 h-3 text-green-400" />
        ) : (
          <WifiOff className="w-3 h-3 text-orange-400" />
        )}
        <span className={status === 'online' ? 'text-green-400' : 'text-orange-400'}>
          {status === 'online' ? 'Online' : 'Offline'}
        </span>
      </div>

      {ollamaStatus.available && (
        <div className="flex items-center gap-1">
          <Cpu className="w-3 h-3 text-blue-400" />
          <span className="text-blue-400">Local AI</span>
        </div>
      )}
    </div>
  );
};
```

### 6.2 Agent Availability Cards

```tsx
// In agent sidebar, show which agents are available offline
const AgentAvailability: React.FC<{ agent: Agent }> = ({ agent }) => {
  const networkStatus = useNetworkStatus();
  const isAvailable = agent.type === 'local-cli' || agent.type === 'local-model';

  return (
    <div className="flex items-center gap-2">
      <StatusDot status={isAvailable ? 'online' : (networkStatus === 'online' ? agent.status : 'offline')} />
      <span className="text-sm">{agent.name}</span>
      {!isAvailable && networkStatus !== 'online' && (
        <Badge variant="outline" className="text-xs text-orange-400 border-orange-700">
          Offline
        </Badge>
      )}
    </div>
  );
};
```

---

## Implementation Checklist

- [ ] NetworkMonitor with periodic checks
- [ ] Frontend useNetworkStatus hook
- [ ] Offline banner component
- [ ] Agent status update on connectivity change
- [ ] Offline action queue (enqueue, process, retry)
- [ ] Local inference via Ollama
- [ ] Fallback chain for summarization
- [ ] Connectivity indicator in UI
- [ ] Agent availability cards
- [ ] Offline mode documentation
