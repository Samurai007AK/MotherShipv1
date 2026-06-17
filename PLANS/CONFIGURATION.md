# Mothership — Configuration Management

**Last Updated:** 2026-06-15
**Status:** Final Draft
**Scope:** Cross-cutting concern applicable to all phases

---

## Overview

Mothership needs to manage three levels of configuration:
1. **User preferences** — Theme, shortcuts, display options (machine-specific)
2. **Project settings** — Which agents, which models, project-specific config
3. **Agent config** — Capabilities, permissions, connection details per agent

**Design Principles:**
- Configuration is human-readable (JSON or YAML)
- All configs have sensible defaults (zero-config experience)
- Configs are portable (can be copied between machines)
- Configs are version-controlled (user can track changes in git)

**Related Documents:**
- [`SECURITY.md`](./SECURITY.md) — API key storage via OS keyring, not config files
- [`ERROR-HANDLING.md`](./ERROR-HANDLING.md) — Config validation, fallback to defaults on parse error
- [`ACCESSIBILITY.md`](./ACCESSIBILITY.md) — Keyboard shortcut configuration, font scaling
- [`MONITORING.md`](./MONITORING.md) — Debug mode settings, performance overlay toggle

---

## 1. Configuration File Locations

### 1.1 Directory Structure

```
~/.mothership/
├── config.json                    ← User preferences (global)
├── agents.json                    ← Agent registry (global)
├── secrets/                       ← API keys (OS credential manager, not files)
│   └── (managed by keyring)
├── projects/
│   ├── proj-abc123/
│   │   ├── project.json           ← Project settings
│   │   ├── .agents.json           ← Project-specific agent overrides
│   │   └── memory.db              ← SQLite memory
│   └── proj-def456/
│       └── project.json
├── logs/                          ← Log files
├── backups/                       ← Automatic backups
└── cold/                          ← Archived session data
```

### 1.2 Windows Paths

```
%USERPROFILE%\.mothership\config.json
%USERPROFILE%\.mothership\agents.json
%APPDATA%\Mothership\              ← Alternative location
```

---

## 2. User Preferences (config.json)

### 2.1 Schema

```json
{
  "$schema": "https://mothership.app/schemas/config.json",
  "version": 1,
  "appearance": {
    "theme": "dark",
    "fontSize": 13,
    "fontFamily": "JetBrains Mono",
    "showStatusBar": true,
    "showMemoryPanel": true,
    "panelSizes": {
      "sidebar": 256,
      "memory": 320
    }
  },
  "behavior": {
    "autoSaveInterval": 30,
    "contextCaptureInterval": 30,
    "pauseHiddenTerminals": true,
    "pauseAfterMinutes": 5,
    "startupAction": "last-session",
    "confirmHandoff": true,
    "autoSummarize": true
  },
  "keyboard": {
    "switchAgent": "Cmd+1-9",
    "quickSwitcher": "Cmd+K",
    "newTerminal": "Cmd+T",
    "splitPane": "Cmd+\\",
    "closeTab": "Cmd+W",
    "settings": "Cmd+,"
  },
  "performance": {
    "maxVisibleTerminals": 4,
    "maxScrollbackLines": 10000,
    "memoryLimitMb": 500,
    "enableHardwareAcceleration": true
  },
  "debug": {
    "enabled": false,
    "logLevel": "info",
    "showIpcMessages": false,
    "showPerformanceOverlay": false
  }
}
```

### 2.2 Rust Config Struct

```rust
// src-tauri/src/config/mod.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct UserConfig {
    pub version: u32,
    pub appearance: AppearanceConfig,
    pub behavior: BehaviorConfig,
    pub keyboard: KeyboardConfig,
    pub performance: PerformanceConfig,
    pub debug: DebugConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceConfig {
    pub theme: Theme,
    pub font_size: u32,
    pub font_family: String,
    pub show_status_bar: bool,
    pub show_memory_panel: bool,
    pub panel_sizes: PanelSizes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Theme {
    Dark,
    Light,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelSizes {
    pub sidebar: u32,
    pub memory: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BehaviorConfig {
    pub auto_save_interval: u32,       // seconds
    pub context_capture_interval: u32, // seconds
    pub pause_hidden_terminals: bool,
    pub pause_after_minutes: u32,
    pub startup_action: StartupAction,
    pub confirm_handoff: bool,
    pub auto_summarize: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StartupAction {
    #[serde(rename = "last-session")]
    LastSession,
    #[serde(rename = "new-project")]
    NewProject,
    #[serde(rename = "pick-project")]
    PickProject,
}

impl Default for UserConfig {
    fn default() -> Self {
        Self {
            version: 1,
            appearance: AppearanceConfig {
                theme: Theme::Dark,
                font_size: 13,
                font_family: "JetBrains Mono".into(),
                show_status_bar: true,
                show_memory_panel: true,
                panel_sizes: PanelSizes {
                    sidebar: 256,
                    memory: 320,
                },
            },
            behavior: BehaviorConfig {
                auto_save_interval: 30,
                context_capture_interval: 30,
                pause_hidden_terminals: true,
                pause_after_minutes: 5,
                startup_action: StartupAction::LastSession,
                confirm_handoff: true,
                auto_summarize: true,
            },
            keyboard: KeyboardConfig::default(),
            performance: PerformanceConfig::default(),
            debug: DebugConfig::default(),
        }
    }
}
```

