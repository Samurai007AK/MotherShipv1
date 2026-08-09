// Mothership — Summary Engine Commands
// Tauri IPC commands for LLM summarization via the summary-engine sidecar.
//
// generate_summary: Calls Ollama API directly with a structured prompt.
// Falls back to template-based summary when Ollama is unavailable.

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

/// Summary engine health status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryHealth {
    pub status: String,
    pub ollama_available: bool,
    pub models: Vec<String>,
}

// ──────────────────────────────────────────────────────────────────────────
// Public Tauri commands
// ──────────────────────────────────────────────────────────────────────────

/// Generate a summary from context snapshots.
///
/// Tries Ollama first for an LLM-powered summary, then falls back to a
/// template-based summary when Ollama is unreachable.
#[tauri::command]
pub async fn summarize_context(
    snapshots: Vec<ContextSnapshotData>,
    handoff_target: Option<String>,
    _style: Option<String>,
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

    // Try Ollama first
    if ollama_is_available().await {
        let target = handoff_target.as_deref().unwrap_or("next agent");
        match ollama_summarize(&snapshots, target).await {
            Ok(result) => return Ok(result),
            Err(e) => {
                tracing::warn!("Ollama summarization failed, falling back to template: {}", e);
            }
        }
    }

    let target = handoff_target.unwrap_or_else(|| "next agent".to_string());

    // Fallback: template-based summary
    Ok(template_summary(&snapshots, &target))
}

/// Check if the summary engine sidecar is healthy.
#[tauri::command]
pub async fn check_summary_health() -> Result<SummaryHealth, String> {
    let ollama_available = ollama_is_available().await;
    let models = if ollama_available {
        fetch_ollama_models().await.unwrap_or_default()
    } else {
        vec![]
    };

    Ok(SummaryHealth {
        status: if ollama_available { "healthy".to_string() } else { "degraded".to_string() },
        ollama_available,
        models,
    })
}

// ──────────────────────────────────────────────────────────────────────────
// Ollama integration
// ──────────────────────────────────────────────────────────────────────────

