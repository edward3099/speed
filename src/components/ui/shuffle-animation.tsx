"use client"

import { motion } from "framer-motion"
import Image from "next/image"

interface ShuffleAnimationProps {
  profiles: string[]
  duration?: number
}

export function ShuffleAnimation({
  profiles,
  duration = 5000,
}: ShuffleAnimationProps) {
  const duplicatedProfiles = [...profiles, ...profiles]

  return (
    <div className="relative w-full max-w-md h-80 rounded-2xl overflow-hidden bg-white/5 border border-white/10">
      <motion.div
        className="flex gap-4 h-full"
        animate={{
          x: ["0%", "-50%"],
        }}
        transition={{
          duration: duration / 1000,
          ease: [0.43, 0.13, 0.23, 0.96],
        }}
        style={{
          width: `${duplicatedProfiles.length * 200}px`,
        }}
      >
        {duplicatedProfiles.map((src, index) => (
          <motion.div
            key={index}
            className="relative flex-shrink-0 w-48 h-64 rounded-xl overflow-hidden"
            initial={{ opacity: 0.5 }}
            animate={{ opacity: [0.5, 1, 0.5] }}
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
            {/* Shimmer effect */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
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

      {/* Center indicator */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-1 h-full bg-teal-300/50 shadow-[0_0_20px_rgba(94,234,212,0.5)]" />
      </div>
    </div>
  )
}