### 2.3 Config Loading & Saving

```rust
impl UserConfig {
    pub fn load(app_dir: &Path) -> Self {
        let config_path = app_dir.join("config.json");

        if config_path.exists() {
            match std::fs::read_to_string(&config_path) {
                Ok(json) => {
                    match serde_json::from_str::<UserConfig>(&json) {
                        Ok(config) => config,
                        Err(e) => {
                            tracing::warn!("Failed to parse config, using defaults: {}", e);
                            Self::default()
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to read config file: {}", e);
                    Self::default()
                }
            }
        } else {
            // First run: create default config
            let config = Self::default();
            config.save(app_dir).ok();
            config
        }
    }

    pub fn save(&self, app_dir: &Path) -> Result<(), ConfigError> {
        let config_path = app_dir.join("config.json");
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| ConfigError::SerializeError(e.to_string()))?;

        // Write atomically (write to temp, then rename)
        let temp_path = config_path.with_extension("json.tmp");
        std::fs::write(&temp_path, &json)?;
        std::fs::rename(&temp_path, &config_path)?;

        Ok(())
    }

    pub fn update(&mut self, app_dir: &Path, updater: impl FnOnce(&mut Self)) -> Result<(), ConfigError> {
        updater(self);
        self.save(app_dir)
    }
}
```

---

## 3. Agent Configuration (agents.json)

### 3.1 Schema

```json
{
  "version": 1,
  "agents": [
    {
      "id": "claude",
      "name": "Claude",
      "type": "local-cli",
      "enabled": true,
      "icon": "anthropic",
      "color": "#c977a0",
      "provider": "anthropic",
      "command": "claude",
      "args": [],
      "env": {},
      "permissions": {
        "level": "full-access",
        "file_access": {
          "readable": ["."],
          "writable": ["."],
          "denied": ["~/.mothership/secrets"]
        },
        "terminal": true,
        "network": false,
        "memory": "read-all"
      },
      "health_check": {
        "command": "claude --version",
        "interval_seconds": 30
      }
    },
    {
      "id": "codex",
      "name": "Codex",
      "type": "local-cli",
      "enabled": true,
      "icon": "openai",
      "color": "#4a9eff",
      "provider": "openai",
      "command": "codex",
      "args": ["--quiet"],
      "env": {},
      "permissions": {
        "level": "full-access",
        "file_access": {
          "readable": ["."],
          "writable": ["."],
          "denied": []
        },
        "terminal": true,
        "network": false,
        "memory": "read-all"
      }
    },
    {
      "id": "chatgpt",
      "name": "ChatGPT",
      "type": "browser",
      "enabled": true,
      "icon": "openai",
      "color": "#10a37f",
      "url": "https://chat.openai.com",
      "permissions": {
        "level": "read-only",
        "file_access": {
          "readable": [],
          "writable": [],
          "denied": []
        },
        "terminal": false,
        "network": true,
        "memory": "own-only"
      }
    },
    {
      "id": "ollama",
      "name": "Ollama",
      "type": "local-model",
      "enabled": true,
      "icon": "ollama",
      "color": "#ffffff",
      "endpoint": "http://localhost:11434",
      "default_model": "llama3.2:3b",
      "permissions": {
        "level": "read-only",
        "file_access": {
          "readable": ["."],
          "writable": [],
          "denied": []
        },
        "terminal": false,
        "network": false,
        "memory": "own-only"
      }
    }
  ]
}
```

### 3.2 Agent Type Definitions

```typescript
// src/types/agent.ts
export type AgentType = 'local-cli' | 'browser' | 'api' | 'local-model';

export interface AgentConfig {
  id: string;
  name: string;
  type: AgentType;
  enabled: boolean;
  icon: string;
  color: string;

  // Type-specific fields
  command?: string;           // local-cli
  args?: string[];            // local-cli
  url?: string;               // browser
  endpoint?: string;          // local-model
  provider?: string;          // api
  default_model?: string;     // local-model

  // Common
  env?: Record<string, string>;
  permissions: AgentPermissions;
  health_check?: HealthCheckConfig;
}

export interface AgentPermissions {
  level: 'read-only' | 'read-write' | 'full-access';
  file_access: FileAccessScope;
  terminal: boolean;
  network: boolean;
  memory: 'own-only' | 'read-all' | 'full-access';
}

export interface FileAccessScope {
  readable: string[];
  writable: string[];
  denied: string[];
}

export interface HealthCheckConfig {
  command?: string;           // CLI health check
  url?: string;               // HTTP health check
  interval_seconds: number;
}
```

