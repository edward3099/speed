"use client"

import { motion } from "framer-motion"
import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface StatsCardProps {
  label: string
  value: string | number
  icon?: ReactNode
  delay?: number
  className?: string
}

export function StatsCard({
  label,
  value,
  icon,
  delay = 0,
  className,
}: StatsCardProps) {
  return (
    <motion.div
      className={cn(
        "p-4 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10",
        "hover:border-teal-300/50 hover:bg-white/10 transition-all duration-300",
        className
      )}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.4,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={{
        scale: 1.05,
        y: -4,
      }}
    >
      {icon && (
        <div className="text-teal-300 mb-2 flex items-center justify-center">
          {icon}
        </div>
      )}
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-sm opacity-70 text-white">{label}</div>
    </motion.div>
  )
}
