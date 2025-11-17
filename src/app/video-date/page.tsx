"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Video, Mic, MicOff, VideoOff, PhoneOff, Heart, X, Sparkles as SparklesIcon, CheckCircle2, Star, Flag, MessageSquare, Eye, EyeOff, Clock, Settings2, Volume2, Mail, Phone, Facebook, Instagram, Link as LinkIcon } from "lucide-react"
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
  const [showContactModal, setShowContactModal] = useState(false)
  const [userContactDetails, setUserContactDetails] = useState({
    email: "",
    phone: "",
    facebook: "",
    instagram: "",
    other: ""
  })
  const [partnerContactDetails, setPartnerContactDetails] = useState<{
    email?: string
    phone?: string
    facebook?: string
    instagram?: string
    other?: string
  } | null>(null)
  const [rating, setRating] = useState<number | null>(null)
  const [feedback, setFeedback] = useState("")
  const [reportReason, setReportReason] = useState("")
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isPartnerMuted, setIsPartnerMuted] = useState(true)
  const [isPartnerVideoOff, setIsPartnerVideoOff] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [isTimerVisible, setIsTimerVisible] = useState(true)
  const [countdownMuted, setCountdownMuted] = useState(false)
  const [countdownVideoOff, setCountdownVideoOff] = useState(false)

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
    if (rating !== null || feedback.trim()) {
      console.log("Feedback submitted:", { rating, feedback })
    }
    
    setShowPostModal(false)
    // Always show contact details form (both said yes)
    setShowContactModal(true)
  }

  const handleSubmitContactDetails = () => {
    // In a real app, this would send contact details to backend
    console.log("Contact details submitted:", userContactDetails)
    
    // Simulate receiving partner's contact details
    setPartnerContactDetails({
      email: "alex@example.com",
      phone: "+1 (555) 123-4567",
      facebook: "alex.smith",
      instagram: "@alexsmith"
    })
    
    setShowContactModal(false)
    setShowMatchModal(true)
    // No timeout - user controls when to continue
  }

  const handleContinueFromMatch = () => {
    setShowMatchModal(false)
    router.push("/spin")
  }

  const handlePass = () => {
    if (rating !== null || feedback.trim()) {
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
            <div className="absolute inset-0 bg-[#050810]" />
            <AnimatedGradientBackground />
            
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
              className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 bg-teal-500/20 rounded-full blur-3xl pointer-events-none"
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
              className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none"
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
            <div className="relative z-10 w-full max-w-6xl px-4 sm:px-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-center">
                {/* Left: Partner preview */}
                <motion.div
                  className="flex flex-col items-center gap-3 sm:gap-4"
                  initial={{ opacity: 0, x: -50 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="relative w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-3xl overflow-hidden border-4 border-blue-400/50 shadow-[0_0_40px_rgba(59,130,246,0.4)]">
                    <Image
                      src={partner.photo}
                      alt={partner.name}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-lg font-semibold text-blue-300">{partner.name}</h3>
                    <p className="text-xs opacity-70 mt-1">{partner.bio}</p>
                  </div>
                </motion.div>

                {/* Center: Countdown and video preview */}
                <div className="flex flex-col items-center gap-6">
                  {/* Video preview */}
                  <motion.div
                    className="relative w-full max-w-md"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <div className="relative aspect-video rounded-3xl overflow-hidden bg-gradient-to-br from-teal-500/20 via-blue-500/20 to-purple-500/20 backdrop-blur-sm border-2 border-teal-300/50 shadow-2xl">
                      {countdownVideoOff ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <VideoOff className="w-20 h-20 text-white/30 mx-auto mb-3" />
                            <p className="text-sm opacity-60 font-medium">video off</p>
                          </div>
                        </div>
                      ) : (
                        <div className="relative w-full h-full">
                          <div className="absolute inset-0 flex items-center justify-center">
                            <motion.div
                              animate={{
                                scale: [1, 1.1, 1],
                                opacity: [0.4, 0.7, 0.4],
                              }}
                              transition={{
                                duration: 2,
                                repeat: Infinity,
                              }}
                            >
                              <Video className="w-24 h-24 text-white/40" />
                            </motion.div>
                          </div>
                          <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 md:bottom-4 md:left-4 flex items-center gap-2 sm:gap-3">
                            <div className="relative w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg sm:rounded-xl overflow-hidden border-2 border-teal-300/50 bg-white/10 backdrop-blur-sm">
                              <Image
                                src={user.photo}
                                alt={user.name}
                                fill
                                className="object-cover"
                              />
                            </div>
                            <div>
                              <p className="text-xs sm:text-sm font-semibold">{user.name}</p>
                              <p className="text-[10px] sm:text-xs opacity-60">you</p>
                            </div>
                          </div>
                          {!countdownMuted && (
                            <motion.div
                              className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 md:bottom-4 md:right-4 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full bg-green-500/90 backdrop-blur-sm flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-semibold shadow-lg"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.5 }}
                            >
                              <motion.div
                                className="w-2 h-2 bg-white rounded-full"
                                animate={{
                                  scale: [1, 1.4, 1],
                                  opacity: [1, 0.6, 1],
                                }}
                                transition={{
                                  duration: 1,
                                  repeat: Infinity,
                                }}
                              />
                              <span>mic active</span>
                            </motion.div>
                          )}
                          {countdownMuted && (
                            <motion.div
                              className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 p-1.5 sm:p-2 md:p-2.5 rounded-full bg-red-500/90 backdrop-blur-sm shadow-lg"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                            >
                              <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                            </motion.div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Controls */}
                    <motion.div
                      className="flex items-center justify-center gap-2 sm:gap-3 mt-3 sm:mt-4"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                    >
                      <motion.button
                        onClick={() => {
                          setCountdownMuted(!countdownMuted)
                          setIsMuted(!countdownMuted)
                        }}
                        className={`p-2.5 sm:p-3.5 rounded-xl backdrop-blur-sm border-2 transition-all duration-300 ${
                          countdownMuted
                            ? "bg-red-500/20 border-red-500/50 text-red-300 shadow-lg shadow-red-500/20"
                            : "bg-white/10 border-white/20 hover:border-teal-300/50 text-white hover:bg-white/15"
                        }`}
                        whileHover={{ scale: 1.1, y: -2 }}
                        whileTap={{ scale: 0.9 }}
                        title={countdownMuted ? "Unmute" : "Mute"}
                      >
                        {countdownMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
                      </motion.button>

                      <motion.button
                        onClick={() => {
                          setCountdownVideoOff(!countdownVideoOff)
                          setIsVideoOff(!countdownVideoOff)
                        }}
                        className={`p-2.5 sm:p-3.5 rounded-xl backdrop-blur-sm border-2 transition-all duration-300 ${
                          countdownVideoOff
                            ? "bg-red-500/20 border-red-500/50 text-red-300 shadow-lg shadow-red-500/20"
                            : "bg-white/10 border-white/20 hover:border-teal-300/50 text-white hover:bg-white/15"
                        }`}
                        whileHover={{ scale: 1.1, y: -2 }}
                        whileTap={{ scale: 0.9 }}
                        title={countdownVideoOff ? "Turn on video" : "Turn off video"}
                      >
                        {countdownVideoOff ? <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Video className="w-4 h-4 sm:w-5 sm:h-5" />}
                      </motion.button>
                    </motion.div>
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
                      className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-blue-400 to-teal-300"
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
                    <motion.div
                      className="absolute inset-0 -z-10"
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.4, 0.7, 0.4],
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
                    transition={{ delay: 0.6 }}
                  >
                    <motion.p
                      className="text-base sm:text-lg md:text-xl lg:text-2xl font-semibold mb-2"
                      animate={{
                        opacity: [0.7, 1, 0.7],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                      }}
                    >
                      {countdown > 3 ? "your date is starting" : "get ready"}
                    </motion.p>
                    <p className="text-xs sm:text-sm opacity-60">
                      {countdown > 10 ? "test your mic and video" : countdown > 5 ? "smile and be yourself" : "here we go"}
                    </p>
                  </motion.div>

                  {/* Progress ring */}
                  <motion.div
                    className="relative w-28 h-28"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        fill="none"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth="3"
                      />
                      <motion.circle
                        cx="50"
                        cy="50"
                        r="45"
                        fill="none"
                        stroke="url(#countdownGradient)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        initial={{ pathLength: 1 }}
                        animate={{ pathLength: countdown / 15 }}
                        transition={{ duration: 1, ease: "linear" }}
                      />
                      <defs>
                        <linearGradient id="countdownGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#5eead4" />
                          <stop offset="50%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#5eead4" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </motion.div>
                </div>

                {/* Right: User preview */}
                <motion.div
                  className="flex flex-col items-center gap-4"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="relative w-32 h-32 rounded-3xl overflow-hidden border-4 border-teal-300/50 shadow-[0_0_40px_rgba(94,234,212,0.4)]">
                    <Image
                      src={user.photo}
                      alt={user.name}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-lg font-semibold text-teal-300">{user.name}</h3>
                    <p className="text-xs opacity-70 mt-1">you</p>
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main video interface */}
      {countdownComplete && (
        <>
          <div className="fixed inset-0 bg-[#050810] pointer-events-none" />
          <AnimatedGradientBackground />
          
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
            className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 bg-teal-500/20 rounded-full blur-3xl pointer-events-none"
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
            className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none"
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

          {/* Top bar */}
          <motion.div
            className="relative z-10 px-3 sm:px-4 md:px-6 pt-4 sm:pt-5 md:pt-6 pb-3 sm:pb-4"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                  <AnimatePresence mode="wait">
                    {isTimerVisible && (
                      <motion.div
                        key="timer"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/5 backdrop-blur-md border border-white/10 shadow-lg"
                        whileHover={{ scale: 1.05, borderColor: "rgba(94,234,212,0.5)" }}
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
                          <Clock className="w-5 h-5 text-teal-300" />
                        </motion.div>
                        <span className="text-xl font-bold text-teal-300 tabular-nums">
                          {formatTime(timeLeft)}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.button
                    onClick={() => setIsTimerVisible(!isTimerVisible)}
                    className={`p-2.5 rounded-full backdrop-blur-md border-2 transition-all duration-300 ${
                      isTimerVisible
                        ? "bg-white/5 border-white/10 hover:border-teal-300/50 text-white"
                        : "bg-teal-300/20 border-teal-300/50 text-teal-300 shadow-lg shadow-teal-300/20"
                    }`}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    title={isTimerVisible ? "Hide timer" : "Show timer"}
                  >
                    {isTimerVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </motion.button>
                </div>

                <motion.div
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 backdrop-blur-md border border-white/10 shadow-lg"
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
                  <span className="text-sm opacity-80 font-medium">connected</span>
                </motion.div>
              </div>

              <AnimatePresence>
                {isTimerVisible && (
                  <motion.div
                    className="h-1.5 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 6 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
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
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Main video layout */}
          <div className="relative z-10 px-3 sm:px-4 md:px-6 pb-4 sm:pb-5 md:pb-6">
            <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 md:gap-6 mb-4 sm:mb-5 md:mb-6">
                {/* Your video */}
                <motion.div
                  className="relative group"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  whileHover={{ scale: 1.01 }}
                >
                  <div className="relative aspect-video rounded-xl sm:rounded-2xl md:rounded-3xl overflow-hidden bg-white/5 backdrop-blur-sm border-2 border-white/10 group-hover:border-teal-300/50 transition-all duration-300 shadow-2xl">
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
                          <Video className="w-20 h-20 text-white/30 mx-auto mb-2" />
                        </motion.div>
                        <p className="text-sm opacity-60 font-medium">your video</p>
                      </div>
                    </div>

                    <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 md:bottom-4 md:left-4 flex items-center gap-2 sm:gap-3">
                      <div className="relative w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg sm:rounded-xl overflow-hidden border-2 border-teal-300/50 bg-white/10 backdrop-blur-sm">
                        <Image
                          src={user.photo}
                          alt={user.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-semibold">{user.name}</p>
                        <p className="text-[10px] sm:text-xs opacity-60">you</p>
                      </div>
                    </div>

                    {isMuted && (
                      <motion.div
                        className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 p-1.5 sm:p-2 md:p-2.5 rounded-full bg-red-500/90 backdrop-blur-sm shadow-lg z-10"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                      >
                        <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                      </motion.div>
                    )}
                    {isVideoOff && (
                      <motion.div
                        className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 p-1.5 sm:p-2 md:p-2.5 rounded-full bg-red-500/90 backdrop-blur-sm shadow-lg z-10"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                      >
                        <VideoOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                      </motion.div>
                    )}
                  </div>
                </motion.div>

                {/* Partner video */}
                <motion.div
                  className="relative group"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  whileHover={{ scale: 1.01 }}
                >
                  <div className="relative aspect-video rounded-3xl overflow-hidden bg-white/5 backdrop-blur-sm border-2 border-white/10 group-hover:border-blue-400/50 transition-all duration-300 shadow-2xl">
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
                          <Video className="w-20 h-20 text-white/30 mx-auto mb-2" />
                        </motion.div>
                        <p className="text-sm opacity-60 font-medium">partner video</p>
                      </div>
                    </div>

                    <div className="absolute bottom-4 left-4 flex items-center gap-3">
                      <div className="relative w-14 h-14 rounded-xl overflow-hidden border-2 border-blue-400/50 bg-white/10 backdrop-blur-sm">
                        <Image
                          src={partner.photo}
                          alt={partner.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-semibold">{partner.name}</p>
                        <p className="text-[10px] sm:text-xs opacity-60">partner</p>
                      </div>
                    </div>

                    {isPartnerMuted && (
                      <motion.div
                        className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 p-1.5 sm:p-2 md:p-2.5 rounded-full bg-red-500/90 backdrop-blur-sm shadow-lg z-10"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                      >
                        <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                      </motion.div>
                    )}
                    {isPartnerVideoOff && (
                      <motion.div
                        className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 p-1.5 sm:p-2 md:p-2.5 rounded-full bg-red-500/90 backdrop-blur-sm shadow-lg z-10"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                      >
                        <VideoOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Control panel */}
              <motion.div
                className="flex items-center justify-center gap-3 sm:gap-4 px-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <motion.button
                  onClick={() => setIsMuted(!isMuted)}
                  className={`p-3 sm:p-4 rounded-xl backdrop-blur-md border-2 transition-all duration-300 shadow-lg ${
                    isMuted
                      ? "bg-red-500/20 border-red-500/50 text-red-300 shadow-red-500/20"
                      : "bg-white/10 border-white/20 hover:border-teal-300/50 text-white hover:bg-white/15"
                  }`}
                  whileHover={{ scale: 1.1, y: -2 }}
                  whileTap={{ scale: 0.9 }}
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
                </motion.button>

                <motion.button
                  onClick={() => setIsVideoOff(!isVideoOff)}
                  className={`p-3 sm:p-4 rounded-xl backdrop-blur-md border-2 transition-all duration-300 shadow-lg ${
                    isVideoOff
                      ? "bg-red-500/20 border-red-500/50 text-red-300 shadow-red-500/20"
                      : "bg-white/10 border-white/20 hover:border-teal-300/50 text-white hover:bg-white/15"
                  }`}
                  whileHover={{ scale: 1.1, y: -2 }}
                  whileTap={{ scale: 0.9 }}
                  title={isVideoOff ? "Turn on video" : "Turn off video"}
                >
                  {isVideoOff ? <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Video className="w-5 h-5 sm:w-6 sm:h-6" />}
                </motion.button>

                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <PrimaryButton
                    onClick={handleEndDate}
                    size="md"
                    variant="secondary"
                    className="px-4 sm:px-6 md:px-8 text-sm sm:text-base"
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span>end date</span>
                    </div>
                  </PrimaryButton>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </>
      )}

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

      {/* Contact details modal */}
      <Modal
        isOpen={showContactModal}
        onClose={() => {}}
        title="exchange contact details"
        className="max-w-lg"
      >
        <motion.div
          className="flex flex-col gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="w-16 h-16 bg-teal-300/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Heart className="w-8 h-8 text-teal-300" />
            </div>
            <h3 className="text-lg font-semibold mb-2">you both want to connect!</h3>
            <p className="text-sm opacity-70">
              share your preferred contact details with {partner.name}
            </p>
          </motion.div>

          <div className="space-y-4">
            <motion.div
              className="flex flex-col gap-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <label className="text-sm font-medium opacity-80 flex items-center gap-2">
                <Mail className="w-4 h-4 text-teal-300" />
                email (optional)
              </label>
              <input
                type="email"
                value={userContactDetails.email}
                onChange={(e) => setUserContactDetails(prev => ({ ...prev, email: e.target.value }))}
                placeholder="your@email.com"
                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white placeholder-white/40 transition-all duration-300"
              />
            </motion.div>

            <motion.div
              className="flex flex-col gap-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <label className="text-sm font-medium opacity-80 flex items-center gap-2">
                <Phone className="w-4 h-4 text-teal-300" />
                phone number (optional)
              </label>
              <input
                type="tel"
                value={userContactDetails.phone}
                onChange={(e) => setUserContactDetails(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+1 (555) 123-4567"
                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white placeholder-white/40 transition-all duration-300"
              />
            </motion.div>

            <motion.div
              className="flex flex-col gap-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <label className="text-sm font-medium opacity-80 flex items-center gap-2">
                <Facebook className="w-4 h-4 text-teal-300" />
                facebook (optional)
              </label>
              <input
                type="text"
                value={userContactDetails.facebook}
                onChange={(e) => setUserContactDetails(prev => ({ ...prev, facebook: e.target.value }))}
                placeholder="your.facebook.username"
                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white placeholder-white/40 transition-all duration-300"
              />
            </motion.div>

            <motion.div
              className="flex flex-col gap-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              <label className="text-sm font-medium opacity-80 flex items-center gap-2">
                <Instagram className="w-4 h-4 text-teal-300" />
                instagram (optional)
              </label>
              <input
                type="text"
                value={userContactDetails.instagram}
                onChange={(e) => setUserContactDetails(prev => ({ ...prev, instagram: e.target.value }))}
                placeholder="@yourusername"
                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white placeholder-white/40 transition-all duration-300"
              />
            </motion.div>

            <motion.div
              className="flex flex-col gap-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
            >
              <label className="text-sm font-medium opacity-80 flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-teal-300" />
                other (optional)
              </label>
              <input
                type="text"
                value={userContactDetails.other}
                onChange={(e) => setUserContactDetails(prev => ({ ...prev, other: e.target.value }))}
                placeholder="snapchat, discord, etc."
                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white placeholder-white/40 transition-all duration-300"
              />
            </motion.div>
          </div>

          <motion.div
            className="flex gap-3 pt-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
          >
            <motion.button
              onClick={() => {
                setShowContactModal(false)
                router.push("/spin")
              }}
              className="flex-1 px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all duration-300 font-semibold"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              skip
            </motion.button>
            <motion.button
              onClick={handleSubmitContactDetails}
              className="flex-1 px-6 py-3 rounded-xl bg-teal-300 text-black font-semibold hover:bg-teal-200 transition-all duration-300 shadow-lg shadow-teal-300/30"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="flex items-center justify-center gap-2">
                <Heart className="w-5 h-5" />
                <span>share details</span>
              </div>
            </motion.button>
          </motion.div>
        </motion.div>
      </Modal>

      {/* Match modal - shows contact details */}
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
              className="relative bg-white/10 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 max-w-md w-full max-w-[calc(100vw-1.5rem)] border border-white/10 shadow-2xl text-center"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
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
                className="text-2xl font-bold text-teal-300 mb-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                connection made!
              </motion.h2>
              
              <motion.p
                className="opacity-80 text-sm mb-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.8 }}
                transition={{ delay: 0.4 }}
              >
                {partner.name}'s contact details
              </motion.p>

              {partnerContactDetails && (
                <motion.div
                  className="space-y-3 mb-6 text-left"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  {partnerContactDetails.email && (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
                      <Mail className="w-5 h-5 text-teal-300" />
                      <span className="text-sm">{partnerContactDetails.email}</span>
                    </div>
                  )}
                  {partnerContactDetails.phone && (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
                      <Phone className="w-5 h-5 text-teal-300" />
                      <span className="text-sm">{partnerContactDetails.phone}</span>
                    </div>
                  )}
                  {partnerContactDetails.facebook && (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
                      <Facebook className="w-5 h-5 text-teal-300" />
                      <span className="text-sm">{partnerContactDetails.facebook}</span>
                    </div>
                  )}
                  {partnerContactDetails.instagram && (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
                      <Instagram className="w-5 h-5 text-teal-300" />
                      <span className="text-sm">{partnerContactDetails.instagram}</span>
                    </div>
                  )}
                </motion.div>
              )}
              
              <motion.div
                className="flex justify-center pt-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
              >
                <motion.button
                  onClick={handleContinueFromMatch}
                  className="px-8 py-3 rounded-xl bg-teal-300 text-black font-semibold hover:bg-teal-200 transition-all duration-300 shadow-lg shadow-teal-300/30"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  continue
                </motion.button>
              </motion.div>
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
    </div>
  )
}
