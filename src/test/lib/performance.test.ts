import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import {
  lazyLoad,
  debounce,
  throttle,
  getMemoryUsage,
  logMetric,
  measureTime,
  measureTimeAsync,
  BatchQueue,
} from '../../lib/performance'

// ── lazyLoad ─────────────────────────────────────────────────────────

describe('lazyLoad', () => {
  it('wraps a factory in React.lazy and returns the result', () => {
    const factory = () => Promise.resolve({ default: (() => null) as React.ComponentType<unknown> })
    const result = lazyLoad(factory)
    // React.lazy returns an object with a $$typeof of REACT_LAZY_TYPE
    expect(result).toHaveProperty('$$typeof')
  })
})

// ── debounce ──────────────────────────────────────────────────────────

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls the function after the specified delay', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced('a')
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(199)
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cancels previous call on rapid invocations (only last fires)', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced('first')
    vi.advanceTimersByTime(50)
    debounced('second')
    vi.advanceTimersByTime(50)
    debounced('third')

    // Only 50ms into the 100ms timer — third hasn't fired yet
    expect(fn).not.toHaveBeenCalled()

    // Complete the 100ms debounce window
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('third')
  })

  it('passes the correct arguments to the wrapped function', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 50)

    debounced('hello', 42, { key: 'val' })
    vi.advanceTimersByTime(50)

    expect(fn).toHaveBeenCalledWith('hello', 42, { key: 'val' })
  })

  it('works with no arguments', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 50)

    debounced()
    vi.advanceTimersByTime(50)

    expect(fn).toHaveBeenCalledTimes(1)
  })
})

// ── throttle ─────────────────────────────────────────────────────────

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls the function immediately on first invocation', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 200)

    throttled('a')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('a')
  })

  it('ignores subsequent calls within the throttle window', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled('a')
    throttled('b')
    throttled('c')

    // Only the first should have fired
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('a')
  })

  it('allows another call after the throttle window expires', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled('a')
    expect(fn).toHaveBeenCalledTimes(1)

    // Advance past the window
    vi.advanceTimersByTime(100)

    throttled('b')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenCalledWith('b')
  })

  it('passes the correct arguments on each accepted call', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 50)

    throttled('first')
    vi.advanceTimersByTime(50)
    throttled('second')

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenNthCalledWith(1, 'first')
    expect(fn).toHaveBeenNthCalledWith(2, 'second')
  })
})

// ── getMemoryUsage ───────────────────────────────────────────────────

describe('getMemoryUsage', () => {
  it('returns null when performance.memory is unavailable', () => {
    expect(getMemoryUsage()).toBeNull()
  })

  it('returns memory info when performance.memory is present', () => {
    const mockMemory = { usedJSHeapSize: 50_000_000, totalJSHeapSize: 100_000_000 }
    Object.defineProperty(performance, 'memory', {
      value: mockMemory,
      writable: false,
      configurable: true,
    })

    const result = getMemoryUsage()
    expect(result).toEqual({
      usedJSHeapSize: 50_000_000,
      totalJSHeapSize: 100_000_000,
    })

    // Clean up
    delete (performance as { memory?: unknown }).memory
  })
})

// ── logMetric ────────────────────────────────────────────────────────

describe('logMetric', () => {
  let originalViteDev: unknown
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    originalViteDev = (window as unknown as Record<string, unknown>).__VITE_DEV__
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    ;(window as unknown as Record<string, unknown>).__VITE_DEV__ = originalViteDev
  })

  it('logs nothing when __VITE_DEV__ is falsy', () => {
    ;(window as unknown as Record<string, unknown>).__VITE_DEV__ = false
    logMetric('test-metric', 42.5, 'ms')
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('logs to console when __VITE_DEV__ is truthy', () => {
    ;(window as unknown as Record<string, unknown>).__VITE_DEV__ = true
    logMetric('test-metric', 42.5, 'ms')
    expect(consoleSpy).toHaveBeenCalledWith('[Performance] test-metric: 42.50ms')
  })

  it('uses "ms" as default unit when not provided', () => {
    ;(window as unknown as Record<string, unknown>).__VITE_DEV__ = true
    logMetric('latency', 100)
    expect(consoleSpy).toHaveBeenCalledWith('[Performance] latency: 100.00ms')
  })

  it('handles custom units like "MB"', () => {
    ;(window as unknown as Record<string, unknown>).__VITE_DEV__ = true
    logMetric('heap', 256, 'MB')
    expect(consoleSpy).toHaveBeenCalledWith('[Performance] heap: 256.00MB')
  })
})

// ── measureTime ──────────────────────────────────────────────────────

describe('measureTime', () => {
  it('calls the function and returns its result', () => {
    const result = measureTime('test', () => 42)
    expect(result).toBe(42)
  })

  it('passes through the function return value', () => {
    const obj = { a: 1 }
    const result = measureTime('obj', () => obj)
    expect(result).toBe(obj)
  })

  it('works with functions that have side effects', () => {
    const sideEffect = vi.fn()
    measureTime('side-effect', () => {
      sideEffect('called')
      return 'done'
    })
    expect(sideEffect).toHaveBeenCalledWith('called')
  })
})

// ── measureTimeAsync ─────────────────────────────────────────────────

