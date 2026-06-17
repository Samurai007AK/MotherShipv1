# Mothership — Quality Gate Component

**Last Updated:** 2026-06-16
**Status:** Design Draft
**Scope:** Pre-commit quality validation for autonomous loop iterations
**Based on:** [snarktank/ralph](https://github.com/snarktank/ralph) — Typecheck/test-before-commit pattern

---

## Overview

Mothership's **Quality Gate** component ensures that no broken code is committed during autonomous loop iterations. Inspired by Ralph's strict rule — "ALL commits must pass your project's quality checks" — this component runs typecheck, tests, and linting before allowing any commit.

**Core Principle:** Broken code compounds across iterations. If iteration 3 introduces a type error, iteration 4 inherits it, and iteration 5 makes it worse. Quality gates prevent this cascade.

---

## How Ralph Implements Quality Gates

Ralph's approach is simple but effective — the prompt instructs the AI to run quality checks before committing:

```markdown
## Ralph's Quality Gate Instructions
6. Run quality checks (e.g., typecheck, lint, test - use whatever your project requires)
8. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
```

**Key insight:** Ralph relies on the AI to run checks, but doesn't enforce them programmatically. Mothership improves on this by making quality gates a hard requirement in the Rust loop controller.

---

## Quality Gate Architecture

### System Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    QUALITY GATE SYSTEM                                      │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                  Quality Gate Controller                              │ │
│  │                                                                      │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │ │
│  │  │ Command    │  │ Result     │  │ Gate       │  │ Commit       │  │ │
│  │  │ Runner     │  │ Parser     │  │ Evaluator  │  │ Guard        │  │ │
│  │  └────────────┘  └────────────┘  └────────────┘  └──────────────┘  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                              │                                             │
│                              ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                  Gate Configuration                                   │ │
│  │                                                                      │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │ │
│  │  │ Typecheck  │  │ Tests      │  │ Lint       │  │ Custom       │  │ │
│  │  │ Command    │  │ Command    │  │ Command    │  │ Gates        │  │ │
│  │  └────────────┘  └────────────┘  └────────────┘  └──────────────┘  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                              │                                             │
│                              ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                  Gate Results                                         │ │
│  │                                                                      │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │ │
│  │  │ Pass/Fail  │  │ Error      │  │ Metrics    │  │ UI Display   │  │ │
│  │  │ Status     │  │ Messages   │  │ (duration) │  │ (progress)   │  │ │
│  │  └────────────┘  └────────────┘  └────────────┘  └──────────────┘  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Rust Implementation

> **Naming clarification:** This document defines the canonical `GateResult` struct (per-gate result with parsed errors). `MOTHERSHIP-RALPH.md` defines a simpler `QualityGateSummary` struct (passed/results only) for LoopController integration. The LoopController uses `QualityGateSummary` internally; the full `QualityGateReport` (containing `Vec<GateResult>`) is used for UI display and metrics.

### Core Quality Gate

```rust
// src-tauri/src/quality_gate/mod.rs
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{Duration, Instant};
use tokio::process::Command;

/// Configuration for quality gate commands
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityGateConfig {
    /// Typecheck command (e.g., "tsc --noEmit", "cargo check", "mypy .")
    pub typecheck: Option<GateCommand>,
    
    /// Test command (e.g., "npm test", "cargo test", "pytest")
    pub test: Option<GateCommand>,
    
    /// Lint command (e.g., "eslint .", "cargo clippy", "ruff check .")
    pub lint: Option<GateCommand>,
    
    /// Build command (e.g., "npm run build", "cargo build")
    pub build: Option<GateCommand>,
    
    /// Custom gates (user-defined commands)
    pub custom: Vec<GateCommand>,
    
    /// Maximum time allowed for all gates combined (in seconds)
    pub timeout_seconds: u64,
    
    /// Whether to fail fast on first error
    pub fail_fast: bool,
    
    /// Whether to run gates in parallel
    pub parallel: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateCommand {
    /// Unique identifier for this gate
    pub id: String,
    
    /// Human-readable name
    pub name: String,
    
    /// The command to run
    pub command: String,
    
    /// Working directory (relative to project root)
    pub working_directory: Option<String>,
    
    /// Environment variables
    pub env_vars: std::collections::HashMap<String, String>,
    
    /// Whether this gate is enabled
    pub enabled: bool,
    
    /// Whether failure should block commit
    pub blocking: bool,
}

impl Default for QualityGateConfig {
    fn default() -> Self {
        Self {
            typecheck: None,
            test: None,
            lint: None,
            build: None,
            custom: Vec::new(),
            timeout_seconds: 120, // 2 minutes total
            fail_fast: true,
            parallel: false,
        }
    }
}

/// Result of running a single gate command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateResult {
    /// Gate identifier
    pub gate_id: String,
    
    /// Gate name
    pub gate_name: String,
    
    /// Whether the gate passed
    pub passed: bool,
    
    /// Exit code from the command
    pub exit_code: i32,
    
    /// Standard output
    pub stdout: String,
    
    /// Standard error
    pub stderr: String,
    
    /// Duration in milliseconds
    pub duration_ms: u64,
    
    /// Timestamp when gate started
    pub started_at: chrono::DateTime<chrono::Utc>,
    
    /// Timestamp when gate completed
    pub completed_at: chrono::DateTime<chrono::Utc>,
    
    /// Error message if gate failed
    pub error_message: Option<String>,
    
    /// Parsed errors (for IDE-style display)
    pub parsed_errors: Vec<ParsedError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedError {
    /// File path
    pub file: String,
    
    /// Line number
    pub line: usize,
    
    /// Column number
    pub column: usize,
    
    /// Error message
    pub message: String,
    
    /// Error severity
    pub severity: ErrorSeverity,
    
    /// Error code (if available)
    pub code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorSeverity {
    Error,
    Warning,
    Info,
}

/// Combined result of all quality gates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityGateReport {
    /// Overall pass/fail status
    pub passed: bool,
    
    /// Individual gate results
    pub results: Vec<GateResult>,
    
    /// Total duration in milliseconds
    pub total_duration_ms: u64,
    
    /// Number of gates that passed
    pub gates_passed: usize,
    
    /// Number of gates that failed
    pub gates_failed: usize,
    
    /// Number of gates that were skipped
    pub gates_skipped: usize,
    
    /// Whether commit is allowed
    pub commit_allowed: bool,
    
    /// Summary message
    pub summary: String,
    
    /// Timestamp
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

/// Quality gate controller
pub struct QualityGate {
    config: QualityGateConfig,
    project_path: std::path::PathBuf,
}

impl QualityGate {
    /// Create a new quality gate with the given configuration
    pub fn new(config: QualityGateConfig, project_path: &Path) -> Self {
        Self {
            config,
            project_path: project_path.to_path_buf(),
        }
    }
    
    /// Create a quality gate from auto-detected project configuration
    pub fn auto_detect(project_path: &Path) -> Self {
        let config = Self::detect_project_config(project_path);
        Self::new(config, project_path)
    }
    
    /// Run all quality gates and return the report
    pub async fn run_all(&self) -> Result<QualityGateReport, QualityGateError> {
        let start_time = Instant::now();
        let mut results = Vec::new();
        
        // Collect all enabled gates
        let mut gates = self.get_enabled_gates();
        
        if self.config.parallel {
            // Run gates in parallel
            let futures: Vec<_> = gates.into_iter()
                .map(|gate| self.run_gate(gate))
                .collect();
            
            let gate_results = futures::future::join_all(futures).await;
            
            for result in gate_results {
                match result {
                    Ok(gate_result) => {
                        if !gate_result.passed && self.config.fail_fast {
                            results.push(gate_result);
                            break;
                        }
                        results.push(gate_result);
                    }
                    Err(e) => {
                        results.push(GateResult {
                            gate_id: "unknown".to_string(),
                            gate_name: "Unknown".to_string(),
                            passed: false,
                            exit_code: -1,
                            stdout: String::new(),
                            stderr: e.to_string(),
                            duration_ms: 0,
                            started_at: chrono::Utc::now(),
                            completed_at: chrono::Utc::now(),
                            error_message: Some(e.to_string()),
                            parsed_errors: Vec::new(),
                        });
                        
                        if self.config.fail_fast {
                            break;
                        }
                    }
                }
            }
        } else {
            // Run gates sequentially
            for gate in gates {
                let gate_result = self.run_gate(gate).await?;
                
                if !gate_result.passed && self.config.fail_fast {
                    results.push(gate_result);
                    break;
                }
                
                results.push(gate_result);
            }
        }
        
        let total_duration_ms = start_time.elapsed().as_millis() as u64;
        
        // Calculate summary
        let gates_passed = results.iter().filter(|r| r.passed).count();
        let gates_failed = results.iter().filter(|r| !r.passed).count();
        let gates_skipped = self.get_disabled_gates_count();
        let passed = gates_failed == 0;
        let commit_allowed = passed;
        
        let summary = if passed {
            format!("All {} quality gates passed", gates_passed)
        } else {
            let failed_gates: Vec<&str> = results.iter()
                .filter(|r| !r.passed)
                .map(|r| r.gate_name.as_str())
                .collect();
            format!("Failed gates: {}", failed_gates.join(", "))
        };
        
        Ok(QualityGateReport {
            passed,
            results,
            total_duration_ms,
            gates_passed,
            gates_failed,
            gates_skipped,
            commit_allowed,
            summary,
            timestamp: chrono::Utc::now(),
        })
    }
    
    /// Run a single gate command
    async fn run_gate(&self, gate: GateCommand) -> Result<GateResult, QualityGateError> {
        let started_at = chrono::Utc::now();
        let start_time = Instant::now();
        
        // Determine working directory
        let work_dir = if let Some(ref dir) = gate.working_directory {
            self.project_path.join(dir)
        } else {
            self.project_path.clone()
        };
        
        // Build command
        let mut cmd = if cfg!(target_os = "windows") {
            let mut cmd = Command::new("cmd");
            cmd.args(["/C", &gate.command]);
            cmd
        } else {
            let mut cmd = Command::new("sh");
            cmd.args(["-c", &gate.command]);
            cmd
        };
        
        cmd.current_dir(&work_dir);
        
        // Set environment variables
        for (key, value) in &gate.env_vars {
            cmd.env(key, value);
        }
        
        // Set timeout
        let timeout = Duration::from_secs(self.config.timeout_seconds);
        
        // Run command with timeout
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
        
        let duration_ms = start_time.elapsed().as_millis() as u64;
        let completed_at = chrono::Utc::now();
        
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        
        let exit_code = output.status.code().unwrap_or(-1);
        let passed = output.status.success();
        
        // Parse errors from output
        let parsed_errors = if !passed {
            self.parse_errors(&gate, &stdout, &stderr)
        } else {
            Vec::new()
        };
        
        let error_message = if !passed {
            Some(format!(
                "Gate '{}' failed with exit code {}",
                gate.name, exit_code
            ))
        } else {
            None
        };
        
        Ok(GateResult {
            gate_id: gate.id,
            gate_name: gate.name,
            passed,
            exit_code,
            stdout,
            stderr,
            duration_ms,
            started_at,
            completed_at,
            error_message,
            parsed_errors,
        })
    }
    
    /// Get all enabled gates
    fn get_enabled_gates(&self) -> Vec<GateCommand> {
        let mut gates = Vec::new();
        
        if let Some(ref gate) = self.config.typecheck {
            if gate.enabled {
                gates.push(gate.clone());
            }
        }
        
        if let Some(ref gate) = self.config.test {
            if gate.enabled {
                gates.push(gate.clone());
            }
        }
        
        if let Some(ref gate) = self.config.lint {
            if gate.enabled {
                gates.push(gate.clone());
            }
        }
        
        if let Some(ref gate) = self.config.build {
            if gate.enabled {
                gates.push(gate.clone());
            }
        }
        
        for gate in &self.config.custom {
            if gate.enabled {
                gates.push(gate.clone());
            }
        }
        
        gates
    }
    
    /// Count disabled gates
    fn get_disabled_gates_count(&self) -> usize {
        let mut count = 0;
        
        if let Some(ref gate) = self.config.typecheck {
            if !gate.enabled { count += 1; }
        }
        
        if let Some(ref gate) = self.config.test {
            if !gate.enabled { count += 1; }
        }
        
        if let Some(ref gate) = self.config.lint {
            if !gate.enabled { count += 1; }
        }
        
        if let Some(ref gate) = self.config.build {
            if !gate.enabled { count += 1; }
        }
        
        count += self.config.custom.iter().filter(|g| !g.enabled).count();
        
        count
    }
    
    /// Parse errors from gate output
    fn parse_errors(&self, gate: &GateCommand, stdout: &str, stderr: &str) -> Vec<ParsedError> {
        let mut errors = Vec::new();
        let output = format!("{}\n{}", stdout, stderr);
        
        match gate.id.as_str() {
            "typecheck" => {
                errors.extend(self.parse_typecheck_errors(&output));
            }
            "test" => {
                errors.extend(self.parse_test_errors(&output));
            }
            "lint" => {
                errors.extend(self.parse_lint_errors(&output));
            }
            _ => {
                // Generic error parsing
                errors.extend(self.parse_generic_errors(&output));
            }
        }
        
        errors
    }
    
    /// Parse TypeScript/JavaScript type errors
    fn parse_typecheck_errors(&self, output: &str) -> Vec<ParsedError> {
        let mut errors = Vec::new();
        
        // TypeScript error format: error TS2322: Type 'string' is not assignable to type 'number'.
        // at file.ts:10:5
        let ts_pattern = regex::Regex::new(
            r"(?m)error (TS\d+): (.+)\n\s+at (.+):(\d+):(\d+)"
        ).unwrap();
        
        for cap in ts_pattern.captures_iter(output) {
            errors.push(ParsedError {
                file: cap[3].to_string(),
                line: cap[4].parse().unwrap_or(0),
                column: cap[5].parse().unwrap_or(0),
                message: cap[2].to_string(),
                severity: ErrorSeverity::Error,
                code: Some(cap[1].to_string()),
            });
        }
        
        // Rust compiler errors
        let rust_pattern = regex::Regex::new(
            r"(?m)error\[(E\d+)\]: (.+)\n\s+-->\s+(.+):(\d+):(\d+)"
        ).unwrap();
        
        for cap in rust_pattern.captures_iter(output) {
            errors.push(ParsedError {
                file: cap[3].to_string(),
                line: cap[4].parse().unwrap_or(0),
                column: cap[5].parse().unwrap_or(0),
                message: cap[2].to_string(),
                severity: ErrorSeverity::Error,
                code: Some(cap[1].to_string()),
            });
        }
        
        // Python type errors (mypy/pyright)
        let python_pattern = regex::Regex::new(
            r"(?m)(.+):(\d+):(\d+): error: (.+) \[(.+)\]"
        ).unwrap();
        
        for cap in python_pattern.captures_iter(output) {
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
    
    /// Parse test failures
    fn parse_test_errors(&self, output: &str) -> Vec<ParsedError> {
        let mut errors = Vec::new();
        
        // Jest/Vitest failure format
        let jest_pattern = regex::Regex::new(
            r"(?m)FAIL\s+(.+)\n.*×\s+(.+)\n\n\s+(.+):(\d+)"
        ).unwrap();
        
        for cap in jest_pattern.captures_iter(output) {
            errors.push(ParsedError {
                file: cap[1].to_string(),
                line: cap[4].parse().unwrap_or(0),
                column: 0,
                message: format!("Test failed: {}", cap[2].trim()),
                severity: ErrorSeverity::Error,
                code: None,
            });
        }
        
        // Rust test failures
        let rust_test_pattern = regex::Regex::new(
            r"(?m)---- (.+) stdout ----\n(?:thread .+ panicked at.+:\n(.+):(\d+))"
        ).unwrap();
        
        for cap in rust_test_pattern.captures_iter(output) {
            errors.push(ParsedError {
                file: cap[2].to_string(),
                line: cap[3].parse().unwrap_or(0),
                column: 0,
                message: format!("Test failed: {}", cap[1].trim()),
                severity: ErrorSeverity::Error,
                code: None,
            });
        }
        
        // Python pytest failures
        let pytest_pattern = regex::Regex::new(
            r"(?m)FAILED\s+(.+)::(.+)\s+-\s+(.+)"
        ).unwrap();
        
        for cap in pytest_pattern.captures_iter(output) {
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
    
    /// Parse lint errors
    fn parse_lint_errors(&self, output: &str) -> Vec<ParsedError> {
        let mut errors = Vec::new();
        
        // ESLint format: file.ts:10:5: error - message [code]
        let eslint_pattern = regex::Regex::new(
            r"(?m)(.+):(\d+):(\d+):\s+(error|warning)\s+-\s+(.+?)(?:\s+\[(.+)\])?$"
        ).unwrap();
        
        for cap in eslint_pattern.captures_iter(output) {
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
        
        // Clippy warnings
        let clippy_pattern = regex::Regex::new(
            r"(?m)warning\[(.+?)\]: (.+)\n\s+-->\s+(.+):(\d+):(\d+)"
        ).unwrap();
        
        for cap in clippy_pattern.captures_iter(output) {
            errors.push(ParsedError {
                file: cap[3].to_string(),
                line: cap[4].parse().unwrap_or(0),
                column: cap[5].parse().unwrap_or(0),
                message: cap[2].to_string(),
                severity: ErrorSeverity::Warning,
                code: Some(cap[1].to_string()),
            });
        }
        
        errors
    }
    
    /// Parse generic errors
    fn parse_generic_errors(&self, output: &str) -> Vec<ParsedError> {
        let mut errors = Vec::new();
        
        // Look for common error patterns
        let error_patterns = [
            (r"(?m)Error: (.+)", ErrorSeverity::Error),
            (r"(?m)error: (.+)", ErrorSeverity::Error),
            (r"(?m)FAILED: (.+)", ErrorSeverity::Error),
        ];
        
        for (pattern, severity) in &error_patterns {
            let re = regex::Regex::new(pattern).unwrap();
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
    
    /// Auto-detect project configuration
    fn detect_project_config(project_path: &Path) -> QualityGateConfig {
        let mut config = QualityGateConfig::default();
        
        // Check for package.json (Node.js)
        if project_path.join("package.json").exists() {
            config.typecheck = Some(GateCommand {
                id: "typecheck".to_string(),
                name: "TypeScript Check".to_string(),
                command: "npx tsc --noEmit".to_string(),
                working_directory: None,
                env_vars: std::collections::HashMap::new(),
                enabled: true,
                blocking: true,
            });
            
            config.test = Some(GateCommand {
                id: "test".to_string(),
                name: "Tests".to_string(),
                command: "npm test".to_string(),
                working_directory: None,
                env_vars: std::collections::HashMap::new(),
                enabled: true,
                blocking: true,
            });
            
            config.lint = Some(GateCommand {
                id: "lint".to_string(),
                name: "ESLint".to_string(),
                command: "npx eslint . --max-warnings 0".to_string(),
                working_directory: None,
                env_vars: std::collections::HashMap::new(),
                enabled: true,
                blocking: false, // Warnings don't block
            });
        }
        
        // Check for Cargo.toml (Rust)
        if project_path.join("Cargo.toml").exists() {
            config.typecheck = Some(GateCommand {
                id: "typecheck".to_string(),
                name: "Rust Check".to_string(),
                command: "cargo check".to_string(),
                working_directory: None,
                env_vars: std::collections::HashMap::new(),
                enabled: true,
                blocking: true,
            });
            
            config.test = Some(GateCommand {
                id: "test".to_string(),
                name: "Tests".to_string(),
                command: "cargo test".to_string(),
                working_directory: None,
                env_vars: std::collections::HashMap::new(),
                enabled: true,
                blocking: true,
            });
            
            config.lint = Some(GateCommand {
                id: "lint".to_string(),
                name: "Clippy".to_string(),
                command: "cargo clippy -- -D warnings".to_string(),
                working_directory: None,
                env_vars: std::collections::HashMap::new(),
                enabled: true,
                blocking: false,
            });
        }
        
        // Check for pyproject.toml or setup.py (Python)
        if project_path.join("pyproject.toml").exists() || project_path.join("setup.py").exists() {
            config.typecheck = Some(GateCommand {
                id: "typecheck".to_string(),
                name: "MyPy Check".to_string(),
                command: "mypy .".to_string(),
                working_directory: None,
                env_vars: std::collections::HashMap::new(),
                enabled: true,
                blocking: true,
            });
            
            config.test = Some(GateCommand {
                id: "test".to_string(),
                name: "Pytest".to_string(),
                command: "pytest".to_string(),
                working_directory: None,
                env_vars: std::collections::HashMap::new(),
                enabled: true,
                blocking: true,
            });
            
            config.lint = Some(GateCommand {
                id: "lint".to_string(),
                name: "Ruff".to_string(),
                command: "ruff check .".to_string(),
                working_directory: None,
                env_vars: std::collections::HashMap::new(),
                enabled: true,
                blocking: false,
            });
        }
        
        config
    }
}

#[derive(Debug, thiserror::Error)]
pub enum QualityGateError {
    #[error("Gate timeout: {gate_id} exceeded {timeout_seconds}s")]
    Timeout {
        gate_id: String,
        timeout_seconds: u64,
    },
    
    #[error("Command execution failed for {gate_id}: {error}")]
    CommandExecution {
        gate_id: String,
        error: String,
    },
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("Regex error: {0}")]
    Regex(#[from] regex::Error),
}
```

---

## Commit Guard Integration

### Pre-Commit Hook

```rust
// src-tauri/src/quality_gate/commit_guard.rs
use super::{QualityGate, QualityGateReport};

pub struct CommitGuard {
    quality_gate: QualityGate,
    auto_commit: bool,
}

impl CommitGuard {
    pub fn new(quality_gate: QualityGate, auto_commit: bool) -> Self {
        Self {
            quality_gate,
            auto_commit,
        }
    }
    
    /// Validate before commit and commit if allowed
    pub async fn validate_and_commit(
        &self,
        message: &str,
        files: &[String],
    ) -> Result<CommitResult, CommitGuardError> {
        // Run quality gates
        let report = self.quality_gate.run_all().await?;
        
        if !report.commit_allowed {
            return Ok(CommitResult {
                committed: false,
                report: Some(report),
                error: Some("Quality gates failed".to_string()),
            });
        }
        
        // Commit if auto-commit enabled
        if self.auto_commit {
            self.commit_changes(message, files).await?;
            
            Ok(CommitResult {
                committed: true,
                report: Some(report),
                error: None,
            })
        } else {
            Ok(CommitResult {
                committed: false,
                report: Some(report),
                error: None,
            })
        }
    }
    
    /// Stage and commit changes
    async fn commit_changes(
        &self,
        message: &str,
        files: &[String],
    ) -> Result<(), CommitGuardError> {
        // Stage files
        for file in files {
            let output = tokio::process::Command::new("git")
                .args(["add", file])
                .output()
                .await?;
            
            if !output.status.success() {
                return Err(CommitGuardError::GitError {
                    command: format!("git add {}", file),
                    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                });
            }
        }
        
        // Commit
        let output = tokio::process::Command::new("git")
            .args(["commit", "-m", message])
            .output()
            .await?;
        
        if !output.status.success() {
            return Err(CommitGuardError::GitError {
                command: format!("git commit -m {}", message),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            });
        }
        
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct CommitResult {
    pub committed: bool,
    pub report: Option<QualityGateReport>,
    pub error: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum CommitGuardError {
    #[error("Git error on '{command}': {stderr}")]
    GitError {
        command: String,
        stderr: String,
    },
    
    #[error("Quality gate error: {0}")]
    QualityGate(#[from] super::QualityGateError),
}
```

---

## Integration with Loop Controller

### Hook into Loop Iterations

```rust
// In LoopController::run_iteration()
impl LoopController {
    async fn run_iteration(
        &self,
        iteration: usize,
        task: &Task,
    ) -> Result<IterationRecord, LoopError> {
        let start_time = chrono::Utc::now();
        
        // ... existing iteration code (implement task, etc.) ...
        
        // Run quality gates before commit
        let gate_report = self.quality_gate.run_all().await
            .map_err(|e| LoopError::QualityGateFailed(e.to_string()))?;
        
        if !gate_report.commit_allowed {
            // Quality gates failed - don't commit, return failure
            return Ok(IterationRecord {
                iteration,
                task_id: task.id.clone(),
                action: "Quality gate failed".to_string(),
                result: format!(
                    "Quality gates failed:\n{}",
                    gate_report.results.iter()
                        .filter(|r| !r.passed)
                        .map(|r| format!("- {}: {}", r.gate_name, r.error_message.as_deref().unwrap_or("Unknown error")))
                        .collect::<Vec<_>>()
                        .join("\n")
                ),
                duration_ms: start_time
                    .signed_duration_since(chrono::Utc::now())
                    .num_milliseconds() as u64,
                timestamp: chrono::Utc::now(),
                success: false,
                files_modified: Vec::new(),
                tools_used: Vec::new(),
                learnings: Vec::new(),
                gate_report: Some(gate_report),
            });
        }
        
        // Quality gates passed - commit changes
        if self.config.auto_commit {
            self.commit_changes(task, &files_modified).await?;
        }
        
        // ... rest of iteration code ...
        
        Ok(IterationRecord {
            iteration,
            task_id: task.id.clone(),
            action: format!("Implemented: {}", task.title),
            result: output_buffer,
            duration_ms,
            timestamp: chrono::Utc::now(),
            success: true,
            files_modified,
            tools_used,
            learnings,
            gate_report: Some(gate_report),
        })
    }
}
```

---

## Zustand Store Integration

> **Canonical store definitions:** See [`UNIFIED-STORE.md`](./UNIFIED-STORE.md) for the complete, authoritative `useQualityGateStore` implementation with configuration management, auto-detection, and cross-store coordination via `useCoordinatorStore`.
>
> The store in UNIFIED-STORE.md includes additional features over this simplified version:
> - `config` state and `updateConfig`/`autoDetectConfig` actions
> - `linkedLoopId` for loop integration
> - `resetStore` action
> - Subscriptions for gate failure handling and metrics tracking

### Quality Gate Store (Simplified)

```typescript
// stores/qualityGateStore.ts — See UNIFIED-STORE.md for full implementation
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

interface QualityGateState {
  currentReport: QualityGateReport | null
  reportHistory: QualityGateReport[]
  isRunning: boolean
  showDetails: boolean
  selectedGateId: string | null
  runQualityGates: () => Promise<QualityGateReport>
  selectGate: (gateId: string | null) => void
  toggleDetails: () => void
  clearHistory: () => void
}

export const useQualityGateStore = create<QualityGateState>()((set, get) => ({
  currentReport: null,
  reportHistory: [],
  isRunning: false,
  showDetails: false,
  selectedGateId: null,

  runQualityGates: async () => {
    set({ isRunning: true })
    try {
      const report = await invoke<QualityGateReport>('run_quality_gates')
      set((state) => ({
        currentReport: report,
        reportHistory: [report, ...state.reportHistory].slice(0, 50),
        isRunning: false,
      }))
      return report
    } catch (e) {
      set({ isRunning: false })
      throw e
    }
  },

  selectGate: (gateId) => set({ selectedGateId: gateId }),
  toggleDetails: () => set((state) => ({ showDetails: !state.showDetails })),
  clearHistory: () => set({ reportHistory: [], currentReport: null }),
}))
```

---

## UI Components

### Quality Gate Status Bar

```tsx
// components/quality-gate/QualityGateStatusBar.tsx
import { useQualityGateStore } from '../../stores/qualityGateStore'
import { CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

export function QualityGateStatusBar() {
  const {
    currentReport,
    isRunning,
    showDetails,
    toggleDetails,
  } = useQualityGateStore()

  if (!currentReport && !isRunning) {
    return null
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
      {/* Status Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-zinc-800/50"
        onClick={toggleDetails}
      >
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          ) : currentReport?.passed ? (
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          ) : (
            <XCircle className="w-4 h-4 text-red-400" />
          )}
          
          <span className="text-sm font-medium text-zinc-200">
            {isRunning ? 'Running quality gates...' : 'Quality Gates'}
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          {currentReport && (
            <>
              <span className="text-xs text-zinc-500">
                {currentReport.gatesPassed}/{currentReport.gatesPassed + currentReport.gatesFailed} passed
              </span>
              <span className="text-xs text-zinc-500">
                {currentReport.totalDurationMs}ms
              </span>
            </>
          )}
          
          {showDetails ? (
            <ChevronUp className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          )}
        </div>
      </div>

      {/* Detailed Results */}
      {showDetails && currentReport && (
        <div className="border-t border-zinc-800 p-3">
          <div className="space-y-2">
            {currentReport.results.map((result) => (
              <GateResultRow key={result.gateId} result={result} />
            ))}
          </div>
          
          {currentReport.results.some(r => r.parsedErrors.length > 0) && (
            <div className="mt-3 pt-3 border-t border-zinc-800">
              <div className="text-xs text-zinc-500 mb-2">Errors:</div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {currentReport.results
                  .flatMap(r => r.parsedErrors)
                  .slice(0, 10)
                  .map((error, i) => (
                    <div key={i} className="text-xs text-zinc-400 font-mono">
                      {error.file && (
                        <span className="text-zinc-500">
                          {error.file}:{error.line}:{error.column}
                        </span>
                      )}{' '}
                      <span className={
                        error.severity === 'Error' ? 'text-red-400' :
                        error.severity === 'Warning' ? 'text-yellow-400' :
                        'text-zinc-400'
                      }>
                        {error.message}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function GateResultRow({ result }: { result: GateResult }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        {result.passed ? (
          <CheckCircle2 className="w-3 h-3 text-green-400" />
        ) : (
          <XCircle className="w-3 h-3 text-red-400" />
        )}
        <span className="text-zinc-300">{result.gateName}</span>
      </div>
      
      <div className="flex items-center gap-2 text-zinc-500">
        <span>{result.durationMs}ms</span>
        {result.exitCode !== 0 && (
          <span className="text-red-400">exit {result.exitCode}</span>
        )}
      </div>
    </div>
  )
}
```

### Quality Gate Configuration Dialog

```tsx
// components/quality-gate/QualityGateConfigDialog.tsx
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'

interface GateConfig {
  id: string
  name: string
  command: string
  enabled: boolean
  blocking: boolean
}

interface QualityGateConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: {
    typecheck: GateConfig | null
    test: GateConfig | null
    lint: GateConfig | null
    build: GateConfig | null
    custom: GateConfig[]
  }
  onSave: (config: any) => void
}

export function QualityGateConfigDialog({
  open,
  onOpenChange,
  config,
  onSave,
}: QualityGateConfigDialogProps) {
  const [localConfig, setLocalConfig] = useState(config)

  const updateGate = (gateType: string, updates: Partial<GateConfig>) => {
    setLocalConfig((prev) => ({
      ...prev,
      [gateType]: prev[gateType as keyof typeof prev]
        ? { ...prev[gateType as keyof typeof prev]!, ...updates }
        : null,
    }))
  }

  const handleSave = () => {
    onSave(localConfig)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Quality Gate Configuration</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Typecheck */}
          {localConfig.typecheck && (
            <GateConfigSection
              title="Typecheck"
              config={localConfig.typecheck}
              onChange={(updates) => updateGate('typecheck', updates)}
            />
          )}

          {/* Tests */}
          {localConfig.test && (
            <GateConfigSection
              title="Tests"
              config={localConfig.test}
              onChange={(updates) => updateGate('test', updates)}
            />
          )}

          {/* Lint */}
          {localConfig.lint && (
            <GateConfigSection
              title="Lint"
              config={localConfig.lint}
              onChange={(updates) => updateGate('lint', updates)}
            />
          )}

          {/* Build */}
          {localConfig.build && (
            <GateConfigSection
              title="Build"
              config={localConfig.build}
              onChange={(updates) => updateGate('build', updates)}
            />
          )}

          {/* Custom Gates */}
          {localConfig.custom.map((gate, index) => (
            <GateConfigSection
              key={gate.id}
              title={`Custom: ${gate.name}`}
              config={gate}
              onChange={(updates) => {
                const newCustom = [...localConfig.custom]
                newCustom[index] = { ...newCustom[index], ...updates }
                setLocalConfig((prev) => ({ ...prev, custom: newCustom }))
              }}
              showDelete
              onDelete={() => {
                setLocalConfig((prev) => ({
                  ...prev,
                  custom: prev.custom.filter((_, i) => i !== index),
                }))
              }}
            />
          ))}

          <Button
            variant="outline"
            onClick={() => {
              setLocalConfig((prev) => ({
                ...prev,
                custom: [
                  ...prev.custom,
                  {
                    id: `custom-${Date.now()}`,
                    name: 'New Gate',
                    command: '',
                    enabled: true,
                    blocking: true,
                  },
                ],
              }))
            }}
          >
            Add Custom Gate
          </Button>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GateConfigSection({
  title,
  config,
  onChange,
  showDelete = false,
  onDelete,
}: {
  title: string
  config: GateConfig
  onChange: (updates: Partial<GateConfig>) => void
  showDelete?: boolean
  onDelete?: () => void
}) {
  return (
    <div className="bg-zinc-800 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) => onChange({ enabled: checked })}
          />
          <Label className="text-sm font-medium text-zinc-200">{title}</Label>
        </div>
        
        {showDelete && onDelete && (
          <Button variant="ghost" size="sm" onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <div>
          <Label className="text-xs text-zinc-500">Command</Label>
          <Input
            value={config.command}
            onChange={(e) => onChange({ command: e.target.value })}
            placeholder="npm test"
            className="mt-1"
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={config.blocking}
            onCheckedChange={(checked) => onChange({ blocking: checked })}
          />
          <Label className="text-xs text-zinc-500">
            Block commit on failure
          </Label>
        </div>
      </div>
    </div>
  )
}
```

---

## Comparison: Ralph vs Mothership Quality Gates

| Aspect | Ralph | Mothership |
|--------|-------|------------|
| **Enforcement** | AI prompt instructions | Hard Rust component |
| **Detection** | AI reads output | Automated regex parsing |
| **Error Display** | Terminal output only | Parsed errors with file/line |
| **Configuration** | Manual (in prompt) | Auto-detect + UI config |
| **Parallel Execution** | Sequential | Configurable parallel/sequential |
| **Timeout** | None | Configurable timeout |
| **Blocking** | All blocking | Per-gate blocking config |
| **Metrics** | None | Duration tracking per gate |
| **Custom Gates** | None | User-defined commands |
| **Commit Guard** | AI decides | Programmatic commit validation |

---

## Implementation Checklist

> **Store definitions:** See [UNIFIED-STORE.md](./UNIFIED-STORE.md) for canonical `useQualityGateStore` implementation.

- [ ] QualityGateConfig (Rust)
  - [ ] Config structs (GateCommand, QualityGateConfig)
  - [ ] Default configurations
  - [ ] Serialization/deserialization

- [ ] QualityGate Controller (Rust)
  - [ ] run_all() method
  - [ ] run_gate() method (single gate)
  - [ ] Auto-detection (package.json, Cargo.toml, pyproject.toml)
  - [ ] Timeout handling
  - [ ] Parallel/sequential execution

- [ ] Error Parsing (Rust)
  - [ ] TypeScript/JavaScript errors
  - [ ] Rust compiler errors
  - [ ] Python type errors (mypy/pyright)
  - [ ] Test failures (Jest, Vitest, pytest)
  - [ ] Lint errors (ESLint, Clippy, Ruff)

- [ ] CommitGuard (Rust)
  - [ ] validate_and_commit() method
  - [ ] Git staging and commit
  - [ ] Integration with QualityGate

- [ ] Zustand Store (see [UNIFIED-STORE.md](./UNIFIED-STORE.md))
  - [ ] QualityGateReport state
  - [ ] runQualityGates action
  - [ ] History tracking

- [ ] UI Components
  - [ ] QualityGateStatusBar
  - [ ] QualityGateConfigDialog
  - [ ] GateResultRow
  - [ ] ParsedErrorDisplay

- [ ] Integration
  - [ ] Hook into LoopController.run_iteration()
  - [ ] Pre-commit validation
  - [ ] Auto-detect project type

---

## References

- [Ralph GitHub](https://github.com/snarktank/ralph) — Original quality gate pattern
- [Geoffrey Huntley's Ralph article](https://ghuntley.com/ralph/) — Pattern explanation
- [MOTHERSHIP-RALPH.md](./MOTHERSHIP-RALPH.md) — Loop engine design (uses `QualityGateSummary`)
- [UNIFIED-STORE.md](./UNIFIED-STORE.md) — Canonical Zustand store definitions
- [LOOPS.md](./LOOPS.md) — Loop architecture (abstract reference)
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture

---

*Last updated: 2026-06-16*
