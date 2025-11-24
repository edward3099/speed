"use client"

import { motion } from "framer-motion"
import { useEffect, useState, useRef } from "react"

interface SynchronizedCountdownTimerProps {
  startTimestamp: string // ISO timestamp from server
  initialSeconds: number
  onComplete?: () => void
  className?: string
}

export function SynchronizedCountdownTimer({
  startTimestamp,
  initialSeconds,
  onComplete,
  className,
}: SynchronizedCountdownTimerProps) {
  const [seconds, setSeconds] = useState(initialSeconds)
  const onCompleteRef = useRef(onComplete)

  // Update ref when callback changes
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  // Calculate countdown based on server timestamp
  useEffect(() => {
    if (!startTimestamp) return

    const calculateRemaining = () => {
      const now = new Date().getTime()
      const startTime = new Date(startTimestamp).getTime()
      const elapsed = Math.floor((now - startTime) / 1000) // seconds elapsed
      const remaining = Math.max(0, initialSeconds - elapsed)
      return remaining
    }

    // Calculate initial countdown
    const initialRemaining = calculateRemaining()
    setSeconds(initialRemaining)

    // If countdown already completed, call onComplete
    if (initialRemaining <= 0) {
      setTimeout(() => {
        onCompleteRef.current?.()
      }, 0)
      return
    }

    // Update countdown every 100ms for smooth display
    const timer = setInterval(() => {
      const remaining = calculateRemaining()
      
      if (remaining <= 0) {
        clearInterval(timer)
        setSeconds(0)
        setTimeout(() => {
          onCompleteRef.current?.()
        }, 0)
      } else {
        setSeconds(remaining)
      }
    }, 100) // Update every 100ms for better synchronization

    return () => clearInterval(timer)
  }, [startTimestamp, initialSeconds])

  return (
    <div 
      className={className}
      style={{
        background: 'transparent',
        border: 'none',
        outline: 'none',
        boxShadow: 'none',
      }}
    >
      <motion.div
        key={seconds}
        initial={{ scale: 1.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        className="text-center"
        style={{
          background: 'transparent',
          border: '0',
          outline: '0',
          boxShadow: 'none',
          margin: '0',
          padding: '0',
          clipPath: 'none',
          WebkitAppearance: 'none',
          appearance: 'none',
          visibility: 'visible',
          display: 'block',
        }}
      >
        <motion.span 
          className="text-sm sm:text-3xl md:text-4xl font-extrabold text-teal-300"
          style={{
            visibility: 'visible',
            display: 'inline-block',
          }}
          animate={{
            textShadow: [
              "0 0 15px rgba(94,234,212,0.7)",
              "0 0 30px rgba(94,234,212,1)",
              "0 0 15px rgba(94,234,212,0.7)",
            ],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {seconds}
        </motion.span>
        <span 
          className="text-sm sm:text-3xl md:text-4xl opacity-70 ml-0.5 sm:ml-1"
          style={{
            visibility: 'visible',
            display: 'inline-block',
          }}
        >
          s
        </span>
      </motion.div>
    </div>
  )
}





