# Mothership — Monitoring & Observability

**Last Updated:** 2026-06-15
**Status:** Final Draft
**Scope:** Cross-cutting concern applicable to Phase 2+

---

## Overview

Mothership runs multiple processes (Rust backend, React frontend, Python sidecars, PTY terminals). Without observability, debugging production issues is guesswork. This document defines how to monitor health, track performance, and diagnose failures across all components.

**Three Pillars:**
1. **Logging** — What happened and when
2. **Metrics** — How much, how fast, how often
3. **Tracing** — How a request flows through the system

**Related Documents:**
- [`ERROR-HANDLING.md`](./ERROR-HANDLING.md) — Crash reporting feeds into monitoring; error detection triggers alerts
- [`SECURITY.md`](./SECURITY.md) — Audit logging for security events
- [`CONFIGURATION.md`](./CONFIGURATION.md) — Debug mode settings, log level configuration
- [`OFFLINE-BEHAVIOR.md`](./OFFLINE-BEHAVIOR.md) — Network status monitoring, connectivity checks

---

## 1. Logging Architecture

### 1.1 Log Levels

| Level | When to Use | Example |
|---|---|---|
| `ERROR` | Something broke, needs attention | Sidecar crashed, DB corruption |
| `WARN` | Something unexpected but recoverable | Slow inference, retry succeeded |
| `INFO` | Normal operations worth recording | Agent started, handoff completed |
| `DEBUG` | Detailed operational data | IPC message sent, PTY output chunk |
| `TRACE` | Extremely verbose, off by default | Raw PTY bytes, full SQL queries |

### 1.2 Log Format

**Structured JSON** for machine parsing:
```json
{
  "ts": "2026-06-15T10:30:22.123Z",
  "level": "INFO",
  "component": "sidecar-manager",
  "module": "crewai",
  "message": "Handoff completed",
  "context": {
    "from_agent": "claude",
    "to_agent": "codex",
    "duration_ms": 342,
    "summary_length": 287,
    "session_id": "sess-abc123"
  },
  "trace_id": "trc-xyz789"
}
```

**Human-readable** for terminal (dev mode):
```
[10:30:22] INFO  sidecar-manager/crewai  Handoff completed
            from=claude to=codex duration=342ms summary_len=287
```

### 1.3 Rust Logging Setup

```rust
// src-tauri/src/logging.rs
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub fn init_logging(app_dir: &Path) {
    // Log file: ~/.mothership/logs/mothership.log (rotated daily)
    let log_dir = app_dir.join("logs");
    std::fs::create_dir_all(&log_dir).ok();

    let file_appender = tracing_appender::rolling::daily(&log_dir, "mothership.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    // Keep _guard alive for the app lifetime
    std::mem::forget(_guard);

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new("info")))
        .with(fmt::layer()
            .with_writer(std::io::stdout)
            .with_target(true)
            .with_ansi(true))
        .with(fmt::layer()
            .with_writer(non_blocking)
            .with_target(true)
            .with_ansi(false)
            .json())
        .init();
}
```

### 1.4 Frontend Logging

```typescript
// src/lib/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;
  level: LogLevel;
  component: string;
  message: string;
  context?: Record<string, unknown>;
}

class Logger {
  private buffer: LogEntry[] = [];
  private flushInterval: ReturnType<typeof setInterval>;

  constructor() {
    // Flush logs to backend every 5 seconds
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  private log(level: LogLevel, component: string, message: string, context?: Record<string, unknown>) {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      component,
      message,
      context,
    };

    this.buffer.push(entry);

    // Also console output in dev
    if (import.meta.env.DEV) {
      console[level](`[${component}] ${message}`, context ?? '');
    }

    // Immediate flush for errors
    if (level === 'error') {
      this.flush();
    }
  }

  debug(component: string, message: string, context?: Record<string, unknown>) {
    this.log('debug', component, message, context);
  }

  info(component: string, message: string, context?: Record<string, unknown>) {
    this.log('info', component, message, context);
  }

  warn(component: string, message: string, context?: Record<string, unknown>) {
    this.log('warn', component, message, context);
  }

  error(component: string, message: string, context?: Record<string, unknown>) {
    this.log('error', component, message, context);
  }

  private async flush() {
    if (this.buffer.length === 0) return;

    const entries = this.buffer.splice(0);
    try {
      await invoke('write_logs', { entries });
    } catch {
      // Don't let logging failures crash the app
      console.error('Failed to flush logs');
    }
  }
}

export const logger = new Logger();
```

