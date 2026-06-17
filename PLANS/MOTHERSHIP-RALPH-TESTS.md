# Mothership — Ralph-Loop Test Specifications

**Last Updated:** 2026-06-16
**Status:** Test Plan
**Scope:** Unit tests, integration tests, and property tests for all Rust modules in the Ralph-loop engine
**Test Framework:** `cargo test` + `tokio::test` for async, `tempfile` for filesystem tests, `serial_test` for stateful tests

---

## Overview

This document specifies every test for the Mothership Ralph-loop Rust modules. Tests are organized by module and cover:

- **Unit tests** — Pure functions, type serialization, error parsing
- **Integration tests** — Module interactions, file I/O with temp directories, git operations
- **Property tests** — Invariant checks across inputs (where applicable)

**File locations:** All unit tests live in `#[cfg(test)] mod tests` within each source file. Integration tests live in `src-tauri/tests/`.

---

## Module 1: `loop_controller`

### Source files
- `src-tauri/src/loop_controller/mod.rs`
- `src-tauri/src/loop_controller/completion_detector.rs`

---

### 1.1 Type Serialization

| Test | Description | Assert |
|------|-------------|--------|
| `test_task_serialize_deserialize` | Serialize a `Task` to JSON and deserialize back | Fields match original |
| `test_task_json_field_names_match_prd` | Deserialize a real prd.json `userStories` entry | `#[serde(rename)]` produces correct camelCase keys (`id`, `title`, `acceptanceCriteria`, `priority`, `passes`) |
| `test_prd_json_deserialize` | Deserialize a complete prd.json document with `branchName` and `userStories` | All fields populated correctly, `user_stories` contains `Vec<Task>` |
| `test_prd_json_serializes_to_camel_case` | Serialize `PrdJson` struct and check output | Keys are `branchName`, `userStories` (not `branch_name`, `user_stories`) |
| `test_iteration_record_serialize` | Round-trip serialize `IterationRecord` | All fields preserved including `DateTime<Utc>` |
| `test_loop_config_serialize` | Round-trip serialize `LoopConfig` | All fields preserved including nested `QualityGateCommands` |
| `test_loop_status_serialize` | Serialize each `LoopStatus` variant | JSON matches enum variant names |
| `test_loop_event_serialize` | Serialize each `LoopEvent` variant | JSON preserves variant data fields |
| `test_quality_gate_summary_serialize` | Round-trip `QualityGateSummary` with `Vec<CommandResult>` | Nested structures preserved |
| `test_loop_result_serialize` | Round-trip `LoopResult` | Status, iterations, duration, history all preserved |

### 1.2 LoopController — State Machine

| Test | Description | Assert |
|------|-------------|--------|
| `test_controller_new_initializes_idle` | Create `LoopController::new()` with a valid config | State status is `Idle`, `current_iteration` is 0, tasks loaded from prd.json |
| `test_controller_new_no_prd_file` | Create controller pointing to a directory without `prd.json` | Tasks list is empty, no error |
| `test_controller_new_loads_tasks` | Create controller with a temp directory containing a valid `prd.json` | `state.tasks` contains the correct number of tasks with correct fields |
| `test_controller_new_generates_unique_id` | Create two controllers | Both have different `state.id` values (UUID v4) |
| `test_pause_from_running` | Set status to `Running`, call `pause()` | Status changes to `Paused` |
| `test_pause_from_idle_noop` | Call `pause()` when status is `Idle` | Status remains `Idle` |
| `test_pause_from_completed_noop` | Call `pause()` when status is `Completed` | Status remains `Completed` |
| `test_resume_from_paused` | Set status to `Paused`, call `resume()` | Status changes to `Running` |
| `test_resume_from_idle_noop` | Call `resume()` when status is `Idle` | Status remains `Idle` |
| `test_cancel_any_state` | Call `cancel()` from `Running`, `Paused`, `Idle` | Status becomes `Cancelled` in all cases |
| `test_get_state_returns_reference` | Call `get_state()` | Returns immutable reference to current `LoopState` |

### 1.3 LoopController — Stopping Conditions

