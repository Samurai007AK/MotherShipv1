# Mothership — Project Graph

> **Update this file whenever you add, remove, or restructure a significant file, component, store, test, or phase.**
>
> To update, re-run the `src/` subtree read and adjust the Mermaid diagrams below.
> The test coverage map should reflect the latest test count from `npx vitest run --no-coverage`.

---

## 1. Architecture Layers

```mermaid
graph TB
    subgraph UI["🖥️ UI Layer (React + TypeScript)"]
        App["App.tsx"]
        Components["~20 Components"]
        Hooks["2 Hooks"]
    end

    subgraph State["📦 State Layer (Zustand)"]
        Stores["14 Stores"]
    end

    subgraph Lib["🔧 Utility Layer"]
        Libs["lib/ — 4 modules"]
        Types["types/ — 3 files"]
    end

    subgraph Tauri["⚙️ Tauri Bridge (IPC)"]
        Invoke["invoke()"]
        Listen["listen()"]
    end

    subgraph Rust["🦀 Rust Backend (src-tauri)"]
        Commands["Commands: archive, crewai, file, loop, model, quality_gate, sidecar, summary"]
        Memory["Memory: store, models"]
        Terminal["Terminal: PTY process"]
        QualityGate["Quality Gate: commit_guard"]
        LoopController["Loop Controller: completion_detector"]
        Archive["Archive: branch_detector"]
    end

    subgraph Sidecars["🚗 Sidecar Processes (Python)"]
        CrewAI["crewai-bridge"]
        OpenHands["openhands-bridge"]
        HelloBridge["hello-bridge"]
        SummaryEngine["summary-engine"]
    end

    UI -->|"invoke()"| Tauri
    UI -->|"listen()"| Tauri
    State --> UI
    Lib --> UI
    Tauri --> Rust
    Rust -->|"spawns"| Sidecars
    Rust -->|"executes"| Commands
```

---

## 2. React Component Tree

```mermaid
graph TB
    App["App.tsx</br><i>Root layout + routing</i>"]
    Layout["ResizableLayout</br><i>3-panel container</i>"]
    ThemeToggle["ThemeToggle</br><i>Light/Dark/System</i>"]
    ErrorB["ErrorBoundary</br><i>React error boundary</i>"]
    LazyP["LazyPanels</br><i>Idle timeout unloading</i>"]
    CmdPalette["CommandPalette</br><i>⌘K fuzzy search</i>"]
    Onboard["OnboardingWizard</br><i>3-step setup</i>"]

    subgraph Agents["🤖 Agent Panel"]
        AgentSidebar["AgentSidebar</br><i>Agent list + status</i>"]
        AddAgent["AddAgentDialog</br><i>Register new agent</i>"]
    end

    subgraph Terminal["💻 Terminal Panel"]
        TerminalPane["TerminalPane</br><i>xterm.js PTY</i>"]
        SplitPane["SplitPane</br><i>Split terminal views</i>"]
        ConversationHistory["ConversationHistory</br><i>Exchange log</i>"]
    end

    subgraph Memory["🧠 Memory Panel"]
        MemoryPanel["MemoryPanel</br><i>Tab container</i>"]
        NoteEditor["NoteEditor</br><i>Rich text notes</i>"]
        Timeline["Timeline</br><i>Chronological view</i>"]
        Handoff["HandoffDialog</br><i>Context handoff</i>"]
    end

    subgraph Workspace["📁 Workspace Panel"]
        WorkspaceView["WorkspaceView</br><i>File explorer</i>"]
        WorktreeManager["WorktreeManager</br><i>Git worktrees</i>"]
    end

    subgraph Advanced["⚡ Advanced Panels"]
        Browser["BrowserConnector</br><i>In-app browser</i>"]
        ModelRouter["ModelRouterPanel</br><i>Ollama model mgmt</i>"]
        TaskGraph["TaskGraph</br><i>D3 force graph</i>"]
        WarRoom["WarRoom</br><i>Multi-agent broadcast</i>"]
        MCP["MCPPanel</br><i>MCP server mgmt</i>"]
    end

    App --> Layout
    App --> ThemeToggle
    App --> ErrorB
    App --> CmdPalette
    App --> Onboard

    Layout --> LazyP
    LazyP --> Agents
    LazyP --> Terminal
    LazyP --> Memory
    LazyP --> Workspace
    LazyP --> Advanced

    Memory --> MemoryPanel
    MemoryPanel --> NoteEditor
    MemoryPanel --> Timeline
    MemoryPanel --> Handoff

    Agents --> AgentSidebar
    AgentSidebar --> AddAgent

    Terminal --> TerminalPane
    TerminalPane --> SplitPane
    TerminalPane --> ConversationHistory

    Workspace --> WorkspaceView
    WorkspaceView --> WorktreeManager
```

---

## 3. Store Dependency Map

