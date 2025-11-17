"use client"

import { useEffect, useState } from "react"

export default function spin() {
  const profiles = [
    "https://i.pravatar.cc/200?img=12",
    "https://i.pravatar.cc/200?img=20",
    "https://i.pravatar.cc/200?img=33",
    "https://i.pravatar.cc/200?img=5",
    "https://i.pravatar.cc/200?img=45"
  ]

  const user = {
    name: "jason",
    bio: "i like good conversations and new experiences",
    photo: "https://i.pravatar.cc/200?img=15"
  }

  const [started, setStarted] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [selected, setSelected] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const [minAge, setMinAge] = useState("18")
  const [maxAge, setMaxAge] = useState("30")
  const [location, setLocation] = useState("")
  const [countdown, setCountdown] = useState(10)
  const [userVote, setUserVote] = useState(null)

  const startSpin = () => {
    setUserVote(null)           // reset check mark every new spin
    setRevealed(false)
    setSpinning(true)
    setStarted(true)
    setTimeout(() => {
      setSpinning(false)
      const pick = Math.floor(Math.random() * profiles.length)
      setSelected(pick)
      setTimeout(() => {
        setRevealed(true)
      }, 300)
    }, 5000)
  }

  useEffect(() => {
    if (!revealed) return

    setCountdown(10)
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === 1) {
          clearInterval(interval)
          // after countdown ends, check result
          if (userVote === "yes") {
            const otherYes = Math.random() < 0.5
            if (otherYes) {
              window.location.href = "/match"
            } else {
              setRevealed(false)
              startSpin()
            }
          } else {
            setRevealed(false)
            startSpin()
          }
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [revealed])

  return (
    <div className="min-h-screen w-full bg-[#0a0f1f] text-white px-6 flex items-center justify-center relative">
      {/* filter button top left */}
      <button
        onClick={() => setShowFilters(true)}
        className="absolute top-20 left-6 px-4 py-2 rounded-xl bg-white bg-opacity-10 text-sm z-10"
      >
        filters
      </button>

      {!started && (
        <button
          onClick={startSpin}
          className="absolute inset-0 m-auto h-14 w-56 bg-teal-300 text-black rounded-2xl text-xl font-semibold flex items-center justify-center active:scale-95 transition"
          style={{ top: "50%", transform: "translateY(-50%)" }}
        >
          start spin
        </button>
      )}

      {started && (
        <div className="w-full flex flex-col md:flex-row items-center justify-center gap-12">
          {/* left side user */}
          <div className="w-full md:w-1/2 flex flex-col items-center text-center gap-6 fade-in relative">
            {userVote === "yes" && (
              <div className="absolute -top-10 right-1/2 translate-x-1/2 text-teal-300 text-4xl font-bold">
                ✓
              </div>
            )}
            <img src={user.photo} className="w-40 h-40 rounded-2xl object-cover" alt={user.name} />
            <h2 className="text-3xl font-bold text-teal-300">{user.name}</h2>
            <p className="opacity-80 max-w-xs leading-relaxed">{user.bio}</p>
          </div>

          {/* right side */}
          <div className="w-full md:w-1/2 flex flex-col items-center">
            {spinning && (
              <div className="shuffle-frame fade-in">
                <div className="shuffle-track">
                  {profiles.concat(profiles).map((src, index) => (
                    <img key={index} src={src} className="shuffle-img" alt={`Profile ${index}`} />
                  ))}
                </div>
              </div>
            )}

            {revealed && (
              <div className="w-full max-w-sm fade-in flex flex-col items-center gap-6 relative">
                {/* vote bar */}
                <div className="text-center text-lg font-semibold text-teal-300 absolute -top-10">
                  vote • {countdown}s
                </div>

                {/* profile card */}
                <div className="profile-card">
                  <img
                    src={profiles[selected]}
                    className="rounded-xl w-full h-44 object-cover"
                    alt="Selected profile"
                  />
                  <h3 className="text-2xl font-bold mt-4">alex, 24</h3>
                  <p className="opacity-80 mt-1 text-center">
                    enjoys deep chats music and new experiences
                  </p>
                </div>

                {/* buttons */}
                <div className="flex gap-4 w-full">
                  {/* pass */}
                  <button
                    className="spin-btn pass-btn"
                    onClick={() => {
                      setUserVote("pass")
                      setRevealed(false)
                      startSpin()
                    }}
                  >
                    pass
                  </button>

                  {/* yes */}
                  <button
                    className="spin-btn yes-btn"
                    onClick={() => {
                      setUserVote("yes")
                    }}
                  >
                    yes
                  </button>
                </div>

              </div>
            )}

          </div>

        </div>
      )}

      {/* filter modal */}
      {showFilters && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center fade-in">
          <div className="bg-white bg-opacity-10 p-8 rounded-3xl w-full max-w-sm flex flex-col gap-5">
            <h2 className="text-center text-2xl font-bold text-teal-300">
              filters
            </h2>

            <div className="flex flex-col gap-3">
              <label className="opacity-80">age range</label>
              <div className="flex gap-3">
                <input
                  type="number"
                  value={minAge}
                  onChange={e => setMinAge(e.target.value)}
                  className="filter-input"
                />
                <input
                  type="number"
                  value={maxAge}
                  onChange={e => setMaxAge(e.target.value)}
                  className="filter-input"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <label className="opacity-80">location</label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                className="filter-input"
              />
            </div>

            <button
              onClick={() => setShowFilters(false)}
              className="mt-4 bg-teal-300 text-black py-3 rounded-xl font-semibold active:scale-95 transition"
            >
              apply
            </button>

          </div>
        </div>
      )}

    </div>
  )
}
