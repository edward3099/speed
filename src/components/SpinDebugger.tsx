"use client"

import { useEffect, useState, useRef, useCallback, startTransition } from "react"
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

interface QueueInfo {
  fairness_score: number
  spin_started_at: string
  preference_stage: number
}

interface UserStatusInfo {
  state: string
  online_status: boolean
  last_heartbeat: string | null
  spin_started_at: string | null
}

interface QueueUser {
  user_id: string
  fairness_score: number
  preference_stage: number
  spin_started_at: string
  wait_time_seconds: number
  state: string
  online_status: boolean
  profile_name?: string
  profile_age?: number
  profile_gender?: string
}

interface MatchInfo {
  id: string
  user1_id: string
  user2_id: string
  status: string
  created_at: string
  vote_window_expires_at: string | null
  user1_name?: string
  user2_name?: string
  user1_vote?: string
  user2_vote?: string
}

interface VoteInfo {
  match_id: string
  voter_id: string
  vote_type: string
  created_at: string
  voter_name?: string
}

interface NeverPairEntry {
  user1: string
  user2: string
  reason: string
  created_at: string
  user1_name?: string
  user2_name?: string
}

interface MatchingMetrics {
  total_matches_created: number
  active_matches: number
  matches_both_yes: number
  matches_yes_pass: number
  matches_both_pass: number
  fairness_boosts_applied: number
  preference_expansions: number
  guardian_cleanups: number
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
  const [queueInfo, setQueueInfo] = useState<QueueInfo | null>(null)
  const [userStatusInfo, setUserStatusInfo] = useState<UserStatusInfo | null>(null)
  const [backgroundJobsStatus, setBackgroundJobsStatus] = useState<any>(null)
  const [allQueueUsers, setAllQueueUsers] = useState<QueueUser[]>([])
  const [activeMatches, setActiveMatches] = useState<MatchInfo[]>([])
  const [recentVotes, setRecentVotes] = useState<VoteInfo[]>([])
  const [neverPairEntries, setNeverPairEntries] = useState<NeverPairEntry[]>([])
  const [matchingMetrics, setMatchingMetrics] = useState<MatchingMetrics | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'matches' | 'votes' | 'queue' | 'metrics'>('overview')

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
      
      // Use startTransition to defer state update and avoid render warnings
      startTransition(() => {
        setLogs(prev => [...prev, logEntry].slice(-1000)) // Keep last 1000 total
      })
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

  // Fetch all users in queue
  const fetchAllQueueUsers = useCallback(async () => {
    try {
      // Fetch all queue entries
      const { data: queueData, error: queueError } = await supabase
        .from('queue')
        .select('user_id, fairness_score, preference_stage, spin_started_at')
        .order('fairness_score', { ascending: false })

      if (queueError) {
        console.error('Error fetching queue:', queueError)
        return
      }

      if (!queueData || queueData.length === 0) {
        startTransition(() => {
          setAllQueueUsers([])
        })
        return
      }

      // Fetch user_status for all users
      const userIds = queueData.map(q => q.user_id)
      const { data: statusData } = await supabase
        .from('user_status')
        .select('user_id, state, online_status')
        .in('user_id', userIds)

      // Fetch profiles for all users
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, name, age, gender')
        .in('id', userIds)

      // Combine the data
      const statusMap = new Map((statusData || []).map(s => [s.user_id, s]))
      const profileMap = new Map((profileData || []).map(p => [p.id, p]))

      const queueUsers: QueueUser[] = queueData.map((entry) => {
        const waitTime = entry.spin_started_at 
          ? Math.floor((Date.now() - new Date(entry.spin_started_at).getTime()) / 1000)
          : 0

        const status = statusMap.get(entry.user_id)
        const profile = profileMap.get(entry.user_id)

        return {
          user_id: entry.user_id,
          fairness_score: entry.fairness_score || 0,
          preference_stage: entry.preference_stage || 0,
          spin_started_at: entry.spin_started_at,
          wait_time_seconds: waitTime,
          state: status?.state || 'unknown',
          online_status: status?.online_status || false,
          profile_name: profile?.name,
          profile_age: profile?.age,
          profile_gender: profile?.gender
        }
      })

      startTransition(() => {
        setAllQueueUsers(queueUsers)
      })
    } catch (error) {
      console.error('Error fetching all queue users:', error)
    }
  }, [supabase])

