"""
Tests for the hello-bridge sidecar.

Tests the sidecar at two levels:
  1. Unit tests — verify the sidecar exists and has expected functions
  2. Integration tests — spawn the sidecar process, send JSON-RPC requests,
     validate responses

Run with:
  cd sidecars && python -m pytest tests/test_hello_bridge.py -v
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
    os.path.join(os.path.dirname(__file__), "..", "hello-bridge")
)
SIDECAR_MAIN = os.path.join(SIDECAR_DIR, "main.py")


@pytest.fixture
def sidecar_process():
    """Start the hello-bridge sidecar as a subprocess and return handles."""
    assert os.path.exists(SIDECAR_MAIN), (
        f"hello-bridge main.py not found at {SIDECAR_MAIN}"
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
    """Verify the hello-bridge sidecar files exist with required functions."""

    def test_hello_bridge_directory_exists(self):
        """hello-bridge directory exists with main.py."""
        assert os.path.isdir(SIDECAR_DIR), f"Directory not found: {SIDECAR_DIR}"
        assert os.path.exists(SIDECAR_MAIN), f"main.py not found: {SIDECAR_MAIN}"

    def test_hello_bridge_main_has_required_functions(self):
        """main.py exports required handler functions via shared library."""
        with open(SIDECAR_MAIN) as f:
            content = f.read()
        assert "def handle_ping" in content
        assert "def handle_echo" in content
        assert "sidecar.run()" in content
        assert "from shared.json_rpc_sidecar import" in content

    def test_hello_bridge_supports_expected_methods(self):
        """main.py registers ping and echo methods; health+shutdown are built-in."""
        with open(SIDECAR_MAIN) as f:
            content = f.read()
        assert '"ping"' in content or "'ping'" in content
        assert '"echo"' in content or "'echo'" in content
        # health and shutdown are built into JsonRpcSidecar
        from shared.json_rpc_sidecar import JsonRpcSidecar
        sidecar = JsonRpcSidecar("test")
        assert sidecar.has_method("health")
        assert sidecar.has_method("shutdown")


# ────────────────────────────────────────────────────────────────────────────
# 2. Integration Tests — Sidecar Process
# ────────────────────────────────────────────────────────────────────────────

class TestSidecarProcess:
    """Test the hello-bridge by spawning a process and sending JSON-RPC."""

    def test_sends_ready_signal(self, sidecar_process):
        """Sidecar sends 'ready' signal (validated by fixture)."""
        pass

    def test_ping_returns_ok(self, sidecar_process):
        """Ping command returns status 'ok' with a hello message."""
        resp = send_request(sidecar_process, "ping")

        assert "error" not in resp, f"Ping returned error: {resp.get('error')}"
        result = resp.get("result", {})
        assert result.get("status") == "ok"
        assert "hello from sidecar" in result.get("message", "")

    def test_ping_includes_pid(self, sidecar_process):
        """Ping response includes a positive pid."""
        resp = send_request(sidecar_process, "ping")

        result = resp.get("result", {})
        assert isinstance(result.get("pid"), int)
        assert result.get("pid") > 0

    def test_echo_returns_message(self, sidecar_process):
        """Echo returns the same message that was sent."""
        test_msg = "Hello from mothership!"
        resp = send_request(sidecar_process, "echo", {"message": test_msg})

        assert "error" not in resp
        result = resp.get("result", {})
        assert result.get("echo") == test_msg

    def test_echo_empty_message(self, sidecar_process):
        """Echo with empty message returns empty string."""
        resp = send_request(sidecar_process, "echo", {"message": ""})

        assert "error" not in resp
        result = resp.get("result", {})
        assert result.get("echo") == ""

    def test_echo_no_params(self, sidecar_process):
        """Echo with no params returns empty string."""
        resp = send_request(sidecar_process, "echo")

        assert "error" not in resp
        result = resp.get("result", {})
        assert result.get("echo") == ""

    def test_health_returns_healthy(self, sidecar_process):
        """Health command returns healthy status with pid."""
        resp = send_request(sidecar_process, "health")

        assert "error" not in resp
        result = resp.get("result", {})
        assert result.get("status") == "healthy"
        assert isinstance(result.get("pid"), int)
        assert result.get("pid") > 0

    def test_unknown_method_returns_error(self, sidecar_process):
        """Unknown methods return a JSON-RPC error."""
        resp = send_request(sidecar_process, "nonexistent_method")

        assert "error" in resp
        assert resp["error"]["code"] == -32601
        assert "Unknown method" in resp["error"]["message"]

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
        resp1 = send_request(sidecar_process, "ping")
        assert resp1.get("result", {}).get("status") == "ok"

        resp2 = send_request(sidecar_process, "echo", {"message": "seq"}, req_id=2)
        assert resp2.get("result", {}).get("echo") == "seq"

        resp3 = send_request(sidecar_process, "health", req_id=3)
        assert resp3.get("result", {}).get("status") == "healthy"

    def test_response_ids_match(self, sidecar_process):
        """Response IDs match the request IDs."""
        resp1 = send_request(sidecar_process, "ping", req_id=42)
        assert resp1.get("id") == 42

        resp2 = send_request(sidecar_process, "ping", req_id=99)
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
