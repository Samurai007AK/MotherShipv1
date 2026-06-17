"""
Mothership — OpenHands Bridge (Sidecar)

A Python sidecar that uses the OpenHands SDK for sandboxed agent execution.
Provides programmatic control over AI agents that can execute terminal commands,
edit files, and perform software engineering tasks in an isolated environment.

Protocol: JSON-RPC 2.0 over stdin/stdout (one JSON object per line).

Commands:
  - run_task: Execute a task with an OpenHands agent (sandboxed execution)
  - list_files: List files in the agent's workspace
  - read_file: Read a file from the agent's workspace
  - run_command: Execute a shell command in the sandbox
  - health: Check if the sidecar is running
  - shutdown: Exit gracefully

Usage:
  python main.py

Architecture:
  Mothership (Rust/Tauri) ↔ JSON-RPC over STDIO ↔ openhands-bridge (Python)
                                                           ↕
                                                    OpenHands SDK
                                                           ↕
                                                 Docker/Local Sandbox
"""

import sys
import json
import signal
import logging
import os
import traceback
from typing import Optional

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("openhands-bridge")

running = True
# Active agent conversation (one at a time for simplicity)
active_conversation = None


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


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

def handle_request(req):
    """Parse and execute a JSON-RPC request."""
    method = req.get("method", "")
    params = req.get("params", {})
    req_id = req.get("id")

    if method == "run_task":
        return handle_run_task(params, req_id)
    elif method == "list_files":
        return handle_list_files(params, req_id)
    elif method == "read_file":
        return handle_read_file(params, req_id)
    elif method == "run_command":
        return handle_run_command(params, req_id)
    elif method == "health":
        return make_response(
            {
                "status": "healthy",
                "pid": os.getpid(),
                "openhands_available": _check_openhands(),
                "sandbox_type": _get_sandbox_type(),
            },
            req_id,
        )
    elif method == "shutdown":
        global running
        _cleanup_conversation()
        running = False
        return make_response({"status": "shutting down"}, req_id)
    else:
        return make_error(f"Unknown method: {method}", -32601, req_id)


def handle_run_task(params: dict, req_id):
    """
    Run a task with an OpenHands agent.

    Expected params:
      - task: str — the task description
      - workspace: str (optional) — workspace directory path
      - model: str (optional) — LLM model to use (default: claude-sonnet)
      - sandbox: str (optional) — 'docker' or 'local' (default: 'local')
      - api_key: str (optional) — LLM API key
    """
    try:
        from openhands.sdk import LLM, Agent, Conversation, Tool
        from openhands.tools.terminal import TerminalTool
        from openhands.tools.file_editor import FileEditorTool
    except ImportError as e:
        logger.warning("OpenHands SDK not available: %s", e)
        # Fallback: simulate execution locally
        return _fallback_run_task(params, req_id)

    global active_conversation

    task = params.get("task", "")
    workspace = params.get("workspace", os.getcwd())
    model = params.get("model", os.environ.get("LLM_MODEL", "anthropic/claude-sonnet-4-5-20250929"))
    api_key = params.get("api_key", os.environ.get("LLM_API_KEY", ""))
    sandbox = params.get("sandbox", "local")

    if not task:
        return make_error("Task description is required", -32602, req_id)

    try:
        # Initialize LLM
        llm = LLM(model=model, api_key=api_key if api_key else None)

        # Define agent with tools
        agent = Agent(
            llm=llm,
            tools=[
                Tool(name=TerminalTool.name),
                Tool(name=FileEditorTool.name),
            ],
        )

        # Create workspace (docker sandbox if requested)
        if sandbox == "docker":
            try:
                from openhands.workspace import DockerWorkspace
                ws = DockerWorkspace(base_image="python:3.12-slim")
                workspace_obj = ws
            except ImportError:
                logger.warning("DockerWorkspace not available, falling back to local")
                workspace_obj = workspace
        else:
            os.makedirs(workspace, exist_ok=True)
            workspace_obj = workspace

        # Create conversation and run
        conversation = Conversation(agent=agent, workspace=workspace_obj)
        active_conversation = conversation

        conversation.send_message(task)
        result = conversation.run()

        # Extract messages from the conversation
        messages = []
        if hasattr(conversation, "messages"):
            messages = [
                {"role": m.get("role", "assistant"), "content": m.get("content", "")}
                for m in conversation.messages[-10:]  # Last 10 messages
            ]

        # Extract the final output
        final_output = ""
        if hasattr(result, "output"):
            final_output = result.output
        elif isinstance(result, str):
            final_output = result
        elif messages:
            # Last assistant message is the final output
            for m in reversed(messages):
                if m["role"] == "assistant":
                    final_output = m["content"]
                    break

        logger.info("Task completed: %s...", task[:50])

        return make_response(
            {
                "status": "completed",
                "output": final_output,
                "messages": messages,
                "workspace": str(workspace_obj) if not isinstance(workspace_obj, str) else workspace_obj,
                "model_used": model,
            },
            req_id,
        )

    except Exception as e:
        logger.error("OpenHands task failed: %s\n%s", e, traceback.format_exc())
        return make_error(f"OpenHands task failed: {e}", -32603, req_id)

    finally:
        active_conversation = None


