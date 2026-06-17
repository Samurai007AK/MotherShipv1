"""
Mothership — Summary Engine (Sidecar)

Python sidecar that generates context summaries using Ollama (local LLM).
Falls back to template-based summaries when Ollama is unavailable.

Protocol: JSON-RPC over stdin/stdout (one JSON object per line).

Commands:
  - summarize: Generate a summary from context snapshots
  - health: Check if Ollama is available
  - shutdown: Exit gracefully
"""

import sys
import json
import signal
import logging
import os
import urllib.request
import urllib.error
from typing import Optional

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger("summary-engine")

running = True
OLLAMA_BASE_URL = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
DEFAULT_MODEL = "llama3.2:3b"
FALLBACK_MODEL = "llama3.1:8b"


def handle_signal(signum, frame):
    global running
    logger.info("Received signal %s, shutting down...", signum)
    running = False


signal.signal(signal.SIGINT, handle_signal)
signal.signal(signal.SIGTERM, handle_signal)


def make_response(result, req_id=None):
    resp = {"jsonrpc": "2.0", "result": result}
    if req_id is not None:
        resp["id"] = req_id
    return resp


def make_error(message, code=-32603, req_id=None):
    resp = {"jsonrpc": "2.0", "error": {"code": code, "message": message}}
    if req_id is not None:
        resp["id"] = req_id
    return resp


