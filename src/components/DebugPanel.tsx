/**
 * Global Debug Panel Component
 * Provides debugging information and controls
 */

'use client'

import { useState, useEffect } from 'react'
import { profiler } from '@/lib/debug'

export function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    const updateStats = () => {
      setStats(profiler.getStats())
    }

    updateStats()
    const interval = setInterval(updateStats, 2000)
    return () => clearInterval(interval)
  }, [])

  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  const slowest = profiler.getSlowestOperations(5)

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          top: 50,
          right: 10,
          padding: '8px 12px',
          backgroundColor: '#2196f3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          zIndex: 9999,
          fontSize: '12px',
          fontFamily: 'monospace',
        }}
      >
        🐛 Debug Panel
      </button>
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 90,
            right: 10,
            width: '400px',
            maxHeight: '80vh',
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '16px',
            zIndex: 9998,
            overflow: 'auto',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
            <h3 style={{ margin: 0, color: '#fff' }}>Debug Panel</h3>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '18px',
                padding: '4px 8px',
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#4caf50' }}>Performance Stats</h4>
            {stats ? (
              <div style={{ lineHeight: '1.6' }}>
                <div>Total Metrics: {stats.totalMetrics}</div>
                <div>Avg Duration: {stats.averageDuration?.toFixed(2)}ms</div>
                <div>Components: {stats.componentCount}</div>
                {stats.slowestOperation && (
                  <div style={{ marginTop: '8px', color: '#ff9800' }}>
                    Slowest: {stats.slowestOperation.name} ({stats.slowestOperation.duration.toFixed(2)}ms)
                  </div>
                )}
              </div>
            ) : (
              <div>No metrics yet</div>
            )}
          </div>

          {slowest.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#ff9800' }}>Slowest Operations</h4>
              <div style={{ lineHeight: '1.6' }}>
                {slowest.map((op, i) => (
                  <div key={i} style={{ marginBottom: '4px' }}>
                    {op.name}: {op.duration.toFixed(2)}ms
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#2196f3' }}>Actions</h4>
            <button
              onClick={() => {
                profiler.clear()
                setStats(profiler.getStats())
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
                marginRight: '8px',
              }}
            >
              Clear Metrics
            </button>
            <button
              onClick={() => {
                const exportData = profiler.exportMetrics()
                console.log('Performance Metrics:', exportData)
                console.log('Metrics exported to console')
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#4caf50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              Export to Console
            </button>
          </div>

          <div style={{ fontSize: '10px', color: '#888', marginTop: '16px' }}>
            <div>Environment: {process.env.NODE_ENV}</div>
            <div>Time: {new Date().toLocaleTimeString()}</div>
          </div>
        </div>
      )}
    </>
  )
}