describe('measureTimeAsync', () => {
  it('awaits the async function and returns its result', async () => {
    const result = await measureTimeAsync('async-test', async () => {
      return 'resolved'
    })
    expect(result).toBe('resolved')
  })

  it('works with a promise-returning function', async () => {
    const result = await measureTimeAsync('promise', () =>
      Promise.resolve(123),
    )
    expect(result).toBe(123)
  })

  it('passes through awaited values correctly', async () => {
    const sideEffect = vi.fn()
    const result = await measureTimeAsync('side-effect-async', async () => {
      sideEffect('started')
      await new Promise((resolve) => setTimeout(resolve, 10))
      sideEffect('finished')
      return 'done'
    })
    expect(result).toBe('done')
    expect(sideEffect).toHaveBeenCalledWith('started')
    expect(sideEffect).toHaveBeenCalledWith('finished')
  })
})

// ── BatchQueue ───────────────────────────────────────────────────────

describe('BatchQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with size 0', () => {
    const queue = new BatchQueue<string>(() => {})
    expect(queue.size).toBe(0)
  })

  it('adds items to the internal queue', () => {
    const queue = new BatchQueue<string>(() => {})
    queue.add('item1')
    expect(queue.size).toBe(1)
    queue.add('item2')
    expect(queue.size).toBe(2)
  })

  it('flushes batched items to flushFn after the delay', () => {
    const flushFn = vi.fn()
    const queue = new BatchQueue<string>(flushFn, 200)

    queue.add('a')
    queue.add('b')

    expect(flushFn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)

    expect(flushFn).toHaveBeenCalledTimes(1)
    expect(flushFn).toHaveBeenCalledWith(['a', 'b'])
  })

  it('clears the queue after flushing', () => {
    const flushFn = vi.fn()
    const queue = new BatchQueue<string>(flushFn, 100)

    queue.add('x')
    vi.advanceTimersByTime(100)
    expect(flushFn).toHaveBeenCalledWith(['x'])
    expect(queue.size).toBe(0)
  })

  it('does not flush items added after a flush before the new delay', () => {
    const flushFn = vi.fn()
    const queue = new BatchQueue<string>(flushFn, 100)

    queue.add('first')
    vi.advanceTimersByTime(100)
    expect(flushFn).toHaveBeenCalledWith(['first'])

    queue.add('second')
    // Should not have been called again yet
    expect(flushFn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(100)
    expect(flushFn).toHaveBeenCalledTimes(2)
    expect(flushFn).toHaveBeenNthCalledWith(2, ['second'])
  })

  it('flush() flushes immediately without waiting for the timer', () => {
    const flushFn = vi.fn()
    const queue = new BatchQueue<string>(flushFn, 5000)

    queue.add('immediate')
    expect(queue.size).toBe(1)

    queue.flush()
    expect(flushFn).toHaveBeenCalledWith(['immediate'])
    expect(queue.size).toBe(0)
  })

  it('calling flush() with empty queue does not call flushFn', () => {
    const flushFn = vi.fn()
    const queue = new BatchQueue<string>(flushFn, 100)

    queue.flush()
    expect(flushFn).not.toHaveBeenCalled()
  })

  it('does not reset timer when items are added before a pending flush', () => {
    // scheduleFlush bails early if a timer is already running,
    // so items added mid-window are included in the current batch.
    const flushFn = vi.fn()
    const queue = new BatchQueue<string>(flushFn, 100)

    queue.add('first')
    vi.advanceTimersByTime(80)

    // Add another item — timer is still at t=100 (20ms away)
    queue.add('second')

    // Advance by just 21ms → original timer fires, both items batched
    vi.advanceTimersByTime(21)
    expect(flushFn).toHaveBeenCalledTimes(1)
    expect(flushFn).toHaveBeenCalledWith(['first', 'second'])
    expect(queue.size).toBe(0)
  })

  it('works with different item types (generic)', () => {
    const flushFn = vi.fn()
    const queue = new BatchQueue<number>(flushFn, 100)

    queue.add(1)
    queue.add(2)
    queue.add(3)
    vi.advanceTimersByTime(100)

    expect(flushFn).toHaveBeenCalledWith([1, 2, 3])
  })

  it('preserves flushFn reference across multiple flushes', () => {
    const flushFn = vi.fn()
    const queue = new BatchQueue<string>(flushFn, 100)

    queue.add('batch1')
    vi.advanceTimersByTime(100)
    expect(flushFn).toHaveBeenCalledWith(['batch1'])
    expect(queue.size).toBe(0)

    queue.add('batch2')
    vi.advanceTimersByTime(100)
    expect(flushFn).toHaveBeenCalledWith(['batch2'])
    expect(flushFn).toHaveBeenCalledTimes(2)
  })

  it('uses default delay of 2000ms when not specified', () => {
    const flushFn = vi.fn()
    const queue = new BatchQueue<string>(flushFn)

    queue.add('default-delay')

    // At 1999ms — not yet flushed
    vi.advanceTimersByTime(1999)
    expect(flushFn).not.toHaveBeenCalled()

    // At 2000ms — flushed
    vi.advanceTimersByTime(1)
    expect(flushFn).toHaveBeenCalledWith(['default-delay'])
  })
})
