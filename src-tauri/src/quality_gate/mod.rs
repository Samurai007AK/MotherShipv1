// src-tauri/src/quality_gate/mod.rs
//
// Quality Gate — Pre-commit validation system.
// Canonical type definitions live in PLANS/MOTHERSHIP-RALPH-GLOSSARY.md.
//
// GateResult = per-gate result with parsed errors (this module)
// QualityGateSummary = simplified summary for LoopController (loop_controller module)
// QualityGateReport = combined result containing Vec<GateResult>

pub mod commit_guard;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Full quality gate configuration with per-gate control.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityGateConfig {
    pub typecheck: Option<GateCommand>,
    pub test: Option<GateCommand>,
    pub lint: Option<GateCommand>,
    pub build: Option<GateCommand>,
    pub custom: Vec<GateCommand>,
    pub timeout_seconds: u64,
    pub fail_fast: bool,
    pub parallel: bool,
}

impl Default for QualityGateConfig {
    fn default() -> Self {
        Self {
            typecheck: None,
            test: None,
            lint: None,
            build: None,
            custom: Vec::new(),
            timeout_seconds: 120,
            fail_fast: true,
            parallel: false,
        }
    }
}

/// Configuration for a single quality gate command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateCommand {
    pub id: String,
    pub name: String,
    pub command: String,
    pub working_directory: Option<String>,
    pub env_vars: HashMap<String, String>,
    pub enabled: bool,
    pub blocking: bool,
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/// Result of running a single quality gate command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateResult {
    pub gate_id: String,
    pub gate_name: String,
    pub passed: bool,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub completed_at: chrono::DateTime<chrono::Utc>,
    pub error_message: Option<String>,
    pub parsed_errors: Vec<ParsedError>,
}

/// A structured error parsed from gate output.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedError {
    pub file: String,
    pub line: usize,
    pub column: usize,
    pub message: String,
    pub severity: ErrorSeverity,
    pub code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorSeverity {
    Error,
    Warning,
    Info,
}

/// Combined result of all quality gates in a single run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityGateReport {
    pub id: String,
    pub loop_id: Option<String>,
    pub passed: bool,
    pub results: Vec<GateResult>,
    pub total_duration_ms: u64,
    pub gates_passed: usize,
    pub gates_failed: usize,
    pub gates_skipped: usize,
    pub commit_allowed: bool,
    pub summary: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum QualityGateError {
    #[error("Gate timeout: {gate_id} exceeded {timeout_seconds}s")]
    Timeout {
        gate_id: String,
        timeout_seconds: u64,
    },

    #[error("Command execution failed for {gate_id}: {error}")]
    CommandExecution { gate_id: String, error: String },

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Regex error: {0}")]
    Regex(#[from] regex::Error),
}

// ---------------------------------------------------------------------------
// QualityGate controller
// ---------------------------------------------------------------------------

/// Quality gate controller that runs validation commands before commits.
pub struct QualityGate {
    config: QualityGateConfig,
    project_path: PathBuf,
}

impl QualityGate {
    pub fn new(config: QualityGateConfig, project_path: &Path) -> Self {
        Self {
            config,
            project_path: project_path.to_path_buf(),
        }
    }

    /// Auto-detect quality gate configuration from project files.
    pub fn auto_detect(project_path: &Path) -> Self {
        let config = detect_project_config(project_path);
        Self::new(config, project_path)
    }

    /// Run all enabled quality gates and return the report.
    pub async fn run_all(&self) -> Result<QualityGateReport, QualityGateError> {
        let start = Instant::now();
        let mut results = Vec::new();

        let gates = self.enabled_gates();

        for gate in gates {
            let result = self.run_gate(&gate).await?;

            if !result.passed && self.config.fail_fast {
                results.push(result);
                break;
            }

            results.push(result);
        }

        let total_ms = start.elapsed().as_millis() as u64;
        let gates_passed = results.iter().filter(|r| r.passed).count();
        let gates_failed = results.iter().filter(|r| !r.passed).count();
        let passed = gates_failed == 0;

        let summary = if passed {
            format!("All {} quality gates passed", gates_passed)
        } else {
            let names: Vec<&str> = results
                .iter()
                .filter(|r| !r.passed)
                .map(|r| r.gate_name.as_str())
                .collect();
            format!("Failed gates: {}", names.join(", "))
        };

        Ok(QualityGateReport {
            id: uuid::Uuid::new_v4().to_string(),
            loop_id: None,
            passed,
            results,
            total_duration_ms: total_ms,
            gates_passed,
            gates_failed,
            gates_skipped: 0,
            commit_allowed: passed,
            summary,
            timestamp: chrono::Utc::now(),
        })
    }

    /// Run a single gate command.
    async fn run_gate(&self, gate: &GateCommand) -> Result<GateResult, QualityGateError> {
        let started_at = chrono::Utc::now();
        let start = Instant::now();

        let work_dir = match &gate.working_directory {
            Some(dir) => self.project_path.join(dir),
            None => self.project_path.clone(),
        };

        let mut cmd = if cfg!(target_os = "windows") {
            let mut cmd = tokio::process::Command::new("cmd");
            cmd.args(["/C", &gate.command]);
            cmd
        } else {
            let mut cmd = tokio::process::Command::new("sh");
            cmd.args(["-c", &gate.command]);
            cmd
        };
        cmd.current_dir(&work_dir);

        for (key, value) in &gate.env_vars {
            cmd.env(key, value);
        }

        let timeout = Duration::from_secs(self.config.timeout_seconds);
        let output = tokio::time::timeout(timeout, cmd.output())
            .await
            .map_err(|_| QualityGateError::Timeout {
                gate_id: gate.id.clone(),
                timeout_seconds: self.config.timeout_seconds,
            })?
            .map_err(|e| QualityGateError::CommandExecution {
                gate_id: gate.id.clone(),
                error: e.to_string(),
            })?;

        let duration_ms = start.elapsed().as_millis() as u64;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);
        let passed = output.status.success();

        let parsed_errors = if !passed {
            parse_errors(&gate.id, &stdout, &stderr)
        } else {
            Vec::new()
        };

        Ok(GateResult {
            gate_id: gate.id.clone(),
            gate_name: gate.name.clone(),
            passed,
            exit_code,
            stdout,
            stderr,
            duration_ms,
            started_at,
            completed_at: chrono::Utc::now(),
            error_message: if !passed {
                Some(format!("Gate '{}' failed with exit code {}", gate.name, exit_code))
            } else {
                None
            },
            parsed_errors,
        })
    }

    fn enabled_gates(&self) -> Vec<GateCommand> {
        let mut gates = Vec::new();
        for gate in [
            self.config.typecheck.as_ref(),
            self.config.test.as_ref(),
            self.config.lint.as_ref(),
            self.config.build.as_ref(),
        ] {
            if let Some(g) = gate {
                if g.enabled {
                    gates.push(g.clone());
                }
            }
        }
        for g in &self.config.custom {
            if g.enabled {
                gates.push(g.clone());
            }
        }
        gates
    }
}

