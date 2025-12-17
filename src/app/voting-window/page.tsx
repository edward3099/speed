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
    location: string | null
  } | null>(null)
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null)
  const [userVote, setUserVote] = useState<'yes' | 'pass' | null>(null)
  const [loading, setLoading] = useState(true)
  const [acknowledged, setAcknowledged] = useState(false)
  const [retryAttempts, setRetryAttempts] = useState(0)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  // CRITICAL: Guard to prevent race conditions - multiple redirects firing simultaneously
  const redirectGuardRef = useRef<boolean>(false)
  
  // Helper function to safely redirect - prevents race conditions
  // Only blocks redirects to /spin when we have matchId (match should exist)
  const safeRedirect = (path: string, reason?: string) => {
    // Only guard redirects to /spin when matchId exists (match should exist)
    if (path === '/spin' && matchId && redirectGuardRef.current) {
      // Already redirected away from voting-window - don't redirect again
      if (process.env.NODE_ENV === 'development') {
        console.log('Redirect to /spin blocked - already redirected', { path, reason, matchId })
      }
      return false
    }
    
    // For /spin redirects with matchId, set guard (prevent multiple redirects)
    if (path === '/spin' && matchId) {
      redirectGuardRef.current = true
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Redirecting:', { path, reason, matchId, guardSet: path === '/spin' && matchId })
    }
    router.push(path)
    return true
  }

  // Fetch match status and acknowledge
  useEffect(() => {
    // CRITICAL: Wait for searchParams to be available before checking matchId
    // searchParams might not be ready immediately on page load
    if (!matchId) {
      // Give it a moment - searchParams might still be loading
      const checkMatchId = setTimeout(() => {
        if (!matchId) {
          safeRedirect('/spin', 'No matchId in URL after delay')
        }
      }, 100)
      return () => clearTimeout(checkMatchId)
    }

    const fetchMatchAndAcknowledge = async () => {
      // CRITICAL: Prevent race conditions - if redirect already happened, don't proceed
      if (redirectGuardRef.current) {
        return
      }
      
      try {
        // CRITICAL: If we have matchId, ALWAYS fetch match directly first (bypasses cache)
        // This is the source of truth - if matchId exists, match MUST exist in database
        let statusData: any = null
        let directFetchSucceeded = false
        
        if (matchId) {
          // Fetch match directly by matchId (no cache) - this is the authoritative source
          try {
            const matchResponse = await fetch(`/api/match/by-id?matchId=${matchId}`, { 
              cache: 'no-store',
              headers: { 'Cache-Control': 'no-cache' }
            })
            
            if (matchResponse.ok) {
              const directData = await matchResponse.json()
              if (directData.match?.match_id === matchId) {
                // Match exists! Use this data (most reliable)
                statusData = directData
                directFetchSucceeded = true
                // Continue with this data - match exists, state might still be updating
              } else {
                // Match not found in direct fetch - might be timing issue, retry
                if (retryAttempts < 3) {
                  setRetryAttempts(prev => prev + 1)
                  setTimeout(() => fetchMatchAndAcknowledge(), 1000)
                  return
                }
                // After retries, match truly not found
                console.warn('Match not found in direct fetch after retries', { matchId, retryAttempts })
                safeRedirect('/spin', 'Match not found after direct fetch retries')
                return
              }
            } else if (matchResponse.status === 404) {
              // Match not found (404) - might be timing, retry
              if (retryAttempts < 3) {
                setRetryAttempts(prev => prev + 1)
                setTimeout(() => fetchMatchAndAcknowledge(), 1000)
                return
              }
              // After retries, match truly not found
              console.warn('Match not found (404) after retries', { matchId, retryAttempts })
              safeRedirect('/spin', 'Match not found (404) after retries')
              return
            }
          } catch (error) {
            console.error('Error in direct match fetch:', error)
            // Network error - retry
            if (retryAttempts < 3) {
              setRetryAttempts(prev => prev + 1)
              setTimeout(() => fetchMatchAndAcknowledge(), 1000)
              return
            }
            // After retries, give up
            safeRedirect('/spin', 'Network error after retries')
            return
          }
        }
        
        // Fallback to status endpoint ONLY if no matchId or direct fetch didn't work
        if (!directFetchSucceeded) {
          const statusResponse = await fetch('/api/match/status', { cache: 'no-store' })
          if (!statusResponse.ok) {
            if (matchId) {
              // We have matchId but both direct fetch and status failed - retry
              if (retryAttempts < 3) {
                setRetryAttempts(prev => prev + 1)
                setTimeout(() => fetchMatchAndAcknowledge(), 1000)
                return
              }
            }
            safeRedirect('/spin', 'Status endpoint failed after retries')
            return
          }
          statusData = await statusResponse.json()
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
                safeRedirect('/spin', 'Vote window expired, user did not vote')
              }
            }).catch(() => {
              // Fallback: check user state
              if (statusData.state === 'idle') {
                safeRedirect('/spin', 'Vote window expired, fallback to idle state')
              } else {
                safeRedirect('/spinning', 'Vote window expired, fallback to waiting state')
              }
            })
            return
          }
        }

        // CRITICAL FIX: If we have matchId, match MUST exist (we just fetched it directly)
        // Don't redirect based on state - state might not be updated yet, but match exists
        if (matchId) {
          // We have matchId - verify match exists (either from direct fetch or status)
          const matchExists = statusData.match?.match_id === matchId
          
          if (!matchExists) {
            // Match not found - try direct fetch one more time (might be timing issue)
            if (retryAttempts < 3) {
              setRetryAttempts(prev => prev + 1)
              // Wait 1 second and retry (gives time for state to propagate)
              setTimeout(() => {
                fetchMatchAndAcknowledge()
              }, 1000)
              return
            }
            // After 3 retries (3 seconds), if match still not found, might be legitimate
            console.warn('Match not found after retries, redirecting to /spin', { matchId, retryAttempts })
            safeRedirect('/spin', 'Match not found after retries in initial load')
            return
          }
          
          // Match exists! Continue with normal flow regardless of state
          // State might be 'waiting' or 'idle' temporarily, but match exists
          // Don't redirect - let the voting window display
          
        } else {
          // No matchId in URL - use original logic (user navigated here without matchId)
          if (!statusData.match) {
            safeRedirect('/spin', 'No matchId and no match in status')
            return
          }
          
          if (statusData.state === 'waiting' || statusData.state === 'idle') {
            router.push('/spinning')
            return
          }
        }

        // Set partner info
        if (statusData.match.partner) {
          setPartner(statusData.match.partner)
        } else if (statusData.match && !statusData.match.partner) {
          // Match exists but partner data is missing - might be timing issue
          // If we have matchId, try fetching directly to get partner data
          if (matchId) {
            if (retryAttempts < 3) {
              // Retry - partner data might not be loaded yet
              setRetryAttempts(prev => prev + 1)
              setTimeout(() => fetchMatchAndAcknowledge(), 1000)
              return
            }
            // After retries, try direct fetch one more time
            try {
              const directResponse = await fetch(`/api/match/by-id?matchId=${matchId}`, { cache: 'no-store' })
              if (directResponse.ok) {
                const directData = await directResponse.json()
                if (directData.match?.partner) {
                  // Partner data found! Use it
                  setPartner(directData.match.partner)
                  // Continue - don't redirect
                  return
                }
              }
            } catch (error) {
              console.error('Error fetching partner data directly:', error)
            }
          }
          
          // Partner data truly missing - log for debugging
          console.warn('⚠️ Match exists but partner data is missing after retries', {
            match_id: statusData.match.match_id,
            status: statusData.match.status,
            user1_id: statusData.match.user1_id,
            user2_id: statusData.match.user2_id,
            current_user_id: statusData.user_id,
            match_keys: Object.keys(statusData.match),
            retryAttempts
          })
          
          // This is a critical issue - without partner data, we can't show the voting UI
          // But only redirect if we've exhausted all retries
          console.error('❌ Cannot display voting window without partner data - redirecting to /spin')
          safeRedirect('/spin', 'Partner data missing after retries')
          return
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
            
            // Check if current user voted (must be non-null vote value)
            const userVoted = currentUserId && match && (
              (match.user1_id === currentUserId && match.user1_vote && match.user1_vote !== null) ||
              (match.user2_id === currentUserId && match.user2_vote && match.user2_vote !== null)
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
              safeRedirect('/spin', 'Vote window expired in polling, user did not vote')
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
          safeRedirect('/spin', 'No match found in polling after direct fetch')
          return
        }

        setLoading(false)
      } catch (error) {
        console.error('Error fetching match:', error)
        safeRedirect('/spin', 'Error in fetchMatchAndAcknowledge')
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
        console.log('⏰ Countdown reached 0 - vote window expired, checking match status...')
        try {
          const response = await fetch('/api/match/status')
          const data = await response.json()
          
          console.log('⏰ Countdown expiration - API response:', {
            ok: response.ok,
            hasMatch: !!data.match,
            user_id: data.user_id,
            state: data.state,
            match: data.match ? {
              match_id: data.match.match_id,
              user1_id: data.match.user1_id,
              user2_id: data.match.user2_id,
              user1_vote: data.match.user1_vote,
              user2_vote: data.match.user2_vote,
              status: data.match.status,
              outcome: data.match.outcome
            } : null
          })
          
          if (response.ok && data.match) {
            const currentUserId = data.user_id
            const match = data.match
            
            // Check if current user voted
            const userVoted = currentUserId && match && (
              (match.user1_id === currentUserId && match.user1_vote) ||
              (match.user2_id === currentUserId && match.user2_vote)
            )
            
            console.log('⏰ Countdown expiration - Vote check:', {
              userVoted: userVoted,
              currentUserId: currentUserId,
              match_user1_id: match.user1_id,
              match_user2_id: match.user2_id,
              match_user1_vote: match.user1_vote,
              match_user2_vote: match.user2_vote,
              is_user1: currentUserId === match.user1_id,
              is_user2: currentUserId === match.user2_id
            })
            
            // Redirect based on whether user voted
            if (userVoted) {
              // User voted yes - redirect to /spinning (will be auto-spun)
              console.log('⏰ Countdown expiration - User voted, redirecting to /spinning')
              router.push('/spinning')
            } else {
              // User didn't vote - redirect to /spin
              console.log('⏰ Countdown expiration - User did not vote, redirecting to /spin')
              safeRedirect('/spin', 'Countdown expired, user did not vote')
            }
          } else {
            console.log('⏰ Countdown expiration - No match in response or API error', {
              ok: response.ok,
              hasMatch: !!data.match,
              data: data
            })
          }
        } catch (error) {
          console.error('⏰ Error checking match status when countdown expired:', error)
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
        // OPTIMIZATION: If we have matchId, try direct fetch first (bypasses cache)
        let data: any = null
        if (matchId) {
          try {
            const directResponse = await fetch(`/api/match/by-id?matchId=${matchId}`, { cache: 'no-store' })
            if (directResponse.ok) {
              data = await directResponse.json()
              // If match found directly, use it
              if (data.match?.match_id === matchId) {
                // Match exists - continue with this data
              } else {
                data = null // Fall through to status endpoint
              }
            }
          } catch (error) {
            // Fall through to status endpoint
          }
        }
        
        // Fallback to status endpoint if direct fetch didn't work or no matchId
        if (!data) {
          const response = await fetch('/api/match/status', { cache: 'no-store' })
          if (!response.ok) {
            return
          }
          data = await response.json()
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
            
            // Check if current user voted (must be non-null vote value)
            const userVoted = currentUserId && match && (
              (match.user1_id === currentUserId && match.user1_vote && match.user1_vote !== null) ||
              (match.user2_id === currentUserId && match.user2_vote && match.user2_vote !== null)
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
              safeRedirect('/spin', 'Polling: vote window expired, user did not vote')
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

        // CRITICAL FIX: Check if partner has voted "pass" - if so, redirect to spinning immediately
        // This ensures both users return to spinning when one votes respin
        if (data.match && data.user_id) {
          const currentUserId = data.user_id
          const partnerVotedPass = (
            (data.match.user1_id === currentUserId && data.match.user2_vote === 'pass') ||
            (data.match.user2_id === currentUserId && data.match.user1_vote === 'pass')
          )
          
          if (partnerVotedPass) {
            console.log('✅ Partner voted pass (respin), immediately redirecting to spinning', { matchId: data.match.match_id })
            // Use window.location for hard redirect to ensure it works
            window.location.href = '/spinning'
            return
          }
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

        // CRITICAL FIX: If we have matchId, don't redirect based on state alone
        // State might be temporarily 'idle' or 'waiting' while match exists
        // Only redirect if match is actually completed with non-both_yes outcome
        if ((data.state === 'idle' || data.state === 'waiting') && data.match) {
          // Match exists in response - check outcome first
          if (data.match.outcome === 'both_yes') {
            console.log('Match outcome is both_yes, redirecting to video-date', { matchId: data.match.match_id })
            router.push(`/video-date?matchId=${data.match.match_id}`)
            return
          } else if (data.match.status === 'completed' && data.match.outcome !== 'both_yes') {
            // Match completed with other outcome - this is legitimate redirect
            if (data.state === 'idle') {
              // User is idle (didn't vote) - redirect to /spin
              console.log('Match completed, user is idle (didn\'t vote), redirecting to /spin', { status: data.match.status, outcome: data.match.outcome, state: data.state })
              safeRedirect('/spin', 'Match completed, user idle (didn\'t vote)')
            } else {
              // User is waiting (voted and auto-spun) - redirect to /spinning
              console.log('Match completed, user is waiting (voted), redirecting to /spinning', { status: data.match.status, outcome: data.match.outcome, state: data.state })
              router.push('/spinning')
            }
            return
          }
          // Match exists but not completed - DON'T redirect based on state
          // State might be wrong temporarily, but match exists and is active
          // Continue polling - don't redirect
        } else if ((data.state === 'idle' || data.state === 'waiting') && !data.match && matchId) {
          // State is wrong AND no match in response, but we have matchId
          // Try direct fetch before redirecting
          try {
            const directResponse = await fetch(`/api/match/by-id?matchId=${matchId}`, { cache: 'no-store' })
            if (directResponse.ok) {
              const directData = await directResponse.json()
              if (directData.match?.match_id === matchId) {
                // Match exists! Don't redirect - state is just wrong temporarily
                return
              }
            }
          } catch (error) {
            // Error fetching - continue (don't redirect yet)
          }
          // Match not found even with direct fetch - might be legitimate
          // But don't redirect immediately - let it resolve naturally
        }

        // OPTIMIZATION: If we have matchId in URL, be more lenient with redirects
        // Match might exist but status endpoint has stale cache
        if (!data.match) {
          if (matchId) {
            // We have matchId - try fetching match directly before redirecting
            // This is critical: matches exist in DB but status endpoint might have stale cache
            try {
              const directMatchResponse = await fetch(`/api/match/by-id?matchId=${matchId}`, { cache: 'no-store' })
              if (directMatchResponse.ok) {
                const directMatchData = await directMatchResponse.json()
                if (directMatchData.match?.match_id === matchId) {
                  // Match exists! Update data and continue (don't redirect)
                  // This fixes the issue where users are redirected even though match exists
                  Object.assign(data, directMatchData)
                  // Continue with normal flow - match exists, just wasn't in status response
                  return
                }
              }
            } catch (error) {
              console.error('Error fetching match directly in polling:', error)
            }
            // Match not found even with direct fetch - but we have matchId
            // Don't redirect immediately - match might be in transition
            // Just return and let next poll check again
            // Only redirect if this persists for many polls (handled elsewhere)
            return
          } else {
            // No matchId - use original logic (user navigated here without matchId)
            if (data.state === 'idle') {
              console.log('No match found, user in idle state, redirecting to /spin', { state: data.state })
              safeRedirect('/spin', 'Polling: no match, user idle')
            } else if (data.state === 'waiting') {
              console.log('No match found, user in waiting state, redirecting to /spinning', { state: data.state })
              router.push('/spinning')
            }
            return
          }
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
      
      // CRITICAL FIX: When user votes "pass" (respin), immediately redirect to spinning
      // This ensures both users return to spinning immediately when one votes respin
      if (voteType === 'pass') {
        console.log('✅ User voted pass (respin), immediately redirecting to spinning', { matchId })
        // Use window.location for hard redirect to ensure it works
        window.location.href = '/spinning'
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
          {partner.photo ? (
            <motion.img
              src={partner.photo}
              alt={partner.name}
              className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-teal-300"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.3 }}
              onError={(e) => {
                // Fallback to placeholder if image fails to load
                const target = e.target as HTMLImageElement
                target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(partner.name)}&size=160&background=0ea5e9&color=fff&bold=true`
              }}
            />
          ) : (
            <motion.div
              className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-teal-300 flex items-center justify-center border-4 border-teal-300"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.3 }}
            >
              <span className="text-3xl sm:text-4xl font-bold text-black">
                {partner.name.charAt(0).toUpperCase()}
              </span>
            </motion.div>
          )}
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-teal-300">
              {partner.name}
              {partner.age && `, ${partner.age}`}
            </h2>
            {partner.location && (
              <p className="mt-1 text-sm sm:text-base text-teal-200/80">
                {partner.location.split(',')[0].trim()}
              </p>
            )}
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