| Test | Description | Assert |
|------|-------------|--------|
| `test_should_stop_at_max_iterations` | Set `current_iteration >= config.max_iterations` | `should_stop()` returns `Ok(true)` |
| `test_should_stop_at_timeout` | Set `start_time` far in the past, `timeout_ms` small | `should_stop()` returns `Ok(true)` |
| `test_should_stop_on_consecutive_errors` | Push 3+ failed `IterationRecord`s to history | `should_stop()` returns `Ok(true)` |
| `test_should_stop_on_success_after_errors` | Push 2 failed then 1 successful record | `should_stop()` returns `Ok(false)` (consecutive broken) |
| `test_should_stop_all_tasks_complete` | Set all tasks `passes: true` | `should_stop()` returns `Ok(true)` |
| `test_should_not_stop_initially` | Fresh controller with tasks that haven't passed | `should_stop()` returns `Ok(false)` |

### 1.4 LoopController — Task Selection

| Test | Description | Assert |
|------|-------------|--------|
| `test_pick_next_task_highest_priority` | Tasks with priorities [3, 1, 2] | Picks priority 1 |
| `test_pick_next_task_skips_completed` | One task has `passes: true` | Skips it, picks next uncompleted |
| `test_pick_next_task_none_remaining` | All tasks `passes: true` | Returns `None` |
| `test_pick_next_task_empty_tasks` | No tasks loaded | Returns `None` |
| `test_pick_next_task_equal_priority` | Multiple tasks with same priority | Returns the first one (stable order) |

### 1.5 LoopController — Event Emission

| Test | Description | Assert |
|------|-------------|--------|
| `test_events_emitted_during_run` | Create controller with mpsc channel, run loop | Channel receives `IterationStarted`, `IterationCompleted`, `TaskCompleted` events in order |
| `test_loop_completed_event` | Run loop to completion (all tasks pass) | Channel receives `LoopCompleted` with correct `total_iterations` |
| `test_error_event_emitted` | Simulate error condition | Channel receives `Error` event with message |

### 1.6 LoopController — Build Result

| Test | Description | Assert |
|------|-------------|--------|
| `test_build_result_status` | Controller in `Completed` state with history | `LoopResult.status` is `Completed` |
| `test_build_result_counts` | 3 tasks, 2 completed | `tasks_completed` is 2, `tasks_total` is 3 |
| `test_build_result_duration` | Set `start_time` and `end_time` 5s apart | `duration_ms` ≈ 5000 |
| `test_build_result_no_end_time` | `end_time` is `None` | `duration_ms` is 0 |

### 1.7 Load PRD JSON

| Test | Description | Assert |
|------|-------------|--------|
| `test_load_prd_json_valid` | Temp file with valid prd.json | Returns correct `Vec<Task>` |
| `test_load_prd_json_missing_file` | Path doesn't exist | Returns `Ok(Vec::new())` |
| `test_load_prd_json_invalid_json` | File contains `{invalid` | Returns `Err(LoopError)` with serde error |
| `test_load_prd_json_camel_case_fields` | prd.json with `branchName`, `userStories`, `acceptanceCriteria` | Deserializes correctly (serde renames) |

---

## Module 2: `completion_detector`

### Source file
- `src-tauri/src/loop_controller/completion_detector.rs`

---

### 2.1 Loop-Level Detection

| Test | Description | Assert |
|------|-------------|--------|
| `test_detect_all_tasks_pass` | All tasks `passes: true` | Returns `true` |
| `test_detect_not_all_tasks_pass` | One task `passes: false` | Returns `false` |
| `test_detect_explicit_complete_tag` | Last iteration result contains `<promise>COMPLETE</promise>` | Returns `true` even if some tasks haven't passed |
| `test_detect_no_iterations_all_tasks_pass` | Empty iterations, all tasks pass | Returns `true` |
| `test_detect_no_iterations_no_tasks` | Empty iterations, empty tasks | Returns `true` (vacuously true) |
| `test_detect_partial_completion` | 3 tasks, 2 pass, no explicit tag | Returns `false` |

### 2.2 Output-Level Detection

