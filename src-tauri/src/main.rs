// Mothership — Desktop AI Control Center
// Tauri application entry point.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod archive;
mod commands;
mod loop_controller;
mod memory;
mod process;
mod quality_gate;
mod terminal;

use std::sync::Arc;
use tokio::sync::RwLock;

fn main() {
    tracing_subscriber::fmt::init();

    // Shared state: the active loop controller (if any)
    let loop_controller: Arc<RwLock<Option<loop_controller::LoopController>>> =
        Arc::new(RwLock::new(None));

    // Terminal manager: manages per-agent PTY sessions
    let terminal_manager = terminal::TerminalManager::new();

    // Sidecar manager: manages Python sidecar processes
    let sidecar_manager = Arc::new(process::SidecarManager::new());

    // Memory store: SQLite-backed persistence for notes, context, handoffs
    let db_path = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("mothership")
        .join("memory.db");

    let memory_store = memory::MemoryStore::open(&db_path)
        .expect("Failed to initialize memory database");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(loop_controller)
        .manage(terminal_manager)
        .manage(sidecar_manager)
        .manage(memory_store)
        .invoke_handler(tauri::generate_handler![
            // Loop commands
            commands::loop_commands::start_loop,
            commands::loop_commands::pause_loop,
            commands::loop_commands::resume_loop,
            commands::loop_commands::cancel_loop,
            commands::loop_commands::get_loop_state,
            commands::loop_commands::retry_loop,
            // Quality gate commands
            commands::quality_gate_commands::run_quality_gates,
            commands::quality_gate_commands::auto_detect_quality_gate_config,
            // Terminal commands
            terminal::commands::spawn_terminal_session,
            terminal::commands::write_terminal_input,
            terminal::commands::resize_terminal_session,
            terminal::commands::close_terminal_session,
            terminal::commands::list_terminal_sessions,
            terminal::commands::get_terminal_session,
            // Memory commands
            memory::commands::save_memory,
            memory::commands::delete_memory,
            memory::commands::query_memory,
            memory::commands::list_memory,
            memory::commands::list_memory_sessions,
            memory::commands::save_session,
            memory::commands::save_handoff,
            memory::commands::list_handoffs,
            memory::commands::memory_entry_count,
            memory::commands::compile_handoff,
            memory::commands::save_context_snapshot,
            memory::commands::search_memory,
            memory::commands::rebuild_fts_index,
            memory::commands::archive_old_sessions,
            memory::commands::prune_old_snapshots,
            memory::commands::list_archived_sessions,
            memory::commands::restore_archived_session,
            // File commands
            commands::file_commands::list_project_files,
            commands::file_commands::read_file_contents,
            commands::file_commands::attach_file,
            commands::file_commands::get_file_metadata,
            // Sidecar commands
            commands::sidecar_commands::spawn_sidecar,
            commands::sidecar_commands::kill_sidecar,
            commands::sidecar_commands::check_sidecar_health,
            commands::sidecar_commands::list_sidecars,
            // Summary engine commands
            commands::summary_commands::summarize_context,
            commands::summary_commands::check_summary_health,
            // Model router commands
            commands::model_commands::list_ollama_models,
            commands::model_commands::check_ollama_status,
            commands::model_commands::chat_completion,
            commands::model_commands::generate_response,
            // CrewAI handoff commands
            commands::crewai_commands::crewai_handoff,
            commands::crewai_commands::check_crewai_available,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mothership");
}
