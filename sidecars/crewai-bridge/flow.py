"""
Mothership — CrewAI Handoff Flow

Defines a CrewAI Flow that orchestrates agent-to-agent handoffs.
Uses @start, @listen, and @router decorators for event-driven workflow.

Flow stages:   1. receive_handoff  — Parse incoming context from the source agent
  2. analyze_context  — Run CrewAI agents to analyze the context
  3. route_handoff    — Decide routing based on context complexity   4. finalize         — Build structured handoff result (handles both
                        direct_summary and enrich_summary inline to avoid
                        CrewAI Flow or_() infinite-loop issues)

Run with:
  python -m crewai flow kickoff

Progress notifications:
  The flow calls notify_progress() at each stage, which writes JSON to stderr
  in the format: {"jsonrpc": "2.0", "method": "flow_progress", "params": {"stage": "...", "progress": ..., "message": "..."}}
  The Rust side reads stderr and forwards these as Tauri events to the frontend.
"""

import concurrent.futures
import io
import json
import logging
import sys
from contextlib import redirect_stdout
from typing import Any, Optional, Callable

from crewai.flow.flow import Flow, listen, router, start
from crewai import Agent, Task, Crew, Process

logger = logging.getLogger("crewai-bridge.flow")


# ── Progress notification helper ───────────────────────────────────────────

def notify_progress(stage: str, progress: int, message: str):
    """
    Emit a progress notification to stderr as a JSON-RPC notification.
    The Rust SidecarManager reads stderr and forwards this as a Tauri event
    to the frontend ("crewai-flow-progress").
    """
    payload = json.dumps({
        "jsonrpc": "2.0",
        "method": "flow_progress",
        "params": {
            "stage": stage,
            "progress": progress,
            "message": message,
        },
    })
    sys.stderr.write(payload + "\n")
    sys.stderr.flush()


def _silent_kickoff(crew: "Crew") -> Any:
    """Run crew.kickoff() while suppressing its stdout output (crewai prints a
    visual flow diagram with emoji that would corrupt the JSON-RPC protocol)."""
    with redirect_stdout(io.StringIO()):
        return crew.kickoff()


# ---------------------------------------------------------------------------
# Analyze Agent — CrewAI Agent that analyzes context
# ---------------------------------------------------------------------------


def create_analyze_agent() -> Agent:
    return Agent(
        role="Context Analyst",
        goal="Analyze agent session context and extract key information for handoff",
        backstory="An expert at understanding what happened in an agent session and "
        "summarizing it clearly for the next agent to pick up seamlessly.",
        verbose=False,
        allow_delegation=False,
    )


def create_summarize_agent() -> Agent:
    return Agent(
        role="Summary Writer",
        goal="Write a clear, structured summary from analyzed context",
        backstory="A technical writer who specializes in creating concise, actionable "
        "handoff documents from raw agent context data.",
        verbose=False,
        allow_delegation=False,
    )


# ---------------------------------------------------------------------------
# The Flow
# ---------------------------------------------------------------------------


