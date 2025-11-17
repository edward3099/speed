"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProfileCardSpinProps {
  photo: string
  name: string
  age?: number
  bio: string
  isSelected?: boolean
  className?: string
}

export function ProfileCardSpin({
  photo,
  name,
  age,
  bio,
  isSelected = false,
  className,
}: ProfileCardSpinProps) {
  return (
    <motion.div
      className={cn(
        "w-full max-w-[200px] sm:max-w-xs md:max-w-sm p-2 sm:p-5 md:p-6 rounded-lg sm:rounded-xl md:rounded-2xl bg-white/5 backdrop-blur-sm",
        "border border-white/10 relative overflow-hidden",
        isSelected && "border-teal-300/50",
        className
      )}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        y: 0,
        boxShadow: isSelected
          ? [
              "0 0 20px rgba(94,234,212,0.3)",
              "0 0 40px rgba(94,234,212,0.5)",
              "0 0 20px rgba(94,234,212,0.3)",
            ]
          : "none",
      }}
      transition={{
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
        boxShadow: {
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        },
      }}
      whileHover={{ scale: 1.02 }}
    >
      {/* Glow effect when selected */}
      {isSelected && (
        <motion.div
          className="absolute inset-0 -z-10 rounded-2xl"
          animate={{
            background: [
              "radial-gradient(circle at center, rgba(94,234,212,0.2) 0%, transparent 70%)",
              "radial-gradient(circle at center, rgba(94,234,212,0.4) 0%, transparent 70%)",
              "radial-gradient(circle at center, rgba(94,234,212,0.2) 0%, transparent 70%)",
            ],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}

      {/* Selected indicator */}
      {isSelected && (
        <motion.div
          className="absolute -top-3 -right-3 w-12 h-12 bg-teal-300 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(94,234,212,0.8)] z-20"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ 
            scale: [1, 1.1, 1],
            rotate: [0, 10, -10, 0],
          }}
          transition={{ 
            type: "spring", 
            stiffness: 200, 
            damping: 15,
            rotate: {
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            },
            scale: {
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            },
          }}
        >
          <Check className="w-7 h-7 text-black" />
        </motion.div>
      )}

      <div className="relative w-full h-32 sm:h-56 md:h-64 rounded-lg sm:rounded-xl overflow-hidden mb-2 sm:mb-3 md:mb-4 border-2 border-white/10">
        <Image
          src={photo}
          alt={name}
          fill
          className="object-cover"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        
        {/* Shimmer effect */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          animate={{
            x: ["-100%", "100%"],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            repeatDelay: 2,
            ease: "easeInOut",
          }}
        />
      </div>

      <motion.h3
        className="text-sm sm:text-xl md:text-2xl font-bold text-white mb-0.5 sm:mb-1 md:mb-2"
        animate={isSelected ? {
          textShadow: [
            "0 0 10px rgba(94,234,212,0.5)",
            "0 0 20px rgba(94,234,212,0.8)",
            "0 0 10px rgba(94,234,212,0.5)",
          ],
        } : {}}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        {name}
        {age && <span className="text-teal-300">, {age}</span>}
      </motion.h3>
      <p className="text-[10px] sm:text-sm opacity-80 leading-tight sm:leading-relaxed line-clamp-2 sm:line-clamp-none">{bio}</p>
    </motion.div>
  )
}
