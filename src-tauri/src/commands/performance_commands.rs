// src-tauri/src/commands/performance_commands.rs
//
// IPC commands for performance monitoring — queries system and process memory
// usage via the sysinfo crate. Used by the frontend PerformancePanel to
// display live metrics and trigger memory-pressure warnings.

use serde::{Deserialize, Serialize};
use sysinfo::{Pid, System};

/// Snapshot of performance metrics sent to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceSnapshot {
    /// Total physical RAM in MB.
    pub total_memory_mb: u64,
    /// Used physical RAM in MB (system-wide).
    pub used_memory_mb: u64,
    /// Available (free) physical RAM in MB.
    pub available_memory_mb: u64,
    /// RAM used by *this* process (Mothership) in MB.
    pub process_memory_mb: u64,
    /// Fraction of total RAM used by this process (0.0 – 1.0).
    pub process_memory_fraction: f64,
    /// Total swap in MB (0 if no swap).
    pub total_swap_mb: u64,
    /// Used swap in MB.
    pub used_swap_mb: u64,
    /// Number of logical CPUs.
    pub cpu_count: usize,
    /// Average CPU usage (0.0 – 100.0).
    pub cpu_usage: f32,
    /// Whether the process is over the recommended 200 MB idle threshold.
    pub over_threshold: bool,
}

/// Get a single snapshot of current performance metrics.
///
/// This command refreshes sysinfo's system data and reads both
/// system-wide RAM and this process's private resident set size.
#[tauri::command]
pub async fn get_performance_snapshot() -> Result<PerformanceSnapshot, String> {
    let mut system = System::new_all();
    system.refresh_all();

    let total_memory = system.total_memory();
    let used_memory = system.used_memory();
    let available_memory = system.available_memory();
    let total_swap = system.total_swap();
    let used_swap = system.used_swap();
    let cpu_count = system.cpus().len();
    let cpu_usage: f32 = system.cpus().iter().map(|c| c.cpu_usage()).sum::<f32>() / cpu_count.max(1) as f32;

    // Get this process's private memory (resident set size)
    let current_pid = Pid::from_u32(std::process::id());
    let process_memory = system
        .process(current_pid)
        .map(|p| p.memory() as u64) // bytes
        .unwrap_or(0);

    let process_memory_mb = process_memory / (1024 * 1024);
    let total_memory_mb = total_memory / (1024 * 1024);
    let used_memory_mb = used_memory / (1024 * 1024);
    let available_memory_mb = available_memory / (1024 * 1024);
    let total_swap_mb = total_swap / (1024 * 1024);
    let used_swap_mb = used_swap / (1024 * 1024);

    let process_memory_fraction = if total_memory > 0 {
        process_memory as f64 / total_memory as f64
    } else {
        0.0
    };

    Ok(PerformanceSnapshot {
        total_memory_mb,
        used_memory_mb,
        available_memory_mb,
        process_memory_mb,
        process_memory_fraction,
        total_swap_mb,
        used_swap_mb,
        cpu_count,
        cpu_usage,
        over_threshold: process_memory_mb > 200,
    })
}

/// Performance threshold configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThresholdConfig {
    /// Warn when process RAM exceeds this value (MB).
    pub warn_memory_mb: u64,
    /// Critical when process RAM exceeds this value (MB).
    pub critical_memory_mb: u64,
}

impl Default for ThresholdConfig {
    fn default() -> Self {
        Self {
            warn_memory_mb: 150,
            critical_memory_mb: 300,
        }
    }
}
