"use client"

import { useState, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import { Camera } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"

interface EditableProfilePictureProps {
  src?: string | null
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
  // Helper function to check if src is valid (not empty, not pravatar, not just whitespace)
  const isValidImageSrc = (imgSrc: string | null | undefined): imgSrc is string => {
    if (!imgSrc || typeof imgSrc !== 'string') return false
    const trimmed = imgSrc.trim()
    if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return false
    if (imgSrc.includes('pravatar.cc')) return false
    // Must be a valid URL or data URL
    if (!trimmed.startsWith('http') && !trimmed.startsWith('data:image') && !trimmed.startsWith('/')) return false
    return true
  }

  // Initialize state - only set if src is valid, otherwise empty string
  const [imageSrc, setImageSrc] = useState<string>(() => {
    return isValidImageSrc(src) ? src : ''
  })
  const [isHovered, setIsHovered] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync with parent src prop - filter out invalid images
  useEffect(() => {
    if (isValidImageSrc(src)) {
      setImageSrc(src)
    } else {
      setImageSrc('') // Always clear invalid images
    }
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
        {isValidImageSrc(imageSrc) ? (
          <Image
            key={`img-${Date.now()}-${imageSrc.substring(0, 30)}`} // Force re-render with timestamp (aggressive cache busting)
            src={imageSrc}
            alt={alt}
            fill
            sizes="(max-width: 640px) 80px, (max-width: 768px) 120px, 160px"
            className="object-cover"
            placeholder="empty" // Explicitly disable placeholder per Next.js docs
            unoptimized={imageSrc.startsWith('data:')} // Disable optimization for data URLs
            priority={false} // Don't prioritize placeholder images
            onError={(e) => {
              // If image fails to load, clear it immediately
              console.log('❌ Image failed to load, clearing:', imageSrc)
              const target = e.currentTarget as HTMLImageElement
              if (target) {
                target.style.display = 'none' // Hide broken image immediately
                target.src = '' // Clear src to prevent retry
              }
              setImageSrc('')
            }}
            onLoad={() => {
              // Verify loaded image is not a placeholder
              if (imageSrc.includes('pravatar.cc')) {
                console.log('⚠️ Detected pravatar image loaded, clearing')
                setImageSrc('')
              }
            }}
          />
        ) : (
          <div 
            className="w-full h-full bg-transparent flex items-center justify-center cursor-pointer"
            key="empty-state"
            onClick={handleClick}
          >
            {/* Always show camera icon in empty state */}
            <Camera className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 text-teal-300/60" />
          </div>
        )}
        
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
