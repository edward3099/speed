"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"

interface Sparkle {
  id: number
  x: number
  y: number
  delay: number
  duration: number
}

interface SparklesProps {
  id?: string
  sparklesCount?: number
  className?: string
  colors?: {
    first: string
    second: string
  }
}

const Sparkles = ({
  id = "sparkles",
  sparklesCount = 20,
  className,
  colors = {
    first: "#5eead4",
    second: "#3b82f6",
  },
}: SparklesProps) => {
  const [sparkles, setSparkles] = useState<Sparkle[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const newSparkles: Sparkle[] = []
    for (let i = 0; i < sparklesCount; i++) {
      newSparkles.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        delay: Math.random() * 2,
        duration: 2 + Math.random() * 3,
      })
    }
    setSparkles(newSparkles)
  }, [sparklesCount])

  return (
    <div ref={containerRef} className={className}>
      {sparkles.map((sparkle) => (
        <motion.div
          key={sparkle.id}
          className="pointer-events-none absolute h-1 w-1"
          initial={{
            left: `${sparkle.x}%`,
            top: `${sparkle.y}%`,
            opacity: 0,
          }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1.5, 0],
          }}
          transition={{
            duration: sparkle.duration,
            delay: sparkle.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <div
            className="h-full w-full rounded-full"
            style={{
              background: `radial-gradient(circle, ${colors.first} 0%, ${colors.second} 100%)`,
              boxShadow: `0 0 6px ${colors.first}, 0 0 10px ${colors.first}`,
            }}
          />
        </motion.div>
      ))}
    </div>
  )
}

export { Sparkles }