### 3.3 Agent Discovery

```rust
// src-tauri/src/agents/discovery.rs
pub struct AgentDiscovery;

impl AgentDiscovery {
    pub fn discover_all() -> Vec<DiscoveredAgent> {
        let mut agents = Vec::new();

        // Check for CLI agents
        agents.extend(Self::discover_cli_agents());

        // Check for Ollama
        agents.extend(Self::discover_ollama());

        // Check for API keys (enables API agents)
        agents.extend(Self::discover_api_agents());

        agents
    }

    fn discover_cli_agents() -> Vec<DiscoveredAgent> {
        let cli_agents = vec![
            ("claude", "claude", "Anthropic Claude"),
            ("codex", "codex", "OpenAI Codex"),
            ("opencode", "opencode", "OpenCode"),
        ];

        cli_agents.into_iter()
            .filter_map(|(id, cmd, name)| {
                which::which(cmd).ok().map(|path| DiscoveredAgent {
                    id: id.into(),
                    name: name.into(),
                    path,
                    available: true,
                })
            })
            .collect()
    }

    fn discover_ollama() -> Vec<DiscoveredAgent> {
        if let Ok(resp) = reqwest::blocking::get("http://localhost:11434/api/tags") {
            if resp.status().is_success() {
                let models: Vec<String> = resp.json().unwrap_or_default();
                return vec![DiscoveredAgent {
                    id: "ollama".into(),
                    name: "Ollama".into(),
                    path: PathBuf::from("ollama"),
                    available: true,
                }];
            }
        }
        vec![]
    }

    fn discover_api_agents() -> Vec<DiscoveredAgent> {
        let store = SecretStore::new();
        let api_agents = vec![
            ("deepseek", "DeepSeek"),
            ("mistral", "Mistral"),
            ("kimi", "Kimi"),
            ("qwen", "Qwen"),
        ];

        api_agents.into_iter()
            .filter_map(|(id, name)| {
                if store.get_key(id).is_ok() {
                    Some(DiscoveredAgent {
                        id: id.into(),
                        name: name.into(),
                        path: PathBuf::new(),
                        available: true,
                    })
                } else {
                    None
                }
            })
            .collect()
    }
}
```

---

## 4. Project Settings (project.json)

### 4.1 Schema

```json
{
  "version": 1,
  "id": "proj-abc123",
  "name": "Mothership",
  "root_path": "E:\\Mother",
  "created_at": "2026-06-15T10:00:00Z",
  "agents": {
    "enabled": ["claude", "codex", "ollama"],
    "default": "claude"
  },
  "context": {
    "capture_interval": 30,
    "auto_summarize": true,
    "retention_days": 30
  },
  "memory": {
    "max_size_mb": 50,
    "cold_storage_after_days": 7,
    "backup_enabled": true
  },
  "tags": ["desktop-app", "tauri", "rust"]
}
```

### 4.2 Project Config Management

```rust
// src-tauri/src/config/project.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub version: u32,
    pub id: String,
    pub name: String,
    pub root_path: PathBuf,
    pub created_at: DateTime<Utc>,
    pub agents: AgentSelection,
    pub context: ContextConfig,
    pub memory: MemoryConfig,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSelection {
    pub enabled: Vec<String>,
    pub default: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextConfig {
    pub capture_interval: u32,
    pub auto_summarize: bool,
    pub retention_days: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryConfig {
    pub max_size_mb: u64,
    pub cold_storage_after_days: u32,
    pub backup_enabled: bool,
}

impl ProjectConfig {
    pub fn create(root_path: PathBuf, name: String) -> Self {
        Self {
            version: 1,
            id: format!("proj-{}", uuid::Uuid::new_v4()),
            name,
            root_path,
            created_at: Utc::now(),
            agents: AgentSelection {
                enabled: vec!["claude".into(), "codex".into()],
                default: "claude".into(),
            },
            context: ContextConfig {
                capture_interval: 30,
                auto_summarize: true,
                retention_days: 30,
            },
            memory: MemoryConfig {
                max_size_mb: 50,
                cold_storage_after_days: 7,
                backup_enabled: true,
            },
            tags: vec![],
        }
    }

    pub fn load(project_dir: &Path) -> Result<Self, ConfigError> {
        let config_path = project_dir.join("project.json");
        let content = std::fs::read_to_string(&config_path)?;
        Ok(serde_json::from_str(&content)?)
    }

    pub fn save(&self, project_dir: &Path) -> Result<(), ConfigError> {
        let config_path = project_dir.join("project.json");
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(&config_path, json)?;
        Ok(())
    }
}
```

