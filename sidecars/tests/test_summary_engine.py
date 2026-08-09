"""
Tests for the summary-engine sidecar.

Tests the sidecar at two levels:
  1. Unit tests — test helper functions directly (select_model, format_snapshots,
     parse_llm_response, template_summary)
  2. Integration tests — spawn the sidecar process, send JSON-RPC requests,
     validate responses (summarize, health, shutdown)

Run with:
  cd sidecars && python -m pytest tests/test_summary_engine.py -v
"""

import json
import os
import subprocess
import sys
import time

import pytest

# ────────────────────────────────────────────────────────────────────────────
# Fixtures & Helpers
# ────────────────────────────────────────────────────────────────────────────

SIDECAR_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "summary-engine")
)
SIDECAR_MAIN = os.path.join(SIDECAR_DIR, "main.py")

SAMPLE_SNAPSHOTS = [
    {
        "trigger": "agent_switch",
        "agent_id": "claude",
        "output_tail": "Fixed auth bug by adding JWT refresh token rotation.",
        "branch": "feature/auth",
        "open_files": ["src/auth/token.ts", "src/auth/jwt.ts"],
        "decisions": ["Use JWT refresh token rotation for security"],
    },
    {
        "trigger": "git_activity",
        "agent_id": "claude",
        "output_tail": "Updated API docs for new auth endpoints.",
        "branch": "feature/auth",
        "open_files": ["docs/api/auth.md"],
        "decisions": [],
    },
]