def check_ollama_available() -> bool:
    """Check if Ollama is running and accessible."""
    try:
        req = urllib.request.Request(f"{OLLAMA_BASE_URL}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except (urllib.error.URLError, OSError, TimeoutError):
        return False


def get_available_models() -> list[str]:
    """Get list of available Ollama models."""
    try:
        req = urllib.request.Request(f"{OLLAMA_BASE_URL}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            return [m["name"] for m in data.get("models", [])]
    except (urllib.error.URLError, OSError, TimeoutError):
        return []


def select_model(available_models: list[str]) -> str:
    """Select the best available model."""
    # Try default first
    for model in available_models:
        if DEFAULT_MODEL in model:
            return model
    # Try fallback
    for model in available_models:
        if FALLBACK_MODEL in model:
            return model
    # Use whatever is available
    if available_models:
        return available_models[0]
    return DEFAULT_MODEL


def format_snapshots(snapshots: list[dict]) -> str:
    """Format context snapshots into readable text for the LLM."""
    parts = []
    for i, snap in enumerate(snapshots, 1):
        trigger = snap.get("trigger", "unknown")
        agent = snap.get("agent_id", "unknown")
        output = snap.get("output_tail", "")
        branch = snap.get("branch")
        decisions = snap.get("decisions", [])
        files = snap.get("open_files", [])

        part = f"--- Snapshot {i} (trigger: {trigger}, agent: {agent}) ---"
        if branch:
            part += f"\nBranch: {branch}"
        if decisions:
            part += f"\nDecisions: {'; '.join(decisions)}"
        if files:
            part += f"\nFiles: {', '.join(files)}"
        if output:
            # Truncate output for LLM context
            truncated = output[:2000] if len(output) > 2000 else output
            part += f"\nOutput:\n{truncated}"
        parts.append(part)

    return "\n\n".join(parts)


SUMMARY_PROMPT = """You are a context handoff assistant for an AI agent workspace called Mothership.
Given the following agent session snapshots, generate a concise summary for the next agent.

Format your response as:
OVERVIEW: 2-3 sentence overview of what was done
DECISIONS: Key decisions made (bullet points, or "None recorded")
TODO: Open TODOs mentioned (bullet points, or "None")
FILES: Key files/modules touched (list, or "None")
STATE: Current state of work (1-2 sentences)

Session data:
{snapshots}"""


def generate_summary_ollama(snapshots_text: str, model: str) -> Optional[dict]:
    """Generate summary using Ollama API."""
    try:
        prompt = SUMMARY_PROMPT.format(snapshots=snapshots_text)

        payload = json.dumps({
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.3,
                "num_predict": 512,
            }
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{OLLAMA_BASE_URL}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
            response_text = data.get("response", "")
            return parse_llm_response(response_text)

    except (urllib.error.URLError, OSError, TimeoutError, json.JSONDecodeError) as e:
        logger.warning("Ollama generation failed: %s", e)
        return None


def parse_llm_response(response: str) -> dict:
    """Parse the LLM response into structured fields."""
    result = {
        "summary": "",
        "key_decisions": [],
        "open_todos": [],
        "files_touched": [],
        "current_state": "",
    }

    lines = response.strip().split("\n")
    current_section = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Detect section headers
        upper = line.upper()
        if upper.startswith("OVERVIEW:"):
            current_section = "overview"
            result["summary"] = line[len("OVERVIEW:"):].strip()
        elif upper.startswith("DECISIONS:"):
            current_section = "decisions"
            content = line[len("DECISIONS:"):].strip()
            if content and content.lower() != "none recorded":
                result["key_decisions"].append(content)
        elif upper.startswith("TODO:"):
            current_section = "todo"
            content = line[len("TODO:"):].strip()
            if content and content.lower() != "none":
                result["open_todos"].append(content)
        elif upper.startswith("FILES:"):
            current_section = "files"
            content = line[len("FILES:"):].strip()
            if content and content.lower() != "none":
                result["files_touched"].append(content)
        elif upper.startswith("STATE:"):
            current_section = "state"
            result["current_state"] = line[len("STATE:"):].strip()
        elif line.startswith("- ") or line.startswith("* "):
            # Bullet point — append to current section
            item = line[2:].strip()
            if current_section == "decisions":
                result["key_decisions"].append(item)
            elif current_section == "todo":
                result["open_todos"].append(item)
            elif current_section == "files":
                result["files_touched"].append(item)
        elif current_section == "overview" and not result["summary"]:
            result["summary"] = line
        elif current_section == "state":
            result["current_state"] += " " + line

    # Fallback: if no structured sections found, use the whole response as summary
    if not result["summary"] and not result["key_decisions"]:
        result["summary"] = response[:500]

    return result


def template_summary(snapshots: list[dict]) -> dict:
    """Generate a template-based summary without LLM."""
    all_files = set()
    all_branches = set()
    all_decisions = []
    all_todos = []

    for snap in snapshots:
        files = snap.get("open_files", [])
        all_files.update(files)

        branch = snap.get("branch")
        if branch:
            all_branches.add(branch)

        decisions = snap.get("decisions", [])
        all_decisions.extend(decisions)

    summary_parts = []
    if all_branches:
        summary_parts.append(f"Branches: {', '.join(all_branches)}")
    if all_files:
        summary_parts.append(f"Files touched: {', '.join(list(all_files)[:10])}")

    summary = "; ".join(summary_parts) if summary_parts else "No context data captured"

    return {
        "summary": summary,
        "key_decisions": all_decisions[:5],
        "open_todos": all_todos[:5],
        "files_touched": list(all_files)[:10],
        "current_state": f"Session with {len(snapshots)} snapshots",
    }


def handle_request(req):
    method = req.get("method", "")
    params = req.get("params", {})
    req_id = req.get("id")

    if method == "summarize":
        snapshots = params.get("context_snapshots", [])
        handoff_target = params.get("handoff_target", "next agent")
        style = params.get("style", "brief")

        if not snapshots:
            return make_response({
                "summary": "No context snapshots provided",
                "key_decisions": [],
                "open_todos": [],
                "files_touched": [],
                "current_state": "Empty session",
            }, req_id)

        snapshots_text = format_snapshots(snapshots)

        # Try Ollama first
        if check_ollama_available():
            models = get_available_models()
            model = select_model(models)
            logger.info("Using Ollama model: %s", model)

            result = generate_summary_ollama(snapshots_text, model)
            if result:
                result["model_used"] = model
                return make_response(result, req_id)

        # Fallback to template
        logger.info("Using template-based summary (Ollama unavailable)")
        result = template_summary(snapshots)
        result["model_used"] = "template"
        return make_response(result, req_id)

    elif method == "health":
        ollama_available = check_ollama_available()
        models = get_available_models() if ollama_available else []
        return make_response({
            "status": "healthy",
            "ollama_available": ollama_available,
            "models": models,
            "pid": os.getpid(),
        }, req_id)

    elif method == "shutdown":
        global running
        running = False
        return make_response({"status": "shutting down"}, req_id)

    else:
        return make_error(f"Unknown method: {method}", -32601, req_id)


def main():
    logger.info("summary-engine started (pid=%d)", os.getpid())

    # Send ready signal
    ready = {"jsonrpc": "2.0", "method": "ready", "params": {"pid": os.getpid()}}
    sys.stdout.write(json.dumps(ready) + "\n")
    sys.stdout.flush()

    while running:
        try:
            line = sys.stdin.readline()
            if not line:
                break

            line = line.strip()
            if not line:
                continue

            req = json.loads(line)
            resp = handle_request(req)
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()

        except json.JSONDecodeError as e:
            err = make_error(f"Invalid JSON: {e}")
            sys.stdout.write(json.dumps(err) + "\n")
            sys.stdout.flush()
        except Exception as e:
            logger.error("Error: %s", e)
            err = make_error(str(e))
            sys.stdout.write(json.dumps(err) + "\n")
            sys.stdout.flush()

    logger.info("summary-engine exited")


if __name__ == "__main__":
    main()
