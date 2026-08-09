import { describe, it, expect } from 'vitest'
import { fuzzyMatch, fuzzyFilter, type FuzzyMatch } from '../../lib/fuzzySearch'

// ── Helpers ───────────────────────────────────────────────────────────

function assertNoMatch(result: FuzzyMatch) {
  expect(result.score).toBe(-1)
  expect(result.matchedIndices).toEqual([])
}

/**
 * Verify that fuzzyMatch's matchedIndices are valid: each points to a char
 * in `target` that matches the corresponding query char, and indices are
 * strictly ascending.
 */
function expectValidIndices(result: FuzzyMatch, query: string, target: string) {
  expect(result.score).toBeGreaterThanOrEqual(0)
  const t = target.toLowerCase()
  const indices = result.matchedIndices
  for (let i = 0; i < indices.length; i++) {
    expect(indices[i]).toBeGreaterThanOrEqual(0)
    expect(indices[i]).toBeLessThan(t.length)
    expect(t[indices[i]]).toBe(query.toLowerCase()[i])
  }
  for (let i = 1; i < indices.length; i++) {
    expect(indices[i]).toBeGreaterThan(indices[i - 1])
  }
}

// ── fuzzyMatch ────────────────────────────────────────────────────────

describe('fuzzyMatch', () => {
  describe('exact match', () => {
    it('returns score 100 for exact string match', () => {
      const r = fuzzyMatch('hello', 'hello')
      expect(r.score).toBe(100)
      expect(r.matchedIndices).toEqual([0, 1, 2, 3, 4])
    })

    it('is case-insensitive for exact match', () => {
      const r = fuzzyMatch('HELLO', 'hello')
      expect(r.score).toBe(100)
    })

    it('returns score 0 for empty query', () => {
      const r = fuzzyMatch('', 'anything')
      expect(r.score).toBe(0)
      expect(r.matchedIndices).toEqual([])
    })
  })

  describe('prefix match', () => {
    it('scores prefix matches between 80 and 95', () => {
      const r = fuzzyMatch('cla', 'Claude')
      expect(r.score).toBeGreaterThanOrEqual(80)
      expect(r.score).toBeLessThanOrEqual(95)
    })

    it('matches shorter prefix against longer target', () => {
      const r = fuzzyMatch('app', 'Application')
      expect(r.score).toBeGreaterThanOrEqual(80)
      expect(r.score).toBeLessThan(95)
    })

    it('prefix gets higher score than contains for same query', () => {
      const prefixScore = fuzzyMatch('in', 'Internal').score
      const containsScore = fuzzyMatch('in', 'Join').score
      expect(prefixScore).toBeGreaterThan(containsScore)
    })
  })

  describe('contains (substring) match', () => {
    it('scores contains matches between 60 and 80', () => {
      const r = fuzzyMatch('ern', 'Internal')
      expect(r.score).toBeGreaterThanOrEqual(60)
      expect(r.score).toBeLessThanOrEqual(80)
    })

    it('prefers matches closer to start of string', () => {
      const early = fuzzyMatch('in', 'Internal').score
      const late = fuzzyMatch('in', 'Begin').score
      expect(early).toBeGreaterThan(late)
    })

    it('matches substring anywhere in the target', () => {
      const r = fuzzyMatch('for', 'Performance')
      expect(r.score).toBeGreaterThan(0)
      expectValidIndices(r, 'for', 'Performance')
    })
  })

  describe('word boundary match', () => {
    it('matches camelCase word boundaries', () => {
      const r = fuzzyMatch('gp', 'getProps')
      expect(r.score).toBeGreaterThan(0)
      expect(r.matchedIndices).toEqual([0, 3])
    })

    it('matches query at word boundaries via subsequence when not a substring', () => {
      // 'fn' is NOT a substring of 'my_function_name' (f at 2, n at 4 — not consecutive)
      // So it falls through to word boundary or subsequence matching
      const r = fuzzyMatch('fn', 'my_function_name')
      expect(r.score).toBeGreaterThan(0)
      expectValidIndices(r, 'fn', 'my_function_name')
    })

    it('matches kebab-case word boundaries when not a substring', () => {
      // 'fr' is NOT a substring of 'my-file-reader' (f at 3, r at 8 — not consecutive)
      const r = fuzzyMatch('fr', 'my-file-reader')
      expect(r.score).toBeGreaterThan(0)
      expectValidIndices(r, 'fr', 'my-file-reader')
    })

    it('matches path-separator word boundaries', () => {
      // 'ho' IS a substring of 'src/hooks/useTerminal' at index 4 (contains match)
      // Use a query that forces word-boundary path
      const r = fuzzyMatch('hu', 'src/hooks/useTerminal')
      expect(r.score).toBeGreaterThan(0)
      expectValidIndices(r, 'hu', 'src/hooks/useTerminal')
    })
  })

  describe('subsequence match', () => {
    it('matches letters in order throughout the string', () => {
      const r = fuzzyMatch('cld', 'Claude')
      expect(r.score).toBeGreaterThan(0)
      // Greedy: c=0, first l=1, first d after index 1 is at 4
      expect(r.matchedIndices).toEqual([0, 1, 4])
    })

    it('scores consecutive letters higher than gapped', () => {
      const consecutive = fuzzyMatch('cla', 'Claude').score
      const gapped = fuzzyMatch('cld', 'Claude').score
      expect(consecutive).toBeGreaterThan(gapped)
    })

    it('awards bonus for start-of-string match', () => {
      const startMatch = fuzzyMatch('cd', 'Claude').score
      const nonStart = fuzzyMatch('cd', 'Decode').score
      expect(startMatch).toBeGreaterThan(nonStart)
    })

    it('returns -1 when no subsequence exists', () => {
      assertNoMatch(fuzzyMatch('xyz', 'hello'))
    })

    it('returns -1 for characters in wrong order', () => {
      // 'do' in 'code': d at 2, but o at 1 comes before it → not a subsequence
      assertNoMatch(fuzzyMatch('do', 'code'))
    })
  })

  describe('no match', () => {
    it('returns -1 for completely unrelated query', () => {
      assertNoMatch(fuzzyMatch('xqzz', 'hello'))
    })

    it('returns -1 when query chars not all present', () => {
      assertNoMatch(fuzzyMatch('zzz', 'hello'))
    })
  })

  describe('matched indices correctness', () => {
    it('indices correspond to valid positions for exact match', () => {
      const r = fuzzyMatch('test', 'test')
      expect(r.matchedIndices).toEqual([0, 1, 2, 3])
    })

    it('indices are in ascending order for subsequence', () => {
      const r = fuzzyMatch('cld', 'Claude')
      for (let i = 1; i < r.matchedIndices.length; i++) {
        expect(r.matchedIndices[i]).toBeGreaterThan(r.matchedIndices[i - 1])
      }
    })
  })
})

