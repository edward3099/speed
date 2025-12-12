"use client"

import { motion } from "framer-motion"
import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface DashboardCardProps {
  children: ReactNode
  onClick?: () => void
  className?: string
  delay?: number
  icon?: ReactNode
  title?: string
}

export function DashboardCard({
  children,
  onClick,
  className,
  delay = 0,
  icon,
  title,
}: DashboardCardProps) {
  return (
    <motion.button
      className={cn(
        "relative group w-full p-6 rounded-2xl bg-white bg-opacity-5 backdrop-blur-sm",
        "border border-white/10 hover:border-teal-300/50",
        "transition-all duration-300",
        "flex flex-col items-center justify-center gap-3",
        "hover:bg-opacity-10",
        className
      )}
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={{
        scale: 1.02,
        y: -4,
      }}
      whileTap={{
        scale: 0.98,
      }}
    >
      {/* Glow effect on hover */}
      <motion.div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: "radial-gradient(circle at center, rgba(94, 234, 212, 0.15) 0%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />

      {/* Icon */}
      {icon && (
        <motion.div
          className="relative z-10"
          whileHover={{ scale: 1.1, rotate: 5 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
        >
          {icon}
        </motion.div>
      )}

      {/* Title */}
      {title && (
        <span className="relative z-10 text-lg font-semibold text-white group-hover:text-teal-300 transition-colors">
          {title}
        </span>
      )}

      {/* Content */}
      <div className="relative z-10 w-full">{children}</div>
    </motion.button>
  )
}
