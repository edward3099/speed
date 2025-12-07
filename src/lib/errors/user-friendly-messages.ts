/**
 * User-Friendly Error Messages
 * 
 * Maps technical errors to user-friendly messages
 */

export interface ErrorContext {
  error: Error | string
  code?: string
  action?: string
  retryable?: boolean
}

export interface UserFriendlyError {
  title: string
  message: string
  helpText?: string
  action?: {
    label: string
    onClick: () => void
  }
  retryable: boolean
}

/**
 * Map error to user-friendly message
 */
export function getUserFriendlyError(context: ErrorContext): UserFriendlyError {
  const error = typeof context.error === 'string' ? new Error(context.error) : context.error
  const errorName = error.name || ''
  const errorMessage = error.message || String(context.error) || 'An unexpected error occurred'
  const errorCode = context.code || errorName

  // Permission errors
  if (errorName === 'NotAllowedError' || errorMessage.includes('permission denied')) {
    return {
      title: 'Permission Denied',
      message: 'Camera/microphone permission was denied. Please allow access in your browser settings and try again.',
      helpText: 'Click the lock icon in your browser\'s address bar to manage permissions.',
      retryable: true,
    }
  }

  // Not found errors
  if (errorName === 'NotFoundError' || errorMessage.includes('not found') || errorMessage.includes('No camera') || errorMessage.includes('No microphone')) {
    return {
      title: 'Device Not Found',
      message: 'No camera or microphone was found. Please check that your device has a camera/microphone connected.',
      helpText: 'Make sure your camera and microphone are properly connected and not being used by another application.',
      retryable: true,
    }
  }

  // Network errors
  if (errorName === 'NetworkError' || errorMessage.includes('network') || errorMessage.includes('fetch failed') || errorMessage.includes('Failed to fetch')) {
    return {
      title: 'Connection Error',
      message: 'Unable to connect to the server. Please check your internet connection and try again.',
      helpText: 'If the problem persists, try refreshing the page.',
      retryable: true,
      action: {
        label: 'Retry',
        onClick: () => window.location.reload(),
      },
    }
  }

  // HTTPS required errors
  if (errorMessage.includes('HTTPS') || errorMessage.includes('localhost') || errorMessage.includes('secure context')) {
    return {
      title: 'Secure Connection Required',
      message: 'Camera and microphone require a secure connection (HTTPS) or localhost. Please use HTTPS or run locally.',
      helpText: 'Camera and microphone access is only available on secure connections.',
      retryable: false,
    }
  }

  // WebRTC errors
  if (errorMessage.includes('WebRTC') || errorMessage.includes('peer connection') || errorMessage.includes('createOffer')) {
    return {
      title: 'Connection Issue',
      message: 'There was a problem establishing the video connection. Please try again.',
      helpText: 'This is usually temporary. Try refreshing the page.',
      retryable: true,
      action: {
        label: 'Retry',
        onClick: () => window.location.reload(),
      },
    }
  }

  // Authentication errors
  if (errorMessage.includes('Unauthorized') || errorMessage.includes('authentication') || errorMessage.includes('401')) {
    return {
      title: 'Authentication Required',
      message: 'Please sign in to continue.',
      helpText: 'Your session may have expired. Please sign in again.',
      retryable: false,
      action: {
        label: 'Sign In',
        onClick: () => {
          window.location.href = '/'
        },
      },
    }
  }

  // Rate limiting errors
  if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests') || errorMessage.includes('429')) {
    return {
      title: 'Too Many Requests',
      message: 'You\'re making requests too quickly. Please wait a moment and try again.',
      helpText: 'This helps us maintain service quality for all users.',
      retryable: true,
    }
  }

  // Server errors
  if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error') || errorMessage.includes('server error')) {
    return {
      title: 'Server Error',
      message: 'Something went wrong on our end. We\'ve been notified and are working on it.',
      helpText: 'Please try again in a few moments. If the problem persists, contact support.',
      retryable: true,
      action: {
        label: 'Report Issue',
        onClick: () => {
          // Could open support form or email
          window.open('mailto:support@example.com?subject=Server Error Report', '_blank')
        },
      },
    }
  }

  // Validation errors
  if (errorMessage.includes('validation') || errorMessage.includes('invalid') || errorMessage.includes('required')) {
    return {
      title: 'Invalid Input',
      message: errorMessage || 'Please check your input and try again.',
      helpText: 'Make sure all required fields are filled correctly.',
      retryable: false,
    }
  }

  // Generic error
  return {
    title: 'Something Went Wrong',
    message: errorMessage || 'An unexpected error occurred. Please try again.',
    helpText: 'If this problem continues, please contact support.',
    retryable: context.retryable ?? true,
    action: {
      label: 'Report Issue',
      onClick: () => {
        window.open('mailto:support@example.com?subject=Error Report', '_blank')
      },
    },
  }
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: Error | string): boolean {
  const errorObj = typeof error === 'string' ? new Error(error) : error
  const message = errorObj.message || String(error)
  const name = errorObj.name || ''

  // Non-retryable errors
  if (name === 'NotAllowedError' || message.includes('permission denied')) {
    return false // User needs to change settings
  }

  if (message.includes('HTTPS') || message.includes('secure context')) {
    return false // Requires environment change
  }

  // Retryable errors
  if (name === 'NetworkError' || message.includes('network') || message.includes('fetch failed')) {
    return true
  }

  if (message.includes('500') || message.includes('server error')) {
    return true
  }

  // Default to retryable
  return true
}
