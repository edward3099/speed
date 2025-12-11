/**
 * Production-Safe Logger
 * 
 * Only logs in development, silent in production
 * Use this instead of console.log/error/warn for production code
 */

const isDevelopment = process.env.NODE_ENV === 'development'

export const logger = {
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args)
    }
  },
  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args)
    }
  },
  error: (...args: any[]) => {
    // Always log errors, but can be filtered by error tracking service
    if (isDevelopment) {
      console.error(...args)
    }
    // In production, errors should go to error tracking (Sentry, etc.)
  },
  info: (...args: any[]) => {
    if (isDevelopment) {
      console.info(...args)
    }
  },
  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.debug(...args)
    }
  },
}


