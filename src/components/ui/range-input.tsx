"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface RangeInputProps {
  min: number
  max: number
  value: number
  onChange: (value: number) => void
  label?: string
  className?: string
}

export function RangeInput({
  min,
  max,
  value,
  onChange,
  label,
  className,
}: RangeInputProps) {
  const percentage = ((value - min) / (max - min)) * 100

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && (
        <div className="flex items-center justify-between text-xs opacity-60 mb-0.5 sm:mb-1">
          <span className="text-xs">{label}</span>
          <span className="font-semibold text-teal-300 text-xs sm:text-sm">{value}</span>
        </div>
      )}
      <div className="relative py-3 sm:py-2 -mx-1 sm:mx-0">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-4 sm:h-2 bg-white/10 rounded-lg appearance-none cursor-pointer relative z-20 touch-manipulation"
          style={{
            background: `linear-gradient(to right, rgba(94,234,212,0.5) 0%, rgba(94,234,212,0.5) ${percentage}%, rgba(255,255,255,0.1) ${percentage}%, rgba(255,255,255,0.1) 100%)`,
            WebkitAppearance: 'none',
            touchAction: 'none',
          }}
        />
        {/* Custom thumb overlay - visual indicator only, positioned behind input */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 w-6 h-6 sm:w-4 sm:h-4 bg-teal-300/80 rounded-full shadow-lg pointer-events-none z-10"
          style={{
            left: `calc(${percentage}% - 12px)`,
          }}
          animate={{
            boxShadow: [
              "0 0 0 0 rgba(94,234,212,0.4)",
              "0 0 0 4px rgba(94,234,212,0)",
            ],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      </div>
    </div>
  )
}
