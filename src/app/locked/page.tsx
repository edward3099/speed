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
          <p className="text-teal-200/80 text-lg mb-4">
            We're preparing for the next event. Check back soon!
          </p>
        </motion.div>

        <motion.div
          className="bg-white/5 rounded-lg p-6 border border-teal-500/20 mb-4"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <p className="text-white/70 text-sm mb-3">
            The platform is temporarily locked for scheduled maintenance or event preparation.
          </p>
          <div className="mt-4 pt-4 border-t border-teal-500/20">
            <p className="text-teal-300 font-semibold mb-2">Speed Date Schedule:</p>
            <p className="text-white/80 text-sm">
              Speed dates run from <span className="text-teal-200 font-medium">8pm to 10pm</span> on:
            </p>
            <ul className="text-white/80 text-sm mt-2 list-disc list-inside space-y-1">
              <li>Fridays</li>
              <li>Saturdays</li>
              <li>Sundays</li>
            </ul>
          </div>
        </motion.div>

        <motion.div
          className="text-center"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <p className="text-white/60 text-sm">
            Need help? Email us at{' '}
            <a 
              href="mailto:support@meetchristians.live" 
              className="text-teal-300 hover:text-teal-200 underline transition-colors"
            >
              support@meetchristians.live
            </a>
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}
