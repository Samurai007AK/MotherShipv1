// src-tauri/src/commands/mod.rs
//
// Tauri IPC commands — Bridge between the frontend (React/Zustand) and
// the Rust backend (LoopController, QualityGate, ArchiveManager).
//
// Canonical command documentation: PLANS/MOTHERSHIP-RALPH-COMMANDS.md

pub mod loop_commands;
pub mod quality_gate_commands;
pub mod archive_commands;
pub mod file_commands;
pub mod sidecar_commands;
pub mod summary_commands;
pub mod model_commands;
pub mod crewai_commands;
