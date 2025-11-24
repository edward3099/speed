"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Filter, Sparkles as SparklesIcon, MapPin, Users, User, Calendar, MessageCircle, Bug } from "lucide-react"
import { PrimaryButton } from "@/components/ui/primary-button"
import { SpinButton } from "@/components/ui/spin-button"
import { ProfileCardSpin } from "@/components/ui/profile-card-spin"
import { ShuffleAnimation } from "@/components/ui/shuffle-animation"
import { CountdownTimer } from "@/components/ui/countdown-timer"
import { SynchronizedCountdownTimer } from "@/components/ui/synchronized-countdown-timer"
import { MatchSynchronizedCountdownTimer } from "@/components/ui/match-synchronized-countdown-timer"
import { Modal } from "@/components/ui/modal"
import { ShimmerButton } from "@/components/magicui/shimmer-button"
import { Sparkles } from "@/components/magicui/sparkles"
import { AnimatedGradientBackground } from "@/components/magicui/animated-gradient-background"
import { FilterInput } from "@/components/ui/filter-input"
import { RangeInput } from "@/components/ui/range-input"
import { EditableProfilePicture } from "@/components/ui/editable-profile-picture"
import { EditableBio } from "@/components/ui/editable-bio"
import { createClient } from "@/lib/supabase/client"
import Image from "next/image"
// 🔒 LOCKED STATE: Import constants for matching configuration
import { 
  CRITICAL_RPC_FUNCTIONS, 
  MATCHING_CONFIG, 
  MATCHING_STATES,
  isValidStateTransition,
  isSparkWrapper,
  getMatchingConfig
} from "@/lib/constants/locked-state"
// 🔍 DEBUG TOOLKIT: Import all 9 debugging modules
import {
  debugState,
  logEvent,
  logError,
  logDebug,
  captureEvent,
  validateAfterEvent,
  addToQueue,
  createPair,
  recordVote,
  updateHeartbeat,
  getDebugFeed,
  getTime,
  setHeartbeatTimer,
  freezeState,
  rollbackTo,
} from "@/lib/debug"

interface Profile {
  id: string
  name: string
  age: number
  bio: string
  photo: string
  location: string
  distance_km?: number
}

