"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Edit2, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface EditableBioProps {
  initialBio: string
  onBioChange?: (bio: string) => void
  className?: string
  maxLength?: number
}

export function EditableBio({
  initialBio,
  onBioChange,
  className,
  maxLength = 200,
}: EditableBioProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [bio, setBio] = useState(initialBio)
  const [tempBio, setTempBio] = useState(initialBio)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      )
    }
  }, [isEditing])

  const handleSave = () => {
    const trimmedBio = tempBio.trim()
    if (trimmedBio !== bio) {
      setBio(trimmedBio)
      onBioChange?.(trimmedBio)
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setTempBio(bio)
    setIsEditing(false)
  }

  return (
    <div className={cn("relative", className)}>
      <AnimatePresence mode="wait">
        {!isEditing ? (
          <motion.div
            key="display"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="group relative"
          >
            <p className="text-lg opacity-80 leading-relaxed max-w-2xl pr-8">
              {bio || "no bio yet. click to add one..."}
            </p>
            <button
              onClick={() => setIsEditing(true)}
              className="absolute top-0 right-0 p-2 rounded-lg bg-white/5 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all"
            >
              <Edit2 className="w-4 h-4 text-teal-300" />
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="editing"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            <textarea
              ref={textareaRef}
              value={tempBio}
              onChange={(e) => setTempBio(e.target.value)}
              maxLength={maxLength}
              className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white placeholder-white/40 resize-none"
              rows={3}
              placeholder="tell us about yourself..."
            />
            <div className="flex items-center justify-between">
              <span className="text-xs opacity-60">
                {tempBio.length}/{maxLength}
              </span>
              <div className="flex gap-2">
                <motion.button
                  onClick={handleCancel}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <X className="w-4 h-4 text-white" />
                </motion.button>
                <motion.button
                  onClick={handleSave}
                  className="p-2 rounded-lg bg-teal-300 hover:bg-teal-200 transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Check className="w-4 h-4 text-black" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