// ---------------------------------------------------------------------------
// Error parsing
// ---------------------------------------------------------------------------

fn parse_errors(gate_id: &str, stdout: &str, stderr: &str) -> Vec<ParsedError> {
    let output = format!("{}\n{}", stdout, stderr);
    match gate_id {
        "typecheck" => parse_typecheck_errors(&output),
        "test" => parse_test_errors(&output),
        "lint" => parse_lint_errors(&output),
        _ => parse_generic_errors(&output),
    }
}

fn parse_typecheck_errors(output: &str) -> Vec<ParsedError> {
    let mut errors = Vec::new();

    // TypeScript: error TS2322: Type 'string' ... at file.ts:10:5
    let ts_re = regex::Regex::new(r"(?m)error (TS\d+): (.+)\n\s+at (.+):(\d+):(\d+)").unwrap();
    for cap in ts_re.captures_iter(output) {
        errors.push(ParsedError {
            file: cap[3].to_string(),
            line: cap[4].parse().unwrap_or(0),
            column: cap[5].parse().unwrap_or(0),
            message: cap[2].to_string(),
            severity: ErrorSeverity::Error,
            code: Some(cap[1].to_string()),
        });
    }

    // Rust: error[E0308]: ... --> file.rs:10:5
    let rust_re =
        regex::Regex::new(r"(?m)error\[(E\d+)\]: (.+)\n\s+-->\s+(.+):(\d+):(\d+)").unwrap();
    for cap in rust_re.captures_iter(output) {
        errors.push(ParsedError {
            file: cap[3].to_string(),
            line: cap[4].parse().unwrap_or(0),
            column: cap[5].parse().unwrap_or(0),
            message: cap[2].to_string(),
            severity: ErrorSeverity::Error,
            code: Some(cap[1].to_string()),
        });
    }

    // Python: file.py:10:5: error: message [code]
    let py_re =
        regex::Regex::new(r"(?m)(.+):(\d+):(\d+): error: (.+) \[(.+)\]").unwrap();
    for cap in py_re.captures_iter(output) {
        errors.push(ParsedError {
            file: cap[1].to_string(),
            line: cap[2].parse().unwrap_or(0),
            column: cap[3].parse().unwrap_or(0),
            message: cap[4].to_string(),
            severity: ErrorSeverity::Error,
            code: Some(cap[5].to_string()),
        });
    }

    errors
}

