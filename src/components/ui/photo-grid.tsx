"use client"

import { motion } from "framer-motion"
import { PhotoCard } from "./photo-card"

interface PhotoGridProps {
  photos: Array<{ src: string; alt: string }>
  className?: string
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
}

export function PhotoGrid({ photos, className }: PhotoGridProps) {
  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-5 lg:gap-6 w-full">
        {photos.map((photo, index) => (
          <motion.div
            key={index}
            className={index % 2 === 1 ? "mt-8 sm:mt-10 md:mt-12 lg:mt-14" : ""}
            variants={{
              hidden: { opacity: 0, y: 30, scale: 0.9 },
              visible: {
                opacity: 1,
                y: 0,
                scale: 1,
                transition: {
                  duration: 0.6,
                  delay: index * 0.1,
                  ease: [0.22, 1, 0.36, 1],
                },
              },
            }}
          >
            <PhotoCard
              src={photo.src}
              alt={photo.alt}
              delay={index * 0.1}
            />
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
