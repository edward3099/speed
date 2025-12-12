"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Heart, Calendar, Settings, Sparkles, TrendingUp } from "lucide-react"
import { motion } from "framer-motion"
import { DashboardCard } from "@/components/ui/dashboard-card"
import { PrimaryButton } from "@/components/ui/primary-button"
import { Modal } from "@/components/ui/modal"
import { QuickActionCard } from "@/components/ui/quick-action-card"
import { TextReveal } from "@/components/magicui/text-reveal"
import { EditableProfilePicture } from "@/components/ui/editable-profile-picture"
import { EditableBio } from "@/components/ui/editable-bio"

export default function dashboard() {
  const router = useRouter()
  const name = "jason"
  const [bio, setBio] = useState("i like good conversations and new experiences")
  const [profileImage, setProfileImage] = useState("")

  const [showMatches, setShowMatches] = useState(false)
  const [showEvents, setShowEvents] = useState(false)

  // Quick actions
  const quickActions = [
    {
      icon: Sparkles,
      title: "discover matches",
      description: "find new connections",
      onClick: () => router.push("/spin"),
    },
    {
      icon: TrendingUp,
      title: "view activity",
      description: "see your recent interactions",
      onClick: () => setShowMatches(true),
    },
    {
      icon: Settings,
      title: "preferences",
      description: "manage your settings",
      onClick: () => {},
    },
  ]

  return (
    <div className="min-h-screen w-full bg-[#050810] text-white safe-area-inset">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-[#050810] pointer-events-none" />
      <div className="fixed inset-0 bg-gradient-to-br from-teal-900/10 via-transparent to-blue-900/10 pointer-events-none" />

      <div className="relative z-10 px-4 sm:px-5 md:px-6 lg:px-12 py-safe sm:py-6 md:py-8 max-w-4xl mx-auto">
        {/* Header Section */}
        <motion.div
          className="mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex flex-col md:flex-row items-center md:items-start md:items-center gap-5 sm:gap-6 mb-6 sm:mb-8">
            {/* Profile Picture */}
            <EditableProfilePicture
              src={profileImage}
              alt={`${name}'s profile`}
              size="lg"
              onImageChange={(file) => {
                // Handle image upload - convert to data URL for preview
                const reader = new FileReader()
                reader.onloadend = () => {
                  setProfileImage(reader.result as string)
                  // Here you would typically upload to your backend/storage
                  // Example: await uploadImage(file)
                }
                reader.readAsDataURL(file)
              }}
            />

            {/* Name and Bio */}
            <div className="flex-1 w-full text-center md:text-left">
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-teal-300 mb-3 sm:mb-4">
                <TextReveal text={`welcome back ${name}`} />
              </h2>
              <EditableBio
                initialBio={bio}
                onBioChange={(newBio) => {
                  setBio(newBio)
                  // Here you would typically save to backend
                }}
              />
            </div>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-8 sm:mb-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
        >
          {quickActions.map((action, index) => {
            const IconComponent = action.icon
            return (
              <QuickActionCard
                key={action.title}
                icon={<IconComponent className="w-5 h-5 sm:w-6 sm:h-6 text-teal-300" />}
                title={action.title}
                description={action.description}
                onClick={action.onClick}
                delay={index * 0.1}
              />
            )
          })}
        </motion.div>

        {/* Primary CTA */}
        <motion.div
          className="flex justify-center mb-8 sm:mb-10"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 300 }}
        >
          <PrimaryButton
            onClick={() => router.push("/spin")}
            size="md"
            variant="primary"
            className="w-full sm:w-auto min-h-[52px] text-base sm:text-lg font-semibold touch-manipulation px-8"
          >
            start spin
          </PrimaryButton>
        </motion.div>

        {/* Dashboard Cards Grid */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 md:gap-6 pb-safe sm:pb-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
        >
          <DashboardCard
            onClick={() => setShowMatches(true)}
            delay={0.5}
            icon={<Heart className="w-8 h-8 text-teal-300" />}
            title="saved matches"
          >
            <p className="text-sm opacity-70 text-center">
              view your connections
            </p>
          </DashboardCard>

          <DashboardCard
            onClick={() => setShowEvents(true)}
            delay={0.6}
            icon={<Calendar className="w-8 h-8 text-teal-300" />}
            title="events"
          >
            <p className="text-sm opacity-70 text-center">
              upcoming speed dating events
            </p>
          </DashboardCard>
        </motion.div>
      </div>

      {/* Modals */}
      <Modal
        isOpen={showMatches}
        onClose={() => setShowMatches(false)}
        title="saved matches"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <Heart className="w-10 h-10 text-teal-300" />
          </div>
          <p className="opacity-80 text-center mb-6">
            no matches yet. start spinning to find connections!
          </p>
          <PrimaryButton
            onClick={() => {
              setShowMatches(false)
              router.push("/spin")
            }}
            size="sm"
            variant="primary"
          >
            start spinning
          </PrimaryButton>
        </div>
      </Modal>

      <Modal
        isOpen={showEvents}
        onClose={() => setShowEvents(false)}
        title="events"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <Calendar className="w-10 h-10 text-teal-300" />
          </div>
          <p className="opacity-80 text-center mb-6">
            no events available at the moment. check back soon!
          </p>
        </div>
      </Modal>
    </div>
  )
}
