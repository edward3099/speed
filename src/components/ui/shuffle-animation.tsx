"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import { useEffect, useState } from "react"

interface ShuffleAnimationProps {
  profiles: string[]
  duration?: number
}

export function ShuffleAnimation({
  profiles,
  duration = 5000,
}: ShuffleAnimationProps) {
  const duplicatedProfiles = [...profiles, ...profiles]
  const [isMobile, setIsMobile] = useState(true)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Mobile: 120px card + 8px gap = 128px per card
  // Desktop: 192px card + 16px gap = 208px per card
  const cardWidth = isMobile ? 128 : 208
  const containerWidth = duplicatedProfiles.length * cardWidth

  return (
    <div className="relative w-full max-w-[280px] sm:max-w-md h-[200px] sm:h-80 rounded-xl sm:rounded-2xl overflow-hidden bg-white/5 border-2 border-teal-300/30 shadow-[0_0_40px_rgba(94,234,212,0.3)] mx-auto">
      {/* Animated border glow */}
      <motion.div
        className="absolute inset-0 rounded-xl sm:rounded-2xl"
        animate={{
          boxShadow: [
            "0 0 20px rgba(94,234,212,0.3), inset 0 0 20px rgba(94,234,212,0.1)",
            "0 0 40px rgba(94,234,212,0.5), inset 0 0 40px rgba(94,234,212,0.2)",
            "0 0 20px rgba(94,234,212,0.3), inset 0 0 20px rgba(94,234,212,0.1)",
          ],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <motion.div
        className="flex gap-2 sm:gap-4 h-full items-center"
        animate={{
          x: ["0%", "-50%"],
        }}
        transition={{
          duration: duration / 1000,
          ease: [0.43, 0.13, 0.23, 0.96],
        }}
        style={{
          width: `${containerWidth}px`,
        }}
      >
        {duplicatedProfiles.map((src, index) => (
          <motion.div
            key={index}
            className="relative flex-shrink-0 w-[120px] h-[160px] sm:w-48 sm:h-64 rounded-lg sm:rounded-xl overflow-hidden border-2 border-white/20"
            initial={{ opacity: 0.5 }}
            animate={{ 
              opacity: [0.5, 1, 0.5],
              scale: [0.95, 1, 0.95],
            }}
            transition={{
              duration: 0.5,
              repeat: Infinity,
              delay: index * 0.1,
            }}
          >
            <Image
              src={src}
              alt={`Profile ${index}`}
              fill
              className="object-cover"
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            
            {/* Shimmer effect */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
              animate={{
                x: ["-100%", "100%"],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: index * 0.2,
              }}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* Center indicator with pulsing effect */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <motion.div
          className="w-0.5 sm:w-1 h-full bg-teal-300/70 shadow-[0_0_10px_rgba(94,234,212,0.8)] sm:shadow-[0_0_20px_rgba(94,234,212,0.8)]"
          animate={{
            opacity: [0.7, 1, 0.7],
            boxShadow: [
              "0 0 10px rgba(94,234,212,0.8)",
              "0 0 20px rgba(94,234,212,1)",
              "0 0 10px rgba(94,234,212,0.8)",
            ],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Corner accents - smaller on mobile */}
      <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 w-2 h-2 sm:w-3 sm:h-3 bg-teal-300/50 rounded-full blur-sm" />
      <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 w-2 h-2 sm:w-3 sm:h-3 bg-teal-300/50 rounded-full blur-sm" />
      <div className="absolute bottom-1.5 left-1.5 sm:bottom-2 sm:left-2 w-2 h-2 sm:w-3 sm:h-3 bg-teal-300/50 rounded-full blur-sm" />
      <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 w-2 h-2 sm:w-3 sm:h-3 bg-teal-300/50 rounded-full blur-sm" />
    </div>
  )
}
