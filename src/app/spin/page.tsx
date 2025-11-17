"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Filter, Sparkles } from "lucide-react"
import { PrimaryButton } from "@/components/ui/primary-button"
import { SpinButton } from "@/components/ui/spin-button"
import { ProfileCardSpin } from "@/components/ui/profile-card-spin"
import { ShuffleAnimation } from "@/components/ui/shuffle-animation"
import { CountdownTimer } from "@/components/ui/countdown-timer"
import { Modal } from "@/components/ui/modal"
import { ShimmerButton } from "@/components/magicui/shimmer-button"
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
  const [minAge, setMinAge] = useState("18")
  const [maxAge, setMaxAge] = useState("30")
  const [location, setLocation] = useState("")
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

  return (
    <div className="min-h-screen w-full bg-[#050810] text-white px-6 flex items-center justify-center relative overflow-hidden">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-[#050810] pointer-events-none" />
      <div className="fixed inset-0 bg-gradient-to-br from-teal-900/10 via-transparent to-blue-900/10 pointer-events-none" />

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
            className="absolute inset-0 flex items-center justify-center z-10"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            <PrimaryButton
              onClick={startSpin}
              size="md"
              variant="primary"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                <span>start spin</span>
              </div>
            </PrimaryButton>
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
              {userVote === "yes" && (
                <motion.div
                  className="absolute -top-12 left-1/2 -translate-x-1/2 z-20"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                >
                  <div className="w-16 h-16 bg-teal-300 rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-4xl font-bold text-black">✓</span>
                  </div>
                </motion.div>
              )}
              
              <div className="relative w-48 h-48 rounded-2xl overflow-hidden border-4 border-teal-300/50 shadow-[0_0_30px_rgba(94,234,212,0.3)]">
                <Image
                  src={user.photo}
                  alt={user.name}
                  fill
                  className="object-cover"
                />
              </div>
              <h2 className="text-4xl font-bold text-teal-300">{user.name}</h2>
              <p className="text-lg opacity-80 max-w-xs leading-relaxed">{user.bio}</p>
            </motion.div>

            {/* Right side - Match profile */}
            <div className="w-full md:w-1/2 flex flex-col items-center">
              <AnimatePresence mode="wait">
                {spinning && (
                  <motion.div
                    key="spinning"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.3 }}
                  >
                    <ShuffleAnimation
                      profiles={profiles.map(p => p.photo)}
                      duration={5000}
                    />
                  </motion.div>
                )}

                {revealed && (
                  <motion.div
                    key="revealed"
                    className="w-full flex flex-col items-center gap-6"
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* Vote header with countdown */}
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-lg font-semibold text-teal-300">vote</span>
                      <span className="text-lg opacity-60">•</span>
                      <CountdownTimer
                        resetKey={revealed ? "revealed" : "hidden"}
                        initialSeconds={10}
                        onComplete={handleCountdownComplete}
                      />
                    </div>

                    {/* Profile card */}
                    <ProfileCardSpin
                      photo={profiles[selected].photo}
                      name={profiles[selected].name}
                      age={profiles[selected].age}
                      bio={profiles[selected].bio}
                      isSelected={userVote === "yes"}
                    />

                    {/* Action buttons */}
                    <div className="flex gap-4 w-full max-w-sm">
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
                    </div>
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
