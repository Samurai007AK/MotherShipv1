// Mothership — Model Router Commands
// Tauri IPC commands for local LLM inference via Ollama.

use serde::{Deserialize, Serialize};

/// Available model information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    pub size: u64,
    pub parameter_size: String,
    pub quantization: String,
    pub modified_at: String,
}

/// Chat completion request.
#[derive(Debug, Clone, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub stream: Option<bool>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}

/// A chat message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Chat completion response.
#[derive(Debug, Clone, Serialize)]
pub struct ChatResponse {
    pub content: String,
    pub model: String,
    pub total_duration_ms: u64,
    pub eval_count: Option<u32>,
}

/// List all available Ollama models.
#[tauri::command]
pub async fn list_ollama_models() -> Result<Vec<ModelInfo>, String> {
    let resp = reqwest::get("http://127.0.0.1:11434/api/tags")
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}. Is Ollama running?", e))?;

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let models = data["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    let name = m["name"].as_str()?.to_string();
                    let size = m["size"].as_u64().unwrap_or(0);
                    let details = m.get("details");

                    let parameter_size = details
                        .and_then(|d| d["parameter_size"].as_str())
                        .unwrap_or("unknown")
                        .to_string();

                    let quantization = details
                        .and_then(|d| d["quantization_level"].as_str())
                        .unwrap_or("unknown")
                        .to_string();

                    let modified_at = m["modified_at"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();

                    Some(ModelInfo {
                        name,
                        size,
                        parameter_size,
                        quantization,
                        modified_at,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

/// Check if Ollama is running and return server info.
#[tauri::command]
pub async fn check_ollama_status() -> Result<OllamaStatus, String> {
    match reqwest::get("http://127.0.0.1:11434/api/tags").await {
        Ok(resp) => {
            if resp.status().is_success() {
                let data: serde_json::Value = resp.json().await.unwrap_or_default();
                let model_count = data["models"]
                    .as_array()
                    .map(|a| a.len())
                    .unwrap_or(0);

                Ok(OllamaStatus {
                    running: true,
                    model_count,
                    version: "connected".to_string(),
                })
            } else {
                Ok(OllamaStatus {
                    running: false,
                    model_count: 0,
                    version: "error".to_string(),
                })
            }
        }
        Err(_) => Ok(OllamaStatus {
            running: false,
            model_count: 0,
            version: "disconnected".to_string(),
        }),
    }
}

/// Ollama server status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaStatus {
    pub running: bool,
    pub model_count: usize,
    pub version: String,
}

/// Generate a chat completion (non-streaming).
#[tauri::command]
pub async fn chat_completion(request: ChatRequest) -> Result<ChatResponse, String> {
    let start = std::time::Instant::now();

    let payload = serde_json::json!({
        "model": request.model,
        "messages": request.messages,
        "stream": false,
        "options": {
            "temperature": request.temperature.unwrap_or(0.7),
            "num_predict": request.max_tokens.unwrap_or(2048),
        }
    });

    let resp = reqwest::Client::new()
        .post("http://127.0.0.1:11434/api/chat")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let content = data["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let eval_count = data["eval_count"].as_u64().map(|v| v as u32);

    let duration = start.elapsed().as_millis() as u64;

    Ok(ChatResponse {
        content,
        model: request.model,
        total_duration_ms: duration,
        eval_count,
    })
}

/// Generate a response for a simple prompt (convenience wrapper).
#[tauri::command]
pub async fn generate_response(
    model: String,
    prompt: String,
    system_prompt: Option<String>,
    temperature: Option<f32>,
) -> Result<ChatResponse, String> {
    let mut messages = Vec::new();

    if let Some(sys) = system_prompt {
        messages.push(ChatMessage {
            role: "system".to_string(),
            content: sys,
        });
    }

    messages.push(ChatMessage {
        role: "user".to_string(),
        content: prompt,
    });

    chat_completion(ChatRequest {
        model,
        messages,
        stream: Some(false),
        temperature,
        max_tokens: Some(2048),
    })
    .await
}