```mermaid
graph LR
    agentStore["agentStore</br><i>Agents + status</i>"]
    themeStore["themeStore</br><i>Dark/Light/System</i>"]
    memoryStore["memoryStore</br><i>Notes + entries</i>"]
    mcpStore["mcpStore</br><i>MCP servers</i>"]
    taskGraphStore["taskGraphStore</br><i>Graph layout</i>"]
    warRoomStore["warRoomStore</br><i>Broadcasts</i>"]
    modelRouterStore["modelRouterStore</br><i>Ollama models</i>"]
    workspaceStore["workspaceStore</br><i>Worktrees</i>"]
    fileStore["fileStore</br><i>File system</i>"]
    loopStore["loopStore</br><i>Execution loops</i>"]
    coordinatorStore["coordinatorStore</br><i>Agent coord</i>"]
    archiveStore["archiveStore</br><i>Archives</i>"]
    qualityGateStore["qualityGateStore</br><i>Gate checks</i>"]
    onboardingStore["onboardingStore</br><i>Wizard state</i>"]

    agentStore -->|"activeAgentId"| memoryStore
    agentStore -->|"activeAgentId"| warRoomStore
    agentStore -->|"agents[]"| mcpStore
    memoryStore -->|"entries"| handoff["HandoffDialog"]
    workspaceStore -->|"worktrees"| fileStore
    modelRouterStore -->|"models"| taskGraphStore
    loopStore -->|"loops"| qualityGateStore

    style agentStore fill:#4fc,stroke:#333
    style memoryStore fill:#4fc,stroke:#333
    style workspaceStore fill:#4fc,stroke:#333
```

---

## 4. Test Coverage Map

```mermaid
graph TB
    subgraph Legend["🎯 Test File Status"]
        DONE["✅ Written & Passing"]
        TODO["⬜ Not Yet Written"]
    end

    subgraph Components["Component Tests — 26 files"]
        A1["✅ AddAgentDialog — 33 tests, 467 lines"]
        A2["✅ AgentSidebar — ~12 tests, 399 lines"]
        B1["✅ BrowserConnector — 50 tests, 525 lines"]
        C1["✅ CommandPalette — 46 tests, 509 lines"]
        C2["✅ ConversationHistory — 18 tests, 209 lines"]
        D1["✅ DiffViewer — 17 tests, 434 lines"]
        E1["✅ ErrorBoundary — 11 tests, 138 lines"]
        H1["✅ HandoffDialog — ~24 tests, 546 lines"]
        L1["✅ LazyPanels — 16 tests, 240 lines"]
        M1["✅ MCPPanel — 34 tests, 399 lines"]
        M2["✅ MemoryPanel — 41 tests, 519 lines"]
        M3["✅ ModelRouterPanel — 34 tests, 454 lines"]
        N1["✅ NoteEditor — 42 tests, 582 lines"]
        O1["✅ OnboardingWizard — 45 tests, 426 lines"]
        P1["✅ PresetPanel — 11 tests, 372 lines"]
        R1["✅ ResizableLayout — 26 tests, 393 lines"]
        S1["✅ SplitPane — 24 tests, 371 lines"]
        T1["✅ TaskGraph — 25 tests, 324 lines"]
        T2["✅ TerminalPane — 36 tests, 574 lines"]
        T3["✅ ThemeToggle — 16 tests, 175 lines"]
        T4["✅ Timeline — 47 tests, 640 lines"]
        W1["✅ WarRoom — 33 tests, 434 lines"]
        W2["✅ WorkspaceView — 20 tests, 275 lines"]
        W3["✅ WorktreeCard — 18 tests, 246 lines"]
        W4["✅ WorktreeManager — 35 tests, 475 lines"]
        APP["✅ App.tsx — 17 tests"]
    end

    subgraph Hooks["Hook Tests — 3 files"]
        UC["✅ useContextCapture — 24 tests, 636 lines"]
        ED["✅ useEditorDetection — 7 tests, 109 lines"]
        WI["✅ useWorktreeInit — 5 tests, 95 lines"]
    end

    subgraph Stores["Store Tests — 5 files"]
        AS["✅ agentStore — 6 tests, 65 lines"]
        MS["✅ memoryStore — 6 tests, 77 lines"]
        OS["✅ onboardingStore — 7 tests, 65 lines"]
        TGS["✅ taskGraphStore — 7 tests, 80 lines"]
        WRS["✅ warRoomStore — 7 tests, 76 lines"]
        WSS["✅ worktreeStore — 5 tests, 812 lines"]
    end

    subgraph Untested["⬜ Remaining Untested"]
        UseTerminal["hooks/useTerminal.ts"]
    end

    note["📊 Total: 40 files, 1008 tests, ~13,800 lines</br>✅ All passing — 0 failures, 0 TS errors"]
```

---

## 5. Phase / Feature Roadmap

