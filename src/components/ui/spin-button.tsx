"use client"

import { motion } from "framer-motion"
import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface SpinButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: "yes" | "pass"
  className?: string
  disabled?: boolean
}

export function SpinButton({
  children,
  onClick,
  variant = "pass",
  className,
  disabled = false,
}: SpinButtonProps) {
  const isYes = variant === "yes"

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex-1 px-3 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 rounded-2xl text-lg font-semibold transition-all duration-300",
        "relative",
        isYes ? "overflow-hidden" : "overflow-visible",
        isYes
          ? "bg-teal-300 text-black hover:bg-teal-200"
          : "bg-white/10 text-white hover:bg-white/20 border border-white/10",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      whileHover={!disabled ? { scale: 1.05, y: -2 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
    >
      {/* Shimmer effect for yes button */}
      {isYes && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          initial={{ x: "-100%" }}
          animate={{ x: ["100%", "100%"] }}
          transition={{
            duration: 2,
            repeat: Infinity,
            repeatDelay: 1,
            ease: "easeInOut",
          }}
        />
      )}
      <span className="relative z-10 whitespace-nowrap overflow-visible">{children}</span>
    </motion.button>
  )
}
