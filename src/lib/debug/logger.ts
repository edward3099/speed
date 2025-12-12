/**
 * Structured Logging Utility
 * Uses Diary for fast, zero-dependency logging
 */

import { diary } from 'diary'

// Create logger instances for different contexts
// Diary automatically enables logging in development mode
export const logger = diary('app')
export const apiLogger = diary('api')
export const realtimeLogger = diary('realtime')
export const matchingLogger = diary('matching')
export const performanceLogger = diary('performance')

// Helper to log with context
export function logWithContext(
  loggerInstance: ReturnType<typeof diary>,
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  context?: Record<string, any>
) {
  const logMessage = context
    ? `${message} ${JSON.stringify(context)}`
    : message

  switch (level) {
    case 'info':
      loggerInstance.info(logMessage)
      break
    case 'warn':
      loggerInstance.warn(logMessage)
      break
    case 'error':
      loggerInstance.error(logMessage)
      break
    case 'debug':
      loggerInstance.debug(logMessage)
      break
  }
}

// Export convenience functions
export const log = {
  info: (message: string, context?: Record<string, any>) =>
    logWithContext(logger, 'info', message, context),
  warn: (message: string, context?: Record<string, any>) =>
    logWithContext(logger, 'warn', message, context),
  error: (message: string, context?: Record<string, any>) =>
    logWithContext(logger, 'error', message, context),
  debug: (message: string, context?: Record<string, any>) =>
    logWithContext(logger, 'debug', message, context),
}

export const logApi = {
  info: (message: string, context?: Record<string, any>) =>
    logWithContext(apiLogger, 'info', message, context),
  warn: (message: string, context?: Record<string, any>) =>
    logWithContext(apiLogger, 'warn', message, context),
  error: (message: string, context?: Record<string, any>) =>
    logWithContext(apiLogger, 'error', message, context),
  debug: (message: string, context?: Record<string, any>) =>
    logWithContext(apiLogger, 'debug', message, context),
}

export const logRealtime = {
  info: (message: string, context?: Record<string, any>) =>
    logWithContext(realtimeLogger, 'info', message, context),
  warn: (message: string, context?: Record<string, any>) =>
    logWithContext(realtimeLogger, 'warn', message, context),
  error: (message: string, context?: Record<string, any>) =>
    logWithContext(realtimeLogger, 'error', message, context),
  debug: (message: string, context?: Record<string, any>) =>
    logWithContext(realtimeLogger, 'debug', message, context),
}

export const logMatching = {
  info: (message: string, context?: Record<string, any>) =>
    logWithContext(matchingLogger, 'info', message, context),
  warn: (message: string, context?: Record<string, any>) =>
    logWithContext(matchingLogger, 'warn', message, context),
  error: (message: string, context?: Record<string, any>) =>
    logWithContext(matchingLogger, 'error', message, context),
  debug: (message: string, context?: Record<string, any>) =>
    logWithContext(matchingLogger, 'debug', message, context),
}

export const logPerformance = {
  info: (message: string, context?: Record<string, any>) =>
    logWithContext(performanceLogger, 'info', message, context),
  warn: (message: string, context?: Record<string, any>) =>
    logWithContext(performanceLogger, 'warn', message, context),
  error: (message: string, context?: Record<string, any>) =>
    logWithContext(performanceLogger, 'error', message, context),
  debug: (message: string, context?: Record<string, any>) =>
    logWithContext(performanceLogger, 'debug', message, context),
}

