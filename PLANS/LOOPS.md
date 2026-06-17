# Mothership — Loops: Agentic Execution Engine

**Last Updated:** 2026-06-16 (v3 — Clarified as abstract architecture)
**Status:** Final Draft
**Scope:** Core runtime pattern applicable across all phases
**Type:** Abstract architecture reference

> **Note:** This document defines the **conceptual architecture** for agentic loops in Mothership. For concrete type definitions, store implementations, and Rust/TypeScript code, see the implementation documents listed in [See Also](#see-also) below. The data models here are intentionally abstract — concrete implementations live in `UNIFIED-STORE.md` and `MOTHERSHIP-RALPH.md`.

---

## Overview

**Loops** are the foundational execution pattern that enables autonomous agent work in Mothership. Rather than a single request-response interaction, an agent operates in a continuous loop: it receives a task, executes actions, evaluates results, and decides whether to continue iterating or stop when the task is complete.

This is how Claude, Codex, and other agentic AI systems work — they don't just respond once. They **loop** until the work is done.

---

## What Are Loops?

### The Core Concept

A loop is a cycle of:

```
┌─────────────────────────────────────────────────────────┐
│                    AGENT WORK LOOP                       │
│                                                         │
│   1. THINK    → Analyze the task and current state      │
│   2. PLAN     → Decide what action to take next         │
│   3. ACT      → Execute the action (code, command, etc.)│
│   4. OBSERVE  → Check the result of the action          │
│   5. EVALUATE → Is the task done? Error? Need more?     │
│       │                                                 │
│       ├─► NO  → Loop back to step 1                     │
│       └─► YES → STOP, return final result               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Why Loops Matter

Without loops, an agent is a chatbot — it responds once and waits. With loops, an agent becomes a **worker** — it can:

- Write code, run it, see if it fails, fix it, and try again
- Implement a feature across multiple files, checking each step
- Debug issues by reading errors, making changes, and testing
- Complete complex multi-step tasks autonomously
- Recover from failures without human intervention

---

## How Claude Implements Loops

Claude (Anthropic's AI) uses an agentic loop pattern when given coding tasks. Here's how it works:

### Claude's Loop Architecture

```
User Request
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│                   CLAUDE'S LOOP                         │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 1. Parse user request                           │   │
│  │ 2. Search codebase for context                  │   │
│  │ 3. Read relevant files                          │   │
│  │ 4. Plan the implementation                      │   │
│  │ 5. Execute changes (write/edit files)           │   │
│  │ 6. Validate (run tests, typecheck)              │   │
│  │ 7. If errors → fix and re-validate              │   │
│  │ 8. If complete → respond to user                │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  The loop continues until:                              │
│  • Task is complete                                     │
│  • Max iterations reached                               │
│  • User interrupts                                      │
│  • Unrecoverable error encountered                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Key Principles from Claude's Approach

1. **Context-First:** Always gather context before acting (read files, search codebase)
2. **Iterative Refinement:** Make changes, validate, fix, repeat
3. **Graceful Degradation:** If something fails, try alternatives
4. **User Transparency:** Show progress, ask for help when stuck
5. **Bounded Execution:** Never loop forever — have clear stopping conditions

---

## Ralph Pattern: Production-Proven Loop Implementation

**Source:** [github.com/snarktank/ralph](https://github.com/snarktank/ralph) — Based on Geoffrey Huntley's Ralph pattern

Ralph is a real-world, production-tested implementation of the agentic loop pattern. It runs AI coding tools (Amp or Claude Code) repeatedly until all PRD items are complete. Each iteration spawns a **fresh AI instance with clean context**.

### Ralph's Core Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      RALPH LOOP ENGINE                              │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │  ralph.sh (Bash Loop)                                     │     │
│  │  • Spawns fresh AI instance each iteration                │     │
│  │  • Pipes prompt.md into amp/claude CLI                    │     │
│  │  • Checks for <promise>COMPLETE</promise> signal           │     │
│  │  • Max iterations configurable (default: 10)              │     │
│  └───────────────────────────────────────────────────────────┘     │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │  Memory Layer (File-Based)                                 │     │
│  │  • prd.json — Task list with passes: true/false            │     │
│  │  • progress.txt — Append-only learnings log                │     │
│  │  • AGENTS.md — Directory-specific conventions              │     │
│  │  • git history — Full audit trail of all commits           │     │
│  └───────────────────────────────────────────────────────────┘     │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │  Quality Gates                                             │     │
│  │  • Typecheck must pass before commit                       │     │
│  │  • Tests must pass before commit                           │     │
│  │  • Browser verification for UI stories                     │     │
│  └───────────────────────────────────────────────────────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Ralph's Iteration Protocol

Each iteration follows a strict 10-step protocol:

```
┌─────────────────────────────────────────────────────────────────────┐
│              RALPH ITERATION PROTOCOL                               │
│                                                                     │
│  1. READ prd.json           → Get task list                         │
│  2. READ progress.txt       → Load learnings from past iterations   │
│  3. CHECK git branch        → Switch to correct feature branch      │
│  4. PICK highest priority   → Select story where passes: false      │
│  5. IMPLEMENT single story  → Write code for ONE story only         │
│  6. RUN quality checks      → typecheck, lint, test                 │
│  7. UPDATE AGENTS.md        → Document reusable patterns           │
│  8. COMMIT if checks pass   → feat: [Story ID] - [Story Title]      │
│  9. UPDATE prd.json         → Set passes: true for completed story  │
│ 10. APPEND to progress.txt  → Log learnings for future iterations   │
│                                                                     │
│  If ALL stories pass → <promise>COMPLETE</promise> (loop exits)     │
│  Otherwise → end normally, next iteration picks up next story       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Ralph's `prd.json` Schema

```json
{
  "project": "MyApp",
  "branchName": "ralph/task-priority",
  "description": "Task Priority System",
  "userStories": [
    {
      "id": "US-001",
      "title": "Add priority field to database",
      "description": "As a developer, I need to store task priority.",
      "acceptanceCriteria": [
        "Add priority column to tasks table: 'high' | 'medium' | 'low'",
        "Generate and run migration successfully",
        "Typecheck passes"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
```

### Key Ralph Patterns for Mothership

#### Pattern 1: Fresh Context Per Iteration

> **Canonical type:** See [`MOTHERSHIP-RALPH-GLOSSARY.md`](./MOTHERSHIP-RALPH-GLOSSARY.md) for `IterationRecord` (the record produced by each iteration).

**Ralph's approach:** Each iteration spawns a completely new AI instance. No context carries over except files on disk.

```bash
# Ralph's loop - fresh context each time
cat prompt.md | amp --dangerously-allow-all
# OR
claude --dangerously-skip-permissions --print < CLAUDE.md
```

**Why it works:**
- Prevents context pollution from failed attempts
- Keeps LLM focused on a single task
- Avoids context window overflow
- Each iteration starts clean with only file-based memory

**Mothership adaptation:**
```rust
// Spawn fresh terminal session per iteration
fn spawn_fresh_iteration(agent_id: &str, task: &str) -> TerminalSession {
    // 1. Kill previous session (if any)
    // 2. Spawn new PTY with clean environment
    // 3. Inject task prompt
    // 4. Monitor for completion signal
    // 5. Extract learnings before session ends
}
```

#### Pattern 2: File-Based Memory

> **Canonical types:** See [`MOTHERSHIP-RALPH-GLOSSARY.md`](./MOTHERSHIP-RALPH-GLOSSARY.md) for `Task`, `prd.json`, `progress.txt`, and `.last-branch` schemas.

**Ralph's memory architecture:**

| File | Purpose | Update Pattern |
|------|---------|----------------|
| `prd.json` | Task list with completion status | Update `passes: true` on completion |
| `progress.txt` | Append-only learnings log | Append after each iteration |
| `AGENTS.md` | Directory-specific conventions | Update when new patterns discovered |
| `git history` | Full audit trail | Commit after each successful iteration |

**Progress.txt structure:**
```markdown
## Codebase Patterns
- Use `sql<number>` template for aggregations
- Always use `IF NOT EXISTS` for migrations
- Export types from actions.ts for UI components

---

## 2026-06-16 14:30 - US-001
- Added priority column to tasks table
- Files changed: migrations/001.sql, schema.ts
- **Learnings for future iterations:**
  - This codebase uses Drizzle ORM for migrations
  - Don't forget to update the seed file when changing schema
---
```

**Why it works:**
- Simple, no database required
- Works offline
- Git-trackable (all memory in version control)
- Human-readable and editable
- Auto-propagates to future iterations via file reads

**Mothership adaptation:**
```typescript
// Hybrid memory: Files + SQLite + Zustand
interface LoopMemory {
  // File-based (like Ralph)
  taskList: string        // prd.json path
  progressLog: string     // progress.txt path
  conventions: string     // AGENTS.md path
  
  // SQLite (Mothership enhancement)
  iterationHistory: IterationRecord[]
  metrics: LoopMetrics
  
  // Zustand (real-time UI state)
  currentProgress: number
  currentAction: string
}
```

#### Pattern 3: Task Decomposition

**Ralph's rule:** Each PRD item must be small enough to complete in one context window.

**Right-sized stories:**
- Add a database column and migration
- Add a UI component to an existing page
- Update a server action with new logic
- Add a filter dropdown to a list

**Too big (must split):**
- "Build the entire dashboard"
- "Add authentication"
- "Refactor the API"

**Why it works:**
- Prevents LLM from running out of context
- Ensures each iteration produces working code
- Makes progress measurable and trackable
- Reduces risk of partial implementations

**Mothership adaptation:**
```typescript
// Task decomposition validation
function validateTaskSize(task: Task): ValidationResult {
  const maxAcceptanceCriteria = 5
  const maxFilesToModify = 3
  const estimatedTokens = estimateTokenCount(task.description)
  
  if (task.acceptanceCriteria.length > maxAcceptanceCriteria) {
    return {
      valid: false,
      reason: `Too many acceptance criteria (${task.acceptanceCriteria.length}/${maxAcceptanceCriteria}). Split into smaller stories.`
    }
  }
  
  if (estimatedTokens > 4000) {
    return {
      valid: false,
      reason: `Task description too long (~${estimatedTokens} tokens). Simplify or split.`
    }
  }
  
  return { valid: true }
}
```

#### Pattern 4: Quality Gates Before Commit

**Ralph's rule:** Never commit broken code. Typecheck and tests must pass.

```bash
# Ralph's quality gate (in prompt.md)
6. Run quality checks (e.g., typecheck, lint, test)
8. If checks pass, commit ALL changes
```

**Why it works:**
- Broken code compounds across iterations
- CI stays green throughout the process
- Each commit is a known-good state
- Easy to revert if needed

**Mothership adaptation:**
> **Canonical types:** See [`MOTHERSHIP-RALPH-GLOSSARY.md`](./MOTHERSHIP-RALPH-GLOSSARY.md) for `GateResult`, `QualityGateSummary`, and `QualityGateReport`.

```rust
// Quality gate enforcement (simplified — see quality_gate/mod.rs for full impl)
impl QualityGate {
    pub async fn validate(&self, project: &Project) -> QualityGateSummary {
        let mut results = Vec::new();
        
        // Run typecheck
        if let Some(typecheck_cmd) = &project.typecheck_command {
            results.push(self.run_command(typecheck_cmd).await?);
        }
        
        // Run tests
        if let Some(test_cmd) = &project.test_command {
            results.push(self.run_command(test_cmd).await?);
        }
        
        // Run linter
        if let Some(lint_cmd) = &project.lint_command {
            results.push(self.run_command(lint_cmd).await?);
        }
        
        let all_passed = results.iter().all(|r| r.success);
        
        QualityGateSummary {
            passed: all_passed,
            results,
        }
    }
}
```

#### Pattern 5: Completion Signal

**Ralph's approach:** Unambiguous string match for completion detection.

```bash
# Ralph checks for this exact string
if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo "Ralph completed all tasks!"
    exit 0
fi
```

**Why it works:**
- Simple, grep-friendly
- Unambiguous (no false positives)
- Works across different AI tools
- Easy to test and debug

**Mothership adaptation:**
> **Canonical type:** See [`MOTHERSHIP-RALPH-GLOSSARY.md`](./MOTHERSHIP-RALPH-GLOSSARY.md) for `LoopStatus` and `CompletionDetector`.

```rust
// Multi-signal completion detection (see loop_controller/completion_detector.rs)
impl CompletionDetector {
    pub fn detect(&self, state: &LoopState) -> bool {
        // Signal 1: Explicit completion tag
        if let Some(last) = state.iterations.last() {
            if last.result.contains("<promise>COMPLETE</promise>") {
                return true;
            }
        }
        
        // Signal 2: All tasks in prd.json have passes: true
        state.tasks.iter().all(|t| t.passes)
    }
}
```

#### Pattern 6: AGENTS.md Propagation

**Ralph's rule:** Update AGENTS.md files with reusable patterns discovered during implementation.

```markdown
# From Ralph's prompt.md
## Update AGENTS.md Files
Before committing, check if any edited files have learnings worth preserving:
1. Identify directories with edited files
2. Check for existing AGENTS.md
3. Add valuable learnings:
   - API patterns or conventions specific to that module
   - Gotchas or non-obvious requirements
   - Dependencies between files
   - Testing approaches for that area
```

**Why it works:**
- AI tools auto-read AGENTS.md files
- Future iterations benefit from discovered patterns
- Human developers also benefit
- Knowledge persists across sessions

**Mothership adaptation:**
```typescript
// Auto-propagate learnings to memory panel
function propagateLearnings(iteration: IterationRecord, project: Project) {
  // Extract reusable patterns
  const patterns = extractPatterns(iteration.observation)
  
  // Update project conventions in memory
  patterns.forEach(pattern => {
    memoryStore.addConvention({
      directory: iteration.filesModified[0],
      pattern: pattern.description,
      source: `Loop iteration ${iteration.iteration}`,
      timestamp: new Date()
    })
  })
  
  // Sync to AGENTS.md if configured
  if (project.syncToAgentsMd) {
    syncToAgentsMd(patterns, project.rootPath)
  }
}
```

### Ralph vs Mothership: Loop Architecture Comparison

| Aspect | Ralph | Mothership |
|--------|-------|------------|
| **Loop Engine** | Bash script | Rust state machine |
| **Context** | Fresh per iteration | Fresh per iteration + memory layer |
| **Memory** | Files only (prd.json, progress.txt) | Files + SQLite + Zustand |
| **Task Tracking** | prd.json with passes flag | Zustand store with real-time sync |
| **Quality Gates** | Typecheck + tests | Typecheck + tests + lint + custom |
| **Completion Detection** | String match | Multi-signal (string + rules + LLM) |
| **Error Recovery** | Skip failed iteration | Retry with backoff + fallback |
| **UI Progress** | None (CLI output only) | Real-time progress panel |
| **Human-in-Loop** | No | Optional (pause for approval) |
| **Parallel Agents** | No | Yes (War Room mode) |
| **Archiving** | Auto-archive on branch change | Session history with snapshots |

### Implementation Checklist (Ralph Patterns)

- [ ] Fresh context per iteration (spawn new terminal session)
- [ ] File-based memory (prd.json + progress.txt)
- [ ] Task decomposition validation (max 5 criteria, max 4K tokens)
- [ ] Quality gates before commit (typecheck + tests + lint)
- [ ] Completion signal detection (explicit + rules + LLM)
- [ ] AGENTS.md propagation (auto-update conventions)
- [ ] Auto-archive on feature branch change

---

## Loop Architecture in Mothership

### Component Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                     MOTHERSHIP LOOP ENGINE                         │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │                  Loop Controller (Rust)                   │     │
│  │  • Manages loop lifecycle (start, pause, resume, stop)   │     │
│  │  • Enforces iteration limits                             │     │
│  │  • Tracks loop state and history                         │     │
│  │  • Handles timeouts and interrupts                       │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │               Agent Runtime (Python Sidecar)              │     │
│  │  • Executes the actual loop logic                         │     │
│  │  • Integrates with CrewAI Flows or OpenHands SDK          │     │
│  │  • Manages tool calls and file operations                 │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │               Evaluation Engine                           │     │
│  │  • Determines if task is complete                         │     │
│  │  • Parses errors and decides recovery strategy            │     │
│  │  • Scores progress toward goal                            │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │               State Store (SQLite + Zustand)              │     │
│  │  • Persists loop state across sessions                    │     │
│  │  • Stores iteration history                               │     │
│  │  • Tracks success/failure metrics                         │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Data Model

> **Note:** These types are intentionally abstract to describe the conceptual architecture. For canonical type definitions used across all Ralph-loop documents, see [`MOTHERSHIP-RALPH-GLOSSARY.md`](./MOTHERSHIP-RALPH-GLOSSARY.md). For concrete store implementations, see [`UNIFIED-STORE.md`](./UNIFIED-STORE.md). For Rust implementations, see [`MOTHERSHIP-RALPH.md`](./MOTHERSHIP-RALPH.md).

```typescript
// Loop configuration and state (abstract reference)
interface LoopConfig {
  id: string
  agentId: string
  task: string                    // Original user request
  maxIterations: number           // Safety limit (default: 20)
  timeoutMs: number               // Max total time (default: 5 min)
  evaluationStrategy: 'auto' | 'llm' | 'rules' | 'human'
  stopConditions: StopCondition[]
  retryPolicy: RetryPolicy
}

interface StopCondition {
  type: 'task_complete' | 'error_limit' | 'no_progress' | 'max_iterations' | 'timeout'
  threshold?: number              // e.g., max consecutive errors
}

interface RetryPolicy {
  maxRetries: number              // Per-action retries
  backoffMs: number               // Delay between retries
  exponentialBackoff: boolean
  fallbackActions: string[]       // Alternative approaches to try
}

interface LoopState {
  id: string
  config: LoopConfig
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  currentIteration: number
  totalIterations: number
  startTime: Date
  endTime?: Date
  history: IterationRecord[]
  result?: string
  error?: string
}

interface IterationRecord {
  iteration: number
  action: Action
  observation: string
  evaluation: EvaluationResult
  durationMs: number
  timestamp: Date
  toolsUsed: string[]
  filesModified: string[]
}

interface EvaluationResult {
  isComplete: boolean
  progress: number                // 0.0 to 1.0
  shouldContinue: boolean
  reason: string
  nextAction?: Action             // Suggested next step
}
```

---

## Loop Execution Flow

### State Machine

```
                    ┌──────────────┐
                    │    IDLE      │
                    └──────┬───────┘
                           │ start()
                           ▼
                    ┌──────────────┐
             ┌──────│   RUNNING    │──────┐
             │      └──────┬───────┘      │
             │             │              │
        pause()        evaluate()     stop()
             │             │              │
             ▼             ▼              ▼
      ┌──────────┐  ┌──────────┐  ┌──────────┐
      │  PAUSED  │  │ ITERATE  │  │COMPLETED │
      └────┬─────┘  └────┬─────┘  └──────────┘
           │              │
      resume()      ┌─────┴─────┐
           │        │           │
           ▼        ▼           ▼
     ┌──────────┐  ┌──────┐  ┌──────────┐
     │ RUNNING  │  │ FAIL │  │CANCELLED │
     └──────────┘  └──────┘  └──────────┘
```

### Detailed Loop Steps

```rust
// Loop controller implementation
impl LoopController {
    pub async fn run(&mut self, config: LoopConfig) -> Result<LoopResult, LoopError> {
        let mut state = LoopState::new(config.clone());
        state.status = LoopStatus::Running;
        state.start_time = Utc::now();

        let mut iteration = 0;

        loop {
            // Check stopping conditions FIRST
            if self.should_stop(&state)? {
                break;
            }

            iteration += 1;
            state.current_iteration = iteration;

            // Step 1: THINK - Gather context
            let context = self.gather_context(&state).await?;

            // Step 2: PLAN - Decide next action
            let action = self.plan_action(&state, &context).await?;

            // Step 3: ACT - Execute the action
            let observation = self.execute_action(&action).await?;

            // Step 4: OBSERVE - Check result
            let evaluation = self.evaluate(&state, &observation).await?;

            // Step 5: EVALUATE - Should we continue?
            let record = IterationRecord {
                iteration,
                action,
                observation: observation.clone(),
                evaluation: evaluation.clone(),
                duration_ms: elapsed.as_millis() as u64,
                timestamp: Utc::now(),
                tools_used: observation.tools_used,
                files_modified: observation.files_modified,
            };

            state.history.push(record);

            // Check evaluation result
            if evaluation.is_complete {
                state.status = LoopStatus::Completed;
                state.result = Some(observation.output);
                break;
            }

            if !evaluation.should_continue {
                state.status = LoopStatus::Failed;
                state.error = Some(evaluation.reason);
                break;
            }

            // Update progress
            state.progress = evaluation.progress;

            // Check timeout
            if state.start_time.elapsed() > Duration::from_millis(config.timeout_ms) {
                state.status = LoopStatus::Failed;
                state.error = Some("Loop timed out".into());
                break;
            }

            // Check iteration limit
            if iteration >= config.max_iterations {
                state.status = LoopStatus::Failed;
                state.error = Some(format!(
                    "Max iterations ({}) reached",
                    config.max_iterations
                ));
                break;
            }

            // Notify frontend of progress
            self.emit_progress(&state)?;

            // Small delay to prevent CPU spinning
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        state.end_time = Some(Utc::now());
        self.save_state(&state)?;

        Ok(LoopResult {
            status: state.status,
            iterations: state.total_iterations,
            duration: state.end_time.unwrap() - state.start_time,
            result: state.result,
            history: state.history,
        })
    }
}
```

---

## Loop Types

### 1. Simple Loop (Single Agent)

The most basic loop — one agent works on a task until complete.

```
User: "Add error handling to the login function"

Agent Loop:
  Iteration 1: Read login.ts → see current code
  Iteration 2: Plan error handling strategy
  Iteration 3: Edit login.ts → add try/catch
  Iteration 4: Run typecheck → see errors
  Iteration 5: Fix type errors
  Iteration 6: Run tests → all pass
  Iteration 7: COMPLETE
```

### 2. Tool Loop (Agent + Tools)

Agent uses tools (terminal, file system, web) in each iteration.

```
User: "Set up a new React component with tests"

Agent Loop:
  Iteration 1: Search codebase for existing component patterns
  Iteration 2: Create Component.tsx with standard structure
  Iteration 3: Create Component.test.tsx with initial tests
  Iteration 4: Run tests → see failures
  Iteration 5: Fix component to pass tests
  Iteration 6: Run tests → all pass
  Iteration 7: Run typecheck → clean
  Iteration 8: COMPLETE
```

### 3. Recovery Loop (Error Handling)

Agent encounters errors and iterates to fix them.

```
User: "Implement the API endpoint"

Agent Loop:
  Iteration 1: Create endpoint file
  Iteration 2: Run server → database connection error
  Iteration 3: Check database config
  Iteration 4: Fix connection string
  Iteration 5: Run server → starts successfully
  Iteration 6: Test endpoint → returns 500
  Iteration 7: Check logs → missing validation
  Iteration 8: Add input validation
  Iteration 9: Test endpoint → 200 OK
  Iteration 10: COMPLETE
```

### 4. Multi-Agent Loop (CrewAI Integration)

Multiple agents collaborate in a loop, each handling different aspects.

```
User: "Implement user authentication with OAuth"

CrewAI Flow Loop:
  Iteration 1: Researcher → gather OAuth requirements
  Iteration 2: Researcher → output: requirements doc
  Iteration 3: Coder → receive requirements, plan implementation
  Iteration 4: Coder → implement OAuth routes
  Iteration 5: Reviewer → review code, suggest changes
  Iteration 6: Coder → apply review feedback
  Iteration 7: Reviewer → approve
  Iteration 8: Coder → add tests
  Iteration 9: Tester → run tests, all pass
  Iteration 10: COMPLETE
```

---

## Stopping Conditions

### Automatic Stopping

The loop should stop automatically when:

| Condition | Detection | Action |
|-----------|-----------|--------|
| **Task Complete** | LLM evaluation or rules | Return success |
| **Max Iterations** | Counter reaches limit | Return partial result with warning |
| **Timeout** | Elapsed time exceeds limit | Return partial result with warning |
| **Error Limit** | N consecutive failures | Return error with history |
| **No Progress** | Progress score stagnant | Return partial result |
| **User Interrupt** | Cancel signal received | Return partial result |

### Evaluation Strategies

```typescript
// Strategy 1: LLM-based evaluation (most flexible)
async function llmEvaluate(
  task: string,
  history: IterationRecord[]
): Promise<EvaluationResult> {
  const prompt = `
    Task: ${task}
    
    Progress so far:
    ${history.map((h, i) => `
    Iteration ${i + 1}: ${h.action.description}
    Result: ${h.observation.substring(0, 200)}
    `).join('\n')}
    
    Is the task complete? Rate progress 0-1. What should be done next?
  `
  
  const response = await queryLLM(prompt)
  return parseEvaluation(response)
}

// Strategy 2: Rules-based evaluation (faster, deterministic)
function rulesEvaluate(
  task: string,
  history: IterationRecord[]
): EvaluationResult {
  const lastIteration = history[history.length - 1]
  
  // Check if last action was validation that passed
  if (lastIteration.action.type === 'validate') {
    if (lastIteration.observation.includes('PASS')) {
      return { isComplete: true, progress: 1.0, shouldContinue: false }
    }
  }
  
  // Check for repeated failures
  const recentFailures = history.slice(-3).filter(
    h => h.observation.includes('ERROR')
  ).length
  
  if (recentFailures >= 3) {
    return {
      isComplete: false,
      progress: 0.3,
      shouldContinue: false,
      reason: 'Too many consecutive failures'
    }
  }
  
  return {
    isComplete: false,
    progress: Math.min(history.length / 10, 0.9),
    shouldContinue: true
  }
}

// Strategy 3: Human-in-the-loop (safest)
async function humanEvaluate(
  task: string,
  history: IterationRecord[]
): Promise<EvaluationResult> {
  // Ask user after each iteration
  const response = await promptUser(
    'Should the agent continue? Is the task done?',
    { options: ['Continue', 'Done', 'Stop'] }
  )
  
  return {
    isComplete: response === 'Done',
    progress: 0.5,
    shouldContinue: response === 'Continue'
  }
}
```

---

## Error Recovery in Loops

### Retry Strategy

```rust
impl RetryManager {
    pub async fn execute_with_retry<T>(
        &self,
        action: &Action,
        policy: &RetryPolicy,
    ) -> Result<T, RetryError> {
        let mut attempt = 0;
        let mut last_error = None;

        while attempt <= policy.max_retries {
            match self.try_execute(action).await {
                Ok(result) => return Ok(result),
                Err(error) => {
                    attempt += 1;
                    last_error = Some(error.clone());

                    if attempt <= policy.max_retries {
                        // Calculate delay
                        let delay = if policy.exponential_backoff {
                            policy.backoff_ms * 2u64.pow(attempt - 1)
                        } else {
                            policy.backoff_ms
                        };

                        // Log retry
                        tracing::warn!(
                            attempt,
                            delay_ms = delay,
                            error = %error,
                            "Retrying action"
                        );

                        // Wait before retry
                        tokio::time::sleep(Duration::from_millis(delay)).await;
                    }
                }
            }
        }

        // All retries exhausted, try fallback actions
        for fallback in &policy.fallback_actions {
            if let Ok(result) = self.try_fallback(fallback, action).await {
                return Ok(result);
            }
        }

        Err(RetryError::MaxRetriesExceeded {
            attempts: attempt,
            last_error: last_error.unwrap(),
        })
    }
}
```

### Common Error Patterns and Recovery

| Error Type | Detection | Recovery Strategy |
|------------|-----------|-------------------|
| **File Not Found** | ENOENT error | Search codebase for correct path |
| **Type Error** | TypeScript/compiler error | Read error message, fix types |
| **Test Failure** | Test suite output | Analyze failure, fix code or test |
| **Syntax Error** | Parser error | Check syntax, fix formatting |
| **Import Error** | Module not found | Add missing import, check path |
| **Network Error** | Connection timeout | Retry with backoff, check connectivity |
| **Permission Error** | Access denied | Check file permissions, use different approach |
| **Out of Memory** | OOM error | Reduce scope, process incrementally |

---

## UI/UX for Loops

### Progress Display

```tsx
const LoopProgress: React.FC<{ state: LoopState }> = ({ state }) => {
  const progressPercent = Math.round(state.progress * 100)
  
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {state.status === 'running' && (
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          )}
          {state.status === 'completed' && (
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          )}
          {state.status === 'failed' && (
            <XCircle className="w-4 h-4 text-red-400" />
          )}
          <span className="text-sm font-medium text-zinc-200">
            {state.config.agentId} - Iteration {state.currentIteration}
          </span>
        </div>
        <span className="text-xs text-zinc-500">
          {formatDuration(state.startTime)}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-zinc-800 rounded-full h-2 mb-3">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Current Action */}
      {state.history.length > 0 && (
        <div className="text-xs text-zinc-400 mb-3">
          <span className="text-zinc-500">Current:</span>{' '}
          {state.history[state.history.length - 1].action.description}
        </div>
      )}

      {/* History Timeline */}
      <div className="space-y-2 max-h-40 overflow-y-auto">
        {state.history.map((record, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full mt-1 ${
              record.evaluation.isComplete ? 'bg-green-400' : 'bg-zinc-600'
            }`} />
            <div className="flex-1">
              <span className="text-zinc-300">
                Iteration {record.iteration}:
              </span>{' '}
              <span className="text-zinc-500">
                {record.action.description}
              </span>
              {record.durationMs && (
                <span className="text-zinc-600 ml-2">
                  ({record.durationMs}ms)
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-2 mt-4">
        {state.status === 'running' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => invoke('pause_loop', { loopId: state.id })}
          >
            Pause
          </Button>
        )}
        {state.status === 'paused' && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => invoke('resume_loop', { loopId: state.id })}
          >
            Resume
          </Button>
        )}
        {(state.status === 'running' || state.status === 'paused') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => invoke('cancel_loop', { loopId: state.id })}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
```

### User Interactions

| User Action | System Response |
|-------------|-----------------|
| **Start Task** | Loop begins, shows progress panel |
| **Click Pause** | Loop pauses at next iteration boundary |
| **Click Resume** | Loop continues from paused state |
| **Click Cancel** | Loop stops, returns partial results |
| **Click "Show Details"** | Expand iteration history |
| **Click Iteration** | Show full action + observation |
| **Click "Retry"** (on failure) | Restart loop from last successful state |
| **Interrupt (Ctrl+C)** | Graceful cancellation with confirmation |

---

## Integration with Existing Components

### CrewAI Integration

```python
# sidecars/crewai-bridge/loop_runner.py
from crewai.flow.flow import Flow, listen, start
from typing import Generator

class AgenticLoop(Flow):
    """
    CrewAI Flow that implements the loop pattern.
    Each step is an iteration of the loop.
    """
    
    @start()
    def initialize(self):
        """Set up loop context and configuration."""
        return {
            'task': self.inputs['task'],
            'iteration': 0,
            'max_iterations': self.inputs.get('max_iterations', 20),
            'history': []
        }
    
    @listen(initialize)
    def think(self, context):
        """Gather context and plan next action."""
        # Analyze task, read files, search codebase
        plan = self.agent.think(
            task=context['task'],
            history=context['history']
        )
        return {'plan': plan, **context}
    
    @listen(think)
    def act(self, context):
        """Execute the planned action."""
        result = self.agent.execute(context['plan'])
        return {'result': result, **context}
    
    @listen(act)
    def evaluate(self, context):
        """Check if task is complete."""
        evaluation = self.agent.evaluate(
            task=context['task'],
            result=context['result'],
            history=context['history']
        )
        
        if evaluation['is_complete']:
            return {'status': 'completed', 'result': context['result']}
        
        if context['iteration'] >= context['max_iterations']:
            return {'status': 'max_iterations', 'result': context['result']}
        
        # Continue loop - increment iteration
        return {
            'status': 'continue',
            'iteration': context['iteration'] + 1,
            'history': context['history'] + [context['result']]
        }
    
    @listen(evaluate)
    def decide(self, evaluation):
        """Route based on evaluation result."""
        if evaluation['status'] == 'completed':
            return self.complete(evaluation['result'])
        elif evaluation['status'] == 'continue':
            return self.think(evaluation)  # Loop back
        else:
            return self.handle_limit(evaluation)
```

### OpenHands SDK Integration

```python
# sidecars/openhands-bridge/agent_loop.py
from openhands import Agent, AgentState

class OpenHandsLoop:
    """
    OpenHands-based agent that runs in a loop.
    """
    
    def __init__(self, agent: Agent, config: LoopConfig):
        self.agent = agent
        self.config = config
        self.state = AgentState()
    
    async def run(self, task: str) -> LoopResult:
        """Main loop execution."""
        iteration = 0
        
        while iteration < self.config.max_iterations:
            # Check stopping conditions
            if self.should_stop():
                break
            
            iteration += 1
            
            # Agent thinks and acts
            action = await self.agent.think_and_act(
                task=task,
                state=self.state,
                history=self.history
            )
            
            # Execute action
            observation = await self.agent.execute(action)
            
            # Update state
            self.state.update(action, observation)
            
            # Check if complete
            if self.is_complete(observation):
                return LoopResult(
                    status='completed',
                    iterations=iteration,
                    result=observation.output
                )
            
            # Handle errors
            if observation.is_error:
                recovery = await self.agent.recover(observation.error)
                if not recovery.success:
                    return LoopResult(
                        status='failed',
                        iterations=iteration,
                        error=observation.error
                    )
        
        return LoopResult(
            status='max_iterations',
            iterations=iteration,
            result=self.state.get_best_output()
        )
```

### Terminal Loop Execution

For CLI agents (Claude, Codex, etc.) running in terminal sessions:

```rust
// Terminal-based loop execution
impl TerminalLoop {
    pub async fn run_in_terminal(
        &self,
        agent_id: &str,
        task: &str,
    ) -> Result<LoopResult, LoopError> {
        let terminal = self.terminal_manager.get_session(agent_id)?;
        
        // Write task to terminal
        terminal.write_input(&format!("{}\n", task))?;
        
        let mut iteration = 0;
        let mut output_buffer = String::new();
        
        loop {
            // Read terminal output
            let output = terminal.read_output(Duration::from_secs(5))?;
            output_buffer.push_str(&output);
            
            // Check for completion signals
            if self.detect_completion(&output_buffer) {
                return Ok(LoopResult {
                    status: LoopStatus::Completed,
                    iterations: iteration,
                    result: output_buffer,
                });
            }
            
            // Check for error signals
            if self.detect_error(&output_buffer) {
                // Try to recover by sending retry command
                terminal.write_input("retry\n")?;
                iteration += 1;
                continue;
            }
            
            // Check for user input needed
            if self.detect_user_input_needed(&output) {
                // Pause loop, wait for user
                self.notify_user_input_needed(agent_id, &output)?;
                // User provides input via terminal
            }
            
            iteration += 1;
            
            // Safety checks
            if iteration >= self.config.max_iterations {
                return Err(LoopError::MaxIterations);
            }
            
            if output_buffer.len() > 1_000_000 {
                // Buffer too large, truncate
                output_buffer = output_buffer.chars().rev().take(500_000).collect::<String>().chars().rev().collect();
            }
        }
    }
    
    fn detect_completion(&self, output: &str) -> bool {
        // Look for common completion signals
        let signals = [
            "Done!",
            "Complete!",
            "All tests pass",
            "Build successful",
            "✓",  // Checkmark
            "✅", // Emoji checkmark
        ];
        
        signals.iter().any(|s| output.contains(s))
    }
    
    fn detect_error(&self, output: &str) -> bool {
        // Look for error patterns
        let error_patterns = [
            "error:",
            "Error:",
            "FAILED",
            "❌",  // Emoji X
            "panic:",
            "Exception:",
        ];
        
        error_patterns.iter().any(|p| output.contains(p))
    }
}
```

---

## Loop Configuration

### Default Settings

```typescript
const DEFAULT_LOOP_CONFIG: LoopConfig = {
  maxIterations: 20,
  timeoutMs: 5 * 60 * 1000,  // 5 minutes
  evaluationStrategy: 'llm',
  stopConditions: [
    { type: 'task_complete' },
    { type: 'max_iterations', threshold: 20 },
    { type: 'timeout', threshold: 300000 },
    { type: 'error_limit', threshold: 5 },
    { type: 'no_progress', threshold: 3 },
  ],
  retryPolicy: {
    maxRetries: 3,
    backoffMs: 1000,
    exponentialBackoff: true,
    fallbackActions: [
      'search_alternative_approach',
      'ask_user_for_help',
      'simplify_task_scope',
    ],
  },
}
```

### Per-Agent Configuration

```typescript
const AGENT_LOOP_CONFIGS: Record<string, Partial<LoopConfig>> = {
  claude: {
    maxIterations: 30,      // Claude can handle more iterations
    timeoutMs: 10 * 60 * 1000,
    evaluationStrategy: 'llm',
  },
  codex: {
    maxIterations: 25,
    timeoutMs: 7 * 60 * 1000,
    evaluationStrategy: 'rules',
  },
  gemini: {
    maxIterations: 20,
    timeoutMs: 5 * 60 * 1000,
    evaluationStrategy: 'llm',
  },
  opencode: {
    maxIterations: 25,
    timeoutMs: 7 * 60 * 1000,
    evaluationStrategy: 'rules',
  },
}
```

---

## Metrics and Observability

### Loop Metrics

```typescript
interface LoopMetrics {
  loopId: string
  agentId: string
  totalIterations: number
  totalTimeMs: number
  successRate: number           // 0.0 to 1.0
  avgIterationTimeMs: number
  toolsUsed: Record<string, number>
  filesModified: string[]
  errorsEncountered: number
  recoveriesAttempted: number
  recoveriesSuccessful: number
  completionReason: 'task_complete' | 'max_iterations' | 'timeout' | 'error_limit' | 'user_cancel'
}
```

### Logging

```rust
// Loop execution logging
impl LoopController {
    fn log_iteration(&self, record: &IterationRecord) {
        tracing::info!(
            loop_id = %self.config.id,
            iteration = record.iteration,
            action_type = %record.action.r#type,
            duration_ms = record.duration_ms,
            progress = record.evaluation.progress,
            "Loop iteration completed"
        );
        
        if record.evaluation.is_complete {
            tracing::info!(
                loop_id = %self.config.id,
                total_iterations = record.iteration,
                "Loop completed successfully"
            );
        }
    }
    
    fn log_error(&self, error: &LoopError, iteration: usize) {
        tracing::error!(
            loop_id = %self.config.id,
            iteration,
            error = %error,
            "Loop iteration failed"
        );
    }
}
```

---

## Safety Mechanisms

### 1. Iteration Limits
- Default: 20 iterations per loop
- Configurable per agent
- Hard cap: 100 iterations (cannot override)

### 2. Timeouts
- Default: 5 minutes
- Configurable per agent
- Hard cap: 30 minutes (cannot override)

### 3. Error Limits
- Default: 5 consecutive errors → stop
- Configurable per loop
- Auto-recovery attempts before stopping

### 4. Progress Detection
- If progress score doesn't increase for 3 iterations → stop
- Prevents infinite loops doing the same thing
- Suggests alternative approaches

### 5. User Interrupt
- Ctrl+C or Cancel button → graceful shutdown
- Returns partial results
- Saves state for potential resume

### 6. Resource Limits
- Memory usage monitored
- CPU usage monitored
- Automatic pause if resources exceeded

---

## Implementation Checklist

- [ ] Loop controller (Rust)
  - [ ] State machine implementation
  - [ ] Iteration limit enforcement
  - [ ] Timeout handling
  - [ ] Progress tracking
  - [ ] State persistence

- [ ] Evaluation engine
  - [ ] LLM-based evaluation
  - [ ] Rules-based evaluation
  - [ ] Human-in-the-loop evaluation
  - [ ] Progress scoring

- [ ] Retry manager
  - [ ] Exponential backoff
  - [ ] Fallback actions
  - [ ] Error classification

- [ ] UI components
  - [ ] Loop progress panel
  - [ ] Iteration history timeline
  - [ ] Pause/Resume/Cancel controls
  - [ ] Error display and retry button

- [ ] Integration
  - [ ] CrewAI Flow integration
  - [ ] OpenHands SDK integration
  - [ ] Terminal loop execution
  - [ ] Zustand store for loop state

- [ ] Metrics and logging
  - [ ] Loop execution metrics
  - [ ] Iteration logging
  - [ ] Error logging
  - [ ] Performance tracking

---

## Example: Complete Loop in Action

### Task: "Add unit tests for the UserService class"

```
┌─────────────────────────────────────────────────────────────────────┐
│ ITERATION 1: THINK                                                  │
│ Action: Search codebase for UserService                             │
│ Result: Found src/services/user.service.ts                          │
│ Progress: 0.1                                                       │
├─────────────────────────────────────────────────────────────────────┤
│ ITERATION 2: THINK                                                  │
│ Action: Read user.service.ts                                        │
│ Result: UserService has 5 methods: create, read, update, delete,    │
│         findByEmail                                                 │
│ Progress: 0.2                                                       │
├─────────────────────────────────────────────────────────────────────┤
│ ITERATION 3: PLAN                                                   │
│ Action: Plan test structure                                         │
│ Result: Need 5 test cases, one per method                           │
│ Progress: 0.25                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ ITERATION 4: ACT                                                    │
│ Action: Create user.service.test.ts with create() tests             │
│ Result: File created with 2 test cases                              │
│ Progress: 0.35                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ ITERATION 5: ACT                                                    │
│ Action: Add tests for read(), update(), delete()                    │
│ Result: Added 6 more test cases                                     │
│ Progress: 0.6                                                       │
├─────────────────────────────────────────────────────────────────────┤
│ ITERATION 6: ACT                                                    │
│ Action: Add tests for findByEmail()                                 │
│ Result: Added 2 more test cases                                     │
│ Progress: 0.75                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ ITERATION 7: OBSERVE                                                │
│ Action: Run tests                                                   │
│ Result: 8 passed, 2 failed                                          │
│ Progress: 0.75                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ ITERATION 8: THINK                                                  │
│ Action: Analyze test failures                                       │
│ Result: Mock not set up correctly for findByEmail                   │
│ Progress: 0.75                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ ITERATION 9: ACT                                                    │
│ Action: Fix mock setup in findByEmail tests                         │
│ Result: Updated mock implementation                                 │
│ Progress: 0.8                                                       │
├─────────────────────────────────────────────────────────────────────┤
│ ITERATION 10: OBSERVE                                               │
│ Action: Run tests again                                             │
│ Result: All 10 tests pass                                           │
│ Progress: 0.9                                                       │
├─────────────────────────────────────────────────────────────────────┤
│ ITERATION 11: EVALUATE                                              │
│ Action: Verify coverage                                             │
│ Result: 100% method coverage achieved                               │
│ Progress: 1.0                                                       │
│ ✅ TASK COMPLETE                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Comparison: Without Loops vs With Loops

| Aspect | Without Loops | With Loops |
|--------|---------------|------------|
| **Execution** | Single response | Iterative refinement |
| **Error Handling** | User must fix | Auto-recovery |
| **Complexity** | Simple tasks only | Complex multi-step tasks |
| **Autonomy** | Low | High |
| **User Effort** | High | Low |
| **Completion Rate** | ~60% | ~90% |
| **Quality** | Variable | Consistently high |

---

## See Also

| Document | Scope | Key Content |
|----------|-------|-------------|
| [`UNIFIED-STORE.md`](./UNIFIED-STORE.md) | **Canonical store definitions** | Concrete TypeScript interfaces for `Task`, `IterationRecord`, `LoopConfig`, `LoopMetrics`; Zustand store implementations (`useLoopStore`, `useQualityGateStore`, `useArchiveStore`, `useCoordinatorStore`); subscriptions and cross-store coordination |
| [`MOTHERSHIP-RALPH.md`](./MOTHERSHIP-RALPH.md) | **Ralph implementation** | Rust `LoopController`, `CompletionDetector`, `QualityGate`; `prd.json` schema; terminal integration; Tauri commands |
| [`QUALITY-GATE.md`](./QUALITY-GATE.md) | **Quality gate system** | `QualityGateConfig`, `GateCommand`, `GateResult`, `QualityGateReport`; error parsing for TypeScript/Rust/Python; `CommitGuard`; auto-detection |
| [`AUTO-ARCHIVE.md`](./AUTO-ARCHIVE.md) | **Session archival** | `BranchDetector`, `ArchiveManager`, `ArchiveManifest`; archive triggers, directory structure, restore system |
| [`MOTHERSHIP-RALPH-ROADMAP.md`](./MOTHERSHIP-RALPH-ROADMAP.md) | **Implementation roadmap** | 4-phase development plan tying all documents together; dependencies, gates, estimated hours |

> **Type reconciliation note:** The abstract `IterationRecord` in this document uses `action: Action` and `observation: string`. The concrete implementation in `UNIFIED-STORE.md` uses `action: string`, `result: string`, `taskId`, `success`, `learnings`, and `gateReportId`. Similarly, `LoopConfig` here is abstract; `UNIFIED-STORE.md` provides the concrete version with `qualityGateCommands`, `autoCommit`, `syncToAgentsMd`, and `autoArchive`.

---

## References

- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code) — Agentic coding patterns
- [CrewAI Flows](https://docs.crewai.com/concepts/flows) — Event-driven orchestration
- [OpenHands SDK](https://github.com/OpenHands/OpenHands) — Agent runtime with loop support
- [LangGraph](https://langchain-ai.github.io/langgraph/) — State machine for agent loops
- [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) — Loop-based autonomous agent

---

*Last updated: 2026-06-16*
