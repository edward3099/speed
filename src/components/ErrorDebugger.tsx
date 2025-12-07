"use client"

import { useEffect, useState, useRef, startTransition } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Copy, Trash2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react"

interface ErrorLog {
  id: string
  timestamp: Date
  message: string
  stack?: string
  source?: string
  details?: any
}

function ErrorDebugger() {
  const [errors, setErrors] = useState<ErrorLog[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(true)
  const errorsRef = useRef<ErrorLog[]>([])

  useEffect(() => {
    // Store original console methods (get them before any other component overrides them)
    const originalError = console.error
    const originalWarn = console.warn
    const originalLog = console.log

    // Function to add error to log
    const addError = (message: string, details?: any, type: 'error' | 'warn' | 'log' = 'error') => {
      const errorLog: ErrorLog = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
        message: typeof message === 'string' ? message : JSON.stringify(message),
        stack: details?.stack || (details instanceof Error ? details.stack : undefined),
        source: details?.source || type,
        details: details
      }
      
      errorsRef.current = [errorLog, ...errorsRef.current].slice(0, 50) // Keep last 50 errors
      // Defer state update to avoid updating during render
      startTransition(() => {
        setErrors([...errorsRef.current])
      })
    }

    // Override console.error - capture error, then call original
    console.error = (...args: any[]) => {
      const message = args.map(arg => {
        if (typeof arg === 'string') return arg
        if (arg instanceof Error) return arg.message
        try {
          return JSON.stringify(arg, null, 2)
        } catch {
          return String(arg)
        }
      }).join(' ')
      addError(message, args[0] || args, 'error')
      // Call original to preserve normal console behavior
      originalError.apply(console, args)
    }

    // Override console.warn - capture warning, then call original
    console.warn = (...args: any[]) => {
      const message = args.map(arg => {
        if (typeof arg === 'string') return arg
        if (arg instanceof Error) return arg.message
        try {
          return JSON.stringify(arg, null, 2)
        } catch {
          return String(arg)
        }
      }).join(' ')
      addError(message, args[0] || args, 'warn')
      // Call original to preserve normal console behavior
      originalWarn.apply(console, args)
    }

    // Override console.log - only capture if it looks like an error
    console.log = (...args: any[]) => {
      // Call original first to preserve normal console behavior
      originalLog.apply(console, args)
      // Only log if it looks like an error
      const message = args.join(' ')
      if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
        addError(message, args, 'log')
      }
    }

    // Global error handler
    const handleError = (event: ErrorEvent) => {
      addError(event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
        stack: event.error?.stack
      }, 'error')
    }

    // Global unhandled rejection handler
    const handleRejection = (event: PromiseRejectionEvent) => {
      addError(`Unhandled Promise Rejection: ${event.reason}`, {
        reason: event.reason,
        stack: event.reason?.stack
      }, 'error')
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      console.error = originalError
      console.warn = originalWarn
      console.log = originalLog
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  const copyError = async (error: ErrorLog) => {
    const errorText = `Error: ${error.message}\n\n` +
      `Time: ${error.timestamp.toLocaleString()}\n` +
      `Source: ${error.source}\n` +
      (error.stack ? `Stack: ${error.stack}\n` : '') +
      (error.details ? `Details: ${JSON.stringify(error.details, null, 2)}\n` : '')
    
    try {
      await navigator.clipboard.writeText(errorText)
      // Show brief feedback
      const button = document.getElementById(`copy-${error.id}`)
      if (button) {
        const original = button.innerHTML
        button.innerHTML = '✓'
        setTimeout(() => {
          button.innerHTML = original
        }, 1000)
      }
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = errorText
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  }

  const copyAllErrors = async () => {
    const allErrors = errors.map(error => 
      `[${error.timestamp.toLocaleString()}] ${(error.source || 'unknown').toUpperCase()}: ${error.message}\n` +
      (error.stack ? `Stack: ${error.stack}\n` : '') +
      (error.details ? `Details: ${JSON.stringify(error.details, null, 2)}\n` : '') +
      '\n---\n\n'
    ).join('')
    
    try {
      await navigator.clipboard.writeText(allErrors)
      // Silently copy - no need for alert in debug tool
      console.log('All errors copied to clipboard!')
    } catch (err) {
      const textarea = document.createElement('textarea')
      textarea.value = allErrors
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      // Silently copy - no need for alert in debug tool
      console.log('All errors copied to clipboard!')
    }
  }

  const clearErrors = () => {
    setErrors([])
    errorsRef.current = []
  }

  if (errors.length === 0 && !isOpen) return null

  return (
    <>
      {/* Toggle Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 p-3 bg-red-500/90 hover:bg-red-600 rounded-full shadow-lg backdrop-blur-sm border-2 border-red-400/50"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
      >
        <AlertCircle className="w-5 h-5 text-white" />
        {errors.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-white text-red-600 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {errors.length > 9 ? '9+' : errors.length}
          </span>
        )}
      </motion.button>

      {/* Debugger Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed bottom-4 right-4 z-50 bg-black/95 backdrop-blur-md border-2 border-red-500/50 rounded-lg shadow-2xl"
            style={{
              width: isMinimized ? '280px' : '320px',
              height: isMinimized ? '120px' : '400px',
              maxHeight: '400px'
            }}
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-2 border-b border-red-500/30">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-xs font-semibold text-white">
                  Errors ({errors.length})
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-1 hover:bg-white/10 rounded"
                >
                  {isMinimized ? (
                    <ChevronUp className="w-4 h-4 text-white" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-white" />
                  )}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-white/10 rounded"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Content */}
            {!isMinimized && (
              <div className="flex flex-col h-[calc(100%-40px)]">
                {/* Actions */}
                <div className="flex gap-2 p-2 border-b border-red-500/30">
                  <button
                    onClick={copyAllErrors}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 text-xs rounded border border-teal-500/50"
                  >
                    <Copy className="w-3 h-3" />
                    Copy All
                  </button>
                  <button
                    onClick={clearErrors}
                    className="flex items-center justify-center gap-1 px-2 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs rounded border border-red-500/50"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {/* Error List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {errors.length === 0 ? (
                    <div className="text-center text-white/50 text-xs py-4">
                      No errors logged
                    </div>
                  ) : (
                    errors.map((error) => (
                      <motion.div
                        key={error.id}
                        className="bg-white/5 rounded p-2 border border-red-500/20"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-red-300 font-medium truncate">
                              {error.message}
                            </div>
                            <div className="text-[10px] text-white/40 mt-0.5">
                              {error.timestamp.toLocaleTimeString()} • {error.source}
                            </div>
                          </div>
                          <button
                            id={`copy-${error.id}`}
                            onClick={() => copyError(error)}
                            className="p-1 hover:bg-white/10 rounded flex-shrink-0"
                            title="Copy error"
                          >
                            <Copy className="w-3 h-3 text-white/60" />
                          </button>
                        </div>
                        {error.stack && (
                          <details className="mt-1">
                            <summary className="text-[10px] text-white/50 cursor-pointer">
                              Stack trace
                            </summary>
                            <pre className="text-[10px] text-white/60 mt-1 overflow-x-auto whitespace-pre-wrap break-words">
                              {error.stack}
                            </pre>
                          </details>
                        )}
                        {error.details && typeof error.details === 'object' && (
                          <details className="mt-1">
                            <summary className="text-[10px] text-white/50 cursor-pointer">
                              Details
                            </summary>
                            <pre className="text-[10px] text-white/60 mt-1 overflow-x-auto whitespace-pre-wrap break-words">
                              {JSON.stringify(error.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </motion.div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Minimized View */}
            {isMinimized && (
              <div className="p-2">
                <div className="text-xs text-white/70 mb-2">
                  {errors.length > 0 ? (
                    <div className="truncate">{errors[0].message}</div>
                  ) : (
                    <div>No errors</div>
                  )}
                </div>
                <button
                  onClick={copyAllErrors}
                  className="w-full px-2 py-1 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 text-xs rounded border border-teal-500/50"
                >
                  Copy All
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default ErrorDebugger
export { ErrorDebugger }