| Test | Description | Assert |
|------|-------------|--------|
| `test_detect_in_output_complete_tag` | Output contains `<promise>COMPLETE</promise>` | Returns `true` |
| `test_detect_in_output_done_signal` | Output contains `Done!` | Returns `true` |
| `test_detect_in_output_complete_signal` | Output contains `Complete!` | Returns `true` |
| `test_detect_in_output_all_tests_pass` | Output contains `All tests pass` | Returns `true` |
| `test_detect_in_output_build_successful` | Output contains `Build successful` | Returns `true` |
| `test_detect_in_output_checkmark` | Output contains `✓` | Returns `true` |
| `test_detect_in_output_emoji_checkmark` | Output contains `✅` | Returns `true` |
| `test_detect_in_output_no_signal` | Output is just regular terminal output | Returns `false` |
| `test_detect_in_output_partial_match_no_false_positive` | Output contains `Doneness` or `Completedly` (not exact match) | Returns `false` for signals that require exact match |

---

## Module 3: `quality_gate`

### Source file
- `src-tauri/src/quality_gate/mod.rs`

---

### 3.1 Type Serialization

| Test | Description | Assert |
|------|-------------|--------|
| `test_gate_command_serialize` | Round-trip `GateCommand` with all fields | `id`, `name`, `command`, `env_vars`, `enabled`, `blocking` preserved |
| `test_quality_gate_config_default` | `QualityGateConfig::default()` | All `Option` fields are `None`, `custom` is empty, `timeout_seconds` is 120, `fail_fast` is `true`, `parallel` is `false` |
| `test_gate_result_serialize` | Round-trip `GateResult` with parsed errors | All fields including `Vec<ParsedError>` preserved |
| `test_parsed_error_serialize` | Round-trip `ParsedError` | `file`, `line`, `column`, `message`, `severity`, `code` preserved |
| `test_error_severity_serialize` | Serialize each `ErrorSeverity` variant | JSON is `"Error"`, `"Warning"`, `"Info"` |
| `test_quality_gate_report_serialize` | Round-trip `QualityGateReport` | All fields including `Vec<GateResult>` preserved |

### 3.2 Error Parsing — TypeScript

| Test | Description | Assert |
|------|-------------|--------|
| `test_parse_ts_error_single` | Single TypeScript error: `error TS2322: Type 'string'...\n  at file.ts:10:5` | Parsed with `file: "file.ts"`, `line: 10`, `column: 5`, `code: "TS2322"` |
| `test_parse_ts_error_multiple` | 3 TypeScript errors in output | 3 `ParsedError` entries |
| `test_parse_ts_error_no_match` | Output without TypeScript errors | Empty vec |

### 3.3 Error Parsing — Rust

| Test | Description | Assert |
|------|-------------|--------|
| `test_parse_rust_error_single` | `error[E0308]: mismatched types\n  --> src/main.rs:15:9` | `file: "src/main.rs"`, `line: 15`, `column: 9`, `code: "E0308"` |
| `test_parse_rust_error_multiple` | 2 Rust errors | 2 entries |
| `test_parse_rust_error_no_match` | Output without Rust errors | Empty vec |

### 3.4 Error Parsing — Python

| Test | Description | Assert |
|------|-------------|--------|
| `test_parse_python_error_single` | `app.py:42:5: error: Incompatible return value type [return-value]` | `file: "app.py"`, `line: 42`, `column: 5`, `code: "return-value"` |
| `test_parse_python_error_multiple` | 2 Python errors | 2 entries |
| `test_parse_python_error_no_match` | Clean output | Empty vec |

### 3.5 Error Parsing — Test Failures

| Test | Description | Assert |
|------|-------------|--------|
| `test_parse_pytest_failure_single` | `FAILED tests/test_app.py::test_login - AssertionError` | `message` contains `test_login failed: AssertionError` |
| `test_parse_pytest_failure_multiple` | 3 pytest failures | 3 entries |
| `test_parse_pytest_no_match` | Clean test output | Empty vec |

### 3.6 Error Parsing — Lint Errors

| Test | Description | Assert |
|------|-------------|--------|
| `test_parse_eslint_error` | `src/app.ts:10:5: error - Unexpected any [no-explicit-any]` | `severity: Error`, `code: Some("no-explicit-any")` |
| `test_parse_eslint_warning` | `src/utils.ts:3:1: warning - Missing return type` | `severity: Warning` |
| `test_parse_eslint_no_code` | `src/app.ts:10:5: error - Missing semicolon` | `code: None` |
| `test_parse_eslint_no_match` | Clean eslint output | Empty vec |

### 3.7 Error Parsing — Generic

