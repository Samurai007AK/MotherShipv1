# Mothership — Accessibility

**Last Updated:** 2026-06-15
**Status:** Final Draft
**Scope:** Cross-cutting concern applicable to all phases

---

## Overview

Mothership must be usable by everyone, including users who rely on screen readers, keyboard navigation, or have visual impairments. This document defines accessibility requirements and implementation patterns.

**Target Standard:** WCAG 2.1 AA compliance

**Related Documents:**
- [`CONFIGURATION.md`](./CONFIGURATION.md) — Keyboard shortcut customization, font scaling settings
- [`ERROR-HANDLING.md`](./ERROR-HANDLING.md) — Accessible error messages, screen reader announcements
- [`MONITORING.md`](./MONITORING.md) — Debug overlay accessibility, status announcements
- [`TESTING-STRATEGY.md`](./TESTING-STRATEGY.md) — Accessibility testing (axe-core, NVDA/VoiceOver)

---

## 1. Keyboard Navigation

### 1.1 Global Keyboard Shortcuts

| Action | Shortcut | Scope |
|---|---|---|
| Quick Switcher | `Cmd/Ctrl + K` | Global |
| New Terminal | `Cmd/Ctrl + T` | Global |
| Close Tab | `Cmd/Ctrl + W` | Global |
| Split Pane | `Cmd/Ctrl + \` | Terminal |
| Switch Agent 1-9 | `Cmd/Ctrl + 1-9` | Global |
| Settings | `Cmd/Ctrl + ,` | Global |
| Focus Sidebar | `Cmd/Ctrl + 1` | Global |
| Focus Workspace | `Cmd/Ctrl + 2` | Global |
| Focus Memory | `Cmd/Ctrl + 3` | Global |
| Toggle Theme | `Cmd/Ctrl + Shift + D` | Global |
| Handoff to Next | `Cmd/Ctrl + Shift + H` | Global |
| Search Memory | `Cmd/Ctrl + Shift + F` | Global |
| Help | `F1` | Global |

### 1.2 Focus Management

```typescript
// src/lib/focus-manager.ts
export class FocusManager {
  private zones: Map<string, HTMLElement> = new Map();
  private currentZone: string = 'sidebar';

  registerZone(id: string, element: HTMLElement) {
    this.zones.set(id, element);
  }

  focusZone(id: string) {
    const element = this.zones.get(id);
    if (element) {
      element.focus();
      this.currentZone = id;

      // Announce zone change to screen readers
      this.announce(`Focused on ${this.getZoneLabel(id)}`);
    }
  }

  moveFocus(direction: 'up' | 'down' | 'left' | 'right') {
    const zoneOrder = ['sidebar', 'workspace', 'memory'];
    const currentIndex = zoneOrder.indexOf(this.currentZone);

    let nextIndex: number;
    switch (direction) {
      case 'left':
        nextIndex = Math.max(0, currentIndex - 1);
        break;
      case 'right':
        nextIndex = Math.min(zoneOrder.length - 1, currentIndex + 1);
        break;
      default:
        return; // Up/down handled by component
    }

    this.focusZone(zoneOrder[nextIndex]);
  }

  private announce(message: string) {
    const announcer = document.getElementById('sr-announcer');
    if (announcer) {
      announcer.textContent = message;
    }
  }

  private getZoneLabel(id: string): string {
    const labels: Record<string, string> = {
      sidebar: 'Agent sidebar',
      workspace: 'Workspace',
      memory: 'Memory panel',
    };
    return labels[id] || id;
  }
}

// Singleton
export const focusManager = new FocusManager();
```

### 1.3 Screen Reader Announcer

```tsx
// src/components/accessibility/ScreenReaderAnnouncer.tsx
export const ScreenReaderAnnouncer: React.FC = () => {
  return (
    <div
      id="sr-announcer"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    />
  );
};

