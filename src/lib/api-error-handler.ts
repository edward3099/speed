/**
 * Standardized API Error Handling
 * 
 * Provides consistent error handling, logging, and response formatting
 * across all API routes.
 */

interface ErrorContext {
  route?: string
  userId?: string
  metadata?: Record<string, any>
}

interface ErrorResponse {
  error: string
  details?: string
  timestamp?: string
}

/**
 * Logs error in development environment only
 */
export function logError(error: unknown, context?: ErrorContext): void {
  if (process.env.NODE_ENV !== 'development') {
    return
  }

  const errorInfo = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
    ...context,
  }

  console.error('API Error:', errorInfo)
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  error: unknown,
  statusCode: number = 500,
  context?: ErrorContext
): { error: string; details?: string; timestamp?: string } {
  const isDevelopment = process.env.NODE_ENV === 'development'
  
  const message = error instanceof Error ? error.message : String(error)
  
  return {
    error: statusCode >= 500 ? 'Internal server error' : message,
    ...(isDevelopment && { details: message }),
    ...(isDevelopment && { timestamp: new Date().toISOString() }),
  }
}

/**
 * Handles API errors with standardized logging and response
 */
export function handleApiError(
  error: unknown,
  context?: ErrorContext
): { status: number; response: ErrorResponse } {
  // Log error in development
  logError(error, context)

  // Determine status code
  let status = 500
  if (error instanceof Error) {
    // Check for known error types
    if (error.message.includes('Unauthorized') || error.message.includes('authentication')) {
      status = 401
    } else if (error.message.includes('Forbidden')) {
      status = 403
    } else if (error.message.includes('Not found')) {
      status = 404
    } else if (error.message.includes('validation') || error.message.includes('required')) {
      status = 400
    }
  }

  // Create standardized response
  const response = createErrorResponse(error, status, context)

  return { status, response }
}






























