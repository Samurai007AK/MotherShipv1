// src-tauri/src/commands/file_commands.rs
//
// Tauri IPC commands for file system operations.

use serde::Serialize;
use std::path::PathBuf;

/// A file entry returned from the project scanner.
#[derive(Debug, Clone, Serialize)]
pub struct FileEntry {
    /// Relative path from project root (e.g., "src/components/App.tsx")
    pub path: String,
    /// File name (e.g., "App.tsx")
    pub name: String,
    /// File extension without dot (e.g., "tsx")
    pub ext: String,
    /// Whether this is a directory
    pub is_dir: bool,
    /// File size in bytes (0 for directories)
    pub size: u64,
}

/// Directories to skip when scanning the project.
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "__pycache__",
    ".cache",
    ".vscode",
    "PLANS",
    "_archive",
];

/// Scan the project directory and return a list of files.
/// Accepts an optional root path override; defaults to the current working directory.
#[tauri::command]
pub async fn list_project_files(root: Option<String>) -> Result<Vec<FileEntry>, String> {
    let root_path = match root {
        Some(r) => PathBuf::from(r),
        None => std::env::current_dir().map_err(|e| e.to_string())?,
    };

    let mut entries = Vec::new();
    scan_directory(&root_path, &root_path, &mut entries, 0)?;

    // Sort by path for consistent ordering
    entries.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(entries)
}

/// Recursively scan a directory, respecting skip rules and max depth.
fn scan_directory(
    dir: &PathBuf,
    root: &PathBuf,
    entries: &mut Vec<FileEntry>,
    depth: u32,
) -> Result<(), String> {
    // Limit depth to prevent runaway recursion
    if depth > 10 {
        return Ok(());
    }

    let read_dir = std::fs::read_dir(dir).map_err(|e| format!("Failed to read {}: {}", dir.display(), e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files and directories (starting with .)
        if file_name.starts_with('.') {
            continue;
        }

        // Skip known non-project directories
        if path.is_dir() && SKIP_DIRS.contains(&file_name.as_str()) {
            continue;
        }

        let relative_path = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string()
            .replace('\\', "/"); // Normalize to forward slashes

        if path.is_dir() {
            entries.push(FileEntry {
                path: relative_path.clone(),
                name: file_name.clone(),
                ext: String::new(),
                is_dir: true,
                size: 0,
            });

            // Recurse into subdirectory
            scan_directory(&path, root, entries, depth + 1)?;
        } else {
            let ext = path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            let size = std::fs::metadata(&path)
                .map(|m| m.len())
                .unwrap_or(0);

            entries.push(FileEntry {
                path: relative_path,
                name: file_name,
                ext,
                is_dir: false,
                size,
            });
        }
    }

    Ok(())
}

/// Read a file's contents as a UTF-8 string.
#[tauri::command]
pub async fn read_file_contents(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

/// Attached file information.
#[derive(Debug, Clone, Serialize)]
pub struct AttachedFile {
    pub path: String,
    pub directory: String,
    pub filename: String,
    pub size: u64,
}

/// Attach a file to a session.
/// Returns file metadata for display in the context explorer.
#[tauri::command]
pub async fn attach_file(file_path: String) -> Result<AttachedFile, String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let metadata = std::fs::metadata(&path).map_err(|e| format!("Failed to read metadata: {}", e))?;

    let directory = path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let filename = path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(AttachedFile {
        path: file_path,
        directory,
        filename,
        size: metadata.len(),
    })
}

/// Get file metadata (size, modified time) without reading contents.
#[tauri::command]
pub async fn get_file_metadata(path: String) -> Result<FileMetadata, String> {
    let file_path = PathBuf::from(&path);

    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    let metadata = std::fs::metadata(&file_path).map_err(|e| format!("Failed to read metadata: {}", e))?;

    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| {
            let duration = t.duration_since(std::time::UNIX_EPOCH).ok()?;
            Some(duration.as_secs())
        })
        .unwrap_or(0);

    Ok(FileMetadata {
        path,
        size: metadata.len(),
        modified_timestamp: modified,
        is_file: metadata.is_file(),
        is_dir: metadata.is_dir(),
    })
}

/// File metadata result.
#[derive(Debug, Clone, Serialize)]
pub struct FileMetadata {
    pub path: String,
    pub size: u64,
    pub modified_timestamp: u64,
    pub is_file: bool,
    pub is_dir: bool,
}
