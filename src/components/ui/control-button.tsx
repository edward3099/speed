"use client"

import { motion } from "framer-motion"
import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface ControlButtonProps {
  icon: ReactNode
  label?: string
  onClick?: () => void
  variant?: "default" | "danger" | "success"
  className?: string
  disabled?: boolean
}

export function ControlButton({
  icon,
  label,
  onClick,
  variant = "default",
  className,
  disabled = false,
}: ControlButtonProps) {
  const variantStyles = {
    default: "bg-white/5 hover:bg-white/10 border-white/10",
    danger: "bg-red-500/10 hover:bg-red-500/20 border-red-500/30",
    success: "bg-green-500/10 hover:bg-green-500/20 border-green-500/30",
  }

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "p-3 rounded-xl border backdrop-blur-sm transition-all duration-300",
        "flex flex-col items-center gap-2 min-w-[80px]",
        variantStyles[variant],
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      whileHover={!disabled ? { scale: 1.05, y: -2 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
    >
      <div className={cn(
        "text-white",
        variant === "danger" && "text-red-400",
        variant === "success" && "text-green-400"
      )}>
        {icon}
      </div>
      {label && (
        <span className="text-xs font-medium opacity-80">{label}</span>
      )}
    </motion.button>
  )
}
