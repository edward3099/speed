"use client"

import { useState } from "react"
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
      <div className="absolute top-3 sm:top-4 md:top-6 left-3 sm:left-4 md:left-6 right-3 sm:right-4 md:right-6 z-20 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Profile button */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="flex-shrink-0"
          >
            <ShimmerButton
              onClick={() => setShowProfile(true)}
              className="h-10 sm:h-12 md:h-14 px-3 sm:px-4 md:px-6 bg-teal-300 text-black hover:bg-teal-300 hover:text-black"
              shimmerColor="#ffffff"
              background="rgba(94, 234, 212, 1)"
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <User className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-xs sm:text-sm md:text-base">profile</span>
              </div>
            </ShimmerButton>
          </motion.div>
        </div>

        {/* Filter button */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="flex-shrink-0"
        >
          <ShimmerButton
            onClick={() => setShowFilters(true)}
            className="h-10 sm:h-12 md:h-14 px-3 sm:px-4 md:px-6 bg-teal-300 text-black hover:bg-teal-300 hover:text-black"
            shimmerColor="#ffffff"
            background="rgba(94, 234, 212, 1)"
          >
            <div className="flex items-center gap-1 sm:gap-2">
              <Filter className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-xs sm:text-sm md:text-base">filters</span>
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
                className="text-2xl sm:text-3xl md:text-4xl font-bold text-teal-300"
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
              <p className="text-sm sm:text-base md:text-lg opacity-80 max-w-xs leading-relaxed text-center">{user.bio}</p>
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
                      className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-white/5 backdrop-blur-sm border border-white/10"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <motion.span
                        className="text-sm sm:text-base md:text-lg font-semibold text-teal-300"
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
                      <span className="text-sm sm:text-base md:text-lg opacity-60">•</span>
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
                      className="flex gap-3 sm:gap-4 w-full max-w-sm px-4 sm:px-0"
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
        className="max-w-md mx-4"
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


      {/* Profile modal */}
      <Modal
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        title="your profile"
        className="max-w-lg mx-4"
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

          {/* Age - Uneditable */}
          <motion.div
            className="flex flex-col gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <label className="text-sm font-medium opacity-80 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-300" />
              age
            </label>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="text-lg opacity-80">{user.age}</p>
            </div>
            <p className="text-xs opacity-60">age cannot be changed</p>
          </motion.div>

          {/* Location - Editable */}
          <motion.div
            className="flex flex-col gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <label className="text-sm font-medium opacity-80 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-teal-300" />
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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <label className="text-sm font-medium opacity-80 mb-2 block flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-teal-300" />
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
            transition={{ delay: 0.7 }}
          >
            <div className="flex items-start gap-3">
              <MessageCircle className="w-5 h-5 text-teal-300 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-teal-300 mb-1">profile tips</p>
                <p className="text-xs opacity-70">
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
