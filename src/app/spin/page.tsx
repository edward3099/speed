"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Filter, Sparkles as SparklesIcon, MapPin, User, Calendar, MessageCircle } from "lucide-react"
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
// Backend logging removed - UI only

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
  const searchParams = useSearchParams()
  const supabase = createClient()
  
  
  // Flow state tracking - Commander states
  const [flowState, setFlowState] = useState<'idle' | 'waiting' | 'paired' | 'vote_window'>('idle')
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
    maxDistance: 50,
    genderPreference: 'female' as 'male' | 'female'
  })
  const [showFilters, setShowFilters] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [started, setStarted] = useState(false)
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
            maxDistance: prefs.max_distance,
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
  
  // Start spin - Simple: calls API and redirects to /spinning
  const startSpin = useCallback(async () => {
    if (!user) return
    
    try {
      const response = await fetch('/api/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        console.error('Failed to start spin:', data.error)
        return
      }
      
      // Redirect to spinning page
      router.push('/spinning')
    } catch (error) {
      console.error('Error starting spin:', error)
    }
  }, [user, router])
  
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

  // UI only - no backend calls
  const savePreferences = async () => {
    setShowFilters(false)
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

      {/* Vote window UI - shown when flowState is 'vote_window' */}
      <AnimatePresence>
        {flowState === 'vote_window' && currentMatch && (
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
                {currentMatch.partner_photo && (
                  <motion.img
                    src={currentMatch.partner_photo}
                    alt={currentMatch.partner_name}
                    className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-teal-300"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.3 }}
                  />
                )}
                <div className="text-center">
                  <h2 className="text-2xl sm:text-3xl font-bold text-teal-300">
                    {currentMatch.partner_name}
                    {currentMatch.partner_age && `, ${currentMatch.partner_age}`}
                  </h2>
                  {currentMatch.partner_bio && (
                    <p className="mt-2 text-sm sm:text-base opacity-80">{currentMatch.partner_bio}</p>
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

          <div className="flex gap-2.5 sm:gap-3 mt-3 sm:mt-4 pb-safe sm:pb-0">
            <motion.button
              onClick={() => {
                setPreferences({
                  minAge: 18,
                  maxAge: 30,
                  maxDistance: 50,
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
        title="your profile"
        className="max-w-sm sm:max-w-md"
      >
        <motion.div
          className="flex flex-col gap-2.5 sm:gap-3 md:gap-4 min-w-0 max-w-full overflow-x-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
        >
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
                  // UI only - create local URL for preview
                  const reader = new FileReader()
                  reader.onloadend = () => {
                    const dataUrl = reader.result as string
                    setUser(prev => prev ? { ...prev, photo: dataUrl } : null)
                  }
                  reader.readAsDataURL(file)
                }}
              />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-teal-300">{user.name}</h2>
          </motion.div>

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
