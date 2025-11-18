"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AnimatedGradientBackground } from "@/components/magicui/animated-gradient-background"
import { Sparkles } from "@/components/magicui/sparkles"
import { TextReveal } from "@/components/magicui/text-reveal"
import { ShimmerButton } from "@/components/magicui/shimmer-button"
import { PhotoGrid } from "@/components/ui/photo-grid"
import { EditableProfilePicture } from "@/components/ui/editable-profile-picture"
import { EditableBio } from "@/components/ui/editable-bio"
import { FilterInput } from "@/components/ui/filter-input"
import { RangeInput } from "@/components/ui/range-input"
import { User, Calendar, MessageSquare, MapPin, Users } from "lucide-react"

export default function landing() {
  const [showModal, setShowModal] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [mode, setMode] = useState("signin")
  const [onboardingStep, setOnboardingStep] = useState(1)
  
  // Onboarding form data
  const [onboardingData, setOnboardingData] = useState({
    name: "",
    age: 25,
    bio: "",
    photo: "https://i.pravatar.cc/150?img=15",
    location: "",
    minAge: 18,
    maxAge: 30,
    maxDistance: 50
  })

  return (
    <div className="min-h-screen w-full relative bg-[#050810] text-white overflow-hidden safe-area-inset">
      {/* Base deep navy background */}
      <div className="absolute inset-0 bg-[#050810]" />

      {/* Magic UI Animated Gradient Background */}
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

      {/* Mobile-first symmetrical design - S.P.A.R.K. Framework */}
      <div className="relative z-10 flex flex-col md:flex-row items-center justify-center md:justify-between px-4 sm:px-5 md:px-8 lg:px-12 xl:px-16 max-w-7xl mx-auto pt-safe sm:pt-12 md:pt-16 lg:pt-20 pb-safe sm:pb-12 md:pb-16 gap-10 sm:gap-12 md:gap-14 lg:gap-16">
        {/* Hero content - Perfectly centered on mobile */}
        <motion.div 
          className="flex flex-col gap-5 sm:gap-6 md:gap-7 max-w-xl w-full text-center md:text-left"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Main heading with enhanced mobile typography */}
          <motion.h1 
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-teal-300 drop-shadow-lg leading-[1.1] mb-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
          >
            <TextReveal text="meet someone new" />
          </motion.h1>

          {/* Description with refined spacing */}
          <motion.p 
            className="text-base sm:text-lg md:text-xl opacity-75 leading-relaxed max-w-[600px] mx-auto md:mx-0 mb-6 sm:mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 0.75, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            a clean modern way to connect through short face to face conversations. simple flow and smooth interactions.
          </motion.p>

          {/* Action buttons - Perfectly symmetrical on mobile */}
          <motion.div 
            className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center md:justify-start"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <ShimmerButton
              onClick={() => setShowModal(true)}
              className="px-8 py-4 sm:py-5 rounded-2xl text-base sm:text-lg font-bold bg-teal-300 text-black hover:bg-teal-300 hover:text-black w-full sm:w-auto touch-manipulation active:scale-95 transition-transform shadow-lg shadow-teal-300/40"
              shimmerColor="#ffffff"
              background="rgba(94, 234, 212, 1)"
            >
              start now
            </ShimmerButton>

            <motion.button
              className="px-8 py-4 sm:py-5 rounded-2xl text-base sm:text-lg font-bold bg-white/10 text-white backdrop-blur-sm border border-white/20 transition-all hover:bg-white/20 hover:border-white/30 active:scale-95 w-full sm:w-auto touch-manipulation"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
            >
              learn more
            </motion.button>
          </motion.div>
        </motion.div>

        {/* Photo grid - Perfectly centered and symmetrical */}
        <motion.div 
          className="relative flex items-center justify-center w-full md:w-1/2"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="w-full max-w-[300px] sm:max-w-[360px] md:max-w-md lg:max-w-lg">
            <PhotoGrid
              photos={[
                { src: "https://i.pravatar.cc/200?img=12", alt: "Profile 1" },
                { src: "https://i.pravatar.cc/200?img=20", alt: "Profile 2" },
                { src: "https://i.pravatar.cc/200?img=33", alt: "Profile 3" },
                { src: "https://i.pravatar.cc/200?img=5", alt: "Profile 4" },
              ]}
              className="w-full"
            />
          </div>
        </motion.div>
        </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-95 backdrop-blur-sm flex items-start sm:items-center justify-center z-30 fade-in p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-[calc(100vw-1.5rem)] sm:max-w-md bg-[#0a0f1f] border border-white/30 p-5 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl md:rounded-3xl shadow-2xl flex flex-col gap-4 sm:gap-5 md:gap-6 mt-4 sm:mt-0 max-h-[calc(100vh-2rem)] overflow-y-auto">
            {/* Close button */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all duration-200 touch-manipulation"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="flex justify-center gap-6 text-teal-300 font-semibold text-lg mb-2">
              <button
                className={`px-4 py-2 rounded-lg transition-all duration-300 touch-manipulation ${mode === "signin" ? "bg-teal-300/30 text-teal-300 border border-teal-300/50" : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10"}`}
                onClick={() => setMode("signin")}
              >
                sign in
              </button>
              <button
                className={`px-4 py-2 rounded-lg transition-all duration-300 touch-manipulation ${mode === "signup" ? "bg-teal-300/30 text-teal-300 border border-teal-300/50" : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10"}`}
                onClick={() => setMode("signup")}
              >
                sign up
              </button>
            </div>

            <input
              type="email"
              placeholder="email"
              className="w-full p-4 rounded-xl bg-white bg-opacity-20 text-white outline-none text-base focus:bg-white/25 focus:border-2 focus:border-teal-300/50 transition-all duration-300 touch-manipulation"
              style={{ minHeight: '52px' }}
            />

            <input
              type="password"
              placeholder="password"
              className="w-full p-4 rounded-xl bg-white bg-opacity-20 text-white outline-none text-base focus:bg-white/25 focus:border-2 focus:border-teal-300/50 transition-all duration-300 touch-manipulation"
              style={{ minHeight: '52px' }}
            />

            {mode === "signup" && (
            <input
              type="password"
              placeholder="retype password"
              className="w-full p-4 rounded-xl bg-white bg-opacity-20 text-white outline-none text-base focus:bg-white/25 focus:border-2 focus:border-teal-300/50 transition-all duration-300 touch-manipulation"
              style={{ minHeight: '52px' }}
            />
            )}

            <button 
              onClick={() => {
                setShowModal(false)
                setShowOnboarding(true)
              }}
              className="bg-teal-300 text-black p-4 rounded-xl font-semibold active:scale-95 text-base touch-manipulation shadow-lg shadow-teal-300/30 transition-all duration-300"
              style={{ minHeight: '52px' }}
            >
              continue
            </button>

            <button
              className="text-teal-300 text-center text-sm py-2 touch-manipulation active:opacity-70 transition-opacity"
              onClick={() => setShowModal(false)}
            >
              close
            </button>

          </div>
        </div>
      )}

      {/* Onboarding Modal - Multi-step */}
      {showOnboarding && (
        <div className="fixed inset-0 bg-black bg-opacity-95 backdrop-blur-sm flex items-start sm:items-center justify-center z-30 fade-in p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-[calc(100vw-1.5rem)] sm:max-w-md bg-[#0a0f1f] border border-white/30 p-4 sm:p-5 md:p-6 rounded-xl sm:rounded-2xl md:rounded-3xl shadow-2xl flex flex-col gap-3 sm:gap-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            {/* Progress indicator */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5, 6].map((step) => (
                  <div
                    key={step}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      step <= onboardingStep
                        ? "bg-teal-300 flex-1"
                        : "bg-white/10 w-1.5"
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-white/60">{onboardingStep}/6</span>
            </div>

            {/* Close button */}
            <button
              onClick={() => {
                setShowOnboarding(false)
                setOnboardingStep(1)
              }}
              className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all duration-200 touch-manipulation"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Step content */}
            <AnimatePresence mode="wait">
              {/* Step 1: Name */}
              {onboardingStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-3 sm:gap-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-5 h-5 text-teal-300" />
                    <h2 className="text-lg sm:text-xl font-semibold text-teal-300">what's your name?</h2>
                  </div>
                  <input
                    type="text"
                    value={onboardingData.name}
                    onChange={(e) => setOnboardingData({ ...onboardingData, name: e.target.value })}
                    placeholder="enter your name"
                    className="w-full p-3 sm:p-4 rounded-xl bg-white bg-opacity-20 text-white outline-none text-base focus:bg-white/25 focus:border-2 focus:border-teal-300/50 transition-all duration-300 touch-manipulation"
                    style={{ minHeight: '48px' }}
                  />
                </motion.div>
              )}

              {/* Step 2: Age */}
              {onboardingStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-3 sm:gap-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="w-5 h-5 text-teal-300" />
                    <h2 className="text-lg sm:text-xl font-semibold text-teal-300">how old are you?</h2>
                  </div>
                  <div className="py-2">
                    <RangeInput
                      min={18}
                      max={100}
                      value={onboardingData.age}
                      onChange={(val) => setOnboardingData({ ...onboardingData, age: val })}
                      label={`${onboardingData.age} years old`}
                    />
                  </div>
                </motion.div>
              )}

              {/* Step 3: Bio */}
              {onboardingStep === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-3 sm:gap-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare className="w-5 h-5 text-teal-300" />
                    <h2 className="text-lg sm:text-xl font-semibold text-teal-300">tell us about yourself</h2>
                  </div>
                  <EditableBio
                    bio={onboardingData.bio}
                    onBioChange={(bio) => setOnboardingData({ ...onboardingData, bio })}
                    className="min-h-[100px]"
                  />
                </motion.div>
              )}

              {/* Step 4: Profile Picture */}
              {onboardingStep === 4 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-3 sm:gap-4 items-center"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-5 h-5 text-teal-300" />
                    <h2 className="text-lg sm:text-xl font-semibold text-teal-300">upload your photo</h2>
                  </div>
                  <EditableProfilePicture
                    src={onboardingData.photo}
                    alt="profile"
                    size="lg"
                    onImageChange={(file) => {
                      const reader = new FileReader()
                      reader.onloadend = () => {
                        setOnboardingData({ ...onboardingData, photo: reader.result as string })
                      }
                      reader.readAsDataURL(file)
                    }}
                  />
                </motion.div>
              )}

              {/* Step 5: Location */}
              {onboardingStep === 5 && (
                <motion.div
                  key="step5"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-3 sm:gap-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="w-5 h-5 text-teal-300" />
                    <h2 className="text-lg sm:text-xl font-semibold text-teal-300">where are you located?</h2>
                  </div>
                  <input
                    type="text"
                    value={onboardingData.location}
                    onChange={(e) => setOnboardingData({ ...onboardingData, location: e.target.value })}
                    placeholder="enter city or zip code"
                    className="w-full p-3 sm:p-4 rounded-xl bg-white bg-opacity-20 text-white outline-none text-base focus:bg-white/25 focus:border-2 focus:border-teal-300/50 transition-all duration-300 touch-manipulation"
                    style={{ minHeight: '48px' }}
                  />
                </motion.div>
              )}

              {/* Step 6: Preferences */}
              {onboardingStep === 6 && (
                <motion.div
                  key="step6"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-3 sm:gap-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-5 h-5 text-teal-300" />
                    <h2 className="text-lg sm:text-xl font-semibold text-teal-300">what are you looking for?</h2>
                  </div>
                  
                  {/* Age Range */}
                  <FilterInput
                    label="age range"
                    icon={<Users className="w-4 h-4" />}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <RangeInput
                          min={18}
                          max={onboardingData.maxAge}
                          value={onboardingData.minAge}
                          onChange={(val) => setOnboardingData({ ...onboardingData, minAge: val })}
                          label="minimum age"
                        />
                      </div>
                      <div className="text-lg opacity-60">-</div>
                      <div className="flex-1">
                        <RangeInput
                          min={onboardingData.minAge}
                          max={100}
                          value={onboardingData.maxAge}
                          onChange={(val) => setOnboardingData({ ...onboardingData, maxAge: val })}
                          label="maximum age"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-2 mt-2">
                      <div className="px-3 py-1.5 rounded-lg bg-teal-300/10 border border-teal-300/30 text-teal-300 text-sm font-semibold">
                        {onboardingData.minAge}
                      </div>
                      <span className="text-sm opacity-60">to</span>
                      <div className="px-3 py-1.5 rounded-lg bg-teal-300/10 border border-teal-300/30 text-teal-300 text-sm font-semibold">
                        {onboardingData.maxAge}
                      </div>
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
                      value={onboardingData.maxDistance}
                      onChange={(val) => setOnboardingData({ ...onboardingData, maxDistance: val })}
                      label={`${onboardingData.maxDistance} miles`}
                    />
                  </FilterInput>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Navigation buttons */}
            <div className="flex gap-2 sm:gap-3 mt-2 pt-2 border-t border-white/10">
              <button
                onClick={() => {
                  if (onboardingStep > 1) {
                    setOnboardingStep(onboardingStep - 1)
                  } else {
                    setShowOnboarding(false)
                    setShowModal(true)
                  }
                }}
                className="flex-1 px-4 py-2.5 sm:py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition-all duration-300 text-sm sm:text-base font-semibold touch-manipulation"
                style={{ minHeight: '44px' }}
              >
                {onboardingStep === 1 ? "back" : "previous"}
              </button>
              <button
                onClick={() => {
                  if (onboardingStep < 6) {
                    setOnboardingStep(onboardingStep + 1)
                  } else {
                    // Complete onboarding
                    console.log("Onboarding complete:", onboardingData)
                    setShowOnboarding(false)
                    // Navigate to dashboard or spin page
                  }
                }}
                className="flex-1 px-4 py-2.5 sm:py-3 rounded-xl bg-teal-300 text-black hover:bg-teal-200 active:scale-95 transition-all duration-300 text-sm sm:text-base font-semibold shadow-lg shadow-teal-300/30 touch-manipulation"
                style={{ minHeight: '44px' }}
              >
                {onboardingStep === 6 ? "complete" : "continue"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