| Test | Description | Assert |
|------|-------------|--------|
| `test_parse_generic_error_pattern` | `Error: Something went wrong` | Parsed with empty `file`, `line: 0` |
| `test_parse_generic_lowercase` | `error: module not found` | Parsed correctly |
| `test_parse_generic_failed` | `FAILED: Build did not complete` | Parsed correctly |
| `test_parse_generic_no_match` | Clean output | Empty vec |

### 3.8 Auto-Detection

| Test | Description | Assert |
|------|-------------|--------|
| `test_detect_node_project` | Temp dir with `package.json` | Config has typecheck (`npx tsc --noEmit`), test (`npm test`), lint (`npx eslint`) |
| `test_detect_rust_project` | Temp dir with `Cargo.toml` | Config has typecheck (`cargo check`), test (`cargo test`), lint (`cargo clippy`) |
| `test_detect_python_project` | Temp dir with `pyproject.toml` | Config has typecheck (`mypy .`), test (`pytest`), lint (`ruff check .`) |
| `test_detect_python_setup_py` | Temp dir with `setup.py` (no `pyproject.toml`) | Python gates detected |
| `test_detect_no_project_files` | Empty temp dir | All gates `None` |
| `test_detect_unknown_project` | Temp dir with only `README.md` | Default config (all `None`) |

### 3.9 QualityGate — Gate Execution

| Test | Description | Assert |
|------|-------------|--------|
| `test_run_gate_passing_command` | Gate with `command: "echo hello"` | `passed: true`, `exit_code: 0`, `stdout` contains "hello" |
| `test_run_gate_failing_command` | Gate with `command: "exit 1"` | `passed: false`, `exit_code: 1` |
| `test_run_gate_stderr` | Gate that writes to stderr | `stderr` contains the output |
| `test_run_gate_custom_working_directory` | Gate with `working_directory: Some("src")` | Command runs in `{project}/src` |
| `test_run_gate_env_vars` | Gate with `env_vars: {"MY_VAR": "hello"}` | Command can access `$MY_VAR` |
| `test_run_gate_disabled_gate` | Config with `enabled: false` gate | Gate is not included in `enabled_gates()` |
| `test_run_gate_timeout` | Gate with `timeout_seconds: 1` running `sleep 10` | Returns `QualityGateError::Timeout` |

### 3.10 QualityGate — Report Generation

| Test | Description | Assert |
|------|-------------|--------|
| `test_run_all_all_pass` | 2 passing gates | `passed: true`, `commit_allowed: true`, `gates_passed: 2`, `gates_failed: 0` |
| `test_run_all_one_fails` | 1 passing + 1 failing gate, `fail_fast: false` | `passed: false`, `commit_allowed: false`, both results present |
| `test_run_all_fail_fast` | 1 failing gate first, `fail_fast: true` | Only 1 result (stopped early) |
| `test_run_all_no_gates` | Empty config | `passed: true`, `results` is empty, `gates_passed: 0` |
| `test_run_all_report_has_uuid` | Any run | `report.id` is a valid UUID string |
| `test_run_all_report_has_timestamp` | Any run | `report.timestamp` is within 1 second of now |

### 3.11 CommitGuard

| Test | Description | Assert |
|------|-------------|--------|
| `test_commit_guard_gates_pass_auto_commit_true` | All gates pass, `auto_commit: true` | `committed: true`, `report` is `Some`, `error` is `None` |
| `test_commit_guard_gates_pass_auto_commit_false` | All gates pass, `auto_commit: false` | `committed: false`, `report` is `Some`, `error` is `None` |
| `test_commit_guard_gates_fail` | Gate fails | `committed: false`, `error: Some("Quality gates failed")` |

---

## Module 4: `archive`

### Source files
- `src-tauri/src/archive/mod.rs`
- `src-tauri/src/archive/branch_detector.rs`

---

### 4.1 BranchDetector — Unit Tests

