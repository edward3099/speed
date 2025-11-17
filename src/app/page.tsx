"use client"

import { useState } from "react"

export default function landing() {
  const [showModal, setShowModal] = useState(false)
  const [mode, setMode] = useState("signin")

  return (
    <div className="min-h-screen w-full relative bg-[#0a0f1f] text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#0f172a,_#0a0f1f)]" />

      <div className="absolute inset-0 pointer-events-none soft-pulse" />

      <div className="relative z-10 flex flex-col items-center text-center px-8 max-w-lg mx-auto pt-20 fade-in">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-teal-300 drop-shadow-sm">
          meet someone new
        </h1>

        <p className="text-lg opacity-80 leading-relaxed mt-4">
          a clean modern way to connect through short face to face conversations. simple flow and smooth interactions.
        </p>

        <button
          onClick={() => setShowModal(true)}
          className="bg-teal-300 hover:bg-teal-200 text-black font-semibold px-10 py-4 rounded-2xl text-xl active:scale-95 shadow-[0_0_18px_rgba(94,234,212,0.4)] button-bounce mt-6"
        >
          start now
        </button>

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
