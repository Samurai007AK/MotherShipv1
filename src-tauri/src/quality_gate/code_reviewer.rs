// src-tauri/src/quality_gate/code_reviewer.rs
//
// CodeReviewer — Wraps OpenCodeReview (ocr) CLI for AI-powered code review
// during loop iterations. Detects installed ocr, runs reviews, and parses
// structured JSON output into GateResult-compatible types.
//
// OpenCodeReview: https://github.com/alibaba/open-code-review
// Installation: npm install -g @alibaba-group/open-code-review
// Usage: ocr review --format json

use serde::{Deserialize, Serialize};
use std::path::Path;

use super::{ErrorSeverity, GateResult, ParsedError};

// ---------------------------------------------------------------------------
// OpenCodeReview JSON output structures
// ---------------------------------------------------------------------------

/// Top-level response from `ocr review --format json`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrReviewResponse {
    pub success: bool,
    pub data: Option<OcrReviewData>,
    pub error: Option<String>,
    pub meta: Option<OcrMeta>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrReviewData {
    pub summary: Option<String>,
    pub issues: Vec<OcrIssue>,
    pub suggestions: Vec<OcrSuggestion>,
    pub score: Option<f64>,
    pub files_reviewed: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrIssue {
    pub file: String,
    pub line: usize,
    pub column: Option<usize>,
    pub severity: String,
    pub message: String,
    pub rule: Option<String>,
    pub suggestion: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrSuggestion {
    pub file: String,
    pub line: Option<usize>,
    pub message: String,
    pub priority: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrMeta {
    pub model: Option<String>,
    pub duration_ms: Option<u64>,
    pub files_changed: Option<usize>,
}

// ---------------------------------------------------------------------------
// CodeReviewResult — structured review output for frontend
// ---------------------------------------------------------------------------

/// The result of a code review run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeReviewResult {
    pub passed: bool,
    pub issues: Vec<CodeReviewIssue>,
    pub suggestions: Vec<CodeReviewIssue>,
    pub score: Option<f64>,
    pub files_reviewed: usize,
    pub summary: String,
    pub details: String,
    pub ocr_available: bool,
}

/// A single review finding.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeReviewIssue {
    pub file: String,
    pub line: usize,
    pub column: usize,
    pub severity: String,
    pub message: String,
    pub rule: Option<String>,
    pub suggestion: Option<String>,
    pub is_blocking: bool,
}

// ---------------------------------------------------------------------------
// CodeReviewer
// ---------------------------------------------------------------------------

/// Wraps the `ocr` CLI for AI-powered code review during loop iterations.
pub struct CodeReviewer {
    project_path: String,
    /// Cached availability check
    ocr_available: Option<bool>,
}

impl CodeReviewer {
    pub fn new(project_path: &str) -> Self {
        Self {
            project_path: project_path.to_string(),
            ocr_available: None,
        }
    }

    /// Check if `ocr` CLI is installed and available.
    pub fn is_available(&mut self) -> bool {
        if let Some(cached) = self.ocr_available {
            return cached;
        }

        let available = std::process::Command::new("ocr")
            .arg("--version")
            .output()
            .ok()
            .map_or(false, |o| o.status.success());

        self.ocr_available = Some(available);
        available
    }

    /// Run the full code review using `ocr review --format json`.
    /// Returns None if ocr is not available (graceful degradation).
    pub async fn run_review(&mut self) -> Option<CodeReviewResult> {
        if !self.is_available() {
            return None;
        }

        let start = std::time::Instant::now();

        let output = tokio::process::Command::new("ocr")
            .args(["review", "--format", "json"])
            .current_dir(&self.project_path)
            .output()
            .await
            .ok()?;

        let _duration_ms = start.elapsed().as_millis() as u64;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Some(CodeReviewResult {
                passed: false,
                issues: vec![],
                suggestions: vec![],
                score: None,
                files_reviewed: 0,
                summary: format!("OCR review process failed: {}", stderr),
                details: stderr.to_string(),
                ocr_available: true,
            });
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        match serde_json::from_str::<OcrReviewResponse>(&stdout) {
            Ok(parsed) => Some(self.into_review_result(parsed)),
            Err(e) => Some(CodeReviewResult {
                passed: false,
                issues: vec![],
                suggestions: vec![],
                score: None,
                files_reviewed: 0,
                summary: format!("Failed to parse OCR output: {}", e),
                details: stdout.to_string(),
                ocr_available: true,
            }),
        }
    }

    /// Convert the raw OCR response into our structured result.
    fn into_review_result(&self, response: OcrReviewResponse) -> CodeReviewResult {
        let data = match response.data {
            Some(d) => d,
            None => {
                return CodeReviewResult {
                    passed: false,
                    issues: vec![],
                    suggestions: vec![],
                    score: None,
                    files_reviewed: 0,
                    summary: response.error.unwrap_or_else(|| "No review data returned".into()),
                    details: String::new(),
                    ocr_available: true,
                };
            }
        };

        let blocking_thresholds = ["critical", "high", "error"];
        let warning_thresholds = ["medium", "warning"];

        let issues: Vec<CodeReviewIssue> = data
            .issues
            .iter()
            .map(|i| CodeReviewIssue {
                file: i.file.clone(),
                line: i.line,
                column: i.column.unwrap_or(0),
                severity: i.severity.clone(),
                message: i.message.clone(),
                rule: i.rule.clone(),
                suggestion: i.suggestion.clone(),
                is_blocking: blocking_thresholds.contains(&i.severity.to_lowercase().as_str()),
            })
            .collect();

        let suggestions: Vec<CodeReviewIssue> = data
            .suggestions
            .iter()
            .map(|s| CodeReviewIssue {
                file: s.file.clone(),
                line: s.line.unwrap_or(0),
                column: 0,
                severity: "suggestion".into(),
                message: s.message.clone(),
                rule: None,
                suggestion: None,
                is_blocking: false,
            })
            .collect();

        let blocking_count = issues
            .iter()
            .filter(|i| i.is_blocking)
            .count();

        let warning_count = issues
            .iter()
            .filter(|i| warning_thresholds.contains(&i.severity.to_lowercase().as_str()))
            .count();

        let passed = blocking_count == 0;
        let summary = if passed {
            if warning_count > 0 {
                format!(
                    "Review passed with {} warnings, {} suggestions",
                    warning_count,
                    suggestions.len()
                )
            } else {
                format!("Review passed — no issues found in {} files", data.files_reviewed)
            }
        } else {
            format!(
                "Review failed — {} blocking issues, {} warnings",
                blocking_count, warning_count
            )
        };

        let details = {
            let mut parts = vec![];
            if let Some(score) = data.score {
                parts.push(format!("Score: {:.1}", score));
            }
            parts.push(format!("Files: {}", data.files_reviewed));
            parts.push(format!("Issues: {} ({} blocking, {} warnings)", issues.len(), blocking_count, warning_count));
            parts.push(format!("Suggestions: {}", suggestions.len()));
            parts.join(" | ")
        };

        CodeReviewResult {
            passed,
            issues,
            suggestions,
            score: data.score,
            files_reviewed: data.files_reviewed,
            summary,
            details,
            ocr_available: true,
        }
    }

    /// Convert a CodeReviewResult into a GateResult for the quality gate pipeline.
    pub fn into_gate_result(
        &self,
        result: &CodeReviewResult,
        started_at: chrono::DateTime<chrono::Utc>,
        completed_at: chrono::DateTime<chrono::Utc>,
        duration_ms: u64,
    ) -> GateResult {
        let parsed_errors: Vec<ParsedError> = result
            .issues
            .iter()
            .filter(|i| i.is_blocking)
            .map(|i| ParsedError {
                file: i.file.clone(),
                line: i.line,
                column: i.column,
                message: i.message.clone(),
                severity: ErrorSeverity::Error,
                code: i.rule.clone(),
            })
            .collect();

        GateResult {
            gate_id: "ai_review".into(),
            gate_name: "AI Code Review".into(),
            passed: result.passed,
            exit_code: if result.passed { 0 } else { 1 },
            stdout: result.summary.clone(),
            stderr: result.details.clone(),
            duration_ms,
            started_at,
            completed_at,
            error_message: if result.passed {
                None
            } else {
                Some(format!(
                    "AI Review: {} blocking issues",
                    result.issues.iter().filter(|i| i.is_blocking).count()
                ))
            },
            parsed_errors,
        }
    }
}


