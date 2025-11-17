"use client"

import { useState, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import { Camera } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"

interface EditableProfilePictureProps {
  src: string
  alt: string
  onImageChange?: (file: File) => void
  size?: "sm" | "md" | "lg"
  className?: string
}

export function EditableProfilePicture({
  src,
  alt,
  onImageChange,
  size = "md",
  className,
}: EditableProfilePictureProps) {
  const [imageSrc, setImageSrc] = useState(src)
  const [isHovered, setIsHovered] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync with parent src prop
  useEffect(() => {
    setImageSrc(src)
  }, [src])

  const sizeClasses = {
    sm: "w-20 h-20",
    md: "w-32 h-32",
    lg: "w-40 h-40",
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImageSrc(reader.result as string)
      }
      reader.readAsDataURL(file)
      onImageChange?.(file)
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <motion.div
      className={cn("relative group", className)}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <div className={cn("relative rounded-full overflow-hidden border-2 border-white/20", sizeClasses[size])}>
        <Image
          src={imageSrc}
          alt={alt}
          fill
          className="object-cover"
        />
        
        {/* Overlay on hover */}
        <motion.div
          className="absolute inset-0 bg-black/60 flex items-center justify-center cursor-pointer"
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleClick}
        >
          <Camera className="w-6 h-6 text-white" />
        </motion.div>

        {/* Edit badge */}
        <motion.div
          className="absolute -bottom-1 -right-1 w-8 h-8 bg-teal-300 rounded-full flex items-center justify-center border-2 border-[#050810] cursor-pointer"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleClick}
        >
          <Camera className="w-4 h-4 text-black" />
        </motion.div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageChange}
        className="hidden"
      />
    </motion.div>
  )
}