### 1.5 Python Sidecar Logging

```python
# sidecars/shared/logging.py
import logging
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

class StructuredFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "component": "sidecar",
            "module": record.name,
            "message": record.getMessage(),
        }
        if hasattr(record, 'context'):
            log_entry["context"] = record.context
        return json.dumps(log_entry)

def setup_logging(name: str, log_dir: Path, level: str = "INFO"):
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"{name}.log"

    handler = logging.handlers.RotatingFileHandler(
        log_file, maxBytes=10*1024*1024, backupCount=5
    )
    handler.setFormatter(StructuredFormatter())

    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(logging.Formatter(
        f'[%(asctime)s] %(levelname)s {name}/%(name)s  %(message)s'
    ))

    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level))
    logger.addHandler(handler)
    logger.addHandler(stdout_handler)

    return logger
```

---

## 2. Health Check System

### 2.1 Component Health Endpoints

Each sidecar exposes a `/health` endpoint:

```python
# sidecars/shared/health.py
from fastapi import FastAPI
from pydantic import BaseModel
import psutil
import time

app = FastAPI()
start_time = time.time()

class HealthResponse(BaseModel):
    status: str  # "healthy" | "degraded" | "unhealthy"
    uptime_secs: float
    memory_mb: float
    cpu_percent: float
    details: dict

@app.get("/health", response_model=HealthResponse)
async def health_check():
    process = psutil.Process()
    mem = process.memory_info()
    cpu = process.cpu_percent(interval=0.1)

    # Determine health status
    status = "healthy"
    details = {}

    if mem.rss / 1024 / 1024 > 500:
        status = "degraded"
        details["warning"] = "High memory usage"

    if cpu > 90:
        status = "degraded"
        details["warning"] = "High CPU usage"

    return HealthResponse(
        status=status,
        uptime_secs=time.time() - start_time,
        memory_mb=mem.rss / 1024 / 1024,
        cpu_percent=cpu,
        details=details,
    )
```

### 2.2 Rust Health Monitor

```rust
// src-tauri/src/monitor/health.rs
pub struct HealthMonitor {
    components: HashMap<String, ComponentHealth>,
    check_interval: Duration,
}

struct ComponentHealth {
    name: String,
    status: HealthStatus,
    last_check: DateTime<Utc>,
    last_healthy: Option<DateTime<Utc>>,
    check_count: u64,
    failure_count: u64,
    avg_response_ms: f64,
}

enum HealthStatus {
    Healthy,
    Degraded { reason: String },
    Unhealthy { reason: String },
    Unknown,
}

impl HealthMonitor {
    pub async fn check_all(&self) -> SystemHealth {
        let mut results = Vec::new();

        // Check each sidecar
        for (name, _) in &self.components {
            let health = self.check_component(name).await;
            results.push(health);
        }

        // Check SQLite
        results.push(self.check_database().await);

        // Check Ollama
        results.push(self.check_ollama().await);

        // Check system resources
        results.push(self.check_system_resources().await);

        SystemHealth {
            overall: self.determine_overall_status(&results),
            components: results,
            checked_at: Utc::now(),
        }
    }

    async fn check_component(&self, name: &str) -> ComponentHealthReport {
        let start = Instant::now();
        let result = self.http_get(&format!("http://localhost:{}/health", self.port(name))).await;
        let duration = start.elapsed().as_millis() as f64;

        match result {
            Ok(health) => ComponentHealthReport {
                name: name.into(),
                status: health.status,
                response_ms: duration,
                memory_mb: health.memory_mb,
                cpu_percent: health.cpu_percent,
                uptime_secs: health.uptime_secs,
            },
            Err(e) => ComponentHealthReport {
                name: name.into(),
                status: HealthStatus::Unhealthy {
                    reason: e.to_string()
                },
                response_ms: duration,
                memory_mb: 0.0,
                cpu_percent: 0.0,
                uptime_secs: 0.0,
            },
        }
    }
}
```