fn parse_test_errors(output: &str) -> Vec<ParsedError> {
    let mut errors = Vec::new();

    // pytest: FAILED test_file.py::test_name - message
    let pytest_re = regex::Regex::new(r"(?m)FAILED\s+(.+)::(.+)\s+-\s+(.+)").unwrap();
    for cap in pytest_re.captures_iter(output) {
        errors.push(ParsedError {
            file: cap[1].to_string(),
            line: 0,
            column: 0,
            message: format!("Test {} failed: {}", cap[2].trim(), cap[3].trim()),
            severity: ErrorSeverity::Error,
            code: None,
        });
    }

    errors
}

fn parse_lint_errors(output: &str) -> Vec<ParsedError> {
    let mut errors = Vec::new();

    // ESLint: file.ts:10:5: error - message [code]
    let eslint_re = regex::Regex::new(
        r"(?m)(.+):(\d+):(\d+):\s+(error|warning)\s+-\s+(.+?)(?:\s+\[(.+)\])?$",
    )
    .unwrap();
    for cap in eslint_re.captures_iter(output) {
        let severity = match &cap[4] {
            "error" => ErrorSeverity::Error,
            "warning" => ErrorSeverity::Warning,
            _ => ErrorSeverity::Info,
        };
        errors.push(ParsedError {
            file: cap[1].to_string(),
            line: cap[2].parse().unwrap_or(0),
            column: cap[3].parse().unwrap_or(0),
            message: cap[5].to_string(),
            severity,
            code: cap.get(6).map(|m| m.as_str().to_string()),
        });
    }

    errors
}

fn parse_generic_errors(output: &str) -> Vec<ParsedError> {
    let mut errors = Vec::new();
    let patterns = [
        (r"(?m)Error: (.+)", ErrorSeverity::Error),
        (r"(?m)error: (.+)", ErrorSeverity::Error),
        (r"(?m)FAILED: (.+)", ErrorSeverity::Error),
    ];
    for (pat, severity) in &patterns {
        let re = regex::Regex::new(pat).unwrap();
        for cap in re.captures_iter(output) {
            errors.push(ParsedError {
                file: String::new(),
                line: 0,
                column: 0,
                message: cap[1].to_string(),
                severity: severity.clone(),
                code: None,
            });
        }
    }
    errors
}

// ---------------------------------------------------------------------------
// Auto-detection
// ---------------------------------------------------------------------------

pub fn detect_project_config(project_path: &Path) -> QualityGateConfig {
    let mut config = QualityGateConfig::default();

    if project_path.join("package.json").exists() {
        config.typecheck = Some(GateCommand {
            id: "typecheck".into(),
            name: "TypeScript Check".into(),
            command: "npx tsc --noEmit".into(),
            working_directory: None,
            env_vars: HashMap::new(),
            enabled: true,
            blocking: true,
        });
        config.test = Some(GateCommand {
            id: "test".into(),
            name: "Tests".into(),
            command: "npm test".into(),
            working_directory: None,
            env_vars: HashMap::new(),
            enabled: true,
            blocking: true,
        });
        config.lint = Some(GateCommand {
            id: "lint".into(),
            name: "ESLint".into(),
            command: "npx eslint . --max-warnings 0".into(),
            working_directory: None,
            env_vars: HashMap::new(),
            enabled: true,
            blocking: false,
        });
    }

    if project_path.join("Cargo.toml").exists() {
        config.typecheck = Some(GateCommand {
            id: "typecheck".into(),
            name: "Rust Check".into(),
            command: "cargo check".into(),
            working_directory: None,
            env_vars: HashMap::new(),
            enabled: true,
            blocking: true,
        });
        config.test = Some(GateCommand {
            id: "test".into(),
            name: "Tests".into(),
            command: "cargo test".into(),
            working_directory: None,
            env_vars: HashMap::new(),
            enabled: true,
            blocking: true,
        });
        config.lint = Some(GateCommand {
            id: "lint".into(),
            name: "Clippy".into(),
            command: "cargo clippy -- -D warnings".into(),
            working_directory: None,
            env_vars: HashMap::new(),
            enabled: true,
            blocking: false,
        });
    }

    if project_path.join("pyproject.toml").exists() || project_path.join("setup.py").exists() {
        config.typecheck = Some(GateCommand {
            id: "typecheck".into(),
            name: "MyPy Check".into(),
            command: "mypy .".into(),
            working_directory: None,
            env_vars: HashMap::new(),
            enabled: true,
            blocking: true,
        });
        config.test = Some(GateCommand {
            id: "test".into(),
            name: "Pytest".into(),
            command: "pytest".into(),
            working_directory: None,
            env_vars: HashMap::new(),
            enabled: true,
            blocking: true,
        });
        config.lint = Some(GateCommand {
            id: "lint".into(),
            name: "Ruff".into(),
            command: "ruff check .".into(),
            working_directory: None,
            env_vars: HashMap::new(),
            enabled: true,
            blocking: false,
        });
    }

    config
}
