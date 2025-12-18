"use client"

import { useEffect } from "react"

/**
 * Suppresses Next.js devtools errors and LiveKit/WebRTC warnings on mobile devices
 * These errors are harmless and only occur in development or during normal WebRTC operations
 * Only active in development mode
 */
export function SuppressDevtoolsErrors() {
  // Only suppress in development
  if (process.env.NODE_ENV !== 'development') {
    return null
  }
  useEffect(() => {
    // Store original console methods
    const originalError = console.error
    const originalWarn = console.warn

    // Function to check if error/warning should be suppressed
    const shouldSuppress = (args: any[]): boolean => {
      const errorString = args.join(' ')
      const firstArg = args[0]
      
      // Check for LiveKit/WebRTC errors and warnings
      // Also check if firstArg is an object with 'room' property (LiveKit error format)
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
      
      const isLiveKitError = 
        errorString.includes('error sending signal message') ||
        errorString.includes('signal message') ||
        errorString.includes('Unknown DataChannel error') ||
        errorString.includes('DataChannel error') ||
        errorString.includes('on reliable') ||
        errorString.includes('on lossy') ||
        errorString.includes('skipping incoming track after Room disconnected') ||
        errorString.includes('abort transport connection') ||
        firstArgString.includes('abort transport connection') ||
        errorString.includes('could not createOffer with closed peer connection') ||
        errorString.includes('createOffer with closed peer connection') ||
        errorString.includes('createOffer') ||
        errorString.includes('closed peer connection') ||
        errorString.includes('reconnect disconnected') ||
        errorString.includes('Received leave request while trying to (re)connect') ||
        errorString.includes('Unexpected first message') ||
        errorString.includes('already attempting reconnect') ||
        errorString.includes('signal disconnected') ||
        errorString.includes('websocket closed') ||
        errorString.includes('peerconnection failed disconnected') ||
        errorString.includes('ping timeout') ||
        errorString.includes('Remote video waiting for data') ||
        errorString.includes('Remote video suspended') ||
        errorString.includes('navigator.mediaDevices.getUserMedia not available') ||
        errorString.includes('Not in secure context') ||
        (firstArg?.toString && firstArg.toString().includes('signal') && firstArg.toString().includes('message')) ||
        (typeof firstArg === 'object' && firstArg !== null && 'room' in firstArg && (
          ('error' in firstArg && Object.keys(firstArg.error || {}).length === 0) ||
          ('event' in firstArg && firstArg.event?.isTrusted === true) ||
          (errorString.includes('createOffer') && errorString.includes('closed')) ||
          (errorString.includes('DataChannel') && firstArg.event?.isTrusted === true) ||
          firstArgString.includes('abort transport connection') ||
          firstArgString.includes('transport connection') ||
          firstArgString.includes('websocket closed') ||
          firstArgString.includes('signal disconnected')
        ))

      // Check for devtools errors
      const isDevtoolsError = 
        errorString.includes('NODE_OPTIONs are not supported') ||
        errorString.includes('electron/shell/common/node_bindings')

      return isAbortError || hasAbortError || isLiveKitError || isDevtoolsError
    }

    // Override console.error to filter out LiveKit/WebRTC errors
    console.error = (...args: any[]) => {
      if (shouldSuppress(args)) {
        // Suppress from console - ErrorDebugger will still capture it
        return
      }
      // Call original console.error for all other errors
      originalError.apply(console, args)
    }

    // Override console.warn to filter out LiveKit/WebRTC warnings
    console.warn = (...args: any[]) => {
      if (shouldSuppress(args)) {
        // Suppress from console - ErrorDebugger will still capture it
        return
      }
      // Call original console.warn for all other warnings
      originalWarn.apply(console, args)
    }

    // Cleanup: restore original console methods on unmount
    return () => {
      console.error = originalError
      console.warn = originalWarn
    }
  }, [])

  return null
}

