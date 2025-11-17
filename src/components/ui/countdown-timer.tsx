"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useEffect, useState } from "react"

interface CountdownTimerProps {
  initialSeconds: number
  onComplete?: () => void
  className?: string
  key?: string | number
}

export function CountdownTimer({
  initialSeconds,
  onComplete,
  className,
  key,
}: CountdownTimerProps) {
  const [seconds, setSeconds] = useState(initialSeconds)

  useEffect(() => {
    setSeconds(initialSeconds)
  }, [initialSeconds, key])

  useEffect(() => {
    if (seconds === 0) {
      onComplete?.()
      return
    }

    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          onComplete?.()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [seconds, onComplete])

  return (
    <div className={className}>
      <motion.div
        key={seconds}
        initial={{ scale: 1.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        className="text-center"
      >
        <span className="text-2xl font-bold text-teal-300">{seconds}</span>
        <span className="text-lg opacity-70 ml-1">s</span>
      </motion.div>
    </div>
  )
}
