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
        "w-full max-w-sm p-6 rounded-2xl bg-white/5 backdrop-blur-sm",
        "border border-white/10",
        className
      )}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={{ scale: 1.02 }}
    >
      {/* Selected indicator */}
      {isSelected && (
        <motion.div
          className="absolute -top-3 -right-3 w-10 h-10 bg-teal-300 rounded-full flex items-center justify-center shadow-lg"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
        >
          <Check className="w-6 h-6 text-black" />
        </motion.div>
      )}

      <div className="relative w-full h-64 rounded-xl overflow-hidden mb-4">
        <Image
          src={photo}
          alt={name}
          fill
          className="object-cover"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      </div>

      <h3 className="text-2xl font-bold text-white mb-2">
        {name}
        {age && <span className="text-teal-300">, {age}</span>}
      </h3>
      <p className="text-sm opacity-80 leading-relaxed">{bio}</p>
    </motion.div>
  )
}
