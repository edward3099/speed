/**
 * Distributed Cache Implementation
 * 
 * Supports multiple backends:
 * - Vercel KV (if on Vercel)
 * - Upstash Redis (serverless Redis)
 * - Redis (standard Redis)
 * - In-memory (fallback)
 * 
 * Automatically detects available backend and uses the best one
 */

interface CacheAdapter {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}

/**
 * In-memory cache adapter (fallback)
 */
class InMemoryAdapter implements CacheAdapter {
  private cache = new Map<string, { value: any; expires: number }>()

  async get<T>(key: string): Promise<T | null> {
    const item = this.cache.get(key)
    if (!item) return null

    if (item.expires > 0 && Date.now() > item.expires) {
      this.cache.delete(key)
      return null
    }

    return item.value as T
  }

  async set<T>(key: string, value: T, ttlMs: number = 0): Promise<void> {
    const expires = ttlMs > 0 ? Date.now() + ttlMs : 0
    this.cache.set(key, { value, expires })
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key)
  }

  async clear(): Promise<void> {
    this.cache.clear()
  }
}

/**
 * Vercel KV adapter
 */
class VercelKVAdapter implements CacheAdapter {
  private kv: any

  constructor() {
    try {
      // @ts-ignore - Vercel KV is optional
      this.kv = require('@vercel/kv')
    } catch {
      this.kv = null
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.kv) return null
    try {
      return await this.kv.get(key)
    } catch (error) {
      console.error('Vercel KV get error:', error)
      return null
    }
  }

  async set<T>(key: string, value: T, ttlMs: number = 0): Promise<void> {
    if (!this.kv) return
    try {
      if (ttlMs > 0) {
        await this.kv.set(key, value, { ex: Math.ceil(ttlMs / 1000) })
      } else {
        await this.kv.set(key, value)
      }
    } catch (error) {
      console.error('Vercel KV set error:', error)
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.kv) return
    try {
      await this.kv.del(key)
    } catch (error) {
      console.error('Vercel KV delete error:', error)
    }
  }

  async clear(): Promise<void> {
    // Vercel KV doesn't support clear - would need to track keys
    console.warn('Vercel KV clear not supported')
  }
}

/**
 * Redis adapter (Upstash or standard Redis)
 */
class RedisAdapter implements CacheAdapter {
  private redis: any
  private isUpstash: boolean = false

  constructor() {
    try {
      // Try Upstash Redis first (serverless-friendly)
      const { Redis } = require('@upstash/redis')
      this.redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
      this.isUpstash = true
    } catch {
      try {
        // Fallback to standard Redis
        const redis = require('redis')
        const client = redis.createClient({
          url: process.env.REDIS_URL,
        })
        client.connect()
        this.redis = client
        this.isUpstash = false
      } catch {
        this.redis = null
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) return null
    try {
      const value = await this.redis.get(key)
      return value ? JSON.parse(value) : null
    } catch (error) {
      console.error('Redis get error:', error)
      return null
    }
  }

  async set<T>(key: string, value: T, ttlMs: number = 0): Promise<void> {
    if (!this.redis) return
    try {
      const serialized = JSON.stringify(value)
      if (ttlMs > 0) {
        if (this.isUpstash) {
          await this.redis.set(key, serialized, { ex: Math.ceil(ttlMs / 1000) })
        } else {
          await this.redis.setEx(key, Math.ceil(ttlMs / 1000), serialized)
        }
      } else {
        await this.redis.set(key, serialized)
      }
    } catch (error) {
      console.error('Redis set error:', error)
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.redis) return
    try {
      await this.redis.del(key)
    } catch (error) {
      console.error('Redis delete error:', error)
    }
  }

  async clear(): Promise<void> {
    if (!this.redis) return
    try {
      if (this.isUpstash) {
        // Upstash doesn't support FLUSHDB - would need to track keys
        console.warn('Upstash Redis clear not supported')
      } else {
        await this.redis.flushDb()
      }
    } catch (error) {
      console.error('Redis clear error:', error)
    }
  }
}

/**
 * Distributed Cache Manager
 * 
 * Automatically selects the best available cache backend
 */
class DistributedCache {
  private adapter: CacheAdapter
  private adapterName: string
  private fallbackAdapter: InMemoryAdapter
  private metrics = {
    hits: 0,
    misses: 0,
    errors: 0,
  }

