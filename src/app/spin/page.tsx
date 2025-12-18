"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Filter, Sparkles as SparklesIcon, MapPin, User, Calendar, MessageCircle, Users } from "lucide-react"
import { PrimaryButton } from "@/components/ui/primary-button"
import { Modal } from "@/components/ui/modal"
import { ShimmerButton } from "@/components/magicui/shimmer-button"
import { Sparkles } from "@/components/magicui/sparkles"
import { AnimatedGradientBackground } from "@/components/magicui/animated-gradient-background"
import { FilterInput } from "@/components/ui/filter-input"
import { RangeInput } from "@/components/ui/range-input"
import { EditableProfilePicture } from "@/components/ui/editable-profile-picture"
import { EditableBio } from "@/components/ui/editable-bio"
// MatchSynchronizedCountdownTimer removed - spin functionality deleted
import { createClient } from "@/lib/supabase/client"
// Debug imports removed for production

interface Profile {
  id: string
  name: string
  age: number
  bio: string
  photo: string
  location: string
}

export default function spin() {
  const router = useRouter()
  const supabase = createClient()
  
  
  // Flow state tracking - Zero Issues Architecture (3 states only)
  const [flowState, setFlowState] = useState<'idle' | 'waiting' | 'matched'>('idle')
  const [currentMatch, setCurrentMatch] = useState<{
    match_id: string // UUID
    partner_id: string
    partner_name: string
    partner_age: number | null
    partner_photo: string
    partner_bio: string
    vote_window_expires_at?: string
  } | null>(null)
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const acknowledgeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Helper function to filter out pravatar placeholder images
  const filterValidPhoto = (photo: string | null | undefined): string => {
    if (!photo || typeof photo !== 'string') return ''
    if (photo.includes('pravatar.cc')) return ''
    return photo.trim()
  }
  
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [preferences, setPreferences] = useState({
    minAge: 18,
    maxAge: 30,
    city: [] as string[], // Changed to array to support multiple cities
    genderPreference: 'female' as 'male' | 'female'
  })
  const [showFilters, setShowFilters] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showSupportModal, setShowSupportModal] = useState(false)
  const [supportMessage, setSupportMessage] = useState("")
  const [sendingSupport, setSendingSupport] = useState(false)
  const [started, setStarted] = useState(false)
  const [profileModalWidth, setProfileModalWidth] = useState<string>("85%")
  const [onlineCount, setOnlineCount] = useState<number>(100)
  
  // Set responsive modal width - compact but readable
  useEffect(() => {
    const updateWidth = () => {
      if (window.innerWidth >= 768) {
        setProfileModalWidth("500px")
      } else if (window.innerWidth >= 640) {
        setProfileModalWidth("450px")
      } else {
        setProfileModalWidth("85%")
      }
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // Count that changes up/down based on time (same for all users, variable intervals 3-10 seconds)
  useEffect(() => {
    // Deterministic random function based on seed (ensures all users see same changes)
    const seededRandom = (seed: number) => {
      const x = Math.sin(seed) * 10000
      return x - Math.floor(x)
    }
    
    const updateCount = () => {
      // Use current time in seconds for real-time updates
      const now = Date.now()
      const baseTimestamp = new Date('2024-01-01T00:00:00Z').getTime()
      const elapsedSeconds = Math.floor((now - baseTimestamp) / 1000)
      
      // Start from a base count
      let count = 500
      
      // Simplified approach: use time-based segments
      // Each segment is 5 seconds, and we calculate changes deterministically
      const segmentDuration = 5 // 5 seconds per segment
      const segmentIndex = Math.floor(elapsedSeconds / segmentDuration)
      const secondsInSegment = elapsedSeconds % segmentDuration
      
      // Calculate base count from completed segments
      // Use a sine wave pattern for smooth variation
      const baseVariation = Math.sin(segmentIndex * 0.1) * 200 // -200 to +200 variation
      count = 500 + Math.floor(baseVariation)
      
      // Add smaller variations based on segment index
      const segmentSeed = segmentIndex * 137
      const segmentVariation = Math.floor(seededRandom(segmentSeed) * 100) - 50 // -50 to +50
      count += segmentVariation
      
      // Add time-of-day variation (makes it more realistic)
      const hoursSinceBase = elapsedSeconds / 3600
      const dailyVariation = Math.sin((hoursSinceBase / 24) * Math.PI * 2) * 150 // Daily cycle
      count += Math.floor(dailyVariation)
      
      // Add small random walk based on seconds in current segment
      const microVariation = Math.floor(seededRandom(segmentIndex * 271 + secondsInSegment) * 20) - 10
      count += microVariation
      
      // Keep within bounds
      count = Math.max(100, Math.min(1000, count))
      
      setOnlineCount(count)
    }
    
    // Update immediately
    updateCount()
    
    // Update every 2 seconds to catch changes promptly
    const interval = setInterval(updateCount, 2000)
    
    return () => clearInterval(interval)
  }, [])
  const [currentRuleIndex, setCurrentRuleIndex] = useState(0)
  const [userVote, setUserVote] = useState<'yes' | 'pass' | null>(null)
  
  // Platform rules
  const platformRules = [
    "be respectful and kind to everyone you meet",
    "keep conversations appropriate and genuine",
    "no harassment, discrimination, or inappropriate behavior",
    "report any concerns or issues immediately",
    "have fun and be yourself - authenticity matters"
  ]

  // Fetch actual logged-in user
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
            city: Array.isArray(prefs.city) ? prefs.city : (prefs.city ? [prefs.city] : []), // Handle both array and legacy string format
            genderPreference: (prefs.gender_preference || 'female') as 'male' | 'female'
          })
        }

        setLoading(false)
      } catch (error) {
        console.error('Error fetching user data:', error)
        router.push('/')
      }
    }

    fetchUserData()
  }, [router, supabase])

  // Stop polling - defined first to avoid circular dependency
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  // Remove user from queue - DISABLED: All logic removed (no backend calls)
  const leaveQueue = useCallback(async (reason: string) => {
    // No-op: All queue logic has been disabled
    // Only reset local state, no backend calls
    setFlowState('idle')
    setStarted(false)
    setCurrentMatch(null)
    setUserVote(null)
    setCountdownSeconds(null)
  }, [])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling()
      if (acknowledgeTimeoutRef.current) {
        clearTimeout(acknowledgeTimeoutRef.current)
      }
    }
  }, [stopPolling])

  // Start countdown timer for vote window
  const startCountdown = useCallback((expiresAt: string) => {
    const updateCountdown = () => {
      const now = new Date().getTime()
      const expires = new Date(expiresAt).getTime()
      const remaining = Math.max(0, Math.floor((expires - now) / 1000))
      
      // Always show countdown, even if expired (shows 0)
      // This ensures vote buttons are visible
      setCountdownSeconds(remaining)
      
      if (remaining <= 0) {
        // Countdown expired - keep showing 0 so user knows time is up
        // But still allow voting (outcome will be resolved by backend)
        return
      }
      
      // Continue countdown
      setTimeout(updateCountdown, 1000)
    }
    
    updateCountdown()
  }, [])
  
  // Acknowledge match - DISABLED: All logic removed
  const acknowledgeMatch = useCallback(async (matchId: string) => {
    // No-op: All match acknowledgment logic has been disabled
    return
  }, [])
  
  // Start polling for match status - DISABLED: All logic removed
  const startPolling = useCallback(() => {
    // No-op: All polling logic has been disabled
    return
  }, [])
  
  // Start spin - Zero Issues Architecture
  const startSpin = useCallback(async () => {
    try {
      setStarted(true)
      setFlowState('waiting')
      
      // Call new event-driven spin API
      const response = await fetch('/api/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      
      if (!response.ok) {
        throw new Error('Failed to start spin')
      }
      
      const data = await response.json()
      
      // Debug logging
      if (process.env.NODE_ENV === 'development') {
        console.log('Spin API response:', { matched: data.matched, match_id: data.match_id, data })
      }
      
      // Event-driven: API returns match status immediately
      if (data.matched && data.match_id) {
        // Matched immediately - redirect to voting window
        if (process.env.NODE_ENV === 'development') {
          console.log('Redirecting to voting-window:', data.match_id)
        }
        router.push(`/voting-window?matchId=${data.match_id}`)
      } else {
        // Not matched - redirect to spinning page
        if (process.env.NODE_ENV === 'development') {
          console.log('Not matched, redirecting to spinning')
        }
        router.push('/spinning')
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error starting spin:', error)
      }
      setStarted(false)
      setFlowState('idle')
    }
  }, [router])
  
  // Poll for match status updates - DISABLED: All logic removed
  useEffect(() => {
    // No-op: All polling logic has been disabled
    return () => {}
  }, [])

  // Rotate through rules every 10 seconds (only when not started)
  useEffect(() => {
    if (!started && flowState === 'idle') {
      setCurrentRuleIndex(0)
      const interval = setInterval(() => {
        setCurrentRuleIndex((prev) => (prev + 1) % platformRules.length)
      }, 10000)
      return () => clearInterval(interval)
    }
  }, [started, flowState, platformRules.length])

  // Heartbeat system - DISABLED: All logic removed
  useEffect(() => {
    // No-op: All heartbeat logic has been disabled
    return () => {}
  }, [])

  // Handle vote submission - DISABLED: All logic removed
  const handleVote = useCallback(async (voteType: 'yes' | 'pass') => {
    // No-op: All vote logic has been disabled
    return
  }, [])

  // Save preferences to database
  const savePreferences = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        console.error('No authenticated user found')
        return
      }

      const preferencesData = {
        user_id: authUser.id,
        min_age: preferences.minAge,
        max_age: preferences.maxAge,
        city: Array.isArray(preferences.city) && preferences.city.length > 0 ? preferences.city : null, // Save as array or null
        gender_preference: preferences.genderPreference,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('user_preferences')
        .upsert(preferencesData, {
          onConflict: 'user_id'
        })

      if (error) {
        console.error('Error saving preferences:', error)
      } else {
        setShowFilters(false)
      }
    } catch (error) {
      console.error('Error in savePreferences:', error)
    }
  }

  // UI only - no backend calls
  const saveProfile = async (updates: Partial<Profile>) => {
    // UI only - update local state
    setUser(prev => prev ? { ...prev, ...updates } : null)
    setShowProfile(false)
  }

  // Handle age changes
  const handleMinAgeChange = (val: number) => {
    setPreferences(prev => ({ ...prev, minAge: val }))
  }

  const handleMaxAgeChange = (val: number) => {
    setPreferences(prev => ({ ...prev, maxAge: val }))
  }

  // Remove from queue when user leaves or tab hides - UI only, no backend
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        leaveQueue('page-hidden')
      }
    }

    const handleBeforeUnload = () => {
      leaveQueue('before-unload')
    }

    window.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      leaveQueue('unmount')
    }
  }, [leaveQueue])

  if (loading || !user) {
    return (
      <div className="min-h-screen w-full bg-[#050810] text-white flex items-center justify-center">
        <div className="text-teal-300 text-xl">Loading...</div>
      </div>
    )
  }

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

      {/* Top bar buttons */}
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

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
          className="flex items-center gap-2 sm:gap-3"
        >
          {/* Online count indicator */}
          <motion.div
            className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-300 flex-shrink-0" />
            <AnimatePresence mode="wait">
              <motion.span
                key={onlineCount}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                transition={{ duration: 0.3 }}
                className="text-xs sm:text-sm font-medium text-white whitespace-nowrap"
              >
                {onlineCount} people online
              </motion.span>
            </AnimatePresence>
          </motion.div>

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

      {/* Spin animation - shown when flowState is 'waiting' */}
      <AnimatePresence>
        {flowState === 'waiting' && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center z-10"
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

      {/* Vote window UI - shown when flowState is 'matched' (redirects to /voting-window) */}
      <AnimatePresence>
        {false && currentMatch && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center z-10 px-4"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <div className="max-w-md w-full flex flex-col items-center gap-6">
              {/* Partner profile */}
              <motion.div
                className="flex flex-col items-center gap-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {currentMatch?.partner_photo && (
                  <motion.img
                    src={currentMatch?.partner_photo || ''}
                    alt={currentMatch?.partner_name || ''}
                    className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-teal-300"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.3 }}
                  />
                )}
                <div className="text-center">
                  <h2 className="text-2xl sm:text-3xl font-bold text-teal-300">
                    {currentMatch?.partner_name}
                    {currentMatch?.partner_age && `, ${currentMatch?.partner_age}`}
                  </h2>
                  {currentMatch?.partner_bio && (
                    <p className="mt-2 text-sm sm:text-base opacity-80">{currentMatch?.partner_bio}</p>
                  )}
                </div>
              </motion.div>

              {/* Countdown timer - shows remaining time or 0 if expired */}
              {countdownSeconds !== null && (
                <motion.div
                  className={`text-4xl sm:text-5xl font-bold ${
                    countdownSeconds === 0 ? 'text-red-400' : 'text-teal-300'
                  }`}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  {countdownSeconds === 0 ? 'Time\'s Up!' : countdownSeconds}
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Start spin button */}
      <AnimatePresence>
        {flowState === 'idle' && !started && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-4 sm:gap-8"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
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
              <div className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 bg-teal-300/15 rounded-full blur-3xl sm:blur-3xl md:blur-3xl" style={{ transform: 'translateZ(0)', willChange: 'opacity, transform' }} />
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

      {/* Filter modal */}
      <Modal
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        title="filters"
        className="max-w-md"
      >
        <div className="flex flex-col gap-3 sm:gap-5 md:gap-6">
          <FilterInput
            label="age range"
            icon={<User className="w-4 h-4" />}
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

          <FilterInput
            label="location"
            icon={<MapPin className="w-4 h-4" />}
          >
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 mt-2">
              <button
                onClick={() => {
                  setPreferences(prev => {
                    const city = "North England"
                    const currentCities = Array.isArray(prev.city) ? prev.city : (prev.city ? [prev.city] : [])
                    const isSelected = currentCities.includes(city)
                    return {
                      ...prev,
                      city: isSelected 
                        ? currentCities.filter(c => c !== city) // Remove if already selected
                        : [...currentCities, city] // Add if not selected
                    }
                  })
                }}
                className={`p-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-300 touch-manipulation ${
                  (Array.isArray(preferences.city) ? preferences.city : []).includes("North England")
                    ? "bg-teal-300 text-black shadow-lg shadow-teal-300/30"
                    : "bg-white/20 text-white hover:bg-white/25 focus:bg-white/25 focus:border-2 focus:border-teal-300/50"
                }`}
                style={{ minHeight: '36px' }}
              >
                North England
              </button>
              <button
                onClick={() => {
                  setPreferences(prev => {
                    const city = "Midlands"
                    const currentCities = Array.isArray(prev.city) ? prev.city : (prev.city ? [prev.city] : [])
                    const isSelected = currentCities.includes(city)
                    return {
                      ...prev,
                      city: isSelected 
                        ? currentCities.filter(c => c !== city)
                        : [...currentCities, city]
                    }
                  })
                }}
                className={`p-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-300 touch-manipulation ${
                  (Array.isArray(preferences.city) ? preferences.city : []).includes("Midlands")
                    ? "bg-teal-300 text-black shadow-lg shadow-teal-300/30"
                    : "bg-white/20 text-white hover:bg-white/25 focus:bg-white/25 focus:border-2 focus:border-teal-300/50"
                }`}
                style={{ minHeight: '36px' }}
              >
                Midlands
              </button>
              <button
                onClick={() => {
                  setPreferences(prev => {
                    const city = "South England"
                    const currentCities = Array.isArray(prev.city) ? prev.city : (prev.city ? [prev.city] : [])
                    const isSelected = currentCities.includes(city)
                    return {
                      ...prev,
                      city: isSelected 
                        ? currentCities.filter(c => c !== city)
                        : [...currentCities, city]
                    }
                  })
                }}
                className={`p-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-300 touch-manipulation ${
                  (Array.isArray(preferences.city) ? preferences.city : []).includes("South England")
                    ? "bg-teal-300 text-black shadow-lg shadow-teal-300/30"
                    : "bg-white/20 text-white hover:bg-white/25 focus:bg-white/25 focus:border-2 focus:border-teal-300/50"
                }`}
                style={{ minHeight: '36px' }}
              >
                South England
              </button>
              <button
                onClick={() => {
                  setPreferences(prev => {
                    const city = "London"
                    const currentCities = Array.isArray(prev.city) ? prev.city : (prev.city ? [prev.city] : [])
                    const isSelected = currentCities.includes(city)
                    return {
                      ...prev,
                      city: isSelected 
                        ? currentCities.filter(c => c !== city)
                        : [...currentCities, city]
                    }
                  })
                }}
                className={`p-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-300 touch-manipulation ${
                  (Array.isArray(preferences.city) ? preferences.city : []).includes("London")
                    ? "bg-teal-300 text-black shadow-lg shadow-teal-300/30"
                    : "bg-white/20 text-white hover:bg-white/25 focus:bg-white/25 focus:border-2 focus:border-teal-300/50"
                }`}
                style={{ minHeight: '36px' }}
              >
                London
              </button>
              <div className="col-span-2 flex justify-center">
                <button
                  onClick={() => {
                    setPreferences(prev => {
                      const city = "other"
                      const currentCities = Array.isArray(prev.city) ? prev.city : (prev.city ? [prev.city] : [])
                      const isSelected = currentCities.includes(city)
                      return {
                        ...prev,
                        city: isSelected 
                          ? currentCities.filter(c => c !== city)
                          : [...currentCities, city]
                      }
                    })
                  }}
                  className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-300 touch-manipulation ${
                    (Array.isArray(preferences.city) ? preferences.city : []).includes("other")
                      ? "bg-teal-300 text-black shadow-lg shadow-teal-300/30"
                      : "bg-white/20 text-white hover:bg-white/25 focus:bg-white/25 focus:border-2 focus:border-teal-300/50"
                  }`}
                  style={{ minHeight: '36px' }}
                >
                  other
                </button>
              </div>
            </div>
          </FilterInput>

          <div className="flex gap-2.5 sm:gap-3 mt-3 sm:mt-4 pb-safe sm:pb-0">
            <motion.button
              onClick={() => {
                setPreferences({
                  minAge: 18,
                  maxAge: 30,
                  city: [], // Reset to empty array
                  genderPreference: preferences.genderPreference
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
        title={user.name}
        className="max-w-[85%] sm:max-w-[450px] md:max-w-[500px]"
        style={{ maxWidth: profileModalWidth }}
      >
        <motion.div
          className="flex flex-col gap-2 min-w-0 w-full overflow-hidden max-h-[75vh] px-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
        >
          {/* Profile Header - Very Compact */}
          <motion.div
            className="flex flex-row items-center justify-center gap-2 pb-2 border-b border-white/15"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="scale-50">
              <EditableProfilePicture
                src={user.photo || undefined}
                alt={`${user.name}'s profile`}
                size="lg"
                onImageChange={async (file) => {
                  const reader = new FileReader()
                  reader.onloadend = () => {
                    const dataUrl = reader.result as string
                    setUser(prev => prev ? { ...prev, photo: dataUrl } : null)
                  }
                  reader.readAsDataURL(file)
                }}
              />
            </div>
          </motion.div>

          {/* Profile Details - Very Compact */}
          <div className="flex flex-col gap-2 w-full flex-1 min-h-0 overflow-y-auto">
            {/* Age - Very Compact */}
            <motion.div
              className="w-full bg-white/5 rounded-lg p-2 border border-white/10"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-teal-300 flex-shrink-0" />
                  <label className="text-xs font-semibold text-teal-300">Age</label>
                </div>
                <div className="flex items-baseline gap-1">
                  <p className="text-lg sm:text-xl font-bold text-white leading-none">{user.age}</p>
                </div>
              </div>
            </motion.div>

            {/* Location - Very Compact */}
            <motion.div
              className="w-full bg-white/5 rounded-lg p-2 border border-white/10"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-teal-300 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <label className="text-xs font-semibold text-teal-300 inline-block mr-2">Location:</label>
                  <p className="text-xs text-white break-words leading-tight inline">{user.location || "Not set"}</p>
                </div>
              </div>
            </motion.div>

            {/* Bio - Very Compact */}
            <motion.div
              className="w-full bg-white/5 rounded-lg p-2 border border-white/10"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <div className="flex items-start gap-2">
                <MessageCircle className="w-3.5 h-3.5 text-teal-300 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <label className="text-xs font-semibold text-teal-300 inline-block mr-2">Bio:</label>
                  <p className="text-xs text-white/90 break-words leading-tight inline">{user.bio || "Not set"}</p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Support Button - Very Compact */}
          <motion.button
            onClick={() => {
              setShowProfile(false)
              setShowSupportModal(true)
            }}
            className="mt-0 w-full bg-teal-300/20 hover:bg-teal-300/30 border border-teal-300/40 hover:border-teal-300/60 text-teal-300 px-3 py-2 rounded-lg font-semibold text-xs transition-all duration-200 active:scale-[0.98] touch-manipulation flex items-center justify-center gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Chat to Support</span>
          </motion.button>
        </motion.div>
      </Modal>

      {/* Support Modal */}
      <Modal
        isOpen={showSupportModal}
        onClose={() => {
          setShowSupportModal(false)
          setSupportMessage("")
        }}
        title="chat to support"
        className="max-w-xs sm:max-w-sm"
      >
        <motion.div
          className="flex flex-col gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex flex-col gap-2">
            <label className="text-xs sm:text-sm font-medium opacity-80">
              your message
            </label>
            <textarea
              value={supportMessage}
              onChange={(e) => setSupportMessage(e.target.value)}
              placeholder="Type your message here..."
              className="w-full p-3 sm:p-4 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/50 outline-none focus:bg-white/15 focus:border-teal-300/50 transition-all duration-300 resize-none min-h-[120px] text-sm sm:text-base"
              style={{ minHeight: '120px' }}
            />
          </div>

          <button
            onClick={async () => {
              if (!supportMessage.trim()) return
              
              setSendingSupport(true)
              try {
                const { data: { user } } = await supabase.auth.getUser()
                const userEmail = user?.email || 'Not provided'
                const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Unknown'
                
                const response = await fetch('/api/admin/notify-telegram', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    type: 'support',
                    userId: user?.id,
                    userName: userName,
                    userEmail: userEmail,
                    message: supportMessage.trim(),
                  }),
                })

                const data = await response.json()
                
                if (data.success) {
                  setShowSupportModal(false)
                  setSupportMessage("")
                  // You could show a success toast here
                } else {
                  console.error('Failed to send support message:', data.error)
                  // You could show an error toast here
                }
              } catch (error) {
                console.error('Error sending support message:', error)
                // You could show an error toast here
              } finally {
                setSendingSupport(false)
              }
            }}
            disabled={!supportMessage.trim() || sendingSupport}
            className="w-full bg-teal-300 text-black px-4 py-3 rounded-xl font-semibold text-sm sm:text-base transition-all duration-300 active:scale-95 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed hover:bg-teal-200"
          >
            {sendingSupport ? "sending..." : "send"}
          </button>
        </motion.div>
      </Modal>
    </div>
  )
}
