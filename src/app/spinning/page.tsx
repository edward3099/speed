"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles as SparklesIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { EnhancedRealtimeSubscription } from "@/lib/utils/enhanced-realtime"
// Debug imports removed for production

/**
 * /spinning page
 * 
 * Shows spinning animation while user is in queue
 * Polls match status every 2 seconds
 * Redirects to /voting-window when matched
 */
export default function SpinningPage() {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const realtimeSubRef = useRef<EnhancedRealtimeSubscription | null>(null)
  const [isSpinning, setIsSpinning] = useState(true)

  // Use 100% WebSocket (no polling) - optimized for Supabase Pro (200 connections)
  useEffect(() => {
    let isMounted = true
    let reconnectAttempts = 0
    const MAX_RECONNECT_ATTEMPTS = 5

    // Get user ID first
    const getUser = async () => {
      const { data: { user } } = await supabaseRef.current.auth.getUser()
      return user?.id
    }

    // Initial status check - retry multiple times to catch matches
    // CRITICAL: This catches matches created before page load or if WebSocket is delayed
    const checkInitialStatus = async () => {
      if (!isMounted) return
      
      // Check multiple times with increasing delays to catch matches that happen during page load
      const checks = [500, 1000, 2000, 3000] // Check at 0.5s, 1s, 2s, 3s
      
      for (const delay of checks) {
        if (!isMounted) return
        
        await new Promise(resolve => setTimeout(resolve, delay))
        
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5000)

          const response = await fetch('/api/match/status', {
            signal: controller.signal,
            cache: 'no-store',
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            if (response.status === 401) {
              setIsSpinning(false)
              router.push('/')
              return
            }
            continue // Try next check
          }

          const data = await response.json()

          // If already matched, redirect immediately (highest priority)
          if (data.match?.match_id) {
            if (process.env.NODE_ENV === 'development') {
              console.log('Match found on initial check, redirecting immediately', { 
                matchId: data.match.match_id,
                status: data.match.status,
                state: data.state,
                checkDelay: delay
              })
            }
            setIsSpinning(false)
            router.push(`/voting-window?matchId=${data.match.match_id}`)
            return
          }

          // CRITICAL FIX: If state is 'matched' but match_id is missing, fetch match from database
          // This handles race conditions where state was updated but match_id wasn't set yet
          if (data.state === 'matched' && !data.match?.match_id) {
            if (process.env.NODE_ENV === 'development') {
              console.warn('State is matched but no match_id found - fetching match from database')
            }
            // Try to get match_id from users_state table directly
            try {
              const { data: { user } } = await supabaseRef.current.auth.getUser()
              if (user) {
                const { data: userState } = await supabaseRef.current
                  .from('users_state')
                  .select('match_id')
                  .eq('user_id', user.id)
                  .eq('state', 'matched')
                  .single()
                
                if (userState?.match_id) {
                  if (process.env.NODE_ENV === 'development') {
                    console.log('Found match_id from users_state, redirecting', { matchId: userState.match_id })
                  }
                  setIsSpinning(false)
                  router.push(`/voting-window?matchId=${userState.match_id}`)
                  return
                }
              }
            } catch (error) {
              // Silently fail - will retry on next check
            }
          }

          // If idle (not in queue), redirect to spin page
          if (data.state === 'idle') {
            setIsSpinning(false)
            router.push('/spin')
            return
          }
        } catch (error: any) {
          if (error.name !== 'AbortError' && process.env.NODE_ENV === 'development') {
            console.warn(`Initial status check ${delay}ms failed, continuing`, { error: error.message })
          }
        }
      }
    }
    
    // Aggressive polling as backup - runs alongside WebSocket (dual strategy)
    // Starts immediately after initial checks, polls every 1.5 seconds
    // This ensures we catch matches even if WebSocket has issues
    let pollInterval: NodeJS.Timeout | null = null
    const startAggressivePolling = () => {
      if (pollInterval) return // Already polling
      
      // Start polling immediately (runs alongside WebSocket for redundancy)
      if (process.env.NODE_ENV === 'development') {
        console.log('Starting aggressive polling as backup (runs alongside WebSocket)')
      }
      
      // First poll after 2 seconds (after initial checks)
      setTimeout(() => {
        if (!isMounted) return
        
        // Start continuous polling
        pollInterval = setInterval(async () => {
          if (!isMounted) {
            if (pollInterval) clearInterval(pollInterval)
            return
          }
          
          try {
            const response = await fetch('/api/match/status', {
              cache: 'no-store',
            })
            
            if (response.ok) {
              const data = await response.json()
              if (data.match?.match_id) {
                if (process.env.NODE_ENV === 'development') {
                  console.log('Match found via polling, redirecting', { matchId: data.match.match_id })
                }
                setIsSpinning(false)
                if (pollInterval) {
                  clearInterval(pollInterval)
                  pollInterval = null
                }
                router.push(`/voting-window?matchId=${data.match.match_id}`)
                return
              }
              
              // CRITICAL FIX: Also check for matched state without match_id (race condition)
              if (data.state === 'matched' && !data.match?.match_id) {
                try {
                  const { data: { user } } = await supabaseRef.current.auth.getUser()
                  if (user) {
                    const { data: userState } = await supabaseRef.current
                      .from('users_state')
                      .select('match_id')
                      .eq('user_id', user.id)
                      .eq('state', 'matched')
                      .single()
                    
                    if (userState?.match_id) {
                      if (process.env.NODE_ENV === 'development') {
                        console.log('Match found via polling (from users_state), redirecting', { matchId: userState.match_id })
                      }
                      setIsSpinning(false)
                      if (pollInterval) {
                        clearInterval(pollInterval)
                        pollInterval = null
                      }
                      router.push(`/voting-window?matchId=${userState.match_id}`)
                      return
                    }
                  }
                } catch (error) {
                  // Silently fail - will retry on next poll
                }
              }
              
              // CRITICAL FIX: If state is 'matched' but no match_id found, check database directly
              // This handles cases where cache is stale or status endpoint has issues
              if (data.state === 'matched' && !data.match?.match_id) {
                try {
                  const { data: { user } } = await supabaseRef.current.auth.getUser()
                  if (user) {
                    // Query users_state table directly as fallback
                    const { data: userState, error: stateError } = await supabaseRef.current
                      .from('users_state')
                      .select('match_id, state')
                      .eq('user_id', user.id)
                      .eq('state', 'matched')
                      .maybeSingle()
                    
                    if (!stateError && userState?.match_id) {
                      if (process.env.NODE_ENV === 'development') {
                        console.log('✅ Match found via direct database query (fallback), redirecting', { matchId: userState.match_id })
                      }
                      setIsSpinning(false)
                      if (pollInterval) {
                        clearInterval(pollInterval)
                        pollInterval = null
                      }
                      router.push(`/voting-window?matchId=${userState.match_id}`)
                      return
                    }
                  }
                } catch (error) {
                  // Silently fail - will retry on next poll
                  if (process.env.NODE_ENV === 'development') {
                    console.warn('Error querying users_state directly:', error)
                  }
                }
              }
            }
          } catch (error) {
            // Silently fail - polling will retry
          }
        }, 1500) // Poll every 1.5 seconds
      }, 2000) // Start after 2 seconds (after initial checks complete)
    }

    // Set up real-time subscription for instant match notifications (100% WebSocket)
    const setupRealtime = async () => {
      const userId = await getUser()
      if (!userId || !isMounted) return

      // Subscribe to users_state changes for this user
      realtimeSubRef.current = new EnhancedRealtimeSubscription(
        supabaseRef.current,
        {
          table: 'users_state',
          filter: `user_id=eq.${userId}`,
          event: 'UPDATE',
          onUpdate: async (payload: any) => {
            if (!isMounted) return

            const updatedState = payload
            if (process.env.NODE_ENV === 'development') {
              console.log('Real-time state update received', { state: updatedState.state, matchId: updatedState.match_id })
            }

            // Reset reconnect attempts on successful update
            reconnectAttempts = 0

            // If matched, redirect immediately (no need to fetch status - we have match_id)
            if (updatedState.match_id) {
              if (process.env.NODE_ENV === 'development') {
                console.log('Match found via WebSocket, redirecting immediately', { matchId: updatedState.match_id })
              }
              setIsSpinning(false)
              // Redirect immediately - don't wait for status fetch
              // Voting window page will fetch status and handle expired windows if needed
              router.push(`/voting-window?matchId=${updatedState.match_id}`)
              return
            }
          },
          onError: (error) => {
            reconnectAttempts++
            if (process.env.NODE_ENV === 'development') {
              console.warn('Real-time subscription error', { 
                error: error.message, 
                attempts: reconnectAttempts,
                maxAttempts: MAX_RECONNECT_ATTEMPTS 
              })
            }

            // If too many reconnection attempts, show user-friendly message
            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
              setTimeout(() => {
                if (process.env.NODE_ENV === 'development') {
                  console.error('Too many WebSocket reconnection attempts, redirecting to spin page')
                }
                setIsSpinning(false)
                router.push('/spin')
              }, 0)
            }
          },
          onStatusChange: (status) => {
            if (status === 'SUBSCRIBED') {
              reconnectAttempts = 0 // Reset on successful connection
              if (process.env.NODE_ENV === 'development') {
                console.log('WebSocket subscription active')
              }
            } else if ((status === 'CLOSED' || status === 'CHANNEL_ERROR') && process.env.NODE_ENV === 'development') {
              console.warn('WebSocket connection issue', { status })
            }
          },
        },
        `user-state-${userId}`
      )

      try {
        await realtimeSubRef.current.subscribe()
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to subscribe to WebSocket', { error })
        }
        // Don't redirect immediately - let reconnection logic handle it
      }
    }

    // Run initial check, setup WebSocket, and start aggressive polling
    checkInitialStatus()
    setupRealtime()
    startAggressivePolling()

    return () => {
      isMounted = false
      if (realtimeSubRef.current) {
        realtimeSubRef.current.cleanup()
      }
      if (pollInterval) {
        clearInterval(pollInterval)
      }
    }
  }, [router])

  // Periodically update last_active to keep user prioritized in matching
  // This ensures actively spinning users get matched before stale queue users
  useEffect(() => {
    if (!isSpinning) return

    const updateLastActive = async () => {
      try {
        const { data: { user } } = await supabaseRef.current.auth.getUser()
        if (!user) return

        // Use heartbeat API endpoint (works with new state model)
        await fetch('/api/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id })
        })
      } catch (error) {
        // Silently fail - don't block on this
      }
    }

    // Update immediately, then every 7 seconds while spinning
    // CRITICAL: 7 seconds ensures last_active is always < 10 seconds old
    // Matching pool requires last_active > NOW() - INTERVAL '10 seconds'
    // With 7s interval, even if there's a 2-3s delay, last_active will still be < 10s old
    updateLastActive()
    const interval = setInterval(updateLastActive, 7000)

    return () => clearInterval(interval)
  }, [isSpinning])

  // OPTIMIZATION: Client-side retry matching for unmatched users
  // Retries matching every 2-3 seconds to ensure fast matching even when initial attempt fails
  // This is more aggressive than the server-side cron (5s) and ensures users match quickly
  useEffect(() => {
    if (!isSpinning) return

    let retryCount = 0
    const MAX_RETRIES = 20 // Retry for up to 60 seconds (20 * 3s)
    let retryInterval: NodeJS.Timeout | null = null

    const retryMatching = async () => {
      if (retryCount >= MAX_RETRIES) {
        // Stop retrying after max attempts
        if (retryInterval) {
          clearInterval(retryInterval)
          retryInterval = null
        }
        return
      }

      retryCount++

      try {
        const { data: { user } } = await supabaseRef.current.auth.getUser()
        if (!user) return

        // Check current state first - if already matched, stop retrying
        const statusResponse = await fetch('/api/match/status', {
          cache: 'no-store',
        })

        if (statusResponse.ok) {
          const statusData = await statusResponse.json()
          if (statusData.match?.match_id) {
            // Already matched, stop retrying
            if (retryInterval) {
              clearInterval(retryInterval)
              retryInterval = null
            }
            return
          }
        }

        // Retry matching via API endpoint (more reliable than direct RPC)
        const retryResponse = await fetch('/api/match/retry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })

        if (retryResponse.ok) {
          const retryData = await retryResponse.json()
          if (retryData.matched && retryData.match_id && process.env.NODE_ENV === 'development') {
            console.log(`✅ Client-side retry matched user after ${retryCount} attempts`)
          }
        }

        // If matched, the WebSocket or polling will catch it and redirect
        // No need to manually redirect here
      } catch (error) {
        // Silently fail - retry will continue
        if (process.env.NODE_ENV === 'development') {
          console.warn(`Retry matching attempt ${retryCount} failed:`, error)
        }
      }
    }

    // Start retrying after 2 seconds (give initial matching attempt time)
    // Then retry every 3 seconds
    setTimeout(() => {
      if (!isSpinning) return
      retryMatching() // First retry
      retryInterval = setInterval(retryMatching, 3000) // Then every 3 seconds
    }, 2000)

    return () => {
      if (retryInterval) {
        clearInterval(retryInterval)
      }
    }
  }, [isSpinning])

  return (
    <div className="min-h-screen w-full bg-[#050810] text-white flex items-center justify-center relative overflow-hidden">
      {/* Background layers */}
      <div className="fixed inset-0 bg-[#050810] pointer-events-none" />
      
      {/* Floating orbs */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-64 h-64 bg-teal-500/20 rounded-full blur-3xl pointer-events-none"
        animate={{
          x: [0, 50, 0],
          y: [0, -30, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Spin animation */}
      <AnimatePresence>
        {isSpinning && (
          <motion.div
            className="flex flex-col items-center justify-center z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="flex items-center justify-center"
              animate={{
                rotate: [0, 360],
                scale: [1, 1.1, 1]
              }}
              transition={{
                rotate: {
                  duration: 2,
                  repeat: Infinity,
                  ease: "linear"
                },
                scale: {
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut"
                }
              }}
            >
              <SparklesIcon className="w-32 h-32 sm:w-40 sm:h-40 text-teal-300" />
            </motion.div>
            <motion.p
              className="mt-8 text-lg sm:text-xl text-teal-300 opacity-80"
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              Finding your match...
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