  constructor() {
    this.fallbackAdapter = new InMemoryAdapter()

    // Try to initialize distributed cache
    if (process.env.KV_URL || process.env.KV_REST_API_URL) {
      // Vercel KV
      const kvAdapter = new VercelKVAdapter()
      if (kvAdapter['kv']) {
        this.adapter = kvAdapter
        this.adapterName = 'Vercel KV'
        return
      }
    }

    if (process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL) {
      // Redis
      const redisAdapter = new RedisAdapter()
      if (redisAdapter['redis']) {
        this.adapter = redisAdapter
        this.adapterName = redisAdapter['isUpstash'] ? 'Upstash Redis' : 'Redis'
        return
      }
    }

    // Fallback to in-memory
    this.adapter = this.fallbackAdapter
    this.adapterName = 'In-Memory (fallback)'

    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️ Using in-memory cache in production - consider setting up Vercel KV or Redis')
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.adapter.get<T>(key)
      if (value !== null) {
        this.metrics.hits++
        return value
      } else {
        this.metrics.misses++
        return null
      }
    } catch (error) {
      this.metrics.errors++
      console.error('Cache get error:', error)
      // Try fallback if not already using it
      if (this.adapter !== this.fallbackAdapter) {
        try {
          return await this.fallbackAdapter.get<T>(key)
        } catch {
          return null
        }
      }
      return null
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttlMs: number = 0): Promise<void> {
    try {
      await this.adapter.set(key, value, ttlMs)
    } catch (error) {
      this.metrics.errors++
      console.error('Cache set error:', error)
      // Try fallback if not already using it
      if (this.adapter !== this.fallbackAdapter) {
        try {
          await this.fallbackAdapter.set(key, value, ttlMs)
        } catch {
          // Ignore fallback errors
        }
      }
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    try {
      await this.adapter.delete(key)
      // Also delete from fallback if using distributed
      if (this.adapter !== this.fallbackAdapter) {
        await this.fallbackAdapter.delete(key)
      }
    } catch (error) {
      console.error('Cache delete error:', error)
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    try {
      await this.adapter.clear()
      await this.fallbackAdapter.clear()
    } catch (error) {
      console.error('Cache clear error:', error)
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics() {
    const total = this.metrics.hits + this.metrics.misses
    return {
      adapter: this.adapterName,
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      errors: this.metrics.errors,
      hitRate: total > 0 ? (this.metrics.hits / total).toFixed(2) : '0.00',
    }
  }
}

// Singleton instance
let distributedCacheInstance: DistributedCache | null = null

/**
 * Get distributed cache instance
 */
export function getDistributedCache(): DistributedCache {
  if (!distributedCacheInstance) {
    distributedCacheInstance = new DistributedCache()
  }
  return distributedCacheInstance
}

/**
 * Cache interface matching simple-cache for easy migration
 */
export const distributedCache = {
  get: <T>(key: string): T | null => {
    // Synchronous interface for compatibility
    // Note: This will only work with in-memory cache
    // For distributed cache, use async methods
    const cache = getDistributedCache()
    if (cache['adapter'] instanceof InMemoryAdapter) {
      // Synchronous access for in-memory
      return cache['adapter']['cache'].get(key)?.value as T || null
    }
    // For distributed, return null and log warning
    console.warn('Synchronous cache.get() called with distributed cache - use async methods')
    return null
  },

  set: <T>(key: string, value: T, ttlMs: number = 0): void => {
    const cache = getDistributedCache()
    if (cache['adapter'] instanceof InMemoryAdapter) {
      // Synchronous access for in-memory
      const expires = ttlMs > 0 ? Date.now() + ttlMs : 0
      cache['adapter']['cache'].set(key, { value, expires })
    } else {
      // For distributed, set asynchronously (fire and forget)
      cache.set(key, value, ttlMs).catch(err => {
        console.error('Async cache set error:', err)
      })
    }
  },

  delete: (key: string): void => {
    const cache = getDistributedCache()
    if (cache['adapter'] instanceof InMemoryAdapter) {
      cache['adapter']['cache'].delete(key)
    } else {
      cache.delete(key).catch(err => {
        console.error('Async cache delete error:', err)
      })
    }
  },

  clear: (): void => {
    const cache = getDistributedCache()
    cache.clear().catch(err => {
      console.error('Async cache clear error:', err)
    })
  },
}
