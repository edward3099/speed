/**
 * Simple In-Memory Cache
 * 
 * Provides caching for frequently accessed data to reduce database load
 * Critical for supporting 500+ concurrent users
 */

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

class SimpleCache {
  private cache: Map<string, CacheEntry<any>> = new Map()
  private readonly defaultTTL: number

  constructor(defaultTTL: number = 30000) {
    // Default TTL: 30 seconds
    this.defaultTTL = defaultTTL
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    
    if (!entry) {
      return null
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl || this.defaultTTL)
    this.cache.set(key, { data: value, expiresAt })
  }

  /**
   * Delete value from cache
   */
  delete(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Clean expired entries
   */
  clean(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size
  }
}

// Singleton cache instance
let globalCache: SimpleCache | null = null

/**
 * Get the global cache instance
 */
export function getCache(): SimpleCache {
  if (!globalCache) {
    globalCache = new SimpleCache(
      parseInt(process.env.CACHE_TTL || '30000', 10)
    )
    
    // Clean expired entries every minute
    setInterval(() => {
      globalCache?.clean()
    }, 60000)
  }
  return globalCache
}

/**
 * Reset the global cache (useful for testing)
 */
export function resetCache() {
  if (globalCache) {
    globalCache.clear()
  }
  globalCache = null
}
