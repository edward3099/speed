"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { RangeInput } from "@/components/ui/range-input"

export default function onboarding() {
  const [step, setStep] = useState(1)
  const [age, setAge] = useState(25)
  const total = 5

  const next = () => {
    if (step < total) setStep(step + 1)
  }

  const back = () => {
    if (step > 1) setStep(step - 1)
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0f1f] text-white relative overflow-hidden safe-area-inset">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#0f172a,_#0a0f1f)]" />

      <div className="absolute inset-0 soft-pulse" />

      <div className="relative z-10 w-full max-w-lg px-5 sm:px-6 md:px-8 py-safe sm:py-8 fade-in">

        {step === 1 && (
          <div className="flex flex-col gap-5 sm:gap-6">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-teal-300 text-center sm:text-left">what is your name</h1>

            <input 
              type="text" 
              placeholder="your name" 
              className="w-full p-4 rounded-xl bg-white bg-opacity-20 outline-none text-white text-base focus:bg-white/25 focus:border-2 focus:border-teal-300/50 transition-all duration-300 touch-manipulation" 
              style={{ minHeight: '52px' }}
            />

            <button 
              onClick={next} 
              className="mt-2 bg-teal-300 text-black p-4 rounded-xl text-base sm:text-lg font-semibold active:scale-95 w-full touch-manipulation shadow-lg shadow-teal-300/30 transition-all duration-300"
              style={{ minHeight: '52px' }}
            >
              next
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5 sm:gap-6">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-teal-300 text-center sm:text-left">add a photo</h1>

            <button 
              className="p-4 bg-white bg-opacity-20 rounded-xl text-base font-semibold w-full active:scale-95 touch-manipulation transition-all duration-300 hover:bg-white/25"
              style={{ minHeight: '52px' }}
            >
              upload photo
            </button>

            <div className="flex gap-3 mt-4">
              <button 
                onClick={back} 
                className="flex-1 p-4 bg-white bg-opacity-10 rounded-xl text-base font-semibold active:scale-95 touch-manipulation transition-all duration-300"
                style={{ minHeight: '52px' }}
              >
                back
              </button>
              <button 
                onClick={next} 
                className="flex-1 p-4 bg-teal-300 text-black rounded-xl active:scale-95 text-base font-semibold touch-manipulation shadow-lg shadow-teal-300/30 transition-all duration-300"
                style={{ minHeight: '52px' }}
              >
                next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-5 sm:gap-6">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-teal-300 text-center sm:text-left">select your age</h1>

            <div className="py-4">
              <RangeInput
                min={18}
                max={100}
                value={age}
                onChange={setAge}
                label={`${age} years old`}
              />
            </div>

            <div className="flex gap-3 mt-4">
              <button 
                onClick={back} 
                className="flex-1 p-4 bg-white bg-opacity-10 rounded-xl text-base font-semibold active:scale-95 touch-manipulation transition-all duration-300"
                style={{ minHeight: '52px' }}
              >
                back
              </button>
              <button 
                onClick={next} 
                className="flex-1 p-4 bg-teal-300 text-black rounded-xl active:scale-95 text-base font-semibold touch-manipulation shadow-lg shadow-teal-300/30 transition-all duration-300"
                style={{ minHeight: '52px' }}
              >
                next
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-5 sm:gap-6">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-teal-300 text-center sm:text-left">select interests</h1>

            <div className="grid grid-cols-2 gap-3">
              <button 
                className="p-4 bg-white bg-opacity-20 rounded-xl text-base font-medium active:scale-95 touch-manipulation transition-all duration-300 hover:bg-white/25"
                style={{ minHeight: '60px' }}
              >
                music
              </button>
              <button 
                className="p-4 bg-white bg-opacity-20 rounded-xl text-base font-medium active:scale-95 touch-manipulation transition-all duration-300 hover:bg-white/25"
                style={{ minHeight: '60px' }}
              >
                travel
              </button>
              <button 
                className="p-4 bg-white bg-opacity-20 rounded-xl text-base font-medium active:scale-95 touch-manipulation transition-all duration-300 hover:bg-white/25"
                style={{ minHeight: '60px' }}
              >
                fitness
              </button>
              <button 
                className="p-4 bg-white bg-opacity-20 rounded-xl text-base font-medium active:scale-95 touch-manipulation transition-all duration-300 hover:bg-white/25"
                style={{ minHeight: '60px' }}
              >
                movies
              </button>
            </div>

            <div className="flex gap-3 mt-4">
              <button 
                onClick={back} 
                className="flex-1 p-4 bg-white bg-opacity-10 rounded-xl text-base font-semibold active:scale-95 touch-manipulation transition-all duration-300"
                style={{ minHeight: '52px' }}
              >
                back
              </button>
              <button 
                onClick={next} 
                className="flex-1 p-4 bg-teal-300 text-black rounded-xl active:scale-95 text-base font-semibold touch-manipulation shadow-lg shadow-teal-300/30 transition-all duration-300"
                style={{ minHeight: '52px' }}
              >
                next
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-5 sm:gap-6">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-teal-300 text-center sm:text-left">camera and mic</h1>

            <p className="opacity-80 text-base sm:text-lg text-center sm:text-left">allow access to continue</p>

            <button 
              className="p-4 bg-white bg-opacity-20 rounded-xl text-base font-semibold w-full active:scale-95 touch-manipulation transition-all duration-300 hover:bg-white/25"
              style={{ minHeight: '52px' }}
            >
              enable permissions
            </button>

            <div className="flex gap-3 mt-4">
              <button 
                onClick={back} 
                className="flex-1 p-4 bg-white bg-opacity-10 rounded-xl text-base font-semibold active:scale-95 touch-manipulation transition-all duration-300"
                style={{ minHeight: '52px' }}
              >
                back
              </button>
              <button 
                className="flex-1 p-4 bg-teal-300 text-black rounded-xl active:scale-95 text-base font-semibold touch-manipulation shadow-lg shadow-teal-300/30 transition-all duration-300"
                style={{ minHeight: '52px' }}
              >
                finish
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-center gap-2.5 mt-8 sm:mt-10 pb-safe sm:pb-0">
          {[1,2,3,4,5].map(i => (
            <motion.div 
              key={i} 
              className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full transition-all duration-300 ${i === step ? "bg-teal-300 scale-125" : "bg-white bg-opacity-30"}`}
              animate={i === step ? { scale: [1.25, 1.4, 1.25] } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
        </div>

      </div>

    </div>
  )
}

