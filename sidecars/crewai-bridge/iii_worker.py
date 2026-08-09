"""
iii Worker Spike — CrewAI Handoff Bridge
==========================================
Replaces the JSON-RPC stdin/stdout sidecar (main.py) with an iii worker.

Before:  Python subprocess managed by Tauri, JSON-RPC over stdin/stdout
After:   iii worker registered with the iii engine, callable by function ID

Workers can call crewai::handoff just like any other iii function.
iii handles: lifecycle, reconnection, tracing, observability, call routing.

Usage:
  1. Start the iii engine:  iii
  2. Register this worker:  python iii_worker.py
  3. Call from any worker:  iii.trigger({"function_id": "crewai::handoff", ...})
"""

import logging
import os
import sys

# ── iii SDK ────────────────────────────────────────────────────────────────
# pip install iii-sdk
from iii import register_worker

# ── CrewAI imports (lazy — fallback if not installed) ──────────────────────

logger = logging.getLogger("crewai-bridge.iii")


def handoff_handler(data: dict) -> dict:
    """
    III function: crewai::handoff

    Expected payload:
      source_agent_id: str
      target_agent_id: str
      entries: list[dict]

    Returns structured handoff result with summary, decisions, TODOs, files.
    Falls back to template analysis if CrewAI is unavailable or times out.
    """
    source_agent = data.get("source_agent_id", "unknown")
    target_agent = data.get("target_agent_id", "unknown")
    entries = data.get("entries", [])

    logger.info(
        "Handoff: %s → %s (%d entries)",
        source_agent,
        target_agent,
        len(entries),
    )

    try:
        # Lazy import — CrewAI may not be installed
        from flow import HandoffFlow

        import io
        from contextlib import redirect_stdout

        flow = HandoffFlow()
        flow.state["handoff_request"] = {
            "source_agent_id": source_agent,
            "target_agent_id": target_agent,
            "entries": entries,
        }

        # Suppress CrewAI's flow diagram (emoji box-drawing) — it writes to
        # stdout which would corrupt the JSON-RPC protocol in the old sidecar,
        # but with iii, stdout is isolated per worker so this is cosmetic only.
        with redirect_stdout(io.StringIO()):
            result = flow.kickoff()

        if hasattr(result, "raw"):
            handoff_result = result.raw
        elif isinstance(result, dict):
            handoff_result = result
        else:
            handoff_result = {
                "source_agent_id": source_agent,
                "target_agent_id": target_agent,
                "summary": "Handoff completed",
                "key_decisions": [],
                "open_todos": [],
                "files_touched": [],
                "current_state": "",
                "enriched": False,
                "model_used": "crewai",
            }

        logger.info("Handoff complete (enriched=%s)", handoff_result.get("enriched", False))
        return handoff_result

    except ImportError:
        logger.warning("CrewAI not installed — returning fallback")
        return {
            "source_agent_id": source_agent,
            "target_agent_id": target_agent,
            "summary": f"Handoff from {source_agent} to {target_agent}. "
                       f"CrewAI is not available.",
            "entry_count": len(entries),
            "key_decisions": [],
            "open_todos": [],
            "files_touched": [],
            "current_state": "CrewAI unavailable",
            "enriched": False,
            "model_used": "fallback",
        }
    except Exception as e:
        logger.error("Handoff failed: %s", e, exc_info=True)
        return {
            "source_agent_id": source_agent,
            "target_agent_id": target_agent,
            "summary": f"Handoff failed: {e}",
            "entry_count": len(entries),
            "key_decisions": [],
            "open_todos": [],
            "files_touched": [],
            "current_state": "error",
            "enriched": False,
            "model_used": "error",
        }


def health_handler(data: dict) -> dict:
    """III function: crewai::health"""
    crewai_available = False
    try:
        import crewai  # noqa: F401
        crewai_available = True
    except ImportError:
        pass

    return {
        "status": "healthy",
        "pid": os.getpid(),
        "crewai_available": crewai_available,
    }


# ── Worker registration & startup ──────────────────────────────────────────

III_ENGINE_URL = os.environ.get("III_ENGINE_URL", "ws://localhost:49134")

def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    logger.info("Connecting to iii engine at %s", III_ENGINE_URL)

    # Register this process as an iii worker
    iii = register_worker(III_ENGINE_URL)

    # ── Register functions ──────────────────────────────────────────────
    # Other workers call these by function ID.
    # iii handles: serialization, routing, retries, timeouts, tracing.

    iii.register_function({"id": "crewai::handoff"}, handoff_handler)
    iii.register_function({"id": "crewai::health"}, health_handler)

    # ── Register triggers ───────────────────────────────────────────────
    # Optional: expose handoff via HTTP so the Tauri frontend can call it
    # directly without going through another worker.
    iii.register_trigger({
        "type": "http",
        "function_id": "crewai::handoff",
        "config": {
            "api_path": "/crewai/handoff",
            "http_method": "POST",
        },
    })

    iii.register_trigger({
        "type": "http",
        "function_id": "crewai::health",
        "config": {
            "api_path": "/crewai/health",
            "http_method": "GET",
        },
    })

    logger.info("CrewAI bridge worker registered — waiting for calls")
    logger.info("  Functions: crewai::handoff, crewai::health")
    logger.info("  HTTP: POST /crewai/handoff, GET /crewai/health")

    # Block forever — iii handles reconnection internally
    # The SDK's register_worker() blocks the main thread.
    # On disconnect, it auto-reconnects and re-registers.
    import asyncio
    try:
        asyncio.get_event_loop().run_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down")


if __name__ == "__main__":
    main()
