"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"

/**
 * /voting-window page
 * 
 * Shows partner profile and voting buttons
 * Handles acknowledgment and voting
 */
function VotingWindowContent() {
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
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

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

        if (!statusResponse.ok) {
          router.push('/spin')
          return
        }

        // CRITICAL: Check if match outcome is 'both_yes' - redirect to video-date
        if (statusData.match?.outcome === 'both_yes' && statusData.match?.match_id) {
          router.push(`/video-date?matchId=${statusData.match.match_id}`)
          return
        }

        // Check if vote window has expired (before checking other states)
        if (statusData.match?.vote_window_expires_at) {
          const expiresAt = new Date(statusData.match.vote_window_expires_at).getTime()
          const now = Date.now()
          
          if (now >= expiresAt && statusData.match?.status !== 'completed') {
            // Vote window expired - check match votes to determine if user voted
            // Get current user ID to check their vote
            const expiredBySeconds = Math.floor((now - expiresAt) / 1000)
            
            // Check if user voted by looking at match votes
            // We need to get current user ID from auth
            fetch('/api/match/status').then(async (response) => {
              const data = await response.json()
              const currentUserId = data.user_id // From get_user_match_status
              
              // Determine if this user voted
              const userVoted = (
                (data.match?.user1_id === currentUserId && data.match?.user1_vote) ||
                (data.match?.user2_id === currentUserId && data.match?.user2_vote)
              )
              
              if (process.env.NODE_ENV === 'development') {
                console.log('Vote window expired', {
                  expiredBy: expiredBySeconds + ' seconds',
                  userState: statusData.state,
                  userVoted: userVoted,
                  currentUserId: currentUserId,
                  match: data.match
                })
              }
              
              // Record metric: window expired
              fetch('/api/match/metrics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  match_id: matchId,
                  metric_type: userVoted ? 'window_expired_after_vote' : 'window_expired_before_vote',
                  value: { expired_by_seconds: expiredBySeconds }
                })
              }).catch(() => {})
              
              // Redirect based on whether user voted
              if (userVoted) {
                // User voted yes - will be auto-spun to /spinning when cron resolves
                router.push('/spinning')
              } else {
                // User didn't vote - redirect to /spin
                router.push('/spin')
              }
            }).catch(() => {
              // Fallback: check user state
              if (statusData.state === 'idle') {
                router.push('/spin')
              } else {
                router.push('/spinning')
              }
            })
            return
          }
        }

        // If user is already re-queued (waiting) or idle, redirect to spinning
        if (statusData.state === 'waiting' || statusData.state === 'idle') {
          router.push('/spinning')
          return
        }

        // If no match and not in waiting/idle, redirect to spin
        if (!statusData.match) {
          router.push('/spin')
          return
        }

        // Set partner info
        if (statusData.match.partner) {
          setPartner(statusData.match.partner)
        }

        // If match is already completed, handle outcome
        if (statusData.match?.status === 'completed') {
          if (statusData.match?.outcome === 'both_yes') {
            // Both yes → redirect to video-date
            router.push(`/video-date?matchId=${statusData.match.match_id}`)
            return
          } else {
            // Other outcomes → redirect to spinning (auto-requeued or manual spin)
            router.push('/spinning')
            return
          }
        }

        // Unified flow: Vote windows are always auto-started, acknowledgments are for tracking only
        // Check if vote window exists (auto-started or manually started)
        if (statusData.match?.vote_window_expires_at) {
          // Check if vote window has expired
          const expiresAt = new Date(statusData.match.vote_window_expires_at).getTime()
          const now = Date.now()
          
          if (now >= expiresAt) {
            // Vote window expired - check if user voted by looking at match votes
            const expiredBySeconds = Math.floor((now - expiresAt) / 1000)
            
            // Determine if current user voted by checking match votes
            // statusData should include user_id from get_user_match_status (after migration)
            const currentUserId = statusData.user_id
            const match = statusData.match
            
            // Check if current user voted by comparing user_id with match.user1_id/user2_id
            const userVoted = currentUserId && match && (
              (match.user1_id === currentUserId && match.user1_vote) ||
              (match.user2_id === currentUserId && match.user2_vote)
            )
            
            if (process.env.NODE_ENV === 'development') {
              console.log('Vote window expired', {
                expiresAt: new Date(expiresAt).toISOString(),
                now: new Date(now).toISOString(),
                expiredBy: expiredBySeconds + ' seconds',
                userState: statusData.state,
                userVoted: userVoted,
                currentUserId: currentUserId
              })
            }
            
            // Redirect based on whether user voted
            if (userVoted) {
              // User voted yes - will be auto-spun to /spinning when cron resolves (yes_idle outcome)
              router.push('/spinning')
            } else {
              // User didn't vote - redirect to /spin (idle state)
              router.push('/spin')
            }
            return
          }
          
          // Vote window is active - start countdown and optionally acknowledge (for tracking)
          startCountdown(statusData.match.vote_window_expires_at)
          
          // Record acknowledgment for analytics (optional, doesn't affect vote window)
          // Only acknowledge once per page load
          if (!acknowledged) {
            setAcknowledged(true)
            // Fire-and-forget acknowledgment (for analytics)
            fetch('/api/match/acknowledge', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ match_id: matchId })
            }).catch(() => {
              // Ignore errors - acknowledgment is optional for analytics
            })
          }
        } else if (statusData.match?.status === 'paired') {
          // Legacy flow: Match is paired but vote window not started yet
          // This shouldn't happen with auto-start, but handle gracefully
          if (process.env.NODE_ENV === 'development') {
            console.warn('Match is paired but vote window not started - this indicates a mismatch. Attempting to acknowledge.')
          }
          
          // Try to acknowledge (may start vote window in legacy flow)
          const ackResponse = await fetch('/api/match/acknowledge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ match_id: matchId })
          })

          if (ackResponse.ok) {
            const ackData = await ackResponse.json()
            if (ackData.vote_window_expires_at) {
              startCountdown(ackData.vote_window_expires_at)
              setAcknowledged(true)
            } else {
              // Waiting for partner - will be handled by polling
              setAcknowledged(false)
            }
          }
        } else {
          // No vote window and not paired - invalid state, redirect to spin
          if (process.env.NODE_ENV === 'development') {
            console.warn('Invalid match state - no vote window and not paired', {
              status: statusData.match?.status,
              state: statusData.state
            })
          }
          router.push('/spin')
          return
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
    const updateCountdown = async () => {
      const now = new Date().getTime()
      const expires = new Date(expiresAt).getTime()
      const remaining = Math.max(0, Math.floor((expires - now) / 1000))
      
      setCountdownSeconds(remaining)
      
      if (remaining <= 0) {
        // Countdown reached 0 - vote window expired
        // Check match status to determine redirect
        try {
          const response = await fetch('/api/match/status')
          const data = await response.json()
          
          if (response.ok && data.match) {
            const currentUserId = data.user_id
            const match = data.match
            
            // Check if current user voted
            const userVoted = currentUserId && match && (
              (match.user1_id === currentUserId && match.user1_vote) ||
              (match.user2_id === currentUserId && match.user2_vote)
            )
            
            if (process.env.NODE_ENV === 'development') {
              console.log('Countdown reached 0 - vote window expired', {
                userVoted: userVoted,
                currentUserId: currentUserId,
                match: match
              })
            }
            
            // Redirect based on whether user voted
            if (userVoted) {
              // User voted yes - redirect to /spinning (will be auto-spun)
              router.push('/spinning')
            } else {
              // User didn't vote - redirect to /spin
              router.push('/spin')
            }
          }
        } catch (error) {
          console.error('Error checking match status when countdown expired:', error)
        }
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

  // Poll for match status changes (in case partner votes or match ends)
  // Start polling immediately when matchId is available
  useEffect(() => {
    if (!matchId) return

    const pollMatchStatus = async () => {
      try {
        const response = await fetch('/api/match/status')
        const data = await response.json()

        if (!response.ok) {
          return
        }

        // CRITICAL: Check if vote window expired (before checking outcomes)
        if (data.match?.vote_window_expires_at) {
          const expiresAt = new Date(data.match.vote_window_expires_at).getTime()
          const now = Date.now()
          
          if (now >= expiresAt && data.match?.status !== 'completed') {
            // Vote window expired - check if user voted by looking at match votes
            const expiredBySeconds = Math.floor((now - expiresAt) / 1000)
            const currentUserId = data.user_id
            const match = data.match
            
            // Check if current user voted by comparing user_id with match.user1_id/user2_id
            const userVoted = currentUserId && match && (
              (match.user1_id === currentUserId && match.user1_vote) ||
              (match.user2_id === currentUserId && match.user2_vote)
            )
            
            if (process.env.NODE_ENV === 'development') {
              console.log('Polling detected vote window expired', {
                expiredBy: expiredBySeconds + ' seconds',
                userState: data.state,
                userVoted: userVoted,
                currentUserId: currentUserId
              })
            }
            
            // Redirect based on whether user voted
            if (userVoted) {
              // User voted yes - will be auto-spun to /spinning when cron resolves (yes_idle outcome)
              router.push('/spinning')
              return
            } else {
              // User didn't vote - redirect to /spin (idle state)
              router.push('/spin')
              return
            }
          }
        }

        // CRITICAL: Check if match outcome is 'both_yes' - redirect to video-date
        // get_user_match_status now returns the match even if match_id is cleared (for both_yes)
        // This must be checked FIRST before checking idle/waiting state
        if (data.match?.outcome === 'both_yes' && data.match?.match_id) {
          console.log('Both users voted yes, redirecting to video-date', { outcome: data.match.outcome, matchId: data.match.match_id })
          router.push(`/video-date?matchId=${data.match.match_id}`)
          return
        }

        // If match is completed but outcome is not both_yes, redirect to spinning
        if (data.match?.status === 'completed' && data.match?.outcome !== 'both_yes') {
          console.log('Match completed (not both_yes), redirecting to spinning', { status: data.match.status, outcome: data.match.outcome })
          router.push('/spinning')
          return
        }

        // CRITICAL: Always check outcome if we have a matchId (even if match is cleared from users_state)
        // When both_yes occurs, match_id is cleared from users_state, but match still exists with outcome
        if (matchId) {
          // Check outcome regardless of whether match is in response
          // This handles the case where match_id was cleared but outcome is both_yes
          try {
            const matchCheckResponse = await fetch(`/api/match/check-outcome?matchId=${matchId}`, {
              cache: 'no-store',
              headers: { 'Cache-Control': 'no-cache' }
            })
            
            if (matchCheckResponse.ok) {
              const matchCheckData = await matchCheckResponse.json()
              
              if (matchCheckData.outcome === 'both_yes' && matchCheckData.status === 'completed') {
                console.log('✅ Polling found both_yes outcome, redirecting to video-date', { matchId, matchCheckData })
                router.push(`/video-date?matchId=${matchId}`)
                return
              } else if (matchCheckData.outcome && matchCheckData.status === 'completed') {
                // Match completed with other outcome (yes_pass, pass_pass) - redirect to spinning
                console.log('Polling found completed match with outcome:', matchCheckData.outcome, 'redirecting to spinning')
                router.push('/spinning')
                return
              }
            }
          } catch (error) {
            console.error('Error checking match outcome in polling:', error, { matchId })
          }
        }

        // If user is now idle or waiting and match exists in response, check outcome
        if ((data.state === 'idle' || data.state === 'waiting') && data.match) {
          // Match still in response - check outcome
          if (data.match.outcome === 'both_yes') {
            console.log('Match outcome is both_yes, redirecting to video-date', { matchId: data.match.match_id })
            router.push(`/video-date?matchId=${data.match.match_id}`)
            return
          } else if (data.match.status === 'completed' && data.match.outcome !== 'both_yes') {
            // Match completed with other outcome - check user state to determine redirect
            if (data.state === 'idle') {
              // User is idle (didn't vote) - redirect to /spin
              console.log('Match completed, user is idle (didn\'t vote), redirecting to /spin', { status: data.match.status, outcome: data.match.outcome, state: data.state })
              router.push('/spin')
            } else {
              // User is waiting (voted and auto-spun) - redirect to /spinning
              console.log('Match completed, user is waiting (voted), redirecting to /spinning', { status: data.match.status, outcome: data.match.outcome, state: data.state })
              router.push('/spinning')
            }
            return
          }
        }

        // If no match exists and user is waiting/idle (and we don't have a matchId to check)
        // Only redirect if we don't have a stored matchId to check
        if (!data.match && !matchId) {
          // Check user state to determine redirect
          if (data.state === 'idle') {
            // User is idle - redirect to /spin
            console.log('No match found, user in idle state, redirecting to /spin', { state: data.state })
            router.push('/spin')
          } else if (data.state === 'waiting') {
            // User is waiting - redirect to /spinning
            console.log('No match found, user in waiting state, redirecting to /spinning', { state: data.state })
            router.push('/spinning')
          }
          return
        }
      } catch (error) {
        console.error('Error polling match status:', error)
      }
    }

    // Poll immediately, then every 500ms (faster polling for better vote detection)
    pollMatchStatus()
    pollingRef.current = setInterval(pollMatchStatus, 500)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [matchId, router])

  // Handle vote
  const handleVote = async (voteType: 'yes' | 'pass') => {
    if (!matchId || userVote !== null) {
      console.log('⚠️ handleVote early return:', { matchId, userVote, voteType })
      return
    }

    try {
      console.log('📤 Sending vote:', { matchId, voteType })
      
      // Set userVote AFTER starting the fetch to prevent double-clicks, but don't block
      setUserVote(voteType)

      let response: Response
      let data: any
      
      try {
        response = await fetch('/api/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            match_id: matchId,
            vote: voteType
          })
        })
        
        console.log('📥 Vote response:', { status: response.status, ok: response.ok, statusText: response.statusText })
        
        try {
          data = await response.json()
          console.log('📥 Vote response data:', data)
        } catch (jsonError) {
          const text = await response.text()
          console.error('❌ Failed to parse vote response as JSON:', text)
          setUserVote(null)
          return
        }
      } catch (fetchError: any) {
        console.error('❌ Fetch error when sending vote:', fetchError)
        setUserVote(null)
        return
      }

      if (!response.ok) {
        console.error('Failed to record vote - Full response:', {
          status: response.status,
          statusText: response.statusText,
          error: data.error,
          details: data.details,
          hint: data.hint,
          code: data.code,
          full_data: data
        })
        setUserVote(null)
        return
      }

      // Handle API response - record_vote returns { outcome, completed, message? } OR { error }
      if (data.error) {
        console.error('❌ Vote API returned error:', data.error, data.details)
        setUserVote(null)
        return
      }
      
      // New API response format: { outcome, completed, message? }
      if (data.completed && data.outcome) {
        // Match completed - handle outcome immediately
        if (data.outcome === 'both_yes') {
          // Both yes → redirect to video-date
          console.log('✅ Both users voted yes, redirecting to video-date immediately', { outcome: data.outcome, matchId })
          router.push(`/video-date?matchId=${matchId}`)
          return
        } else if (data.outcome === 'yes_pass' || data.outcome === 'pass_pass') {
          // Yes+pass or pass+pass → auto-requeued, redirect to spinning
          console.log('Match completed, auto-requeued', { outcome: data.outcome })
          router.push('/spinning')
          return
        }
        // Other outcomes (pass_idle, yes_idle, idle_idle) handled by polling
      } else if (!data.completed) {
        // Not completed yet - check if partner just voted (race condition)
        // The second voter's vote completes the match, but first voter gets this response
        console.log('⏳ Waiting for partner to vote', { message: data.message, matchId })
        
        // Check outcome immediately - partner might have just voted in parallel
        const checkOutcomeNow = async () => {
          try {
            console.log('🔍 Checking match outcome immediately after vote...', { matchId })
            const checkResponse = await fetch(`/api/match/check-outcome?matchId=${matchId}`, {
              cache: 'no-store',
              headers: { 'Cache-Control': 'no-cache' }
            })
            
            if (checkResponse.ok) {
              const checkData = await checkResponse.json()
              console.log('📊 Match outcome check result:', checkData)
              
              if (checkData.outcome === 'both_yes') {
                console.log('✅ FOUND: Partner voted - outcome is both_yes, redirecting to video-date', { matchId })
                router.push(`/video-date?matchId=${matchId}`)
                return true
              } else if (checkData.outcome && checkData.status === 'completed') {
                console.log('Match completed with outcome:', checkData.outcome)
                if (checkData.outcome === 'both_yes' && checkData.status === 'completed') {
                  console.log('✅ Match completed with both_yes - redirecting to video-date', { matchId })
                  router.push(`/video-date?matchId=${matchId}`)
                  return true
                }
              } else {
                console.log('Match not completed yet:', checkData)
              }
            } else {
              const errorText = await checkResponse.text()
              console.log('❌ Failed to check outcome:', checkResponse.status, errorText)
            }
          } catch (error) {
            console.error('❌ Error checking outcome:', error)
          }
          return false
        }
        
        // Check immediately (handle race condition where votes happen simultaneously)
        checkOutcomeNow().then((redirected) => {
          if (!redirected) {
            // Check again after short delays
            setTimeout(() => {
              console.log('🔍 Re-checking outcome after 300ms...', { matchId })
              checkOutcomeNow()
            }, 300)
            setTimeout(() => {
              console.log('🔍 Re-checking outcome after 1000ms...', { matchId })
              checkOutcomeNow()
            }, 1000)
          }
        })
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
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              console.log('🔘 Yes button clicked', { matchId, userVote })
              handleVote('yes').catch((error) => {
                console.error('❌ Error in handleVote:', error)
              })
            }}
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

export default function VotingWindowPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full bg-[#050810] text-white flex items-center justify-center">
        <div className="text-teal-300 text-xl">Loading...</div>
      </div>
    }>
      <VotingWindowContent />
    </Suspense>
  )
}