class HandoffFlow(Flow):
    """CrewAI Flow for agent-to-agent context handoff."""

    model_config = {"arbitrary_types_allowed": True}

    @start()
    def receive_handoff(self) -> dict:
        """
        Entry point. Parse incoming handoff request and store context.
        The caller sets self.state['handoff_request'] before kicking off.
        """
        request = self.state.get("handoff_request", {})
        logger.info(
            "Received handoff: source=%s, target=%s, entries=%d",
            request.get("source_agent_id"),
            request.get("target_agent_id"),
            len(request.get("entries", [])),
        )
        notify_progress(
            "receive_handoff",
            15,
            f"Received {len(request.get('entries', []))} context entries from {request.get('source_agent_id')}",
        )
        return request

    @listen(receive_handoff)
    def analyze_context(self, request: dict) -> dict:
        """
        Use a CrewAI agent to analyze the source context.
        Returns structured analysis data.
        Falls back to template-based analysis if CrewAI is unavailable, times out,
        or no LLM API key is configured.
        """
        entries = request.get("entries", [])
        source_agent = request.get("source_agent_id", "unknown")
        target_agent = request.get("target_agent_id", "unknown")

        notify_progress(
            "analyze_context",
            30,
            f"Analyzing {len(entries)} context entries from {source_agent}...",
        )

        context_text = self._format_entries(entries)

        analysis_prompt = f"""Analyze the following agent session context for a handoff.

Source agent: {source_agent}
Target agent: {target_agent}
Context entries: {len(entries)}

Context data:
{context_text}

Produce a structured analysis with:
1. What was the agent working on?
2. What decisions were made?
3. What's the current state?
4. What should the next agent know?
"""

        analyzer = create_analyze_agent()
        task = Task(
            description=analysis_prompt,
            expected_output="A structured analysis with sections: overview, decisions, state, next_steps, files_touched",
            agent=analyzer,
        )

        crew = Crew(
            agents=[analyzer],
            tasks=[task],
            process=Process.sequential,
            verbose=False,
        )

        pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        try:
            fut = pool.submit(lambda: _silent_kickoff(crew))
            result = fut.result(timeout=30)
            analysis_text = str(result.raw) if hasattr(result, "raw") else str(result)
        except concurrent.futures.TimeoutError:
            logger.warning("CrewAI analysis timed out after 30s — using fallback")
            analysis_text = self._fallback_analysis(entries)
        except Exception as e:
            logger.error("CrewAI analysis failed: %s", e)
            analysis_text = self._fallback_analysis(entries)
        finally:
            pool.shutdown(wait=False)

        notify_progress(
            "analyze_context",
            60,
            f"Context analysis complete ({len(entries)} entries processed)",
        )

        return {
            "source_agent": source_agent,
            "target_agent": target_agent,
            "entry_count": len(entries),
            "raw_analysis": analysis_text,
        }

    @router(analyze_context)
    def route_handoff(self, analysis: dict) -> str:
        """
        Decide whether the context needs deep enrichment or a direct summary.        Returns 'finalize_step' — triggers the @listen("finalize_step") listener."""
        entry_count = analysis.get("entry_count", 0)
        raw = analysis.get("raw_analysis", "")

        # Tag the analysis with routing decision so finish() can choose the path
        if entry_count > 10 or len(raw) > 2000:
            routing = "enrich"
            logger.info("Complex context — will enrich")
        else:
            routing = "direct"
            logger.info("Simple context — direct summary")

        analysis["_routed_to"] = routing

        notify_progress(
            "route_handoff",
            75,
            f"Routing decision: {'Enriched summary (complex context)' if routing == 'enrich' else 'Direct summary (simple context)'}",
        )

        return "finalize_step"

    @listen("finalize_step")
    def finalize(self, analysis: dict) -> dict:
        """
        Final step — build the complete handoff payload.
        Handles both direct (simple) and enriched (complex) paths inline
        to avoid CrewAI Flow or_() infinite-loop issues.

        NOTE: The @listen label "finalize_step" deliberately differs from the
        method name to avoid a CrewAI v1.14.7 bug where a @listen label
        matching the method's own name causes an infinite self-loop.
        """
        routed_to = analysis.get("_routed_to", "direct")
        raw = analysis.get("raw_analysis", "")

        notify_progress(
            "finalize",
            85,
            f"Building {'enriched' if routed_to == 'enrich' else 'direct'} handoff payload...",
        )

        # For complex contexts, attempt enrichment with a second agent
        if routed_to == "enrich":
            try:
                writer = create_summarize_agent()
                write_prompt = f"""Based on this context analysis, write a comprehensive handoff summary:

{raw}

Format:
OVERVIEW: 2-3 sentences
DECISIONS: Bullet points
STATE: Current state
TODO: Next steps
FILES: Files/modules touched
"""
                task = Task(
                    description=write_prompt,
                    expected_output="Structured summary with OVERVIEW, DECISIONS, STATE, TODO, FILES sections",
                    agent=writer,
                )
                crew = Crew(
                    agents=[writer],
                    tasks=[task],
                    process=Process.sequential,
                    verbose=False,
                )
                pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
                try:
                    fut = pool.submit(lambda: _silent_kickoff(crew))
                    result = fut.result(timeout=30)
                    summary_text = (
                        str(result.raw) if hasattr(result, "raw") else str(result)
                    )
                    enriched = True
                except Exception:
                    summary_text = raw
                    enriched = False
                finally:
                    pool.shutdown(wait=False)
            except Exception:
                summary_text = raw
                enriched = False
        else:
            # Direct summary — parse the raw analysis
            parsed = self._parse_structured(raw)
            summary_text = parsed.get("overview", raw[:500])
            enriched = False

        # Build final handoff payload
        parsed = self._parse_structured(summary_text)

        return {
            "source_agent_id": analysis.get("source_agent", ""),
            "target_agent_id": analysis.get("target_agent", ""),
            "entry_count": analysis.get("entry_count", 0),
            "summary": parsed.get("overview", summary_text[:500]),
            "key_decisions": parsed.get("decisions", []),
            "open_todos": parsed.get("todos", []),
            "files_touched": parsed.get("files", []),
            "current_state": parsed.get("state", ""),
            "enriched": enriched,
            "model_used": "crewai",
        }

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    def _format_entries(self, entries: list[dict]) -> str:
        """Format entries into readable text for the LLM."""
        parts = []
        for i, entry in enumerate(entries[:20], 1):  # Max 20 entries
            content = entry.get("content", "")[:500]
            etype = entry.get("entry_type", entry.get("entryType", "unknown"))
            agent = entry.get("agent_id", entry.get("agentId", "unknown"))
            parts.append(f"[{i}] ({etype}) {agent}:\n{content}")
        return "\n\n".join(parts)

    def _fallback_analysis(self, entries: list[dict]) -> str:
        """Generate a template-based analysis without LLM."""
        all_files = set()

        for entry in entries:
            files = entry.get("files_referenced", entry.get("filesReferenced", []))
            all_files.update(files)

        summary_parts = []
        if all_files:
            summary_parts.append(f"Files: {', '.join(list(all_files)[:10])}")
        summary_parts.append(f"Total entries: {len(entries)}")

        return "\n".join(summary_parts)

    def _parse_structured(self, text: str) -> dict:
        """Parse structured sections from LLM output."""
        result = {
            "overview": "",
            "decisions": [],
            "state": "",
            "todos": [],
            "files": [],
        }

        lines = text.strip().split("\n")
        current_section = None

        for line in lines:
            line = line.strip()
            if not line:
                continue

            upper = line.upper()
            if upper.startswith("OVERVIEW:"):
                current_section = "overview"
                result["overview"] = line[len("OVERVIEW:"):].strip()
            elif upper.startswith("DECISIONS:"):
                current_section = "decisions"
                rest = line[len("DECISIONS:"):].strip()
                if rest and rest.lower() not in ("none", "none recorded"):
                    result["decisions"].append(rest)
            elif upper.startswith("STATE:"):
                current_section = "state"
                result["state"] = line[len("STATE:"):].strip()
            elif upper.startswith("TODO:"):
                current_section = "todos"
                rest = line[len("TODO:"):].strip()
                if rest and rest.lower() != "none":
                    result["todos"].append(rest)
            elif upper.startswith("FILES:"):
                current_section = "files"
                rest = line[len("FILES:"):].strip()
                if rest and rest.lower() != "none":
                    result["files"].append(rest)
            elif line.startswith("- ") or line.startswith("* "):
                item = line[2:].strip()
                if current_section in ("decisions", "todos", "files"):
                    result[current_section].append(item)
            elif current_section == "overview" and not result["overview"]:
                result["overview"] = line
            elif current_section == "state":
                result["state"] += " " + line

        return result
