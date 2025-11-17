"use client"

import { useState } from "react"
import { AnimatedGradientBackground } from "@/components/magicui/animated-gradient-background"
import { Sparkles } from "@/components/magicui/sparkles"
import { TextReveal } from "@/components/magicui/text-reveal"
import { ShimmerButton } from "@/components/magicui/shimmer-button"

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

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between px-8 md:px-12 lg:px-16 max-w-7xl mx-auto pt-20 gap-12 md:gap-16">
        {/* Left hero content with fade-up animation */}
        <div className="flex flex-col gap-6 max-w-xl animate-fadeUp text-center md:text-left">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-teal-300 drop-shadow-sm leading-tight">
            <TextReveal text="meet someone new" />
          </h1>

          <p className="text-lg opacity-80 leading-relaxed max-w-[640px]">
            a clean modern way to connect through short face to face conversations. simple flow and smooth interactions.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            {/* Main CTA with tooltip */}
            <div className="relative group">
              <ShimmerButton
                onClick={() => setShowModal(true)}
                className="px-10 py-4 rounded-2xl text-lg font-semibold bg-teal-300 text-black hover:bg-teal-300 hover:text-black"
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
        <div className="relative flex items-center justify-center w-full md:w-1/2 h-96 animate-floatSlow">
          <div className="grid grid-cols-2 gap-4">
            <div className="animated-card hover:rotate-1 hover:-translate-y-1 transition-all">
              <img src="https://i.pravatar.cc/200?img=12" className="w-32 h-32 rounded-2xl object-cover" alt="Profile 1" />
            </div>
            <div className="animated-card hover:rotate-1 hover:-translate-y-1 transition-all mt-8">
              <img src="https://i.pravatar.cc/200?img=20" className="w-32 h-32 rounded-2xl object-cover" alt="Profile 2" />
            </div>
            <div className="animated-card hover:rotate-1 hover:-translate-y-1 transition-all">
              <img src="https://i.pravatar.cc/200?img=33" className="w-32 h-32 rounded-2xl object-cover" alt="Profile 3" />
            </div>
            <div className="animated-card hover:rotate-1 hover:-translate-y-1 transition-all mt-8">
              <img src="https://i.pravatar.cc/200?img=5" className="w-32 h-32 rounded-2xl object-cover" alt="Profile 4" />
            </div>
          </div>
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