@pytest.fixture
def sidecar_process():
    """Start the summary-engine sidecar as a subprocess and return handles."""
    assert os.path.exists(SIDECAR_MAIN), (
        f"summary-engine main.py not found at {SIDECAR_MAIN}"
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
# 1. Unit Tests — Pure Helper Functions
# ────────────────────────────────────────────────────────────────────────────

class TestSelectModel:
    """Tests for select_model() — no Ollama needed."""

    @staticmethod
    def _import_module():
        """Import the summary-engine module inline."""
        sys.path.insert(0, SIDECAR_DIR)
        for key in list(sys.modules.keys()):
            if key.startswith("summary") or key == "main":
                del sys.modules[key]
        import main as se
        return se

    def test_prefers_default_model(self):
        """select_model prefers llama3.2:3b when available."""
        se = self._import_module()
        chosen = se.select_model(["llama3.2:3b", "llama3.1:8b", "mistral"])
        assert "llama3.2" in chosen

    def test_prefers_fallback_when_default_unavailable(self):
        """select_model falls back to llama3.1:8b when default is missing."""
        se = self._import_module()
        chosen = se.select_model(["llama3.1:8b", "mistral"])
        assert "llama3.1" in chosen

    def test_uses_any_available_model(self):
        """select_model uses any available model when preferred missing."""
        se = self._import_module()
        chosen = se.select_model(["mistral", "codellama"])
        assert chosen in ("mistral", "codellama")

    def test_returns_default_when_no_models(self):
        """select_model returns the default model when none available."""
        se = self._import_module()
        chosen = se.select_model([])
        assert chosen == se.DEFAULT_MODEL


class TestFormatSnapshots:
    """Tests for format_snapshots() — pure function."""

    @staticmethod
    def _import_module():
        sys.path.insert(0, SIDECAR_DIR)
        for key in list(sys.modules.keys()):
            if key.startswith("summary") or key == "main":
                del sys.modules[key]
        import main as se
        return se

    def test_formats_snapshot_with_all_fields(self):
        """format_snapshots includes all fields from a snapshot."""
        se = self._import_module()
        result = se.format_snapshots(SAMPLE_SNAPSHOTS[:1])
        assert "Snapshot 1" in result
        assert "claude" in result
        assert "feature/auth" in result
        assert "src/auth/token.ts" in result
        assert "JWT refresh" in result

    def test_formats_multiple_snapshots(self):
        """format_snapshots includes all snapshots sequentially."""
        se = self._import_module()
        result = se.format_snapshots(SAMPLE_SNAPSHOTS)
        assert "Snapshot 1" in result
        assert "Snapshot 2" in result

    def test_handles_empty_snapshots(self):
        """format_snapshots returns empty string for empty list."""
        se = self._import_module()
        result = se.format_snapshots([])
        assert result == "" or result.strip() == ""

    def test_truncates_long_output(self):
        """format_snapshots truncates output_tail to 2000 chars."""
        se = self._import_module()
        long_snap = [{
            "trigger": "manual",
            "agent_id": "test",
            "output_tail": "x" * 3000,
        }]
        result = se.format_snapshots(long_snap)
        assert result.count("x") == 2000, "Should truncate to 2000 chars"

    def test_handles_minimal_snapshot(self):
        """format_snapshots handles snapshots with only required fields."""
        se = self._import_module()
        snap = [{"trigger": "heartbeat", "agent_id": "test", "output_tail": ""}]
        result = se.format_snapshots(snap)
        assert "Snapshot 1" in result


class TestParseLlmResponse:
    """Tests for parse_llm_response() — pure function."""

    @staticmethod
    def _import_module():
        sys.path.insert(0, SIDECAR_DIR)
        for key in list(sys.modules.keys()):
            if key.startswith("summary") or key == "main":
                del sys.modules[key]
        import main as se
        return se

    def test_parses_full_response(self):
        """parse_llm_response correctly extracts all sections."""
        se = self._import_module()
        text = (
            "OVERVIEW: Fixed auth bug and updated docs.\n"
            "DECISIONS: Use JWT refresh tokens\n"
            "- Implement token rotation\n"
            "TODO: Write unit tests\n"
            "- Add integration tests\n"
            "FILES: src/auth/token.ts\n"
            "- docs/api/auth.md\n"
            "STATE: Auth system complete\n"
        )
        result = se.parse_llm_response(text)

        assert "auth bug" in result["summary"]
        assert len(result["key_decisions"]) >= 1
        assert len(result["open_todos"]) >= 1
        assert len(result["files_touched"]) >= 1
        assert "complete" in result["current_state"]

    def test_handles_none_values(self):
        """parse_llm_response treats 'None' / 'none' as empty lists."""
        se = self._import_module()
        text = (
            "OVERVIEW: Simple change\n"
            "DECISIONS: None recorded\n"
            "STATE: Done\n"
            "TODO: None\n"
            "FILES: None\n"
        )
        result = se.parse_llm_response(text)

        assert result["key_decisions"] == []
        assert result["open_todos"] == []
        assert result["files_touched"] == []

    def test_handles_empty_string(self):
        """parse_llm_response handles empty input."""
        se = self._import_module()
        result = se.parse_llm_response("")

        assert result["summary"] == "" or len(result["summary"]) <= 500
        assert result["key_decisions"] == []
        assert result["current_state"] == ""

    def test_fallback_to_raw_response(self):
        """parse_llm_response falls back to raw response when no structure."""
        se = self._import_module()
        text = "Just a plain text response with no structured sections."
        result = se.parse_llm_response(text)

        assert result["summary"] == text[:500]
        assert result["key_decisions"] == []

    def test_appends_to_state_on_multiple_lines(self):
        """parse_llm_response appends continuation lines to state."""
        se = self._import_module()
        text = (
            "OVERVIEW: Fixed bug\n"
            "STATE: The system is now\n"
            "fully operational and ready\n"
            "DECISIONS: None\n"
        )
        result = se.parse_llm_response(text)

        assert "fully operational" in result["current_state"]

    def test_handles_bullet_decisions(self):
        """parse_llm_response extracts bullet-pointed decisions."""
        se = self._import_module()
        text = (
            "OVERVIEW: Made changes\n"
            "DECISIONS:\n"
            "- Use PostgreSQL\n"
            "- Add Redis caching\n"
            "- Migrate to TypeScript\n"
        )
        result = se.parse_llm_response(text)

        decisions = result["key_decisions"]
        assert any("PostgreSQL" in d for d in decisions)
        assert any("Redis" in d for d in decisions)
        assert any("TypeScript" in d for d in decisions)


class TestTemplateSummary:
    """Tests for template_summary() — pure function."""

    @staticmethod
    def _import_module():
        sys.path.insert(0, SIDECAR_DIR)
        for key in list(sys.modules.keys()):
            if key.startswith("summary") or key == "main":
                del sys.modules[key]
        import main as se
        return se

    def test_returns_empty_for_empty_snapshots(self):
        """template_summary returns 'No context data captured' for empty list."""
        se = self._import_module()
        result = se.template_summary([])

        assert "No context data" in result["summary"]
        assert result["key_decisions"] == []
        assert result["files_touched"] == []

    def test_includes_branches(self):
        """template_summary includes branch names."""
        se = self._import_module()
        result = se.template_summary(SAMPLE_SNAPSHOTS)

        assert "feature/auth" in result["summary"]

    def test_includes_files(self):
        """template_summary includes file paths."""
        se = self._import_module()
        result = se.template_summary(SAMPLE_SNAPSHOTS)

        assert "src/auth/token.ts" in result["summary"]
        assert "docs/api/auth.md" in result["summary"]

    def test_limits_files_to_10(self):
        """template_summary limits files_touched to 10."""
        se = self._import_module()
        snap = {
            "trigger": "manual",
            "agent_id": "test",
            "output_tail": "",
            "open_files": [f"file{i}.ts" for i in range(20)],
        }
        result = se.template_summary([snap])

        assert len(result["files_touched"]) == 10

    def test_limits_decisions_to_5(self):
        """template_summary limits key_decisions to 5."""
        se = self._import_module()
        snap = {
            "trigger": "manual",
            "agent_id": "test",
            "output_tail": "",
            "decisions": [f"Decision {i}" for i in range(10)],
        }
        result = se.template_summary([snap])

        assert len(result["key_decisions"]) == 5

    def test_current_state_includes_snapshot_count(self):
        """template_summary current_state shows snapshot count."""
        se = self._import_module()
        result = se.template_summary(SAMPLE_SNAPSHOTS)

        assert "2" in result["current_state"]

    def test_deduplicates_files_across_snapshots(self):
        """template_summary deduplicates files across snapshots."""
        se = self._import_module()
        snaps = [
            {"trigger": "manual", "agent_id": "a", "output_tail": "",
             "open_files": ["src/shared.ts"]},
            {"trigger": "manual", "agent_id": "b", "output_tail": "",
             "open_files": ["src/shared.ts"]},
        ]
        result = se.template_summary(snaps)

        # Count occurrences of shared.ts in files_touched
        count = result["files_touched"].count("src/shared.ts")
        assert count == 1, "Files should be deduplicated"


# ────────────────────────────────────────────────────────────────────────────
# 2. Integration Tests — Sidecar Process
# ────────────────────────────────────────────────────────────────────────────

class TestSidecarProcess:
    """Test the summary-engine by spawning a process and sending JSON-RPC."""

    def test_sends_ready_signal(self, sidecar_process):
        """Sidecar sends 'ready' signal on startup (validated by fixture)."""
        pass

    def test_health_command(self, sidecar_process):
        """Health command returns healthy status."""
        resp = send_request(sidecar_process, "health")

        assert "error" not in resp, f"Health returned error: {resp.get('error')}"
        result = resp.get("result", {})
        assert result.get("status") == "healthy"
        assert isinstance(result.get("pid"), int)
        assert result.get("pid") > 0

    def test_summarize_with_empty_snapshots(self, sidecar_process):
        """Summarize with empty snapshots returns 'No context snapshots'."""
        resp = send_request(sidecar_process, "summarize", {
            "context_snapshots": [],
        })

        assert "error" not in resp
        result = resp.get("result", {})
        assert "No context snapshots" in result.get("summary", "")
        assert result.get("key_decisions") == []
        assert result.get("files_touched") == []

    def test_summarize_is_robust_when_ollama_changes(self, sidecar_process):
        """Summarize works regardless of whether Ollama is available (template or real model)."""
        resp = send_request(sidecar_process, "summarize", {
            "context_snapshots": [
                {
                    "trigger": "manual",
                    "agent_id": "claude",
                    "output_tail": "Worked on auth module",
                    "branch": "feature/auth",
                    "open_files": ["src/auth.ts"],
                    "decisions": ["Use JWT"],
                }
            ],
        })

        assert "error" not in resp
        result = resp.get("result", {})
        assert result.get("model_used"), f"Expected a model name (template or real), got: {result.get('model_used')}"
        assert isinstance(result.get("summary"), str)
        assert isinstance(result.get("key_decisions"), list)
        assert isinstance(result.get("files_touched"), list)
        assert isinstance(result.get("current_state"), str)

    def test_summarize_includes_handoff_target(self, sidecar_process):
        """Summarize passes handoff_target and style through."""
        resp = send_request(sidecar_process, "summarize", {
            "context_snapshots": SAMPLE_SNAPSHOTS,
            "handoff_target": "codex",
            "style": "detailed",
        })

        assert "error" not in resp
        result = resp.get("result", {})
        assert result.get("model_used"), f"Expected a model name (template or real), got: {result.get('model_used')}"
        assert isinstance(result.get("summary"), str)

    def test_summarize_multiple_snapshots(self, sidecar_process):
        """Summarize handles multiple snapshots."""
        resp = send_request(sidecar_process, "summarize", {
            "context_snapshots": SAMPLE_SNAPSHOTS,
        })

        assert "error" not in resp
        result = resp.get("result", {})
        assert result.get("model_used"), f"Expected a model name (template or real), got: {result.get('model_used')}"
        assert isinstance(result.get("summary"), str) and len(result.get("summary", "")) > 0, "Summary should be a non-empty string"

    def test_unknown_method_returns_error(self, sidecar_process):
        """Unknown methods return a JSON-RPC error response."""
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
        """Sidecar handles multiple requests in sequence."""
        resp1 = send_request(sidecar_process, "health")
        assert resp1.get("result", {}).get("status") == "healthy"

        resp2 = send_request(sidecar_process, "summarize", {
            "context_snapshots": SAMPLE_SNAPSHOTS[:1],
        }, req_id=2)
        assert "error" not in resp2
        assert isinstance(resp2.get("result", {}).get("summary"), str)

        resp3 = send_request(sidecar_process, "health", req_id=3)
        assert resp3.get("result", {}).get("status") == "healthy"

    def test_response_ids_match_request_ids(self, sidecar_process):
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
