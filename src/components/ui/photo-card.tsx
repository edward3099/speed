"use client"

import { motion } from "framer-motion"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface PhotoCardProps {
  src: string
  alt: string
  className?: string
  delay?: number
}

export function PhotoCard({ src, alt, className, delay = 0 }: PhotoCardProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <motion.div
      className={cn("relative group", className)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.6,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      {/* Glow effect on hover */}
      <motion.div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: "radial-gradient(circle, rgba(94, 234, 212, 0.2) 0%, transparent 70%)",
          filter: "blur(20px)",
        }}
        animate={{
          scale: isHovered ? 1.1 : 1,
        }}
        transition={{ duration: 0.3 }}
      />

      {/* Image container with micro tilt */}
      <motion.div
        className="relative overflow-hidden rounded-2xl w-40 h-40 md:w-44 md:h-44"
        whileHover={{
          scale: 1.05,
          rotate: 2,
          y: -8,
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 20,
        }}
      >
        <motion.img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          animate={{
            scale: isHovered ? 1.1 : 1,
          }}
          transition={{
            duration: 0.4,
            ease: "easeOut",
          }}
        />

        {/* Shimmer overlay */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          initial={{ x: "-100%" }}
          animate={{
            x: isHovered ? "100%" : "-100%",
          }}
          transition={{
            duration: 0.6,
            ease: "easeInOut",
          }}
        />
      </motion.div>

      {/* Border glow */}
      <motion.div
        className="absolute inset-0 rounded-2xl border-2 border-teal-300/0 group-hover:border-teal-300/50 transition-colors duration-300"
        style={{
          boxShadow: isHovered
            ? "0 0 20px rgba(94, 234, 212, 0.4), inset 0 0 20px rgba(94, 234, 212, 0.1)"
            : "none",
        }}
      />
    </motion.div>
  )
}
