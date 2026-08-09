// src-tauri/src/commands/quality_gate_commands.rs
//
// Tauri IPC commands for quality gate operations.

use crate::quality_gate::{QualityGate, QualityGateConfig, QualityGateReport};

/// Run all quality gates and return the report.
#[tauri::command]
pub async fn run_quality_gates(
    config: QualityGateConfig,
    project_path: String,
) -> Result<QualityGateReport, String> {
    let gate = QualityGate::new(config, std::path::Path::new(&project_path));
    gate.run_all()
        .await
        .map_err(|e| e.to_string())
}

/// Auto-detect quality gate configuration from project files.
#[tauri::command]
pub async fn auto_detect_quality_gate_config(
    project_path: String,
) -> Result<QualityGateConfig, String> {
    use crate::quality_gate;
    Ok(quality_gate::detect_project_config(std::path::Path::new(&project_path)))
}

/// Run AI-powered code review using OpenCodeReview (ocr) CLI.
/// Gracefully degrades if ocr is not installed (returns None).
#[tauri::command]
pub async fn run_code_review(
    project_path: String,
) -> Result<Option<crate::quality_gate::code_reviewer::CodeReviewResult>, String> {
    use crate::quality_gate::code_reviewer::CodeReviewer;
    let mut reviewer = CodeReviewer::new(&project_path);
    Ok(reviewer.run_review().await)
}
