/**
 * Retry utility with exponential backoff
 */

export interface RetryOptions {
  maxAttempts?: number
  initialDelayMs?: number
  maxDelayMs?: number
  backoffMultiplier?: number
  retryableErrors?: string[]
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'],
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: any, retryableErrors: string[]): boolean {
  if (!error) return false

  const errorMessage = error.message?.toUpperCase() || ''
  const errorCode = error.code?.toUpperCase() || ''

  return retryableErrors.some(
    (retryable) =>
      errorMessage.includes(retryable) || errorCode.includes(retryable)
  )
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: any

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error

      // Don't retry on last attempt
      if (attempt === opts.maxAttempts) {
        throw error
      }

      // Check if error is retryable
      if (!isRetryableError(error, opts.retryableErrors)) {
        throw error
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      )

      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.3 * delay
      const totalDelay = delay + jitter

      await sleep(totalDelay)
    }
  }

  throw lastError
}

/**
 * Retry with custom condition
 */
export async function retryWithCondition<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: any, attempt: number) => boolean,
  options: Omit<RetryOptions, 'retryableErrors'> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: any

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error

      // Don't retry on last attempt
      if (attempt === opts.maxAttempts) {
        throw error
      }

      // Check custom condition
      if (!shouldRetry(error, attempt)) {
        throw error
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      )

      const jitter = Math.random() * 0.3 * delay
      const totalDelay = delay + jitter

      await sleep(totalDelay)
    }
  }

  throw lastError
}
