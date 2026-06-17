// Mothership — Summary Engine Commands
// Tauri IPC commands for LLM summarization via the summary-engine sidecar.

use serde::{Deserialize, Serialize};

/// Context snapshot data for summarization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextSnapshotData {
    pub trigger: String,
    pub agent_id: String,
    pub output_tail: String,
    pub branch: Option<String>,
    pub open_files: Vec<String>,
    pub decisions: Vec<String>,
    pub memory_size: Option<usize>,
}

/// Summary result from the LLM.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryResult {
    pub summary: String,
    pub key_decisions: Vec<String>,
    pub open_todos: Vec<String>,
    pub files_touched: Vec<String>,
    pub current_state: String,
    pub model_used: String,
}

/// Generate a summary from context snapshots.
/// This is a placeholder that generates a template-based summary.
/// When the Python sidecar is running, it will use Ollama for better quality.
#[tauri::command]
pub async fn summarize_context(
    snapshots: Vec<ContextSnapshotData>,
    handoff_target: Option<String>,
    style: Option<String>,
) -> Result<SummaryResult, String> {
    if snapshots.is_empty() {
        return Ok(SummaryResult {
            summary: "No context snapshots provided".to_string(),
            key_decisions: vec![],
            open_todos: vec![],
            files_touched: vec![],
            current_state: "Empty session".to_string(),
            model_used: "template".to_string(),
        });
    }

    // Template-based summary (works without Ollama)
    let mut all_files = std::collections::HashSet::new();
    let mut all_branches = std::collections::HashSet::new();
    let mut all_decisions = Vec::new();

    for snap in &snapshots {
        for file in &snap.open_files {
            all_files.insert(file.clone());
        }
        if let Some(ref branch) = snap.branch {
            all_branches.insert(branch.clone());
        }
        all_decisions.extend(snap.decisions.clone());
    }

    let mut summary_parts = Vec::new();
    if !all_branches.is_empty() {
        summary_parts.push(format!("Branches: {}", all_branches.iter().cloned().collect::<Vec<_>>().join(", ")));
    }
    if !all_files.is_empty() {
        let files_list: Vec<&str> = all_files.iter().take(10).map(|s| s.as_str()).collect();
        summary_parts.push(format!("Files touched: {}", files_list.join(", ")));
    }

    let summary = if summary_parts.is_empty() {
        format!(
            "Session with {} snapshots for {}",
            snapshots.len(),
            snapshots[0].agent_id
        )
    } else {
        summary_parts.join("; ")
    };

    let target = handoff_target.unwrap_or_else(|| "next agent".to_string());

    Ok(SummaryResult {
        summary,
        key_decisions: all_decisions.into_iter().take(5).collect(),
        open_todos: vec![],
        files_touched: all_files.into_iter().take(10).collect(),
        current_state: format!("Handoff to {}", target),
        model_used: "template".to_string(),
    })
}

/// Check if the summary engine sidecar is healthy.
#[tauri::command]
pub async fn check_summary_health() -> Result<SummaryHealth, String> {
    // Check if Ollama is reachable
    let ollama_available = check_ollama_connection().await;
    let models = if ollama_available {
        get_ollama_models().await.unwrap_or_default()
    } else {
        vec![]
    };

    Ok(SummaryHealth {
        status: if ollama_available { "healthy" } else { "degraded" }.to_string(),
        ollama_available,
        models,
    })
}

/// Summary engine health status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryHealth {
    pub status: String,
    pub ollama_available: bool,
    pub models: Vec<String>,
}

/// Check if Ollama is reachable.
async fn check_ollama_connection() -> bool {
    match reqwest::get("http://127.0.0.1:11434/api/tags").await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

/// Get list of available Ollama models.
async fn get_ollama_models() -> Result<Vec<String>, String> {
    let resp = reqwest::get("http://127.0.0.1:11434/api/tags")
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

    let models = data["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}
