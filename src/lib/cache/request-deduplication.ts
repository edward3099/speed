/**
 * Request Deduplication
 * 
 * Prevents multiple concurrent requests for the same resource
 * Reuses the same promise for concurrent requests
 */

const pendingRequests = new Map<string, Promise<any>>()

/**
 * Deduplicate concurrent requests
 * If a request for the same key is already in progress, reuse the same promise
 */
export async function deduplicateRequest<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  // If there's already a pending request for this key, reuse it
  const existing = pendingRequests.get(key)
  if (existing) {
    return existing as Promise<T>
  }

  // Create new request
  const promise = fn().finally(() => {
    // Clean up after request completes
    pendingRequests.delete(key)
  })

  // Store pending request
  pendingRequests.set(key, promise)

  return promise
}

/**
 * Clear pending requests (useful for testing)
 */
export function clearPendingRequests() {
  pendingRequests.clear()
}

