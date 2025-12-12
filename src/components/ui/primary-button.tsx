"use client"

import { motion } from "framer-motion"
import { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { ShimmerButton } from "@/components/magicui/shimmer-button"

interface PrimaryButtonProps {
  children: ReactNode
  onClick?: () => void
  className?: string
  size?: "sm" | "md" | "lg"
  variant?: "primary" | "secondary"
}

export function PrimaryButton({
  children,
  onClick,
  className,
  size = "md",
  variant = "primary",
}: PrimaryButtonProps) {
  const sizeClasses = {
    sm: "px-6 py-2.5 text-sm",
    md: "px-12 py-5 text-xl",
    lg: "px-16 py-6 text-2xl",
  }

  if (variant === "primary") {
    return (
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        <ShimmerButton
          onClick={onClick}
          className={cn(
            sizeClasses[size],
            "rounded-2xl font-semibold bg-teal-300 text-black hover:bg-teal-300 hover:text-black",
            className
          )}
          shimmerColor="#ffffff"
          background="rgba(94, 234, 212, 1)"
        >
          {children}
        </ShimmerButton>
      </motion.div>
    )
  }

  return (
    <motion.button
      onClick={onClick}
      className={cn(
        sizeClasses[size],
        "rounded-2xl font-semibold bg-white bg-opacity-10 text-white",
        "hover:bg-opacity-20 transition-all duration-300",
        "border border-white/10 hover:border-teal-300/50",
        className
      )}
      whileHover={{ scale: 1.05, y: -2 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      {children}
    </motion.button>
  )
}
