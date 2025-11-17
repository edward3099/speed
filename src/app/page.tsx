"use client"

import { useState } from "react"
import { AnimatedGradientBackground } from "@/components/magicui/animated-gradient-background"
import { Sparkles } from "@/components/magicui/sparkles"
import { TextReveal } from "@/components/magicui/text-reveal"
import { ShimmerButton } from "@/components/magicui/shimmer-button"
import { PhotoGrid } from "@/components/ui/photo-grid"

export default function landing() {
  const [showModal, setShowModal] = useState(false)
  const [mode, setMode] = useState("signin")

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

      {/* Mobile: Centered symmetrical layout, Desktop: Side-by-side */}
      <div className="relative z-10 flex flex-col md:flex-row items-center justify-center md:justify-between px-5 sm:px-6 md:px-8 lg:px-12 xl:px-16 max-w-7xl mx-auto pt-safe sm:pt-8 md:pt-12 lg:pt-16 xl:pt-20 pb-safe sm:pb-8 md:pb-12 gap-8 sm:gap-10 md:gap-12 lg:gap-16">
        {/* Hero content - Mobile: Centered, Desktop: Left */}
        <div className="flex flex-col gap-4 sm:gap-5 md:gap-6 max-w-xl w-full animate-fadeUp text-center md:text-left">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-teal-300 drop-shadow-sm leading-tight">
            <TextReveal text="meet someone new" />
          </h1>

          <p className="text-base sm:text-lg md:text-xl opacity-80 leading-relaxed max-w-[640px] mx-auto md:mx-0">
            a clean modern way to connect through short face to face conversations. simple flow and smooth interactions.
          </p>

          {/* Buttons - Mobile: Centered equal width, Desktop: Inline */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-2 sm:mt-4 justify-center md:justify-start">
            <ShimmerButton
              onClick={() => setShowModal(true)}
              className="px-8 py-4 rounded-2xl text-base sm:text-lg font-semibold bg-teal-300 text-black hover:bg-teal-300 hover:text-black w-full sm:w-auto touch-manipulation active:scale-95 transition-transform"
              shimmerColor="#ffffff"
              background="rgba(94, 234, 212, 1)"
            >
              start now
            </ShimmerButton>

            <button
              className="px-8 py-4 rounded-2xl text-base sm:text-lg font-semibold bg-white bg-opacity-10 text-white transition-all hover:bg-opacity-20 active:scale-95 w-full sm:w-auto touch-manipulation"
            >
              learn more
            </button>
          </div>
        </div>

        {/* Photo grid - Mobile: Centered symmetrical, Desktop: Right */}
        <div className="relative flex items-center justify-center w-full md:w-1/2 animate-floatSlow">
          <PhotoGrid
            photos={[
              { src: "https://i.pravatar.cc/200?img=12", alt: "Profile 1" },
              { src: "https://i.pravatar.cc/200?img=20", alt: "Profile 2" },
              { src: "https://i.pravatar.cc/200?img=33", alt: "Profile 3" },
              { src: "https://i.pravatar.cc/200?img=5", alt: "Profile 4" },
            ]}
            className="w-full max-w-[280px] sm:max-w-sm md:max-w-md lg:max-w-lg mx-auto"
          />
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-start sm:items-center justify-center z-30 fade-in p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-[calc(100vw-1.5rem)] sm:max-w-md bg-white bg-opacity-10 backdrop-blur-xl p-5 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl md:rounded-3xl shadow-xl flex flex-col gap-4 sm:gap-5 md:gap-6 mt-4 sm:mt-0 max-h-[calc(100vh-2rem)] overflow-y-auto">
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
                className={`px-4 py-2 rounded-lg transition-all duration-300 touch-manipulation ${mode === "signin" ? "opacity-100 bg-teal-300/20" : "opacity-60 hover:opacity-80"}`}
                onClick={() => setMode("signin")}
              >
                sign in
              </button>
              <button
                className={`px-4 py-2 rounded-lg transition-all duration-300 touch-manipulation ${mode === "signup" ? "opacity-100 bg-teal-300/20" : "opacity-60 hover:opacity-80"}`}
                onClick={() => setMode("signup")}
              >
                sign up
              </button>
            </div>

            {mode === "signup" && (
            <input
              type="text"
              placeholder="name"
              className="w-full p-4 rounded-xl bg-white bg-opacity-20 text-white outline-none text-base focus:bg-white/25 focus:border-2 focus:border-teal-300/50 transition-all duration-300 touch-manipulation"
              style={{ minHeight: '52px' }}
            />
            )}

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

            <button 
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

    </div>
  )
}
