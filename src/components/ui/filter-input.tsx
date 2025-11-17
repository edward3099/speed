"use client"

import { motion } from "framer-motion"
import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface FilterInputProps {
  label: string
  icon?: ReactNode
  children: ReactNode
  className?: string
}

export function FilterInput({ label, icon, children, className }: FilterInputProps) {
  return (
    <motion.div
      className={cn("flex flex-col gap-2", className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <label className="flex items-center gap-2 text-sm font-medium opacity-80">
        {icon && <span className="text-teal-300">{icon}</span>}
        {label}
      </label>
      {children}
    </motion.div>
  )
}
