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
    <div className="relative w-full max-w-md h-80 rounded-2xl overflow-hidden bg-white/5 border-2 border-teal-300/30 shadow-[0_0_40px_rgba(94,234,212,0.3)]">
      {/* Animated border glow */}
      <motion.div
        className="absolute inset-0 rounded-2xl"
        animate={{
          boxShadow: [
            "0 0 40px rgba(94,234,212,0.3), inset 0 0 40px rgba(94,234,212,0.1)",
            "0 0 60px rgba(94,234,212,0.5), inset 0 0 60px rgba(94,234,212,0.2)",
            "0 0 40px rgba(94,234,212,0.3), inset 0 0 40px rgba(94,234,212,0.1)",
          ],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

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
            className="relative flex-shrink-0 w-48 h-64 rounded-xl overflow-hidden border-2 border-white/20"
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
          className="w-1 h-full bg-teal-300/70 shadow-[0_0_20px_rgba(94,234,212,0.8)]"
          animate={{
            opacity: [0.7, 1, 0.7],
            boxShadow: [
              "0 0 20px rgba(94,234,212,0.8)",
              "0 0 40px rgba(94,234,212,1)",
              "0 0 20px rgba(94,234,212,0.8)",
            ],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Corner accents */}
      <div className="absolute top-2 left-2 w-3 h-3 bg-teal-300/50 rounded-full blur-sm" />
      <div className="absolute top-2 right-2 w-3 h-3 bg-teal-300/50 rounded-full blur-sm" />
      <div className="absolute bottom-2 left-2 w-3 h-3 bg-teal-300/50 rounded-full blur-sm" />
      <div className="absolute bottom-2 right-2 w-3 h-3 bg-teal-300/50 rounded-full blur-sm" />
    </div>
  )
}
