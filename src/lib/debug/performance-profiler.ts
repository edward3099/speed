/**
 * Performance Profiling Utilities
 * Helps identify performance bottlenecks in React components and functions
 */

export interface PerformanceMetric {
  name: string
  duration: number
  timestamp: number
  metadata?: Record<string, any>
}

export interface ComponentRenderMetrics {
  componentName: string
  renderCount: number
  totalRenderTime: number
  averageRenderTime: number
  minRenderTime: number
  maxRenderTime: number
  renders: Array<{
    timestamp: number
    duration: number
    propsChanged: boolean
  }>
}

export class PerformanceProfiler {
  private metrics: PerformanceMetric[] = []
  private componentMetrics: Map<string, ComponentRenderMetrics> = new Map()
  private maxMetrics = 1000

  /**
   * Measure function execution time
   */
  async measure<T>(
    name: string,
    fn: () => T | Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const start = performance.now()
    const startTimestamp = Date.now()

    try {
      const result = await fn()
      const duration = performance.now() - start

      this.recordMetric({
        name,
        duration,
        timestamp: startTimestamp,
        metadata,
      })

      return result
    } catch (error) {
      const duration = performance.now() - start
      this.recordMetric({
        name: `${name} (error)`,
        duration,
        timestamp: startTimestamp,
        metadata: { ...metadata, error: String(error) },
      })
      throw error
    }
  }

  /**
   * Record a performance metric
   */
  recordMetric(metric: PerformanceMetric) {
    this.metrics.push(metric)

    // Trim old metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics)
    }

    // Log slow operations in development
    // Adjusted thresholds for API calls (includes network round-trip to Supabase):
    // - < 500ms: Good (no log)
    // - 500-2000ms: Warning (acceptable for network + DB operations, but monitor)
    // - > 2000ms: Critical warning (needs attention - likely network latency or cold start)
    // Use console.warn for all performance alerts (not console.error) 
    // to avoid them being caught by error handlers
    if (process.env.NODE_ENV === 'development') {
      // Different thresholds for different operations
      // API calls include network round-trip to Supabase, so higher thresholds
      const isApiCall = metric.name.includes('api-call') || metric.name.includes('status') || metric.name.includes('spin')
      // Increased thresholds: API calls can be slow due to network, DB operations, cold starts
      const criticalThreshold = isApiCall ? 10000 : 2000  // 10s for API calls (network/DB can be slow), 2s for others
      const warningThreshold = isApiCall ? 5000 : 1000     // 5s for API calls, 1s for others
      
      if (metric.duration > criticalThreshold) {
        console.warn(`[Performance] ⚠️ CRITICAL: ${metric.name} took ${metric.duration.toFixed(2)}ms`, {
          metadata: metric.metadata,
        })
      } else if (metric.duration > warningThreshold) {
        // Only log warnings for operations that are consistently slow
        // First-time operations (cold starts) are expected to be slower
        console.log(`[Performance] Slow operation: ${metric.name} took ${metric.duration.toFixed(2)}ms`, {
          metadata: metric.metadata,
        })
      }
    }
  }

  /**
   * Record component render
   */
  recordComponentRender(
    componentName: string,
    duration: number,
    propsChanged: boolean = false
  ) {
    const existing = this.componentMetrics.get(componentName) || {
      componentName,
      renderCount: 0,
      totalRenderTime: 0,
      averageRenderTime: 0,
      minRenderTime: Infinity,
      maxRenderTime: 0,
      renders: [],
    }

    existing.renderCount++
    existing.totalRenderTime += duration
    existing.averageRenderTime = existing.totalRenderTime / existing.renderCount
    existing.minRenderTime = Math.min(existing.minRenderTime, duration)
    existing.maxRenderTime = Math.max(existing.maxRenderTime, duration)
    existing.renders.push({
      timestamp: Date.now(),
      duration,
      propsChanged,
    })

    // Keep last 50 renders
    if (existing.renders.length > 50) {
      existing.renders = existing.renders.slice(-50)
    }

    this.componentMetrics.set(componentName, existing)
  }

  /**
   * Get metrics for a specific operation
   */
  getMetrics(name: string): PerformanceMetric[] {
    return this.metrics.filter((m) => m.name === name)
  }

  /**
   * Get component metrics
   */
  getComponentMetrics(componentName?: string): ComponentRenderMetrics | Map<string, ComponentRenderMetrics> {
    if (componentName) {
      return this.componentMetrics.get(componentName) || {
        componentName,
        renderCount: 0,
        totalRenderTime: 0,
        averageRenderTime: 0,
        minRenderTime: 0,
        maxRenderTime: 0,
        renders: [],
      }
    }
    return new Map(this.componentMetrics)
  }

  /**
   * Get slowest operations
   */
  getSlowestOperations(limit: number = 10): PerformanceMetric[] {
    return [...this.metrics]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit)
  }

  /**
   * Get statistics
   */
  getStats() {
    const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0)
    const averageDuration = this.metrics.length > 0 ? totalDuration / this.metrics.length : 0

    return {
      totalMetrics: this.metrics.length,
      totalDuration,
      averageDuration,
      slowestOperation: this.metrics.length > 0
        ? this.metrics.reduce((max, m) => (m.duration > max.duration ? m : max))
        : null,
      componentCount: this.componentMetrics.size,
    }
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics = []
    this.componentMetrics.clear()
  }

  /**
   * Export metrics as JSON
   */
  exportMetrics() {
    return {
      metrics: this.metrics,
      componentMetrics: Object.fromEntries(this.componentMetrics),
      stats: this.getStats(),
    }
  }
}

// Global profiler instance
export const profiler = new PerformanceProfiler()

/**
 * React hook for measuring component render performance
 * Note: This requires React to be available. Import React in files that use this.
 */
export function usePerformanceMeasure(componentName: string) {
  if (typeof window === 'undefined') {
    return { measureRender: () => () => {} }
  }

  const measureRender = (propsChanged: boolean = false) => {
    const start = performance.now()

    return () => {
      const duration = performance.now() - start
      profiler.recordComponentRender(componentName, duration, propsChanged)
    }
  }

  return { measureRender }
}

