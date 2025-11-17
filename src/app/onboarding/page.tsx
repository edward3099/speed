"use client"

import { useState } from "react"

export default function onboarding() {
  const [step, setStep] = useState(1)
  const total = 5

  const next = () => {
    if (step < total) setStep(step + 1)
  }

  const back = () => {
    if (step > 1) setStep(step - 1)
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0f1f] text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#0f172a,_#0a0f1f)]" />

      <div className="absolute inset-0 soft-pulse" />

      <div className="relative z-10 w-full max-w-lg px-8 fade-in">

        {step === 1 && (
          <div className="flex flex-col gap-6">
            <h1 className="text-3xl font-bold text-teal-300">what is your name</h1>

            <input type="text" placeholder="your name" className="p-4 rounded-xl bg-white bg-opacity-20 outline-none text-white" />

            <button onClick={next} className="mt-4 bg-teal-300 text-black p-4 rounded-xl text-lg active:scale-95">next</button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            <h1 className="text-3xl font-bold text-teal-300">add a photo</h1>

            <button className="p-4 bg-white bg-opacity-20 rounded-xl">upload photo</button>

            <div className="flex gap-4 mt-4">
              <button onClick={back} className="flex-1 p-4 bg-white bg-opacity-10 rounded-xl">back</button>
              <button onClick={next} className="flex-1 p-4 bg-teal-300 text-black rounded-xl active:scale-95">next</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-6">
            <h1 className="text-3xl font-bold text-teal-300">select your age range</h1>

            <input type="range" min="18" max="60" className="w-full" />

            <div className="flex gap-4 mt-4">
              <button onClick={back} className="flex-1 p-4 bg-white bg-opacity-10 rounded-xl">back</button>
              <button onClick={next} className="flex-1 p-4 bg-teal-300 text-black rounded-xl active:scale-95">next</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-6">
            <h1 className="text-3xl font-bold text-teal-300">select interests</h1>

            <div className="grid grid-cols-2 gap-4">
              <button className="p-3 bg-white bg-opacity-20 rounded-xl">music</button>
              <button className="p-3 bg-white bg-opacity-20 rounded-xl">travel</button>
              <button className="p-3 bg-white bg-opacity-20 rounded-xl">fitness</button>
              <button className="p-3 bg-white bg-opacity-20 rounded-xl">movies</button>
            </div>

            <div className="flex gap-4 mt-4">
              <button onClick={back} className="flex-1 p-4 bg-white bg-opacity-10 rounded-xl">back</button>
              <button onClick={next} className="flex-1 p-4 bg-teal-300 text-black rounded-xl active:scale-95">next</button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-6">
            <h1 className="text-3xl font-bold text-teal-300">camera and mic</h1>

            <p className="opacity-80">allow access to continue</p>

            <button className="p-4 bg-white bg-opacity-20 rounded-xl">enable permissions</button>

            <div className="flex gap-4 mt-4">
              <button onClick={back} className="flex-1 p-4 bg-white bg-opacity-10 rounded-xl">back</button>
              <button className="flex-1 p-4 bg-teal-300 text-black rounded-xl active:scale-95">finish</button>
            </div>
          </div>
        )}

        <div className="flex justify-center gap-2 mt-10">
          {[1,2,3,4,5].map(i => (
            <div key={i} className={`w-3 h-3 rounded-full ${i === step ? "bg-teal-300" : "bg-white bg-opacity-30"}`} />
          ))}
        </div>

      </div>

    </div>
  )
}

