"use client"

import { useState } from "react"

import { FiHeart, FiCalendar } from "react-icons/fi"

export default function dashboard() {
  const name = "jason"

  const bio = "i like good conversations and new experiences"

  const [showMatches, setShowMatches] = useState(false)

  const [showEvents, setShowEvents] = useState(false)

  return (
    <div className="min-h-screen w-full bg-[#0a0f1f] text-white">
      <div className="px-6 fade-in pt-4">
        <div className="mb-10">
          <h2 className="text-4xl font-extrabold text-teal-300 mb-3">
            welcome back {name}
          </h2>
          <p className="text-lg opacity-80 leading-relaxed">
            {bio}
          </p>
        </div>

        <div className="flex justify-center mb-10">
          <button className="bg-teal-300 text-black px-12 py-5 rounded-2xl text-xl font-semibold active:scale-95 transition">
            start spin
          </button>
        </div>

        <div className="flex flex-col gap-6">
          <button
            className="hero-card"
            onClick={() => setShowMatches(true)}
          >
            <FiHeart size={32} className="text-teal-300" />
            <span className="text-lg font-medium mt-2">saved matches</span>
          </button>

          <button
            className="hero-card"
            onClick={() => setShowEvents(true)}
          >
            <FiCalendar size={32} className="text-teal-300" />
            <span className="text-lg font-medium mt-2">events</span>
          </button>

        </div>

      </div>

      {showMatches && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex justify-center items-center z-30 fade-in">
          <div className="bg-white bg-opacity-10 backdrop-blur-xl p-8 rounded-3xl max-w-md w-full flex flex-col gap-4">
            <h2 className="text-2xl font-bold text-teal-300 text-center">saved matches</h2>
            <p className="opacity-80 text-center">no matches yet</p>
            <button
              className="text-teal-300 mt-4 text-center"
              onClick={() => setShowMatches(false)}
            >
              close
            </button>
          </div>
        </div>
      )}

      {showEvents && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex justify-center items-center z-30 fade-in">
          <div className="bg-white bg-opacity-10 backdrop-blur-xl p-8 rounded-3xl max-w-md w-full flex flex-col gap-4">
            <h2 className="text-2xl font-bold text-teal-300 text-center">events</h2>
            <p className="opacity-80 text-center">no events available</p>
            <button
              className="text-teal-300 mt-4 text-center"
              onClick={() => setShowEvents(false)}
            >
              close
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
