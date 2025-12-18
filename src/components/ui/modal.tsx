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
  style?: React.CSSProperties
}

function Modal({ isOpen, onClose, title, children, className, style }: ModalProps) {
  // Check if className contains custom max-width - if so, exclude default max-w classes
  const classNameStr = className || ''
  const hasCustomMaxWidth = classNameStr && typeof classNameStr === 'string' && (
    classNameStr.includes('max-w-[') || 
    classNameStr.includes('max-w-') ||
    classNameStr.includes('!max-w-')
  )
  
  // Debug logging (remove in production)
  if (process.env.NODE_ENV === 'development' && className) {
    console.log('[Modal] className:', className, 'hasCustomMaxWidth:', hasCustomMaxWidth)
  }
  
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

          {/* Modal - Mobile: Centered with margins, Desktop: Centered */}
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none overflow-hidden p-4 sm:p-0">
            <motion.div
              className={cn(
                // Mobile: Centered modal with rounded corners and margins
                "relative bg-gradient-to-b from-white/15 via-white/10 to-white/10 backdrop-blur-2xl",
                "rounded-2xl sm:rounded-2xl md:rounded-3xl",
                // Mobile: Add horizontal margins for space from edges, Desktop: auto width
                "w-full max-w-[calc(100vw-2rem)] sm:w-auto",
                // Only apply default max-w if no custom max-w is provided
                // Explicitly check to avoid adding defaults when custom width is provided
                ...(hasCustomMaxWidth ? [] : ["sm:max-w-sm", "md:max-w-md"]),
                "p-2 sm:p-2.5 md:p-3",
                "border sm:border border-white/20 shadow-2xl",
                "pointer-events-auto",
                // Mobile: Use dynamic viewport height - fit without scroll, centered vertically
                "max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)]",
                "flex flex-col",
                // Prevent horizontal overflow
                "min-w-0",
                "overflow-hidden",
                // Mobile: Fade and scale animation (centered)
                // Custom className comes last - no conflicts if defaults excluded
                className
              )}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 35,
                mass: 0.8,
              }}
              onClick={(e) => e.stopPropagation()}
              style={style}
            >
              {/* Mobile: Drag handle indicator */}
              <div className="sm:hidden flex justify-center mb-2 pt-1">
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
                  className="text-sm sm:text-base md:text-lg font-bold text-teal-300 text-center mb-1.5 sm:mb-2 md:mb-2.5 pr-8 sm:pr-12 flex-shrink-0"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, type: "spring", stiffness: 300 }}
                >
                  {title}
                </motion.h2>
              )}

              {/* Content - Scrollable if needed but constrained to fit */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
                className="min-w-0 max-w-full overflow-x-hidden overflow-y-auto flex-1 min-h-0"
                style={{ maxHeight: 'calc(100dvh - 8rem)' }}
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

export { Modal }
