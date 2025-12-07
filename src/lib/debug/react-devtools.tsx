/**
 * React DevTools Integration
 * Provides debugging utilities for React components
 */

'use client'

import React, { useEffect, useState, useRef } from 'react'

// Only import React DevTools in development
let ReactDevTools: any = null
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  try {
    // React DevTools is available globally when the extension is installed
    ReactDevTools = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  } catch {
    // DevTools not available
  }
}

/**
 * Hook to inspect component props and state
 */
export function useComponentDebug(componentName: string, props: any, state?: any) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Component Debug] ${componentName}`, {
        props,
        state,
        timestamp: new Date().toISOString(),
      })
    }
  }, [componentName, props, state])
}

/**
 * Component to display React DevTools status
 */
export function DevToolsStatus() {
  const [isAvailable, setIsAvailable] = useState(false)
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const checkDevTools = () => {
      const devTools = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
      if (devTools) {
        setIsAvailable(true)
        setVersion(devTools.renderers?.get(1)?.version || 'unknown')
      } else {
        setIsAvailable(false)
      }
    }

    checkDevTools()
    // Check periodically in case DevTools is installed later
    const interval = setInterval(checkDevTools, 2000)
    return () => clearInterval(interval)
  }, [])

  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 10,
        right: 10,
        padding: '8px 12px',
        backgroundColor: isAvailable ? '#4caf50' : '#ff9800',
        color: 'white',
        borderRadius: '4px',
        fontSize: '12px',
        zIndex: 9999,
        fontFamily: 'monospace',
      }}
    >
      React DevTools: {isAvailable ? `✅ v${version}` : '❌ Not installed'}
    </div>
  )
}

/**
 * Hook to log component lifecycle
 */
export function useComponentLifecycle(componentName: string) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Lifecycle] ${componentName} mounted`)

      return () => {
        console.log(`[Lifecycle] ${componentName} unmounted`)
      }
    }
  }, [componentName])
}

/**
 * Hook to track prop changes
 */
export function usePropChanges(componentName: string, props: Record<string, any>) {
  const prevPropsRef = React.useRef<Record<string, any>>({})

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    const prevProps = prevPropsRef.current
    const changedProps: Record<string, { from: any; to: any }> = {}

    Object.keys(props).forEach((key) => {
      if (prevProps[key] !== props[key]) {
        changedProps[key] = {
          from: prevProps[key],
          to: props[key],
        }
      }
    })

    if (Object.keys(changedProps).length > 0) {
      console.log(`[Prop Changes] ${componentName}`, changedProps)
    }

    prevPropsRef.current = { ...props }
  }, [componentName, props])
}

/**
 * Debug panel component
 */
export function DebugPanel({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  if (process.env.NODE_ENV !== 'development') {
    return <>{children}</>
  }

  return (
    <>
      {children}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          top: 10,
          right: 10,
          padding: '8px 12px',
          backgroundColor: '#2196f3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          zIndex: 9999,
          fontSize: '12px',
        }}
      >
        🐛 Debug
      </button>
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 50,
            right: 10,
            width: '400px',
            maxHeight: '80vh',
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '16px',
            zIndex: 9998,
            overflow: 'auto',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Debug Panel</h3>
            <button onClick={() => setIsOpen(false)}>✕</button>
          </div>
          <div>
            <p>
              <strong>React DevTools:</strong>{' '}
              {ReactDevTools ? '✅ Available' : '❌ Not installed'}
            </p>
            <p>
              <strong>Environment:</strong> {process.env.NODE_ENV}
            </p>
            <p>
              <strong>User Agent:</strong> {typeof window !== 'undefined' ? navigator.userAgent : 'N/A'}
            </p>
          </div>
        </div>
      )}
    </>
  )
}

