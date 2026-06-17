"""
Mothership — CrewAI Handoff Flow

Defines a CrewAI Flow that orchestrates agent-to-agent handoffs.
Uses @start, @listen, and @router decorators for event-driven workflow.

Flow stages:
  1. receive_handoff  — Parse incoming context from the source agent
  2. analyze_context  — Run CrewAI agents to analyze the context
  3. route_handoff    — Decide routing based on context complexity
  4. enrich_summary   — Deep analysis for complex contexts
  5. direct_summary   — Quick summary for simple contexts
  6. finalize         — Return structured handoff result
"""

import json
import logging
from typing import Any, Optional

from crewai.flow.flow import Flow, listen, router, start, or_
from crewai import Agent, Task, Crew, Process
logger = logging.getLogger("crewai-bridge.flow")

# ---------------------------------------------------------------------------
# Handoff state — passed through the flow via self.state
# ---------------------------------------------------------------------------

HANDOFF_SYSTEM_PROMPT = """You are a context handoff specialist for an AI agent workspace.
Your job is to analyze agent session data and produce a structured handoff summary.
Focus on:
1. What was accomplished
2. Key decisions made
3. Open issues or TODOs
4. Files or systems touched
5. Current work state
6. Recommended next actions for the receiving agent

Be concise but thorough. Use bullet points for clarity."""


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
        return request

    @listen(receive_handoff)
    def analyze_context(self, request: dict) -> dict:
        """
        Use a CrewAI agent to analyze the source context.
        Returns structured analysis data.
        """
        entries = request.get("entries", [])
        source_agent = request.get("source_agent_id", "unknown")
        target_agent = request.get("target_agent_id", "unknown")

        # Build a text summary of the entries for the agent
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

        try:
            result = crew.kickoff()
            analysis_text = str(result.raw) if hasattr(result, "raw") else str(result)
        except Exception as e:
            logger.error("CrewAI analysis failed: %s", e)
            analysis_text = self._fallback_analysis(entries)

        return {
            "source_agent": source_agent,
            "target_agent": target_agent,
            "entry_count": len(entries),
            "raw_analysis": analysis_text,
        }

    @router(analyze_context)
    def route_handoff(self, analysis: dict) -> str:
        """
        Decide whether the context needs deep enrichment or a direct summary.
        Returns method name to route to.
        """
        entry_count = analysis.get("entry_count", 0)
        raw = analysis.get("raw_analysis", "")

        # Simple heuristic: more than 10 entries or long analysis = complex
        if entry_count > 10 or len(raw) > 2000:
            logger.info("Routing to enrich_summary (complex context)")
            return "enrich_summary"
        else:
            logger.info("Routing to direct_summary (simple context)")
            return "direct_summary"

    @listen("enrich_summary")
    def enrich_summary(self, analysis: dict) -> dict:
        """
        Deep analysis for complex contexts — uses a second agent to write summary.
        """
        writer = create_summarize_agent()

        write_prompt = f"""Based on this context analysis, write a comprehensive handoff summary:

{analysis.get('raw_analysis', '')}

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

        try:
            result = crew.kickoff()
            summary_text = str(result.raw) if hasattr(result, "raw") else str(result)
        except Exception as e:
            logger.error("CrewAI enrichment failed: %s", e)
            summary_text = analysis.get("raw_analysis", "")

        return {
            **analysis,
            "summary": summary_text,
            "enriched": True,
        }

    @listen("direct_summary")
    def direct_summary(self, analysis: dict) -> dict:
        """
        Quick pass-through for simple contexts.
        Just formats the raw analysis into structured output.
        """
        raw = analysis.get("raw_analysis", "")
        parsed = self._parse_structured(raw)

        return {
            **analysis,
            "summary": parsed.get("overview", raw[:500]),
            "decisions": parsed.get("decisions", []),
            "files_touched": parsed.get("files", []),
            "todos": parsed.get("todos", []),
            "current_state": parsed.get("state", ""),
            "enriched": False,
        }

    @listen(or_(enrich_summary, direct_summary))
    def finalize(self, result: dict) -> dict:
        """
        Final step — build the complete handoff payload.
        """
        summary = result.get("summary", "")
        parsed = self._parse_structured(summary)

        return {
            "source_agent_id": result.get("source_agent", ""),
            "target_agent_id": result.get("target_agent", ""),
            "entry_count": result.get("entry_count", 0),
            "summary": parsed.get("overview", summary[:500]),
            "key_decisions": result.get("decisions", parsed.get("decisions", [])),
            "open_todos": result.get("todos", parsed.get("todos", [])),
            "files_touched": result.get("files_touched", parsed.get("files", [])),
            "current_state": parsed.get("state", ""),
            "enriched": result.get("enriched", False),
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
        all_decisions = []

        for entry in entries:
            files = entry.get("files_referenced", entry.get("filesReferenced", []))
            all_files.update(files)
            content = entry.get("content", "")

        summary_parts = []
        if all_files:
            summary_parts.append(f"Files: {', '.join(list(all_files)[:10])}")
        summary_parts.append(f"Total entries: {len(entries)}")

        return "\n".join(summary_parts) if summary_parts else "No context data"

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