| Test | Description | Assert |
|------|-------------|--------|
| `test_extract_feature_name_feature_prefix` | `extract_feature_name("feature/login")` | `"login"` |
| `test_extract_feature_name_feat_prefix` | `extract_feature_name("feat/auth")` | `"auth"` |
| `test_extract_feature_name_ralph_prefix` | `extract_feature_name("ralph/task-priority")` | `"task-priority"` |
| `test_extract_feature_name_bugfix_prefix` | `extract_feature_name("bugfix/null-check")` | `"null-check"` |
| `test_extract_feature_name_fix_prefix` | `extract_feature_name("fix/typo")` | `"typo"` |
| `test_extract_feature_name_no_prefix` | `extract_feature_name("my-feature")` | `"my-feature"` |
| `test_extract_feature_name_special_chars` | `extract_feature_name("feature/my cool feature!")` | `"my-cool-feature"` |
| `test_extract_feature_name_underscores` | `extract_feature_name("feature/my_feature")` | `"my_feature"` |
| `test_extract_feature_name_empty_after_strip` | `extract_feature_name("feature/")` | `""` |
| `test_extract_feature_name_nested_prefixes` | `extract_feature_name("feature/ralph/task")` | `"ralph-task"` |

### 4.2 BranchDetector — File-Based Detection

| Test | Description | Assert |
|------|-------------|--------|
| `test_get_last_branch_no_file` | `.last-branch` file doesn't exist | Returns `Ok(None)` |
| `test_get_last_branch_empty_file` | File exists but is empty | Returns `Ok(None)` |
| `test_get_last_branch_valid` | File contains `"feature/login\n"` | Returns `Ok(Some("feature/login"))` |
| `test_set_last_branch_creates_dir` | Parent `.mothership/` dir doesn't exist | Creates directory and file |
| `test_set_last_branch_overwrites` | File already exists with different content | File updated to new branch |

### 4.3 BranchDetector — Change Detection

| Test | Description | Assert |
|------|-------------|--------|
| `test_has_branch_changed_initial` | No `.last-branch` file, git repo on a branch | Returns `BranchChange::Initial { branch }`, file created |
| `test_has_branch_changed_same` | `.last-branch` matches current git branch | Returns `BranchChange::NoChange` |
| `test_has_branch_changed_different` | `.last-branch` has `"main"`, current is `"feature/login"` | Returns `BranchChange::Changed { from: "main", to: "feature/login" }` |
| `test_has_branch_changed_detached_head` | Git repo in detached HEAD state | Returns `BranchChange::Detached` |

### 4.4 ArchiveManager — PrdJson Serde

| Test | Description | Assert |
|------|-------------|--------|
| `test_archive_prd_json_serde_roundtrip` | Serialize then deserialize `PrdJson` | `branchName` and `userStories` camelCase preserved |
| `test_archive_prd_json_from_real_format` | Deserialize a real prd.json string | All fields populated, `user_stories` contains correct `Task` entries |

### 4.5 ArchiveManager — Manifest

| Test | Description | Assert |
|------|-------------|--------|
| `test_archive_manifest_serialize` | Round-trip `ArchiveManifest` | All fields including `DateTime<Utc>` and `Vec<String>` preserved |
| `test_archive_status_variants` | Serialize/deserialize each `ArchiveStatus` | `"InProgress"`, `"Completed"`, `"Failed"`, `"Cancelled"` |
| `test_archive_entry_serialize` | Round-trip `ArchiveEntry` | `manifest`, `path`, `size_kb` preserved |

### 4.6 ArchiveManager — Filesystem Operations

| Test | Description | Assert |
|------|-------------|--------|
| `test_archive_current_session_creates_dir` | Archive with valid temp project | Directory created under `archives/` with timestamp-feature format |
| `test_archive_current_session_writes_prd` | Archive session | `prd.json` written with correct `branchName` (camelCase) |
| `test_archive_current_session_writes_progress` | Archive session | `progress.txt` copied from project |
| `test_archive_current_session_writes_manifest` | Archive session | `manifest.json` written with valid JSON |
| `test_archive_current_session_updates_index` | Archive twice | `index.json` contains both manifests, sorted newest first |
| `test_archive_current_session_creates_terminal_snapshots_dir` | Archive session | `terminal-snapshots/` directory created |
| `test_archive_current_session_returns_entry` | Archive session | Returned `ArchiveEntry` has valid `id`, `path`, `size_kb > 0` |

### 4.7 ArchiveManager — Index Management

