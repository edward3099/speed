/**
 * Utility function to show errors using toast
 * Replaces alert() calls with user-friendly toast notifications
 */

import { getUserFriendlyError } from '@/lib/errors/user-friendly-messages'

// Global toast instance (will be set by ToastProvider)
let globalToast: {
  showError: (message: string, options?: { duration?: number; action?: { label: string; onClick: () => void } }) => string
  showWarning: (message: string, options?: { duration?: number }) => string
  showSuccess: (message: string, options?: { duration?: number }) => string
  showInfo: (message: string, options?: { duration?: number }) => string
} | null = null

/**
 * Set the global toast instance (called by ToastProvider)
 */
export function setGlobalToast(toast: typeof globalToast) {
  globalToast = toast
}

/**
 * Show error using toast (replaces alert)
 */
export function showError(error: Error | string, options?: {
  useFriendlyMessage?: boolean
  duration?: number
}) {
  if (!globalToast) {
    // Fallback to console if toast not available
    console.error('Toast not available:', error)
    if (typeof error === 'string') {
      alert(error) // Fallback to alert if toast not initialized
    } else {
      alert(error.message || 'An error occurred')
    }
    return
  }

  if (options?.useFriendlyMessage !== false) {
    const friendlyError = getUserFriendlyError({ error })
    globalToast.showError(friendlyError.message, {
      duration: options?.duration || (friendlyError.retryable ? 8000 : 5000),
      action: friendlyError.action,
    })
  } else {
    const message = typeof error === 'string' ? error : error.message || 'An error occurred'
    globalToast.showError(message, { duration: options?.duration })
  }
}

/**
 * Show warning using toast (replaces alert)
 */
export function showWarning(message: string, duration?: number) {
  if (!globalToast) {
    console.warn('Toast not available:', message)
    alert(message) // Fallback
    return
  }
  globalToast.showWarning(message, { duration })
}

/**
 * Show success using toast
 */
export function showSuccess(message: string, duration?: number) {
  if (!globalToast) {
    console.log('Toast not available:', message)
    return
  }
  globalToast.showSuccess(message, { duration })
}

/**
 * Show info using toast
 */
export function showInfo(message: string, duration?: number) {
  if (!globalToast) {
    console.log('Toast not available:', message)
    return
  }
  globalToast.showInfo(message, { duration })
}