### 2.3 Health Dashboard (UI)

```tsx
// src/components/monitoring/HealthDashboard.tsx
const HealthDashboard: React.FC = () => {
  const { data: health, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: () => invoke<SystemHealth>('get_system_health'),
    refetchInterval: 10_000, // Check every 10s
  });

  if (!health) return <Skeleton />;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">System Health</h2>
        <Badge variant={health.overall === 'healthy' ? 'success' : 'error'}>
          {health.overall.toUpperCase()}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {health.components.map(component => (
          <HealthCard key={component.name} component={component} />
        ))}
      </div>

      <div className="text-xs text-zinc-500">
        Last checked: {new Date(health.checked_at).toLocaleTimeString()}
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-2">
          Refresh
        </Button>
      </div>
    </div>
  );
};

const HealthCard: React.FC<{ component: ComponentHealthReport }> = ({ component }) => {
  const statusColors = {
    healthy: 'border-green-500',
    degraded: 'border-yellow-500',
    unhealthy: 'border-red-500',
    unknown: 'border-zinc-500',
  };

  return (
    <div className={`border-l-4 ${statusColors[component.status]} bg-zinc-900 rounded-r-lg p-4`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium">{component.name}</h3>
        <StatusDot status={component.status} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm text-zinc-400">
        <div>Memory: {component.memory_mb.toFixed(1)} MB</div>
        <div>CPU: {component.cpu_percent.toFixed(1)}%</div>
        <div>Response: {component.response_ms.toFixed(0)}ms</div>
        <div>Uptime: {formatDuration(component.uptime_secs)}</div>
      </div>
    </div>
  );
};
```

---

## 3. Performance Metrics

### 3.1 Metrics Collection

```rust
// src-tauri/src/monitor/metrics.rs
pub struct MetricsCollector {
    ipc_latencies: Vec<f64>,
    db_write_latencies: Vec<f64>,
    handoff_durations: Vec<f64>,
    terminal_switch_times: Vec<f64>,
    memory_snapshots: Vec<MemorySnapshot>,
}

struct MemorySnapshot {
    timestamp: DateTime<Utc>,
    total_mb: u64,
    rust_mb: u64,
    python_mb: u64,
    terminal_mb: u64,
    frontend_mb: u64,
}

impl MetricsCollector {
    pub fn record_ipc_latency(&mut self, command: &str, duration_ms: f64) {
        self.ipc_latencies.push(duration_ms);

        // Keep only last 1000 measurements
        if self.ipc_latencies.len() > 1000 {
            self.ipc_latencies.drain(0..500);
        }

        // Alert if consistently slow
        if self.ipc_latencies.len() >= 10 {
            let avg: f64 = self.ipc_latencies.iter().sum::<f64>()
                / self.ipc_latencies.len() as f64;
            if avg > 500.0 {
                tracing::warn!(
                    command = command,
                    avg_ms = avg,
                    "IPC latency above threshold"
                );
            }
        }
    }

    pub fn record_handoff_duration(&mut self, duration_ms: f64) {
        self.handoff_durations.push(duration_ms);

        if duration_ms > 500.0 {
            tracing::warn!(
                duration_ms = duration_ms,
                "Handoff exceeded 500ms target"
            );
        }
    }

    pub fn snapshot_memory(&mut self) {
        let snapshot = MemorySnapshot {
            timestamp: Utc::now(),
            total_mb: get_total_memory_mb(),
            rust_mb: get_rust_process_memory_mb(),
            python_mb: get_python_sidecar_memory_mb(),
            terminal_mb: get_terminal_memory_mb(),
            frontend_mb: get_frontend_memory_mb(),
        };
        self.memory_snapshots.push(snapshot);
    }

    pub fn get_summary(&self) -> MetricsSummary {
        MetricsSummary {
            ipc: LatencyStats {
                p50: percentile(&self.ipc_latencies, 50.0),
                p95: percentile(&self.ipc_latencies, 95.0),
                p99: percentile(&self.ipc_latencies, 99.0),
                count: self.ipc_latencies.len(),
            },
            handoff: LatencyStats {
                p50: percentile(&self.handoff_durations, 50.0),
                p95: percentile(&self.handoff_durations, 95.0),
                p99: percentile(&self.handoff_durations, 99.0),
                count: self.handoff_durations.len(),
            },
            memory: MemoryStats {
                current_mb: self.memory_snapshots.last().map(|s| s.total_mb).unwrap_or(0),
                peak_mb: self.memory_snapshots.iter().map(|s| s.total_mb).max().unwrap_or(0),
                avg_mb: self.memory_snapshots.iter().map(|s| s.total_mb).sum::<u64>()
                    / self.memory_snapshots.len().max(1) as u64,
            },
        }
    }
}
```

