// src-tauri/src/commands/mod.rs
//
// Tauri IPC commands — Bridge between the frontend (React/Zustand) and
// the Rust backend (LoopController, QualityGate, ArchiveManager).
//
// Command handlers live in the submodules below.

pub mod loop_commands;
pub mod quality_gate_commands;
pub mod archive_commands;
pub mod file_commands;
pub mod sidecar_commands;
pub mod summary_commands;
pub mod model_commands;
pub mod crewai_commands;
pub mod git_commands;
pub mod buffer_snapshot_commands;
pub mod browser_commands;
pub mod checkpoint_commands;
pub mod performance_commands;
