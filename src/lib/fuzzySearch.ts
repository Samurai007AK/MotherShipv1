/**
 * Fuzzy search scoring for the command palette.
 *
 * Algorithm:
 * 1. Exact match → highest score (100)
 * 2. Prefix match → high score (80 + length bonus)
 * 3. Word boundary match (e.g. "cl" matches "Claude" at start) → (60 + position bonus)
 * 4. Subsequence match (letters appear in order anywhere) → score based on
 *    gap penalties, consecutive letter bonuses, and start-of-string bonuses
 * 5. No match → -1 (filtered out)
 *
 * This produces natural-feeling rankings where "claud" matches "Claude" near the
 * top, "ap" matches "App.tsx" before "gap-utils.ts", and typos still surface
 * relevant results.
 */

export interface FuzzyMatch {
  score: number
  matchedIndices: number[]
}

/**
 * Score a query against a target string.
 * Returns a FuzzyMatch with score >= 0 if matched, or score -1 if no match.
 */
export function fuzzyMatch(query: string, target: string): FuzzyMatch {
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  if (q.length === 0) return { score: 0, matchedIndices: [] }

  // Exact match
  if (t === q) return { score: 100, matchedIndices: Array.from({ length: q.length }, (_, i) => i) }

  // Prefix match
  if (t.startsWith(q)) {
    const score = 80 + Math.min(q.length / t.length, 1) * 15
    return { score, matchedIndices: Array.from({ length: q.length }, (_, i) => i) }
  }

  // Contains match (substring somewhere in the string)
  const containsIdx = t.indexOf(q)
  if (containsIdx !== -1) {
    const score = 60 + Math.max(0, 10 - containsIdx) + Math.min(q.length / t.length, 1) * 10
    return { score, matchedIndices: Array.from({ length: q.length }, (_, i) => containsIdx + i) }
  }

  // Word boundary match: each query char matches the start of a word in the target
  // Build array of word start indices
  const boundaryStarts: number[] = [0]
  for (let i = 1; i < t.length; i++) {
    if (t[i - 1] === ' ' || t[i - 1] === '_' || t[i - 1] === '-' || t[i - 1] === '.' || t[i - 1] === '/') {
      boundaryStarts.push(i)
    } else if (t[i] === t[i].toUpperCase() && t[i - 1] === t[i - 1].toLowerCase()) {
      boundaryStarts.push(i) // camelCase boundary
    }
  }
  // Try to match query chars against word boundary starts (in order)
  const boundaryIndices: number[] = []
  let bi = 0
  for (let qi = 0; qi < q.length && bi < boundaryStarts.length; qi++) {
    // Find the next boundary that starts with this query char
    while (bi < boundaryStarts.length && t[boundaryStarts[bi]] !== q[qi]) {
      bi++
    }
    if (bi < boundaryStarts.length) {
      boundaryIndices.push(boundaryStarts[bi])
      bi++
    }
  }
  if (boundaryIndices.length === q.length) {
    const score = 50 + Math.min(q.length / t.length, 1) * 10
    return { score, matchedIndices: boundaryIndices }
  }

  // Subsequence match (letters in order, not necessarily consecutive)
  const indices = subsequenceMatch(q, t)
  if (indices !== null) {
    const score = subsequenceScore(q, t, indices)
    return { score, matchedIndices: indices }
  }

  // No match
  return { score: -1, matchedIndices: [] }
}

/**
 * Find the best subsequence match of query in target.
 * Returns the indices in target where each query char matches, or null.
 * Optimizes for: earliest start, fewest gaps, most consecutive runs.
 */
function subsequenceMatch(query: string, target: string): number[] | null {
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  // Greedy forward pass: find each query char in order
  const indices: number[] = []
  let ti = 0
  for (let qi = 0; qi < q.length; qi++) {
    let found = false
    while (ti < t.length) {
      if (t[ti] === q[qi]) {
        indices.push(ti)
        ti++
        found = true
        break
      }
      ti++
    }
    if (!found) return null
  }
  return indices
}

/**
 * Score a subsequence match. Higher is better.
 *
 * Bonuses:
 * - Start of string: +10
 * - Consecutive letters: +5 per consecutive pair
 * - Shorter target (tighter match): +up to 10
 * - camelCase/snake_case word boundary: +3 per boundary
 *
 * Penalties:
 * - Gaps between matched chars: -2 per gap
 */
function subsequenceScore(query: string, target: string, indices: number[]): number {
  let score = 0

  // Start-of-string bonus
  if (indices[0] === 0) score += 10

  // Consecutive letter bonus
  let consecutive = 0
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) {
      consecutive++
      score += 5
    } else {
      score -= 2 // Gap penalty
    }
  }

  // Tighter match bonus (shorter target relative to query is better)
  score += Math.max(0, 10 - Math.floor((target.length - query.length) / 5))

  // Word boundary bonus: matched char is at a camelCase/snake_case/start boundary
  for (const idx of indices) {
    if (idx === 0) {
      score += 3
    } else if (
      target[idx] === target[idx].toUpperCase() ||
      target[idx - 1] === '_' ||
      target[idx - 1] === '-' ||
      target[idx - 1] === '.' ||
      target[idx - 1] === '/'
    ) {
      score += 3
    }
  }

  // Normalize by query length so longer queries don't penalize
  const queryLen = Math.max(query.length, 1)
  const targetLen = Math.max(target.length, 1)
  return Math.max(0, Math.round(score * (queryLen / Math.max(targetLen, queryLen))))
}

/**
 * Filter and sort items by fuzzy match score.
 * Returns items with score > 0, sorted descending by score.
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getTargets: (item: T) => string[]
): Array<{ item: T; score: number; matchedIndices: number[] }> {
  if (!query.trim()) {
    return items.map((item) => ({ item, score: 0, matchedIndices: [] }))
  }

  const results: Array<{ item: T; score: number; matchedIndices: number[] }> = []

  for (const item of items) {
    const targets = getTargets(item)
    let bestScore = -1
    let bestIndices: number[] = []

    for (const target of targets) {
      const match = fuzzyMatch(query, target)
      if (match.score > bestScore) {
        bestScore = match.score
        bestIndices = match.matchedIndices
      }
    }

    if (bestScore > 0) {
      results.push({ item, score: bestScore, matchedIndices: bestIndices })
    }
  }

  return results.sort((a, b) => b.score - a.score)
}
