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
