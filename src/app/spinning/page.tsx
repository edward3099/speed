"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles as SparklesIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

/**
 * /spinning page
 * 
 * Shows spinning animation while user is in queue
 * Polls match status every 2 seconds
 * Redirects to /voting-window when matched
 */
export default function SpinningPage() {
  const router = useRouter()
  const supabase = createClient()
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const [isSpinning, setIsSpinning] = useState(true)

  // Poll for match status
  useEffect(() => {
    const pollStatus = async () => {
      try {
        const response = await fetch('/api/match/status')
        const data = await response.json()

        if (!response.ok) {
          console.error('Failed to get match status:', data.error)
          return
        }

        // If matched, redirect to voting window
        if (data.match?.match_id) {
          setIsSpinning(false)
          router.push(`/voting-window?matchId=${data.match.match_id}`)
          return
        }

        // If idle (not in queue), redirect back to spin
        if (data.state === 'idle') {
          setIsSpinning(false)
          router.push('/spin')
          return
        }
      } catch (error) {
        console.error('Error polling match status:', error)
      }
    }

    // Poll immediately, then every 2 seconds
    pollStatus()
    pollingRef.current = setInterval(pollStatus, 2000)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [router])

  return (
    <div className="min-h-screen w-full bg-[#050810] text-white flex items-center justify-center relative overflow-hidden">
      {/* Background layers */}
      <div className="fixed inset-0 bg-[#050810] pointer-events-none" />
      
      {/* Floating orbs */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-64 h-64 bg-teal-500/20 rounded-full blur-3xl pointer-events-none"
        animate={{
          x: [0, 50, 0],
          y: [0, -30, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Spin animation */}
      <AnimatePresence>
        {isSpinning && (
          <motion.div
            className="flex flex-col items-center justify-center z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="flex items-center justify-center"
              animate={{
                rotate: [0, 360],
                scale: [1, 1.1, 1]
              }}
              transition={{
                rotate: {
                  duration: 2,
                  repeat: Infinity,
                  ease: "linear"
                },
                scale: {
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut"
                }
              }}
            >
              <SparklesIcon className="w-32 h-32 sm:w-40 sm:h-40 text-teal-300" />
            </motion.div>
            <motion.p
              className="mt-8 text-lg sm:text-xl text-teal-300 opacity-80"
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              Finding your match...
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

