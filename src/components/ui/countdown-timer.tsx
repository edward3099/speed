"use client"

import { motion } from "framer-motion"
import { useEffect, useState, useRef } from "react"

interface CountdownTimerProps {
  initialSeconds: number
  onComplete?: () => void
  className?: string
  resetKey?: string | number
}

export function CountdownTimer({
  initialSeconds,
  onComplete,
  className,
  resetKey,
}: CountdownTimerProps) {
  const [seconds, setSeconds] = useState(initialSeconds)
  const onCompleteRef = useRef(onComplete)

  // Update ref when callback changes
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  // Reset timer when initialSeconds or resetKey changes
  useEffect(() => {
    setSeconds(initialSeconds)
  }, [initialSeconds, resetKey])

  useEffect(() => {
    if (seconds === 0) {
      // Use setTimeout to avoid calling during render
      setTimeout(() => {
        onCompleteRef.current?.()
      }, 0)
      return
    }

    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          // Use setTimeout to avoid calling during render
          setTimeout(() => {
            onCompleteRef.current?.()
          }, 0)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [seconds])

  return (
    <div className={className}>
      <motion.div
        key={seconds}
        initial={{ scale: 1.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        className="text-center"
      >
        <span className="text-xl sm:text-3xl md:text-4xl font-bold text-teal-300">{seconds}</span>
        <span className="text-lg sm:text-2xl md:text-3xl opacity-70 ml-1 sm:ml-1.5">s</span>
      </motion.div>
    </div>
  )
}