// ── fuzzyFilter ──────────────────────────────────────────────────────

describe('fuzzyFilter', () => {
  const items = [
    'App.tsx',
    'Application.ts',
    'internal.ts',
    'gap-utils.ts',
    'zebra.ts',
  ]

  it('returns all items with score 0 for empty query', () => {
    const results = fuzzyFilter(items, '', (s) => [s])
    expect(results).toHaveLength(items.length)
    for (const r of results) {
      expect(r.score).toBe(0)
    }
  })

  it('returns all items with score 0 for whitespace query', () => {
    const results = fuzzyFilter(items, '   ', (s) => [s])
    expect(results).toHaveLength(items.length)
  })

  it('filters out items with no match', () => {
    const results = fuzzyFilter(items, 'xyzabc', (s) => [s])
    expect(results).toHaveLength(0)
  })

  it('sorts results descending by score', () => {
    const results = fuzzyFilter(items, 'app', (s) => [s])
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score)
    }
  })

  it('prefers exact match over prefix match', () => {
    const results = fuzzyFilter(
      ['App.tsx', 'Application.ts'],
      'App.tsx',
      (s) => [s],
    )
    expect(results[0].item).toBe('App.tsx')
    expect(results[0].score).toBe(100)
  })

  it('matches "ap" includes App.tsx, Application.ts, and gap-utils.ts (contains)', () => {
    // 'ap' matches App.tsx (prefix), Application.ts (prefix), and
    // gap-utils.ts (contains at index 1: g-a-p)
    const results = fuzzyFilter(items, 'ap', (s) => [s])
    const matched = results.map((r) => r.item)
    expect(matched).toContain('App.tsx')
    expect(matched).toContain('Application.ts')
    expect(matched).toContain('gap-utils.ts')
    expect(matched).not.toContain('zebra.ts')
  })

  it('uses multiple targets per item and picks the best score', () => {
    const items = [
      { name: 'foo.ts', aliases: ['bar.ts', 'App.tsx'] },
      { name: 'other.ts', aliases: ['nope.txt'] },
    ]
    const results = fuzzyFilter(items, 'App.tsx', (item) => [
      item.name,
      ...item.aliases,
    ])
    expect(results).toHaveLength(1)
    expect(results[0].item.name).toBe('foo.ts')
    expect(results[0].score).toBe(100) // exact match on alias
  })

  it('preserves matchedIndices in results', () => {
    const results = fuzzyFilter(['Claude'], 'cla', (s) => [s])
    expect(results[0].matchedIndices).toEqual([0, 1, 2])
  })

  it('works with generic typed items', () => {
    interface Task {
      id: number
      title: string
    }
    const tasks: Task[] = [
      { id: 1, title: 'Fix login bug' },
      { id: 2, title: 'Add tests' },
    ]
    const results = fuzzyFilter(tasks, 'login', (t) => [t.title])
    expect(results).toHaveLength(1)
    expect(results[0].item.id).toBe(1)
  })
})
