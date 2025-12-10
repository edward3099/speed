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
  // Filter out empty/null photos and placeholder services
  const validProfiles = profiles.filter(photo => {
    if (!photo || typeof photo !== 'string') return false
    const trimmed = photo.trim()
    if (trimmed === '') return false
    // Filter out pravatar and other placeholder services
    if (trimmed.includes('pravatar.cc')) return false
    if (trimmed.includes('placeholder')) return false
    return true
  })
  // If no valid profiles, use a placeholder
  const profilesToUse = validProfiles.length > 0 ? validProfiles : []
  const duplicatedProfiles = [...profilesToUse, ...profilesToUse]
  const [isMobile, setIsMobile] = useState(true)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Mobile: 70px card + 4px gap = 74px per card (optimized for mobile)
  // Desktop: 192px card + 16px gap = 208px per card
  const cardWidth = isMobile ? 74 : 208
  const containerWidth = duplicatedProfiles.length * cardWidth

  return (
    <div className="relative w-full max-w-[160px] sm:max-w-md h-[110px] sm:h-80 rounded-md sm:rounded-2xl overflow-hidden bg-white/5 border border-teal-300/30 shadow-[0_0_20px_rgba(94,234,212,0.2)] sm:shadow-[0_0_40px_rgba(94,234,212,0.3)] mx-auto">
      {/* Animated border glow - subtle on mobile */}
      <motion.div
        className="absolute inset-0 rounded-md sm:rounded-2xl"
        animate={{
          boxShadow: [
            "0 0 10px rgba(94,234,212,0.2), inset 0 0 10px rgba(94,234,212,0.05)",
            "0 0 20px rgba(94,234,212,0.3), inset 0 0 20px rgba(94,234,212,0.1)",
            "0 0 10px rgba(94,234,212,0.2), inset 0 0 10px rgba(94,234,212,0.05)",
          ],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <motion.div
        className="flex gap-1 sm:gap-4 h-full items-center"
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
        {duplicatedProfiles.length > 0 ? (
          duplicatedProfiles.map((src, index) => (
            <motion.div
              key={index}
              className="relative flex-shrink-0 w-[70px] h-[100px] sm:w-48 sm:h-64 rounded sm:rounded-xl overflow-hidden border border-white/20 sm:border-2"
              initial={{ opacity: 0.6 }}
              animate={{ 
                opacity: [0.6, 1, 0.6],
                scale: [0.96, 1, 0.96],
              }}
              transition={{
                duration: 0.4,
                repeat: Infinity,
                delay: index * 0.08,
              }}
            >
              <Image
                src={src}
                alt={`Profile ${index}`}
                fill
                sizes="(max-width: 640px) 70px, 192px"
                className="object-cover"
                unoptimized={src.includes('supabase.co')}
                onError={(e) => {
                  // Hide broken images
                  const target = e.currentTarget as HTMLImageElement
                  if (target) {
                    target.style.display = 'none'
                  }
                }}
              />
            {/* Gradient overlay - lighter on mobile */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent sm:from-black/40" />
            
            {/* Shimmer effect - subtle on mobile */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent sm:via-white/30"
              animate={{
                x: ["-100%", "100%"],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: index * 0.15,
              }}
            />
          </motion.div>
          ))
        ) : (
          <div className="relative flex-shrink-0 w-[70px] h-[100px] sm:w-48 sm:h-64 rounded sm:rounded-xl overflow-hidden border border-white/20 sm:border-2 flex items-center justify-center bg-transparent">
            {/* No placeholder - empty state */}
          </div>
        )}
      </motion.div>

      {/* Center indicator with pulsing effect - thinner on mobile */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <motion.div
          className="w-px sm:w-1 h-full bg-teal-300/60 sm:bg-teal-300/70 shadow-[0_0_8px_rgba(94,234,212,0.6)] sm:shadow-[0_0_20px_rgba(94,234,212,0.8)]"
          animate={{
            opacity: [0.6, 0.9, 0.6],
            boxShadow: [
              "0 0 8px rgba(94,234,212,0.6)",
              "0 0 15px rgba(94,234,212,0.9)",
              "0 0 8px rgba(94,234,212,0.6)",
            ],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Corner accents - minimal on mobile */}
      <div className="absolute top-1 left-1 sm:top-2 sm:left-2 w-1.5 h-1.5 sm:w-3 sm:h-3 bg-teal-300/40 sm:bg-teal-300/50 rounded-full blur-[2px] sm:blur-sm" />
      <div className="absolute top-1 right-1 sm:top-2 sm:right-2 w-1.5 h-1.5 sm:w-3 sm:h-3 bg-teal-300/40 sm:bg-teal-300/50 rounded-full blur-[2px] sm:blur-sm" />
      <div className="absolute bottom-1 left-1 sm:bottom-2 sm:left-2 w-1.5 h-1.5 sm:w-3 sm:h-3 bg-teal-300/40 sm:bg-teal-300/50 rounded-full blur-[2px] sm:blur-sm" />
      <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 w-1.5 h-1.5 sm:w-3 sm:h-3 bg-teal-300/40 sm:bg-teal-300/50 rounded-full blur-[2px] sm:blur-sm" />
    </div>
  )
}