/// Check if Ollama is reachable.
async fn ollama_is_available() -> bool {
    match reqwest::get("http://127.0.0.1:11434/api/tags").await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

/// Fetch available model names from Ollama.
async fn fetch_ollama_models() -> Result<Vec<String>, String> {
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

/// Build a prompt for the LLM from context snapshots.
/// Includes the handoff target so the LLM knows who the context is being passed to.
fn build_summary_prompt(snapshots: &[ContextSnapshotData], handoff_target: &str) -> String {
    let mut parts = Vec::new();

    for (i, snap) in snapshots.iter().enumerate() {
        let mut part = format!(
            "--- Snapshot {} (trigger: {}, agent: {}) ---",
            i + 1,
            snap.trigger,
            snap.agent_id,
        );

        if let Some(ref branch) = snap.branch {
            part.push_str(&format!("\nBranch: {}", branch));
        }

        if !snap.decisions.is_empty() {
            part.push_str(&format!("\nDecisions: {}", snap.decisions.join("; ")));
        }

        if !snap.open_files.is_empty() {
            part.push_str(&format!("\nFiles: {}", snap.open_files.join(", ")));
        }

        if !snap.output_tail.is_empty() {
            let truncated: String = snap.output_tail.chars().take(2000).collect();
            part.push_str(&format!("\nOutput:\n{}", truncated));
        }

        parts.push(part);
    }

    let snapshots_text = parts.join("\n\n");

    format!(
        r#"You are a context handoff assistant for an AI agent workspace called Mothership.
Given the following agent session snapshots, generate a concise summary to hand off to {target}.

Format your response as:
OVERVIEW: 2-3 sentence overview of what was done
DECISIONS: Key decisions made (bullet points, or "None recorded")
TODO: Open TODOs mentioned (bullet points, or "None")
FILES: Key files/modules touched (list, or "None")
STATE: Current state of work (1-2 sentences)

Session data:
{snapshots}"#,
        target = handoff_target,
        snapshots = snapshots_text,
    )
}

/// Parse the LLM response into structured fields.
fn parse_llm_response(response: &str) -> SummaryResult {
    let mut summary = String::new();
    let mut key_decisions: Vec<String> = Vec::new();
    let mut open_todos: Vec<String> = Vec::new();
    let mut files_touched: Vec<String> = Vec::new();
    let mut current_state = String::new();

    let mut current_section: Option<&str> = None;

    for line in response.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let upper = line.to_uppercase();

        if upper.starts_with("OVERVIEW:") {
            current_section = Some("overview");
            summary = line["OVERVIEW:".len()..].trim().to_string();
        } else if upper.starts_with("DECISIONS:") {
            current_section = Some("decisions");
            let content = line["DECISIONS:".len()..].trim().to_string();
            if !content.is_empty() && content.to_lowercase() != "none recorded" {
                key_decisions.push(content);
            }
        } else if upper.starts_with("TODO:") {
            current_section = Some("todo");
            let content = line["TODO:".len()..].trim().to_string();
            if !content.is_empty() && content.to_lowercase() != "none" {
                open_todos.push(content);
            }
        } else if upper.starts_with("FILES:") {
            current_section = Some("files");
            let content = line["FILES:".len()..].trim().to_string();
            if !content.is_empty() && content.to_lowercase() != "none" {
                files_touched.push(content);
            }
        } else if upper.starts_with("STATE:") {
            current_section = Some("state");
            current_state = line["STATE:".len()..].trim().to_string();
        } else if line.starts_with("- ") || line.starts_with("* ") {
            // Bullet point
            let item = line[2..].trim().to_string();
            match current_section {
                Some("decisions") => key_decisions.push(item),
                Some("todo") => open_todos.push(item),
                Some("files") => files_touched.push(item),
                _ => {}
            }
        } else if current_section == Some("overview") && summary.is_empty() {
            summary = line.to_string();
        } else if current_section == Some("state") {
            if !current_state.is_empty() {
                current_state.push(' ');
            }
            current_state.push_str(line);
        }
    }

    // Fallback if no structured sections found
    if summary.is_empty() && key_decisions.is_empty() {
        let truncated: String = response.chars().take(500).collect();
        summary = truncated;
    }

    SummaryResult {
        summary,
        key_decisions,
        open_todos,
        files_touched,
        current_state,
        model_used: "ollama".to_string(),
    }
}

/// Call Ollama's /api/generate endpoint with the summary prompt.
async fn ollama_summarize(
    snapshots: &[ContextSnapshotData],
    handoff_target: &str,
) -> Result<SummaryResult, String> {
    // Pick the best available model
    let models = fetch_ollama_models().await?;
    let model = select_best_model(&models);

    let prompt = build_summary_prompt(snapshots, handoff_target);

    let payload = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false,
        "options": {
            "temperature": 0.3,
            "num_predict": 512,
        }
    });

    let resp = reqwest::Client::new()
        .post("http://127.0.0.1:11434/api/generate")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {}", e))?;

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

    let response_text = data["response"]
        .as_str()
        .unwrap_or("")
        .to_string();

    if response_text.is_empty() {
        return Err("Empty response from Ollama".to_string());
    }

    let mut result = parse_llm_response(&response_text);
    result.model_used = model;
    Ok(result)
}

/// Select the best available model for summarization.
/// Prefers smaller models for speed.
fn select_best_model(models: &[String]) -> String {
    let preferred = ["llama3.2:3b", "llama3.1:8b", "llama3.2:1b", "mistral"];

    for candidate in &preferred {
        if let Some(name) = models.iter().find(|m| m.contains(candidate)) {
            return name.clone();
        }
    }

    // Fallback to first available model
    models.first().cloned().unwrap_or_else(|| "llama3.2:3b".to_string())
}

// ──────────────────────────────────────────────────────────────────────────
// Template fallback
// ──────────────────────────────────────────────────────────────────────────

/// Generate a template-based summary without LLM.
fn template_summary(snapshots: &[ContextSnapshotData], handoff_target: &str) -> SummaryResult {
    let mut all_files = std::collections::HashSet::new();
    let mut all_branches = std::collections::HashSet::new();
    let mut all_decisions = Vec::new();

    for snap in snapshots {
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
        let branches: Vec<&str> = all_branches.iter().map(|s| s.as_str()).collect();
        summary_parts.push(format!("Branches: {}", branches.join(", ")));
    }
    if !all_files.is_empty() {
        let files_list: Vec<&str> = all_files.iter().take(10).map(|s| s.as_str()).collect();
        summary_parts.push(format!("Files touched: {}", files_list.join(", ")));
    }

    let summary = if summary_parts.is_empty() {
        format!(
            "Session with {} snapshots for {}",
            snapshots.len(),
            snapshots[0].agent_id,
        )
    } else {
        summary_parts.join("; ")
    };

    SummaryResult {
        summary,
        key_decisions: all_decisions.into_iter().take(5).collect(),
        open_todos: vec![],
        files_touched: all_files.into_iter().take(10).collect(),
        current_state: format!("Handoff to {}", handoff_target),
        model_used: "template".to_string(),
    }
}
