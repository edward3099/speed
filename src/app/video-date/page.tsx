"use client"

import { useEffect, useState } from "react"

import { useRouter } from "next/navigation"

export default function videoDate() {
  const router = useRouter()

  const [timeLeft, setTimeLeft] = useState(300) // 5 min

  const [showPostModal, setShowPostModal] = useState(false)
  const [showPassModal, setShowPassModal] = useState(false)
  const [showMatchModal, setShowMatchModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)

  const partner = {
    name: "alex",
    photo: "https://i.pravatar.cc/200?img=20",
    bio: "enjoys deep chats music and new experiences"
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          setShowPostModal(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s < 10 ? "0" + s : s}`
  }

  const endNow = () => {
    setShowPostModal(true)
  }

  return (
    <div className="min-h-screen w-full bg-[#0a0f1f] text-white flex flex-col items-center justify-between px-6 py-10 relative">
      {/* top bar countdown */}
      <div className="text-3xl font-bold text-teal-300 mb-8">
        {formatTime(timeLeft)}
      </div>

      {/* video layout */}
      <div className="flex flex-col md:flex-row items-center justify-center gap-6 w-full max-w-4xl">
        <div className="video-box">
          <div className="video-placeholder">your video</div>
        </div>

        <div className="video-box">
          <div className="video-placeholder">partner video</div>
        </div>

      </div>

      {/* bottom button */}
      <button
        className="bg-white bg-opacity-10 text-white px-10 py-4 rounded-2xl text-lg active:scale-95 transition mt-10"
        onClick={endNow}
      >
        end date
      </button>

      {/* post-date modal */}
      {showPostModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center fade-in">
          <div className="bg-white bg-opacity-10 p-8 rounded-3xl w-full max-w-sm flex flex-col items-center gap-6">
            <h2 className="text-2xl font-bold text-teal-300 text-center">
              how was your date
            </h2>

            <img
              src={partner.photo}
              className="w-24 h-24 rounded-2xl object-cover"
              alt={partner.name}
            />

            <h3 className="text-xl font-semibold">
              {partner.name}
            </h3>

            <p className="opacity-80 text-center text-sm leading-relaxed">
              {partner.bio}
            </p>

            <div className="flex gap-4 w-full mt-4">
              <button
                className="flex-1 bg-teal-300 text-black py-3 rounded-xl font-semibold active:scale-95 transition"
                onClick={() => {
                  const otherYes = Math.random() < 0.5
                  setShowPostModal(false)
                  if (otherYes) {
                    setShowMatchModal(true)
                    setTimeout(() => {
                      router.push("/spin")
                    }, 3000)
                  } else {
                    setShowRejectModal(true)
                    setTimeout(() => {
                      router.push("/spin")
                    }, 3000)
                  }
                }}
              >
                yes
              </button>

              <button
                className="flex-1 bg-white bg-opacity-10 py-3 rounded-xl active:scale-95 transition"
                onClick={() => {
                  setShowPostModal(false)
                  setShowPassModal(true)
                  setTimeout(() => {
                    router.push("/spin")
                  }, 2000)
                }}
              >
                pass
              </button>

            </div>

          </div>
        </div>
      )}

      {showPassModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center fade-in">
          <div className="bg-white bg-opacity-10 p-8 rounded-3xl w-full max-w-sm text-center">
            <h2 className="text-xl font-bold text-teal-300 mb-4">
              thanks for the date
            </h2>
            <p className="opacity-80">you can try another match</p>
          </div>
        </div>
      )}

      {showMatchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center fade-in">
          <div className="bg-white bg-opacity-10 p-8 rounded-3xl w-full max-w-sm flex flex-col items-center gap-4 text-center">
            <h2 className="text-2xl font-bold text-teal-300">
              you both want to see each other again
            </h2>
            <div className="flex gap-4 mt-2">
              <img src={partner.photo} className="w-20 h-20 rounded-2xl object-cover" alt={partner.name} />
              <img src="https://i.pravatar.cc/200?img=15" className="w-20 h-20 rounded-2xl object-cover" alt="Your profile" />
            </div>
            <p className="opacity-80 mt-2 text-sm">saving match…</p>
          </div>
        </div>
      )}

      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center fade-in">
          <div className="bg-white bg-opacity-10 p-8 rounded-3xl w-full max-w-sm text-center">
            <h2 className="text-xl font-bold text-teal-300 mb-4">
              they chose not to continue
            </h2>
            <p className="opacity-80">thanks for the date</p>
          </div>
        </div>
      )}

    </div>
  )
}