// CSS for sr-only class
// .sr-only {
//   position: absolute;
//   width: 1px;
//   height: 1px;
//   padding: 0;
//   margin: -1px;
//   overflow: hidden;
//   clip: rect(0, 0, 0, 0);
//   white-space: nowrap;
//   border: 0;
// }
```

### 1.4 Keyboard-Navigable Components

```tsx
// Accessible agent list with arrow key navigation
const AgentList: React.FC = () => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const agents = useAgentStore(s => s.agents);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(agents.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(0, i - 1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        activateAgent(agents[selectedIndex].id);
        break;
      case 'Home':
        e.preventDefault();
        setSelectedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setSelectedIndex(agents.length - 1);
        break;
    }
  };

  return (
    <ul
      role="listbox"
      aria-label="Agents"
      aria-activedescendant={agents[selectedIndex]?.id}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {agents.map((agent, index) => (
        <li
          key={agent.id}
          id={agent.id}
          role="option"
          aria-selected={index === selectedIndex}
          className={cn(
            'p-2 cursor-pointer',
            index === selectedIndex && 'bg-zinc-800 ring-1 ring-blue-500'
          )}
        >
          <AgentRow agent={agent} />
        </li>
      ))}
    </ul>
  );
};
```

---

## 2. ARIA Attributes

### 2.1 Landmark Roles

```tsx
// src/App.tsx
const App: React.FC = () => {
  return (
    <div className="flex h-screen">
      {/* Skip link */}
      <SkipLink />

      {/* Screen reader announcer */}
      <ScreenReaderAnnouncer />

      {/* Sidebar */}
      <aside
        role="complementary"
        aria-label="Agent sidebar"
        className="w-64 border-r border-zinc-800"
      >
        <AgentSidebar />
      </aside>

      {/* Main content */}
      <main role="main" aria-label="Workspace" className="flex-1">
        <WorkspaceView />
      </main>

      {/* Memory panel */}
      <aside
        role="complementary"
        aria-label="Memory panel"
        className="w-80 border-l border-zinc-800"
      >
        <MemoryPanel />
      </aside>
    </div>
  );
};
```

### 2.2 Skip Link

```tsx
// src/components/accessibility/SkipLink.tsx
export const SkipLink: React.FC = () => {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded"
    >
      Skip to main content
    </a>
  );
};
```

### 2.3 ARIA Patterns

```tsx
// Accessible tabs
<div role="tablist" aria-label="Agent views">
  <button
    role="tab"
    aria-selected={activeTab === 'terminal'}
    aria-controls="terminal-panel"
    id="terminal-tab"
    tabIndex={activeTab === 'terminal' ? 0 : -1}
  >
    Terminal
  </button>
  <button
    role="tab"
    aria-selected={activeTab === 'output'}
    aria-controls="output-panel"
    id="output-tab"
    tabIndex={activeTab === 'output' ? 0 : -1}
  >
    Output
  </button>
</div>

<div
  role="tabpanel"
  id="terminal-panel"
  aria-labelledby="terminal-tab"
  tabIndex={0}
>
  <TerminalPane />
</div>

// Accessible dialog
<Dialog role="dialog" aria-modal="true" aria-labelledby="dialog-title">
  <DialogTitle id="dialog-title">Handoff to Agent</DialogTitle>
  <DialogDescription id="dialog-desc">
    Select an agent to hand off context to.
  </DialogDescription>
</Dialog>

// Accessible status badge
<span
  role="status"
  aria-label={`Agent status: ${status}`}
  className={cn('w-2 h-2 rounded-full', statusColors[status])}
/>

// Accessible loading state
<div role="status" aria-busy={isLoading}>
  {isLoading ? (
    <span className="sr-only">Loading...</span>
  ) : (
    content
  )}
</div>
```

---

## 3. Color & Contrast

### 3.1 Color Contrast Requirements

| Element | Minimum Ratio | Target Ratio |
|---|---|---|
| Normal text | 4.5:1 | 7:1 |
| Large text (≥18pt) | 3:1 | 4.5:1 |
| UI components | 3:1 | 4.5:1 |
| Focus indicators | 3:1 | 4.5:1 |

### 3.2 Color Palette with Contrast Ratios

```css
/* All text colors against dark backgrounds meet 4.5:1+ */
:root {
  /* Text colors */
  --text-primary: #f5f5f5;      /* 15.4:1 against #18181b */
  --text-secondary: #a1a1aa;    /* 7.2:1 against #18181b */
  --text-muted: #71717a;        /* 4.6:1 against #18181b */

  /* Status colors (ensure 3:1 against background) */
  --status-online: #22c55e;     /* 5.3:1 against #18181b */
  --status-busy: #eab308;       /* 8.9:1 against #18181b */
  --status-error: #ef4444;      /* 4.6:1 against #18181b */
  --status-offline: #71717a;    /* 4.6:1 against #18181b */

  /* Focus ring (always visible) */
  --focus-ring: #3b82f6;        /* 5.0:1 against #18181b */
}

