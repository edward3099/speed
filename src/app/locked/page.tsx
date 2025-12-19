"use client"

import { motion } from "framer-motion"

export default function LockedPage() {
  return (
    <div className="min-h-screen w-full bg-[#050810] text-white flex items-center justify-center px-4">
      <motion.div
        className="max-w-md w-full text-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <motion.div
          className="mb-8"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-3xl font-bold text-teal-300 mb-4">
            Speed Date is Currently Closed
          </h1>
          <p className="text-teal-200/80 text-lg">
            We're preparing for the next event. Check back soon!
          </p>
        </motion.div>

        <motion.div
          className="bg-white/5 rounded-lg p-6 border border-teal-500/20"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <p className="text-white/70 text-sm">
            The platform is temporarily locked for scheduled maintenance or event preparation.
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}
