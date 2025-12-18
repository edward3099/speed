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

    // Function to check if error should be filtered (harmless LiveKit/WebRTC errors)
    const shouldFilterError = (args: any[]): boolean => {
      const errorString = args.join(' ')
      
      // Filter AbortError - this is expected when multiple play() calls happen
      // It's not an error, just normal browser behavior
      if (errorString.includes('The operation was aborted') || 
          errorString.includes('AbortError') ||
          errorString.includes('operation was aborted')) {
        return true
      }
      
      // Check all args for LiveKit error objects (details might be in any position)
      let hasLiveKitErrorObject = false
      for (const arg of args) {
        if (typeof arg === 'object' && arg !== null) {
          // Check if it's a LiveKit error object with room property
          if ('room' in arg || 'roomID' in arg || 'participant' in arg) {
            // Check for harmless error indicators
            if (('event' in arg && arg.event?.isTrusted === true) ||
                ('error' in arg && Object.keys(arg.error || {}).length === 0) ||
                errorString.includes('DataChannel')) {
              hasLiveKitErrorObject = true
              break
            }
          }
          // Check if it's an AbortError DOMException
          if (arg instanceof DOMException && arg.name === 'AbortError') {
            return true
          }
          // Check if error object has name property indicating AbortError
          if ('name' in arg && arg.name === 'AbortError') {
            return true
          }
        }
        // Check if it's an Error with AbortError name
        if (arg instanceof Error && arg.name === 'AbortError') {
          return true
        }
      }
      
      const firstArg = args[0]
      const firstArgString = typeof firstArg === 'object' && firstArg !== null 
        ? JSON.stringify(firstArg) 
        : String(firstArg || '')
      
      // Filter AbortError - this is expected when multiple play() calls happen
      // It's not an error, just normal browser behavior
      const isAbortError = 
        errorString.includes('The operation was aborted') || 
        errorString.includes('AbortError') ||
        errorString.includes('operation was aborted') ||
        (errorString.includes('Error playing') && errorString.includes('aborted')) ||
        (errorString.includes('ref callback') && errorString.includes('aborted')) ||
        (errorString.includes('enableCameraAndMic') && errorString.includes('aborted')) ||
        (errorString.includes('updateLocalTracks') && errorString.includes('aborted'))
      
      // Check args for AbortError objects
      let hasAbortError = false
      if (!isAbortError) {
        for (const arg of args) {
          if (typeof arg === 'object' && arg !== null) {
            // Check if it's an AbortError DOMException
            if (arg instanceof DOMException && arg.name === 'AbortError') {
              hasAbortError = true
              break
            }
            // Check if error object has name property indicating AbortError
            if ('name' in arg && arg.name === 'AbortError') {
              hasAbortError = true
              break
            }
          }
          // Check if it's an Error with AbortError name
          if (arg instanceof Error && arg.name === 'AbortError') {
            hasAbortError = true
            break
          }
        }
      }
      
      // Filter LiveKit/WebRTC errors that are harmless
      const isLiveKitError = 
        errorString.includes('Unknown DataChannel error') ||
        errorString.includes('DataChannel error') ||
        (errorString.includes('DataChannel') && (firstArg?.event?.isTrusted === true || hasLiveKitErrorObject)) ||
        errorString.includes('error sending signal message') ||
        errorString.includes('signal message') ||
        errorString.includes('abort transport connection') ||
        errorString.includes('createOffer') ||
        errorString.includes('closed peer connection') ||
        errorString.includes('signal disconnected') ||
        errorString.includes('websocket closed') ||
        errorString.includes('could not fetch region settings') || // LiveKit region settings are optional
        errorString.includes('region settings') ||
        errorString.includes('Real-time subscription error') || // These are handled with reconnection
        errorString.includes('CHANNEL_ERROR') ||
        errorString.includes('Real-time subscription timed out') ||
        errorString.includes('TIMED_OUT') ||
        errorString.includes('Video element not in DOM yet') || // These are handled with retries
        errorString.includes('Video element has zero dimensions') || // These are handled
        errorString.includes('remoteVideoRef.current is null') || // These are handled with retries
        errorString.includes('Track is already ended') || // These are expected
        errorString.includes('track.attach() failed') || // Fallback is implemented
        errorString.includes('Error playing after attach') || // These are handled
        errorString.includes('Error subscribing to') || // Retry logic handles this
        errorString.includes('could not find local track subscription') || // LiveKit internal warning during cleanup
        errorString.includes('local track subscription') || // LiveKit internal warnings
        errorString.includes('Remote video suspended') || // Resume logic handles this
        errorString.includes('video suspended') || // Resume logic handles this
        errorString.includes('WebRTC engine not ready') || // Engine ready check handles this
        hasLiveKitErrorObject ||
        (typeof firstArg === 'object' && firstArg !== null && 'room' in firstArg && (
          ('error' in firstArg && Object.keys(firstArg.error || {}).length === 0) ||
          ('event' in firstArg && firstArg.event?.isTrusted === true) ||
          (errorString.includes('DataChannel') && firstArg.event?.isTrusted === true)
        ))

      // Filter RPC errors that have retry logic
      const isRpcError = 
        errorString.includes('RPC failed') ||
        errorString.includes('Error fetching') && errorString.includes('RPC') ||
        errorString.includes('Countdown RPC failed') ||
        errorString.includes('time remaining from RPC')

      // Filter devtools errors
      const isDevtoolsError = 
        errorString.includes('NODE_OPTIONs are not supported') ||
        errorString.includes('electron/shell/common/node_bindings')

      return isAbortError || hasAbortError || isLiveKitError || isRpcError || isDevtoolsError
    }

    // Function to add error to log
    const addError = (message: string, details?: any, type: 'error' | 'warn' | 'log' = 'error') => {
      // Skip filtering for harmless LiveKit/WebRTC errors
      const args = details ? [message, details] : [message]
      if (shouldFilterError(args)) {
        return // Don't log filtered errors
      }

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
      // Filter out harmless LiveKit/WebRTC errors before logging
      if (!shouldFilterError(args)) {
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
      }
      // Call original to preserve normal console behavior (SuppressDevtoolsErrors will filter it)
      originalError.apply(console, args)
    }

    // Override console.warn - capture warning, then call original
    console.warn = (...args: any[]) => {
      // Filter out harmless LiveKit/WebRTC warnings before logging
      if (!shouldFilterError(args)) {
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
      }
      // Call original to preserve normal console behavior (SuppressDevtoolsErrors will filter it)
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
      // Filter out harmless LiveKit/WebRTC errors
      const errorMessage = event.message || event.error?.message || ''
      if (errorMessage.includes('DataChannel') || 
          errorMessage.includes('WebRTC') ||
          errorMessage.includes('LiveKit')) {
        // Check if it's a harmless error
        const args = [errorMessage, event]
        if (shouldFilterError(args)) {
          return // Skip logging filtered errors
        }
      }
      
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
      // Silently copy - no console log to reduce noise
    } catch (err) {
      const textarea = document.createElement('textarea')
      textarea.value = allErrors
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      // Silently copy - no console log to reduce noise
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

