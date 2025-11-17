"use client"

import { motion } from "framer-motion"
import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface QuickActionCardProps {
  icon: ReactNode
  title: string
  description?: string
  onClick?: () => void
  delay?: number
  className?: string
}

export function QuickActionCard({
  icon,
  title,
  description,
  onClick,
  delay = 0,
  className,
}: QuickActionCardProps) {
  return (
    <motion.button
      onClick={onClick}
      className={cn(
        "group relative p-4 rounded-xl bg-white/5 backdrop-blur-sm",
        "border border-white/10 hover:border-teal-300/50",
        "transition-all duration-300 text-left",
        "hover:bg-white/10",
        className
      )}
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
      {/* Glow effect */}
      <motion.div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: "radial-gradient(circle at center, rgba(94, 234, 212, 0.1) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 flex items-start gap-4">
        <motion.div
          className="flex-shrink-0 p-3 rounded-lg bg-teal-300/10 group-hover:bg-teal-300/20 transition-colors"
          whileHover={{ scale: 1.1, rotate: 5 }}
        >
          {icon}
        </motion.div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white group-hover:text-teal-300 transition-colors mb-1">
            {title}
          </h3>
          {description && (
            <p className="text-sm opacity-70 line-clamp-2">
              {description}
            </p>
          )}
        </div>
      </div>
    </motion.button>
  )
}
