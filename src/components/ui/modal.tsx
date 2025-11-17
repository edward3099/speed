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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-3 md:p-4 pointer-events-none overflow-y-auto">
            <motion.div
              className={cn(
                "relative bg-white/10 backdrop-blur-xl rounded-xl sm:rounded-2xl md:rounded-3xl p-3 sm:p-5 md:p-6 lg:p-8 max-w-[calc(100vw-1rem)] sm:max-w-md w-full mt-4 sm:mt-0",
                "border border-white/10 shadow-2xl",
                "pointer-events-auto",
                "max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-1.5rem)] overflow-y-auto",
                className
              )}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 p-1.5 sm:p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group z-10"
              >
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white group-hover:text-teal-300 transition-colors" />
              </button>

              {/* Title */}
              {title && (
                <motion.h2
                  className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-teal-300 text-center mb-3 sm:mb-4 md:mb-5 lg:mb-6 pr-6 sm:pr-8 md:pr-10"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  {title}
                </motion.h2>
              )}

              {/* Content */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
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
