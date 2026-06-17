// src-tauri/src/memory/mod.rs
//
// Memory Layer — SQLite-backed persistence for notes, context, sessions, and handoffs.
//
// Architecture:
//   Frontend (memoryStore) → Tauri IPC → Rust MemoryStore → SQLite (WAL mode)
//
// The memory layer is the core of Mothership's shared context system.
// All data is persisted to `~/.mothership/memory.db` and available across sessions.

pub mod commands;
pub mod models;
pub mod store;

pub use models::*;
pub use store::MemoryStore;
