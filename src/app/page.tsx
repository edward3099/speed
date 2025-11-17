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
    <div className="min-h-screen w-full relative bg-[#050810] text-white overflow-hidden">
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

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 max-w-7xl mx-auto pt-6 sm:pt-8 md:pt-12 lg:pt-16 xl:pt-20 gap-6 sm:gap-8 md:gap-10 lg:gap-12 xl:gap-16">
        {/* Left hero content with fade-up animation */}
        <div className="flex flex-col gap-3 sm:gap-4 md:gap-6 max-w-xl animate-fadeUp text-center md:text-left w-full">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-extrabold tracking-tight text-teal-300 drop-shadow-sm leading-tight px-2 sm:px-0">
            <TextReveal text="meet someone new" />
          </h1>

          <p className="text-sm sm:text-base md:text-lg opacity-80 leading-relaxed max-w-[640px] px-2 sm:px-0">
            a clean modern way to connect through short face to face conversations. simple flow and smooth interactions.
          </p>

          <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 md:gap-4 mt-1 sm:mt-2 md:mt-4 px-2 sm:px-0">
            {/* Main CTA with tooltip */}
            <div className="relative group">
              <ShimmerButton
                onClick={() => setShowModal(true)}
                className="px-6 sm:px-10 py-3 sm:py-4 rounded-2xl text-base sm:text-lg font-semibold bg-teal-300 text-black hover:bg-teal-300 hover:text-black w-full sm:w-auto"
                shimmerColor="#ffffff"
                background="rgba(94, 234, 212, 1)"
              >
                start now
              </ShimmerButton>
              <div className="absolute left-1/2 -bottom-10 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition bg-white bg-opacity-10 px-3 py-1 text-xs rounded-xl whitespace-nowrap">
                start your journey
              </div>
            </div>

            {/* Secondary CTA with tooltip */}
            <div className="relative group">
              <button
                className="px-6 sm:px-10 py-3 sm:py-4 rounded-2xl text-base sm:text-lg font-semibold bg-white bg-opacity-10 text-white transition hover:scale-105 hover:bg-opacity-20 active:scale-95 relative w-full sm:w-auto"
              >
                learn more
              </button>
              <div className="absolute left-1/2 -bottom-10 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition bg-white bg-opacity-10 px-3 py-1 text-xs rounded-xl whitespace-nowrap">
                learn how it works
              </div>
            </div>
          </div>
        </div>

        {/* Right animated visual with SPARK-aligned photo effects */}
        <div className="relative flex items-center justify-center w-full md:w-1/2 h-48 sm:h-64 md:h-80 lg:h-96 animate-floatSlow px-2 sm:px-4 md:px-0">
          <PhotoGrid
            photos={[
              { src: "https://i.pravatar.cc/200?img=12", alt: "Profile 1" },
              { src: "https://i.pravatar.cc/200?img=20", alt: "Profile 2" },
              { src: "https://i.pravatar.cc/200?img=33", alt: "Profile 3" },
              { src: "https://i.pravatar.cc/200?img=5", alt: "Profile 4" },
            ]}
            className="w-full max-w-sm sm:max-w-md md:max-w-lg"
          />
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-start sm:items-center justify-center z-30 fade-in p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-[calc(100vw-1.5rem)] sm:max-w-md bg-white bg-opacity-10 backdrop-blur-xl p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl md:rounded-3xl shadow-xl flex flex-col gap-3 sm:gap-4 md:gap-6 mt-4 sm:mt-0 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex justify-center gap-4 sm:gap-6 text-teal-300 font-semibold text-base sm:text-lg">
              <button
                className={`${mode === "signin" ? "opacity-100" : "opacity-60"}`}
                onClick={() => setMode("signin")}
              >
                sign in
              </button>
              <button
                className={`${mode === "signup" ? "opacity-100" : "opacity-60"}`}
                onClick={() => setMode("signup")}
              >
                sign up
              </button>
            </div>

            {mode === "signup" && (
            <input
              type="text"
              placeholder="name"
              className="w-full p-3 sm:p-4 rounded-xl bg-white bg-opacity-20 text-white outline-none text-sm sm:text-base"
            />
            )}

            <input
              type="email"
              placeholder="email"
              className="w-full p-3 sm:p-4 rounded-xl bg-white bg-opacity-20 text-white outline-none text-sm sm:text-base"
            />

            <input
              type="password"
              placeholder="password"
              className="w-full p-3 sm:p-4 rounded-xl bg-white bg-opacity-20 text-white outline-none text-sm sm:text-base"
            />

            <button className="bg-teal-300 text-black p-3 sm:p-4 rounded-xl font-semibold active:scale-95 text-sm sm:text-base">
              continue
            </button>

            <button
              className="text-teal-300 text-center"
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
