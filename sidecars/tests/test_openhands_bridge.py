"""
Tests for the openhands-bridge sidecar.

Tests the sidecar at the unit level — focusing on helper functions
and fallback paths that don't require the OpenHands SDK:

  1. Existence & structure
  2. Fallback helpers (_fallback_run_task, _check_openhands, _get_sandbox_type)
  3. File helpers (handle_list_files, handle_read_file, handle_run_command)
  4. Error handling

Note: Full integration tests require the OpenHands SDK to be installed.
These unit tests validate the fallback path that runs when SDK is absent.

Run with:
  cd sidecars && python -m pytest tests/test_openhands_bridge.py -v
"""

import json
import os
import subprocess
import sys

import pytest

# ────────────────────────────────────────────────────────────────────────────
# Fixtures & Helpers
# ────────────────────────────────────────────────────────────────────────────

SIDECAR_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "openhands-bridge")
)
SIDECAR_MAIN = os.path.join(SIDECAR_DIR, "main.py")


@pytest.fixture
def sidecar_process():
    """Start the openhands-bridge sidecar as a subprocess."""
    assert os.path.exists(SIDECAR_MAIN), (
        f"openhands-bridge main.py not found at {SIDECAR_MAIN}"
    )

    proc = subprocess.Popen(
        [sys.executable, SIDECAR_MAIN],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        cwd=SIDECAR_DIR,
    )

    # Read the "ready" signal
    ready_line = proc.stdout.readline()
    ready = json.loads(ready_line.strip())
    assert ready.get("method") == "ready", (
        f"Expected 'ready' signal, got: {ready_line}"
    )

    yield proc

    if proc.poll() is None:
        try:
            shutdown = json.dumps({
                "jsonrpc": "2.0", "method": "shutdown", "params": {}, "id": 99
            })
            proc.stdin.write(shutdown + "\n")
            proc.stdin.flush()
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
            proc.wait(timeout=2)
    else:
        proc.wait(timeout=2)


def send_request(proc, method, params=None, req_id=1):
    """Send a JSON-RPC request and return the parsed response."""
    request = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params or {},
        "id": req_id,
    }
    proc.stdin.write(json.dumps(request) + "\n")
    proc.stdin.flush()

    response_line = proc.stdout.readline()
    return json.loads(response_line.strip())


# ────────────────────────────────────────────────────────────────────────────
# 1. Existence & Structure
# ────────────────────────────────────────────────────────────────────────────

class TestExistence:
    """Verify the openhands-bridge sidecar files exist."""

    def test_openhands_bridge_directory_exists(self):
        """openhands-bridge directory exists with main.py."""
        assert os.path.isdir(SIDECAR_DIR), f"Directory not found: {SIDECAR_DIR}"
        assert os.path.exists(SIDECAR_MAIN), f"main.py not found: {SIDECAR_MAIN}"

    def test_openhands_bridge_has_required_functions(self):
        """main.py exports required handler and helper functions."""
        with open(SIDECAR_MAIN) as f:
            content = f.read()
        assert "def handle_request" in content
        func_count = content.count("def ")
        assert func_count >= 10, (
            f"Expected at least 10 function definitions, found {func_count}"
        )
        assert "def handle_run_task" in content
        assert "def handle_list_files" in content
        assert "def handle_read_file" in content
        assert "def handle_run_command" in content
        assert "def _fallback_run_task" in content
        assert "def _check_openhands" in content
        assert "def _get_sandbox_type" in content
        assert "def _cleanup_conversation" in content

    def test_openhands_bridge_has_main_entry(self):
        """main.py has the main() entry point."""
        with open(SIDECAR_MAIN) as f:
            content = f.read()
        assert "def main()" in content
        assert 'if __name__ == "__main__"' in content or 'if __name__ == \'__main__\'' in content


# ────────────────────────────────────────────────────────────────────────────
# 2. Fallback Behavior (SDK not installed)
# ────────────────────────────────────────────────────────────────────────────

