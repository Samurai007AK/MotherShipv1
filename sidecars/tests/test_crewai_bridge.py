"""
Tests for the crewai-bridge sidecar.

Tests the sidecar at three levels:
  1. Unit tests — test flow helpers directly (parse_structured, format_entries, fallback_analysis)
  2. Integration tests — spawn the sidecar process, send JSON-RPC requests, validate responses
  3. Error handling — test fallback when CrewAI is unavailable, test invalid requests

Run with:
  cd sidecars && python -m pytest tests/test_crewai_bridge.py -v
"""

import json
import os
import subprocess
import sys
import time

import pytest

# ────────────────────────────────────────────────────────────────────────────
# Fixtures
# ────────────────────────────────────────────────────────────────────────────

SIDECAR_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "crewai-bridge")
)
SIDECAR_MAIN = os.path.join(SIDECAR_DIR, "main.py")

SAMPLE_ENTRIES = [
    {
        "id": "entry-1",
        "content": "Fixed the authentication bug by adding a JWT token refresh mechanism.",
        "agent_id": "claude",
        "entry_type": "output",
        "tags": ["auth", "bugfix"],
        "files_referenced": ["src/auth/token.ts", "src/auth/jwt.ts"],
        "created_at": "2026-06-17T10:00:00Z",
    },
    {
        "id": "entry-2",
        "content": "Decided to use refresh token rotation for security.",
        "agent_id": "claude",
        "entry_type": "decision",
        "tags": ["security"],
        "files_referenced": [],
        "created_at": "2026-06-17T10:05:00Z",
    },
    {
        "id": "entry-3",
        "content": "Updated the API documentation for the new auth endpoints.",
        "agent_id": "claude",
        "entry_type": "output",
        "tags": ["docs"],
        "files_referenced": ["docs/api/auth.md"],
        "created_at": "2026-06-17T10:10:00Z",
    },
]


