// Mothership — Desktop AI Control Center
// Tauri application entry point.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod acp;
mod archive;
mod commands;
mod execution_engine;
mod loop_controller;
mod memory;
mod process;
mod quality_gate;
mod status_heuristics;
mod terminal;

use execution_engine::ExecutionEngine;
use std::sync::Arc;
use std::sync::Mutex;
use tokio::sync::RwLock;
use tokio::sync::mpsc;

fn main() {
    tracing_subscriber::fmt::init();

    // Event channel for execution engine → frontend bridging
    let (execution_tx, _execution_rx) = mpsc::unbounded_channel();

    // Execution engine: manages parallel agent execution groups
    // The app handle is set via .setup() below
    let execution_engine: Arc<RwLock<ExecutionEngine>> =
        Arc::new(RwLock::new(ExecutionEngine::new(execution_tx)));

    // Shared state: the active loop controller (if any)
    let loop_controller: Arc<RwLock<Option<loop_controller::LoopController>>> =
        Arc::new(RwLock::new(None));

    // Terminal manager: manages per-agent PTY sessions
    let terminal_manager = terminal::TerminalManager::new();

    // Sidecar manager: manages Python sidecar processes
    let sidecar_manager = Arc::new(process::SidecarManager::new());

    // CrewAI bridge state: persistent handles for the crewai-bridge sidecar
    let crewai_bridge = Arc::new(tokio::sync::Mutex::new(
        commands::crewai_commands::CrewaiBridgeConnection::new()
    ));

    // Memory store: SQLite-backed persistence for notes, context, handoffs
    let db_path = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("mothership")
        .join("memory.db");

    let memory_store = memory::MemoryStore::open(&db_path)
        .expect("Failed to initialize memory database");

    let ee = execution_engine.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(move |app| {
            // Set the app handle on the execution engine for frontend event bridging
            let mut guard = ee.blocking_write();
            guard.set_app_handle(app.handle().clone());
            Ok(())
        })
        .manage(Mutex::new(acp::AcpState::new()))
        .manage(Mutex::new(status_heuristics::StatusHeuristicsState::new()))
        .manage(loop_controller)
        .manage(execution_engine)
        .manage(terminal_manager)
        .manage(sidecar_manager)
        .manage(crewai_bridge)
        .manage(memory_store)
        .invoke_handler(tauri::generate_handler![
            // Execution engine commands
            execution_engine::commands::start_execution_group,
            execution_engine::commands::get_execution_group,
            execution_engine::commands::list_execution_groups,
            execution_engine::commands::cancel_execution_group,
            execution_engine::commands::add_execution_context,
            // Loop commands
            commands::loop_commands::start_loop,
            commands::loop_commands::pause_loop,
            commands::loop_commands::resume_loop,
            commands::loop_commands::cancel_loop,
            commands::loop_commands::retry_loop,
            // Checkpoint commands (Session Time-Travel)
            commands::checkpoint_commands::get_loop_state,
            commands::checkpoint_commands::save_loop_checkpoint,
            commands::checkpoint_commands::list_loop_checkpoints,
            commands::checkpoint_commands::restore_loop_checkpoint,
            commands::checkpoint_commands::fork_loop_checkpoint,
            commands::checkpoint_commands::get_loop_effect_log,
            // Quality gate commands
            commands::quality_gate_commands::run_quality_gates,
            commands::quality_gate_commands::auto_detect_quality_gate_config,
            commands::quality_gate_commands::run_code_review,
            // Terminal commands
            terminal::commands::spawn_terminal_session,
            terminal::commands::write_terminal_input,
            terminal::commands::resize_terminal_session,
            terminal::commands::close_terminal_session,
            terminal::commands::list_terminal_sessions,
            terminal::commands::get_terminal_session,
            terminal::commands::pause_terminal_session,
            terminal::commands::resume_terminal_session,
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
            // Episode memory commands (Hierarchical Memory)
            memory::commands::save_episode_memory,
            memory::commands::query_episode_memory,
            memory::commands::delete_episode_memory,
            memory::commands::promote_episode_memory,
            memory::commands::prune_expired_episodes,
            memory::commands::get_episode_memory_stats,
            // Reconsolidation commands
            memory::commands::list_reconsolidation_flags,
            memory::commands::resolve_reconsolidation_flag,
            // File commands
            commands::file_commands::list_project_files,
            commands::file_commands::read_file_contents,
            commands::file_commands::write_file_contents,
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
            commands::crewai_commands::start_crewai_sidecar,
            commands::crewai_commands::stop_crewai_sidecar,
            commands::crewai_commands::crewai_handoff,
            commands::crewai_commands::check_crewai_available,
            // Git worktree commands
            commands::git_commands::detect_git_project,
            commands::git_commands::create_worktree_workspace,
            commands::git_commands::list_worktree_workspaces,
            commands::git_commands::get_worktree_status,
            commands::git_commands::get_worktree_diff,
            commands::git_commands::delete_worktree_workspace,
            commands::git_commands::sync_worktree_workspace,
            commands::git_commands::commit_worktree_changes,
            commands::git_commands::push_worktree_branch,
            commands::git_commands::check_git_available,
            commands::git_commands::get_worktree_file_diffs,
            commands::git_commands::read_preset_config,
            commands::git_commands::save_preset_config,
            commands::git_commands::run_preset_setup,
            commands::git_commands::run_preset_teardown,
            commands::git_commands::check_editor_available,
            commands::git_commands::open_in_editor,
            commands::git_commands::allocate_worktree_port,
            commands::git_commands::list_worktree_ports,
            commands::git_commands::list_all_port_allocations,
            commands::git_commands::release_worktree_port,
            commands::git_commands::release_all_worktree_ports,
            // Performance monitoring commands
            commands::performance_commands::get_performance_snapshot,
            // Browser WebView commands
            commands::browser_commands::create_browser_window,
            commands::browser_commands::navigate_browser_window,
            commands::browser_commands::close_browser_window,
            commands::browser_commands::list_browser_windows,
            // Terminal buffer snapshot commands
            commands::buffer_snapshot_commands::save_terminal_buffer,
            commands::buffer_snapshot_commands::load_terminal_buffer,
            commands::buffer_snapshot_commands::clear_terminal_buffer,
            commands::buffer_snapshot_commands::list_terminal_buffers,
            // ACP Protocol commands
            acp::acp_initialize,
            acp::acp_disconnect,
            acp::acp_send_request,
            acp::acp_list_connections,
            // Terminal status heuristics commands
            status_heuristics::feed_terminal_status,
            status_heuristics::get_agent_heuristic_status,
            status_heuristics::get_all_heuristic_statuses,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mothership");
}