export default function spin() {
  const router = useRouter()
  const supabase = createClient()

  // Helper function to filter out pravatar placeholder images
  const filterValidPhoto = (photo: string | null | undefined): string => {
    if (!photo || typeof photo !== 'string') return ''
    if (photo.includes('pravatar.cc')) return ''
    return photo.trim()
  }
  
  const [user, setUser] = useState<Profile | null>(null)
  const [profileQueue, setProfileQueue] = useState<Profile[]>([]) // Queue of 3 profiles
  const [currentProfileIndex, setCurrentProfileIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [preferences, setPreferences] = useState({
    minAge: 18,
    maxAge: 30,
    maxDistance: 50,
    genderPreference: 'female' as 'male' | 'female'
  })
  const [waitingForMatch, setWaitingForMatch] = useState(false)
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null)
  const [matchedPartner, setMatchedPartner] = useState<Profile | null>(null) // Partner from queue match
  const [isInQueue, setIsInQueue] = useState(false)
  const [spinningPhotos, setSpinningPhotos] = useState<string[]>([]) // Photos for spinning animation (opposite gender)

  const [started, setStarted] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showDebugger, setShowDebugger] = useState(false)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [debugLoading, setDebugLoading] = useState(false)
  const [userVote, setUserVote] = useState<"yes" | "pass" | null>(null)
  const [voteCenterPosition, setVoteCenterPosition] = useState<number>(50) // Percentage from left
  const [voteCenterPx, setVoteCenterPx] = useState<number>(0) // Pixel position as fallback
  const [currentRuleIndex, setCurrentRuleIndex] = useState(0)
  const [voteStartedAt, setVoteStartedAt] = useState<string | null>(null) // Server timestamp for synchronized vote countdown
  
  // Debug: Log when currentMatchId or voteStartedAt changes to ensure timer shows
  useEffect(() => {
    if (currentMatchId) {
      console.log('✅ currentMatchId set - timer should show:', currentMatchId)
    }
    if (voteStartedAt) {
      console.log('✅ voteStartedAt set - timer should show:', voteStartedAt)
    }
  }, [currentMatchId, voteStartedAt])
  
  // Platform rules
  const platformRules = [
    "be respectful and kind to everyone you meet",
    "keep conversations appropriate and genuine",
    "no harassment, discrimination, or inappropriate behavior",
    "report any concerns or issues immediately",
    "have fun and be yourself - authenticity matters"
  ]
  
  // Refs for profile icons
  const userProfileRef = useRef<HTMLDivElement>(null)
  const partnerProfileRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const voteHeaderParentRef = useRef<HTMLDivElement>(null)

  // Fetch user profile and preferences on mount
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !authUser) {
          router.push('/')
          return
        }

        // Fetch profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .single()

        if (profileError) {
          console.error('Error fetching profile:', profileError)
          router.push('/')
          return
        }

        setUser({
          id: profile.id,
          name: profile.name,
          age: profile.age,
          bio: profile.bio || '',
          photo: filterValidPhoto(profile.photo),
          location: profile.location || ''
        })

        // Fetch preferences
        const { data: prefs, error: prefsError } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', authUser.id)
          .single()

        if (!prefsError && prefs) {
          setPreferences({
            minAge: prefs.min_age,
            maxAge: prefs.max_age,
            maxDistance: prefs.max_distance,
            genderPreference: (prefs.gender_preference || 'female') as 'male' | 'female'
          })
        }

        // Update online status
        await supabase
          .from('profiles')
          .update({ 
            is_online: true,
            last_active_at: new Date().toISOString()
          })
          .eq('id', authUser.id)

        setLoading(false)
      } catch (error) {
        console.error('Error fetching user data:', error)
        router.push('/')
      }
    }

    fetchUserData()

    // Cleanup: Remove from queue when component unmounts
    return () => {
      const cleanup = async () => {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (authUser) {
          await supabase.rpc('remove_from_queue', { p_user_id: authUser.id })
          await supabase
            .from('profiles')
            .update({ is_online: false })
            .eq('id', authUser.id)
        }
      }
      cleanup()
    }
  }, [router, supabase])

  // Handle page visibility change and beforeunload
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (authUser && isInQueue) {
          // Check user's queue status before cleaning up
          // Only clean up if user is in spin_active (not matched)
          // If user is in vote_active (matched), don't disconnect them
          const { data: queueEntry } = await supabase
            .from('matching_queue')
            .select('status')
            .eq('user_id', authUser.id)
            .single()
          
          // Only delete matches and disconnect if user is in spin_active status
          // If user is in vote_active, they're matched - don't disconnect them!
          if (queueEntry && queueEntry.status === 'spin_active') {
            // Delete any pending matches for this user
            await supabase
              .from('matches')
              .delete()
              .or(`user1_id.eq.${authUser.id},user2_id.eq.${authUser.id}`)
              .eq('status', 'pending')
            
            await supabase.rpc('remove_from_queue', { p_user_id: authUser.id })
            await supabase
              .from('profiles')
              .update({ is_online: false })
              .eq('id', authUser.id)
            setIsInQueue(false)
          }
          // If user is in vote_active, do nothing - they're matched and should stay connected
        }
      }
    }

    const handleBeforeUnload = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser && isInQueue) {
        // Check user's queue status before cleaning up
        // Only delete matches and disconnect if user is in spin_active (not matched)
        // If user is in vote_active (matched), mark offline but don't delete match
        const { data: queueEntry } = await supabase
          .from('matching_queue')
          .select('status')
          .eq('user_id', authUser.id)
          .single()
        
        if (queueEntry) {
          if (queueEntry.status === 'spin_active') {
            // User is spinning - safe to delete matches and disconnect
            await supabase
              .from('matches')
              .delete()
              .or(`user1_id.eq.${authUser.id},user2_id.eq.${authUser.id}`)
              .eq('status', 'pending')
            
            await supabase.rpc('remove_from_queue', { p_user_id: authUser.id })
            await supabase
              .from('profiles')
              .update({ is_online: false })
              .eq('id', authUser.id)
          } else if (queueEntry.status === 'vote_active') {
            // User is matched - don't delete match, just mark offline
            // The other user might still want to vote
            await supabase
              .from('profiles')
              .update({ is_online: false })
              .eq('id', authUser.id)
            // Don't remove from queue or delete match - let the other user complete voting
          }
        } else {
          // User not in queue - just mark offline
          await supabase
            .from('profiles')
            .update({ is_online: false })
            .eq('id', authUser.id)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isInQueue, supabase])

  // Periodic fairness score update while actively spinning
  // NOTE: We do NOT call process_matching here - matching only happens when user presses spin
  useEffect(() => {
    if (!spinning || !isInQueue || !user) return

    const interval = setInterval(async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      // Update fairness score (increases over time to help users who wait longer)
      await supabase.rpc('update_fairness_score', { p_user_id: authUser.id })
      
      // DO NOT call process_matching here - it should only be called when user explicitly presses spin
      // This prevents automatic matching when users are just viewing the page
    }, 5000) // Update every 5 seconds
    
    // 🔍 MODULE 7: Periodic heartbeat update
    const heartbeatInterval = setInterval(async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser && isInQueue) {
        updateHeartbeat(authUser.id)
        // 🔍 MODULE 2: Log heartbeat
        logDebug({
          type: 'heartbeat',
          user: authUser.id,
          metadata: { timestamp: getTime() }
        })
      }
    }, 10000) // Every 10 seconds

    // Clean up stale matches periodically (every 30 seconds)
    // This prevents users from getting stuck in vote_active
    const cleanupInterval = setInterval(async () => {
      await supabase.rpc('cleanup_stale_matches')
    }, 30000) // Every 30 seconds
    
    // Clean up stale queue entries periodically (every 60 seconds)
    // This removes users who haven't updated their queue status in 2+ minutes
    // These are likely users from previous sessions who didn't properly clean up
    const cleanupQueueInterval = setInterval(async () => {
      await supabase.rpc('cleanup_stale_queue_entries')
    }, 60000) // Every 60 seconds

    return () => {
      clearInterval(interval)
      clearInterval(cleanupInterval)
      clearInterval(cleanupQueueInterval)
      if (heartbeatInterval) clearInterval(heartbeatInterval)
    }
  }, [spinning, isInQueue, user, supabase])

  // Fetch profiles for matching
  const fetchProfiles = async (softenFilters = false) => {
    try {
      // Check session first
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.error('No session found when fetching profiles')
        return []
      }

      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        console.error('No authenticated user found')
        return []
      }

      console.log('Calling discover_profiles with:', {
        current_user_id: authUser.id,
        limit_count: 3,
        soften_filters: softenFilters
      })

      // Call the discover_profiles function with better error handling
      let response
      try {
        response = await supabase.rpc('discover_profiles', {
          current_user_id: authUser.id,
          limit_count: 3,
          soften_filters: softenFilters
        })
      } catch (rpcError: any) {
        console.error('RPC call threw exception:', {
          message: rpcError?.message,
          stack: rpcError?.stack,
          name: rpcError?.name,
          error: rpcError
        })
        return []
      }

      // Log the full response to see what we're getting
      console.log('RPC response:', {
        hasData: !!response.data,
        hasError: !!response.error,
        dataLength: response.data?.length,
        errorType: typeof response.error,
        errorConstructor: response.error?.constructor?.name,
        responseKeys: response ? Object.keys(response) : 'no response'
      })

      if (response.error) {
        // Try to extract error information in multiple ways
        const error = response.error as any
        
        // Method 1: Direct property access
        const errorDetails = {
          message: error?.message,
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
          name: error?.name,
        }
        
        // Method 2: Try to access all properties
        const allProps: any = {}
        if (error) {
          try {
            // Get own property names
            Object.getOwnPropertyNames(error).forEach(prop => {
              try {
                allProps[prop] = (error as any)[prop]
              } catch (e) {
                allProps[prop] = '[Error accessing property]'
              }
            })
          } catch (e) {
            allProps.getOwnPropertyNamesError = String(e)
          }
          
          // Get enumerable keys
          try {
            Object.keys(error).forEach(key => {
              allProps[key] = (error as any)[key]
            })
          } catch (e) {
            allProps.keysError = String(e)
          }
        }
        
        // Method 3: Try to stringify
        let stringified = ''
        try {
          stringified = JSON.stringify(error, null, 2)
        } catch (e) {
          try {
            stringified = JSON.stringify(error)
          } catch (e2) {
            stringified = `[Could not stringify: ${String(e2)}]`
          }
        }
        
        console.error('Error fetching profiles:', {
          errorDetails,
          allProps,
          stringified,
          rawError: error
        })
        
        // Check for specific error codes
        if (error?.code === '42883' || error?.message?.includes('does not exist')) {
          console.error('discover_profiles function does not exist in database')
          return []
        }
        
        // If no profiles found and not already softening, try with softened filters
        if (!softenFilters) {
          return fetchProfiles(true)
        }
        return []
      }

      console.log('Successfully fetched profiles:', response.data?.length || 0)
      return response.data || []
    } catch (error: any) {
      // Log all error properties
      const errorDetails: any = {}
      for (const key in error) {
        errorDetails[key] = error[key]
      }
      console.error('Error in fetchProfiles catch block:', {
        message: error?.message,
        stack: error?.stack,
        errorDetails,
        stringified: JSON.stringify(error, null, 2)
      })
      return []
    }
  }

  // Load initial profile queue
  useEffect(() => {
    if (!user || loading) return

    const loadProfiles = async () => {
      const fetchedProfiles = await fetchProfiles()
      if (fetchedProfiles.length > 0) {
        setProfileQueue(fetchedProfiles)
      }
    }

    loadProfiles()
  }, [user, loading])

  // Check for existing matches on mount and when user changes
  useEffect(() => {
    if (!user) return

    const checkExistingMatch = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      // Check queue status first - if user is in spin_active, they've been re-queued
      const { data: queueStatus } = await supabase
        .from('matching_queue')
        .select('status')
        .eq('user_id', authUser.id)
        .single()

      // Only check for existing matches if user is in vote_active status
      // If user is in spin_active, they've been re-queued and shouldn't see the old match
      if (queueStatus?.status === 'vote_active') {
        // Check if user has an active match
        const { data: existingMatches } = await supabase
          .from('matches')
          .select('*')
          .or(`user1_id.eq.${authUser.id},user2_id.eq.${authUser.id}`)
          .eq('status', 'pending')
          .order('matched_at', { ascending: false })
        
        const existingMatch = existingMatches && existingMatches.length > 0 ? existingMatches[0] : null

        if (existingMatch) {
          // CRITICAL: Verify this match actually belongs to the current authenticated user
          if (existingMatch.user1_id !== authUser.id && existingMatch.user2_id !== authUser.id) {
            console.error('❌ Match does not belong to current user!', {
              matchUser1: existingMatch.user1_id,
              matchUser2: existingMatch.user2_id,
              currentUserId: authUser.id
            })
            return
          }

          console.log('✅ Match verified for current user:', authUser.id)
          console.log('🎯 Found existing match:', existingMatch.id)
          const partnerId = existingMatch.user1_id === authUser.id ? existingMatch.user2_id : existingMatch.user1_id
          
          const { data: partnerProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', partnerId)
            .single()

          if (partnerProfile) {
            console.log('🎯 Loading existing match with partner:', partnerProfile.name)
            setStarted(true)
            setSpinning(false)
            setCurrentMatchId(existingMatch.id)
            setMatchedPartner({
              id: partnerProfile.id,
              name: partnerProfile.name,
              age: partnerProfile.age,
              bio: partnerProfile.bio || '',
              photo: filterValidPhoto(partnerProfile.photo),
              location: partnerProfile.location || ''
            })
            setIsInQueue(false)
            // Store vote_started_at for synchronized countdown
            if (existingMatch.vote_started_at) {
              setVoteStartedAt(existingMatch.vote_started_at)
            } else if (existingMatch.matched_at) {
              // Fallback to matched_at if vote_started_at is missing
              setVoteStartedAt(existingMatch.matched_at)
            }
            setRevealed(true)
          }
        }
      } else if (queueStatus?.status === 'spin_active') {
        // User is in queue from a previous session, but NOT actively spinning now
        // Remove them from queue - they must press spin again to join
        console.log('⚠️ User found in queue but not actively spinning - removing from queue')
        await supabase.rpc('remove_from_queue', { p_user_id: authUser.id })
        setIsInQueue(false)
      }
    }

    checkExistingMatch()
  }, [user, supabase])

  // Set up real-time match detection and queue status updates
  useEffect(() => {
    if (!user) return

    let isMounted = true
    let reconnectTimeout: NodeJS.Timeout | null = null
    let reconnectAttempts = 0
    const MAX_RECONNECT_ATTEMPTS = 5
    const INITIAL_RECONNECT_DELAY = 1000 // 1 second
    let channel1: any = null
    let channel2: any = null

    const setupRealtime = async () => {
      // Clean up any existing channels first to prevent duplicates
      if (channel1) {
        try {
          channel1.unsubscribe()
          supabase.removeChannel(channel1)
        } catch (e) {
          // Ignore errors - channel might already be removed
        }
        channel1 = null
      }
      if (channel2) {
        try {
          channel2.unsubscribe()
          supabase.removeChannel(channel2)
        } catch (e) {
          // Ignore errors - channel might already be removed
        }
        channel2 = null
      }

      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser || !isMounted) return

      // Handler for when a match is found
      const handleMatch = async (match: any) => {
        const { data: { user: currentAuthUser } } = await supabase.auth.getUser()
        if (!currentAuthUser) {
          // 🔍 MODULE 2: Log error
          logError({
            type: 'handleMatchNoAuth',
            error: new Error('No authenticated user'),
            metadata: { matchId: match.id }
          })
          console.error('❌ No authenticated user when handling match')
          return
        }

        // 🔍 MODULE 1 & 3: Capture before state
        const beforeState = debugState()
        
        // CRITICAL: Verify this match actually belongs to the current authenticated user
        if (match.user1_id !== currentAuthUser.id && match.user2_id !== currentAuthUser.id) {
          // 🔍 MODULE 2 & 4: Log error and validate
          logError({
            type: 'handleMatchInvalidUser',
            error: new Error('Match does not belong to current user'),
            user: currentAuthUser.id,
            beforeState,
            metadata: {
              matchUser1: match.user1_id,
              matchUser2: match.user2_id,
              currentUserId: currentAuthUser.id
            }
          })
          validateAfterEvent('handleMatchInvalidUser', debugState())
          console.error('❌ Match does not belong to current user!', {
            matchUser1: match.user1_id,
            matchUser2: match.user2_id,
            currentUserId: currentAuthUser.id
          })
          return
        }

        // 🔍 MODULE 2: Log match found via real-time
        logEvent({
          type: 'matchFoundRealtime',
          user: currentAuthUser.id,
          beforeState,
          metadata: { matchId: match.id }
        })

        console.log('✅ Match verified for current user:', currentAuthUser.id)

        // Get the partner's ID
        const partnerId = match.user1_id === currentAuthUser.id ? match.user2_id : match.user1_id

        // CRITICAL: According to matching_logic.md, once users are matched, both enter vote_active status
        // We should verify the match is valid, not delete it based on queue status
        // The database-level validation in create_pair already ensures both users are in queue before matching
        
        // Verify the match is still valid by checking if it exists and is pending
        const { data: matchVerification } = await supabase
          .from('matches')
          .select('id, status, user1_id, user2_id')
          .eq('id', match.id)
          .eq('status', 'pending')
          .single()
        
        if (!matchVerification) {
          console.log('⚠️ Real-time match no longer exists or is not pending')
          return
        }
        
        // Check partner's queue status - they should be in vote_active (matched) or transitioning
        // Try multiple query approaches to find the partner
        let partnerQueue = null
        
        // Approach 1: Standard query with maybeSingle (doesn't throw on no results)
        const { data: partnerQueueData, error: partnerQueueError } = await supabase
          .from('matching_queue')
          .select('status')
          .eq('user_id', partnerId)
          .maybeSingle()
        
        if (partnerQueueData) {
          partnerQueue = partnerQueueData
        } else {
          // Approach 2: Check for vote_active status specifically
          const { data: voteActiveCheck, error: voteActiveError } = await supabase
            .from('matching_queue')
            .select('status')
            .eq('user_id', partnerId)
            .eq('status', 'vote_active')
            .maybeSingle()
          
          if (voteActiveCheck) {
            partnerQueue = voteActiveCheck
          } else {
            // Approach 3: Check all valid statuses
            const { data: anyStatusCheck, error: anyStatusError } = await supabase
              .from('matching_queue')
              .select('status')
              .eq('user_id', partnerId)
              .in('status', ['spin_active', 'queue_waiting', 'vote_active'])
              .maybeSingle()
            
            if (anyStatusCheck) {
              partnerQueue = anyStatusCheck
            } else {
              // Log all errors for debugging - properly serialize error objects
              console.error('🔍 Partner lookup failed (real-time):', {
                partnerId,
                partnerQueueError: partnerQueueError ? {
                  message: partnerQueueError.message,
                  code: partnerQueueError.code,
                  details: partnerQueueError.details,
                  hint: partnerQueueError.hint
                } : null,
                voteActiveError: voteActiveError ? {
                  message: voteActiveError.message,
                  code: voteActiveError.code,
                  details: voteActiveError.details,
                  hint: voteActiveError.hint
                } : null,
                anyStatusError: anyStatusError ? {
                  message: anyStatusError.message,
                  code: anyStatusError.code,
                  details: anyStatusError.details,
                  hint: anyStatusError.hint
                } : null,
                partnerQueueData,
                voteActiveCheck,
                anyStatusCheck
              })
            }
          }
        }
        
        // If partner is not in queue, that's unexpected - try to fix via validate_queue_integrity
        if (!partnerQueue) {
          console.warn('⚠️ Real-time: Partner not found in queue - attempting auto-fix', {
            partnerId,
            matchId: match.id
          })
          
          // Call validate_queue_integrity to auto-fix the orphaned match
          try {
            const { data: integrityResult, error: integrityError } = await supabase.rpc('validate_queue_integrity')
            
            if (integrityError) {
              console.error('❌ Error calling validate_queue_integrity:', integrityError)
            } else {
              console.log('✅ validate_queue_integrity called from real-time handler, result:', integrityResult)
              
              // Re-check if match still exists after cleanup
              const { data: matchAfterCleanup } = await supabase
                .from('matches')
                .select('id, status')
                .eq('id', match.id)
                .single()
              
              if (!matchAfterCleanup) {
                // Match was cleaned up - return early
                console.log('⚠️ Match was cleaned up by validate_queue_integrity')
                return
              }
              
              // Try to find partner again after cleanup - wait a bit for status to update
              await new Promise(resolve => setTimeout(resolve, 500)) // Wait 500ms for status updates
              
              // Try multiple times to find partner (they might be updating status)
              let partnerAfterCleanup = null
              for (let retry = 0; retry < 3; retry++) {
                // Try multiple query approaches
                // Approach 1: Standard query with maybeSingle (doesn't throw on no results)
                const { data: partnerData, error: partnerError } = await supabase
                  .from('matching_queue')
                  .select('status')
                  .eq('user_id', partnerId)
                  .maybeSingle()
                
                if (partnerData) {
                  partnerAfterCleanup = partnerData
                  break
                }
                
                // Approach 2: Check for vote_active status specifically
                const { data: voteActiveData, error: voteActiveError } = await supabase
                  .from('matching_queue')
                  .select('status')
                  .eq('user_id', partnerId)
                  .eq('status', 'vote_active')
                  .maybeSingle()
                
                if (voteActiveData) {
                  partnerAfterCleanup = voteActiveData
                  break
                }
                
                // Approach 3: Check all valid statuses
                const { data: anyStatusData, error: anyStatusError } = await supabase
                  .from('matching_queue')
                  .select('status')
                  .eq('user_id', partnerId)
                  .in('status', ['spin_active', 'queue_waiting', 'vote_active'])
                  .maybeSingle()
                
                  if (anyStatusData) {
                    partnerAfterCleanup = anyStatusData
                    break
                  }
                  
                  // Last resort: Try RPC function to bypass potential RLS issues
                  if (retry === 0) {
                    try {
                      const { data: rpcResult, error: rpcError } = await supabase.rpc('check_user_in_queue', {
                        p_user_id: partnerId
                      })
                      
                      if (rpcResult?.found) {
                        partnerAfterCleanup = { status: rpcResult.status }
                        console.log('✅ Partner found via RPC function (real-time after cleanup):', rpcResult)
                        break
                      }
                    } catch (rpcException: any) {
                      console.error('❌ Exception calling check_user_in_queue RPC:', rpcException)
                    }
                  }
                  
                  // Log errors for debugging - properly serialize error objects
                  if (retry === 0) {
                    console.error('🔍 Partner lookup attempts (real-time after cleanup):', {
                      partnerId,
                      partnerError: partnerError ? {
                        message: partnerError.message,
                        code: partnerError.code,
                        details: partnerError.details,
                        hint: partnerError.hint
                      } : null,
                      voteActiveError: voteActiveError ? {
                        message: voteActiveError.message,
                        code: voteActiveError.code,
                        details: voteActiveError.details,
                        hint: voteActiveError.hint
                      } : null,
                      anyStatusError: anyStatusError ? {
                        message: anyStatusError.message,
                        code: anyStatusError.code,
                        details: anyStatusError.details,
                        hint: anyStatusError.hint
                      } : null,
                      partnerData,
                      voteActiveData,
                      anyStatusData
                    })
                  }
                
                if (retry < 2) {
                  await new Promise(resolve => setTimeout(resolve, 300)) // Wait 300ms between retries
                }
              }
              
              if (!partnerAfterCleanup) {
                // Partner still not found - match might be orphaned, but don't delete it
                // Just return early and let the system handle it
                console.error('❌ Partner still not found after validate_queue_integrity and retries')
                return
              }
              
              // Partner found after cleanup - continue with normal flow
              partnerQueue = partnerAfterCleanup
            }
          } catch (cleanupError: any) {
            console.error('❌ Exception calling validate_queue_integrity:', cleanupError)
            return
          }
        }
        
        // Verify partner is in a valid state (check for null first)
        if (!partnerQueue) {
          console.error('❌ Real-time: Partner queue entry is null after cleanup attempt', {
            partnerId,
            matchId: match.id
          })
          return
        }
        
        if (!['vote_active', 'spin_active', 'queue_waiting'].includes(partnerQueue.status)) {
          console.error('❌ Real-time: Partner in invalid queue status:', {
            partnerId,
            status: partnerQueue.status,
            matchId: match.id
          })
          return
        }
        
        console.log('✅ Real-time match verified: partner is in valid state:', partnerQueue.status)

        // Fetch partner's profile
        const { data: partnerProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', partnerId)
          .single()

        if (partnerProfile) {
          console.log('🎯 Match detected! Partner:', partnerProfile.name)
          // Stop spinning and reveal
          setSpinning(false)
          
          // CRITICAL: Set currentMatchId FIRST so timer shows immediately
          setCurrentMatchId(match.id)
          console.log('✅ Set currentMatchId for timer:', match.id)
          setMatchedPartner({
            id: partnerProfile.id,
            name: partnerProfile.name,
            age: partnerProfile.age,
            bio: partnerProfile.bio || '',
            photo: filterValidPhoto(partnerProfile.photo),
            location: partnerProfile.location || ''
          })

          // Fetch match to get vote_started_at for synchronized countdown
          const { data: matchWithTimestamp } = await supabase
            .from('matches')
            .select('vote_started_at, matched_at')
            .eq('id', match.id)
            .single()
          
          if (matchWithTimestamp) {
            if (matchWithTimestamp.vote_started_at) {
              setVoteStartedAt(matchWithTimestamp.vote_started_at)
              console.log('✅ Set voteStartedAt from vote_started_at:', matchWithTimestamp.vote_started_at)
            } else if (matchWithTimestamp.matched_at) {
              setVoteStartedAt(matchWithTimestamp.matched_at)
              console.log('✅ Set voteStartedAt from matched_at:', matchWithTimestamp.matched_at)
            }
          } else {
            // Fallback: use match.matched_at if available
            if (match.matched_at) {
              setVoteStartedAt(match.matched_at)
              console.log('✅ Set voteStartedAt from match.matched_at (fallback):', match.matched_at)
            }
          }

          // Queue status is already set to 'vote_active' by create_pair() function
          // This locks both users so they cannot be matched with others during voting
          // No need to remove from queue - they stay in queue with 'vote_active' status
          setIsInQueue(false) // Update local state to reflect we're in voting phase

          // Reveal after short delay
          setTimeout(() => {
            setRevealed(true)
          }, 300)
        }
      }

      // Reconnection function with exponential backoff
      const reconnect = () => {
        if (!isMounted) return
        
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.warn('⚠️ Max reconnection attempts reached. Realtime subscriptions will rely on polling fallback.')
          return
        }

        reconnectAttempts++
        const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1) // Exponential backoff
        
        console.log(`🔄 Attempting to reconnect Realtime subscriptions (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`)
        
        reconnectTimeout = setTimeout(() => {
          if (!isMounted) return
          
          // Clean up old channels before reconnecting
          if (channel1) {
            try {
              channel1.unsubscribe()
              supabase.removeChannel(channel1)
            } catch (e) {
              console.error('Error cleaning up channel1 during reconnect:', e)
            }
            channel1 = null
          }
          if (channel2) {
            try {
              channel2.unsubscribe()
              supabase.removeChannel(channel2)
            } catch (e) {
              console.error('Error cleaning up channel2 during reconnect:', e)
            }
            channel2 = null
          }
          
          // Reconnect
          setupRealtime()
        }, delay)
      }

      // Create unique channel names with timestamp to prevent conflicts
      const timestamp = Date.now()
      const channelName1 = `matches-user1-${authUser.id}-${timestamp}`
      const channelName2 = `matches-user2-${authUser.id}-${timestamp}`
      
      // Remove any existing channels with similar names to prevent duplicates
      const existingChannels = supabase.getChannels()
      existingChannels.forEach((ch: any) => {
        if (ch && ch.topic && (ch.topic.includes(`matches-user1-${authUser.id}`) || ch.topic.includes(`matches-user2-${authUser.id}`))) {
          try {
            if (ch.state === 'joined' || ch.state === 'joining') {
              ch.unsubscribe()
            }
            supabase.removeChannel(ch)
          } catch (e) {
            // Ignore errors during cleanup - channel might already be removed
          }
        }
      })

      // Subscribe to matches where user is user1_id
      channel1 = supabase
        .channel(channelName1, {
          config: {
            broadcast: { self: false }, // Don't receive own broadcasts
          },
        })
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'matches',
            filter: `user1_id=eq.${authUser.id}`
          },
          async (payload) => {
            if (!isMounted) return
            console.log('📨 Match notification (as user1):', payload.new)
            await handleMatch(payload.new)
          }
        )
        .on('system', {}, (payload) => {
          if (payload.extension === 'postgres_changes') {
            console.log('🔧 System event (user1):', payload)
          }
        })
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            console.log('✅ Realtime subscription (user1) connected')
            reconnectAttempts = 0 // Reset on successful connection
          } else if (status === 'CHANNEL_ERROR') {
            // CHANNEL_ERROR is often expected during cleanup/reconnection - only log in debug mode
            if (process.env.NODE_ENV === 'development') {
              console.warn('⚠️ Realtime subscription (user1) error: CHANNEL_ERROR', err)
            }
            if (isMounted && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              reconnect()
            }
          } else if (status === 'TIMED_OUT') {
            // TIMED_OUT is expected during network issues - only log in debug mode
            if (process.env.NODE_ENV === 'development') {
              console.warn('⚠️ Realtime subscription (user1) timed out')
            }
            if (isMounted && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              reconnect()
            }
          } else if (status === 'CLOSED') {
            // CLOSED is expected during cleanup - only log in debug mode
            if (process.env.NODE_ENV === 'development') {
              console.warn('⚠️ Realtime subscription (user1) closed')
            }
            // Only reconnect if component is still mounted
            if (isMounted && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              reconnect()
            }
          } else {
            // Only log non-error statuses in debug mode
            if (process.env.NODE_ENV === 'development') {
              console.log('Realtime subscription (user1) status:', status)
            }
          }
        })

      // Subscribe to matches where user is user2_id
      channel2 = supabase
        .channel(channelName2, {
          config: {
            broadcast: { self: false }, // Don't receive own broadcasts
          },
        })
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'matches',
            filter: `user2_id=eq.${authUser.id}`
          },
          async (payload) => {
            if (!isMounted) return
            console.log('📨 Match notification (as user2):', payload.new)
            await handleMatch(payload.new)
          }
        )
        .on('system', {}, (payload) => {
          if (payload.extension === 'postgres_changes') {
            console.log('🔧 System event (user2):', payload)
          }
        })
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            console.log('✅ Realtime subscription (user2) connected')
            reconnectAttempts = 0 // Reset on successful connection
          } else if (status === 'CHANNEL_ERROR') {
            // CHANNEL_ERROR is often expected during cleanup/reconnection - only log in debug mode
            if (process.env.NODE_ENV === 'development') {
              console.warn('⚠️ Realtime subscription (user2) error: CHANNEL_ERROR', err)
            }
            if (isMounted && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              reconnect()
            }
          } else if (status === 'TIMED_OUT') {
            // TIMED_OUT is expected during network issues - only log in debug mode
            if (process.env.NODE_ENV === 'development') {
              console.warn('⚠️ Realtime subscription (user2) timed out')
            }
            if (isMounted && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              reconnect()
            }
          } else if (status === 'CLOSED') {
            // CLOSED is expected during cleanup - only log in debug mode
            if (process.env.NODE_ENV === 'development') {
              console.warn('⚠️ Realtime subscription (user2) closed')
            }
            // Only reconnect if component is still mounted
            if (isMounted && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              reconnect()
            }
          } else {
            // Only log non-error statuses in debug mode
            if (process.env.NODE_ENV === 'development') {
              console.log('Realtime subscription (user2) status:', status)
            }
          }
        })

    }

    // Setup realtime subscriptions
    setupRealtime()

    // Cleanup function - synchronous to ensure proper cleanup
    return () => {
      isMounted = false
      
      // Clear any pending reconnection attempts
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
        reconnectTimeout = null
      }
      
      // Clean up channels synchronously
      if (channel1) {
        try {
          // Check if channel is still subscribed before unsubscribing
          if (channel1.state === 'joined' || channel1.state === 'joining') {
            channel1.unsubscribe()
          }
          supabase.removeChannel(channel1)
        } catch (e) {
          console.error('Error cleaning up channel1:', e)
        }
        channel1 = null
      }
      
      if (channel2) {
        try {
          // Check if channel is still subscribed before unsubscribing
          if (channel2.state === 'joined' || channel2.state === 'joining') {
            channel2.unsubscribe()
          }
          supabase.removeChannel(channel2)
        } catch (e) {
          console.error('Error cleaning up channel2:', e)
        }
        channel2 = null
      }
    }
  }, [user]) // Removed router and supabase from dependencies - they shouldn't trigger re-subscription

  // Periodic check for existing matches while spinning (fallback if real-time fails)
  useEffect(() => {
    if (!user || !spinning || !isInQueue) return

    const attemptMatchingAndCheck = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      // First, check if user already has an active match
      const { data: existingMatches } = await supabase
        .from('matches')
        .select('*')
        .or(`user1_id.eq.${authUser.id},user2_id.eq.${authUser.id}`)
        .eq('status', 'pending')
        .order('matched_at', { ascending: false })
        .limit(1)
      
      const existingMatch = existingMatches && existingMatches.length > 0 ? existingMatches[0] : null

      if (existingMatch) {
        // CRITICAL: Verify this match actually belongs to the current authenticated user
        if (existingMatch.user1_id !== authUser.id && existingMatch.user2_id !== authUser.id) {
          console.error('❌ Match does not belong to current user!', {
            matchUser1: existingMatch.user1_id,
            matchUser2: existingMatch.user2_id,
            currentUserId: authUser.id
          })
          return
        }

        console.log('✅ Match verified for current user:', authUser.id)
        console.log('🎯 Found existing match via periodic check:', existingMatch.id)
        const partnerId = existingMatch.user1_id === authUser.id ? existingMatch.user2_id : existingMatch.user1_id
        
        const { data: partnerProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', partnerId)
          .single()

        if (partnerProfile) {
          console.log('🎯 Loading existing match with partner:', partnerProfile.name)
          setSpinning(false)
          setCurrentMatchId(existingMatch.id)
          setMatchedPartner({
            id: partnerProfile.id,
            name: partnerProfile.name,
            age: partnerProfile.age,
            bio: partnerProfile.bio || '',
            photo: filterValidPhoto(partnerProfile.photo),
            location: partnerProfile.location || ''
          })
          setIsInQueue(false)
          // Store vote_started_at for synchronized countdown
          if (existingMatch.vote_started_at) {
            setVoteStartedAt(existingMatch.vote_started_at)
          } else if (existingMatch.matched_at) {
            setVoteStartedAt(existingMatch.matched_at)
          }
          setTimeout(() => {
            setRevealed(true)
          }, 300)
        }
        return // Don't try to match if we already have one
      }

      // 🔒 LOCKED: Matching logic - must use SPARK wrapper
      // According to matching_logic.md: "every spin leads to a pairing. there are no empty results."
      // We need to keep trying until a match is found
      // CRITICAL: Must use spark_process_matching, never process_matching directly
      // See: /LOCKED_STATE.md - Critical RPC Functions
      if (!isSparkWrapper(CRITICAL_RPC_FUNCTIONS.PROCESS_MATCHING)) {
        console.error('❌ CRITICAL: Attempted to use non-SPARK wrapper for process_matching')
      }
      const { data: matchId, error: matchError } = await supabase.rpc(CRITICAL_RPC_FUNCTIONS.PROCESS_MATCHING, {
        p_user_id: authUser.id
      })

      if (matchError) {
        // 🔍 MODULE 2 & 4: Log error and validate
        const errorState = debugState()
        logError({
          type: 'periodicMatchingError',
          error: matchError,
          user: authUser.id,
          afterState: errorState,
          metadata: {
            message: matchError?.message,
            code: matchError?.code,
            details: matchError?.details
          }
        })
        validateAfterEvent('periodicMatchingError', errorState)
        
        console.error('Error in periodic matching attempt:', matchError)
        // Log the error
        await supabase.rpc('log_frontend_error', {
          p_error_type: 'frontend',
          p_error_message: matchError.message || 'Unknown error in periodic matching',
          p_function_name: 'attemptMatchingAndCheck',
          p_user_id: authUser.id,
          p_error_details: {
            error_code: matchError.code,
            error_details: matchError.details
          },
          p_severity: 'ERROR'
        })
        return
      }

      if (matchId) {
        // 🔍 MODULE 2: Log periodic match found
        logEvent({
          type: 'periodicMatchFound',
          user: authUser.id,
          afterState: debugState(),
          metadata: { matchId }
        })
        
        console.log('✅ Periodic matching attempt found match:', matchId)
        // Check queue status to see if we're in vote_active
        const { data: queueStatus } = await supabase
          .from('matching_queue')
          .select('status')
          .eq('user_id', authUser.id)
          .single()
        
        if (queueStatus?.status === 'vote_active') {
          // Match was created - get the match details
          const { data: match } = await supabase
            .from('matches')
            .select('*')
            .eq('id', matchId)
            .single()
          
          if (match) {
            const partnerId = match.user1_id === authUser.id ? match.user2_id : match.user1_id
            const { data: partnerProfile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', partnerId)
              .single()
            
            if (partnerProfile) {
              setSpinning(false)
              setCurrentMatchId(match.id)
              setMatchedPartner({
                id: partnerProfile.id,
                name: partnerProfile.name,
                age: partnerProfile.age,
                bio: partnerProfile.bio || '',
                photo: partnerProfile.photo || '',
                location: partnerProfile.location || ''
              })
              setIsInQueue(false)
              if (match.vote_started_at) {
                setVoteStartedAt(match.vote_started_at)
              } else if (match.matched_at) {
                setVoteStartedAt(match.matched_at)
              }
              setTimeout(() => {
                setRevealed(true)
              }, 300)
            }
          }
        }
      } else {
        // No match yet - log for debugging
        const { data: queueUsers } = await supabase
          .from('matching_queue')
          .select('user_id, status')
          .neq('user_id', authUser.id)
          .in('status', ['spin_active', 'queue_waiting'])
        console.log(`🔄 Retry attempt: ${queueUsers?.length || 0} other users in queue, will retry in 2 seconds...`)
      }
    }

    // Try matching and check for existing matches every 2 seconds while spinning
    // More frequent polling ensures matches happen as soon as both users are in queue
    // 🔒 LOCKED: Polling interval must match MATCHING_CONFIG.POLLING_INTERVAL_MS
    // See: /LOCKED_STATE.md and /src/lib/constants/locked-state.ts
    const matchingConfig = getMatchingConfig()
    const interval = setInterval(attemptMatchingAndCheck, matchingConfig.pollingInterval)

    return () => clearInterval(interval)
  }, [user, spinning, isInQueue, supabase])

  // Rotate through rules every 10 seconds
  useEffect(() => {
    if (!started) {
      // Reset to first rule when returning to start screen
      setCurrentRuleIndex(0)
      
      const interval = setInterval(() => {
        setCurrentRuleIndex((prev) => (prev + 1) % platformRules.length)
      }, 10000) // 10 seconds

      return () => clearInterval(interval)
    }
  }, [started, platformRules.length])

  // Fetch compatible user photos for spinning animation
  // CRITICAL: Males see female photos, Females see male photos
  const fetchSpinningPhotos = async (): Promise<string[]> => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser || !user) {
        return []
      }

      // Get current user's gender
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('gender')
        .eq('id', authUser.id)
        .single()

      if (!userProfile) {
        return []
      }

      // Determine opposite gender: Males see females, Females see males
      const targetGender = userProfile.gender === 'male' ? 'female' : 'male'

      // Fetch compatible profiles (opposite gender, online, with valid photos)
      const { data: compatibleProfiles, error } = await supabase
        .from('profiles')
        .select('id, photo')
        .eq('gender', targetGender)
        .eq('is_online', true)
        .not('photo', 'is', null)
        .neq('photo', '')
        .limit(30) // Get more photos for variety in animation

      if (error) {
        console.error('Error fetching spinning photos:', error)
        return []
      }

      if (!compatibleProfiles || compatibleProfiles.length === 0) {
        return []
      }

      // Filter out blocked users and users already passed on
      const validPhotos: string[] = []
      const userIds = compatibleProfiles.map(p => p.id)

      // Batch check for blocked users
      const { data: blockedUsers } = await supabase
        .from('blocked_users')
        .select('blocker_id, blocked_user_id')
        .or(`blocker_id.eq.${authUser.id},blocked_user_id.eq.${authUser.id}`)

      const blockedIds = new Set<string>()
      if (blockedUsers) {
        blockedUsers.forEach(block => {
          if (block.blocker_id === authUser.id) {
            blockedIds.add(block.blocked_user_id)
          } else {
            blockedIds.add(block.blocker_id)
          }
        })
      }

      // Batch check for passed votes
      const { data: passedVotes } = await supabase
        .from('votes')
        .select('profile_id')
        .eq('voter_id', authUser.id)
        .eq('vote_type', 'pass')
        .in('profile_id', userIds)

      const passedIds = new Set<string>()
      if (passedVotes) {
        passedVotes.forEach(vote => passedIds.add(vote.profile_id))
      }

      // Collect valid photos (not pravatar, not blocked, not passed)
      for (const profile of compatibleProfiles) {
        if (!profile.photo) continue
        if (profile.photo.includes('pravatar.cc')) continue // Skip demo images
        if (blockedIds.has(profile.id)) continue
        if (passedIds.has(profile.id)) continue

        validPhotos.push(profile.photo)
      }

      return validPhotos
    } catch (error: any) {
      console.error('Error in fetchSpinningPhotos:', error)
      return []
    }
  }

  const startSpin = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser || !user) return

    // 🔍 MODULE 1 & 3: Capture before state snapshot (from database)
    const { data: queueBefore } = await supabase.from('matching_queue').select('*')
    const { data: matchesBefore } = await supabase.from('matches').select('*').eq('status', 'pending')
    const beforeState = {
      queue: queueBefore || [],
      matches: matchesBefore || [],
      timestamp: new Date().toISOString(),
      debugState: debugState()
    }
    
    // 🔍 MODULE 2: Log spin start event (both in-memory and database)
    try {
      const logEntry = logEvent({
        type: 'spinStart',
        user: authUser.id,
        beforeState,
        metadata: { userId: authUser.id, userName: user.name }
      })
      console.log('🔍 DEBUG: Spin started - Log entry created', { 
        userId: authUser.id, 
        logId: logEntry?.id,
        logType: logEntry?.type,
        beforeState 
      })
      
      // Also log to database for persistence across tabs
      try {
        await supabase.rpc('spark_log_event', {
          p_event_type: 'spinStart',
          p_event_category: 'spin',
          p_event_message: `User ${user.name} started spinning`,
          p_event_data: {
            userId: authUser.id,
            userName: user.name,
            beforeState
          },
          p_user_id: authUser.id,
          p_related_table: 'matching_queue',
          p_source: 'CLIENT',
          p_severity: 'INFO'
        })
        console.log('🔍 DEBUG: Logged to database')
      } catch (dbLogError: any) {
        console.log('🔍 DEBUG: Database logging error (non-critical):', dbLogError?.message)
      }
    } catch (logError) {
      console.error('🔍 DEBUG: Failed to log spin start', logError)
    }

    // Fetch compatible photos for spinning animation (opposite gender)
    const photos = await fetchSpinningPhotos()
    setSpinningPhotos(photos.length > 0 ? photos : [])

    setUserVote(null)
    setRevealed(false)
    setSpinning(true)
    setStarted(true)
    setWaitingForMatch(false)
    setCurrentMatchId(null)
    setMatchedPartner(null)

    try {
      // Clean up any stale matches first (handles vote_active stuck users)
      await supabase.rpc('cleanup_stale_matches')

      // Join the queue (will update if already exists, or create new)
      // This will automatically:
      // 1. Delete any pending matches for this user
      // 2. Reset the OTHER user from vote_active to spin_active (if they were in a match together)
      // 3. Reset the current user from vote_active to spin_active
      // 4. Create/update queue entry
      // 🔒 LOCKED: Must use SPARK wrapper for join_queue
      // CRITICAL: Must use spark_join_queue, never join_queue directly
      // See: /LOCKED_STATE.md - Critical RPC Functions
      
      // 🔍 MODULE 3: Capture event with snapshots
      const { result: queueResult, snapshot: queueSnapshot } = await captureEvent(
        'joinQueue',
        authUser.id,
        async () => {
          const { data: queueId, error: queueError } = await supabase.rpc(CRITICAL_RPC_FUNCTIONS.JOIN_QUEUE, {
            p_user_id: authUser.id,
            p_fairness_boost: 0
          })
          return { queueId, queueError }
        }
      )
      
      const { queueId, queueError } = queueResult
      
      // CRITICAL: Small delay to ensure join_queue completes and other user is reset
      // This prevents race condition where process_matching runs before the other user is reset
      await new Promise(resolve => setTimeout(resolve, 100))

      if (queueError) {
        // 🔍 MODULE 2 & 4: Log error and validate state (from database)
        const { data: queueAfter } = await supabase.from('matching_queue').select('*')
        const { data: matchesAfter } = await supabase.from('matches').select('*').eq('status', 'pending')
        const errorState = {
          queue: queueAfter || [],
          matches: matchesAfter || [],
          timestamp: new Date().toISOString(),
          debugState: debugState(),
          error: queueError
        }
        
        logError({
          type: 'joinQueueError',
          error: queueError,
          user: authUser.id,
          beforeState: queueSnapshot.beforeState,
          afterState: errorState,
          metadata: {
            message: queueError?.message,
            code: queueError?.code,
            details: queueError?.details,
            hint: queueError?.hint
          }
        })
        
        // Also log to database
        try {
          await supabase.rpc('spark_log_event', {
            p_event_type: 'joinQueueError',
            p_event_category: 'error',
            p_event_message: queueError?.message || 'Failed to join queue',
            p_event_data: {
              message: queueError?.message,
              code: queueError?.code,
              details: queueError?.details,
              hint: queueError?.hint,
              error: queueError?.message || 'Unknown error'
            },
            p_user_id: authUser.id,
            p_related_table: 'matching_queue',
            p_source: 'CLIENT',
            p_severity: 'ERROR'
          })
        } catch (e: any) {
          console.log('🔍 DEBUG: Database error logging failed:', e?.message)
        }
        
        // 🔍 MODULE 4: Validate state after error
        validateAfterEvent('joinQueueError', errorState)
        
        console.error('🔍 DEBUG: Join queue error', { userId: authUser.id, error: queueError, errorState })
        
        console.error('Error joining queue:', queueError)
        console.error('Error details:', {
          message: queueError?.message,
          code: queueError?.code,
          details: queueError?.details,
          hint: queueError?.hint,
          fullError: JSON.stringify(queueError, Object.getOwnPropertyNames(queueError))
        })
        // Log frontend error
        await supabase.rpc('log_frontend_error', {
          p_error_type: 'frontend',
          p_error_message: queueError.message || 'Unknown error',
          p_function_name: 'startSpin_join_queue',
          p_user_id: authUser.id,
          p_error_details: {
            error_code: queueError.code,
            error_details: queueError.details,
            error_hint: queueError.hint
          },
          p_severity: 'ERROR'
        })
        setSpinning(false)
        setStarted(false)
        return
      }

      // 🔍 MODULE 1: Update debug state
      addToQueue(authUser.id, {})
      
      // 🔍 MODULE 2: Log successful queue join (capture actual database state)
      const { data: queueAfter } = await supabase.from('matching_queue').select('*')
      const { data: matchesAfter } = await supabase.from('matches').select('*').eq('status', 'pending')
      const afterState = {
        queue: queueAfter || [],
        matches: matchesAfter || [],
        timestamp: new Date().toISOString(),
        debugState: debugState()
      }
      
      logEvent({
        type: 'queueJoined',
        user: authUser.id,
        beforeState: queueSnapshot.beforeState,
        afterState,
        metadata: { queueId }
      })
      
      // Also log to database
      try {
        await supabase.rpc('spark_log_event', {
          p_event_type: 'queueJoined',
          p_event_category: 'queue',
          p_event_message: `User joined queue successfully`,
          p_event_data: { queueId, userId: authUser.id },
          p_user_id: authUser.id,
          p_related_table: 'matching_queue',
          p_source: 'CLIENT',
          p_severity: 'INFO'
        })
      } catch (e) {}
      
      // 🔍 MODULE 4: Validate state after queue join
      validateAfterEvent('queueJoined', afterState)
      
      console.log('🔍 DEBUG: Queue joined', { userId: authUser.id, queueId, afterState })

      setIsInQueue(true)

      // CRITICAL: Small delay to ensure join_queue completes and other user is reset
      // This prevents race condition where process_matching runs before the other user is reset
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Process matching - find best match (with detailed error logging)
      // Note: This initial attempt may find no match if other user hasn't joined yet
      // The polling interval (every 2 seconds) will keep trying until match is found
      let matchId: string | null = null
      
      // 🔍 MODULE 3: Capture matching attempt with snapshots
      const { result: matchResult, snapshot: matchSnapshot } = await captureEvent(
        'processMatching',
        authUser.id,
        async () => {
          // 🔒 LOCKED: Must use SPARK wrapper
          const { data: matchIdResult, error: matchError } = await supabase.rpc(CRITICAL_RPC_FUNCTIONS.PROCESS_MATCHING, {
            p_user_id: authUser.id
          })
          return { matchIdResult, matchError }
        }
      )
      
      const { matchIdResult, matchError } = matchResult

      if (matchError) {
        // 🔍 MODULE 2 & 4: Log error with actual database state
        const { data: queueAfter } = await supabase.from('matching_queue').select('*')
        const { data: matchesAfter } = await supabase.from('matches').select('*').eq('status', 'pending')
        const errorState = {
          queue: queueAfter || [],
          matches: matchesAfter || [],
          timestamp: new Date().toISOString(),
          debugState: debugState(),
          error: matchError
        }
        
        logError({
          type: 'processMatchingError',
          error: matchError,
          user: authUser.id,
          beforeState: matchSnapshot.beforeState,
          afterState: errorState,
          metadata: {
            message: matchError?.message,
            code: matchError?.code,
            details: matchError?.details,
            hint: matchError?.hint
          }
        })
        validateAfterEvent('processMatchingError', errorState)
        
        console.error('🔍 DEBUG: Process matching error', { userId: authUser.id, error: matchError, errorState })
        console.error('❌ Error processing matching:', matchError)
        // Log frontend error
        await supabase.rpc('log_frontend_error', {
          p_error_type: 'frontend',
          p_error_message: matchError.message || 'Unknown error',
          p_function_name: 'startSpin',
          p_user_id: authUser.id,
          p_error_details: {
            error_code: matchError.code,
            error_details: matchError.details,
            error_hint: matchError.hint
          },
          p_severity: 'ERROR'
        })
      } else {
        matchId = matchIdResult
      }

      // Log matching attempt for debugging
      const { data: matchingLog } = await supabase.rpc('log_matching_attempt', {
        p_user_id: authUser.id
      })
      console.log('🔍 Initial matching attempt log:', matchingLog)
      
      if (!matchId) {
        console.log('⚠️ No match found on initial attempt. Polling will continue every 2 seconds until match is found...')
        const { data: queueStatus } = await supabase
          .from('matching_queue')
          .select('status, fairness_score, joined_at')
          .eq('user_id', authUser.id)
          .single()
        console.log('📊 Current queue status:', queueStatus)
        
        // Check how many potential matches are in queue
        const { data: queueUsers } = await supabase
          .from('matching_queue')
          .select('user_id, status')
          .neq('user_id', authUser.id)
          .in('status', ['spin_active', 'queue_waiting'])
        console.log('👥 Other users in queue:', queueUsers?.length || 0)
        
        // Also check if user was matched by another process (check for vote_active status)
        if (queueStatus?.status === 'vote_active') {
          console.log('✅ User is in vote_active - match was created!')
          // Find the match
          const { data: activeMatch } = await supabase
            .from('matches')
            .select('*')
            .or(`user1_id.eq.${authUser.id},user2_id.eq.${authUser.id}`)
            .eq('status', 'pending')
            .order('matched_at', { ascending: false })
            .limit(1)
            .single()
          
          if (activeMatch) {
            console.log('✅ Found active match:', activeMatch.id)
            matchId = activeMatch.id
          }
        }
      } else {
        console.log('✅ Match found immediately!', matchId)
      }

      if (matchId) {
        console.log('Match found immediately:', matchId)
        // Match found immediately - check if it was created
        const { data: match } = await supabase
          .from('matches')
          .select('*')
          .eq('id', matchId)
          .single()

        if (match) {
          // CRITICAL: Verify this match actually belongs to the current authenticated user
          if (match.user1_id !== authUser.id && match.user2_id !== authUser.id) {
            console.error('❌ Match does not belong to current user!', {
              matchUser1: match.user1_id,
              matchUser2: match.user2_id,
              currentUserId: authUser.id
            })
            return
          }

          // Get partner ID
          const partnerId = match.user1_id === authUser.id ? match.user2_id : match.user1_id
          
          // CRITICAL: According to matching_logic.md, once users are matched, both enter vote_active status
          // They leave the queue but remain in matching_queue with vote_active status
          // We should verify the match is valid by checking:
          // 1. The match exists and is pending
          // 2. Both users are in vote_active OR one is in vote_active and the other is transitioning
          // We should NOT delete the match just because a user isn't in queue - they might be in vote_active!
          
          // Verify the match is still valid by checking if it exists and is pending
          const { data: matchVerification } = await supabase
            .from('matches')
            .select('id, status, user1_id, user2_id')
            .eq('id', matchId)
            .eq('status', 'pending')
            .single()
          
          if (!matchVerification) {
            console.log('⚠️ Match no longer exists or is not pending - may have been deleted or completed')
            // Match was deleted or completed - reset and continue spinning
            setSpinning(false)
            setStarted(false)
            setIsInQueue(false)
            return
          }
          
        // Check partner's queue status to ensure they're in a valid state
        // Valid states: vote_active (matched), spin_active (waiting), queue_waiting (waiting)
        // Add retry logic to handle race conditions where partner status hasn't updated yet
        let partnerQueue = null
        // 🔒 LOCKED: Race condition handling - must match MATCHING_CONFIG
        // See: /LOCKED_STATE.md - Error Handling Patterns
        const matchingConfig = getMatchingConfig()
        let retries = matchingConfig.maxRetries
        let retryDelay = matchingConfig.retryDelay
        
        while (retries > 0 && !partnerQueue) {
          // Try multiple query approaches to find the partner
          // Approach 1: Standard query
          const { data: queueData, error: queueError } = await supabase
            .from('matching_queue')
            .select('status')
            .eq('user_id', partnerId)
            .maybeSingle() // Use maybeSingle() instead of single() to avoid errors
          
          if (queueData) {
            partnerQueue = queueData
            break
          }
          
          // Approach 2: Check for vote_active status specifically (match might have just been created)
          const { data: voteActiveData, error: voteActiveError } = await supabase
            .from('matching_queue')
            .select('status')
            .eq('user_id', partnerId)
            .eq('status', 'vote_active')
            .maybeSingle()
          
          if (voteActiveData) {
            partnerQueue = voteActiveData
            break
          }
          
          // Approach 3: Check all statuses (spin_active, queue_waiting, vote_active)
          const { data: anyStatusData, error: anyStatusError } = await supabase
            .from('matching_queue')
            .select('status')
            .eq('user_id', partnerId)
            .in('status', ['spin_active', 'queue_waiting', 'vote_active'])
            .maybeSingle()
          
          if (anyStatusData) {
            partnerQueue = anyStatusData
            break
          }
          
          // If partner not found, wait a bit and retry (race condition: match just created)
          if (retries > 1) {
            console.log(`⏳ Partner not in queue yet, retrying... (${retries - 1} retries left)`, {
              partnerId,
              queueError: queueError?.message,
              voteActiveError: voteActiveError?.message,
              anyStatusError: anyStatusError?.message
            })
            await new Promise(resolve => setTimeout(resolve, retryDelay))
            retries--
          } else {
            retries--
          }
        }
          
          // If partner is not in queue at all after retries, check if match was deleted
          // This can happen if the partner closed their tab/browser before we checked
          if (!partnerQueue) {
            // Re-check if match still exists - it might have been deleted
            const { data: matchRecheck } = await supabase
              .from('matches')
              .select('id, status')
              .eq('id', matchId)
              .single()
            
            if (!matchRecheck) {
              // Match was deleted - partner likely disconnected
              console.log('⚠️ Match was deleted - partner likely disconnected', {
                partnerId,
                matchId
              })
              setSpinning(false)
              setStarted(false)
              setIsInQueue(false)
              return
            }
            
            // Match still exists but partner not in queue after retries
            // This is an orphaned match - try to fix it via validate_queue_integrity
            console.warn('⚠️ Partner not found in queue after retries but match still exists - attempting auto-fix', {
              partnerId,
              matchId,
              matchStatus: matchRecheck.status
            })
            
            // Call validate_queue_integrity to auto-fix the orphaned match
            try {
              const { data: integrityResult, error: integrityError } = await supabase.rpc('validate_queue_integrity')
              
              if (integrityError) {
                console.error('❌ Error calling validate_queue_integrity:', integrityError)
              } else {
                console.log('✅ validate_queue_integrity called, result:', integrityResult)
                
                // Re-check if match still exists after cleanup
                const { data: matchAfterCleanup } = await supabase
                  .from('matches')
                  .select('id, status')
                  .eq('id', matchId)
                  .single()
                
                if (!matchAfterCleanup) {
                  // Match was cleaned up - partner disconnected
                  console.log('⚠️ Match was cleaned up by validate_queue_integrity - partner disconnected', {
                    partnerId,
                    matchId
                  })
                  setSpinning(false)
                  setStarted(false)
                  setIsInQueue(false)
                  return
                }
                
                // Try to find partner again after cleanup - wait a bit for status to update
                await new Promise(resolve => setTimeout(resolve, 500)) // Wait 500ms for status updates
                
                // Try multiple times to find partner (they might be updating status)
                let partnerAfterCleanup = null
                for (let retry = 0; retry < 3; retry++) {
                  // Try multiple query approaches
                  // Approach 1: Standard query with maybeSingle (doesn't throw on no results)
                  const { data: partnerData, error: partnerError } = await supabase
                    .from('matching_queue')
                    .select('status')
                    .eq('user_id', partnerId)
                    .maybeSingle()
                  
                  if (partnerData) {
                    partnerAfterCleanup = partnerData
                    break
                  }
                  
                  // Approach 2: Check for vote_active status specifically
                  const { data: voteActiveData, error: voteActiveError } = await supabase
                    .from('matching_queue')
                    .select('status')
                    .eq('user_id', partnerId)
                    .eq('status', 'vote_active')
                    .maybeSingle()
                  
                  if (voteActiveData) {
                    partnerAfterCleanup = voteActiveData
                    break
                  }
                  
                  // Approach 3: Check all valid statuses
                  const { data: anyStatusData, error: anyStatusError } = await supabase
                    .from('matching_queue')
                    .select('status')
                    .eq('user_id', partnerId)
                    .in('status', ['spin_active', 'queue_waiting', 'vote_active'])
                    .maybeSingle()
                  
                  if (anyStatusData) {
                    partnerAfterCleanup = anyStatusData
                    break
                  }
                  
                  // Last resort: Try RPC function to bypass potential RLS issues
                  if (retry === 0) {
                    try {
                      const { data: rpcResult, error: rpcError } = await supabase.rpc('check_user_in_queue', {
                        p_user_id: partnerId
                      })
                      
                      if (rpcResult?.found) {
                        partnerAfterCleanup = { status: rpcResult.status }
                        console.log('✅ Partner found via RPC function (startSpin):', rpcResult)
                        break
                      }
                    } catch (rpcException: any) {
                      console.error('❌ Exception calling check_user_in_queue RPC:', rpcException)
                    }
                  }
                  
                  // Log errors for debugging - properly serialize error objects
                  if (retry === 0) {
                    console.error('🔍 Partner lookup attempts (startSpin):', {
                      partnerId,
                      partnerError: partnerError ? {
                        message: partnerError.message,
                        code: partnerError.code,
                        details: partnerError.details,
                        hint: partnerError.hint
                      } : null,
                      voteActiveError: voteActiveError ? {
                        message: voteActiveError.message,
                        code: voteActiveError.code,
                        details: voteActiveError.details,
                        hint: voteActiveError.hint
                      } : null,
                      anyStatusError: anyStatusError ? {
                        message: anyStatusError.message,
                        code: anyStatusError.code,
                        details: anyStatusError.details,
                        hint: anyStatusError.hint
                      } : null,
                      partnerData,
                      voteActiveData,
                      anyStatusData
                    })
                  }
                  
                  if (retry < 2) {
                    await new Promise(resolve => setTimeout(resolve, 300)) // Wait 300ms between retries
                  }
                }
                
                if (partnerAfterCleanup) {
                  // Partner found after cleanup - use it
                  partnerQueue = partnerAfterCleanup
                  console.log('✅ Partner found after validate_queue_integrity cleanup:', partnerAfterCleanup.status)
                } else {
                  // Partner still not found - match might be orphaned, reset state gracefully
                  console.error('❌ Partner still not found after validate_queue_integrity and retries - resetting state', {
                    partnerId,
                    matchId
                  })
                  setSpinning(false)
                  setStarted(false)
                  setIsInQueue(false)
                  return
                }
              }
            } catch (cleanupError: any) {
              console.error('❌ Exception calling validate_queue_integrity:', cleanupError)
              // If cleanup fails, reset state to prevent stuck UI
              setSpinning(false)
              setStarted(false)
              setIsInQueue(false)
              return
            }
          }
          
          // Partner is in queue - check if status is valid
          // vote_active = matched (correct!), spin_active/queue_waiting = still waiting (shouldn't happen but acceptable during transition)
          if (partnerQueue && !['vote_active', 'spin_active', 'queue_waiting'].includes(partnerQueue.status)) {
            console.error('❌ Partner in invalid queue status:', {
              partnerId,
              status: partnerQueue.status,
              matchId
            })
            // Invalid status - reset but don't delete match (let database handle it)
            setSpinning(false)
            setStarted(false)
            setIsInQueue(false)
            return
          }
          
          console.log('✅ Match verified: match exists and partner is in valid state:', partnerQueue?.status || 'vote_active')
          
          // Fetch partner profile
          const { data: partnerProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', partnerId)
            .single()

          if (partnerProfile) {
            // 🔍 MODULE 1: Update debug state - create pair
            createPair(authUser.id, partnerId)
            
            // 🔍 MODULE 2: Log match success (capture actual database state)
            const { data: queueAfter } = await supabase.from('matching_queue').select('*')
            const { data: matchesAfter } = await supabase.from('matches').select('*').eq('status', 'pending')
            const afterState = {
              queue: queueAfter || [],
              matches: matchesAfter || [],
              timestamp: new Date().toISOString(),
              debugState: debugState()
            }
            
            logEvent({
              type: 'matchCreated',
              user: authUser.id,
              afterState,
              metadata: { 
                matchId: match.id, 
                partnerId,
                partnerName: partnerProfile.name 
              }
            })
            
            // Also log to database
            try {
              await supabase.rpc('spark_log_event', {
                p_event_type: 'matchCreated',
                p_event_category: 'match',
                p_event_message: `Match created between ${authUser.id} and ${partnerId}`,
                p_event_data: {
                  matchId: match.id,
                  partnerId,
                  partnerName: partnerProfile.name
                },
                p_user_id: authUser.id,
                p_related_user_id: partnerId,
                p_related_table: 'matches',
                p_source: 'CLIENT',
                p_severity: 'INFO'
              })
            } catch (e) {}
            
            // 🔍 MODULE 4: Validate state after match creation
            validateAfterEvent('matchCreated', afterState)
            
            console.log('🔍 DEBUG: Match created', { userId: authUser.id, matchId: match.id, partnerId, afterState })
            
            // 🔍 MODULE 7: Set heartbeat timer
            setHeartbeatTimer(authUser.id) // Heartbeat every 10s (configured in timeManager)
            
            setSpinning(false)
            setCurrentMatchId(match.id)
            setMatchedPartner({
              id: partnerProfile.id,
              name: partnerProfile.name,
              age: partnerProfile.age,
              bio: partnerProfile.bio || '',
              photo: filterValidPhoto(partnerProfile.photo),
              location: partnerProfile.location || ''
            })
            setIsInQueue(false)
            // Store vote_started_at for synchronized countdown
            if (match.vote_started_at) {
              setVoteStartedAt(match.vote_started_at)
            } else if (match.matched_at) {
              setVoteStartedAt(match.matched_at)
            }
            setTimeout(() => {
              setRevealed(true)
            }, 300)
            return
          }
        }
      }

      // If no immediate match, keep spinning and wait for real-time match notification
      // The real-time subscription will handle match detection
    } catch (error: any) {
      // 🔍 MODULE 2 & 4: Log error and validate state
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const errorState = debugState()
      logError({
        type: 'startSpinError',
        error: error,
        user: authUser?.id,
        afterState: errorState,
        metadata: {
          message: error?.message,
          stack: error?.stack
        }
      })
      validateAfterEvent('startSpinError', errorState)
      
      console.error('Error in startSpin:', error)
      // Log frontend error
      if (authUser) {
        await supabase.rpc('log_frontend_error', {
          p_error_type: 'frontend',
          p_error_message: error?.message || 'Unknown error in startSpin',
          p_function_name: 'startSpin',
          p_user_id: authUser.id,
          p_error_details: {
            error_name: error?.name,
            error_stack: error?.stack
          },
          p_severity: 'ERROR'
        })
      }
      setSpinning(false)
      setStarted(false)
    }
  }

  const handleCountdownComplete = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return

    // CRITICAL: Only process countdown completion if user is actually in voting window
    // Prevent premature redirects - user must stay in voting window until countdown completes
    // Check for currentMatchId OR voteStartedAt (timer can show before revealed animation)
    if (!currentMatchId && !voteStartedAt) {
      console.log('⚠️ Countdown completed but user not in voting window - ignoring')
      return
    }

    // If user voted yes and waiting for match, check if match was created
    if (userVote === "yes" && waitingForMatch && currentMatchId) {
      // Check if both voted yes (match should be ready for video date)
      const { data: match } = await supabase
        .from('matches')
        .select('*')
        .eq('id', currentMatchId)
        .single()

      if (match && match.status === 'pending') {
        // Check if both users voted yes
        const { data: votes } = await supabase
          .from('votes')
          .select('*')
          .or(`and(voter_id.eq.${authUser.id},profile_id.eq.${matchedPartner?.id}),and(voter_id.eq.${matchedPartner?.id},profile_id.eq.${authUser.id})`)
          .eq('vote_type', 'yes')

        if (votes && votes.length === 2) {
          // Both voted yes - redirect to video date
          router.push(`/video-date?matchId=${currentMatchId}`)
          return
        } else {
          // Only this user voted yes, other user didn't vote (idle)
          // Re-queue this yes voter automatically
          const { data: existingQueue } = await supabase
            .from('matching_queue')
            .select('fairness_score')
            .eq('user_id', authUser.id)
            .single()

          if (existingQueue) {
            // Update existing queue entry with +8 fairness boost (user who didn't get to vote)
            await supabase
              .from('matching_queue')
              .update({ 
                fairness_score: existingQueue.fairness_score + 8,
                status: 'spin_active',
                updated_at: new Date().toISOString()
              })
              .eq('user_id', authUser.id)
          } else {
            // 🔒 LOCKED: Must use SPARK wrapper
            const queueId = await supabase.rpc(CRITICAL_RPC_FUNCTIONS.JOIN_QUEUE, { p_user_id: authUser.id, p_fairness_boost: 8 })
            // Add +8 boost after joining
            await supabase
              .from('matching_queue')
              .update({ fairness_score: 8 })
              .eq('user_id', authUser.id)
          }

          // Remove idle partner from vote_active status
          await supabase.rpc('remove_from_queue', { p_user_id: matchedPartner?.id })
          
          // 🔒 LOCKED: Must use SPARK wrapper
          await supabase.rpc(CRITICAL_RPC_FUNCTIONS.PROCESS_MATCHING, { p_user_id: authUser.id })
          
          // Reset UI but keep spinning - user is automatically re-queued
          setRevealed(false)
          setUserVote(null)
          setMatchedPartner(null)
          setCurrentMatchId(null)
          setWaitingForMatch(false)
          // Keep spinning state active - user is already in queue and should continue spinning
          setSpinning(true)
          setIsInQueue(true)
          // Don't reset started - keep the spin animation going
          return
        }
      }
    }

    // If user didn't vote within 10 seconds (idle voter)
    if (!userVote) {
      // Check if the other user voted yes
      if (matchedPartner && currentMatchId) {
        const { data: partnerVote } = await supabase
          .from('votes')
          .select('*')
          .eq('voter_id', matchedPartner.id)
          .eq('profile_id', authUser.id)
          .eq('vote_type', 'yes')
          .single()

        if (partnerVote) {
          // Other user voted yes, but this user didn't vote
          // Re-queue the yes voter (other user) automatically
          const { data: existingQueue } = await supabase
            .from('matching_queue')
            .select('fairness_score')
            .eq('user_id', matchedPartner.id)
            .single()

          if (existingQueue) {
            // Update existing queue entry
            await supabase
              .from('matching_queue')
              .update({ 
                fairness_score: existingQueue.fairness_score,
                status: 'spin_active',
                updated_at: new Date().toISOString()
              })
              .eq('user_id', matchedPartner.id)
          } else {
            // 🔒 LOCKED: Must use SPARK wrapper
            await supabase.rpc(CRITICAL_RPC_FUNCTIONS.JOIN_QUEUE, { p_user_id: matchedPartner.id, p_fairness_boost: 0 })
          }
        }
      }

      // Remove idle voter from queue (status will be cleared)
      await supabase.rpc('remove_from_queue', { p_user_id: authUser.id })
      setIsInQueue(false)
      setRevealed(false)
      setStarted(false)
      setUserVote(null)
      setSpinning(false)
      setMatchedPartner(null)
      setCurrentMatchId(null)
      setWaitingForMatch(false)
      // Don't auto-queue - user must press spin again
      return
    }

    // If user voted pass, they're already handled in handleVote
    // This shouldn't be reached for pass votes
  }

  // Handle vote submission
  const handleVote = async (voteType: "yes" | "pass") => {
    if (!user || !matchedPartner || !currentMatchId) return

    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return

    setUserVote(voteType)

    // Save vote to database
    // The votes table has a unique constraint on (voter_id, profile_id)
    // Use upsert to update if vote exists, insert if new
    const { error: voteError } = await supabase
      .from('votes')
      .upsert({
        voter_id: authUser.id,
        profile_id: matchedPartner.id,
        vote_type: voteType
      }, {
        onConflict: 'voter_id,profile_id',
        ignoreDuplicates: false
      })

    if (voteError) {
      console.error('Error saving vote:', voteError)
      console.error('Vote error details:', {
        message: voteError.message,
        code: voteError.code,
        details: voteError.details,
        hint: voteError.hint,
        voter_id: authUser.id,
        profile_id: matchedPartner.id,
        vote_type: voteType
      })
      // Try alternative: delete and insert
      try {
        await supabase
          .from('votes')
          .delete()
          .eq('voter_id', authUser.id)
          .eq('profile_id', matchedPartner.id)
        
        const { error: insertError } = await supabase
          .from('votes')
          .insert({
            voter_id: authUser.id,
            profile_id: matchedPartner.id,
            vote_type: voteType
          })
        
        if (insertError) {
          console.error('Error with delete+insert fallback:', insertError)
          return
        }
      } catch (fallbackError) {
        console.error('Fallback vote save failed:', fallbackError)
        return
      }
    }

    // Record profile view
    await supabase
      .from('profile_views')
      .upsert({
        viewer_id: authUser.id,
        viewed_profile_id: matchedPartner.id
      })

    if (voteType === "yes") {
      // CRITICAL: Set waiting for match state - user MUST stay in voting window
      // DO NOT perform any checks or redirects here
      // User must see the full countdown timer complete
      // Only handleCountdownComplete should check votes and redirect
      setWaitingForMatch(true)
      console.log('✅ User voted yes - staying in voting window until countdown completes')
      
      // Do not check database or redirect - let countdown complete naturally
      // The countdown timer will call handleCountdownComplete when it finishes
      // This ensures users stay in the voting window for the full 10 seconds
    } else {
      // Pass/Respin vote
      // Check if other user already voted yes
      const { data: otherVote } = await supabase
        .from('votes')
        .select('*')
        .eq('voter_id', matchedPartner.id)
        .eq('profile_id', authUser.id)
        .eq('vote_type', 'yes')
        .single()

      if (otherVote) {
        // Other user voted yes, this user votes respin
        // Give fairness boost (+8) to the yes voter (other user)
        // Check if they're already in queue
        const { data: existingQueue } = await supabase
          .from('matching_queue')
          .select('fairness_score')
          .eq('user_id', matchedPartner.id)
          .single()
        
        if (existingQueue) {
          // Update existing queue entry with boost
          await supabase
            .from('matching_queue')
            .update({ 
              fairness_score: existingQueue.fairness_score + 8,
              status: 'spin_active',
              updated_at: new Date().toISOString()
            })
            .eq('user_id', matchedPartner.id)
        } else {
          // 🔒 LOCKED: Must use SPARK wrapper
            await supabase.rpc(CRITICAL_RPC_FUNCTIONS.JOIN_QUEUE, { p_user_id: matchedPartner.id, p_fairness_boost: 0 })
          await supabase
            .from('matching_queue')
            .update({ fairness_score: 8 })
            .eq('user_id', matchedPartner.id)
        }
      } else {
        // Other user hasn't voted yet - no boost given
        // Remove other user from vote_active status so they can match again
        // Check if they're in queue first
        const { data: partnerQueue } = await supabase
          .from('matching_queue')
          .select('*')
          .eq('user_id', matchedPartner.id)
          .single()

        if (partnerQueue && partnerQueue.status === 'vote_active') {
          await supabase
            .from('matching_queue')
            .update({ 
              status: 'spin_active',
              updated_at: new Date().toISOString()
            })
            .eq('user_id', matchedPartner.id)
        }
      }

      // Remove respin voter from vote_active status (if in queue)
      const { data: userQueue } = await supabase
        .from('matching_queue')
        .select('*')
        .eq('user_id', authUser.id)
        .single()

      if (userQueue && userQueue.status === 'vote_active') {
        await supabase
          .from('matching_queue')
          .update({ 
            status: 'spin_active',
            updated_at: new Date().toISOString()
          })
          .eq('user_id', authUser.id)
      } else {
        // Not in queue, remove completely
        await supabase.rpc('remove_from_queue', { p_user_id: authUser.id })
      }
      
      // CRITICAL: Delete the match since respin ends the pairing
      // This allows the same users to potentially match again in the future
      // and prevents orphaned matches
      if (currentMatchId) {
        const { error: matchDeleteError } = await supabase
          .from('matches')
          .delete()
          .eq('id', currentMatchId)
        
        if (matchDeleteError) {
          console.error('Error deleting match on respin:', matchDeleteError)
          // Don't block - validate_queue_integrity will catch it if deletion fails
        } else {
          console.log('✅ Match deleted on respin:', currentMatchId)
        }
      }
      
      // If other user voted yes, they're already being re-queued above with boost
      // If other user hasn't voted yet, they're now back in spin_active status
      
      // Reset match state but keep UI ready for spinning
      setRevealed(false)
      setUserVote(null)
      setMatchedPartner(null)
      setCurrentMatchId(null)
      setWaitingForMatch(false)

      // Automatically re-enter queue (respin always puts users back automatically)
      // Start spinning immediately - no delay needed
      await startSpin()
    }
  }

  // Calculate center position between profile icons - THOROUGH INVESTIGATION
  useEffect(() => {
    if (!revealed) {
      setVoteCenterPosition(50)
      setVoteCenterPx(0)
      return
    }

    const calculateCenter = () => {
      // Check all refs exist
      if (!userProfileRef.current || !partnerProfileRef.current || !voteHeaderParentRef.current) {
        return
      }

      // Use requestAnimationFrame to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        const userRect = userProfileRef.current!.getBoundingClientRect()
        const partnerRect = partnerProfileRef.current!.getBoundingClientRect()
        const parentRect = voteHeaderParentRef.current!.getBoundingClientRect()

        // Get the actual image elements inside the containers
        const userImg = userProfileRef.current!.querySelector('img')
        const partnerImg = partnerProfileRef.current!.querySelector('img') || 
                          partnerProfileRef.current!.querySelector('[class*="relative"]')
        
        // Use image rects if available, otherwise use container rects
        const userImageRect = userImg ? userImg.getBoundingClientRect() : userRect
        const partnerImageRect = partnerImg ? (partnerImg as HTMLElement).getBoundingClientRect() : partnerRect

        // Right edge of user image, left edge of partner image
        const userRight = userImageRect.right
        const partnerLeft = partnerImageRect.left
        const centerX = (userRight + partnerLeft) / 2

        // Convert to pixels relative to parent
        const centerPx = centerX - parentRect.left
        const percentage = (centerPx / parentRect.width) * 100

        // Update position
        setVoteCenterPosition(percentage)
        setVoteCenterPx(centerPx)
      })
    }

    // Try multiple times with increasing delays to ensure DOM is ready
    const timeouts = [
      setTimeout(calculateCenter, 50),
      setTimeout(calculateCenter, 150),
      setTimeout(calculateCenter, 300),
      setTimeout(calculateCenter, 500),
      setTimeout(calculateCenter, 800),
      setTimeout(calculateCenter, 1200),
    ]
    
    // Also recalculate on resize
    window.addEventListener('resize', calculateCenter)
    
    return () => {
      timeouts.forEach(t => clearTimeout(t))
      window.removeEventListener('resize', calculateCenter)
    }
  }, [revealed]) // Only depend on revealed, not voteCenterPx (would cause infinite loop)

  const handleMinAgeChange = (newMinAge: number) => {
    // Ensure min age doesn't exceed max age
    if (newMinAge > preferences.maxAge) {
      setPreferences(prev => ({ ...prev, minAge: prev.maxAge, maxAge: newMinAge }))
    } else {
      setPreferences(prev => ({ ...prev, minAge: newMinAge }))
    }
  }

  const handleMaxAgeChange = (newMaxAge: number) => {
    // Ensure max age doesn't go below min age
    if (newMaxAge < preferences.minAge) {
      setPreferences(prev => ({ ...prev, maxAge: prev.minAge, minAge: newMaxAge }))
    } else {
      setPreferences(prev => ({ ...prev, maxAge: newMaxAge }))
    }
  }

  // Save preferences to database
  const savePreferences = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      console.error('No authenticated user found')
      alert('You must be logged in to save preferences.')
      return
    }

    try {
      const preferencesData = {
        user_id: authUser.id,
        min_age: preferences.minAge,
        max_age: preferences.maxAge,
        max_distance: preferences.maxDistance,
        gender_preference: preferences.genderPreference,
        updated_at: new Date().toISOString()
      }

      console.log('Saving preferences with data:', preferencesData)

      const { data, error } = await supabase
        .from('user_preferences')
        .upsert(preferencesData, {
          onConflict: 'user_id' // Specify conflict target for UNIQUE constraint
        })
        .select()

      if (error) {
        // Log all error properties to catch serialization issues
        const errorDetails: any = {}
        for (const key in error) {
          errorDetails[key] = (error as any)[key]
        }
        console.error('Error saving preferences:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          errorDetails: errorDetails,
          stringified: JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
        })
        
        const errorMessage = error.message || 
                           (error as any).error_description || 
                           (error as any).msg ||
                           'Failed to save preferences'
        alert(`Failed to save preferences: ${errorMessage}`)
      } else {
        console.log('Preferences saved successfully:', data)
        setShowFilters(false)
        // Reload profiles with new preferences
        const newProfiles = await fetchProfiles()
        if (newProfiles.length > 0) {
          setProfileQueue(newProfiles)
          setCurrentProfileIndex(0)
        }
      }
    } catch (err: any) {
      console.error('Exception saving preferences:', {
        message: err?.message,
        error: err,
        stack: err?.stack,
        stringified: JSON.stringify(err, Object.getOwnPropertyNames(err), 2)
      })
      alert(`Failed to save preferences: ${err?.message || 'Unexpected error'}`)
    }
  }

  // Save profile updates to database
  const saveProfile = async (updates: Partial<Profile>) => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return

    const { error } = await supabase
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', authUser.id)

    if (error) {
      console.error('Error saving profile:', error)
      alert('Failed to save profile. Please try again.')
    } else {
      setUser(prev => prev ? { ...prev, ...updates } : null)
      setShowProfile(false)
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen w-full bg-[#050810] text-white flex items-center justify-center">
        <div className="text-teal-300 text-xl">Loading...</div>
      </div>
    )
  }

  const currentProfile = profileQueue[currentProfileIndex]

  return (
    <div className="min-h-screen w-full max-w-full bg-[#050810] text-white flex items-center justify-center relative overflow-x-hidden overflow-y-auto" style={{ paddingLeft: 'max(12px, env(safe-area-inset-left, 0px))', paddingRight: 'max(12px, env(safe-area-inset-right, 0px))', width: '100%', maxWidth: '100vw' }}>
      {/* Background layers */}
      <div className="fixed inset-0 bg-[#050810] pointer-events-none max-w-full" style={{ maxWidth: '100vw', width: '100vw' }} />
      <div className="fixed inset-0 pointer-events-none max-w-full overflow-hidden" style={{ maxWidth: '100vw', width: '100vw' }}>
        <AnimatedGradientBackground />
      </div>
      
      {/* Floating orbs */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 bg-teal-500/20 rounded-full blur-3xl pointer-events-none max-w-full"
        style={{ maxWidth: '100vw' }}
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
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none max-w-full"
        style={{ maxWidth: '100vw' }}
        animate={{
          x: [0, -40, 0],
          y: [0, 40, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
      />

      {/* Sparkles effect */}
      <div 
        className="absolute inset-0 pointer-events-none max-w-full overflow-hidden" 
        style={{ 
          maxWidth: '100vw', 
          width: '100vw',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          boxShadow: 'none',
        }}
      >
        <Sparkles
          sparklesCount={20}
          className="absolute inset-0 pointer-events-none"
          colors={{
            first: "#5eead4",
            second: "#3b82f6"
          }}
        />
      </div>

      {/* Top bar buttons - Mobile optimized with safe area insets */}
      <div 
        className="absolute z-20 flex items-center justify-between w-full"
        style={{ 
          top: 'calc(4rem + max(8px, calc(env(safe-area-inset-top, 0px) + 8px)))',
          left: 0,
          right: 0,
          paddingLeft: 'max(12px, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(12px, env(safe-area-inset-right, 0px))',
        }}
      >
        {/* Profile button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
          className="flex-shrink-0"
        >
          <ShimmerButton
            onClick={() => setShowProfile(true)}
            className="h-9 sm:h-12 md:h-14 bg-teal-300 text-black hover:bg-teal-300 hover:text-black active:scale-95 touch-manipulation !px-3 sm:!px-5 md:!px-6"
            shimmerColor="#ffffff"
            background="rgba(94, 234, 212, 1)"
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <User className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              <span className="text-xs sm:text-base font-medium whitespace-nowrap">profile</span>
            </div>
          </ShimmerButton>
        </motion.div>

        {/* Filter button */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
          className="flex-shrink-0"
        >
          <ShimmerButton
            onClick={() => setShowFilters(true)}
            className="h-9 sm:h-12 md:h-14 bg-teal-300 text-black hover:bg-teal-300 hover:text-black active:scale-95 touch-manipulation !px-3 sm:!px-5 md:!px-6"
            shimmerColor="#ffffff"
            background="rgba(94, 234, 212, 1)"
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <Filter className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              <span className="text-xs sm:text-base font-medium whitespace-nowrap">filters</span>
            </div>
          </ShimmerButton>
        </motion.div>
      </div>

      {/* Start spin button */}
      <AnimatePresence>
        {!started && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-4 sm:gap-8"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            {/* Pulsing glow behind button */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <div className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 bg-teal-300/20 rounded-full blur-3xl" />
            </motion.div>

            <motion.div
              animate={{
                scale: [1, 1.05, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <PrimaryButton
                onClick={startSpin}
                size="md"
                variant="primary"
              >
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={{
                      rotate: [0, 360],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  >
                    <SparklesIcon className="w-5 h-5" />
                  </motion.div>
                  <span>start spin</span>
                </div>
              </PrimaryButton>
            </motion.div>

            {/* Platform rules - rotating every 10 seconds */}
            <div className="text-sm sm:text-lg opacity-60 text-center max-w-md px-4 min-h-[1.5rem] sm:min-h-[1.75rem] flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.p
                  key={currentRuleIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 0.6, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.5, ease: "easeInOut" }}
                >
                  {platformRules[currentRuleIndex]}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      {/* Show timer OUTSIDE AnimatePresence so it's always visible when currentMatchId is set */}
      {(() => {
        const shouldShow = currentMatchId || voteStartedAt
        console.log('🔍 Timer outer check:', {
          shouldShow,
          currentMatchId,
          voteStartedAt,
          revealed
        })
        return shouldShow
      })() && (
        <div
          data-vote-header-outer
          className="fixed top-8 sm:top-4 md:top-2 left-1/2 transform -translate-x-1/2 z-[9999]"
          style={{ 
            position: 'fixed',
            top: '2rem',
            left: voteCenterPx > 0 ? `${voteCenterPx}px` : '50%',
            transform: 'translateX(-50%)',
            width: 'max-content',
            maxWidth: 'calc(100vw - 32px)',
            visibility: 'visible',
            display: 'block',
            zIndex: 99999, // Even higher z-index
            pointerEvents: 'auto',
          } as React.CSSProperties}
        >
          <div className="rounded-lg sm:rounded-3xl overflow-visible" style={{ padding: '2px' }}>
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ 
                opacity: 1, 
                y: 0, 
                scale: 1,
                boxShadow: [
                  "0 0 30px rgba(94,234,212,0.4)",
                  "0 0 50px rgba(94,234,212,0.6)",
                  "0 0 30px rgba(94,234,212,0.4)",
                ],
              }}
              exit={{ opacity: 0, y: -20 }}
              transition={{
                delay: 0,
                type: "spring",
                stiffness: 300,
                damping: 25,
                boxShadow: {
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
              }}
              className="flex items-center justify-center gap-1 sm:gap-3 md:gap-4 px-3 sm:px-8 md:px-10 py-2 sm:py-4 md:py-5 rounded-lg sm:rounded-3xl bg-gradient-to-r from-teal-300/30 via-teal-300/25 to-blue-500/30 backdrop-blur-xl border-2 border-teal-300/60 sm:border-2 relative"
              style={{
                visibility: 'visible',
                display: 'flex',
                opacity: 1,
                pointerEvents: 'auto',
              }}
            >
              <motion.span
                className="text-sm sm:text-3xl md:text-4xl font-extrabold text-teal-300 whitespace-nowrap"
                animate={{
                  textShadow: [
                    "0 0 15px rgba(94,234,212,0.7)",
                    "0 0 30px rgba(94,234,212,1)",
                    "0 0 15px rgba(94,234,212,0.7)",
                  ],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                vote
              </motion.span>
              <span className="text-sm sm:text-3xl md:text-4xl opacity-70 mx-1 sm:mx-1.5">•</span>
              {(() => {
                console.log('🔍 Timer inner render:', { currentMatchId, voteStartedAt })
                if (currentMatchId) {
                  console.log('✅ Rendering MatchSynchronizedCountdownTimer with matchId:', currentMatchId)
                  return (
                    <div style={{ minWidth: '50px', display: 'inline-block', visibility: 'visible', opacity: 1 }}>
                      <MatchSynchronizedCountdownTimer
                        matchId={currentMatchId}
                        initialSeconds={10}
                        onComplete={handleCountdownComplete}
                      />
                    </div>
                  )
                } else if (voteStartedAt) {
                  console.log('✅ Rendering SynchronizedCountdownTimer with voteStartedAt:', voteStartedAt)
                  return (
                    <div style={{ minWidth: '50px', display: 'inline-block', visibility: 'visible', opacity: 1 }}>
                      <SynchronizedCountdownTimer
                        startTimestamp={voteStartedAt}
                        initialSeconds={10}
                        onComplete={handleCountdownComplete}
                      />
                    </div>
                  )
                } else {
                  console.log('✅ Rendering CountdownTimer fallback')
                  return (
                    <div style={{ minWidth: '50px', display: 'inline-block', visibility: 'visible', opacity: 1 }}>
                      <CountdownTimer
                        resetKey={revealed ? "revealed" : "hidden"}
                        initialSeconds={10}
                        onComplete={handleCountdownComplete}
                      />
                    </div>
                  )
                }
              })()}
            </motion.div>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {started && (
          <>
            <motion.div
              ref={voteHeaderParentRef}
              key="started"
              className="w-full max-w-6xl min-h-full flex flex-col gap-1 sm:gap-4 md:gap-6 py-12 sm:py-4 md:py-8 px-2 sm:px-0 overflow-visible relative"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              style={{ overflow: 'visible' }}
            >
            {/* Timer removed - using fixed position timer outside AnimatePresence for immediate visibility */}
            {/* Main content row - Horizontal alignment on all screens */}
            <div ref={containerRef} className="w-full flex flex-row items-center justify-center gap-1.5 sm:gap-4 md:gap-6 lg:gap-8 flex-1 relative px-1 sm:px-0">
              {/* Left side - User profile (S.P.A.R.K. - Refined Clarity) */}
              <motion.div
                className="w-1/2 flex flex-col items-center text-center gap-0.5 sm:gap-3 md:gap-4 relative px-0.5 sm:px-0"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Glow effect behind user card */}
                <motion.div
                  className="absolute inset-0 -z-10"
                  animate={{
                    scale: [1, 1.1, 1],
                    opacity: [0.3, 0.5, 0.3],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 sm:w-48 sm:h-48 md:w-64 md:h-64 bg-teal-300/20 rounded-full blur-3xl" />
                </motion.div>

                {userVote === "yes" && (
                  <motion.div
                    className="absolute -top-6 sm:-top-8 left-1/2 -translate-x-1/2 z-20"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ 
                      scale: [1, 1.2, 1],
                      rotate: [0, 10, -10, 0],
                    }}
                    transition={{ 
                      type: "spring", 
                      stiffness: 200, 
                      damping: 15,
                      rotate: {
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      },
                      scale: {
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                      },
                    }}
                  >
                    <div className="w-6 h-6 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-teal-300 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(94,234,212,0.8)]">
                      <span className="text-base sm:text-xl md:text-2xl font-bold text-black">✓</span>
                    </div>
                  </motion.div>
                )}
                
                <motion.div
                  ref={userProfileRef}
                  className="relative w-24 h-24 sm:w-40 sm:h-40 md:w-48 md:h-48 rounded-lg sm:rounded-xl md:rounded-2xl overflow-hidden border-2 sm:border-3 md:border-4 border-teal-300/50 shadow-[0_0_30px_rgba(94,234,212,0.3)]"
                  whileHover={{ scale: 1.05 }}
                  animate={{
                    boxShadow: [
                      "0 0 30px rgba(94,234,212,0.3)",
                      "0 0 50px rgba(94,234,212,0.5)",
                      "0 0 30px rgba(94,234,212,0.3)",
                    ],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  {user.photo && user.photo.trim() !== '' && !user.photo.includes('pravatar.cc') ? (
                    <Image
                      src={user.photo}
                      alt={user.name}
                      fill
                      sizes="(max-width: 640px) 80px, (max-width: 768px) 100px, 120px"
                      className="object-cover"
                      placeholder="empty"
                      onError={(e) => {
                        // Hide broken images
                        const target = e.currentTarget as HTMLImageElement
                        if (target) {
                          target.style.display = 'none'
                        }
                        setUser(prev => prev ? { ...prev, photo: '' } : null)
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-transparent flex items-center justify-center">
                      {/* No placeholder - empty state */}
                    </div>
                  )}
                  {/* Shimmer overlay */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    animate={{
                      x: ["-100%", "100%"],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      repeatDelay: 2,
                      ease: "easeInOut",
                    }}
                  />
                </motion.div>
                <motion.h2
                  className="text-sm sm:text-xl md:text-2xl font-bold text-teal-300"
                  animate={{
                    textShadow: [
                      "0 0 10px rgba(94,234,212,0.5)",
                      "0 0 20px rgba(94,234,212,0.8)",
                      "0 0 10px rgba(94,234,212,0.5)",
                    ],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  {user.name}
                </motion.h2>
                <p className="text-[10px] sm:text-xs md:text-sm opacity-80 max-w-[150px] sm:max-w-xs leading-tight sm:leading-relaxed text-center line-clamp-1 sm:line-clamp-2">{user.bio}</p>
              </motion.div>

            {/* Right side - Animation/Profile (S.P.A.R.K. - Structured Motion + Playful Energy) */}
            <div className="w-1/2 flex flex-col items-center justify-center relative px-0.5 sm:px-0">
              {/* Glow effect behind match area */}
              {revealed && (
                <motion.div
                  className="absolute inset-0 -z-10"
                  initial={{ opacity: 0 }}
                  animate={{
                    scale: [1, 1.1, 1],
                    opacity: [0.3, 0.5, 0.3],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 sm:w-64 sm:h-64 md:w-80 md:h-80 bg-blue-500/20 rounded-full blur-3xl" />
                </motion.div>
              )}

              <AnimatePresence mode="wait">
                {spinning && (
                  <motion.div
                    key="spinning"
                    className="relative w-full flex items-center justify-center"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    {/* Pulsing glow around shuffle - sized to match animation */}
                    <motion.div
                      className="absolute w-[160px] sm:w-full max-w-md h-[110px] sm:h-80 -z-10 rounded-md sm:rounded-2xl"
                      animate={{
                        boxShadow: [
                          "0 0 15px rgba(94,234,212,0.2)",
                          "0 0 25px rgba(94,234,212,0.4)",
                          "0 0 15px rgba(94,234,212,0.2)",
                        ],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                    <div data-testid="spinning">
                      <ShuffleAnimation
                        profiles={spinningPhotos.length > 0 ? spinningPhotos : []}
                        duration={5000}
                      />
                    </div>
                  </motion.div>
                )}

                {revealed && matchedPartner && (
                  <motion.div
                    data-testid="reveal"
                    key="revealed"
                    className="w-full flex flex-col items-center gap-0.5 sm:gap-3 md:gap-4 relative"
                    initial={{ opacity: 0, scale: 0.9, x: 30 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* Profile card with enhanced effects (S.P.A.R.K. - Playful Energy) */}
                    <motion.div
                      ref={partnerProfileRef}
                      animate={{
                        scale: [1, 1.02, 1],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    >
                      <div data-testid="matched-partner">
                        <ProfileCardSpin
                          photo={matchedPartner.photo}
                          name={matchedPartner.name}
                          age={matchedPartner.age}
                          bio={matchedPartner.bio}
                          isSelected={false}
                        />
                      </div>
                    </motion.div>

                    {/* Action buttons - Under the revealed profile (S.P.A.R.K. - Action Feedback + Refined Clarity) */}
                    <motion.div
                      className="flex items-center justify-center gap-1.5 sm:gap-4 md:gap-5 lg:gap-6 mt-0.5 sm:mt-3 md:mt-4 w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl mx-auto px-1 sm:px-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ delay: 0.4, type: "spring", stiffness: 300, damping: 25 }}
                    >
                      <SpinButton
                        variant="pass"
                        onClick={() => handleVote("pass")}
                        className="flex-1 min-w-[85px] sm:min-w-[100px] md:min-w-[110px] lg:min-w-[120px] max-w-[120px] sm:max-w-[140px] md:max-w-[150px] lg:max-w-[160px] h-9 sm:h-12 md:h-14 text-xs sm:text-base md:text-lg font-semibold touch-manipulation transition-all duration-200 hover:scale-105 active:scale-95"
                      >
                        respin
                      </SpinButton>
                      <SpinButton
                        variant="yes"
                        onClick={() => handleVote("yes")}
                        disabled={waitingForMatch}
                        className="flex-1 min-w-[85px] sm:min-w-[100px] md:min-w-[110px] lg:min-w-[120px] max-w-[120px] sm:max-w-[140px] md:max-w-[150px] lg:max-w-[160px] h-9 sm:h-12 md:h-14 text-xs sm:text-base md:text-lg font-semibold touch-manipulation transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
                      >
                        {waitingForMatch ? "waiting..." : "yes"}
                      </SpinButton>
                    </motion.div>

                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Filter modal */}
      <Modal
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        title="filters"
        className="max-w-md"
      >
        <div className="flex flex-col gap-3 sm:gap-5 md:gap-6">
          {/* Age Range */}
          <FilterInput
            label="age range"
            icon={<Users className="w-4 h-4" />}
          >
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <RangeInput
                  min={18}
                  max={preferences.maxAge}
                  value={preferences.minAge}
                  onChange={handleMinAgeChange}
                  label="minimum age"
                />
              </div>
              <div className="text-lg opacity-60">-</div>
              <div className="flex-1">
                <RangeInput
                  min={preferences.minAge}
                  max={100}
                  value={preferences.maxAge}
                  onChange={handleMaxAgeChange}
                  label="maximum age"
                />
              </div>
            </div>
            <div className="flex items-center justify-between px-2 mt-2">
              <motion.div
                className="px-3 py-1.5 rounded-lg bg-teal-300/10 border border-teal-300/30 text-teal-300 text-sm font-semibold"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                {preferences.minAge}
              </motion.div>
              <span className="text-sm opacity-60">to</span>
              <motion.div
                className="px-3 py-1.5 rounded-lg bg-teal-300/10 border border-teal-300/30 text-teal-300 text-sm font-semibold"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
              >
                {preferences.maxAge}
              </motion.div>
            </div>
          </FilterInput>

          {/* Max Distance */}
          <FilterInput
            label="maximum distance"
            icon={<MapPin className="w-4 h-4" />}
          >
            <RangeInput
              min={1}
              max={100}
              value={preferences.maxDistance}
              onChange={(val) => setPreferences(prev => ({ ...prev, maxDistance: val }))}
              label={`${preferences.maxDistance} miles`}
            />
          </FilterInput>

          {/* Action Buttons - Mobile optimized */}
          <div className="flex gap-2.5 sm:gap-3 mt-3 sm:mt-4 pb-safe sm:pb-0">
            <motion.button
              onClick={() => {
                setPreferences({
                  minAge: 18,
                  maxAge: 30,
                  maxDistance: 50,
                  genderPreference: preferences.genderPreference // Keep current gender preference (auto-set based on user gender)
                })
              }}
              className="flex-1 px-3 sm:px-4 py-3 sm:py-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition-all duration-300 text-sm sm:text-base font-semibold touch-manipulation"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              style={{ minHeight: '44px' }}
            >
              reset
            </motion.button>
            <PrimaryButton
              onClick={savePreferences}
              size="sm"
              variant="primary"
              className="flex-1 h-11 sm:h-auto min-h-[44px] font-semibold text-sm sm:text-base touch-manipulation"
            >
              apply filters
            </PrimaryButton>
          </div>
        </div>
      </Modal>


      {/* Profile modal */}
      <Modal
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        title="your profile"
        className="max-w-sm sm:max-w-md"
      >
        <motion.div
          className="flex flex-col gap-2.5 sm:gap-3 md:gap-4 min-w-0 max-w-full overflow-x-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
        >
          {/* Profile picture */}
          <motion.div
            className="flex flex-col items-center gap-2 sm:gap-3 min-w-0 max-w-full overflow-x-hidden"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="scale-70 sm:scale-90">
              <EditableProfilePicture
                src={user.photo || undefined}
                alt={`${user.name}'s profile`}
                size="lg"
                onImageChange={async (file) => {
                  try {
                    const { data: { user: authUser } } = await supabase.auth.getUser()
                    if (!authUser) return

                    // Convert to blob
                    const blob = await new Promise<Blob>((resolve) => {
                      const reader = new FileReader()
                      reader.onloadend = () => {
                        fetch(reader.result as string)
                          .then(res => res.blob())
                          .then(resolve)
                      }
                      reader.readAsDataURL(file)
                    })

                    // Upload to Supabase Storage
                    const fileExt = file.name.split('.').pop() || 'jpg'
                    const fileName = `${authUser.id}-${Date.now()}.${fileExt}`
                    const filePath = `${authUser.id}/${fileName}`

                    const { error: uploadError } = await supabase.storage
                      .from('profile-pictures')
                      .upload(filePath, blob, {
                        cacheControl: '3600',
                        upsert: true
                      })

                    if (uploadError) throw uploadError

                    // Get public URL
                    const { data: { publicUrl } } = supabase.storage
                      .from('profile-pictures')
                      .getPublicUrl(filePath)

                    // Update profile
                    await saveProfile({ photo: publicUrl })
                  } catch (error) {
                    console.error('Error uploading image:', error)
                    alert('Failed to upload image. Please try again.')
                  }
                }}
              />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-teal-300">{user.name}</h2>
          </motion.div>

          {/* Age - Uneditable */}
          <motion.div
            className="flex flex-col gap-1 sm:gap-1.5 min-w-0 max-w-full overflow-x-hidden"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <label className="text-xs sm:text-sm font-medium opacity-80 flex items-center gap-2">
              <Calendar className="w-3 h-3 sm:w-4 sm:h-4 text-teal-300" />
              age
            </label>
            <div className="p-2.5 sm:p-3 rounded-xl bg-white/5 border border-white/10 min-w-0 max-w-full overflow-x-hidden">
              <p className="text-sm sm:text-base opacity-80 break-words">{user.age}</p>
            </div>
            <p className="text-[10px] sm:text-xs opacity-60">age cannot be changed</p>
          </motion.div>

          {/* Location - Editable */}
          <motion.div
            className="flex flex-col gap-1 sm:gap-1.5 min-w-0 max-w-full overflow-x-hidden"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <label className="text-xs sm:text-sm font-medium opacity-80 flex items-center gap-2">
              <MapPin className="w-3 h-3 sm:w-4 sm:h-4 text-teal-300" />
              location
            </label>
            <EditableBio
              initialBio={user.location}
              onBioChange={(newLocation) => {
                saveProfile({ location: newLocation })
              }}
              maxLength={100}
            />
          </motion.div>

          {/* Bio */}
          <motion.div
            className="min-w-0 max-w-full overflow-x-hidden"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <label className="text-xs sm:text-sm font-medium opacity-80 mb-1 sm:mb-1.5 block flex items-center gap-2">
              <MessageCircle className="w-3 h-3 sm:w-4 sm:h-4 text-teal-300" />
              bio
            </label>
            <EditableBio
              initialBio={user.bio}
              onBioChange={(newBio) => {
                saveProfile({ bio: newBio })
              }}
              maxLength={20}
            />
          </motion.div>

          {/* Info message */}
          <motion.div
            className="p-2.5 sm:p-3 rounded-xl bg-teal-300/10 border border-teal-300/20 min-w-0 max-w-full overflow-x-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            <div className="flex items-start gap-2 sm:gap-2.5 min-w-0">
              <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-300 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs font-medium text-teal-300 mb-0.5 break-words">profile tips</p>
                <p className="text-[10px] sm:text-xs opacity-70 leading-relaxed break-words overflow-wrap-anywhere">
                  keep your bio and location updated. this helps others find you and get to know the real you!
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </Modal>

    </div>
  )
}

