"use client"

import { useState, useEffect } from "react"
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
  const [feed, setFeed] = useState<any>(null)
  const [state, setState] = useState<any>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [errors, setErrors] = useState<any[]>([])
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [validations, setValidations] = useState<any[]>([])
  const [timers, setTimers] = useState<any[]>([])
  const [frozenStates, setFrozenStates] = useState<any[]>([])
  const [activeModule, setActiveModule] = useState<string>("feed")

  useEffect(() => {
    loadDebugData()
    const interval = setInterval(loadDebugData, 2000) // Refresh every 2 seconds
    return () => clearInterval(interval)
  }, [])

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
      setLogs(recentLogs)

      const recentErrors = getErrors(20)
      setErrors(recentErrors)

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
    } catch (error) {
      console.error("Error loading debug data:", error)
    }
  }

  const renderModule1 = () => (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Module 1: debugState()</h2>
      <pre className="bg-gray-900 p-4 rounded overflow-auto max-h-96 text-xs">
        {JSON.stringify(state, null, 2)}
      </pre>
    </div>
  )

  const renderModule2 = () => (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Module 2: Structured Logging</h2>
      <div className="mb-4">
        <h3 className="text-xl font-semibold mb-2">Recent Logs ({logs.length})</h3>
        <div className="space-y-2 max-h-64 overflow-auto">
          {logs.slice(-10).map((log, i) => (
            <div key={i} className="bg-gray-800 p-2 rounded text-xs">
              <div className="flex justify-between">
                <span className="font-semibold">{log.type}</span>
                <span className="text-gray-400">{log.timestamp}</span>
              </div>
              {log.user && <div>User: {log.user}</div>}
              {log.level && <div>Level: {log.level}</div>}
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-xl font-semibold mb-2 text-red-400">Recent Errors ({errors.length})</h3>
        <div className="space-y-2 max-h-64 overflow-auto">
          {errors.slice(-5).map((error, i) => (
            <div key={i} className="bg-red-900/30 p-2 rounded text-xs">
              <div className="flex justify-between">
                <span className="font-semibold text-red-400">{error.type}</span>
                <span className="text-gray-400">{error.timestamp}</span>
              </div>
              {error.user && <div>User: {error.user}</div>}
              {error.error && (
                <div className="mt-1">
                  <pre className="text-red-300">{JSON.stringify(error.error, null, 2)}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
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
        Auto-refreshing every 2 seconds | Last update: {new Date().toLocaleTimeString()}
      </div>
    </div>
  )
}