def handle_list_files(params: dict, req_id):
    """List files in the agent's workspace."""
    path = params.get("path", os.getcwd())

    try:
        import os
        files = []
        for entry in os.scandir(path):
            files.append({
                "name": entry.name,
                "path": entry.path,
                "is_dir": entry.is_dir(),
                "size": entry.stat().st_size if entry.is_file() else 0,
            })
        files.sort(key=lambda f: (f["is_dir"], f["name"]))
        return make_response({"files": files, "path": path}, req_id)
    except Exception as e:
        return make_error(f"Failed to list files: {e}", -32603, req_id)


def handle_read_file(params: dict, req_id):
    """Read a file from the agent's workspace."""
    file_path = params.get("path", "")

    if not file_path:
        return make_error("File path is required", -32602, req_id)

    try:
        import os
        if not os.path.exists(file_path):
            return make_error(f"File not found: {file_path}", -32602, req_id)

        with open(file_path, "r") as f:
            content = f.read()

        return make_response(
            {
                "path": file_path,
                "content": content,
                "size": len(content),
                "line_count": content.count("\n") + 1,
            },
            req_id,
        )
    except Exception as e:
        return make_error(f"Failed to read file: {e}", -32603, req_id)


def handle_run_command(params: dict, req_id):
    """Execute a shell command in the sandbox."""
    command = params.get("command", "")
    cwd = params.get("cwd", os.getcwd())

    if not command:
        return make_error("Command is required", -32602, req_id)

    try:
        import subprocess
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            cwd=cwd,
            timeout=params.get("timeout", 30),
        )

        return make_response(
            {
                "command": command,
                "stdout": result.stdout[:5000],  # Limit output size
                "stderr": result.stderr[:2000],
                "exit_code": result.returncode,
            },
            req_id,
        )
    except subprocess.TimeoutExpired:
        return make_error("Command timed out", -32603, req_id)
    except Exception as e:
        return make_error(f"Command failed: {e}", -32603, req_id)


# ---------------------------------------------------------------------------
# Fallback when OpenHands SDK is not installed
# ---------------------------------------------------------------------------

def _fallback_run_task(params: dict, req_id):
    """Simulate agent execution when OpenHands SDK is not available."""
    task = params.get("task", "")
    workspace = params.get("workspace", os.getcwd())

    logger.info("Fallback mode: simulating task execution")

    return make_response(
        {
            "status": "simulated",
            "output": (
                f"Task received: {task[:100]}...\n\n"
                f"OpenHands SDK is not installed. To enable full agent execution:\n"
                f"  1. pip install openhands-sdk openhands-tools\n"
                f"  2. Set LLM_API_KEY and LLM_MODEL environment variables\n"
                f"  3. Restart the sidecar\n\n"
                f"Workspace: {workspace}\n"
                f"Files available: {len(os.listdir(workspace)) if os.path.isdir(workspace) else 0}"
            ),
            "messages": [
                {"role": "user", "content": task},
                {"role": "assistant", "content": "OpenHands SDK not available"},
            ],
            "workspace": workspace,
            "model_used": "fallback",
        },
        req_id,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _check_openhands() -> bool:
    """Check if OpenHands SDK is available."""
    try:
        import openhands.sdk
        return True
    except ImportError:
        return False


def _get_sandbox_type() -> str:
    """Detect available sandbox type."""
    if _check_openhands():
        try:
            from openhands.workspace import DockerWorkspace
            return "docker"
        except ImportError:
            pass
        return "local"
    return "none"


def _cleanup_conversation():
    """Clean up any active conversation."""
    global active_conversation
    if active_conversation is not None:
        try:
            if hasattr(active_conversation, "close"):
                active_conversation.close()
        except Exception:
            pass
        active_conversation = None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    logger.info("openhands-bridge started (pid=%d)", os.getpid())

    # Check OpenHands availability
    if _check_openhands():
        try:
            import openhands
            logger.info("OpenHands SDK available")
        except ImportError:
            logger.warning("OpenHands SDK not installed — running in fallback mode")
    else:
        logger.warning("OpenHands SDK not installed — running in fallback mode")

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
            logger.error("Error: %s\n%s", e, traceback.format_exc())
            err = make_error(str(e))
            sys.stdout.write(json.dumps(err) + "\n")
            sys.stdout.flush()

    logger.info("openhands-bridge exited")


if __name__ == "__main__":
    main()
