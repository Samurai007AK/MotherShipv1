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
"""

import sys
import logging
import os
import traceback
import io
from contextlib import redirect_stdout

# Ensure shared package is importable regardless of working directory
_this_dir = os.path.dirname(os.path.abspath(__file__))
_shared_parent = os.path.abspath(os.path.join(_this_dir, '..'))
if _shared_parent not in sys.path:
    sys.path.insert(0, _shared_parent)

from shared.json_rpc_sidecar import JsonRpcSidecar

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("crewai-bridge")

sidecar = JsonRpcSidecar("crewai-bridge", logger)


@sidecar.method("handoff")
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
        # Suppress stdout to prevent CrewAI's flow diagram (emoji + box-drawing)
        # from corrupting the JSON-RPC protocol on stdout
        with redirect_stdout(io.StringIO()):
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

        return sidecar.ok(handoff_result, req_id)

    except ImportError as e:
        logger.error("CrewAI not available: %s", e)
        return sidecar.ok(
            {
                "source_agent_id": params.get("source_agent_id", ""),
                "target_agent_id": params.get("target_agent_id", ""),
                "summary": f"Handoff from {params.get('source_agent_id', 'unknown')} to {params.get('target_agent_id', 'unknown')}. "
                           f"CrewAI is not available. Install with: pip install crewai",
                "entry_count": len(params.get("entries", [])),
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
        return sidecar.error(f"Handoff flow failed: {e}", -32603, req_id)


if __name__ == "__main__":
    # Check CrewAI availability
    try:
        import crewai
        logger.info("CrewAI version: %s", crewai.__version__)
    except ImportError:
        logger.warning("CrewAI not installed — running in fallback mode")

    sidecar.run()