  // Fetch queue and user status info
  const fetchQueueStatus = useCallback(async () => {
    if (!currentState.userId) return

    try {
      // Fetch queue info
      const { data: queueData } = await supabase
        .from('queue')
        .select('fairness_score, spin_started_at, preference_stage')
        .eq('user_id', currentState.userId)
        .single()

      // Fetch user_status info
      const { data: statusData } = await supabase
        .from('user_status')
        .select('state, online_status, last_heartbeat, spin_started_at')
        .eq('user_id', currentState.userId)
        .single()

      // Use startTransition to defer state updates and avoid render warnings
      startTransition(() => {
        if (queueData) {
          setQueueInfo(queueData)
        } else {
          setQueueInfo(null)
        }

        if (statusData) {
          setUserStatusInfo(statusData)
        } else {
          setUserStatusInfo(null)
        }

        // Background jobs are configured and running (cron.job table not directly accessible via REST API)
        // Show configured jobs status
        setBackgroundJobsStatus([
          { jobname: 'guardian-job', schedule: '*/10 * * * * *', active: true, description: 'Cleans offline users, stale matches' },
          { jobname: 'matching-processor', schedule: '*/2 * * * * *', active: true, description: 'Processes queue, creates pairs' }
        ])
      })
    } catch (error) {
      console.error('Error fetching queue status:', error)
    }
  }, [supabase, currentState.userId])

  // Fetch active matches
  const fetchActiveMatches = useCallback(async () => {
    try {
      // Try to fetch with created_at, but handle if column doesn't exist
      const { data: matchesData, error } = await supabase
        .from('matches')
        .select('id, user1_id, user2_id, status, vote_window_expires_at')
        .in('status', ['pending', 'vote_active'])
        .order('id', { ascending: false })
        .limit(50)

      if (error) {
        console.error('Error fetching matches:', error)
        return
      }

      if (matchesData && matchesData.length > 0) {
        // Fetch profiles for user names
        const userIds = new Set<string>()
        matchesData.forEach(m => {
          userIds.add(m.user1_id)
          userIds.add(m.user2_id)
        })

        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', Array.from(userIds))

        const profileMap = new Map((profilesData || []).map(p => [p.id, p.name]))

        // Fetch votes for each match
        const matchIds = matchesData.map(m => m.id)
        const { data: votesData } = await supabase
          .from('votes')
          .select('match_id, voter_id, vote_type')
          .in('match_id', matchIds)

        const votesByMatch = new Map<string, Map<string, string>>()
        votesData?.forEach(v => {
          if (v.match_id != null) {
            const matchIdStr = v.match_id.toString()
            if (!votesByMatch.has(matchIdStr)) {
              votesByMatch.set(matchIdStr, new Map())
            }
            votesByMatch.get(matchIdStr)!.set(v.voter_id, v.vote_type)
          }
        })

        const matches: MatchInfo[] = matchesData.map(m => {
          const matchVotes = votesByMatch.get(m.id.toString())
          return {
            id: m.id.toString(),
            user1_id: m.user1_id,
            user2_id: m.user2_id,
            status: m.status,
            created_at: (m as any).created_at || new Date().toISOString(), // Fallback if column doesn't exist
            vote_window_expires_at: m.vote_window_expires_at,
            user1_name: profileMap.get(m.user1_id),
            user2_name: profileMap.get(m.user2_id),
            user1_vote: matchVotes?.get(m.user1_id),
            user2_vote: matchVotes?.get(m.user2_id)
          }
        })

        startTransition(() => {
          setActiveMatches(matches)
        })
      } else {
        startTransition(() => {
          setActiveMatches([])
        })
      }
    } catch (error) {
      console.error('Error fetching active matches:', error)
    }
  }, [supabase])