```mermaid
gantt
    title Mothership Development Phases
    dateFormat  YYYY-MM-DD
    axisFormat  %b

    section Phase 0 — Foundation
    Tauri 2.x + Vite + React setup      :done, p0a, 2025-01-01, 14d
    3-panel layout + theme               :done, p0b, 2025-01-10, 10d

    section Phase 1a — Core
    Agent registry + sidebar             :done, p1a, 2025-01-15, 10d
    Terminal (xterm.js + PTY)           :done, p1b, 2025-01-20, 14d

    section Phase 1b — Context
    Memory + Notes + Timeline            :done, p1c, 2025-02-01, 14d
    Handoff dialog                       :done, p1d, 2025-02-10, 7d

    section Phase 2 — Enhanced
    Browser connector                    :done, p2a, 2025-02-15, 10d
    Model router (Ollama)               :done, p2b, 2025-02-20, 10d
    Task graph (D3)                     :done, p2c, 2025-02-25, 10d

    section Phase 3 — Advanced
    War room broadcasts                  :done, p3a, 2025-03-01, 10d
    MCP server integration              :done, p3b, 2025-03-05, 10d
    Worktree management                 :done, p3c, 2025-03-10, 10d

    section Phase 4 — Distribution
    Onboarding wizard                    :done, p4a, 2025-03-15, 7d
    Quality gates + loops               :done, p4b, 2025-03-18, 10d
    Testing (Phase 4.3a)               :active, p4c, 2025-03-22, 21d
    Remaining features                  :p4d, 2025-04-10, 14d

    section Phase 5+ — Future
    Rust test suite                      :p5a, 2025-04-15, 30d
    E2E + Integration tests             :p5b, 2025-05-01, 30d
    Distribution builds                 :p5c, 2025-05-15, 30d
```

---

## 6. Source File Dependency Graph (Entry -> Imports)

```mermaid
graph LR
    main["main.tsx"]
    App["App.tsx"]
    Layout["ResizableLayout"]
    Hooks["useContextCapture</br>useTerminal"]
    Stores["14 Zustand stores"]
    Components["~20 components"]
    Lib["lib/* utilities"]
    Types["types/*"]
    RustBackend["🦀 Tauri Rust Commands"]
    Sidecars["🐍 Python sidecar processes"]

    main --> App
    App --> Layout
    App --> Hooks
    App --> Components
    App --> Stores
    Components --> Stores
    Components --> Lib
    Components --> Types
    Hooks --> Stores
    Hooks -.->|"invoke()"| RustBackend
    Stores -.->|"invoke()"| RustBackend
    RustBackend -->|"spawns"| Sidecars
```

---

## 7. Git Worktree Feature Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as WorktreeManager UI
    participant Store as worktreeStore
    participant Rust as Rust Backend
    participant Git as Git

    User->>UI: Click "New Workspace"
    UI->>UI: Show create panel
    User->>UI: Enter task name + optional branch
    User->>UI: Click "Create Workspace"
    UI->>Store: createWorktree(path, name, base, agent)
    Store->>Rust: invoke("create_worktree", ...)
    Rust->>Git: git worktree add ...
    Git-->>Rust: path + branch
    Rust-->>Store: { success, workspace }
    Store-->>UI: Update worktrees list
    UI-->>User: Show new worktree card
```

---

## 8. Context Capture Flow

```mermaid
sequenceDiagram
    participant Terminal as Terminal Session
    participant Hook as useContextCapture
    participant Store as agentStore
    participant Rust as Rust Backend

    Terminal->>Hook: "terminal-output" event (data)
    Hook->>Hook: Accumulate output buffer
    Hook->>Hook: Check git activity patterns
    alt Git command detected
        Hook->>Rust: invoke("save_context_snapshot", { trigger: "git_activity" })
    else Output threshold exceeded
        Hook->>Rust: invoke("save_context_snapshot", { trigger: "terminal_output" })
    end
    Hook->>Hook: Extract decisions from output
    Note over Hook: Every 60s: heartbeat capture
    Note over Hook: On agent switch: capture previous agent context
```

---

## Update Checklist

When you make changes, update the relevant diagram(s):

- [ ] **New component?** → Update §2 (Component Tree) + §4 (Test Coverage)
- [ ] **New store?** → Update §3 (Store Dependency Map)
- [ ] **New test file?** → Update §4 (Test Coverage Map) with file name, test count, lines
- [ ] **New phase/feature complete?** → Update §5 (Phase Roadmap)
- [ ] **New dependency?** → Update §6 (File Dependency Graph)
- [ ] **New flow?** → Add a sequence diagram in §7+
- [ ] **Test count changed?** → Update the total in §4 note

---

**Last updated:** 2025-06-21  
**Current totals:** 40 TS test files (1008 tests) + 4 Python test files (91 tests) = 1099 total, 0 failures
