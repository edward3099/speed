"use client"

import { motion, AnimatePresence } from "framer-motion"
import { ReactNode } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            transition={{ duration: 0.2 }}
          />

          {/* Modal - Mobile: Bottom sheet style, Desktop: Centered */}
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none overflow-y-auto">
            <motion.div
              className={cn(
                // Mobile: Full width bottom sheet with rounded top corners
                "relative bg-gradient-to-b from-white/15 via-white/10 to-white/10 backdrop-blur-2xl",
                "rounded-t-3xl sm:rounded-2xl md:rounded-3xl",
                "w-full sm:w-auto sm:max-w-md md:max-w-lg",
                "p-3 sm:p-5 md:p-6 lg:p-8",
                "border-t sm:border border-white/20 shadow-2xl",
                "pointer-events-auto",
                // Mobile: Max height with safe area - reduced for mobile
                "max-h-[85vh] sm:max-h-[85vh] overflow-y-auto",
                // Mobile: Slide up animation
                className
              )}
              initial={{ opacity: 0, y: "100%", scale: 1 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: "100%", scale: 0.95 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 35,
                mass: 0.8,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Mobile: Drag handle indicator */}
              <div className="sm:hidden flex justify-center mb-3 pt-2">
                <motion.div
                  className="w-12 h-1.5 bg-white/30 rounded-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                />
              </div>

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-2 right-2 sm:top-4 sm:right-4 p-1.5 sm:p-2 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 transition-all duration-200 group z-10 touch-manipulation"
                style={{ minWidth: '40px', minHeight: '40px' }}
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 text-white group-active:scale-90 transition-transform" />
              </button>

              {/* Title */}
              {title && (
                <motion.h2
                  className="text-base sm:text-xl md:text-2xl font-bold text-teal-300 text-center mb-3 sm:mb-5 md:mb-6 pr-8 sm:pr-12"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, type: "spring", stiffness: 300 }}
                >
                  {title}
                </motion.h2>
              )}

              {/* Content */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
                className="space-y-3 sm:space-y-5 md:space-y-6"
              >
                {children}
              </motion.div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
