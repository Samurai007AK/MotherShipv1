"""
Mothership — CrewAI Bridge (Sidecar)

A Python sidecar that uses CrewAI's Flow API for orchestrating agent-to-agent
handoffs. Provides structured context analysis and summary generation using
CrewAI agent teams.

Protocol: JSON-RPC 2.0 over stdin/stdout (one JSON object per line).

Commands:
  - handoff: Run CrewAI Flow to analyze and summarize handoff context
  - health: Check if the sidecar is running
  - shutdown: Exit gracefully

Usage:
  python main.py

Flow:
  1. Receives handoff request with source/target agent IDs and context entries
  2. Runs a CrewAI Flow: receive → analyze → route → enrich/direct → finalize
  3. Returns structured handoff result with summary, decisions, TODOs, files
"""

import sys
import json
import signal
import logging
import os
import traceback

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("crewai-bridge")

running = True


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


def handle_request(req):
    """Parse and execute a JSON-RPC request."""
    method = req.get("method", "")
    params = req.get("params", {})
    req_id = req.get("id")

    if method == "handoff":
        return handle_handoff(params, req_id)
    elif method == "health":
        return make_response(
            {
                "status": "healthy",
                "pid": os.getpid(),
                "crewai_available": True,
            },
            req_id,
        )
    elif method == "shutdown":
        global running
        running = False
        return make_response({"status": "shutting down"}, req_id)
    else:
        return make_error(f"Unknown method: {method}", -32601, req_id)


def handle_handoff(params: dict, req_id):
    """
    Run the CrewAI Handoff Flow with the given parameters.

    Expected params:
      - source_agent_id: str
      - target_agent_id: str
      - entries: list[dict] — context entries from the source agent
    """
    try:
        from flow import HandoffFlow

        source_agent = params.get("source_agent_id", "unknown")
        target_agent = params.get("target_agent_id", "unknown")
        entries = params.get("entries", [])

        logger.info(
            "Running handoff flow: %s → %s (%d entries)",
            source_agent,
            target_agent,
            len(entries),
        )

        # Create and run the flow
        flow = HandoffFlow()
        flow.state["handoff_request"] = {
            "source_agent_id": source_agent,
            "target_agent_id": target_agent,
            "entries": entries,
        }

        # Kick off — finalize() returns the handoff payload
        result = flow.kickoff()

        # Extract the result
        if hasattr(result, "raw"):
            handoff_result = result.raw
        elif isinstance(result, dict):
            handoff_result = result
        else:
            handoff_result = flow.state.get("finalize_result", {
                "source_agent_id": source_agent,
                "target_agent_id": target_agent,
                "summary": "Handoff completed",
                "key_decisions": [],
                "open_todos": [],
                "files_touched": [],
                "current_state": "",
                "enriched": False,
                "model_used": "crewai",
            })

        logger.info(
            "Handoff flow complete: %s → %s (enriched=%s)",
            source_agent,
            target_agent,
            handoff_result.get("enriched", False),
        )

        return make_response(handoff_result, req_id)

    except ImportError as e:
        logger.error("CrewAI not available: %s", e)
        # Fallback: return a basic template result
        return make_response(
            {
                "source_agent_id": params.get("source_agent_id", ""),
                "target_agent_id": params.get("target_agent_id", ""),
                "summary": f"Handoff from {params.get('source_agent_id', 'unknown')} to {params.get('target_agent_id', 'unknown')}. "
                           f"CrewAI is not available. Install with: pip install crewai",
                "key_decisions": [],
                "open_todos": [],
                "files_touched": [],
                "current_state": "CrewAI unavailable",
                "enriched": False,
                "model_used": "fallback",
            },
            req_id,
        )
    except Exception as e:
        logger.error("Handoff flow failed: %s\n%s", e, traceback.format_exc())
        return make_error(f"Handoff flow failed: {e}", -32603, req_id)


def main():
    logger.info("crewai-bridge started (pid=%d)", os.getpid())

    # Check CrewAI availability
    try:
        import crewai
        logger.info("CrewAI version: %s", crewai.__version__)
    except ImportError:
        logger.warning("CrewAI not installed — running in fallback mode")

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

    logger.info("crewai-bridge exited")


if __name__ == "__main__":
    main()