---

## 5. Settings UI

### 5.1 Settings Panel Structure

```tsx
// src/components/settings/SettingsPanel.tsx
const SettingsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState('appearance');

  return (
    <Dialog>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="keyboard">Keyboard</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="appearance">
            <AppearanceSettings />
          </TabsContent>
          <TabsContent value="agents">
            <AgentSettings />
          </TabsContent>
          <TabsContent value="projects">
            <ProjectSettings />
          </TabsContent>
          <TabsContent value="keyboard">
            <KeyboardSettings />
          </TabsContent>
          <TabsContent value="advanced">
            <AdvancedSettings />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
```

### 5.2 Appearance Settings

```tsx
const AppearanceSettings: React.FC = () => {
  const [config, setConfig] = useConfig();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Theme</Label>
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as const).map(theme => (
            <Button
              key={theme}
              variant={config.appearance.theme === theme ? 'default' : 'outline'}
              onClick={() => setConfig(c => ({
                ...c,
                appearance: { ...c.appearance, theme }
              }))}
            >
              {theme.charAt(0).toUpperCase() + theme.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Font Size: {config.appearance.fontSize}px</Label>
        <Slider
          value={[config.appearance.fontSize]}
          onValueChange={([v]) => setConfig(c => ({
            ...c,
            appearance: { ...c.appearance, fontSize: v }
          }))}
          min={10}
          max={20}
          step={1}
        />
      </div>

      <div className="space-y-2">
        <Label>Font Family</Label>
        <Select
          value={config.appearance.fontFamily}
          onValueChange={v => setConfig(c => ({
            ...c,
            appearance: { ...c.appearance, fontFamily: v }
          }))}
        >
          <SelectItem value="JetBrains Mono">JetBrains Mono</SelectItem>
          <SelectItem value="Fira Code">Fira Code</SelectItem>
          <SelectItem value="Source Code Pro">Source Code Pro</SelectItem>
          <SelectItem value="Consolas">Consolas</SelectItem>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Show Status Bar</Label>
          <Switch
            checked={config.appearance.showStatusBar}
            onCheckedChange={v => setConfig(c => ({
              ...c,
              appearance: { ...c.appearance, showStatusBar: v }
            }))}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label>Show Memory Panel</Label>
          <Switch
            checked={config.appearance.showMemoryPanel}
            onCheckedChange={v => setConfig(c => ({
              ...c,
              appearance: { ...c.appearance, showMemoryPanel: v }
            }))}
          />
        </div>
      </div>
    </div>
  );
};
```

---

## 6. Config Migration

### 6.1 Version-Based Migration

```rust
impl UserConfig {
    pub fn load_with_migration(app_dir: &Path) -> Self {
        let config_path = app_dir.join("config.json");

        if !config_path.exists() {
            return Self::default();
        }

        let content = std::fs::read_to_string(&config_path).unwrap_or_default();

        // Parse as generic JSON to check version
        let mut json: serde_json::Value = serde_json::from_str(&content)
            .unwrap_or(serde_json::Value::Null);

        let version = json.get("version")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;

        // Apply migrations in order
        if version < 1 {
            json = Self::migrate_v0_to_v1(json);
        }
        if version < 2 {
            json = Self::migrate_v1_to_v2(json);
        }
        // Future migrations here...

        // Parse final version
        serde_json::from_value(json).unwrap_or_default()
    }

    fn migrate_v0_to_v1(mut json: serde_json::Value) -> serde_json::Value {
        // Add new fields with defaults
        if let Some(appearance) = json.get_mut("appearance") {
            if appearance.get("fontFamily").is_none() {
                appearance["fontFamily"] = serde_json::json!("JetBrains Mono");
            }
        }
        json["version"] = serde_json::json!(1);
        json
    }
}
```

---

## Implementation Checklist

- [ ] UserConfig struct with defaults
- [ ] AgentConfig schema (JSON)
- [ ] ProjectConfig struct
- [ ] Config file loading with migration
- [ ] Config file saving (atomic write)
- [ ] Agent discovery (CLI, Ollama, API)
- [ ] Settings UI panel (5 tabs)
- [ ] Theme switching (light/dark/system)
- [ ] Keyboard shortcut customization
- [ ] Performance config (memory limits, terminal limits)
- [ ] Debug mode toggle
- [ ] Config validation (JSON Schema)
- [ ] Config export/import
