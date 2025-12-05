"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"

/**
 * /voting-window page
 * 
 * Shows partner profile and voting buttons
 * Handles acknowledgment and voting
 */
export default function VotingWindowPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const matchId = searchParams.get('matchId')
  
  const [partner, setPartner] = useState<{
    id: string
    name: string
    age: number | null
    photo: string
    bio: string
  } | null>(null)
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null)
  const [userVote, setUserVote] = useState<'yes' | 'pass' | null>(null)
  const [loading, setLoading] = useState(true)
  const [acknowledged, setAcknowledged] = useState(false)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch match status and acknowledge
  useEffect(() => {
    if (!matchId) {
      router.push('/spin')
      return
    }

    const fetchMatchAndAcknowledge = async () => {
      try {
        // Get match status
        const statusResponse = await fetch('/api/match/status')
        const statusData = await statusResponse.json()

        if (!statusResponse.ok || !statusData.match) {
          router.push('/spin')
          return
        }

        // Set partner info
        if (statusData.match.partner) {
          setPartner(statusData.match.partner)
        }

        // If already in vote_window, start countdown
        if (statusData.state === 'vote_window' && statusData.match.vote_window_expires_at) {
          startCountdown(statusData.match.vote_window_expires_at)
          setAcknowledged(true)
          setLoading(false)
          return
        }

        // If in paired state, acknowledge
        if (statusData.state === 'paired') {
          const ackResponse = await fetch('/api/match/acknowledge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ match_id: matchId })
          })

          const ackData = await ackResponse.json()

          if (ackData.vote_window_started && ackData.vote_window_expires_at) {
            startCountdown(ackData.vote_window_expires_at)
            setAcknowledged(true)
          }
        }

        setLoading(false)
      } catch (error) {
        console.error('Error fetching match:', error)
        router.push('/spin')
      }
    }

    fetchMatchAndAcknowledge()
  }, [matchId, router])

  // Start countdown timer
  const startCountdown = (expiresAt: string) => {
    const updateCountdown = () => {
      const now = new Date().getTime()
      const expires = new Date(expiresAt).getTime()
      const remaining = Math.max(0, Math.floor((expires - now) / 1000))
      
      setCountdownSeconds(remaining)
      
      if (remaining <= 0) {
        return
      }
      
      countdownRef.current = setTimeout(updateCountdown, 1000)
    }
    
    updateCountdown()
  }

  // Cleanup countdown
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearTimeout(countdownRef.current)
      }
    }
  }, [])

  // Handle vote
  const handleVote = async (voteType: 'yes' | 'pass') => {
    if (!matchId || userVote !== null) return

    try {
      setUserVote(voteType)

      const response = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match_id: matchId,
          vote: voteType
        })
      })

      const data = await response.json()

      if (!response.ok) {
        console.error('Failed to record vote:', data.error)
        setUserVote(null)
        return
      }

      // If both yes, redirect to video-date
      if (data.outcome === 'both_yes' && matchId) {
        router.push(`/video-date?matchId=${matchId}`)
      } else if (data.match_ended) {
        // Match ended, redirect back to spinning (auto-requeued) or spin
        router.push('/spinning')
      }
    } catch (error) {
      console.error('Error recording vote:', error)
      setUserVote(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[#050810] text-white flex items-center justify-center">
        <div className="text-teal-300 text-xl">Loading...</div>
      </div>
    )
  }

  if (!partner) {
    return (
      <div className="min-h-screen w-full bg-[#050810] text-white flex items-center justify-center">
        <div className="text-teal-300 text-xl">No match found</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-[#050810] text-white flex items-center justify-center relative overflow-hidden px-4">
      {/* Background */}
      <div className="fixed inset-0 bg-[#050810] pointer-events-none" />

      {/* Content */}
      <motion.div
        className="max-w-md w-full flex flex-col items-center gap-6 z-10"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        {/* Partner profile */}
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {partner.photo && (
            <motion.img
              src={partner.photo}
              alt={partner.name}
              className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-teal-300"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.3 }}
            />
          )}
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-teal-300">
              {partner.name}
              {partner.age && `, ${partner.age}`}
            </h2>
            {partner.bio && (
              <p className="mt-2 text-sm sm:text-base opacity-80">{partner.bio}</p>
            )}
          </div>
        </motion.div>

        {/* Countdown timer */}
        {countdownSeconds !== null && (
          <motion.div
            className={`text-4xl sm:text-5xl font-bold ${
              countdownSeconds === 0 ? 'text-red-400' : 'text-teal-300'
            }`}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            {countdownSeconds === 0 ? "Time's Up!" : countdownSeconds}
          </motion.div>
        )}

        {/* Vote buttons */}
        <motion.div
          className="flex gap-4 w-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <motion.button
            onClick={() => handleVote('pass')}
            disabled={userVote !== null}
            className="flex-1 px-6 py-4 rounded-xl bg-white/10 border-2 border-white/20 hover:bg-white/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg"
            whileHover={{ scale: userVote === null ? 1.05 : 1 }}
            whileTap={{ scale: userVote === null ? 0.95 : 1 }}
          >
            {userVote === 'pass' ? '✓ Respin' : 'Respin'}
          </motion.button>
          <motion.button
            onClick={() => handleVote('yes')}
            disabled={userVote !== null}
            className="flex-1 px-6 py-4 rounded-xl bg-teal-300 text-black hover:bg-teal-200 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg"
            whileHover={{ scale: userVote === null ? 1.05 : 1 }}
            whileTap={{ scale: userVote === null ? 0.95 : 1 }}
          >
            {userVote === 'yes' ? '✓ Yes' : 'Yes'}
          </motion.button>
        </motion.div>
      </motion.div>
    </div>
  )
}

