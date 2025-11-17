"use client"

import { motion } from "framer-motion"

export function AnimatedGradientBackground() {
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      animate={{
        background: [
          "radial-gradient(at 40% 20%, rgba(94, 234, 212, 0.12) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(59, 130, 246, 0.1) 0px, transparent 50%), radial-gradient(at 0% 50%, rgba(94, 234, 212, 0.08) 0px, transparent 50%)",
          "radial-gradient(at 60% 30%, rgba(94, 234, 212, 0.15) 0px, transparent 50%), radial-gradient(at 20% 10%, rgba(59, 130, 246, 0.12) 0px, transparent 50%), radial-gradient(at 80% 60%, rgba(94, 234, 212, 0.1) 0px, transparent 50%)",
          "radial-gradient(at 40% 20%, rgba(94, 234, 212, 0.12) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(59, 130, 246, 0.1) 0px, transparent 50%), radial-gradient(at 0% 50%, rgba(94, 234, 212, 0.08) 0px, transparent 50%)",
        ],
      }}
      transition={{
        duration: 20,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  )
}
