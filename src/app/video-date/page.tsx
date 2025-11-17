"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Video, Mic, MicOff, VideoOff, PhoneOff, Heart, X, Sparkles as SparklesIcon, CheckCircle2, Star, Flag, MessageSquare } from "lucide-react"
import { PrimaryButton } from "@/components/ui/primary-button"
import { Modal } from "@/components/ui/modal"
import { AnimatedGradientBackground } from "@/components/magicui/animated-gradient-background"
import { Sparkles } from "@/components/magicui/sparkles"
import Image from "next/image"

export default function VideoDate() {
  const router = useRouter()

  const [countdown, setCountdown] = useState(15) // 15 sec pre-date countdown
  const [countdownComplete, setCountdownComplete] = useState(false)
  const [timeLeft, setTimeLeft] = useState(300) // 5 min
  const [showPostModal, setShowPostModal] = useState(false)
  const [showPassModal, setShowPassModal] = useState(false)
  const [showMatchModal, setShowMatchModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [rating, setRating] = useState<number | null>(null)
  const [feedback, setFeedback] = useState("")
  const [reportReason, setReportReason] = useState("")
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isPartnerMuted, setIsPartnerMuted] = useState(true) // Partner starts muted
  const [isPartnerVideoOff, setIsPartnerVideoOff] = useState(false)
  const [isEnding, setIsEnding] = useState(false)

  const partner = {
    name: "alex",
    photo: "https://i.pravatar.cc/200?img=20",
    bio: "enjoys deep chats music and new experiences"
  }

  const user = {
    name: "jason",
    photo: "https://i.pravatar.cc/200?img=15"
  }

  // Pre-date countdown
  useEffect(() => {
    if (countdownComplete) return

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          setCountdownComplete(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [countdownComplete])

  // Main date timer (only starts after countdown)
  useEffect(() => {
    if (!countdownComplete) return

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          setShowPostModal(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [countdownComplete])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s < 10 ? "0" + s : s}`
  }

  const handleEndDate = () => {
    setIsEnding(true)
    setTimeout(() => {
      setShowPostModal(true)
      setIsEnding(false)
    }, 500)
  }

  const handleYes = () => {
    // Submit feedback if provided
    if (rating !== null || feedback.trim()) {
      // In a real app, this would send feedback to backend
      console.log("Feedback submitted:", { rating, feedback })
    }
    
    setShowPostModal(false)
    const otherYes = Math.random() < 0.5
    if (otherYes) {
      setShowMatchModal(true)
      setTimeout(() => {
        router.push("/spin")
      }, 3000)
    } else {
      setShowRejectModal(true)
      setTimeout(() => {
        router.push("/spin")
      }, 3000)
    }
  }

  const handlePass = () => {
    // Submit feedback if provided
    if (rating !== null || feedback.trim()) {
      // In a real app, this would send feedback to backend
      console.log("Feedback submitted:", { rating, feedback })
    }
    
    setShowPostModal(false)
    setShowPassModal(true)
    setTimeout(() => {
      router.push("/spin")
    }, 2000)
  }

  const handleReport = () => {
    setShowPostModal(false)
    setShowReportModal(true)
  }

  const handleSubmitReport = () => {
    // In a real app, this would send report to backend
    console.log("Report submitted:", { reportReason })
    setShowReportModal(false)
    setShowPassModal(true)
    setTimeout(() => {
      router.push("/spin")
    }, 2000)
  }

  const progressPercentage = countdownComplete ? ((300 - timeLeft) / 300) * 100 : 0

  return (
    <div className="min-h-screen w-full bg-[#050810] text-white relative overflow-hidden">
      {/* Pre-date countdown screen */}
      <AnimatePresence>
        {!countdownComplete && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Background */}
            <div className="absolute inset-0 bg-[#050810]" />
            <AnimatedGradientBackground />
            
            {/* Sparkles effect */}
            <Sparkles
              sparklesCount={30}
              className="absolute inset-0 pointer-events-none"
              colors={{
                first: "#5eead4",
                second: "#3b82f6"
              }}
            />

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

            {/* Countdown content */}
            <div className="relative z-10 flex flex-col items-center gap-8">
              {/* Partner preview */}
              <motion.div
                className="flex items-center gap-6 mb-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-teal-300/50">
                  <Image
                    src={user.photo}
                    alt={user.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                  }}
                >
                  <Heart className="w-8 h-8 text-teal-300" />
                </motion.div>
                <div className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-blue-400/50">
                  <Image
                    src={partner.photo}
                    alt={partner.name}
                    fill
                    className="object-cover"
                  />
                </div>
              </motion.div>

              {/* Countdown number */}
              <motion.div
                key={countdown}
                initial={{ scale: 0, rotate: -180, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                }}
                className="relative"
              >
                <motion.div
                  className="text-9xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-blue-400 to-teal-300"
                  animate={{
                    backgroundPosition: ["0%", "100%", "0%"],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  style={{
                    backgroundSize: "200% 100%",
                  }}
                >
                  {countdown}
                </motion.div>
                
                {/* Glow effect */}
                <motion.div
                  className="absolute inset-0 -z-10"
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 0.8, 0.5],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                  }}
                >
                  <div className="w-full h-full bg-teal-300/30 rounded-full blur-3xl" />
                </motion.div>
              </motion.div>

              {/* Status text */}
              <motion.div
                className="text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <motion.p
                  className="text-xl opacity-80 mb-2"
                  animate={{
                    opacity: [0.6, 1, 0.6],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                  }}
                >
                  {countdown > 3 ? "your date is starting" : "get ready"}
                </motion.p>
                <p className="text-sm opacity-60">
                  {countdown > 10 ? "take a deep breath" : countdown > 5 ? "smile and be yourself" : "here we go"}
                </p>
              </motion.div>

              {/* Progress ring */}
              <motion.div
                className="relative w-32 h-32"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
              >
                <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="4"
                  />
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="url(#gradient)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    initial={{ pathLength: 1 }}
                    animate={{ pathLength: countdown / 15 }}
                    transition={{ duration: 1, ease: "linear" }}
                  />
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#5eead4" />
                      <stop offset="50%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#5eead4" />
                    </linearGradient>
                  </defs>
                </svg>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main video interface - only show after countdown */}
      {countdownComplete && (
        <>
          {/* Background layers */}
          <div className="fixed inset-0 bg-[#050810] pointer-events-none" />
          <AnimatedGradientBackground />
      
      {/* Sparkles effect */}
      <Sparkles
        sparklesCount={15}
        className="absolute inset-0 pointer-events-none"
        colors={{
          first: "#5eead4",
          second: "#3b82f6"
        }}
      />

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

      {/* Top bar with timer and progress */}
      <motion.div
        className="relative z-10 px-6 pt-8 pb-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-7xl mx-auto">
          {/* Timer and controls row */}
          <div className="flex items-center justify-between mb-4">
            <motion.div
              className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/5 backdrop-blur-sm border border-white/10"
              whileHover={{ scale: 1.05, borderColor: "rgba(94,234,212,0.5)" }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <SparklesIcon className="w-5 h-5 text-teal-300" />
              </motion.div>
              <span className="text-2xl font-bold text-teal-300 tabular-nums">
                {formatTime(timeLeft)}
              </span>
            </motion.div>

            {/* Connection status indicator */}
            <motion.div
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 backdrop-blur-sm border border-white/10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <motion.div
                className="w-2 h-2 bg-green-400 rounded-full"
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [1, 0.7, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                }}
              />
              <span className="text-sm opacity-80">connected</span>
            </motion.div>
          </div>

          {/* Progress bar */}
          <motion.div
            className="h-1.5 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              className="h-full bg-gradient-to-r from-teal-300 via-blue-400 to-teal-300 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ duration: 1, ease: "linear" }}
              style={{
                backgroundSize: "200% 100%",
              }}
            />
          </motion.div>
        </div>
      </motion.div>

      {/* Main video layout */}
      <div className="relative z-10 px-6 pb-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Your video */}
            <motion.div
              className="relative group"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              whileHover={{ scale: 1.02 }}
            >
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-white/5 backdrop-blur-sm border-2 border-white/10 group-hover:border-teal-300/50 transition-all duration-300 shadow-2xl">
                {/* Video placeholder */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <motion.div
                      animate={{
                        scale: [1, 1.1, 1],
                        opacity: [0.5, 0.8, 0.5],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                      }}
                    >
                      <Video className="w-16 h-16 text-white/30 mx-auto mb-2" />
                    </motion.div>
                    <p className="text-sm opacity-60">your video</p>
                  </div>
                </div>

                {/* Profile overlay */}
                <div className="absolute bottom-4 left-4 flex items-center gap-3">
                  <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-teal-300/50">
                    <Image
                      src={user.photo}
                      alt={user.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{user.name}</p>
                    <p className="text-xs opacity-60">you</p>
                  </div>
                </div>

                {/* Status indicators */}
                {isMuted && (
                  <motion.div
                    className="absolute top-4 right-4 p-2 rounded-full bg-red-500/80 backdrop-blur-sm"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                  >
                    <MicOff className="w-4 h-4" />
                  </motion.div>
                )}
                {isVideoOff && (
                  <motion.div
                    className="absolute top-4 right-4 p-2 rounded-full bg-red-500/80 backdrop-blur-sm"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                  >
                    <VideoOff className="w-4 h-4" />
                  </motion.div>
                )}
              </div>
            </motion.div>

            {/* Partner video */}
            <motion.div
              className="relative group"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              whileHover={{ scale: 1.02 }}
            >
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-white/5 backdrop-blur-sm border-2 border-white/10 group-hover:border-blue-400/50 transition-all duration-300 shadow-2xl">
                {/* Video placeholder */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <motion.div
                      animate={{
                        scale: [1, 1.1, 1],
                        opacity: [0.5, 0.8, 0.5],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        delay: 0.5,
                      }}
                    >
                      <Video className="w-16 h-16 text-white/30 mx-auto mb-2" />
                    </motion.div>
                    <p className="text-sm opacity-60">partner video</p>
                  </div>
                </div>

                {/* Profile overlay */}
                <div className="absolute bottom-4 left-4 flex items-center gap-3">
                  <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-blue-400/50">
                    <Image
                      src={partner.photo}
                      alt={partner.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{partner.name}</p>
                    <p className="text-xs opacity-60">partner</p>
                  </div>
                </div>

                {/* Status indicators */}
                {isPartnerMuted && (
                  <motion.div
                    className="absolute top-4 right-4 p-2 rounded-full bg-red-500/80 backdrop-blur-sm"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                  >
                    <MicOff className="w-4 h-4" />
                  </motion.div>
                )}
                {isPartnerVideoOff && (
                  <motion.div
                    className="absolute top-4 right-4 p-2 rounded-full bg-red-500/80 backdrop-blur-sm"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                  >
                    <VideoOff className="w-4 h-4" />
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>

          {/* Control panel */}
          <motion.div
            className="flex items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            {/* Mute button */}
            <motion.button
              onClick={() => setIsMuted(!isMuted)}
              className={`p-4 rounded-full backdrop-blur-sm border-2 transition-all duration-300 ${
                isMuted
                  ? "bg-red-500/20 border-red-500/50 text-red-300"
                  : "bg-white/5 border-white/10 hover:border-teal-300/50 text-white"
              }`}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </motion.button>

            {/* Video toggle */}
            <motion.button
              onClick={() => setIsVideoOff(!isVideoOff)}
              className={`p-4 rounded-full backdrop-blur-sm border-2 transition-all duration-300 ${
                isVideoOff
                  ? "bg-red-500/20 border-red-500/50 text-red-300"
                  : "bg-white/5 border-white/10 hover:border-teal-300/50 text-white"
              }`}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title={isVideoOff ? "Turn on video" : "Turn off video"}
            >
              {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </motion.button>

            {/* End date button */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <PrimaryButton
                onClick={handleEndDate}
                size="md"
                variant="secondary"
                className="px-8"
              >
                <div className="flex items-center gap-2">
                  <PhoneOff className="w-5 h-5" />
                  <span>end date</span>
                </div>
              </PrimaryButton>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Post-date feedback modal */}
      <Modal
        isOpen={showPostModal}
        onClose={() => {}}
        title="how was your date?"
        className="max-w-lg"
      >
        <motion.div
          className="flex flex-col gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {/* Partner profile */}
          <motion.div
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-teal-300/50 shadow-[0_0_20px_rgba(94,234,212,0.3)] mb-3">
              <Image
                src={partner.photo}
                alt={partner.name}
                fill
                className="object-cover"
              />
            </div>
            <h3 className="text-lg font-semibold mb-1">{partner.name}</h3>
            <p className="opacity-70 text-xs text-center max-w-xs">{partner.bio}</p>
          </motion.div>

          {/* Rating section */}
          <motion.div
            className="flex flex-col gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <label className="text-sm font-medium opacity-80 flex items-center gap-2">
              <Star className="w-4 h-4 text-teal-300" />
              rate your experience
            </label>
            <div className="flex gap-2 justify-center">
              {[1, 2, 3, 4, 5].map((star) => (
                <motion.button
                  key={star}
                  onClick={() => setRating(star)}
                  className={`p-2 rounded-lg transition-all duration-300 ${
                    rating && star <= rating
                      ? "bg-teal-300/20 border-2 border-teal-300/50"
                      : "bg-white/5 border-2 border-white/10 hover:border-teal-300/30"
                  }`}
                  whileHover={{ scale: 1.1, y: -2 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <Star
                    className={`w-6 h-6 ${
                      rating && star <= rating
                        ? "fill-teal-300 text-teal-300"
                        : "text-white/40"
                    }`}
                  />
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Feedback text area */}
          <motion.div
            className="flex flex-col gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <label className="text-sm font-medium opacity-80 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-teal-300" />
              optional feedback
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="share your thoughts about the date..."
              className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white placeholder-white/40 transition-all duration-300 resize-none min-h-[80px]"
              rows={3}
            />
          </motion.div>

          {/* Report button */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <motion.button
              onClick={handleReport}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-red-500/50 hover:bg-red-500/10 transition-all duration-300 text-sm text-red-300/80 hover:text-red-300 flex items-center justify-center gap-2"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Flag className="w-4 h-4" />
              <span>report inappropriate behavior</span>
            </motion.button>
          </motion.div>

          {/* Action buttons */}
          <motion.div
            className="flex gap-3 w-full pt-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <motion.button
              onClick={handlePass}
              className="flex-1 px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all duration-300 font-semibold"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              pass
            </motion.button>
            <motion.button
              onClick={handleYes}
              className="flex-1 px-6 py-3 rounded-xl bg-teal-300 text-black font-semibold hover:bg-teal-200 transition-all duration-300 shadow-lg shadow-teal-300/30"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="flex items-center justify-center gap-2">
                <Heart className="w-5 h-5" />
                <span>yes</span>
              </div>
            </motion.button>
          </motion.div>
        </motion.div>
      </Modal>

      {/* Report modal */}
      <Modal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        title="report inappropriate behavior"
        className="max-w-md"
      >
        <motion.div
          className="flex flex-col gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Flag className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-sm opacity-80 mb-6">
              help us keep the community safe. please describe what happened.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium opacity-80">
              what happened?
            </label>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="describe the inappropriate behavior..."
              className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-red-500/50 focus:outline-none text-white placeholder-white/40 transition-all duration-300 resize-none min-h-[120px]"
              rows={5}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <motion.button
              onClick={() => setShowReportModal(false)}
              className="flex-1 px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all duration-300 font-semibold"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              cancel
            </motion.button>
            <motion.button
              onClick={handleSubmitReport}
              disabled={!reportReason.trim()}
              className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
                reportReason.trim()
                  ? "bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/30"
                  : "bg-white/5 border border-white/10 text-white/40 cursor-not-allowed"
              }`}
              whileHover={reportReason.trim() ? { scale: 1.05 } : {}}
              whileTap={reportReason.trim() ? { scale: 0.95 } : {}}
            >
              submit report
            </motion.button>
          </div>

          <p className="text-xs opacity-60 text-center">
            reports are reviewed by our team. we take all reports seriously.
          </p>
        </motion.div>
      </Modal>

      {/* Pass modal */}
      <AnimatePresence>
        {showPassModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {}}
            />
            <motion.div
              className="relative bg-white/10 backdrop-blur-xl rounded-3xl p-8 max-w-sm w-full border border-white/10 shadow-2xl text-center"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <X className="w-8 h-8 text-white/60" />
              </motion.div>
              <h2 className="text-xl font-bold text-teal-300 mb-2">
                thanks for the date
              </h2>
              <p className="opacity-80 text-sm">you can try another match</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Match modal */}
      <AnimatePresence>
        {showMatchModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {}}
            />
            <motion.div
              className="relative bg-white/10 backdrop-blur-xl rounded-3xl p-8 max-w-sm w-full border border-white/10 shadow-2xl text-center"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              {/* Celebration sparkles */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
                <Sparkles
                  sparklesCount={30}
                  className="absolute inset-0"
                  colors={{
                    first: "#5eead4",
                    second: "#3b82f6"
                  }}
                />
              </div>

              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                className="w-20 h-20 bg-teal-300 rounded-full flex items-center justify-center mx-auto mb-4 shadow-[0_0_40px_rgba(94,234,212,0.8)]"
              >
                <CheckCircle2 className="w-10 h-10 text-black" />
              </motion.div>
              
              <motion.h2
                className="text-2xl font-bold text-teal-300 mb-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                you both want to see each other again
              </motion.h2>
              
              <motion.div
                className="flex gap-4 justify-center mb-4"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
              >
                <div className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-teal-300/50">
                  <Image
                    src={partner.photo}
                    alt={partner.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-teal-300/50">
                  <Image
                    src={user.photo}
                    alt={user.name}
                    fill
                    className="object-cover"
                  />
                </div>
              </motion.div>
              
              <motion.p
                className="opacity-80 text-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.8 }}
                transition={{ delay: 0.5 }}
              >
                saving match…
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reject modal */}
      <AnimatePresence>
        {showRejectModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {}}
            />
            <motion.div
              className="relative bg-white/10 backdrop-blur-xl rounded-3xl p-8 max-w-sm w-full border border-white/10 shadow-2xl text-center"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <X className="w-8 h-8 text-white/60" />
              </motion.div>
              <h2 className="text-xl font-bold text-teal-300 mb-2">
                they chose not to continue
              </h2>
              <p className="opacity-80 text-sm">thanks for the date</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
        </>
      )}
    </div>
  )
}