class TestFallbackBehavior:
    """Test fallback behavior when OpenHands SDK is not installed."""

    def test_health_reports_openhands_unavailable(self, sidecar_process):
        """Health reports openhands_available as False when SDK not installed."""
        resp = send_request(sidecar_process, "health")

        assert "error" not in resp
        result = resp.get("result", {})
        assert result.get("status") == "healthy"
        assert result.get("openhands_available") is False
        assert result.get("sandbox_type") == "none"

    def test_run_task_returns_fallback_when_sdk_unavailable(self, sidecar_process):
        """run_task returns simulated status when OpenHands SDK unavailable."""
        resp = send_request(sidecar_process, "run_task", {
            "task": "Fix the login bug",
        })

        assert "error" not in resp
        result = resp.get("result", {})
        assert result.get("status") == "simulated"
        assert "OpenHands SDK is not installed" in result.get("output", "")
        assert isinstance(result.get("messages"), list)
        assert result.get("model_used") == "fallback"

    def test_run_task_without_params_still_works(self, sidecar_process):
        """run_task without params doesn't crash."""
        resp = send_request(sidecar_process, "run_task", {})

        assert "error" not in resp
        result = resp.get("result", {})
        assert result.get("status") == "simulated"

    def test_run_task_custom_workspace(self, sidecar_process):
        """run_task accepts a custom workspace path."""
        resp = send_request(sidecar_process, "run_task", {
            "task": "Update README",
            "workspace": SIDECAR_DIR,
        })

        assert "error" not in resp
        result = resp.get("result", {})
        assert SIDECAR_DIR in result.get("workspace", "")


# ────────────────────────────────────────────────────────────────────────────
# 3. File Operations (SDK not required)
# ────────────────────────────────────────────────────────────────────────────

class TestFileOperations:
    """Test file operation helpers that don't require OpenHands SDK."""

    def test_list_files_valid_directory(self, sidecar_process):
        """list_files returns file listing for a valid directory."""
        resp = send_request(sidecar_process, "list_files", {
            "path": SIDECAR_DIR,
        })

        assert "error" not in resp
        result = resp.get("result", {})
        assert "files" in result
        assert len(result["files"]) > 0
        # Should contain main.py
        file_names = [f["name"] for f in result["files"]]
        assert "main.py" in file_names

    def test_list_files_includes_file_metadata(self, sidecar_process):
        """list_files response includes name, path, is_dir, and size."""
        resp = send_request(sidecar_process, "list_files", {
            "path": SIDECAR_DIR,
        })

        result = resp.get("result", {})
        for f in result["files"]:
            assert "name" in f
            assert "path" in f
            assert "is_dir" in f
            assert "size" in f

    def test_list_files_sorts_directories_first(self, sidecar_process):
        """list_files sorts directories before files."""
        resp = send_request(sidecar_process, "list_files", {
            "path": SIDECAR_DIR,
        })

        result = resp.get("result", {})
        files = result["files"]
        found_non_dir = False
        for f in files:
            if not f["is_dir"]:
                found_non_dir = True
            elif found_non_dir:
                pytest.fail("Directory found after files — should be sorted first")

    def test_list_files_nonexistent_path(self, sidecar_process):
        """list_files returns error for nonexistent path."""
        resp = send_request(sidecar_process, "list_files", {
            "path": "/nonexistent/path/that/does/not/exist",
        })

        assert "error" in resp

    def test_read_file_valid_file(self, sidecar_process):
        """read_file returns content for a valid file."""
        resp = send_request(sidecar_process, "read_file", {
            "path": SIDECAR_MAIN,
        })

        assert "error" not in resp
        result = resp.get("result", {})
        assert "content" in result
        assert "def main()" in result["content"]
        assert isinstance(result.get("size"), int)
        assert result.get("size") > 0
        assert isinstance(result.get("line_count"), int)
        assert result.get("line_count") > 0

    def test_read_file_nonexistent_path(self, sidecar_process):
        """read_file returns error for nonexistent file."""
        resp = send_request(sidecar_process, "read_file", {
            "path": "/nonexistent/file.py",
        })

        assert "error" in resp

    def test_read_file_empty_path(self, sidecar_process):
        """read_file returns error when path is empty."""
        resp = send_request(sidecar_process, "read_file", {"path": ""})

        assert "error" in resp

    def test_run_command_echo(self, sidecar_process):
        """run_command executes a simple echo command."""
        resp = send_request(sidecar_process, "run_command", {
            "command": "echo hello",
        })

        assert "error" not in resp
        result = resp.get("result", {})
        assert result.get("exit_code") == 0
        assert "hello" in result.get("stdout", "")

    def test_run_command_with_cwd(self, sidecar_process):
        """run_command accepts a working directory."""
        resp = send_request(sidecar_process, "run_command", {
            "command": "pwd",
            "cwd": SIDECAR_DIR,
        })

        assert "error" not in resp
        result = resp.get("result", {})
        assert result.get("exit_code") == 0
        # pwd output may differ between platforms; just check stdout is non-empty
        assert len(result.get("stdout", "")) > 0

    def test_run_command_exit_code(self, sidecar_process):
        """run_command captures non-zero exit codes."""
        resp = send_request(sidecar_process, "run_command", {
            "command": "python -c \"import sys; sys.exit(42)\"",
        })

        assert "error" not in resp
        result = resp.get("result", {})
        assert result.get("exit_code") == 42

    def test_run_command_empty_command(self, sidecar_process):
        """run_command requires a command."""
        resp = send_request(sidecar_process, "run_command", {"command": ""})

        assert "error" in resp