/* Light theme */
[data-theme="light"] {
  --text-primary: #18181b;      /* 15.4:1 against #fafafa */
  --text-secondary: #52525b;    /* 9.2:1 against #fafafa */
  --text-muted: #a1a1aa;        /* 3.1:1 against #fafafa (use for icons only) */
}
```

### 3.3 Never Use Color Alone

```tsx
// ❌ Bad: Status indicated only by color
<span className="w-2 h-2 rounded-full bg-green-500" />

// ✅ Good: Status indicated by color + icon + text
<span className="flex items-center gap-1">
  <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden="true" />
  <CheckCircle className="w-3 h-3 text-green-500" aria-hidden="true" />
  <span className="text-xs text-green-400">Online</span>
  <span className="sr-only">Status: Online</span>
</span>

// ❌ Bad: Error only shown in red
<p className="text-red-500">Invalid input</p>

// ✅ Good: Error shown with icon + text + aria
<p className="text-red-500 flex items-center gap-1" role="alert">
  <AlertCircle className="w-4 h-4" aria-hidden="true" />
  <span>Invalid input</span>
</p>
```

### 3.4 Focus Indicators

```css
/* All interactive elements must have visible focus */
:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

/* Don't remove focus for mouse users */
:focus:not(:focus-visible) {
  outline: none;
}

/* Custom focus styles for specific components */
button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
}

[role="tab"]:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}
```

---

## 4. Screen Reader Support

### 4.1 Announcements

```tsx
// Announce important events to screen readers
function useAnnouncer() {
  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const announcer = document.getElementById(`sr-announcer-${priority}`);
    if (announcer) {
      announcer.textContent = '';
      // Force DOM update for screen readers
      requestAnimationFrame(() => {
        announcer.textContent = message;
      });
    }
  }, []);

  return announce;
}

// Usage
const announce = useAnnouncer();

// When handoff completes
announce(`Handoff complete. Now using ${targetAgent.name}.`, 'assertive');

// When context is captured
announce('Context snapshot saved.', 'polite');

// When error occurs
announce(`Error: ${error.message}`, 'assertive');
```

### 4.2 Live Regions

```tsx
// Dynamic content areas
<div
  aria-live="polite"
  aria-atomic="true"
  className="sr-only"
>
  {/* Announce memory entry count changes */}
  {memoryCount} memory entries
</div>

<div
  aria-live="assertive"
  aria-atomic="true"
  className="sr-only"
>
  {/* Announce critical events */}
  {criticalMessage}
</div>
```

### 4.3 Image Alternatives

```tsx
// Agent icons (decorative in context, but need alt text)
<img
  src={agent.icon}
  alt=""
  aria-hidden="true"
  className="w-5 h-5"
/>
<span className="sr-only">{agent.name}</span>

// If icon is the only indicator, provide alt text
<img
  src={agent.icon}
  alt={`${agent.name} agent`}
  className="w-5 h-5"
/>
```

---

## 5. High DPI & Scaling

### 5.1 Responsive Design

```tsx
// Responsive panel sizes
const panelSizes = {
  mobile: { sidebar: 0, memory: 0 },        // Hidden on mobile
  tablet: { sidebar: 200, memory: 250 },    // Narrower on tablet
  desktop: { sidebar: 256, memory: 320 },   // Full size
};

