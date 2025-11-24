"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { 
  debugState, 
  getDebugFeed, 
  getLogs, 
  getErrors, 
  getSnapshots,
  getValidationHistory,
  getActiveTimers,
  listFrozenStates,
  DebugToolkit
} from "@/lib/debug"

export default function DebugPage() {
  const supabase = createClient()
  const [feed, setFeed] = useState<any>(null)
  const [state, setState] = useState<any>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [errors, setErrors] = useState<any[]>([])
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [validations, setValidations] = useState<any[]>([])
  const [timers, setTimers] = useState<any[]>([])
  const [frozenStates, setFrozenStates] = useState<any[]>([])
  const [activeModule, setActiveModule] = useState<string>("feed")
  const [dbState, setDbState] = useState<any>(null)

  useEffect(() => {
    loadDebugData()
    loadDatabaseState()
    const interval = setInterval(() => {
      loadDebugData()
      loadDatabaseState()
    }, 2000) // Refresh every 2 seconds
    return () => clearInterval(interval)
  }, [])

  const loadDatabaseState = async () => {
    try {
      const { data: queue } = await supabase.from('matching_queue').select('*')
      const { data: matches } = await supabase.from('matches').select('*').eq('status', 'pending')
      const { data: votes } = await supabase.from('votes').select('*').order('created_at', { ascending: false }).limit(10)
      
      // Try to get events from debug_event_log table
      let dbLogs: any[] = []
      let dbErrors: any[] = []
      try {
        const { data: events, error: eventsError } = await supabase
          .from('debug_event_log')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(50)
        
        if (eventsError) {
          console.log('🔍 DEBUG PAGE: Error fetching events:', eventsError)
        } else {
          dbLogs = events || []
        }
        
        const { data: errors, error: errorsError } = await supabase
          .from('debug_event_log')
          .select('*')
          .eq('severity', 'ERROR')
          .order('timestamp', { ascending: false })
          .limit(20)
        
        if (errorsError) {
          console.log('🔍 DEBUG PAGE: Error fetching errors:', errorsError)
        } else {
          dbErrors = errors || []
        }
      } catch (e: any) {
        // Table might not exist, that's okay
        console.log('🔍 DEBUG PAGE: debug_event_log table not available:', e?.message || e)
      }
      
      setDbState({
        queue: queue || [],
        matches: matches || [],
        votes: votes || [],
        logs: dbLogs,
        errors: dbErrors,
        timestamp: new Date().toISOString()
      })
      
      // ALWAYS use database logs if available (they persist across tabs)
      // Merge with in-memory logs, prioritizing database
      const allLogs = dbLogs.length > 0 
        ? dbLogs.map(e => ({
            id: e.id,
            type: e.event_type,
            timestamp: e.timestamp,
            user: e.user_id,
            level: e.severity?.toLowerCase() || 'info',
            metadata: e.event_data,
            beforeState: e.before_state,
            afterState: e.after_state,
            error: e.error_message ? { message: e.error_message } : undefined
          }))
        : (logs.length > 0 ? logs : [])
      
      const allErrors = dbErrors.length > 0
        ? dbErrors.map(e => ({
            id: e.id,
            type: e.event_type,
            timestamp: e.timestamp,
            user: e.user_id,
            level: 'error',
            error: { message: e.error_message || e.event_data?.error || 'Unknown error' },
            metadata: e.event_data,
            beforeState: e.before_state,
            afterState: e.after_state
          }))
        : (errors.length > 0 ? errors : [])
      
      setLogs(allLogs)
      setErrors(allErrors)
    } catch (error) {
      console.error('Error loading database state:', error)
    }
  }

  const loadDebugData = () => {
    try {
      // Module 1: debugState()
      const currentState = debugState()
      setState(currentState)

      // Module 8: getDebugFeed()
      const currentFeed = getDebugFeed()
      setFeed(currentFeed)

      // Module 2: Structured Logging
      const recentLogs = getLogs(50)
      setLogs(recentLogs || [])

      const recentErrors = getErrors(20)
      setErrors(recentErrors || [])

      // Module 3: State Snapshots
      const recentSnapshots = getSnapshots(20)
      setSnapshots(recentSnapshots)

      // Module 4: Validators
      const validationHistory = getValidationHistory(20)
      setValidations(validationHistory)

      // Module 7: Timing Engine
      const activeTimersList = getActiveTimers()
      setTimers(activeTimersList)

      // Module 9: Freeze & Rollback
      const frozen = listFrozenStates()
      setFrozenStates(frozen)
      
      // Debug: Log to console what we found
      console.log('🔍 DEBUG PAGE: Loading data', {
        logsCount: recentLogs?.length || 0,
        errorsCount: recentErrors?.length || 0,
        snapshotsCount: recentSnapshots?.length || 0,
        validationsCount: validationHistory?.length || 0,
        timersCount: activeTimersList?.length || 0,
        frozenStatesCount: frozen?.length || 0
      })
      
      // Show first log if available
      if (recentLogs && recentLogs.length > 0) {
        console.log('🔍 DEBUG PAGE: First log', recentLogs[0])
      }
      if (recentErrors && recentErrors.length > 0) {
        console.log('🔍 DEBUG PAGE: First error', recentErrors[0])
      }
    } catch (error) {
      console.error("Error loading debug data:", error)
    }
  }

  const renderModule1 = () => (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Module 1: debugState()</h2>
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">In-Memory Debug State</h3>
        <pre className="bg-gray-900 p-4 rounded overflow-auto max-h-64 text-xs">
          {JSON.stringify(state, null, 2)}
        </pre>
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-2">Actual Database State</h3>
        <pre className="bg-gray-900 p-4 rounded overflow-auto max-h-64 text-xs">
          {JSON.stringify(dbState, null, 2)}
        </pre>
      </div>
    </div>
  )

  const renderModule2 = () => (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Module 2: Structured Logging</h2>
      <div className="mb-2 text-sm text-gray-400">
        Showing {logs.length} logs ({dbState?.logs?.length || 0} from database, {logs.length - (dbState?.logs?.length || 0)} from memory)
      </div>
      <div className="mb-4">
        <h3 className="text-xl font-semibold mb-2">Recent Logs ({logs.length})</h3>
        {logs.length === 0 ? (
          <div className="text-gray-400 text-sm">No logs yet. Try spinning to generate logs.</div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-auto">
            {logs.slice(-10).reverse().map((log, i) => (
              <div key={log.id || i} className="bg-gray-800 p-2 rounded text-xs">
                <div className="flex justify-between">
                  <span className="font-semibold">{log.type}</span>
                  <span className="text-gray-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                {log.user && <div>User: {log.user}</div>}
                {log.level && <div>Level: {log.level}</div>}
                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <div className="mt-1 text-gray-300">
                    <details>
                      <summary className="cursor-pointer">Metadata</summary>
                      <pre className="mt-1 text-xs">{JSON.stringify(log.metadata, null, 2)}</pre>
                    </details>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h3 className="text-xl font-semibold mb-2 text-red-400">Recent Errors ({errors.length})</h3>
        {errors.length === 0 ? (
          <div className="text-gray-400 text-sm">No errors yet.</div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-auto">
            {errors.slice(-5).reverse().map((error, i) => (
              <div key={error.id || i} className="bg-red-900/30 p-2 rounded text-xs">
                <div className="flex justify-between">
                  <span className="font-semibold text-red-400">{error.type}</span>
                  <span className="text-gray-400">{new Date(error.timestamp).toLocaleTimeString()}</span>
                </div>
                {error.user && <div>User: {error.user}</div>}
                {error.error && (
                  <div className="mt-1">
                    <div className="text-red-300 font-semibold">Error:</div>
                    <pre className="text-red-300 text-xs">{JSON.stringify(error.error, null, 2)}</pre>
                  </div>
                )}
                {error.metadata && Object.keys(error.metadata).length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-red-300">Details</summary>
                    <pre className="mt-1 text-xs text-red-200">{JSON.stringify(error.metadata, null, 2)}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const renderModule3 = () => (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Module 3: State Snapshots</h2>
      <div className="text-sm mb-2">Total Snapshots: {snapshots.length}</div>
      <div className="space-y-2 max-h-96 overflow-auto">
        {snapshots.slice(-10).map((snapshot, i) => (
          <div key={i} className="bg-gray-800 p-3 rounded">
            <div className="flex justify-between mb-2">
              <span className="font-semibold">{snapshot.eventType}</span>
              <span className="text-gray-400 text-xs">{snapshot.timestamp}</span>
            </div>
            {snapshot.userId && <div className="text-xs">User: {snapshot.userId}</div>}
            <div className="text-xs mt-2">
              <div>Before State Keys: {Object.keys(snapshot.beforeState || {}).join(", ")}</div>
              <div>After State Keys: {Object.keys(snapshot.afterState || {}).join(", ")}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const renderModule4 = () => (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Module 4: Tiny Validators</h2>
      <div className="space-y-2 max-h-96 overflow-auto">
        {validations.slice(-10).map((validation, i) => (
          <div key={i} className={`p-3 rounded ${validation.isValid ? 'bg-green-900/30' : 'bg-red-900/30'}`}>
            <div className="flex justify-between">
              <span className={`font-semibold ${validation.isValid ? 'text-green-400' : 'text-red-400'}`}>
                {validation.isValid ? '✓ Valid' : '✗ Invalid'}
              </span>
              <span className="text-gray-400 text-xs">{validation.timestamp}</span>
            </div>
            {validation.errors && validation.errors.length > 0 && (
              <div className="mt-2 text-xs">
                <div className="font-semibold">Errors:</div>
                {validation.errors.map((err: any, j: number) => (
                  <div key={j} className="text-red-300 ml-2">- {err.validator}: {err.message}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  const renderModule7 = () => (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Module 7: Strict Timing Engine</h2>
      <div className="space-y-2 max-h-96 overflow-auto">
        {timers.length === 0 ? (
          <div className="text-gray-400">No active timers</div>
        ) : (
          timers.map((timer, i) => (
            <div key={i} className="bg-gray-800 p-3 rounded">
              <div className="flex justify-between">
                <span className="font-semibold">{timer.type}</span>
                <span className="text-gray-400 text-xs">
                  {timer.expiresAt ? `Expires: ${new Date(timer.expiresAt).toLocaleTimeString()}` : 'No expiry'}
                </span>
              </div>
              {timer.userId && <div className="text-xs">User: {timer.userId}</div>}
              {timer.pairId && <div className="text-xs">Pair: {timer.pairId}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  )

  const renderModule8 = () => (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Module 8: Developer Dashboard Data Feeder</h2>
      {feed && (
        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-semibold mb-2">System Health</h3>
            <div className="bg-gray-800 p-3 rounded">
              <div>Status: <span className="font-semibold">{feed.systemHealth?.status}</span></div>
              <div>Queue Size: {feed.systemHealth?.queueSize}</div>
              <div>Pending Matches: {feed.systemHealth?.pendingMatches}</div>
              <div>Active Users: {feed.systemHealth?.activeUsers}</div>
              <div>Errors (Last Hour): {feed.systemHealth?.errorsInLastHour}</div>
            </div>
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-2">Current Queue ({feed.currentQueue?.length || 0})</h3>
            <div className="space-y-2 max-h-64 overflow-auto">
              {feed.currentQueue?.slice(0, 10).map((entry: any, i: number) => (
                <div key={i} className="bg-gray-800 p-2 rounded text-xs">
                  User: {entry.userId} | Waiting: {Math.floor(entry.waitingTime / 1000)}s | Fairness: {entry.fairnessScore}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-2">Current Pairs ({feed.currentPairs?.length || 0})</h3>
            <div className="space-y-2 max-h-64 overflow-auto">
              {feed.currentPairs?.slice(0, 10).map((pair: any, i: number) => (
                <div key={i} className="bg-gray-800 p-2 rounded text-xs">
                  Pair: {pair.pairId} | Users: {pair.user1} & {pair.user2} | Status: {pair.status}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-2">Last 10 Events</h3>
            <div className="space-y-2 max-h-64 overflow-auto">
              {feed.lastTenEvents?.map((event: any, i: number) => (
                <div key={i} className="bg-gray-800 p-2 rounded text-xs">
                  {event.type} | {event.timestamp} | User: {event.user || 'N/A'}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-2 text-red-400">Last 5 Errors</h3>
            <div className="space-y-2 max-h-64 overflow-auto">
              {feed.lastFiveErrors?.map((error: any, i: number) => (
                <div key={i} className="bg-red-900/30 p-2 rounded text-xs">
                  {error.type} | {error.timestamp} | {error.error}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const renderModule9 = () => (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Module 9: Freeze & Rollback</h2>
      <div className="space-y-2 max-h-96 overflow-auto">
        {frozenStates.length === 0 ? (
          <div className="text-gray-400">No frozen states</div>
        ) : (
          frozenStates.map((frozen, i) => (
            <div key={i} className="bg-gray-800 p-3 rounded">
              <div className="flex justify-between">
                <span className="font-semibold">{frozen.id}</span>
                <span className="text-gray-400 text-xs">{frozen.timestamp}</span>
              </div>
              {frozen.name && <div className="text-xs">Name: {frozen.name}</div>}
              {frozen.description && <div className="text-xs">Description: {frozen.description}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <h1 className="text-3xl font-bold mb-6">9-Module Debug Toolkit Status</h1>
      
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { id: "feed", name: "Module 8: Feed" },
          { id: "state", name: "Module 1: State" },
          { id: "logs", name: "Module 2: Logs" },
          { id: "snapshots", name: "Module 3: Snapshots" },
          { id: "validators", name: "Module 4: Validators" },
          { id: "timers", name: "Module 7: Timers" },
          { id: "freeze", name: "Module 9: Freeze" },
        ].map(module => (
          <button
            key={module.id}
            onClick={() => setActiveModule(module.id)}
            className={`px-4 py-2 rounded ${
              activeModule === module.id 
                ? "bg-blue-600 text-white" 
                : "bg-gray-700 text-gray-300"
            }`}
          >
            {module.name}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 rounded-lg">
        {activeModule === "feed" && renderModule8()}
        {activeModule === "state" && renderModule1()}
        {activeModule === "logs" && renderModule2()}
        {activeModule === "snapshots" && renderModule3()}
        {activeModule === "validators" && renderModule4()}
        {activeModule === "timers" && renderModule7()}
        {activeModule === "freeze" && renderModule9()}
      </div>

      <div className="mt-4 text-sm text-gray-400">
        Auto-refreshing every 2 seconds | Last update: <span suppressHydrationWarning>{typeof window !== 'undefined' ? new Date().toLocaleTimeString() : ''}</span>
      </div>
      {logs.length === 0 && errors.length === 0 && (
        <div className="mt-4 p-4 bg-yellow-900/30 rounded text-yellow-300">
          <div className="font-semibold mb-2">⚠️ No debug logs captured yet</div>
          <div className="text-sm space-y-1">
            <div>• Make sure you're spinning while this page is open (or in another tab)</div>
            <div>• Check the browser console (F12) for "🔍 DEBUG:" messages</div>
            <div>• The debug page reads from database - logs persist across tabs</div>
            <div>• Try spinning now and watch this page update automatically (refreshes every 2 seconds)</div>
          </div>
          <div className="mt-3 text-xs space-y-1">
            <div>Debug State: {state ? '✓ Loaded' : '✗ Not loaded'}</div>
            <div>Database State: {dbState ? '✓ Loaded' : '✗ Not loaded'}</div>
            <div>Database Logs: {dbState?.logs?.length || 0}</div>
            <div>Database Errors: {dbState?.errors?.length || 0}</div>
            <div>In-Memory Logs: {logs.length}</div>
            <div>In-Memory Errors: {errors.length}</div>
            <div>Queue Entries: {dbState?.queue?.length || 0}</div>
            <div>Pending Matches: {dbState?.matches?.length || 0}</div>
          </div>
        </div>
      )}
    </div>
  )
}
