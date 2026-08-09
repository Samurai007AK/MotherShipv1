use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

// ── JSON-RPC 2.0 types ─────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AcpRequest {
    pub jsonrpc: String,
    pub id: serde_json::Value,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AcpResponse {
    pub jsonrpc: String,
    pub id: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<AcpError>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AcpError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AcpCapabilities {
    pub version: String,
    pub streaming: bool,
    pub code_diff: bool,
    pub tools: bool,
    pub models: Vec<String>,
}

// ── ACP Connection state ───────────────────────────────────────────────

#[derive(Debug, Clone)]
struct AcpConnection {
    thread_id: String,
    agent_id: String,
    capabilities: AcpCapabilities,
}

pub struct AcpState {
    connections: HashMap<String, AcpConnection>,
}

impl AcpState {
    pub fn new() -> Self {
        Self {
            connections: HashMap::new(),
        }
    }
}

// ── Agent ID to ACP model mapping ─────────────────────────────────────

fn get_agent_model(agent_id: &str) -> String {
    match agent_id {
        id if id.starts_with("se-") => "claude-sonnet-4-20250514".to_string(),
        id if id.starts_with("tl-") => "claude-sonnet-4-20250514".to_string(),
        id if id.starts_with("sec-") => "gemini-2.5-pro".to_string(),
        id if id.starts_with("qa-") => "gemini-2.5-flash".to_string(),
        id if id.starts_with("de-") => "claude-sonnet-4-20250514".to_string(),
        id if id.starts_with("ml-") => "gemini-2.5-pro".to_string(),
        id if id.starts_with("devops-") => "claude-sonnet-4-20250514".to_string(),
        _ => "claude-sonnet-4-20250514".to_string(),
    }
}

fn get_agent_provider(agent_id: &str) -> &str {
    match agent_id {
        id if id.starts_with("se-") || id.starts_with("tl-") || id.starts_with("de-") || id.starts_with("devops-") => "claude",
        id if id.starts_with("sec-") || id.starts_with("qa-") || id.starts_with("ml-") => "gemini",
        _ => "claude",
    }
}

// ── Tauri Commands ────────────────────────────────────────────────────

#[tauri::command]
pub fn acp_initialize(
    state: tauri::State<'_, Mutex<AcpState>>,
    thread_id: String,
    agent_id: String,
) -> Result<AcpCapabilities, String> {
    let capabilities = AcpCapabilities {
        version: "1.0.0".to_string(),
        streaming: true,
        code_diff: true,
        tools: true,
        models: vec![get_agent_model(&agent_id)],
    };

    let mut acp_state = state.lock().map_err(|e| e.to_string())?;
    acp_state.connections.insert(
        thread_id.clone(),
        AcpConnection {
            thread_id,
            agent_id,
            capabilities: capabilities.clone(),
        },
    );

    Ok(capabilities)
}

#[tauri::command]
pub fn acp_disconnect(
    state: tauri::State<'_, Mutex<AcpState>>,
    thread_id: String,
) -> Result<(), String> {
    let mut acp_state = state.lock().map_err(|e| e.to_string())?;
    acp_state.connections.remove(&thread_id);
    Ok(())
}

#[tauri::command]
pub fn acp_send_request(
    app: AppHandle,
    state: tauri::State<'_, Mutex<AcpState>>,
    thread_id: String,
    agent_id: String,
    content: String,
) -> Result<AcpResponse, String> {
    let acp_state = state.lock().map_err(|e| e.to_string())?;
    let connection = acp_state
        .connections
        .get(&thread_id)
        .ok_or_else(|| format!("ACP connection not found: {}", thread_id))?;

    // Build ACP JSON-RPC request
    let request = AcpRequest {
        jsonrpc: "2.0".to_string(),
        id: serde_json::Value::String(thread_id.clone()),
        method: "agent.prompt".to_string(),
        params: Some(serde_json::json!({
            "content": content,
            "agent_id": agent_id,
            "provider": get_agent_provider(&agent_id),
            "model": get_agent_model(&agent_id),
        })),
    };

    // Emit ACP request event to frontend
    let _ = app.emit("acp-request", &request);

    // Return a mock response — in production this would be routed to the actual agent
    let model = &connection.capabilities.models[0];
    let response = AcpResponse {
        jsonrpc: "2.0".to_string(),
        id: serde_json::Value::String(thread_id),
        result: Some(serde_json::json!({
            "content": format!("[ACP processing on {} via {}]\n\nReceived your request. Processing as {}...\n\n```\n{}\n```\n\n---\n*ACP v{} — {}*",
                get_agent_provider(&agent_id),
                model,
                agent_id,
                content.chars().take(200).collect::<String>(),
                connection.capabilities.version,
                agent_id,
            ),
            "model": model,
            "tokens": content.len() as u64,
        })),
        error: None,
    };

    Ok(response)
}

#[tauri::command]
pub fn acp_list_connections(
    state: tauri::State<'_, Mutex<AcpState>>,
) -> Result<Vec<String>, String> {
    let acp_state = state.lock().map_err(|e| e.to_string())?;
    Ok(acp_state.connections.keys().cloned().collect())
}

// ── Tests ─────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── get_agent_model ───────────────────────────────────────────────────

    #[test]
    fn test_get_agent_model_se() {
        assert_eq!(get_agent_model("se-1"), "claude-sonnet-4-20250514");
    }

    #[test]
    fn test_get_agent_model_tl() {
        assert_eq!(get_agent_model("tl-1"), "claude-sonnet-4-20250514");
    }

    #[test]
    fn test_get_agent_model_sec() {
        assert_eq!(get_agent_model("sec-1"), "gemini-2.5-pro");
    }

    #[test]
    fn test_get_agent_model_qa() {
        assert_eq!(get_agent_model("qa-1"), "gemini-2.5-flash");
    }

    #[test]
    fn test_get_agent_model_de() {
        assert_eq!(get_agent_model("de-1"), "claude-sonnet-4-20250514");
    }

    #[test]
    fn test_get_agent_model_ml() {
        assert_eq!(get_agent_model("ml-1"), "gemini-2.5-pro");
    }

    #[test]
    fn test_get_agent_model_devops() {
        assert_eq!(get_agent_model("devops-1"), "claude-sonnet-4-20250514");
    }

    #[test]
    fn test_get_agent_model_unknown() {
        assert_eq!(get_agent_model("unknown-id"), "claude-sonnet-4-20250514");
    }

    // ── get_agent_provider ────────────────────────────────────────────────

    #[test]
    fn test_get_agent_provider_claude_agents() {
        assert_eq!(get_agent_provider("se-1"), "claude");
        assert_eq!(get_agent_provider("tl-1"), "claude");
        assert_eq!(get_agent_provider("de-1"), "claude");
        assert_eq!(get_agent_provider("devops-1"), "claude");
    }

    #[test]
    fn test_get_agent_provider_gemini_agents() {
        assert_eq!(get_agent_provider("sec-1"), "gemini");
        assert_eq!(get_agent_provider("qa-1"), "gemini");
        assert_eq!(get_agent_provider("ml-1"), "gemini");
    }

    #[test]
    fn test_get_agent_provider_unknown() {
        assert_eq!(get_agent_provider("unknown"), "claude");
    }

    // ── AcpState ──────────────────────────────────────────────────────────

    #[test]
    fn test_acp_state_new_is_empty() {
        let state = AcpState::new();
        assert!(state.connections.is_empty());
    }

    #[test]
    fn test_acp_state_insert_and_list() {
        let mut state = AcpState::new();
        let caps = AcpCapabilities {
            version: "1.0.0".to_string(),
            streaming: true,
            code_diff: true,
            tools: true,
            models: vec!["claude-sonnet-4-20250514".to_string()],
        };

        state.connections.insert(
            "thread-1".to_string(),
            AcpConnection {
                thread_id: "thread-1".to_string(),
                agent_id: "se-1".to_string(),
                capabilities: caps.clone(),
            },
        );

        assert_eq!(state.connections.len(), 1);
        let keys: Vec<&String> = state.connections.keys().collect();
        assert_eq!(keys, vec!["thread-1"]);

        let connection = state.connections.get("thread-1").unwrap();
        assert_eq!(connection.agent_id, "se-1");
        assert_eq!(connection.capabilities.version, "1.0.0");
    }

    #[test]
    fn test_acp_state_remove_connection() {
        let mut state = AcpState::new();
        let caps = AcpCapabilities {
            version: "1.0.0".to_string(),
            streaming: true,
            code_diff: true,
            tools: true,
            models: vec![],
        };

        state.connections.insert(
            "thread-1".to_string(),
            AcpConnection {
                thread_id: "thread-1".to_string(),
                agent_id: "se-1".to_string(),
                capabilities: caps,
            },
        );

        state.connections.remove("thread-1");
        assert!(state.connections.is_empty());
    }

    #[test]
    fn test_acp_state_multiple_connections() {
        let mut state = AcpState::new();
        let caps = AcpCapabilities {
            version: "1.0.0".to_string(),
            streaming: true,
            code_diff: true,
            tools: true,
            models: vec![],
        };

        for i in 0..3 {
            state.connections.insert(
                format!("thread-{}", i),
                AcpConnection {
                    thread_id: format!("thread-{}", i),
                    agent_id: format!("agent-{}", i),
                    capabilities: caps.clone(),
                },
            );
        }

        assert_eq!(state.connections.len(), 3);
    }

    // ── AcpCapabilities ──────────────────────────────────────────────────

    #[test]
    fn test_acp_capabilities_default() {
        let capabilities = AcpCapabilities {
            version: "1.0.0".to_string(),
            streaming: true,
            code_diff: true,
            tools: true,
            models: vec!["claude-sonnet-4-20250514".to_string()],
        };

        assert!(capabilities.streaming);
        assert!(capabilities.code_diff);
        assert!(capabilities.tools);
        assert_eq!(capabilities.models.len(), 1);
    }

    // ── AcpResponse ───────────────────────────────────────────────────────

    #[test]
    fn test_acp_response_serialization() {
        let response = AcpResponse {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::String("test-id".to_string()),
            result: Some(serde_json::json!({"content": "hello"})),
            error: None,
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("2.0"));
        assert!(json.contains("test-id"));
        assert!(json.contains("hello"));
    }

    #[test]
    fn test_acp_response_with_error() {
        let response = AcpResponse {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(serde_json::Number::from(1)),
            result: None,
            error: Some(AcpError {
                code: -32601,
                message: "Method not found".to_string(),
                data: None,
            }),
        };

        assert!(response.error.is_some());
        assert_eq!(response.error.as_ref().unwrap().code, -32601);
    }

    // ── AcpRequest ────────────────────────────────────────────────────────

    #[test]
    fn test_acp_request_serialization() {
        let request = AcpRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::String("req-1".to_string()),
            method: "agent.prompt".to_string(),
            params: Some(serde_json::json!({"content": "hello"})),
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("agent.prompt"));
        assert!(json.contains("hello"));
    }

    #[test]
    fn test_acp_request_without_params() {
        let request = AcpRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Null,
            method: "agent.ping".to_string(),
            params: None,
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("agent.ping"));
        assert!(!json.contains("params"));
    }
}

