"use client"

import { motion } from "framer-motion"
import { useEffect, useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"

interface MatchSynchronizedCountdownTimerProps {
  matchId: string // Match ID to fetch synchronized time from database
  initialSeconds: number
  onComplete?: () => void
  className?: string
  pollingInterval?: number // How often to poll database (default: 500ms)
}

/**
 * MatchSynchronizedCountdownTimer
 * 
 * Synchronized countdown timer that uses match ID to fetch remaining time from database.
 * This ensures both users see the exact same countdown time, synchronized via database NOW().
 * 
 * Similar to video date countdown, but for voting window.
 */
export function MatchSynchronizedCountdownTimer({
  matchId,
  initialSeconds,
  onComplete,
  className,
  pollingInterval = 500, // Poll every 500ms for smooth updates
}: MatchSynchronizedCountdownTimerProps) {
  const [seconds, setSeconds] = useState(initialSeconds)
  const onCompleteRef = useRef(onComplete)
  const supabase = createClient()

  // Debug: Log when component mounts and matchId changes
  useEffect(() => {
    console.log('MatchSynchronizedCountdownTimer mounted/updated:', { matchId, initialSeconds })
  }, [matchId, initialSeconds])

  // Update ref when callback changes
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  // Fetch remaining time from database using match ID
  const fetchRemainingTime = async (): Promise<number | null> => {
    if (!matchId) {
      return null
    }
    
    try {
      const { data, error } = await supabase.rpc('get_voting_window_remaining', {
        p_match_id: matchId
      })

      if (error) {
        // Only log if it's not a "not found" error (match might have been deleted)
        if (error.code !== 'PGRST116' && error.message && !error.message.includes('not found')) {
          console.warn('⚠️ Voting window RPC error:', error.message, error.code)
        }
        return null
      }

      // data is the remaining seconds (INTEGER) or null if match not found/closed
      if (data === null) {
        return null
      }
      
      return Math.max(0, data)
    } catch (err) {
      // Silently handle errors - match might be deleted or closed
      return null
    }
  }

  // Poll database for synchronized countdown
  useEffect(() => {
    console.log('🕐 MatchSynchronizedCountdownTimer: Effect triggered', { matchId, initialSeconds })
    
    if (!matchId) {
      console.warn('⚠️ MatchSynchronizedCountdownTimer: No matchId provided, using initialSeconds')
      setSeconds(initialSeconds)
      return
    }

    // Initial fetch - ALWAYS set seconds to initialSeconds first so timer is visible immediately
    setSeconds(initialSeconds)
    console.log('✅ MatchSynchronizedCountdownTimer: Set initial seconds to', initialSeconds, '- timer should be visible now')

    // Then fetch actual remaining time from database
    fetchRemainingTime().then((remaining) => {
      if (remaining !== null) {
        console.log('MatchSynchronizedCountdownTimer: Initial remaining time from DB:', remaining)
        setSeconds(remaining)
        
        // If countdown already completed, call onComplete
        if (remaining <= 0) {
          setTimeout(() => {
            onCompleteRef.current?.()
          }, 0)
          return
        }
      } else {
        // If RPC fails initially, keep using initialSeconds so countdown is visible
        console.warn('MatchSynchronizedCountdownTimer: Initial fetch failed, keeping initialSeconds:', initialSeconds)
        // Don't change seconds - already set to initialSeconds above
      }
    })

    // Poll database every pollingInterval for perfect synchronization
    const timer = setInterval(async () => {
      const remaining = await fetchRemainingTime()
      
      if (remaining === null) {
        // RPC failed - don't update countdown, will retry on next interval
        // This ensures we don't use client-side calculation which causes drift
        console.warn('⚠️ Voting window RPC failed, keeping current value, will retry...')
        return
      }
      
      // Use database-calculated remaining time (perfect synchronization)
      setSeconds(remaining)
      
      if (remaining <= 0) {
        clearInterval(timer)
        setSeconds(0)
        setTimeout(() => {
          onCompleteRef.current?.()
        }, 0)
      }
    }, pollingInterval)

    return () => clearInterval(timer)
  }, [matchId, pollingInterval, initialSeconds])

  // Always render the timer - don't return null
  // Even if seconds is 0 or negative, show it so user knows timer exists
  // Debug: Log render
  console.log('🕐 MatchSynchronizedCountdownTimer: RENDERING with seconds:', seconds, 'matchId:', matchId, 'should be visible')
  
  return (
    <div 
      className={className}
      style={{
        background: 'transparent',
        border: 'none',
        outline: 'none',
        boxShadow: 'none',
        minWidth: '50px', // Ensure minimum width so it's always visible
        minHeight: '30px', // Ensure minimum height
        display: 'inline-block', // Ensure it takes up space
        visibility: 'visible', // Force visibility
        opacity: 1, // Force opacity
      }}
      data-testid="vote-countdown"
    >
      <motion.div
        key={seconds}
        initial={{ scale: 1.2, opacity: 0 }}
        animate={{ 
          scale: 1, 
          opacity: 1, // Explicitly set opacity to 1
        }}
        exit={{ scale: 0.8, opacity: 0 }}
        className="text-center"
        style={{
          background: 'transparent',
          border: '0',
          outline: '0',
          boxShadow: 'none',
          margin: '0',
          padding: '0',
          clipPath: 'none',
          WebkitAppearance: 'none',
          appearance: 'none',
          visibility: 'visible',
          display: 'block',
          minWidth: '40px',
          minHeight: '20px',
          opacity: 1, // Force opacity in style as well (fallback if animation fails)
        }}
      >
        <motion.span 
          className="text-sm sm:text-3xl md:text-4xl font-extrabold text-teal-300"
          style={{
            visibility: 'visible',
            display: 'inline-block',
            minWidth: '30px', // Ensure number is always visible
            opacity: 1, // Force opacity to 1
            color: '#5eead4', // Explicit teal-300 color
            fontSize: '1.5rem', // Ensure minimum font size
          }}
          animate={{
            textShadow: [
              "0 0 15px rgba(94,234,212,0.7)",
              "0 0 30px rgba(94,234,212,1)",
              "0 0 15px rgba(94,234,212,0.7)",
            ],
            opacity: 1, // Always visible
            color: '#5eead4', // Explicit color in animation
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {Math.max(0, seconds)}
        </motion.span>
        <span 
          className="text-sm sm:text-3xl md:text-4xl opacity-70 ml-0.5 sm:ml-1"
          style={{
            visibility: 'visible',
            display: 'inline-block',
            color: '#5eead4', // Explicit teal-300 color
            fontSize: '1.5rem', // Ensure minimum font size
          }}
        >
          s
        </span>
      </motion.div>
    </div>
  )
}