@pytest.fixture
def sidecar_process():
    """Start the crewai-bridge sidecar as a subprocess and return stdin/stdout handles."""
    assert os.path.exists(SIDECAR_MAIN), (
        f"crewai-bridge main.py not found at {SIDECAR_MAIN}"
    )

    proc = subprocess.Popen(
        [sys.executable, SIDECAR_MAIN],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,  # Discard logs to avoid pipe blocking
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

    # Teardown: only send shutdown if process is still alive
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
        # Process already exited; ensure it's reaped
        proc.wait(timeout=2)


def send_request(proc, method, params=None, req_id=1):
    """Send a JSON-RPC request to the sidecar and return the parsed response."""
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
    """Verify the crewai-bridge sidecar files exist."""

    def test_crewai_bridge_directory_exists(self):
        """crewai-bridge directory exists with required files."""
        assert os.path.isdir(SIDECAR_DIR), f"Directory not found: {SIDECAR_DIR}"
        assert os.path.exists(SIDECAR_MAIN), f"main.py not found: {SIDECAR_MAIN}"
        flow_path = os.path.join(SIDECAR_DIR, "flow.py")
        assert os.path.exists(flow_path), f"flow.py not found: {flow_path}"

    def test_crewai_bridge_main_has_required_functions(self):
        """main.py exports handle_request, handle_handoff, and main."""
        with open(SIDECAR_MAIN) as f:
            content = f.read()
        assert "def handle_request" in content
        assert "def handle_handoff" in content
        assert "def main()" in content

    def test_crewai_bridge_flow_has_handoff_flow(self):
        """flow.py defines the HandoffFlow class with required methods."""
        flow_path = os.path.join(SIDECAR_DIR, "flow.py")
        with open(flow_path) as f:
            content = f.read()
        assert "class HandoffFlow" in content
        assert "or_" in content, "Flow should use or_() for OR logic"
        assert "HandoffFlow(Flow)" in content


# ────────────────────────────────────────────────────────────────────────────
# 2. Unit Tests — Flow Helpers
# ────────────────────────────────────────────────────────────────────────────

class TestFlowHelpers:
    """Test the flow helper functions directly (no subprocess needed).
    Requires crewai to be installed for the flow module import.
    """

    @staticmethod
    def _import_flow():
        """Import HandoffFlow, skipping if crewai not installed."""
        pytest.importorskip("crewai", reason="crewai not installed")
        sys.path.insert(0, SIDECAR_DIR)
        # Clear any cached import to get a fresh module
        for key in list(sys.modules.keys()):
            if key.startswith("flow") or key.startswith("crewai"):
                del sys.modules[key]
        from flow import HandoffFlow  # noqa: F811
        return HandoffFlow

    def test_format_entries_limits_to_20(self):
        """_format_entries limits to 20 entries."""
        HandoffFlow = self._import_flow()
        flow = HandoffFlow()
        many_entries = [
            {"content": f"Entry {i}", "entry_type": "output", "agent_id": "test"}
            for i in range(30)
        ]
        result = flow._format_entries(many_entries)
        assert "[21]" not in result, "Should limit to 20 entries"
        assert "[1]" in result, "Should include first entry"

    def test_format_entries_truncates_content(self):
        """_format_entries truncates content to 500 chars."""
        HandoffFlow = self._import_flow()
        flow = HandoffFlow()
        long_entry = [{
            "content": "x" * 1000,
            "entry_type": "output",
            "agent_id": "test",
        }]
        result = flow._format_entries(long_entry)
        assert result.count("x") == 500, "Content should be truncated to 500 chars"

    def test_fallback_analysis_returns_summary(self):
        """_fallback_analysis returns structured summary from entries."""
        HandoffFlow = self._import_flow()
        flow = HandoffFlow()
        result = flow._fallback_analysis(SAMPLE_ENTRIES)

        assert isinstance(result, str)
        assert "Files:" in result
        assert "Total entries:" in result

    def test_fallback_analysis_empty_entries(self):
        """_fallback_analysis handles empty entries gracefully."""
        HandoffFlow = self._import_flow()
        flow = HandoffFlow()
        result = flow._fallback_analysis([])

        assert result == "No context data"

    def test_parse_structured_handles_empty_text(self):
        """_parse_structured handles empty input."""
        HandoffFlow = self._import_flow()
        flow = HandoffFlow()
        result = flow._parse_structured("")

        assert result["overview"] == ""
        assert result["decisions"] == []
        assert result["state"] == ""

    def test_parse_structured_parses_full_response(self):
        """_parse_structured correctly parses a well-formed LLM response."""
        HandoffFlow = self._import_flow()
        flow = HandoffFlow()
        text = (
            "OVERVIEW: Fixed auth bug and updated docs.\n"
            "DECISIONS: Use JWT refresh tokens\n"
            "- Implement token rotation\n"
            "STATE: Auth system complete\n"
            "TODO: Write unit tests\n"
            "- Add integration tests\n"
            "FILES: src/auth/token.ts\n"
            "- docs/api/auth.md\n"
        )
        result = flow._parse_structured(text)

        assert "auth bug" in result["overview"]
        assert len(result["decisions"]) >= 1
        assert "refresh" in result["decisions"][0].lower()
        assert "complete" in result["state"]
        assert len(result["todos"]) >= 1
        assert len(result["files"]) >= 1

    def test_parse_structured_handles_none_values(self):
        """_parse_structured handles 'None' / 'none' values correctly."""
        HandoffFlow = self._import_flow()
        flow = HandoffFlow()
        text = (
            "OVERVIEW: Simple change\n"
            "DECISIONS: None recorded\n"
            "STATE: Done\n"
            "TODO: None\n"
            "FILES: None\n"
        )
        result = flow._parse_structured(text)

        assert result["decisions"] == []
        assert result["todos"] == []
        assert result["files"] == []


# ────────────────────────────────────────────────────────────────────────────
# 3. Integration Tests — Sidecar Process
# ────────────────────────────────────────────────────────────────────────────

class TestSidecarProcess:
    """Test the sidecar by spawning a process and sending JSON-RPC."""

    def test_sends_ready_signal(self, sidecar_process):
        """Sidecar sends 'ready' signal on startup (already validated in fixture)."""
        # The fixture already reads and validates the ready signal.
        # This test verifies the fixture didn't fail.
        pass

    def test_health_command(self, sidecar_process):
        """Health command returns healthy status with pid."""
        resp = send_request(sidecar_process, "health")

        assert "error" not in resp, f"Health returned error: {resp.get('error')}"
        result = resp.get("result", {})
        assert result.get("status") == "healthy"
        assert isinstance(result.get("pid"), int)
        assert result.get("pid") > 0

    def test_handoff_returns_expected_structure(self, sidecar_process):
        """Handoff request returns result with all required fields."""
        resp = send_request(sidecar_process, "handoff", {
            "source_agent_id": "claude",
            "target_agent_id": "codex",
            "entries": SAMPLE_ENTRIES,
        })

        assert "error" not in resp, (
            f"Handoff returned error: {resp.get('error')}"
        )
        result = resp.get("result", {})

        # Check all required fields exist
        assert result.get("source_agent_id") == "claude"
        assert result.get("target_agent_id") == "codex"
        assert isinstance(result.get("entry_count"), int)
        assert result.get("entry_count") == len(SAMPLE_ENTRIES)
        assert isinstance(result.get("summary"), str)
        assert isinstance(result.get("key_decisions"), list)
        assert isinstance(result.get("open_todos"), list)
        assert isinstance(result.get("files_touched"), list)
        assert isinstance(result.get("current_state"), str)
        assert isinstance(result.get("enriched"), bool)
        assert isinstance(result.get("model_used"), str)

    def test_handoff_with_empty_entries(self, sidecar_process):
        """Handoff with empty entries still returns valid structure."""
        resp = send_request(sidecar_process, "handoff", {
            "source_agent_id": "claude",
            "target_agent_id": "codex",
            "entries": [],
        })

        assert "error" not in resp, (
            f"Handoff with empty entries returned error: {resp.get('error')}"
        )
        result = resp.get("result", {})
        assert result.get("entry_count") == 0
        assert isinstance(result.get("summary"), str)

    def test_handoff_with_single_entry(self, sidecar_process):
        """Handoff with a single minimal entry works."""
        resp = send_request(sidecar_process, "handoff", {
            "source_agent_id": "claude",
            "target_agent_id": "codex",
            "entries": [
                {
                    "id": "entry-1",
                    "content": "Simple entry without optional fields",
                    "entry_type": "output",
                    "tags": [],
                    "files_referenced": [],
                    "created_at": "2026-06-17T12:00:00Z",
                }
            ],
        })

        assert "error" not in resp
        result = resp.get("result", {})
        assert result.get("entry_count") == 1

    def test_unknown_method_returns_error(self, sidecar_process):
        """Unknown methods return a JSON-RPC error response."""
        resp = send_request(sidecar_process, "nonexistent_method")

        assert "error" in resp
        assert resp["error"]["code"] == -32601
        assert "Unknown method" in resp["error"]["message"]


# ────────────────────────────────────────────────────────────────────────────
# 4. Error Handling & Edge Cases
# ────────────────────────────────────────────────────────────────────────────

class TestErrorHandling:
    """Test error handling and edge cases."""

    def test_shutdown_command(self, sidecar_process):
        """Shutdown command causes the sidecar to exit."""
        resp = send_request(sidecar_process, "shutdown")

        assert "error" not in resp
        result = resp.get("result", {})
        assert result.get("status") == "shutting down"

        # Process should exit soon after shutdown
        try:
            sidecar_process.wait(timeout=3)
            assert sidecar_process.poll() is not None
        except subprocess.TimeoutExpired:
            pytest.fail("Sidecar did not exit after shutdown command")

    def test_malformed_json_returns_error(self, sidecar_process):
        """Malformed JSON input returns a JSON-RPC error."""
        proc = sidecar_process
        proc.stdin.write("not valid json\n")
        proc.stdin.flush()

        response_line = proc.stdout.readline()
        resp = json.loads(response_line.strip())

        assert "error" in resp
        assert resp["error"]["code"] == -32603

    def test_missing_params_still_works(self, sidecar_process):
        """Handoff without params uses defaults and doesn't crash."""
        resp = send_request(sidecar_process, "handoff", {})

        assert "error" not in resp
        result = resp.get("result", {})
        # Should use defaults for missing fields
        assert "source_agent_id" in result
        assert "target_agent_id" in result
        assert isinstance(result.get("summary"), str)

    def test_invalid_jsonrpc_version(self, sidecar_process):
        """Request without jsonrpc field still gets processed."""
        proc = sidecar_process
        request = json.dumps({
            "method": "health",
            "params": {},
            "id": 1,
        })
        proc.stdin.write(request + "\n")
        proc.stdin.flush()

        response_line = proc.stdout.readline()
        resp = json.loads(response_line.strip())

        # The sidecar doesn't validate jsonrpc field strictly,
        # so it should still return a valid response
        assert "result" in resp or "error" in resp


# ────────────────────────────────────────────────────────────────────────────
# 5. Multiple Requests
# ────────────────────────────────────────────────────────────────────────────

class TestMultipleRequests:
    """Test that the sidecar handles multiple requests in sequence."""

    def test_sequential_requests(self, sidecar_process):
        """Sidecar handles multiple sequential requests without issues."""
        # First request
        resp1 = send_request(sidecar_process, "health")
        assert resp1.get("result", {}).get("status") == "healthy"

        # Second request
        resp2 = send_request(sidecar_process, "handoff", {
            "source_agent_id": "claude",
            "target_agent_id": "codex",
            "entries": SAMPLE_ENTRIES,
        }, req_id=2)
        assert "error" not in resp2
        assert resp2.get("result", {}).get("entry_count") == len(SAMPLE_ENTRIES)

        # Third request (different source/target)
        resp3 = send_request(sidecar_process, "handoff", {
            "source_agent_id": "gemini",
            "target_agent_id": "researcher",
            "entries": SAMPLE_ENTRIES[:1],
        }, req_id=3)
        assert "error" not in resp3
        assert resp3.get("result", {}).get("source_agent_id") == "gemini"
        assert resp3.get("result", {}).get("target_agent_id") == "researcher"
        assert resp3.get("result", {}).get("entry_count") == 1

    def test_response_ids_match_request_ids(self, sidecar_process):
        """Response IDs match the request IDs."""
        resp1 = send_request(sidecar_process, "health", req_id=42)
        assert resp1.get("id") == 42

        resp2 = send_request(sidecar_process, "health", req_id=99)
        assert resp2.get("id") == 99