### 3.2 Performance Targets

| Metric | Target | Warning | Critical |
|---|---|---|---|
| Idle RAM | < 200MB | 250MB | 350MB |
| Active RAM (1 terminal) | < 300MB | 400MB | 500MB |
| Handoff latency | < 500ms | 1000ms | 3000ms |
| Terminal switch | < 200ms | 500ms | 1000ms |
| IPC latency (p95) | < 100ms | 200ms | 500ms |
| Memory write | < 50ms | 100ms | 200ms |
| FTS5 search | < 100ms | 200ms | 500ms |
| Cold start | < 3s | 5s | 10s |
| Ollama summary | < 3s | 5s | 10s |

### 3.3 Performance Dashboard (UI)

```tsx
// src/components/monitoring/PerformancePanel.tsx
const PerformancePanel: React.FC = () => {
  const { data: metrics } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => invoke<MetricsSummary>('get_metrics'),
    refetchInterval: 5_000,
  });

  if (!metrics) return <Skeleton />;

  return (
    <div className="space-y-4 p-4">
      <h3 className="font-semibold">Performance</h3>

      {/* Memory Usage Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Memory Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <MemoryChart data={metrics.memory.history} />
          <div className="flex justify-between text-xs text-zinc-400 mt-2">
            <span>Current: {metrics.memory.current_mb}MB</span>
            <span>Peak: {metrics.memory.peak_mb}MB</span>
            <span>Avg: {metrics.memory.avg_mb}MB</span>
          </div>
        </CardContent>
      </Card>

      {/* Latency Stats */}
      <div className="grid grid-cols-2 gap-4">
        <LatencyCard title="IPC Latency" stats={metrics.ipc} unit="ms" />
        <LatencyCard title="Handoff Duration" stats={metrics.handoff} unit="ms" />
      </div>
    </div>
  );
};
```

---

## 4. Crash Reporting

### 4.1 Crash Report Collection

