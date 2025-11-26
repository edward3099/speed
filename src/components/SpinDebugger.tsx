"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Bug, X, ChevronDown, ChevronUp, Copy, Trash2, RefreshCw, Filter, Search } from "lucide-react"
import { SupabaseClient } from "@supabase/supabase-js"

interface LogEntry {
  id: string
  timestamp: Date
  level: 'log' | 'info' | 'warn' | 'error' | 'debug'
  message: string
  data?: any
  source: 'console' | 'database'
  eventType?: string
  metadata?: any
}

interface CurrentState {
  userId: string | null
  matchId: string | null
  partnerId: string | null
  partnerName: string | null
  isInQueue: boolean
  queueStatus: string | null
  userVote: string | null
  voteStartedAt: string | null
  spinning: boolean
  revealed: boolean
  started: boolean
  waitingForMatch: boolean
  preferences?: {
    minAge: number
    maxAge: number
    maxDistance: number
    genderPreference: string
  }
}

interface SpinDebuggerProps {
  supabase: SupabaseClient
  currentState: CurrentState
}

export function SpinDebugger({ supabase, currentState }: SpinDebuggerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<string>('')
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const consoleLogsRef = useRef<LogEntry[]>([])
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null)

  // Capture console logs
  useEffect(() => {
    const originalLog = console.log
    const originalError = console.error
    const originalWarn = console.warn
    const originalInfo = console.info
    const originalDebug = console.debug

    const addLog = (level: LogEntry['level'], ...args: any[]) => {
      const message = args.map(arg => {
        if (typeof arg === 'string') return arg
        if (arg instanceof Error) return arg.message
        try {
          return JSON.stringify(arg, null, 2)
        } catch {
          return String(arg)
        }
      }).join(' ')

      const logEntry: LogEntry = {
        id: `console_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        level,
        message,
        data: args.length === 1 ? args[0] : args,
        source: 'console'
      }

      consoleLogsRef.current = [...consoleLogsRef.current, logEntry].slice(-500) // Keep last 500
      setLogs(prev => [...prev, logEntry].slice(-1000)) // Keep last 1000 total
    }

    console.log = (...args: any[]) => {
      originalLog.apply(console, args)
      addLog('log', ...args)
    }

    console.error = (...args: any[]) => {
      originalError.apply(console, args)
      addLog('error', ...args)
    }

    console.warn = (...args: any[]) => {
      originalWarn.apply(console, args)
      addLog('warn', ...args)
    }

    console.info = (...args: any[]) => {
      originalInfo.apply(console, args)
      addLog('info', ...args)
    }

    console.debug = (...args: any[]) => {
      originalDebug.apply(console, args)
      addLog('debug', ...args)
    }

    return () => {
      console.log = originalLog
      console.error = originalError
      console.warn = originalWarn
      console.info = originalInfo
      console.debug = originalDebug
    }
  }, [])

  // Fetch logs from database
  const fetchDatabaseLogs = useCallback(async () => {
    if (!currentState.userId) return

    try {
      const { data, error } = await supabase
        .from('debug_logs')
        .select('*')
        .eq('user_id', currentState.userId)
        .order('timestamp', { ascending: false })
        .limit(200)

      if (error) {
        console.error('Error fetching debug logs:', error)
        return
      }

      if (data) {
        const dbLogs: LogEntry[] = data.map(log => ({
          id: log.id.toString(),
          timestamp: new Date(log.timestamp),
          level: log.severity as LogEntry['level'] || 'info',
          message: log.event_type || 'Unknown event',
          data: log.metadata,
          source: 'database',
          eventType: log.event_type,
          metadata: log.metadata
        }))

        // Merge with console logs, avoiding duplicates
        setLogs(prev => {
          const existingIds = new Set(prev.map(l => l.id))
          const newDbLogs = dbLogs.filter(l => !existingIds.has(l.id))
          return [...prev, ...newDbLogs]
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(-1000)
        })
      }
    } catch (error) {
      console.error('Error fetching database logs:', error)
    }
  }, [supabase, currentState.userId])

  // Auto-refresh database logs
  useEffect(() => {
    if (isOpen && currentState.userId) {
      fetchDatabaseLogs()
      const interval = setInterval(fetchDatabaseLogs, 2000) // Refresh every 2 seconds
      setRefreshInterval(interval)
      return () => {
        if (interval) clearInterval(interval)
      }
    } else {
      if (refreshInterval) {
        clearInterval(refreshInterval)
        setRefreshInterval(null)
      }
    }
  }, [isOpen, currentState.userId, fetchDatabaseLogs])

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  // Filter logs
  const filteredLogs = logs.filter(log => {
    const matchesFilter = !filter || 
      log.message.toLowerCase().includes(filter.toLowerCase()) ||
      log.eventType?.toLowerCase().includes(filter.toLowerCase()) ||
      JSON.stringify(log.data || log.metadata || {}).toLowerCase().includes(filter.toLowerCase())
    
    const matchesLevel = levelFilter === 'all' || log.level === levelFilter
    
    return matchesFilter && matchesLevel
  })

  const copyAllLogs = async () => {
    const logText = filteredLogs.map(log => {
      const time = log.timestamp.toLocaleTimeString()
      const level = log.level.toUpperCase().padEnd(5)
      const source = log.source === 'console' ? '[CONSOLE]' : '[DB]'
      const eventType = log.eventType ? `[${log.eventType}]` : ''
      return `[${time}] ${level} ${source} ${eventType} ${log.message}\n${log.data ? JSON.stringify(log.data, null, 2) : ''}\n---`
    }).join('\n\n')

    try {
      await navigator.clipboard.writeText(logText)
      alert('Logs copied to clipboard!')
    } catch (err) {
      const textarea = document.createElement('textarea')
      textarea.value = logText
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      alert('Logs copied to clipboard!')
    }
  }

  const clearLogs = () => {
    setLogs([])
    consoleLogsRef.current = []
  }

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'text-red-400'
      case 'warn': return 'text-yellow-400'
      case 'info': return 'text-blue-400'
      case 'debug': return 'text-purple-400'
      default: return 'text-gray-300'
    }
  }

  const getLevelBg = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'bg-red-500/20 border-red-500/30'
      case 'warn': return 'bg-yellow-500/20 border-yellow-500/30'
      case 'info': return 'bg-blue-500/20 border-blue-500/30'
      case 'debug': return 'bg-purple-500/20 border-purple-500/30'
      default: return 'bg-white/5 border-white/10'
    }
  }

  return (
    <>
      {/* Toggle Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-20 right-4 z-50 p-3 bg-teal-500/90 hover:bg-teal-600 rounded-full shadow-lg backdrop-blur-sm border-2 border-teal-400/50"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
      >
        <Bug className="w-5 h-5 text-white" />
        {logs.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-white text-teal-600 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {logs.length > 99 ? '99+' : logs.length}
          </span>
        )}
      </motion.button>

      {/* Debugger Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed bottom-4 right-4 z-50 bg-black/95 backdrop-blur-md border-2 border-teal-500/50 rounded-lg shadow-2xl"
            style={{
              width: isMinimized ? '320px' : '600px',
              height: isMinimized ? '120px' : '600px',
              maxHeight: '80vh',
              maxWidth: '90vw'
            }}
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-teal-500/30">
              <div className="flex items-center gap-2">
                <Bug className="w-4 h-4 text-teal-400" />
                <span className="text-sm font-semibold text-white">
                  Spin Debugger ({filteredLogs.length}/{logs.length})
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-1 hover:bg-white/10 rounded"
                  title={isMinimized ? "Expand" : "Minimize"}
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

            {!isMinimized && (
              <div className="flex flex-col h-[calc(100%-60px)]">
                {/* Current State */}
                <div className="p-2 border-b border-teal-500/30 bg-teal-500/5">
                  <div className="text-xs font-semibold text-teal-300 mb-1">Current State</div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] text-white/70">
                    <div>Match: {currentState.matchId ? currentState.matchId.substring(0, 8) + '...' : 'None'}</div>
                    <div>Partner: {currentState.partnerName || 'None'}</div>
                    <div>Queue: {currentState.isInQueue ? 'Yes' : 'No'}</div>
                    <div>Status: {currentState.queueStatus || 'N/A'}</div>
                    <div>Vote: {currentState.userVote || 'None'}</div>
                    <div>Spinning: {currentState.spinning ? 'Yes' : 'No'}</div>
                    <div>Started: {currentState.started ? 'Yes' : 'No'}</div>
                    <div>Revealed: {currentState.revealed ? 'Yes' : 'No'}</div>
                    {currentState.preferences && (
                      <>
                        <div>Age: {currentState.preferences.minAge}-{currentState.preferences.maxAge}</div>
                        <div>Distance: {currentState.preferences.maxDistance}mi</div>
                        <div>Gender: {currentState.preferences.genderPreference}</div>
                      </>
                    )}
                  </div>
                </div>

                {/* Filters */}
                <div className="p-2 border-b border-teal-500/30 bg-black/50">
                  <div className="flex gap-2 mb-2">
                    <div className="flex-1 relative">
                      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-white/50" />
                      <input
                        type="text"
                        placeholder="Search logs..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="w-full pl-7 pr-2 py-1 text-xs bg-white/5 border border-white/10 rounded text-white placeholder-white/30 focus:outline-none focus:border-teal-500/50"
                      />
                    </div>
                    <select
                      value={levelFilter}
                      onChange={(e) => setLevelFilter(e.target.value)}
                      className="px-2 py-1 text-xs bg-white/5 border border-white/10 rounded text-white focus:outline-none focus:border-teal-500/50"
                    >
                      <option value="all">All Levels</option>
                      <option value="log">Log</option>
                      <option value="info">Info</option>
                      <option value="warn">Warn</option>
                      <option value="error">Error</option>
                      <option value="debug">Debug</option>
                    </select>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={copyAllLogs}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 text-xs rounded border border-teal-500/50"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </button>
                    <button
                      onClick={clearLogs}
                      className="flex items-center justify-center gap-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs rounded border border-red-500/50"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={fetchDatabaseLogs}
                      className="flex items-center justify-center gap-1 px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-xs rounded border border-blue-500/50"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                    <label className="flex items-center gap-1 px-2 py-1 bg-white/5 text-white/70 text-xs rounded border border-white/10 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoScroll}
                        onChange={(e) => setAutoScroll(e.target.checked)}
                        className="w-3 h-3"
                      />
                      Auto
                    </label>
                  </div>
                </div>

                {/* Logs List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {filteredLogs.length === 0 ? (
                    <div className="text-center text-white/50 text-xs py-4">
                      No logs found
                    </div>
                  ) : (
                    filteredLogs.map((log) => (
                      <motion.div
                        key={log.id}
                        className={`p-2 rounded border text-xs ${getLevelBg(log.level)}`}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex-1 min-w-0">
                            <div className={`font-medium truncate ${getLevelColor(log.level)}`}>
                              {log.source === 'database' && log.eventType && (
                                <span className="text-teal-400">[{log.eventType}] </span>
                              )}
                              {log.message}
                            </div>
                            <div className="text-[10px] text-white/40 mt-0.5">
                              {log.timestamp.toLocaleTimeString()} • {log.level} • {log.source}
                            </div>
                          </div>
                        </div>
                        {(log.data || log.metadata) && (
                          <details className="mt-1">
                            <summary className="text-[10px] text-white/50 cursor-pointer">
                              Details
                            </summary>
                            <pre className="text-[10px] text-white/60 mt-1 overflow-x-auto whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                              {JSON.stringify(log.data || log.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                      </motion.div>
                    ))
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>
            )}

            {/* Minimized View */}
            {isMinimized && (
              <div className="p-3">
                <div className="text-xs text-white/70 mb-2">
                  {filteredLogs.length > 0 ? (
                    <div className="truncate">{filteredLogs[0].message}</div>
                  ) : (
                    <div>No logs</div>
                  )}
                </div>
                <button
                  onClick={copyAllLogs}
                  className="w-full px-2 py-1 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 text-xs rounded border border-teal-500/50"
                >
                  Copy All ({filteredLogs.length})
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
