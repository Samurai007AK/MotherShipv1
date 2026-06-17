// Performance monitoring utilities for Mothership

export interface PerformanceMetrics {
  idleMemoryMB: number
  activeMemoryMB: number
  handoffLatencyMs: number
  terminalSwitchMs: number
  coldStartMs: number
  memorySearchMs: number
}

// Lazy load component with intersection observer
export function lazyLoad<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
) {
  return React.lazy(factory)
}

// Debounce utility for memory writes
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

// Throttle utility for event handlers
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}

// Memory usage reporter (browser)
export function getMemoryUsage(): { usedJSHeapSize: number; totalJSHeapSize: number } | null {
  if ('memory' in performance) {
    const memory = (performance as { memory: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory
    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
    }
  }
  return null
}

// Log performance metric
export function logMetric(name: string, value: number, unit: string = 'ms') {
  // Only log in development (detected by presence of Vite HMR)
  if (typeof window !== 'undefined' && (window as unknown as Record<string, boolean>).__VITE_DEV__) {
    console.log(`[Performance] ${name}: ${value.toFixed(2)}${unit}`)
  }
}

// Measure function execution time
export function measureTime<T>(name: string, fn: () => T): T {
  const start = performance.now()
  const result = fn()
  const end = performance.now()
  logMetric(name, end - start)
  return result
}

// Async measure
export async function measureTimeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now()
  const result = await fn()
  const end = performance.now()
  logMetric(name, end - start)
  return result
}

// Batch writes queue
export class BatchQueue<T> {
  private queue: T[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushFn: (items: T[]) => void
  private delay: number

  constructor(flushFn: (items: T[]) => void, delay: number = 2000) {
    this.flushFn = flushFn
    this.delay = delay
  }

  add(item: T) {
    this.queue.push(item)
    this.scheduleFlush()
  }

  private scheduleFlush() {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flush()
    }, this.delay)
  }

  flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.queue.length > 0) {
      this.flushFn([...this.queue])
      this.queue = []
    }
  }

  get size() {
    return this.queue.length
  }
}

// React import for lazyLoad
import React from 'react'
