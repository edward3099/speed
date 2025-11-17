"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Filter, Sparkles as SparklesIcon, MapPin, Users, Heart, User, MessageCircle } from "lucide-react"
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
    photo: "https://i.pravatar.cc/200?img=15"
  })

  // Mock matches data (users who both said yes after a date)
  const [matches, setMatches] = useState([
    { id: 1, name: "alex", photo: "https://i.pravatar.cc/200?img=20", bio: "enjoys deep chats music and new experiences", matchedDate: "2025-11-15" },
    { id: 2, name: "sam", photo: "https://i.pravatar.cc/200?img=12", bio: "loves traveling and trying new foods", matchedDate: "2025-11-10" },
  ])

  const [started, setStarted] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [selected, setSelected] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const [showMatches, setShowMatches] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [minAge, setMinAge] = useState(18)
  const [maxAge, setMaxAge] = useState(30)
  const [location, setLocation] = useState("")
  const [maxDistance, setMaxDistance] = useState(50)
  const [countdown, setCountdown] = useState(10)
  const [userVote, setUserVote] = useState<"yes" | "pass" | null>(null)

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
    <div className="min-h-screen w-full bg-[#050810] text-white px-6 flex items-center justify-center relative overflow-hidden">
      {/* Background layers */}
      <div className="fixed inset-0 bg-[#050810] pointer-events-none" />
      <AnimatedGradientBackground />
      
      {/* Floating orbs */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl pointer-events-none"
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
        className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none"
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
      <Sparkles
        sparklesCount={20}
        className="absolute inset-0 pointer-events-none"
        colors={{
          first: "#5eead4",
          second: "#3b82f6"
        }}
      />

      {/* Top bar buttons */}
      <div className="absolute top-6 left-6 right-6 z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Matches button */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <ShimmerButton
              onClick={() => setShowMatches(true)}
              className="h-12 px-5 bg-blue-400 text-black hover:bg-blue-400 hover:text-black"
              shimmerColor="#ffffff"
              background="rgba(96, 165, 250, 1)"
            >
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4" />
                <span className="text-sm font-semibold">matches</span>
                {matches.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-black/20 text-xs font-bold">
                    {matches.length}
                  </span>
                )}
              </div>
            </ShimmerButton>
          </motion.div>

          {/* Profile button */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <ShimmerButton
              onClick={() => setShowProfile(true)}
              className="h-12 px-5 bg-white/10 text-white hover:bg-white/15 hover:text-white border border-white/20"
              shimmerColor="#ffffff"
              background="rgba(255, 255, 255, 0.1)"
            >
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                <span className="text-sm font-semibold">profile</span>
              </div>
            </ShimmerButton>
          </motion.div>
        </div>

        {/* Filter button */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <ShimmerButton
            onClick={() => setShowFilters(true)}
            className="h-12 px-5 bg-teal-300 text-black hover:bg-teal-300 hover:text-black"
            shimmerColor="#ffffff"
            background="rgba(94, 234, 212, 1)"
          >
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <span className="text-sm font-semibold">filters</span>
            </div>
          </ShimmerButton>
        </motion.div>
      </div>

      {/* Start spin button */}
      <AnimatePresence>
        {!started && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-8"
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
              <div className="w-96 h-96 bg-teal-300/20 rounded-full blur-3xl" />
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

            {/* Subtitle */}
            <motion.p
              className="text-lg opacity-60 text-center max-w-md"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 0.6, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              discover your next connection
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <AnimatePresence mode="wait">
        {started && (
          <motion.div
            key="started"
            className="w-full max-w-6xl flex flex-col md:flex-row items-center justify-center gap-12 md:gap-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Left side - User profile */}
            <motion.div
              className="w-full md:w-1/2 flex flex-col items-center text-center gap-6 relative"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
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
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-teal-300/20 rounded-full blur-3xl" />
              </motion.div>

              {userVote === "yes" && (
                <motion.div
                  className="absolute -top-12 left-1/2 -translate-x-1/2 z-20"
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
                  <div className="w-16 h-16 bg-teal-300 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(94,234,212,0.8)]">
                    <span className="text-4xl font-bold text-black">✓</span>
                  </div>
                </motion.div>
              )}
              
              <motion.div
                className="relative w-48 h-48 rounded-2xl overflow-hidden border-4 border-teal-300/50 shadow-[0_0_30px_rgba(94,234,212,0.3)]"
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
                className="text-4xl font-bold text-teal-300"
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
              <p className="text-lg opacity-80 max-w-xs leading-relaxed">{user.bio}</p>
            </motion.div>

            {/* Connecting line */}
            {started && !spinning && (
              <motion.div
                className="hidden md:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-32 bg-gradient-to-b from-teal-300/50 via-teal-300/30 to-transparent z-0"
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.6 }}
              />
            )}

            {/* Right side - Match profile */}
            <div className="w-full md:w-1/2 flex flex-col items-center relative">
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
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl" />
                </motion.div>
              )}

              <AnimatePresence mode="wait">
                {spinning && (
                  <motion.div
                    key="spinning"
                    className="relative"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.3 }}
                  >
                    {/* Pulsing glow around shuffle */}
                    <motion.div
                      className="absolute inset-0 -z-10 rounded-2xl"
                      animate={{
                        boxShadow: [
                          "0 0 40px rgba(94,234,212,0.3)",
                          "0 0 60px rgba(94,234,212,0.6)",
                          "0 0 40px rgba(94,234,212,0.3)",
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
                    className="w-full flex flex-col items-center gap-6 relative"
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* Vote header with countdown */}
                    <motion.div
                      className="flex items-center gap-3 mb-4 px-4 py-2 rounded-full bg-white/5 backdrop-blur-sm border border-white/10"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <motion.span
                        className="text-lg font-semibold text-teal-300"
                        animate={{
                          textShadow: [
                            "0 0 10px rgba(94,234,212,0.5)",
                            "0 0 15px rgba(94,234,212,0.8)",
                            "0 0 10px rgba(94,234,212,0.5)",
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
                      <span className="text-lg opacity-60">•</span>
                      <CountdownTimer
                        resetKey={revealed ? "revealed" : "hidden"}
                        initialSeconds={10}
                        onComplete={handleCountdownComplete}
                      />
                    </motion.div>

                    {/* Profile card with enhanced effects */}
                    <motion.div
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

                    {/* Action buttons with enhanced styling */}
                    <motion.div
                      className="flex gap-4 w-full max-w-sm"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <SpinButton
                        variant="pass"
                        onClick={() => {
                          setUserVote("pass")
                          setRevealed(false)
                          startSpin()
                        }}
                      >
                        pass
                      </SpinButton>
                      <SpinButton
                        variant="yes"
                        onClick={() => {
                          setUserVote("yes")
                        }}
                      >
                        yes
                      </SpinButton>
                    </motion.div>
                  </motion.div>
                )}
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
        <div className="flex flex-col gap-6">
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
              className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white placeholder-white/40 transition-all duration-300"
              placeholder="enter city or zip code"
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

          {/* Action Buttons */}
          <div className="flex gap-3 mt-4">
            <motion.button
              onClick={() => {
                setMinAge(18)
                setMaxAge(30)
                setLocation("")
                setMaxDistance(50)
              }}
              className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm font-medium"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              reset
            </motion.button>
            <PrimaryButton
              onClick={() => setShowFilters(false)}
              size="sm"
              variant="primary"
              className="flex-1"
            >
              apply filters
            </PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* Matches modal */}
      <Modal
        isOpen={showMatches}
        onClose={() => setShowMatches(false)}
        title="your matches"
        className="max-w-2xl"
      >
        <motion.div
          className="flex flex-col gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {matches.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <motion.div
                className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.3 }}
              >
                <Heart className="w-10 h-10 text-teal-300" />
              </motion.div>
              <p className="opacity-80 text-center text-lg mb-2">
                no matches yet
              </p>
              <p className="opacity-60 text-center text-sm">
                start spinning and say yes to find your matches!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
              {matches.map((match, index) => (
                <motion.div
                  key={match.id}
                  className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-teal-300/50 hover:bg-white/10 transition-all duration-300 cursor-pointer"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                  whileHover={{ scale: 1.02, y: -2 }}
                  onClick={() => {
                    // Navigate to video date with this match
                    window.location.href = "/video-date"
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden border-2 border-teal-300/50 flex-shrink-0">
                      <Image
                        src={match.photo}
                        alt={match.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold mb-1">{match.name}</h3>
                      <p className="text-sm opacity-70 line-clamp-2 mb-2">{match.bio}</p>
                      <div className="flex items-center gap-2 text-xs opacity-60">
                        <Heart className="w-3 h-3 text-teal-300" />
                        <span>matched {new Date(match.matchedDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </Modal>

      {/* Profile modal */}
      <Modal
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        title="your profile"
        className="max-w-lg"
      >
        <motion.div
          className="flex flex-col gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {/* Profile picture */}
          <motion.div
            className="flex flex-col items-center gap-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
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
            <h2 className="text-2xl font-bold text-teal-300">{user.name}</h2>
          </motion.div>

          {/* Bio */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <label className="text-sm font-medium opacity-80 mb-2 block">
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
            className="p-4 rounded-xl bg-teal-300/10 border border-teal-300/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex items-start gap-3">
              <MessageCircle className="w-5 h-5 text-teal-300 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-teal-300 mb-1">profile tips</p>
                <p className="text-xs opacity-70">
                  keep your bio fresh and authentic. this helps others get to know the real you!
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </Modal>

    </div>
  )
}
