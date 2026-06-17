# Mothership — Phase 2: Enhanced Context & Intelligence

**Estimated Time:** 30-40 hours
**Dependencies:** Phase 1 complete
**Gate G2:** Handoff auto-generates context summary; memory search works

---

## Overview

Phase 2 adds intelligence to the memory layer. Handoffs become automatic with LLM-generated summaries, context becomes searchable across sessions, and file attachments bridge the gap between agents and project files.

---

## Open-Source Tools Used

| Tool | Usage | Link |
|---|---|---|
| **Ollama** | Local LLM for summarization (via Jan's integration) | https://ollama.ai |
| **llama.cpp** | Local inference backend (via Jan) | https://github.com/ggerganov/llama.cpp |
| **Zengram** | Reference for cross-agent briefing + hybrid search | https://github.com/ZenSystemAI/Zengram |
| **nmem** | Reference for consolidation + social learning | https://github.com/dayyanj/nmem |
| **Lore** | Reference for auto-capture + prompt injection | https://github.com/agentkitai/lore |
| **ContextGraph** | Reference for context pack compilation | https://github.com/AllenMaxi/ContextGraph |

---

## Sub-Phase 2.1: Context Capture Engine

**Time:** 6-8 hours
**Gate:** Context snapshots capture branch, prompt, output, open files automatically

### What We're Building

An automated capture system that runs in the background, recording what each agent is doing. Unlike Phase 1's basic timer-based capture, this uses event-driven triggers:

- Terminal output exceeds threshold → capture
- User switches agent → capture
- User runs git command → capture branch
- File saved → capture path
- Periodic heartbeat (60s) → capture state

### Implementation

1. **Event-driven capture triggers**
   ```typescript
   // hooks/useContextCapture.ts (enhanced)
   const triggers = {
     terminalOutput: (data: string) => {
       if (data.includes('git') || data.includes('commit') || data.includes('branch')) {
         captureContext('git_activity')
       }
       if (outputSinceLastCapture > 1000) {
         captureContext('output_threshold')
       }
     },
     agentSwitch: (agentId: string) => {
       captureContext('agent_switch')
     },
     fileSave: (path: string) => {
       captureContext('file_saved', { filePath: path })
     },
     heartbeat: () => {
       if (timeSinceLastCapture > 60000) {
         captureContext('heartbeat')
       }
     }
   }
   ```

2. **Context data model**
   ```typescript
   interface ContextSnapshot {
     timestamp: string
     trigger: 'git_activity' | 'output_threshold' | 'agent_switch' | 'file_saved' | 'heartbeat'
     agentId: string
     projectId: string
     prompt: string                // Last prompt sent to agent
     outputTail: string            // Last 50 lines of terminal output
     branch: string                // Current git branch
     openFiles: string[]           // Files touched in last 5 min
     decisions: string[]           // Key decisions extracted from output
     todos: TodoItem[]             // Pending TODOs mentioned
     memorySize: number            // Bytes of context stored
   }
   ```

3. **Storage optimization**
   - Compress old snapshots (keep last 20 full, older ones summarized)
   - Deduplicate sequential snapshots with identical git state
   - Merge rapid snapshots (within 5s) into one

### OS Tool Reference

| Tool | Pattern We Adopt |
|---|---|
| **Lore** | Session accumulator captures context automatically via hooks |
| **ContextGraph** | Delta compaction — only store changes between snapshots |
| **nmem** | Journal tier → LTM promotion based on importance scoring |

---

## Sub-Phase 2.2: LLM Summarization Engine

**Time:** 8-10 hours
**Gate:** Handoffs include a 3-5 line AI-generated summary of what happened

### What We're Building

A Python sidecar that takes context snapshots and generates concise summaries using a local LLM (via Jan's built-in Ollama). Two modes:

1. **On-demand** — user clicks "Summarize" on any memory entry
2. **Auto on handoff** — handoff triggers summary generation

### Implementation

1. **Summary Engine sidecar**
   ```python
   # sidecars/summary-engine/main.py
   from fastapi import FastAPI
   from pydantic import BaseModel
   import ollama
   
   app = FastAPI()
   
   class SummaryRequest(BaseModel):
       context_snapshots: list[dict]
       handoff_target: str
       style: str = "brief"  # brief | detailed | bullet
   
   class SummaryResponse(BaseModel):
       summary: str
       key_decisions: list[str]
       open_todos: list[str]
       recommended_context: list[str]
   
   SUMMARY_PROMPT = """
   You are a context handoff assistant. Given the following agent session snapshots,
   generate a concise summary for the next agent ({target_agent}).
   
   Format:
   - 2-3 sentence overview of what was done
   - Key decisions made (bullet points)
   - Open TODOs (bullet points)
   - Files/modules touched
   - Current state of work
   """
   
   @app.post("/summarize", response_model=SummaryResponse)
   async def summarize(req: SummaryRequest):
       snapshots_text = format_snapshots(req.context_snapshots)
       prompt = SUMMARY_PROMPT.format(target_agent=req.handoff_target)
       
       response = ollama.generate(
           model='llama3.2:3b',  # Lightweight local model
           prompt=f"{prompt}\n\nSession data:\n{snapshots_text}",
       )
       
       return parse_summary(response['response'])
   ```

2. **Model selection logic**
   - Default: `llama3.2:3b` (fast, ~1s per summary)
   - If available: `llama3.1:8b` (better quality, ~3s)
   - Fallback: template-based summary (no LLM needed)

3. **Integration with handoff flow**
   ```typescript
   // lib/handoff/summarizedHandoff.ts
   async function summarizedHandoff(from: Agent, to: Agent) {
     // 1. Gather recent snapshots
     const snapshots = await invoke('get_recent_snapshots', {
       agentId: from.id,
       count: 10,
     })
     
     // 2. Request summary from sidecar
     const summary = await fetch('http://localhost:4893/summarize', {
       method: 'POST',
       body: JSON.stringify({
         context_snapshots: snapshots,
         handoff_target: to.name,
       })
     }).then(r => r.json())
     
     // 3. Record handoff with summary
     await invoke('record_handoff', {
       from: from.id,
       to: to.id,
       summary: summary.summary,
       contextBefore: snapshots,
     })
     
     // 4. Display in target workspace
     return summary
   }
   ```

4. **Template fallback** (no LLM available)
   ```typescript
   function templateSummary(snapshots: ContextSnapshot[]): string {
     const files = new Set(snapshots.flatMap(s => s.openFiles))
     const branches = new Set(snapshots.map(s => s.branch).filter(Boolean))
     const todos = snapshots.flatMap(s => s.todos).filter(t => !t.done)
     const decisions = snapshots.flatMap(s => s.decisions)
     
     return [
       `**Session Summary**`,
       `Branches: ${[...branches].join(', ') || 'none'}`,
       `Files touched: ${[...files].join(', ') || 'none'}`,
       `Decisions: ${decisions.slice(0, 5).map(d => `- ${d}`).join('\n') || 'none recorded'}`,
       `Open TODOs: ${todos.slice(0, 5).map(t => `- ${t.text}`).join('\n') || 'none'}`,
     ].join('\n')
   }
   ```

### OS Tool Reference

| Tool | Pattern We Adopt |
|---|---|
| **Jan** | Built-in Ollama integration; model download UI |
| **Ollama** | Local LLM inference for summaries (no API key needed) |

---

## Sub-Phase 2.3: Context Search & Retrieval

**Time:** 6-8 hours
**Gate:** Users can search across all memory entries by keyword

### What We're Building

A search interface that queries all memory entries across projects. Phase 2 uses simple keyword search (SQLite FTS5). Phase 3 can upgrade to vector search.

### Implementation

1. **SQLite FTS5 for full-text search**
   ```sql
   -- Enable FTS5 on memory entries
   CREATE VIRTUAL TABLE memory_fts USING fts5(
     content, summary, tags,
     content='memory_entries',
     content_rowid='rowid'
   );
   
   -- Triggers to keep FTS in sync
   CREATE TRIGGER memory_ai AFTER INSERT ON memory_entries BEGIN
     INSERT INTO memory_fts(rowid, content, summary, tags)
     VALUES (new.rowid, new.content, new.summary, new.tags);
   END;
   ```

2. **Search command**
   ```rust
   #[tauri::command]
   fn search_memory(query: String, project_id: Option<String>) -> Result<Vec<SearchResult>, String> {
       let sql = match project_id {
           Some(pid) => format!(
               "SELECT m.*, rank FROM memory_fts f
                JOIN memory_entries m ON m.rowid = f.rowid
                WHERE memory_fts MATCH ? AND m.project_id = ?
                ORDER BY rank LIMIT 20"
           ),
           None => format!(
               "SELECT m.*, rank FROM memory_fts f
                JOIN memory_entries m ON m.rowid = f.rowid
                WHERE memory_fts MATCH ?
                ORDER BY rank LIMIT 20"
           ),
       };
       // Execute and return results
   }
   ```

3. **Search UI in MemoryPanel**
   ```tsx
   const SearchBar = () => {
     const [query, setQuery] = useState('')
     const [results, setResults] = useState<SearchResult[]>([])
     const debouncedQuery = useDebounce(query, 300)
     
     useEffect(() => {
       if (debouncedQuery) {
         invoke('search_memory', { query: debouncedQuery })
           .then(setResults)
       }
     }, [debouncedQuery])
     
     return (
       <div>
         <Input
           placeholder="Search all memory..."
           value={query}
           onChange={e => setQuery(e.target.value)}
         />
         <SearchResults results={results} />
       </div>
     )
   }
   ```

4. **Result display**
   - Preview with highlighted matches
   - Show project + agent + date
   - Click to open full entry
   - Filter by agent/project/type/date

### OS Tool Reference

| Tool | Pattern We Adopt |
|---|---|
| **Zengram** | Hybrid search (we start with FTS, add vector later) |
| **ContextGraph** | Context pack compilation — search returns ranked context packs |
| **ourmem** | 11-stage hybrid search architecture (reference for future upgrade) |

---

## Sub-Phase 2.4: File Attachments & Context

**Time:** 4-6 hours
**Gate:** Users can drag-drop files into a session; paths stored in memory

### Implementation

1. **Drag-drop file attachment**
   ```tsx
   // In WorkspaceView
   const handleDrop = async (files: FileList) => {
     for (const file of files) {
       // Copy to project workspace or reference in-place
       const path = await invoke('attach_file', {
         sessionId: activeSession,
         filePath: file.path,
       })
       // Write to memory
       await invoke('write_note', {
         projectId: activeProject,
         content: `📎 Attached file: \`${file.path}\``,
         tags: 'file-attachment',
       })
       // Set terminal CWD to file's directory
       await invoke('set_terminal_cwd', {
         sessionId: activeSession,
         cwd: path.directory,
       })
     }
   }
   ```

2. **Rust file attachment handler**
   ```rust
   #[tauri::command]
   fn attach_file(session_id: String, file_path: String) -> Result<AttachedFile, String> {
       let path = Path::new(&file_path);
       if !path.exists() {
           return Err("File not found".into());
       }
       Ok(AttachedFile {
           path: file_path,
           directory: path.parent().unwrap().to_string_lossy().to_string(),
           filename: path.file_name().unwrap().to_string_lossy().to_string(),
           size: std::fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0),
       })
   }
   ```

3. **Context explorer**
   - Right panel shows attached files for current session
   - Click to open in system editor
   - Shows last modified time + git status

### OS Tool Reference

| Tool | Pattern We Adopt |
|---|---|
| **OpenHands SDK** | File operations in sandboxed environment |
| **Jan** | File system access patterns via Tauri |

---

## Sub-Phase 2.5: Memory Consolidation & Cold Storage

**Time:** 4-6 hours
**Gate:** Old sessions archived; memory usage bounded

### Implementation

1. **Cold storage mechanism**
   - Sessions inactive > 24h → archived to compressed JSON
   - Summary retained in SQLite, full data moved to cold file
   - Cold storage path: `~/.mothership/cold/{project_id}/{session_id}.json.gz`

2. **Memory pruning**
   - Snapshots > 7 days → summarized (keep only summary, drop raw data)
   - Duplicate snapshots within 5 min → merged
   - Total memory per project capped at 50MB

3. **Cold storage restoration**
   - "Restore from archive" button in project settings
   - Decompress JSON → re-import to SQLite

### OS Tool Reference

| Tool | Pattern We Adopt |
|---|---|
| **nmem** | Importance scoring → LTM promotion; Weibull decay |
| **ourmem** | Memory lifecycle management with decay model |
| **ContextGraph** | Delta compaction for storage-efficient snapshots |

---

## Phase 2 Deliverable Checklist

- [ ] Event-driven context capture (git, output, switch, file, heartbeat)
- [ ] Summary Engine sidecar with Ollama integration
- [ ] Auto-summarization on handoff
- [ ] Template-based fallback when no LLM available
- [ ] SQLite FTS5 full-text search across all memory
- [ ] Search results with highlighted matches
- [ ] Filter search by agent/project/type/date
- [ ] Drag-drop file attachments
- [ ] File paths stored in memory + terminal CWD updated
- [ ] Context explorer shows attached files
- [ ] Cold storage for sessions > 24h idle
- [ ] Memory pruning (snapshot dedup, age-out)
- [ ] Cold storage restoration

---

## Phase 2 Completion Criteria

> **Gate G2:** The user opens Mothership, sees context being captured automatically, searches across all project memory, drags a file into a session, and initiates a handoff that produces a useful AI-generated summary without any manual typing.

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Ollama not installed / model not downloaded | Medium | Jan handles this; prompt user to download on first summary request |
| Summarization too slow for handoff | Medium | Use 3B model; show "summarizing..." progress; fallback to template |
| FTS5 search returns irrelevant results | Low | Acceptable for MVP; upgrade to vector search in Phase 3 |
| Memory storage grows unbounded | Low | Cold storage + pruning keeps it under 100MB per project |
