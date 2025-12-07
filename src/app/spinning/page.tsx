"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles as SparklesIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { EnhancedRealtimeSubscription } from "@/lib/utils/enhanced-realtime"
import { log, logApi, profiler } from "@/lib/debug"
import { WaitTimeIndicator } from "@/components/WaitTimeIndicator"

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

        const response = await profiler.measure('match-status-initial', async () => {
          return await fetch('/api/match/status', {
            signal: controller.signal,
            cache: 'no-store',
          })
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
          log.info('Match found on initial check, redirecting', { matchId: data.match.match_id })
          setIsSpinning(false)
          router.push(`/voting-window?matchId=${data.match.match_id}`)
          return
        }

        // If idle (not in queue), automatically join queue
        if (data.state === 'idle') {
          try {
            const spinController = new AbortController()
            const spinTimeoutId = setTimeout(() => spinController.abort(), 5000)
            
            const spinResponse = await fetch('/api/spin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: spinController.signal,
            })
            
            clearTimeout(spinTimeoutId)
            
            if (!spinResponse.ok) {
              log.warn('Failed to join queue on initial check')
              setIsSpinning(false)
              router.push('/spin')
            }
          } catch (error) {
            log.error('Error joining queue on initial check', { error })
            setIsSpinning(false)
            router.push('/spin')
          }
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          log.warn('Initial status check failed, continuing with WebSocket', { error: error.message })
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
            log.info('Real-time state update received', { state: updatedState.state, matchId: updatedState.match_id })

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
                      log.info('Match found via WebSocket, redirecting', { matchId: data.match.match_id })
                      setIsSpinning(false)
                      router.push(`/voting-window?matchId=${data.match.match_id}`)
                    }, 0)
                    return
                  }
                }
              } catch (error) {
                setTimeout(() => {
                  log.error('Error fetching match status after real-time update', { error })
                }, 0)
              }
            }
          },
          onError: (error) => {
            reconnectAttempts++
            log.warn('Real-time subscription error', { 
              error: error.message, 
              attempts: reconnectAttempts,
              maxAttempts: MAX_RECONNECT_ATTEMPTS 
            })

            // If too many reconnection attempts, show user-friendly message
            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
              setTimeout(() => {
                log.error('Too many WebSocket reconnection attempts, redirecting to spin page')
                setIsSpinning(false)
                router.push('/spin')
              }, 0)
            }
          },
          onStatusChange: (status) => {
            if (status === 'SUBSCRIBED') {
              reconnectAttempts = 0 // Reset on successful connection
              log.info('WebSocket subscription active')
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
              log.warn('WebSocket connection issue', { status })
            }
          },
        },
        `user-state-${userId}`
      )

      try {
        await realtimeSubRef.current.subscribe()
      } catch (error) {
        log.error('Failed to subscribe to WebSocket', { error })
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

  // Get user gender for wait time estimation
  const [userGender, setUserGender] = useState<'male' | 'female' | 'other' | undefined>()

  useEffect(() => {
    // Fetch user profile to get gender for wait time estimation
    const fetchUserGender = async () => {
      try {
        const { data: { user } } = await supabaseRef.current.auth.getUser()
        if (user) {
          const { data: profile } = await supabaseRef.current
            .from('profiles')
            .select('gender')
            .eq('id', user.id)
            .single()
          
          if (profile?.gender) {
            setUserGender(profile.gender as 'male' | 'female' | 'other')
          }
        }
      } catch (error) {
        // Silently fail - wait time will show average
      }
    }
    fetchUserGender()
  }, [])

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
            
            {/* Wait Time Indicator */}
            <div className="mt-6 max-w-md w-full px-4">
              <WaitTimeIndicator userGender={userGender} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

