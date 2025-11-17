"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Filter, Sparkles as SparklesIcon, SkipForward, Undo2, Info, Flag, Pause, Play } from "lucide-react"
import { PrimaryButton } from "@/components/ui/primary-button"
import { SpinButton } from "@/components/ui/spin-button"
import { ProfileCardSpin } from "@/components/ui/profile-card-spin"
import { ShuffleAnimation } from "@/components/ui/shuffle-animation"
import { CountdownTimer } from "@/components/ui/countdown-timer"
import { Modal } from "@/components/ui/modal"
import { ShimmerButton } from "@/components/magicui/shimmer-button"
import { Sparkles } from "@/components/magicui/sparkles"
import { AnimatedGradientBackground } from "@/components/magicui/animated-gradient-background"
import { ControlButton } from "@/components/ui/control-button"
import { ControlPanel } from "@/components/ui/control-panel"
import Image from "next/image"

export default function spin() {
  const profiles = [
    { photo: "https://i.pravatar.cc/200?img=12", name: "alex", age: 24, bio: "enjoys deep chats music and new experiences" },
    { photo: "https://i.pravatar.cc/200?img=20", name: "sam", age: 26, bio: "loves traveling and trying new foods" },
    { photo: "https://i.pravatar.cc/200?img=33", name: "taylor", age: 23, bio: "passionate about art and photography" },
    { photo: "https://i.pravatar.cc/200?img=5", name: "jordan", age: 25, bio: "fitness enthusiast and coffee lover" },
    { photo: "https://i.pravatar.cc/200?img=45", name: "riley", age: 27, bio: "bookworm and movie buff" },
  ]

  const user = {
    name: "jason",
    bio: "i like good conversations and new experiences",
    photo: "https://i.pravatar.cc/200?img=15"
  }

  const [started, setStarted] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [selected, setSelected] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const [showProfileDetails, setShowProfileDetails] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [minAge, setMinAge] = useState("18")
  const [maxAge, setMaxAge] = useState("30")
  const [location, setLocation] = useState("")
  const [countdown, setCountdown] = useState(10)
  const [userVote, setUserVote] = useState<"yes" | "pass" | null>(null)
  const [voteHistory, setVoteHistory] = useState<Array<{ profile: number; vote: "yes" | "pass" }>>([])

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
      const otherYes = Math.random() < 0.5
      if (otherYes) {
        window.location.href = "/match"
      } else {
        setRevealed(false)
        startSpin()
      }
    } else {
      setRevealed(false)
      startSpin()
    }
  }

  const handleSkip = () => {
    if (revealed) {
      setUserVote("pass")
      setRevealed(false)
      startSpin()
    }
  }

  const handleUndo = () => {
    if (voteHistory.length > 0) {
      const lastVote = voteHistory[voteHistory.length - 1]
      setVoteHistory(voteHistory.slice(0, -1))
      setSelected(lastVote.profile)
      setUserVote(null)
      setRevealed(true)
    }
  }

  const handleVote = (vote: "yes" | "pass") => {
    setUserVote(vote)
    setVoteHistory([...voteHistory, { profile: selected, vote }])
    if (vote === "pass") {
      setRevealed(false)
      startSpin()
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

      {/* Filter button top left */}
      <motion.div
        className="absolute top-20 left-6 z-10"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
      >
        <ShimmerButton
          onClick={() => setShowFilters(true)}
          className="h-14 px-6 bg-teal-300 text-black hover:bg-teal-300 hover:text-black"
          shimmerColor="#ffffff"
          background="rgba(94, 234, 212, 1)"
        >
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            <span>filters</span>
          </div>
        </ShimmerButton>
      </motion.div>

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
                        isSelected={userVote === "yes"}
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
                        onClick={() => handleVote("pass")}
                      >
                        pass
                      </SpinButton>
                      <SpinButton
                        variant="yes"
                        onClick={() => handleVote("yes")}
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

      {/* Control Panel - Bottom (when profile is revealed) */}
      {started && revealed && (
        <ControlPanel position="bottom">
          <ControlButton
            icon={<Info className="w-5 h-5" />}
            label="details"
            onClick={() => setShowProfileDetails(true)}
          />
          <ControlButton
            icon={<SkipForward className="w-5 h-5" />}
            label="skip"
            onClick={handleSkip}
          />
          {voteHistory.length > 0 && (
            <ControlButton
              icon={<Undo2 className="w-5 h-5" />}
              label="undo"
              onClick={handleUndo}
            />
          )}
          <ControlButton
            icon={<Flag className="w-5 h-5" />}
            label="report"
            variant="danger"
            onClick={() => {
              // Handle report
              alert("Report feature coming soon")
            }}
          />
        </ControlPanel>
      )}

      {/* Control Panel - Top Right (when spinning) */}
      {spinning && (
        <ControlPanel position="top" className="!top-20 !right-6 !left-auto !translate-x-0">
          <ControlButton
            icon={isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
            label={isPaused ? "resume" : "pause"}
            onClick={() => setIsPaused(!isPaused)}
          />
        </ControlPanel>
      )}

      {/* Profile Details Modal */}
      <Modal
        isOpen={showProfileDetails}
        onClose={() => setShowProfileDetails(false)}
        title="profile details"
      >
        {revealed && (
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-32 h-32 rounded-2xl overflow-hidden">
              <Image
                src={profiles[selected].photo}
                alt={profiles[selected].name}
                fill
                className="object-cover"
              />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold text-white mb-2">
                {profiles[selected].name}
                {profiles[selected].age && (
                  <span className="text-teal-300">, {profiles[selected].age}</span>
                )}
              </h3>
              <p className="text-sm opacity-80 leading-relaxed mb-4">
                {profiles[selected].bio}
              </p>
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="p-3 rounded-xl bg-white/5">
                  <div className="text-xs opacity-60 mb-1">location</div>
                  <div className="text-sm font-medium">new york</div>
                </div>
                <div className="p-3 rounded-xl bg-white/5">
                  <div className="text-xs opacity-60 mb-1">interests</div>
                  <div className="text-sm font-medium">music, art</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Filter modal */}
      <Modal
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        title="filters"
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium opacity-80">age range</label>
            <div className="flex gap-3">
              <input
                type="number"
                value={minAge}
                onChange={(e) => setMinAge(e.target.value)}
                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white"
                placeholder="min"
              />
              <input
                type="number"
                value={maxAge}
                onChange={(e) => setMaxAge(e.target.value)}
                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white"
                placeholder="max"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium opacity-80">location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white"
              placeholder="enter location"
            />
          </div>

          <PrimaryButton
            onClick={() => setShowFilters(false)}
            size="sm"
            variant="primary"
            className="w-full mt-4"
          >
            apply filters
          </PrimaryButton>
        </div>
      </Modal>

    </div>
  )
}