| Test | Description | Assert |
|------|-------------|--------|
| `test_update_archive_index_first_entry` | No existing index | `index.json` created with 1 entry |
| `test_update_archive_index_append` | Existing index with 1 entry | `index.json` has 2 entries |
| `test_update_archive_index_sorted_newest_first` | Add entries at different times | Most recent `archived_at` first |

---

## Integration Tests

### Source directory: `src-tauri/tests/`

---

### IT-1: LoopController + CompletionDetector Integration

| Test | Description | Assert |
|------|-------------|--------|
| `test_controller_completes_on_all_tasks_passing` | Create controller with 2 tasks, manually mark both as passing in each iteration | Loop completes after 2 iterations, `LoopResult.status` is `Completed` |
| `test_controller_stops_on_explicit_complete_tag` | Run iteration that returns `<promise>COMPLETE</promise>` in result | Loop completes even if not all tasks have `passes: true` |
| `test_controller_stops_at_max_iterations` | Set `max_iterations: 3` with 10 tasks | Stops after 3 iterations, `LoopResult.iterations == 3` |

### IT-2: QualityGate + Error Parsing Integration

| Test | Description | Assert |
|------|-------------|--------|
| `test_run_all_typecheck_fails_parsing` | Gate runs `cargo check` (or mock) that produces Rust error output | `QualityGateReport.results[0].parsed_errors` contains correctly parsed error |
| `test_run_all_lint_fails_parsing` | Gate runs command producing ESLint output | Parsed errors match file/line/column/code |

### IT-3: ArchiveManager + BranchDetector Integration

| Test | Description | Assert |
|------|-------------|--------|
| `test_check_and_archive_on_branch_change` | Set up temp git repo, change branch, call `check_and_archive()` | Archive created, `.last-branch` updated |
| `test_check_and_archive_no_change` | Same branch as last known | Returns `None`, no archive created |
| `test_archive_roundtrip_with_prd_json` | Create temp project with prd.json → archive → verify archive dir contains valid prd.json with camelCase keys | Files present, JSON valid |

### IT-4: Full Lifecycle (Temp Directory)

| Test | Description | Assert |
|------|-------------|--------|
| `test_full_lifecycle_prd_to_archive` | 1. Create temp dir with prd.json (2 tasks) 2. Create LoopController 3. Run loop (stub returns `success: false`) 4. Archive session | All files present: `prd.json`, `progress.txt`, `manifest.json`, `index.json` |
| `test_full_lifecycle_prd_serde_roundtrip` | Create prd.json → load via `LoopController::load_prd_json` → archive → read from archive dir | Task data preserved through full cycle |

---

## Test Helpers

### Shared utilities in `src-tauri/tests/common/mod.rs`

```rust
use std::fs;
use tempfile::TempDir;

/// Creates a temp directory with a valid prd.json containing `n` tasks.
pub fn create_test_project(task_count: usize) -> TempDir {
    let dir = TempDir::new().unwrap();
    let tasks: Vec<serde_json::Value> = (0..task_count)
        .map(|i| serde_json::json!({
            "id": format!("US-{:03}", i + 1),
            "title": format!("Task {}", i + 1),
            "description": format!("Description for task {}", i + 1),
            "acceptanceCriteria": [format!("Criterion {}", i + 1)],
            "priority": i + 1,
            "passes": false,
            "notes": ""
        }))
        .collect();

    let prd = serde_json::json!({
        "project": "TestProject",
        "branchName": "feature/test",
        "description": "Test project",
        "userStories": tasks
    });

    fs::write(
        dir.path().join("prd.json"),
        serde_json::to_string_pretty(&prd).unwrap(),
    )
    .unwrap();

    dir
}

/// Creates a temp directory with a custom prd.json content.
pub fn create_test_project_with_prd(prd_content: &str) -> TempDir {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("prd.json"), prd_content).unwrap();
    dir
}

/// Creates a temp directory with a progress.txt.
pub fn create_test_project_with_progress(content: &str) -> TempDir {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("progress.txt"), content).unwrap();
    dir
}

/// Creates a completed Task (passes: true).
pub fn completed_task(id: &str, title: &str) -> Task {
    Task {
        id: id.to_string(),
        title: title.to_string(),
        description: String::new(),
        acceptance_criteria: Vec::new(),
        priority: 1,
        passes: true,
        notes: String::new(),
        iteration_completed: Some(1),
        files_modified: Vec::new(),
    }
}

/// Creates a pending Task (passes: false).
pub fn pending_task(id: &str, title: &str, priority: usize) -> Task {
    Task {
        id: id.to_string(),
        title: title.to_string(),
        description: String::new(),
        acceptance_criteria: Vec::new(),
        priority,
        passes: false,
        notes: String::new(),
        iteration_completed: None,
        files_modified: Vec::new(),
    }
}

/// Creates a successful IterationRecord.
pub fn success_record(iteration: usize, task_id: &str) -> IterationRecord {
    IterationRecord {
        iteration,
        task_id: task_id.to_string(),
        action: format!("Implement {}", task_id),
        result: "Success".to_string(),
        duration_ms: 1000,
        timestamp: Utc::now(),
        success: true,
        files_modified: vec!["src/app.rs".to_string()],
        tools_used: vec!["terminal".to_string()],
        learnings: vec!["Pattern discovered".to_string()],
    }
}

/// Creates a failed IterationRecord.
pub fn failed_record(iteration: usize, task_id: &str) -> IterationRecord {
    IterationRecord {
        iteration,
        task_id: task_id.to_string(),
        action: format!("Implement {}", task_id),
        result: "Error: compilation failed".to_string(),
        duration_ms: 500,
        timestamp: Utc::now(),
        success: false,
        files_modified: Vec::new(),
        tools_used: vec!["terminal".to_string()],
        learnings: Vec::new(),
    }
}
```

