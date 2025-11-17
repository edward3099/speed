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
      <div className="grid grid-cols-2 gap-5">
        {photos.map((photo, index) => (
          <motion.div
            key={index}
            className={index % 2 === 1 ? "mt-8" : ""}
            variants={{
              hidden: { opacity: 0, y: 30 },
              visible: {
                opacity: 1,
                y: 0,
                transition: {
                  duration: 0.6,
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
