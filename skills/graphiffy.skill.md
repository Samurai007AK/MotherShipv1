# Graphiffy — Project Graph Skill for Codebuff

## About

When the user invokes `/graphiffy`, load this skill and execute the following steps to generate an up-to-date interactive project graph visualization.

## Steps

### 1. Run test suite to get latest counts

```bash
npx vitest run --no-coverage 2>&1 | tail -3
```

Extract: total test files, total tests, pass/fail.

### 2. Check TypeScript errors

```bash
npx tsc --noEmit 2>&1
```

Extract: number of errors (if any).

### 3. Scan test file inventory

```bash
for f in src/test/**/*.test.*; do echo "$f: $(wc -l < "$f") lines"; done
```

Count: total files and total lines.

### 4. Build/update graphify graph database

```bash
cd "$PROJECT_ROOT" && graphify update . 2>&1
```

If `graphify-out/graph.json` doesn't exist yet, use `graphify extract . --no-cluster` instead.

### 5. Generate the D3 tree visualization

```bash
cd "$PROJECT_ROOT" && graphify tree --label "Mothership" --output graphify-out/GRAPH_TREE.html 2>&1
```

### 6. Update graph.html with latest test counts

Edit `graph.html`:
- Update the badge text to the current test count (e.g., `873 tests · 0 failures`)
- Add any new test files that aren't in the graph
- Update the test file list if needed

### 7. Refresh the generated graph outputs

Make sure `graphify-out/GRAPH_TREE.html` (step 5) and `graph.html` (step 6) reflect the
latest tree and test counts. (The old `GRAPH.md` maintainer doc was removed; the HTML
outputs are the graph of record.)

### 8. Report summary

Tell the user:
```
## ✅ Graphiffy Complete

**Graph:** graphify-out/GRAPH_TREE.html (D3 tree) + graph.html (network graph)
**Tests:** X files, Y tests, all passing
**TS Errors:** 0
```

## Notes

- `graphify` must be installed: `pip install graphifyy`
- If `graphify update` fails because graph.json doesn't exist, try `graphify extract . --no-cluster` instead
- The `graphify tree` command generates a D3 collapsible tree at `graphify-out/GRAPH_TREE.html`
- Always update both `graph.html` (vis-network) and `GRAPH_TREE.html` (D3 tree from graphify)