---

## Test Coverage Targets

| Module | Target Coverage | Priority |
|--------|----------------|----------|
| `loop_controller/mod.rs` | 85%+ (state machine, task selection, events) | P0 |
| `completion_detector.rs` | 95%+ (pure functions, easy to test) | P0 |
| `quality_gate/mod.rs` | 80%+ (error parsing, config detection) | P0 |
| `quality_gate/commit_guard.rs` | 70%+ (requires git mock) | P1 |
| `archive/mod.rs` | 75%+ (filesystem-dependent) | P1 |
| `archive/branch_detector.rs` | 85%+ (requires git repo mock) | P1 |

---

## CI Configuration

```yaml
# Example: GitHub Actions workflow for Ralph-loop tests
name: Ralph-Loop Tests
on:
  push:
    paths:
      - 'src-tauri/src/loop_controller/**'
      - 'src-tauri/src/quality_gate/**'
      - 'src-tauri/src/archive/**'
      - 'src-tauri/src/commands/**'
      - 'src-tauri/tests/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - name: Install dependencies
        run: sudo apt-get install -y git
      - name: Run unit tests
        working-directory: src-tauri
        run: cargo test --lib
      - name: Run integration tests
        working-directory: src-tauri
        run: cargo test --test '*'
      - name: Check coverage
        working-directory: src-tauri
        run: cargo tarpaulin --out xml --output-dir coverage
```

---

## Test Execution Commands

```bash
# Run all Ralph-loop tests
cd src-tauri
cargo test --lib -- loop_controller quality_gate archive

# Run only unit tests (no integration)
cargo test --lib

# Run only integration tests
cargo test --test '*'

# Run a specific test module
cargo test loop_controller::tests
cargo test quality_gate::tests
cargo test archive::tests
cargo test archive::branch_detector::tests

# Run with output
cargo test -- --nocapture

# Run a single test
cargo test test_prd_json_deserialize -- --exact

# Measure test execution time
cargo test -- --report-time

# Check coverage (requires cargo-tarpaulin)
cargo tarpaulin --lib -- out Html
```

---

## References

- [`MOTHERSHIP-RALPH-GLOSSARY.md`](./MOTHERSHIP-RALPH-GLOSSARY.md) — Canonical type definitions tested above
- [`QUALITY-GATE.md`](./QUALITY-GATE.md) — Error parsing patterns tested above
- [`MOTHERSHIP-RALPH-COMMANDS.md`](./MOTHERSHIP-RALPH-COMMANDS.md) — IPC commands tested in integration tests
- [`TESTING-STRATEGY.md`](./TESTING-STRATEGY.md) — Project-wide testing strategy
- [`AUTO-ARCHIVE.md`](./AUTO-ARCHIVE.md) — Archive system design tested above

---

*Last updated: 2026-06-16*
