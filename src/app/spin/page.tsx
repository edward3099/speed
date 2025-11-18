"use client"

import { useState, useEffect, useLayoutEffect, useRef } from "react"
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
import Image from "next/image"

export default function spin() {
  const profiles = [
    { photo: "https://i.pravatar.cc/200?img=12", name: "alex", age: 24, bio: "enjoys deep chats music and new experiences" },
    { photo: "https://i.pravatar.cc/200?img=20", name: "sam", age: 26, bio: "loves traveling and trying new foods" },
    { photo: "https://i.pravatar.cc/200?img=33", name: "taylor", age: 23, bio: "passionate about art and photography" },
    { photo: "https://i.pravatar.cc/200?img=5", name: "jordan", age: 25, bio: "fitness enthusiast and coffee lover" },
    { photo: "https://i.pravatar.cc/200?img=45", name: "riley", age: 27, bio: "bookworm and movie buff" },
  ]

  const [user, setUser] = useState({
    name: "jason",
    bio: "i like good conversations and new experiences",
    photo: "https://i.pravatar.cc/200?img=15",
    age: 28,
    location: "new york, ny"
  })


  const [started, setStarted] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [selected, setSelected] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [minAge, setMinAge] = useState(18)
  const [maxAge, setMaxAge] = useState(30)
  const [location, setLocation] = useState("")
  const [maxDistance, setMaxDistance] = useState(50)
  const [countdown, setCountdown] = useState(10)
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

  const startSpin = () => {
    setUserVote(null)           // reset check mark every new spin
    setRevealed(false)
    setSpinning(true)
    setStarted(true)
    setTimeout(() => {
      setSpinning(false)
      const pick = Math.floor(Math.random() * profiles.length)
      setSelected(pick)
      setTimeout(() => {
        setRevealed(true)
      }, 300)
    }, 5000)
  }

  const handleCountdownComplete = () => {
    // after countdown ends, check result
    if (userVote === "yes") {
      // User voted yes - check if other person also voted yes (both users clicked yes = match)
      const otherYes = Math.random() < 0.5
      if (otherYes) {
        // Both users clicked yes - match for video date
        window.location.href = "/video-date"
      } else {
        // Other person passed - automatically spin to next profile
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
    if (newMinAge > maxAge) {
      setMinAge(maxAge)
      setMaxAge(newMinAge)
    } else {
      setMinAge(newMinAge)
    }
  }

  const handleMaxAgeChange = (newMaxAge: number) => {
    // Ensure max age doesn't go below min age
    if (newMaxAge < minAge) {
      setMaxAge(minAge)
      setMinAge(newMaxAge)
    } else {
      setMaxAge(newMaxAge)
    }
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
                      profiles={profiles.map(p => p.photo)}
                      duration={5000}
                    />
                  </motion.div>
                )}

                {revealed && (
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
                        photo={profiles[selected].photo}
                        name={profiles[selected].name}
                        age={profiles[selected].age}
                        bio={profiles[selected].bio}
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
                        onClick={() => {
                          setUserVote("pass")
                          setRevealed(false)
                          startSpin()
                        }}
                        className="flex-1 min-w-[85px] sm:min-w-[100px] md:min-w-[110px] lg:min-w-[120px] max-w-[120px] sm:max-w-[140px] md:max-w-[150px] lg:max-w-[160px] h-9 sm:h-12 md:h-14 text-xs sm:text-base md:text-lg font-semibold touch-manipulation transition-all duration-200 hover:scale-105 active:scale-95"
                      >
                        respin
                      </SpinButton>
                      <SpinButton
                        variant="yes"
                        onClick={() => {
                          setUserVote("yes")
                        }}
                        className="flex-1 min-w-[85px] sm:min-w-[100px] md:min-w-[110px] lg:min-w-[120px] max-w-[120px] sm:max-w-[140px] md:max-w-[150px] lg:max-w-[160px] h-9 sm:h-12 md:h-14 text-xs sm:text-base md:text-lg font-semibold touch-manipulation transition-all duration-200 hover:scale-105 active:scale-95"
                      >
                        yes
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
                  max={maxAge}
                  value={minAge}
                  onChange={handleMinAgeChange}
                  label="minimum age"
                />
              </div>
              <div className="text-lg opacity-60">-</div>
              <div className="flex-1">
                <RangeInput
                  min={minAge}
                  max={100}
                  value={maxAge}
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
                {minAge}
              </motion.div>
              <span className="text-sm opacity-60">to</span>
              <motion.div
                className="px-3 py-1.5 rounded-lg bg-teal-300/10 border border-teal-300/30 text-teal-300 text-sm font-semibold"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
              >
                {maxAge}
              </motion.div>
            </div>
          </FilterInput>

          {/* Location */}
          <FilterInput
            label="location"
            icon={<MapPin className="w-4 h-4" />}
          >
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white placeholder-white/40 transition-all duration-300 text-sm sm:text-base touch-manipulation"
              placeholder="enter city or zip code"
              style={{ minHeight: '44px' }}
            />
          </FilterInput>

          {/* Max Distance */}
          <FilterInput
            label="maximum distance"
            icon={<MapPin className="w-4 h-4" />}
          >
            <RangeInput
              min={1}
              max={100}
              value={maxDistance}
              onChange={setMaxDistance}
              label={`${maxDistance} miles`}
            />
          </FilterInput>

          {/* Action Buttons - Mobile optimized */}
          <div className="flex gap-2.5 sm:gap-3 mt-3 sm:mt-4 pb-safe sm:pb-0">
            <motion.button
              onClick={() => {
                setMinAge(18)
                setMaxAge(30)
                setLocation("")
                setMaxDistance(50)
              }}
              className="flex-1 px-3 sm:px-4 py-3 sm:py-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition-all duration-300 text-sm sm:text-base font-semibold touch-manipulation"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              style={{ minHeight: '44px' }}
            >
              reset
            </motion.button>
            <PrimaryButton
              onClick={() => setShowFilters(false)}
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
        className="max-w-lg"
      >
        <motion.div
          className="flex flex-col gap-3 sm:gap-5 md:gap-6 min-w-0 max-w-full overflow-x-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
        >
          {/* Profile picture */}
          <motion.div
            className="flex flex-col items-center gap-3 sm:gap-4 min-w-0 max-w-full overflow-x-hidden"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="scale-75 sm:scale-100">
              <EditableProfilePicture
                src={user.photo}
                alt={`${user.name}'s profile`}
                size="lg"
                onImageChange={(file) => {
                  const reader = new FileReader()
                  reader.onloadend = () => {
                    setUser(prev => ({ ...prev, photo: reader.result as string }))
                    // In a real app, upload to backend
                  }
                  reader.readAsDataURL(file)
                }}
              />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-teal-300">{user.name}</h2>
          </motion.div>

          {/* Age - Uneditable */}
          <motion.div
            className="flex flex-col gap-1.5 sm:gap-2 min-w-0 max-w-full overflow-x-hidden"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <label className="text-xs sm:text-base font-medium opacity-80 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-teal-300" />
              age
            </label>
            <div className="p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10 min-w-0 max-w-full overflow-x-hidden">
              <p className="text-sm sm:text-lg opacity-80 break-words">{user.age}</p>
            </div>
            <p className="text-xs opacity-60">age cannot be changed</p>
          </motion.div>

          {/* Location - Editable */}
          <motion.div
            className="flex flex-col gap-1.5 sm:gap-2 min-w-0 max-w-full overflow-x-hidden"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <label className="text-xs sm:text-sm font-medium opacity-80 flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-300" />
              location
            </label>
            <EditableBio
              initialBio={user.location}
              onBioChange={(newLocation) => {
                setUser(prev => ({ ...prev, location: newLocation }))
                // In a real app, save to backend
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
            <label className="text-xs sm:text-sm font-medium opacity-80 mb-1.5 sm:mb-2 block flex items-center gap-2">
              <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-300" />
              bio
            </label>
            <EditableBio
              initialBio={user.bio}
              onBioChange={(newBio) => {
                setUser(prev => ({ ...prev, bio: newBio }))
                // In a real app, save to backend
              }}
            />
          </motion.div>

          {/* Info message */}
          <motion.div
            className="p-3 sm:p-4 rounded-xl bg-teal-300/10 border border-teal-300/20 min-w-0 max-w-full overflow-x-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            <div className="flex items-start gap-2 sm:gap-3 min-w-0">
              <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 text-teal-300 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-medium text-teal-300 mb-0.5 sm:mb-1 break-words">profile tips</p>
                <p className="text-xs opacity-70 leading-relaxed break-words overflow-wrap-anywhere">
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
