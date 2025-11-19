"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Filter, Sparkles as SparklesIcon, MapPin, Users, User, Calendar, MessageCircle } from "lucide-react"
import { PrimaryButton } from "@/components/ui/primary-button"
import { SpinButton } from "@/components/ui/spin-button"
import { ProfileCardSpin } from "@/components/ui/profile-card-spin"
import { ShuffleAnimation } from "@/components/ui/shuffle-animation"
import { CountdownTimer } from "@/components/ui/countdown-timer"
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
  
  const [user, setUser] = useState<Profile | null>(null)
  const [profileQueue, setProfileQueue] = useState<Profile[]>([]) // Queue of 3 profiles
  const [currentProfileIndex, setCurrentProfileIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [preferences, setPreferences] = useState({
    minAge: 18,
    maxAge: 30,
    maxDistance: 50,
    genderPreference: 'all' as 'male' | 'female' | 'non-binary' | 'all'
  })
  const [waitingForMatch, setWaitingForMatch] = useState(false)
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null)


  const [started, setStarted] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [userVote, setUserVote] = useState<"yes" | "pass" | null>(null)
  const [voteCenterPosition, setVoteCenterPosition] = useState<number>(50) // Percentage from left
  const [voteCenterPx, setVoteCenterPx] = useState<number>(0) // Pixel position as fallback
  const [currentRuleIndex, setCurrentRuleIndex] = useState(0)
  
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
          photo: profile.photo || '',
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
            genderPreference: prefs.gender_preference || 'all'
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
  }, [router, supabase])

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

  // Set up real-time match detection
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('matches')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'matches',
          filter: `user1_id=eq.${user.id} OR user2_id=eq.${user.id}`
        },
        (payload) => {
          const match = payload.new as any
          // Check if this is a new match (not the one we're waiting for)
          if (match.id !== currentMatchId && waitingForMatch) {
            // Match found! Redirect to video date
            router.push(`/video-date?matchId=${match.id}`)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, waitingForMatch, currentMatchId, router, supabase])

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

  const startSpin = async () => {
    setUserVote(null)
    setRevealed(false)
    setSpinning(true)
    setStarted(true)
    setWaitingForMatch(false)
    setCurrentMatchId(null)

    // Check if we need to load more profiles
    if (currentProfileIndex >= profileQueue.length - 1) {
      // Load more profiles in background
      const newProfiles = await fetchProfiles()
      if (newProfiles.length > 0) {
        setProfileQueue(prev => [...prev, ...newProfiles])
      }
    }

    setTimeout(() => {
      setSpinning(false)
      // Use next profile from queue
      if (profileQueue.length > 0) {
        setCurrentProfileIndex(prev => {
          const nextIndex = prev + 1
          return nextIndex < profileQueue.length ? nextIndex : 0
        })
        setTimeout(() => {
          setRevealed(true)
        }, 300)
      } else {
        // No profiles available - try with softened filters
        fetchProfiles(true).then(newProfiles => {
          if (newProfiles.length > 0) {
            setProfileQueue(newProfiles)
            setCurrentProfileIndex(0)
            setTimeout(() => {
              setRevealed(true)
            }, 300)
          } else {
            // Still no profiles - show message or reset
            setSpinning(false)
            setStarted(false)
            alert("No more profiles available. Try adjusting your filters!")
          }
        })
      }
    }, 5000)
  }

  const handleCountdownComplete = async () => {
    // after countdown ends, check result
    if (userVote === "yes" && waitingForMatch) {
      // Timeout waiting for match - check if match was created
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      const currentProfile = profileQueue[currentProfileIndex]
      if (!currentProfile) return

      // Check for match
      const { data: match } = await supabase
        .from('matches')
        .select('*')
        .or(`and(user1_id.eq.${authUser.id},user2_id.eq.${currentProfile.id}),and(user1_id.eq.${currentProfile.id},user2_id.eq.${authUser.id})`)
        .eq('status', 'pending')
        .single()

      if (match) {
        // Match found! Redirect to video date
        router.push(`/video-date?matchId=${match.id}`)
      } else {
        // No match - spin to next profile
        setWaitingForMatch(false)
        setRevealed(false)
        startSpin()
      }
    } else if (userVote === "pass") {
      // User already clicked pass - this shouldn't happen as pass triggers immediate spin
      // But if it does, spin to next
      setRevealed(false)
      startSpin()
    } else {
      // User didn't vote - don't auto-spin, just reset to start screen
      setRevealed(false)
      setStarted(false)
      setUserVote(null)
    }
  }

  // Handle vote submission
  const handleVote = async (voteType: "yes" | "pass") => {
    if (!user || profileQueue.length === 0) return

    const currentProfile = profileQueue[currentProfileIndex]
    if (!currentProfile) return

    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return

    setUserVote(voteType)

    // Save vote to database
    const { error: voteError } = await supabase
      .from('votes')
      .upsert({
        voter_id: authUser.id,
        profile_id: currentProfile.id,
        vote_type: voteType
      })

    if (voteError) {
      console.error('Error saving vote:', voteError)
      return
    }

    // Record profile view
    await supabase
      .from('profile_views')
      .upsert({
        viewer_id: authUser.id,
        viewed_profile_id: currentProfile.id
      })

    if (voteType === "yes") {
      // Set waiting for match state
      setWaitingForMatch(true)
      
      // Check for immediate match (in case other user already voted yes)
      const { data: match } = await supabase
        .from('matches')
        .select('*')
        .or(`and(user1_id.eq.${authUser.id},user2_id.eq.${currentProfile.id}),and(user1_id.eq.${currentProfile.id},user2_id.eq.${authUser.id})`)
        .eq('status', 'pending')
        .single()

      if (match) {
        // Immediate match! Redirect to video date
        router.push(`/video-date?matchId=${match.id}`)
      } else {
        // Wait for match (real-time subscription will handle redirect)
        // Set timeout to check after 10 seconds
        setTimeout(() => {
          if (waitingForMatch) {
            handleCountdownComplete()
          }
        }, 10000)
      }
    } else {
      // Pass - immediately spin to next profile
      setRevealed(false)
      startSpin()
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
    if (!authUser) return

    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: authUser.id,
        min_age: preferences.minAge,
        max_age: preferences.maxAge,
        max_distance: preferences.maxDistance,
        gender_preference: preferences.genderPreference,
        updated_at: new Date().toISOString()
      })

    if (error) {
      console.error('Error saving preferences:', error)
      alert('Failed to save preferences. Please try again.')
    } else {
      setShowFilters(false)
      // Reload profiles with new preferences
      const newProfiles = await fetchProfiles()
      if (newProfiles.length > 0) {
        setProfileQueue(newProfiles)
        setCurrentProfileIndex(0)
      }
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
            {/* Vote header - Perfectly centered between profile icons (S.P.A.R.K. - Refined Clarity + Action Feedback) */}
            {revealed && (
              <>
                {/* Vote header with dynamic positioning - use regular div for positioning to avoid Framer Motion override */}
                <div
                  data-vote-header
                  className="absolute -top-4 sm:top-0 md:top-2 z-50"
                  style={{ 
                    left: voteCenterPx > 0 ? `${voteCenterPx}px` : '50%',
                    transform: 'translateX(-50%)',
                    width: 'max-content',
                    maxWidth: 'calc(100vw - 32px)',
                    position: 'absolute',
                  } as React.CSSProperties}
                >
                  <motion.div
                    initial={{ opacity: 0, y: -20, scale: 0.9 }}
                    animate={{ 
                      opacity: 1, 
                      y: 0, 
                      scale: 1,
                    }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 25 }}
                  >
                    <motion.div
                      className="flex items-center justify-center gap-1 sm:gap-3 md:gap-4 px-3 sm:px-8 md:px-10 py-2 sm:py-4 md:py-5 rounded-lg sm:rounded-3xl bg-gradient-to-r from-teal-300/30 via-teal-300/25 to-blue-500/30 backdrop-blur-xl border-2 border-teal-300/60 sm:border-2 shadow-[0_0_30px_rgba(94,234,212,0.5)] sm:shadow-[0_0_50px_rgba(94,234,212,0.7)]"
                      animate={{
                        boxShadow: [
                          "0 0 40px rgba(94,234,212,0.6)",
                          "0 0 70px rgba(94,234,212,0.9)",
                          "0 0 40px rgba(94,234,212,0.6)",
                        ],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      style={{
                        outline: '0',
                        clipPath: 'none',
                        WebkitAppearance: 'none',
                        appearance: 'none',
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
                        }}
                      >
                        vote
                      </motion.span>
                      <span className="text-sm sm:text-3xl md:text-4xl opacity-70 mx-1 sm:mx-1.5">•</span>
                      <CountdownTimer
                        resetKey={revealed ? "revealed" : "hidden"}
                        initialSeconds={10}
                        onComplete={handleCountdownComplete}
                      />
                    </motion.div>
                  </motion.div>
                </div>
              </>
            )}
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
                  <Image
                    src={user.photo}
                    alt={user.name}
                    fill
                    className="object-cover"
                  />
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
                    <ShuffleAnimation
                      profiles={profileQueue.length > 0 ? profileQueue.map(p => p.photo) : []}
                      duration={5000}
                    />
                  </motion.div>
                )}

                {revealed && currentProfile && (
                  <motion.div
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
                      <ProfileCardSpin
                        photo={currentProfile.photo}
                        name={currentProfile.name}
                        age={currentProfile.age}
                        bio={currentProfile.bio}
                        isSelected={false}
                      />
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
                  genderPreference: 'all'
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
                src={user.photo}
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

