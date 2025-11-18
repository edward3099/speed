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
    <div 
      ref={containerRef} 
      className={className}
      style={{
        background: 'transparent',
        border: 'none',
        outline: 'none',
      }}
    >
      {sparkles.map((sparkle) => (
        <motion.div
          key={sparkle.id}
          className="pointer-events-none absolute"
          style={{
            left: `${sparkle.x}%`,
            top: `${sparkle.y}%`,
            width: '12px',
            height: '12px',
            background: 'transparent',
            border: '0',
            outline: '0',
            boxShadow: 'none',
            margin: '0',
            padding: '0',
            clipPath: 'none',
            WebkitAppearance: 'none',
            appearance: 'none',
            display: 'block',
            overflow: 'visible',
            position: 'absolute',
            zIndex: 1,
          }}
          initial={{
            opacity: 0,
          }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1.2, 0],
            rotate: [0, 15, -15, 0],
          }}
          transition={{
            duration: sparkle.duration,
            delay: sparkle.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full"
            style={{
              filter: `drop-shadow(0 0 4px ${colors.first}) drop-shadow(0 0 8px ${colors.first})`,
              border: '0',
              borderWidth: '0',
              borderStyle: 'none',
              borderColor: 'transparent',
              outline: '0',
              outlineWidth: '0',
              outlineStyle: 'none',
              outlineColor: 'transparent',
              boxShadow: 'none',
              background: 'transparent',
              backgroundColor: 'transparent',
              display: 'block',
              margin: '0',
              padding: '0',
              overflow: 'visible',
              position: 'relative',
            }}
          >
            <path
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              fill={colors.first}
              fillOpacity="0.9"
            />
          </svg>
        </motion.div>
      ))}
    </div>
  )
}

export { Sparkles }