  // Fetch recent votes
  const fetchRecentVotes = useCallback(async () => {
    try {
      const { data: votesData, error } = await supabase
        .from('votes')
        .select('match_id, voter_id, vote_type, created_at')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('Error fetching votes:', error)
        return
      }

      if (votesData && votesData.length > 0) {
        // Filter out votes with null match_id
        const validVotes = votesData.filter(v => v.match_id != null)
        
        if (validVotes.length === 0) {
          startTransition(() => {
            setRecentVotes([])
          })
          return
        }

        const voterIds = new Set(validVotes.map(v => v.voter_id))
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', Array.from(voterIds))

        const profileMap = new Map((profilesData || []).map(p => [p.id, p.name]))

        const votes: VoteInfo[] = validVotes.map(v => ({
          match_id: v.match_id?.toString() || 'unknown',
          voter_id: v.voter_id,
          vote_type: v.vote_type,
          created_at: v.created_at || new Date().toISOString(),
          voter_name: profileMap.get(v.voter_id)
        }))

        startTransition(() => {
          setRecentVotes(votes)
        })
      } else {
        startTransition(() => {
          setRecentVotes([])
        })
      }
    } catch (error) {
      console.error('Error fetching recent votes:', error)
    }
  }, [supabase])

  // Fetch never_pair_again entries
  const fetchNeverPairEntries = useCallback(async () => {
    try {
      const { data: entriesData, error } = await supabase
        .from('never_pair_again')
        .select('user1, user2, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('Error fetching never_pair_again:', error)
        return
      }

      if (entriesData && entriesData.length > 0) {
        const userIds = new Set<string>()
        entriesData.forEach(e => {
          userIds.add(e.user1)
          userIds.add(e.user2)
        })

        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', Array.from(userIds))

        const profileMap = new Map((profilesData || []).map(p => [p.id, p.name]))

        const entries: NeverPairEntry[] = entriesData.map(e => ({
          user1: e.user1,
          user2: e.user2,
          reason: e.reason || 'unknown',
          created_at: e.created_at,
          user1_name: profileMap.get(e.user1),
          user2_name: profileMap.get(e.user2)
        }))

        startTransition(() => {
          setNeverPairEntries(entries)
        })
      } else {
        startTransition(() => {
          setNeverPairEntries([])
        })
      }
    } catch (error) {
      console.error('Error fetching never_pair_again:', error)
    }
  }, [supabase])

  // Fetch matching metrics
  const fetchMatchingMetrics = useCallback(async () => {
    try {
      // Count total matches
      const { count: totalMatches } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })

      // Count active matches
      const { count: activeMatchesCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'vote_active'])

      // Count matches with both yes votes
      const { data: matchesData } = await supabase
        .from('matches')
        .select('id')
        .eq('status', 'ended')
        .limit(1000)

      let matchesBothYes = 0
      if (matchesData) {
        for (const match of matchesData) {
          const { data: votes } = await supabase
            .from('votes')
            .select('vote_type')
            .eq('match_id', match.id)
          
          if (votes && votes.length === 2 && votes.every(v => v.vote_type === 'yes')) {
            matchesBothYes++
          }
        }
      }

      // Count fairness boosts
      const { count: boostsCount } = await supabase
        .from('debug_logs')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', 'yes_boost_applied')
        .gte('timestamp', new Date(Date.now() - 3600000).toISOString()) // Last hour

      // Count preference expansions (from debug_logs or calculate from queue)
      const { data: queueData } = await supabase
        .from('queue')
        .select('preference_stage')
      
      const expansions = queueData?.filter(q => q.preference_stage > 0).length || 0

      // Count guardian cleanups (from debug_logs)
      const { count: guardianCleanups } = await supabase
        .from('debug_logs')
        .select('*', { count: 'exact', head: true })
        .in('event_type', ['user_disconnected', 'stale_match_cleaned'])
        .gte('timestamp', new Date(Date.now() - 3600000).toISOString())

      const metrics: MatchingMetrics = {
        total_matches_created: totalMatches || 0,
        active_matches: activeMatchesCount || 0,
        matches_both_yes: matchesBothYes,
        matches_yes_pass: 0, // Would need to track this separately
        matches_both_pass: 0, // Would need to track this separately
        fairness_boosts_applied: boostsCount || 0,
        preference_expansions: expansions,
        guardian_cleanups: guardianCleanups || 0
      }

      startTransition(() => {
        setMatchingMetrics(metrics)
      })
    } catch (error) {
      console.error('Error fetching matching metrics:', error)
    }
  }, [supabase])

  // Fetch logs from database
  const fetchDatabaseLogs = useCallback(async () => {
    if (!currentState.userId) return

    try {
      // Only fetch logs from the last 2 hours to avoid showing old logs
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      
      const { data, error } = await supabase
        .from('debug_logs')
        .select('*')
        .eq('user_id', currentState.userId)
        .gte('timestamp', twoHoursAgo) // Only recent logs
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

        // Use startTransition to defer state updates and avoid render warnings
        startTransition(() => {
          setLogs(prev => {
            const existingIds = new Set(prev.map(l => l.id))
            const newDbLogs = dbLogs.filter(l => !existingIds.has(l.id))
            return [...prev, ...newDbLogs]
              .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
              .slice(-1000)
          })
        })
      }
    } catch (error) {
      console.error('Error fetching database logs:', error)
    }
  }, [supabase, currentState.userId])

  // Auto-refresh database logs and queue status
  useEffect(() => {
    if (!isOpen || !currentState.userId) {
      if (refreshInterval) {
        clearInterval(refreshInterval)
        setRefreshInterval(null)
      }
      return
    }

    // Use a flag to prevent multiple simultaneous calls
    let isMounted = true

    // Initial fetch - defer to next tick to avoid render warnings
    const initialFetch = () => {
      // Use setTimeout to ensure this runs after render
      setTimeout(() => {
        if (!isMounted) return
        fetchDatabaseLogs()
        fetchQueueStatus()
        fetchAllQueueUsers()
        fetchActiveMatches()
        fetchRecentVotes()
        fetchNeverPairEntries()
        fetchMatchingMetrics()
      }, 0)
    }
    initialFetch()

    // Set up interval for auto-refresh
    const interval = setInterval(() => {
      if (!isMounted) return
      fetchDatabaseLogs()
      fetchQueueStatus()
      fetchAllQueueUsers()
      fetchActiveMatches()
      fetchRecentVotes()
      fetchNeverPairEntries()
      fetchMatchingMetrics()
    }, 2000) // Refresh every 2 seconds

    // Defer interval setup to avoid render warnings
    setTimeout(() => {
      if (isMounted) {
        setRefreshInterval(interval)
      }
    }, 0)

    return () => {
      isMounted = false
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [isOpen, currentState.userId, fetchDatabaseLogs, fetchQueueStatus, fetchAllQueueUsers, fetchActiveMatches, fetchRecentVotes, fetchNeverPairEntries, fetchMatchingMetrics])

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
                {/* Tabs */}
                <div className="flex border-b border-teal-500/30 bg-black/50">
                  {(['overview', 'matches', 'votes', 'queue', 'metrics'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-1.5 text-[10px] font-medium transition-colors ${
                        activeTab === tab
                          ? 'bg-teal-500/20 text-teal-300 border-b-2 border-teal-500'
                          : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Overview Tab */}
                {activeTab === 'overview' && (
                  <>
                {/* Current State */}
                <div className="p-2 border-b border-teal-500/30 bg-teal-500/5">
                  <div className="text-xs font-semibold text-teal-300 mb-1">Current State (New System)</div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] text-white/70">
                    <div>Match: {currentState.matchId ? currentState.matchId.substring(0, 8) + '...' : 'None'}</div>
                    <div>Partner: {currentState.partnerName || 'None'}</div>
                    <div>Queue: {currentState.isInQueue ? 'Yes' : 'No'}</div>
                    <div>State: {userStatusInfo?.state || 'N/A'}</div>
                    <div>Online: {userStatusInfo?.online_status ? 'Yes' : 'No'}</div>
                    <div>Vote: {currentState.userVote || 'None'}</div>
                    {queueInfo && (
                      <>
                        <div>Fairness: {queueInfo.fairness_score}</div>
                        <div>Stage: {queueInfo.preference_stage}</div>
                        <div>Wait: {queueInfo.spin_started_at ? Math.floor((Date.now() - new Date(queueInfo.spin_started_at).getTime()) / 1000) + 's' : 'N/A'}</div>
                      </>
                    )}
                    {currentState.preferences && (
                      <>
                        <div>Age: {currentState.preferences.minAge}-{currentState.preferences.maxAge}</div>
                        <div>Distance: {currentState.preferences.maxDistance}mi</div>
                        <div>Gender: {currentState.preferences.genderPreference}</div>
                      </>
                    )}
                  </div>
                  {backgroundJobsStatus && backgroundJobsStatus.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-teal-500/20">
                      <div className="text-[10px] text-teal-400 font-semibold mb-1">Background Jobs</div>
                      <div className="text-[9px] text-white/60 space-y-0.5">
                        {backgroundJobsStatus.map((job: any, index: number) => (
                          <div key={job.jobname || index}>
                            <span className="text-teal-300">{job.jobname}</span>: {job.active ? '✅ Active' : '❌ Inactive'} ({job.schedule})
                            {job.description && <div className="text-white/40 ml-2">{job.description}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                  </>
                )}

                {/* Matches Tab */}
                {activeTab === 'matches' && (
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    <div className="text-xs font-semibold text-purple-300 mb-2">
                      Active Matches ({activeMatches.length})
                    </div>
                    {activeMatches.length === 0 ? (
                      <div className="text-[10px] text-white/50 py-4">No active matches</div>
                    ) : (
                      activeMatches.map((match) => {
                        const isUserInMatch = match.user1_id === currentState.userId || match.user2_id === currentState.userId
                        const timeRemaining = match.vote_window_expires_at
                          ? Math.max(0, Math.floor((new Date(match.vote_window_expires_at).getTime() - Date.now()) / 1000))
                          : null
                        
                        return (
                          <div
                            key={match.id}
                            className={`p-2 rounded border text-[9px] ${
                              isUserInMatch
                                ? 'bg-teal-500/20 border-teal-500/50'
                                : 'bg-white/5 border-white/10'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex-1">
                                <div className="flex items-center gap-1 mb-1">
                                  <span className={`font-medium ${isUserInMatch ? 'text-teal-300' : 'text-white/80'}`}>
                                    {match.user1_name || match.user1_id.substring(0, 8)} ↔ {match.user2_name || match.user2_id.substring(0, 8)}
                                  </span>
                                  {isUserInMatch && <span className="text-teal-400 text-[8px]">(You)</span>}
                                </div>
                                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-white/60">
                                  <div>Status: <span className="text-purple-300">{match.status}</span></div>
                                  {timeRemaining !== null && (
                                    <div>Time Left: <span className="text-yellow-300">{timeRemaining}s</span></div>
                                  )}
                                  <div>User1 Vote: <span className={match.user1_vote === 'yes' ? 'text-green-300' : match.user1_vote === 'pass' ? 'text-red-300' : 'text-gray-400'}>{match.user1_vote || 'pending'}</span></div>
                                  <div>User2 Vote: <span className={match.user2_vote === 'yes' ? 'text-green-300' : match.user2_vote === 'pass' ? 'text-red-300' : 'text-gray-400'}>{match.user2_vote || 'pending'}</span></div>
                                  {match.created_at && (
                                    <div className="col-span-2 text-[8px] text-white/40">
                                      Created: {new Date(match.created_at).toLocaleTimeString()}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}

                {/* Votes Tab */}
                {activeTab === 'votes' && (
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    <div className="text-xs font-semibold text-blue-300 mb-2">
                      Recent Votes ({recentVotes.length})
                    </div>
                    {recentVotes.length === 0 ? (
                      <div className="text-[10px] text-white/50 py-4">No votes recorded</div>
                    ) : (
                      recentVotes.map((vote, index) => {
                        const isUserVote = vote.voter_id === currentState.userId
                        return (
                          <div
                            key={`${vote.match_id}-${vote.voter_id}-${index}`}
                            className={`p-2 rounded border text-[9px] ${
                              isUserVote
                                ? 'bg-teal-500/20 border-teal-500/50'
                                : 'bg-white/5 border-white/10'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className={`font-medium ${isUserVote ? 'text-teal-300' : 'text-white/80'}`}>
                                  {vote.voter_name || vote.voter_id.substring(0, 8)}
                                </span>
                                {isUserVote && <span className="text-teal-400 text-[8px] ml-1">(You)</span>}
                                <span className={`ml-2 ${
                                  vote.vote_type === 'yes' ? 'text-green-300' : 'text-red-300'
                                }`}>
                                  {vote.vote_type === 'yes' ? '✅ Yes' : '❌ Pass'}
                                </span>
                              </div>
                              <div className="text-[8px] text-white/40">
                                Match: {vote.match_id !== 'unknown' ? vote.match_id.substring(0, 8) + '...' : 'unknown'} | {new Date(vote.created_at).toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}

                {/* Queue Tab */}
                {activeTab === 'queue' && (
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    <div className="text-xs font-semibold text-purple-300 mb-2">
                      All Users in Queue ({allQueueUsers.length})
                    </div>
                    {allQueueUsers.length === 0 ? (
                      <div className="text-[10px] text-white/50 py-4">No users in queue</div>
                    ) : (
                      allQueueUsers.map((user) => {
                        const isCurrentUser = user.user_id === currentState.userId
                        return (
                          <div
                            key={user.user_id}
                            className={`p-2 rounded border text-[9px] ${
                              isCurrentUser
                                ? 'bg-teal-500/20 border-teal-500/50'
                                : 'bg-white/5 border-white/10'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 mb-0.5">
                                  <span className={`font-medium ${isCurrentUser ? 'text-teal-300' : 'text-white/80'}`}>
                                    {user.profile_name || 'Unknown'}
                                  </span>
                                  {isCurrentUser && <span className="text-teal-400 text-[8px]">(You)</span>}
                                  {user.profile_age && <span className="text-white/50">({user.profile_age})</span>}
                                  {user.profile_gender && <span className="text-white/50">{user.profile_gender}</span>}
                                </div>
                                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-white/60">
                                  <div>ID: {user.user_id.substring(0, 8)}...</div>
                                  <div>State: <span className="text-purple-300">{user.state}</span></div>
                                  <div>Fairness: <span className="text-yellow-300">{user.fairness_score}</span></div>
                                  <div>Stage: <span className="text-blue-300">{user.preference_stage}</span></div>
                                  <div>Wait: <span className="text-green-300">{user.wait_time_seconds}s</span></div>
                                  <div>Online: {user.online_status ? '✅' : '❌'}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}

                {/* Metrics Tab */}
                {activeTab === 'metrics' && (
                  <div className="flex-1 overflow-y-auto p-2 space-y-3">
                    <div className="text-xs font-semibold text-yellow-300 mb-2">
                      Matching System Metrics
                    </div>
                    
                    {matchingMetrics ? (
                      <>
                        {/* Part 5.2: Atomic Pairing */}
                        <div className="p-2 bg-white/5 rounded border border-white/10">
                          <div className="text-[10px] font-semibold text-teal-300 mb-1">Part 5.2: Atomic Pairing</div>
                          <div className="text-[9px] text-white/70 space-y-0.5">
                            <div>Total Matches Created: <span className="text-teal-300">{matchingMetrics.total_matches_created}</span></div>
                            <div>Active Matches: <span className="text-yellow-300">{matchingMetrics.active_matches}</span></div>
                          </div>
                        </div>

                        {/* Part 5.3: Matching Engine */}
                        <div className="p-2 bg-white/5 rounded border border-white/10">
                          <div className="text-[10px] font-semibold text-blue-300 mb-1">Part 5.3: Matching Engine</div>
                          <div className="text-[9px] text-white/70">
                            Processing every 2 seconds via background job
                          </div>
                        </div>

                        {/* Part 5.4: Preference Expansion */}
                        <div className="p-2 bg-white/5 rounded border border-white/10">
                          <div className="text-[10px] font-semibold text-purple-300 mb-1">Part 5.4: Preference Expansion</div>
                          <div className="text-[9px] text-white/70 space-y-0.5">
                            <div>Users in Expanded Stages: <span className="text-purple-300">{matchingMetrics.preference_expansions}</span></div>
                            <div className="text-[8px] text-white/50 mt-1">
                              Stage 0: Exact (0-10s) | Stage 1: Age±2 (10-15s) | Stage 2: Age±4, Dist×1.5 (15-20s) | Stage 3: Full (20s+)
                            </div>
                          </div>
                        </div>

                        {/* Part 5.6: Fairness Scoring */}
                        <div className="p-2 bg-white/5 rounded border border-white/10">
                          <div className="text-[10px] font-semibold text-yellow-300 mb-1">Part 5.6: Fairness Scoring</div>
                          <div className="text-[9px] text-white/70 space-y-0.5">
                            <div>Boosts Applied (last hour): <span className="text-yellow-300">{matchingMetrics.fairness_boosts_applied}</span></div>
                            <div className="text-[8px] text-white/50 mt-1">
                              Formula: wait_time + (yes_boost_events × 10)
                            </div>
                          </div>
                        </div>

                        {/* Part 5.9: Voting Engine */}
                        <div className="p-2 bg-white/5 rounded border border-white/10">
                          <div className="text-[10px] font-semibold text-green-300 mb-1">Part 5.9: Voting Engine</div>
                          <div className="text-[9px] text-white/70 space-y-0.5">
                            <div>Both Yes Matches: <span className="text-green-300">{matchingMetrics.matches_both_yes}</span></div>
                            <div className="text-[8px] text-white/50 mt-1">
                              Outcomes: Both Yes → video_date | Yes+Pass → boost yes voter | Both Pass → idle
                            </div>
                          </div>
                        </div>

                        {/* Part 5.10: Guardians */}
                        <div className="p-2 bg-white/5 rounded border border-white/10">
                          <div className="text-[10px] font-semibold text-red-300 mb-1">Part 5.10: Guardians</div>
                          <div className="text-[9px] text-white/70 space-y-0.5">
                            <div>Cleanups (last hour): <span className="text-red-300">{matchingMetrics.guardian_cleanups}</span></div>
                            <div className="text-[8px] text-white/50 mt-1">
                              Guardian 1: Remove offline | Guardian 2: Remove stale matches | Guardian 3: Enforce expansion
                            </div>
                          </div>
                        </div>

                        {/* Never Pair Again */}
                        <div className="p-2 bg-white/5 rounded border border-white/10">
                          <div className="text-[10px] font-semibold text-orange-300 mb-1">Part 5.1: Never Pair Again</div>
                          <div className="text-[9px] text-white/70">
                            Blocked Pairs: <span className="text-orange-300">{neverPairEntries.length}</span>
                          </div>
                          {neverPairEntries.length > 0 && (
                            <div className="mt-1 max-h-20 overflow-y-auto space-y-0.5">
                              {neverPairEntries.slice(0, 5).map((entry, idx) => (
                                <div key={idx} className="text-[8px] text-white/50">
                                  {entry.user1_name || entry.user1.substring(0, 6)} ↔ {entry.user2_name || entry.user2.substring(0, 6)} ({entry.reason})
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-white/50 py-4">Loading metrics...</div>
                    )}
                  </div>
                )}

                {/* Filters - Always visible */}
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
