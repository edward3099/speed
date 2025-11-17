"use client"

import { motion } from "framer-motion"
import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface ControlPanelProps {
  children: ReactNode
  className?: string
  position?: "top" | "bottom" | "left" | "right"
}

export function ControlPanel({
  children,
  className,
  position = "bottom",
}: ControlPanelProps) {
  const positionClasses = {
    top: "top-6 left-1/2 -translate-x-1/2",
    bottom: "bottom-6 left-1/2 -translate-x-1/2",
    left: "left-6 top-1/2 -translate-y-1/2",
    right: "right-6 top-1/2 -translate-y-1/2",
  }

  // Override position if custom className is provided
  const finalPositionClasses = className?.includes("!top") || className?.includes("!right") || className?.includes("!left") || className?.includes("!bottom")
    ? ""
    : positionClasses[position]

  return (
    <motion.div
      className={cn(
        "absolute z-20 flex gap-3",
        finalPositionClasses,
        className
      )}
      initial={{ opacity: 0, y: position === "bottom" ? 20 : position === "top" ? -20 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      {children}
    </motion.div>
  )
}
