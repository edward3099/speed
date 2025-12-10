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

    // One-time initial status check (not polling)
    const checkInitialStatus = async () => {
      if (!isMounted) return
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
          return
        }

        const data = await response.json()

        // If already matched, redirect immediately
        if (data.match?.match_id) {
          if (process.env.NODE_ENV === 'development') {
            console.log('Match found on initial check, redirecting', { matchId: data.match.match_id })
          }
          setIsSpinning(false)
          router.push(`/voting-window?matchId=${data.match.match_id}`)
          return
        }

        // If idle (not in queue), redirect to spin page
        if (data.state === 'idle') {
          setIsSpinning(false)
          router.push('/spin')
          return
        }
        
        // If matched, redirect to voting window
        if (data.state === 'matched' && data.match?.match_id) {
          setIsSpinning(false)
          router.push(`/voting-window?matchId=${data.match.match_id}`)
          return
        }
      } catch (error: any) {
        if (error.name !== 'AbortError' && process.env.NODE_ENV === 'development') {
          console.warn('Initial status check failed, continuing with WebSocket', { error: error.message })
        }
      }
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

            // If matched, fetch full status and redirect
            if (updatedState.match_id) {
              try {
                const response = await fetch('/api/match/status', {
                  signal: AbortSignal.timeout(5000),
                })
                if (response.ok) {
                  const data = await response.json()
                  if (data.match?.match_id) {
                    setTimeout(() => {
                      if (process.env.NODE_ENV === 'development') {
                        console.log('Match found via WebSocket, redirecting', { matchId: data.match.match_id })
                      }
                      setIsSpinning(false)
                      router.push(`/voting-window?matchId=${data.match.match_id}`)
                    }, 0)
                    return
                  }
                }
              } catch (error) {
                if (process.env.NODE_ENV === 'development') {
                  setTimeout(() => {
                    console.error('Error fetching match status after real-time update', { error })
                  }, 0)
                }
              }
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

    // Run initial check and setup WebSocket
    checkInitialStatus()
    setupRealtime()

    return () => {
      isMounted = false
      if (realtimeSubRef.current) {
        realtimeSubRef.current.cleanup()
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