// Use container queries for responsive components
const ResponsivePanel: React.FC = () => {
  return (
    <div className="@container">
      {/* Default: full layout */}
      <div className="@lg:flex">
        <div className="@lg:w-64">Sidebar</div>
        <div className="@lg:flex-1">Main</div>
        <div className="@lg:w-80">Memory</div>
      </div>

      {/* Small: stacked */}
      <div className="@sm:block @lg:hidden">
        Stacked layout for small screens
      </div>
    </div>
  );
};
```

### 5.2 High DPI Support

```css
/* Use vector icons where possible */
.icon {
  /* SVG icons scale perfectly at any DPI */
}

/* For raster images, provide 2x versions */
@media (min-resolution: 2dppx) {
  .logo {
    background-image: url('logo@2x.png');
    background-size: contain;
  }
}

/* Font rendering optimization */
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
```

### 5.3 Text Scaling

```tsx
// Respect user's font size preferences
// All text sizes use relative units (rem/em)

const fontSizeScale = {
  xs: '0.75rem',    // 12px
  sm: '0.875rem',   // 14px
  base: '1rem',     // 16px
  lg: '1.125rem',   // 18px
  xl: '1.25rem',    // 20px
};

// Allow user to adjust base font size
const FontSizeControl: React.FC = () => {
  const [scale, setScale] = useSetting('fontScale', 1);

  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * scale}px`;
  }, [scale]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">Text size</span>
      <Slider
        value={[scale]}
        onValueChange={([v]) => setScale(v)}
        min={0.75}
        max={1.5}
        step={0.1}
      />
      <span className="text-sm">{Math.round(scale * 100)}%</span>
    </div>
  );
};
```

---

## 6. Reduced Motion

```css
/* Respect prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

```tsx
// Respect user preference for animations
const useReducedMotion = () => {
  const [reducedMotion, setReducedMotion] = useState(() => {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reducedMotion;
};

// Usage in animations
const useAnimatedValue = (value: number) => {
  const reducedMotion = useReducedMotion();

  return useSpring(value, {
    config: reducedMotion
      ? { duration: 0 }
      : { duration: 300, easing: easings.easeInOut },
  });
};
```

---

## 7. Testing Accessibility

### 7.1 Automated Tests

```typescript
// src/test/accessibility.test.tsx
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { AgentSidebar } from '../components/agents/AgentSidebar';
import { MemoryPanel } from '../components/memory/MemoryPanel';

expect.extend(toHaveNoViolations);

describe('Accessibility', () => {
  test('AgentSidebar has no violations', async () => {
    const { container } = render(<AgentSidebar />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('MemoryPanel has no violations', async () => {
    const { container } = render(<MemoryPanel />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('All interactive elements are keyboard accessible', () => {
    render(<AgentSidebar />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toHaveAttribute('tabindex');
    });

    const links = screen.getAllByRole('link');
    links.forEach(link => {
      expect(link).toHaveAttribute('tabindex');
    });
  });

  test('All images have alt text', () => {
    render(<AgentSidebar />);

    const images = screen.getAllByRole('img');
    images.forEach(img => {
      expect(img).toHaveAttribute('alt');
    });
  });
});
```

### 7.2 Manual Testing Checklist

- [ ] Navigate entire app using only keyboard
- [ ] Test with screen reader (NVDA on Windows, VoiceOver on macOS)
- [ ] Verify focus is visible on all interactive elements
- [ ] Check color contrast ratios with WebAIM contrast checker
- [ ] Test with browser zoom at 200%
- [ ] Test with system high contrast mode
- [ ] Test with prefers-reduced-motion enabled
- [ ] Verify all dynamic content is announced
- [ ] Test with text resized to 200%
- [ ] Verify no keyboard traps exist

---

## Implementation Checklist

- [ ] Skip link component
- [ ] Screen reader announcer
- [ ] Focus manager for panel switching
- [ ] ARIA landmarks (main, complementary, navigation)
- [ ] Keyboard navigation for agent list
- [ ] Keyboard navigation for memory list
- [ ] Tab component with proper ARIA
- [ ] Dialog component with focus trap
- [ ] Color contrast verification (4.5:1+ for text)
- [ ] Focus indicators (3:1+ contrast)
- [ ] Reduced motion support
- [ ] High DPI support
- [ ] Text scaling support
- [ ] axe-core integration in tests
- [ ] Manual testing with NVDA/VoiceOver