```rust
// src-tauri/src/monitor/crash.rs
use std::panic;

pub fn setup_crash_handler(app_dir: &Path) {
    let crash_dir = app_dir.join("crash_reports");
    std::fs::create_dir_all(&crash_dir).ok();

    panic::set_hook(Box::new(move |info| {
        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let crash_file = crash_dir.join(format!("crash_{}.json", timestamp));

        let report = CrashReport {
            timestamp: Utc::now(),
            panic_info: info.to_string(),
            backtrace: std::backtrace::Backtrace::force_capture().to_string(),
            system_info: SystemInfo::collect(),
            recent_logs: get_recent_logs(100),
        };

        let json = serde_json::to_string_pretty(&report).unwrap_or_default();
        std::fs::write(&crash_file, json).ok();

        // Also try to write a minimal crash marker for the next launch
        std::fs::write(
            app_dir.join("crash_marker"),
            format!("Crashed at {}\nPanic: {}", Utc::now(), info),
        ).ok();
    }));
}

#[derive(Serialize)]
struct CrashReport {
    timestamp: DateTime<Utc>,
    panic_info: String,
    backtrace: String,
    system_info: SystemInfo,
    recent_logs: Vec<String>,
}

#[derive(Serialize)]
struct SystemInfo {
    os: String,
    os_version: String,
    app_version: String,
    total_ram_mb: u64,
    used_ram_mb: u64,
    cpu_cores: u32,
    rust_version: String,
}

impl SystemInfo {
    fn collect() -> Self {
        Self {
            os: std::env::consts::OS.to_string(),
            os_version: os_info::get().version().to_string(),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            total_ram_mb: sys_info::mem_info().map(|m| m.total / 1024).unwrap_or(0),
            used_ram_mb: sys_info::mem_info().map(|m| m.used / 1024).unwrap_or(0),
            cpu_cores: num_cpus::get() as u32,
            rust_version: env!("CARGO_PKG_RUST_VERSION", "unknown").to_string(),
        }
    }
}
```

### 4.2 Crash Report UI

```tsx
// On next launch, check for crash marker and show recovery dialog
const CrashRecoveryDialog: React.FC = () => {
  const [showCrashDialog, setShowCrashDialog] = useState(false);
  const [crashInfo, setCrashInfo] = useState<string | null>(null);

  useEffect(() => {
    invoke('check_crash_marker').then((marker) => {
      if (marker) {
        setCrashInfo(marker);
        setShowCrashDialog(true);
      }
    });
  }, []);

  if (!showCrashDialog) return null;

  return (
    <Dialog open={showCrashDialog} onOpenChange={setShowCrashDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mothership crashed unexpectedly</DialogTitle>
          <DialogDescription>
            A crash report has been saved. Would you like to review it?
          </DialogDescription>
        </DialogHeader>
        <pre className="text-xs bg-zinc-900 p-4 rounded overflow-auto max-h-40">
          {crashInfo}
        </pre>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCrashDialog(false)}>
            Dismiss
          </Button>
          <Button onClick={() => invoke('open_crash_report')}>
            View Full Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

---

## 5. Debug Mode

### 5.1 Enabling Debug Mode

```typescript
// Settings panel toggle
const DebugSettings: React.FC = () => {
  const [debugMode, setDebugMode] = useSetting('debugMode', false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">Debug Mode</p>
          <p className="text-sm text-zinc-400">
            Shows detailed logs and performance metrics in the UI
          </p>
        </div>
        <Switch checked={debugMode} onCheckedChange={setDebugMode} />
      </div>

      {debugMode && (
        <div className="space-y-2 pl-4 border-l-2 border-zinc-700">
          <div className="flex items-center justify-between">
            <span className="text-sm">Log level</span>
            <Select defaultValue="debug">
              <SelectItem value="trace">Trace</SelectItem>
              <SelectItem value="debug">Debug</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Show IPC messages</span>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Show PTY raw output</span>
            <Switch />
          </div>
        </div>
      )}
    </div>
  );
};
```

### 5.2 Debug Overlay

```tsx
// When debug mode is on, show a performance overlay
const DebugOverlay: React.FC = () => {
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      const m = await invoke<LiveMetrics>('get_live_metrics');
      setMetrics(m);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!metrics) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white text-xs p-3 rounded-lg font-mono space-y-1 z-50">
      <div>RAM: {metrics.memory_mb}MB</div>
      <div>CPU: {metrics.cpu_percent}%</div>
      <div>IPC: {metrics.ipc_latency_ms}ms</div>
      <div>Terminals: {metrics.active_terminals}</div>
      <div>Sidecars: {metrics.running_sidecars}</div>
    </div>
  );
};
```

---

## 6. Log File Management

### 6.1 Rotation Policy

```
~/.mothership/logs/
├── mothership.log              ← Current day
├── mothership.log.2026-06-14   ← Yesterday
├── mothership.log.2026-06-13   ← 2 days ago
├── ...
├── mothership.log.2026-05-16   ← 30 days ago (oldest kept)
│
├── sidecar_crewai.log          ← CrewAI sidecar (rotated daily, 7 day retention)
├── sidecar_openhands.log       ← OpenHands sidecar
├── sidecar_summary.log         ← Summary engine
│
├── crash_reports/              ← Crash dumps
│   ├── crash_20260615_103022.json
│   └── crash_20260614_084512.json
│
└── performance/                ← Metrics CSVs
    ├── memory_usage.csv
    └── ipc_latency.csv