# ────────────────────────────────────────────────────────────────────────────
# 4. Error Handling
# ────────────────────────────────────────────────────────────────────────────

class TestErrorHandling:
    """Test error handling and edge cases."""

    def test_unknown_method_returns_error(self, sidecar_process):
        """Unknown methods return a JSON-RPC error."""
        resp = send_request(sidecar_process, "nonexistent_method")

        assert "error" in resp
        assert resp["error"]["code"] == -32601

    def test_malformed_json_returns_error(self, sidecar_process):
        """Malformed JSON input returns a JSON-RPC error."""
        proc = sidecar_process
        proc.stdin.write("not valid json\n")
        proc.stdin.flush()

        response_line = proc.stdout.readline()
        resp = json.loads(response_line.strip())

        assert "error" in resp
        assert resp["error"]["code"] == -32603

    def test_multiple_sequential_requests(self, sidecar_process):
        """Sidecar handles multiple sequential requests."""
        resp1 = send_request(sidecar_process, "health")
        assert resp1.get("result", {}).get("status") == "healthy"

        resp2 = send_request(sidecar_process, "list_files", {
            "path": SIDECAR_DIR,
        }, req_id=2)
        assert "error" not in resp2

        resp3 = send_request(sidecar_process, "health", req_id=3)
        assert resp3.get("result", {}).get("status") == "healthy"

    def test_response_ids_match(self, sidecar_process):
        """Response IDs match the request IDs."""
        resp1 = send_request(sidecar_process, "health", req_id=42)
        assert resp1.get("id") == 42

        resp2 = send_request(sidecar_process, "health", req_id=99)
        assert resp2.get("id") == 99

    def test_shutdown_command(self, sidecar_process):
        """Shutdown command causes the sidecar to exit."""
        resp = send_request(sidecar_process, "shutdown")

        assert "error" not in resp
        result = resp.get("result", {})
        assert result.get("status") == "shutting down"

        try:
            sidecar_process.wait(timeout=3)
            assert sidecar_process.poll() is not None
        except subprocess.TimeoutExpired:
            pytest.fail("Sidecar did not exit after shutdown command")
