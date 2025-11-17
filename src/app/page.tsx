"use client"

import { useState, useEffect } from "react"

export default function landing() {
  const [showModal, setShowModal] = useState(false)
  const [mode, setMode] = useState("signin")
  const [scrollHintIndex, setScrollHintIndex] = useState(0)
  
  const scrollHints = [
    "scroll to learn more",
    "discover connections",
    "explore possibilities"
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setScrollHintIndex((prev) => (prev + 1) % scrollHints.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [scrollHints.length])

  return (
    <div className="min-h-screen w-full relative bg-[#0a0f1f] text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#0f172a,_#0a0f1f)]" />

      <div className="absolute inset-0 pointer-events-none soft-pulse" />

      <div className="relative flex-1 w-full flex flex-col md:flex-row items-center justify-between px-10 mt-20 gap-16 overflow-hidden">
        {/* background gradient layer */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="landing-gradient-layer" />
          <div className="landing-orb landing-orb-left" />
          <div className="landing-orb landing-orb-right" />
        </div>

        {/* Left hero content with fade-up animation */}
        <div className="flex flex-col gap-6 max-w-xl animate-fadeUp text-center md:text-left relative z-10">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-teal-300 drop-shadow-sm leading-tight">
            meet someone new
          </h1>

          <p className="text-lg opacity-80 leading-relaxed max-w-[640px]">
            a clean modern way to connect through short face to face conversations. simple flow and smooth interactions.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            {/* Main CTA with tooltip */}
            <div className="relative group">
              <button
                onClick={() => setShowModal(true)}
                className="spark-cta px-10 py-4 rounded-2xl text-lg font-semibold bg-teal-300 text-black transition transform hover:scale-105 hover:shadow-[0_0_20px_rgba(94,234,212,0.3)] active:scale-95 relative overflow-hidden"
              >
                <span className="relative z-10">start now</span>
                <span className="spark-cta-shimmer" />
              </button>
              <div className="absolute left-1/2 -bottom-10 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition bg-white bg-opacity-10 px-3 py-1 text-xs rounded-xl whitespace-nowrap">
                start your journey
              </div>
            </div>

            {/* Secondary CTA with tooltip */}
            <div className="relative group">
              <button
                className="px-10 py-4 rounded-2xl text-lg font-semibold bg-white bg-opacity-10 text-white transition hover:scale-105 hover:bg-opacity-20 active:scale-95 relative"
              >
                learn more
              </button>
              <div className="absolute left-1/2 -bottom-10 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition bg-white bg-opacity-10 px-3 py-1 text-xs rounded-xl whitespace-nowrap">
                learn how it works
              </div>
            </div>
          </div>
        </div>

        {/* Right animated visual */}
        <div className="relative flex items-center justify-center w-full md:w-1/2 h-96 animate-floatSlow z-10">
          <div className="grid grid-cols-2 gap-4">
            <div className="animated-card spark-card-hover">
              <img src="https://i.pravatar.cc/200?img=12" className="w-32 h-32 rounded-2xl object-cover" alt="Profile 1" />
            </div>
            <div className="animated-card spark-card-hover mt-8">
              <img src="https://i.pravatar.cc/200?img=20" className="w-32 h-32 rounded-2xl object-cover" alt="Profile 2" />
            </div>
            <div className="animated-card spark-card-hover">
              <img src="https://i.pravatar.cc/200?img=33" className="w-32 h-32 rounded-2xl object-cover" alt="Profile 3" />
            </div>
            <div className="animated-card spark-card-hover mt-8">
              <img src="https://i.pravatar.cc/200?img=5" className="w-32 h-32 rounded-2xl object-cover" alt="Profile 4" />
            </div>
          </div>
        </div>
      </div>

      {/* Scroll hint */}
      <div className="w-full flex justify-center pb-8 mt-10">
        <div className="scroll-hint">
          <span 
            key={scrollHintIndex}
            className="scroll-hint-text"
            style={{ animation: 'fadeIn 0.5s ease-in-out' }}
          >
            {scrollHints[scrollHintIndex]}
          </span>
          <div className="scroll-arrow" />
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-30 fade-in">
          <div className="w-full max-w-md bg-white bg-opacity-10 backdrop-blur-xl p-8 rounded-3xl shadow-xl flex flex-col gap-6">
            <div className="flex justify-center gap-6 text-teal-300 font-semibold text-lg">
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
                className="w-full p-4 rounded-xl bg-white bg-opacity-20 text-white outline-none"
              />
            )}

            <input
              type="email"
              placeholder="email"
              className="w-full p-4 rounded-xl bg-white bg-opacity-20 text-white outline-none"
            />

            <input
              type="password"
              placeholder="password"
              className="w-full p-4 rounded-xl bg-white bg-opacity-20 text-white outline-none"
            />

            <button className="bg-teal-300 text-black p-4 rounded-xl font-semibold active:scale-95">
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