```

### 6.2 Cleanup

```rust
pub fn cleanup_old_logs(log_dir: &Path, retention_days: u32) {
    let cutoff = Utc::now() - chrono::Duration::days(retention_days as i64);

    if let Ok(entries) = std::fs::read_dir(log_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Ok(metadata) = path.metadata() {
                if let Ok(modified) = metadata.modified() {
                    let modified_dt: DateTime<Utc> = modified.into();
                    if modified_dt < cutoff {
                        let _ = std::fs::remove_file(&path);
                    }
                }
            }
        }
    }
}
```

---

## 7. Alert System

### 7.1 In-App Alerts

```typescript
// src/lib/alerts.ts
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  component: string;
  timestamp: Date;
  actions?: AlertAction[];
}

export class AlertManager {
  private alerts: Alert[] = [];
  private listeners: ((alerts: Alert[]) => void)[] = [];

  emit(alert: Omit<Alert, 'id' | 'timestamp'>) {
    const fullAlert: Alert = {
      ...alert,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };

    this.alerts.push(fullAlert);
    this.listeners.forEach(fn => fn([...this.alerts]));

    // Auto-dismiss info alerts after 10s
    if (alert.severity === 'info') {
      setTimeout(() => this.dismiss(fullAlert.id), 10_000);
    }

    // Log critical alerts
    if (alert.severity === 'critical') {
      logger.error(alert.component, alert.message, { alert: fullAlert });
    }
  }

  dismiss(id: string) {
    this.alerts = this.alerts.filter(a => a.id !== id);
    this.listeners.forEach(fn => fn([...this.alerts]));
  }
}

export const alerts = new AlertManager();
```

### 7.2 Alert Conditions

| Condition | Severity | Auto-dismiss |
|---|---|---|
| Sidecar crashed | `error` | No — user must acknowledge |
| Sidecar restarting | `warning` | Yes — after 30s |
| Memory > 300MB | `warning` | No |
| Memory > 500MB | `critical` | No |
| Handoff failed | `error` | No |
| Handoff slow (>1s) | `warning` | Yes — after 10s |
| Ollama not available | `info` | Yes — after 10s |
| API key invalid | `error` | No |
| Network lost | `warning` | Yes — auto-resolve |
| Debug mode enabled | `info` | Yes — after 5s |

---

## Implementation Checklist

- [ ] Rust logging setup with tracing-subscriber
- [ ] Frontend logger with buffer and flush
- [ ] Python sidecar structured logging
- [ ] Health check endpoint for each sidecar
- [ ] Rust health monitor with periodic checks
- [ ] Health dashboard UI component
- [ ] Metrics collector (IPC, handoff, memory)
- [ ] Performance targets and alerts
- [ ] Crash handler with report generation
- [ ] Crash recovery dialog on next launch
- [ ] Debug mode toggle in settings
- [ ] Debug overlay for live metrics
- [ ] Log rotation (daily, 30-day retention)
- [ ] Alert manager with severity levels
- [ ] Alert conditions and auto-dismiss rules
