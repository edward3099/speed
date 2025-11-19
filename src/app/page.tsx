"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { AnimatedGradientBackground } from "@/components/magicui/animated-gradient-background"
import { Sparkles } from "@/components/magicui/sparkles"
import { TextReveal } from "@/components/magicui/text-reveal"
import { ShimmerButton } from "@/components/magicui/shimmer-button"
import { PhotoGrid } from "@/components/ui/photo-grid"
import { EditableProfilePicture } from "@/components/ui/editable-profile-picture"
import { EditableBio } from "@/components/ui/editable-bio"
import { FilterInput } from "@/components/ui/filter-input"
import { RangeInput } from "@/components/ui/range-input"
import { LocationAutocomplete } from "@/components/ui/location-autocomplete"
import { createClient } from "@/lib/supabase/client"
import { User, Calendar, MessageSquare, MapPin, Users } from "lucide-react"

export default function landing() {
  const router = useRouter()
  const supabase = createClient()
  const [showModal, setShowModal] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [mode, setMode] = useState("signin")
  const [onboardingStep, setOnboardingStep] = useState(1)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [retypePassword, setRetypePassword] = useState("")
  const [authError, setAuthError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [onboardingLoading, setOnboardingLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [signUpSession, setSignUpSession] = useState<any>(null)
  
  // Onboarding form data
  const [onboardingData, setOnboardingData] = useState({
    name: "",
    gender: "",
    age: 25,
    bio: "",
    photo: "https://i.pravatar.cc/150?img=15",
    country: "",
    city: "",
    location: "",
    latitude: 0,
    longitude: 0,
    minAge: 18,
    maxAge: 30,
    maxDistance: 50
  })

  // Handle onboarding completion
  const handleOnboardingComplete = async () => {
    setOnboardingLoading(true)
    try {
      console.log('Starting onboarding completion...', onboardingData)
      
      // Get user ID - prefer stored ID from sign-up, then try session
      let userId = currentUserId
      
      if (!userId) {
        // Try getSession first
        const { data: sessionData } = await supabase.auth.getSession()
        if (sessionData?.session?.user) {
          userId = sessionData.session.user.id
          console.log('User ID found via getSession:', userId)
        } else {
          // Fallback to getUser
          console.log('getSession failed, trying getUser...')
          const { data: userData } = await supabase.auth.getUser()
          if (userData?.user) {
            userId = userData.user.id
            console.log('User ID found via getUser:', userId)
          } else {
            console.error('Both getSession and getUser failed')
            setAuthError("Please sign in first. Session expired.")
            setOnboardingLoading(false)
            return
          }
        }
      } else {
        console.log('Using stored user ID from sign-up:', userId)
      }
      
      if (!userId) {
        console.error('No user ID found')
        setAuthError("Please sign in first")
        setOnboardingLoading(false)
        return
      }
      
      // Ensure session is available for RLS policies
      // RLS requires auth.uid() to match the id we're inserting
      let activeSession = null
      
      // Try getSession first
      const { data: sessionData } = await supabase.auth.getSession()
      activeSession = sessionData?.session
      
      // If no session, try using the stored sign-up session
      if (!activeSession && signUpSession) {
        console.log('Using stored sign-up session')
        activeSession = signUpSession
      }
      
      // If still no session, wait a bit and try again
      if (!activeSession) {
        console.log('No session found, waiting and retrying...')
        await new Promise(resolve => setTimeout(resolve, 500))
        const { data: retrySessionData } = await supabase.auth.getSession()
        activeSession = retrySessionData?.session
      }
      
      // Final check - if still no session, we can't proceed
      if (!activeSession) {
        console.error('No session available for RLS policies after retries')
        setAuthError("Session not available. If you just signed up, please confirm your email first, then sign in. If you've already confirmed, please try signing in again.")
        setOnboardingLoading(false)
        return
      }
      
      console.log('Session available for RLS:', activeSession.user?.id)
      
      // Verify the session user ID matches our userId
      if (activeSession.user?.id !== userId) {
        console.warn('Session user ID mismatch, but proceeding:', {
          sessionUserId: activeSession.user?.id,
          storedUserId: userId
        })
        // Update userId to match session if different
        if (activeSession.user?.id) {
          userId = activeSession.user.id
          console.log('Updated userId to match session:', userId)
        }
      }

      let photoUrl = onboardingData.photo

      // Upload profile picture if it's a data URL (base64)
      if (onboardingData.photo.startsWith('data:image')) {
        try {
          // Convert data URL to blob
          const response = await fetch(onboardingData.photo)
          const blob = await response.blob()
          
          // Generate unique filename
          const fileExt = blob.type.split('/')[1] || 'jpg'
          const fileName = `${userId}-${Date.now()}.${fileExt}`
          const filePath = `${userId}/${fileName}`

          // Upload to Supabase Storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('profile-pictures')
            .upload(filePath, blob, {
              cacheControl: '3600',
              upsert: true
            })

          if (uploadError) {
            throw uploadError
          }

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('profile-pictures')
            .getPublicUrl(filePath)

          photoUrl = publicUrl
        } catch (error: any) {
          console.error('Error uploading image:', error)
          // Continue with default photo if upload fails
        }
      }

      // Save profile to database
      const profileData = {
        id: userId,
        name: onboardingData.name,
        age: onboardingData.age,
        bio: onboardingData.bio,
        photo: photoUrl,
        location: onboardingData.location || (onboardingData.city && onboardingData.country ? `${onboardingData.city}, ${onboardingData.country}` : onboardingData.country || ''),
        latitude: onboardingData.latitude,
        longitude: onboardingData.longitude,
        gender: onboardingData.gender,
        onboarding_completed: true,
        is_online: true,
        last_active_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      
      console.log('Saving profile with data:', profileData)
      console.log('User ID being used:', userId)
      console.log('Current session user:', activeSession?.user?.id)
      
      // Note: RLS policy will enforce auth.uid() = id, so we proceed with userId from sign-up
      
      // Try to insert first, if it fails due to conflict, update instead
      let profileResult = null
      let profileError = null
      
      // First, try to check if profile exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single()
      
      if (existingProfile) {
        // Profile exists, use update
        console.log('Profile exists, updating...')
        const { data, error } = await supabase
          .from('profiles')
          .update(profileData)
          .eq('id', userId)
          .select()
        profileResult = data
        profileError = error
      } else {
        // Profile doesn't exist, use insert
        console.log('Profile does not exist, inserting...')
        const { data, error } = await supabase
          .from('profiles')
          .insert(profileData)
          .select()
        profileResult = data
        profileError = error
      }

      if (profileError) {
        // Log all error properties
        const errorDetails: any = {}
        for (const key in profileError) {
          errorDetails[key] = (profileError as any)[key]
        }
        console.error('Profile error details:', errorDetails)
        console.error('Profile error type:', typeof profileError)
        console.error('Profile error constructor:', profileError.constructor?.name)
        console.error('Profile error stringified:', JSON.stringify(profileError, null, 2))
        
        // Try to get message from error
        const errorMessage = profileError.message || 
                           (profileError as any).error_description || 
                           (profileError as any).msg ||
                           String(profileError) ||
                           'Failed to save profile'
        
        throw new Error(errorMessage)
      }
      
      console.log('Profile saved successfully:', profileResult)

      // Save preferences to database
      const preferencesData = {
        user_id: userId,
        min_age: onboardingData.minAge,
        max_age: onboardingData.maxAge,
        max_distance: onboardingData.maxDistance,
        gender_preference: 'all', // Default to 'all' for now, will add UI later
        updated_at: new Date().toISOString()
      }
      
      console.log('Saving preferences with data:', preferencesData)
      
      const { data: preferencesResult, error: preferencesError } = await supabase
        .from('user_preferences')
        .upsert(preferencesData)
        .select()

      if (preferencesError) {
        console.error('Preferences error details:', {
          message: preferencesError.message,
          details: preferencesError.details,
          hint: preferencesError.hint,
          code: preferencesError.code,
          fullError: JSON.stringify(preferencesError, null, 2)
        })
        throw new Error(preferencesError.message || `Failed to save preferences: ${JSON.stringify(preferencesError)}`)
      }
      
      console.log('Preferences saved successfully:', preferencesResult)

      console.log('Onboarding completed successfully, redirecting...')
      
      // Onboarding complete - redirect to spin page
      setShowOnboarding(false)
      setOnboardingLoading(false)
      
      // Use setTimeout to ensure state updates before navigation
      setTimeout(() => {
        router.push('/spin')
      }, 100)
    } catch (error: any) {
      console.error('Error completing onboarding:', {
        message: error?.message,
        error: error,
        stack: error?.stack,
        fullError: JSON.stringify(error, null, 2)
      })
      setAuthError(error?.message || error?.toString() || "Failed to save profile. Please try again.")
      setOnboardingLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full relative bg-[#050810] text-white overflow-hidden safe-area-inset">
      {/* Base deep navy background */}
      <div className="absolute inset-0 bg-[#050810]" />

      {/* Magic UI Animated Gradient Background */}
      <AnimatedGradientBackground />

      {/* Sparkles effect */}
      <Sparkles 
        sparklesCount={15}
        className="absolute inset-0 pointer-events-none"
        colors={{
          first: "#5eead4",
          second: "#3b82f6"
        }}
      />

      {/* Mobile-first symmetrical design - S.P.A.R.K. Framework */}
      <div className="relative z-10 flex flex-col md:flex-row items-center justify-center md:justify-between px-4 sm:px-5 md:px-8 lg:px-12 xl:px-16 max-w-7xl mx-auto pt-safe sm:pt-12 md:pt-16 lg:pt-20 pb-safe sm:pb-12 md:pb-16 gap-10 sm:gap-12 md:gap-14 lg:gap-16">
        {/* Hero content - Perfectly centered on mobile */}
        <motion.div 
          className="flex flex-col gap-5 sm:gap-6 md:gap-7 max-w-xl w-full text-center md:text-left"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Main heading with enhanced mobile typography */}
          <motion.h1 
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-teal-300 drop-shadow-lg leading-[1.1] mb-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
          >
            <TextReveal text="meet someone new" />
          </motion.h1>

          {/* Description with refined spacing */}
          <motion.p 
            className="text-base sm:text-lg md:text-xl opacity-75 leading-relaxed max-w-[600px] mx-auto md:mx-0 mb-6 sm:mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 0.75, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            a clean modern way to connect through short face to face conversations. simple flow and smooth interactions.
          </motion.p>

          {/* Action buttons - Perfectly symmetrical on mobile */}
          <motion.div 
            className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center md:justify-start"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <ShimmerButton
              onClick={() => setShowModal(true)}
              className="px-8 py-4 sm:py-5 rounded-2xl text-base sm:text-lg font-bold bg-teal-300 text-black hover:bg-teal-300 hover:text-black w-full sm:w-auto touch-manipulation active:scale-95 transition-transform shadow-lg shadow-teal-300/40"
              shimmerColor="#ffffff"
              background="rgba(94, 234, 212, 1)"
            >
              start now
            </ShimmerButton>

            <motion.button
              className="px-8 py-4 sm:py-5 rounded-2xl text-base sm:text-lg font-bold bg-white/10 text-white backdrop-blur-sm border border-white/20 transition-all hover:bg-white/20 hover:border-white/30 active:scale-95 w-full sm:w-auto touch-manipulation"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
            >
              learn more
            </motion.button>
          </motion.div>
        </motion.div>

        {/* Photo grid - Perfectly centered and symmetrical */}
        <motion.div 
          className="relative flex items-center justify-center w-full md:w-1/2"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="w-full max-w-[300px] sm:max-w-[360px] md:max-w-md lg:max-w-lg">
            <PhotoGrid
              photos={[
                { src: "https://i.pravatar.cc/200?img=12", alt: "Profile 1" },
                { src: "https://i.pravatar.cc/200?img=20", alt: "Profile 2" },
                { src: "https://i.pravatar.cc/200?img=33", alt: "Profile 3" },
                { src: "https://i.pravatar.cc/200?img=5", alt: "Profile 4" },
              ]}
              className="w-full"
            />
          </div>
        </motion.div>
        </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-95 backdrop-blur-sm flex items-start sm:items-center justify-center z-30 fade-in p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-[calc(100vw-1.5rem)] sm:max-w-md bg-[#0a0f1f] border border-white/30 p-5 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl md:rounded-3xl shadow-2xl flex flex-col gap-4 sm:gap-5 md:gap-6 mt-4 sm:mt-0 max-h-[calc(100vh-2rem)] overflow-y-auto">
            {/* Close button */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all duration-200 touch-manipulation"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="flex justify-center gap-6 text-teal-300 font-semibold text-lg mb-2">
              <button
                className={`px-4 py-2 rounded-lg transition-all duration-300 touch-manipulation ${mode === "signin" ? "bg-teal-300/30 text-teal-300 border border-teal-300/50" : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10"}`}
                onClick={() => setMode("signin")}
              >
                sign in
              </button>
              <button
                className={`px-4 py-2 rounded-lg transition-all duration-300 touch-manipulation ${mode === "signup" ? "bg-teal-300/30 text-teal-300 border border-teal-300/50" : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10"}`}
                onClick={() => setMode("signup")}
              >
                sign up
              </button>
            </div>

            <input
              type="email"
              placeholder="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setAuthError(null)
              }}
              className="w-full p-4 rounded-xl bg-white bg-opacity-20 text-white outline-none text-base focus:bg-white/25 focus:border-2 focus:border-teal-300/50 transition-all duration-300 touch-manipulation"
              style={{ minHeight: '52px' }}
            />

            <input
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setAuthError(null)
              }}
              className="w-full p-4 rounded-xl bg-white bg-opacity-20 text-white outline-none text-base focus:bg-white/25 focus:border-2 focus:border-teal-300/50 transition-all duration-300 touch-manipulation"
              style={{ minHeight: '52px' }}
            />

            {mode === "signup" && (
            <input
              type="password"
              placeholder="retype password"
              value={retypePassword}
              onChange={(e) => {
                setRetypePassword(e.target.value)
                setAuthError(null)
              }}
              className="w-full p-4 rounded-xl bg-white bg-opacity-20 text-white outline-none text-base focus:bg-white/25 focus:border-2 focus:border-teal-300/50 transition-all duration-300 touch-manipulation"
              style={{ minHeight: '52px' }}
            />
            )}

            {authError && (
              <p className="text-red-400 text-sm px-2">{authError}</p>
            )}

            <button 
              onClick={async () => {
                setAuthError(null)
                setLoading(true)

                try {
                  if (mode === "signup") {
                    // Validate passwords match
                    if (password !== retypePassword) {
                      setAuthError("Passwords do not match")
                      setLoading(false)
                      return
                    }

                    // Validate password length
                    if (password.length < 6) {
                      setAuthError("Password must be at least 6 characters")
                      setLoading(false)
                      return
                    }

                    // Sign up
                    const { data, error } = await supabase.auth.signUp({
                      email,
                      password,
                    })

                    if (error) {
                      setAuthError(error.message)
                      setLoading(false)
                      return
                    }

                    // If sign up successful, show onboarding
                    if (data.user) {
                      // Store user ID and session from sign-up response
                      setCurrentUserId(data.user.id)
                      
                      // Supabase signUp returns session in data.session
                      // If email confirmation is required, session will be null
                      if (data.session) {
                        setSignUpSession(data.session)
                        console.log('Sign up successful with session, user ID:', data.user.id)
                        setShowModal(false)
                        setOnboardingStep(1)
                      } else {
                        // Email confirmation required - no session yet
                        console.log('Sign up successful but email confirmation required, user ID:', data.user.id)
                        setAuthError("Please check your email to confirm your account before continuing. After confirming, you can sign in to complete onboarding.")
                        setLoading(false)
                        // Don't proceed to onboarding - user needs to confirm email first
                        return
                      }
                      setOnboardingData({
                        name: "",
                        gender: "",
                        age: 25,
                        bio: "",
                        photo: "https://i.pravatar.cc/150?img=15",
                        country: "",
                        city: "",
                        location: "",
                        latitude: 0,
                        longitude: 0,
                        minAge: 18,
                        maxAge: 30,
                        maxDistance: 50
                      })
                      setShowOnboarding(true)
                    }
                  } else {
                    // Sign in
                    const { data, error } = await supabase.auth.signInWithPassword({
                      email,
                      password,
                    })

                    if (error) {
                      setAuthError(error.message)
                      setLoading(false)
                      return
                    }

                    if (data.user) {
                      // Store user ID
                      setCurrentUserId(data.user.id)
                      // Check if user has completed onboarding
                      const { data: profile } = await supabase
                        .from('profiles')
                        .select('onboarding_completed')
                        .eq('id', data.user.id)
                        .single()

                      if (profile?.onboarding_completed) {
                        // Redirect to spin page
                        router.push('/spin')
                      } else {
                        // Show onboarding
                        setShowModal(false)
                        setOnboardingStep(1)
                        setOnboardingData({
                          name: "",
                          gender: "",
                          age: 25,
                          bio: "",
                          photo: "https://i.pravatar.cc/150?img=15",
                          country: "",
                          city: "",
                          location: "",
                          latitude: 0,
                          longitude: 0,
                          minAge: 18,
                          maxAge: 30,
                          maxDistance: 50
                        })
                        setShowOnboarding(true)
                      }
                    }
                  }
                } catch (error: any) {
                  setAuthError(error.message || "An error occurred")
                } finally {
                  setLoading(false)
                }
              }}
              disabled={loading}
              className="bg-teal-300 text-black p-4 rounded-xl font-semibold active:scale-95 text-base touch-manipulation shadow-lg shadow-teal-300/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ minHeight: '52px' }}
            >
              {loading ? "loading..." : "continue"}
            </button>

            <button
              className="text-teal-300 text-center text-sm py-2 touch-manipulation active:opacity-70 transition-opacity"
              onClick={() => setShowModal(false)}
            >
              close
            </button>

          </div>
        </div>
      )}

      {/* Onboarding Modal - Multi-step */}
      {showOnboarding && (
        <div className="fixed inset-0 bg-black bg-opacity-95 backdrop-blur-sm flex items-start sm:items-center justify-center z-30 fade-in p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-[calc(100vw-1.5rem)] sm:max-w-md bg-[#0a0f1f] border border-white/30 p-4 sm:p-5 md:p-6 rounded-xl sm:rounded-2xl md:rounded-3xl shadow-2xl flex flex-col gap-3 sm:gap-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            {/* Progress indicator */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((step) => (
                  <div
                    key={step}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      step <= onboardingStep
                        ? "bg-teal-300 flex-1"
                        : "bg-white/10 w-1.5"
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-white/60">{onboardingStep}/8</span>
            </div>

            {/* Close button */}
            <button
              onClick={() => {
                setShowOnboarding(false)
                setOnboardingStep(1)
              }}
              className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all duration-200 touch-manipulation"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Step content */}
            <AnimatePresence mode="wait">
              {/* Step 1: Name */}
              {onboardingStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-3 sm:gap-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-5 h-5 text-teal-300" />
                    <h2 className="text-lg sm:text-xl font-semibold text-teal-300">what's your name?</h2>
                  </div>
                  <input
                    type="text"
                    value={onboardingData.name}
                    onChange={(e) => setOnboardingData({ ...onboardingData, name: e.target.value })}
                    placeholder="enter your name"
                    className="w-full p-3 sm:p-4 rounded-xl bg-white bg-opacity-20 text-white outline-none text-base focus:bg-white/25 focus:border-2 focus:border-teal-300/50 transition-all duration-300 touch-manipulation"
                    style={{ minHeight: '48px' }}
                  />
                </motion.div>
              )}

              {/* Step 2: Gender */}
              {onboardingStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-3 sm:gap-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-5 h-5 text-teal-300" />
                    <h2 className="text-lg sm:text-xl font-semibold text-teal-300">what's your gender?</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    {[
                      { value: "male", label: "Male" },
                      { value: "female", label: "Female" },
                      { value: "non-binary", label: "Non-binary" },
                      { value: "prefer_not_to_say", label: "Prefer not to say" }
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setOnboardingData({ ...onboardingData, gender: option.value })}
                        className={`px-4 py-3 sm:py-4 rounded-xl border-2 transition-all duration-300 text-sm sm:text-base font-semibold touch-manipulation active:scale-95 ${
                          onboardingData.gender === option.value
                            ? "bg-teal-300 text-black border-teal-300 shadow-lg shadow-teal-300/30"
                            : "bg-white/5 text-white border-white/10 hover:bg-white/10 hover:border-white/20"
                        }`}
                        style={{ minHeight: '48px' }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Step 3: Age */}
              {onboardingStep === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-3 sm:gap-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="w-5 h-5 text-teal-300" />
                    <h2 className="text-lg sm:text-xl font-semibold text-teal-300">how old are you?</h2>
                  </div>
                  <div className="py-2">
                    <RangeInput
                      min={18}
                      max={100}
                      value={onboardingData.age}
                      onChange={(val) => setOnboardingData({ ...onboardingData, age: val })}
                      label={`${onboardingData.age} years old`}
                    />
                  </div>
                </motion.div>
              )}

              {/* Step 4: Bio */}
              {onboardingStep === 4 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-3 sm:gap-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare className="w-5 h-5 text-teal-300" />
                    <h2 className="text-lg sm:text-xl font-semibold text-teal-300">tell us about yourself</h2>
                  </div>
                  <EditableBio
                    initialBio={onboardingData.bio || ""}
                    onBioChange={(bio) => setOnboardingData({ ...onboardingData, bio })}
                    className="min-h-[100px]"
                    maxLength={20}
                  />
                </motion.div>
              )}

              {/* Step 5: Profile Picture */}
              {onboardingStep === 5 && (
                <motion.div
                  key="step5"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-3 sm:gap-4 items-center"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-5 h-5 text-teal-300" />
                    <h2 className="text-lg sm:text-xl font-semibold text-teal-300">upload your photo</h2>
                  </div>
                  <EditableProfilePicture
                    src={onboardingData.photo}
                    alt="profile"
                    size="lg"
                    onImageChange={(file) => {
                      const reader = new FileReader()
                      reader.onloadend = () => {
                        setOnboardingData({ ...onboardingData, photo: reader.result as string })
                      }
                      reader.readAsDataURL(file)
                    }}
                  />
                </motion.div>
              )}

              {/* Step 6: Country */}
              {onboardingStep === 6 && (
                <motion.div
                  key="step6"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-3 sm:gap-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="w-5 h-5 text-teal-300" />
                    <h2 className="text-lg sm:text-xl font-semibold text-teal-300">what country are you in?</h2>
                  </div>
                  <LocationAutocomplete
                    type="country"
                    value={onboardingData.country}
                    onChange={(country) => {
                      setOnboardingData({
                        ...onboardingData,
                        country,
                      })
                    }}
                    placeholder="start typing your country..."
                  />
                </motion.div>
              )}

              {/* Step 7: City */}
              {onboardingStep === 7 && (
                <motion.div
                  key="step7"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-3 sm:gap-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="w-5 h-5 text-teal-300" />
                    <h2 className="text-lg sm:text-xl font-semibold text-teal-300">what city are you in?</h2>
                  </div>
                  <LocationAutocomplete
                    type="city"
                    country={onboardingData.country}
                    value={onboardingData.city}
                    onChange={(city, latitude, longitude) => {
                      setOnboardingData({
                        ...onboardingData,
                        city,
                        location: `${city}, ${onboardingData.country}`,
                        latitude,
                        longitude,
                      })
                    }}
                    placeholder="start typing your city..."
                  />
                  {onboardingData.latitude !== 0 && onboardingData.longitude !== 0 && (
                    <p className="text-xs text-teal-300/70 mt-1">
                      ✓ Location saved with coordinates
                    </p>
                  )}
                </motion.div>
              )}

              {/* Step 8: Preferences */}
              {onboardingStep === 8 && (
                <motion.div
                  key="step7"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-3 sm:gap-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-5 h-5 text-teal-300" />
                    <h2 className="text-lg sm:text-xl font-semibold text-teal-300">what are you looking for?</h2>
                  </div>
                  
                  {/* Age Range */}
                  <FilterInput
                    label="age range"
                    icon={<Users className="w-4 h-4" />}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <RangeInput
                          min={18}
                          max={onboardingData.maxAge}
                          value={onboardingData.minAge}
                          onChange={(val) => setOnboardingData({ ...onboardingData, minAge: val })}
                          label="minimum age"
                        />
                      </div>
                      <div className="text-lg opacity-60">-</div>
                      <div className="flex-1">
                        <RangeInput
                          min={onboardingData.minAge}
                          max={100}
                          value={onboardingData.maxAge}
                          onChange={(val) => setOnboardingData({ ...onboardingData, maxAge: val })}
                          label="maximum age"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-2 mt-2">
                      <div className="px-3 py-1.5 rounded-lg bg-teal-300/10 border border-teal-300/30 text-teal-300 text-sm font-semibold">
                        {onboardingData.minAge}
                      </div>
                      <span className="text-sm opacity-60">to</span>
                      <div className="px-3 py-1.5 rounded-lg bg-teal-300/10 border border-teal-300/30 text-teal-300 text-sm font-semibold">
                        {onboardingData.maxAge}
                      </div>
                    </div>
                  </FilterInput>

                  {/* Max Distance */}
                  <FilterInput
                    label="maximum distance"
                    icon={<MapPin className="w-4 h-4" />}
                  >
                    <RangeInput
                      min={1}
                      max={100}
                      value={onboardingData.maxDistance}
                      onChange={(val) => setOnboardingData({ ...onboardingData, maxDistance: val })}
                      label={`${onboardingData.maxDistance} miles`}
                    />
                  </FilterInput>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Navigation buttons */}
            <div className="flex gap-2 sm:gap-3 mt-2 pt-2 border-t border-white/10">
              <button
                onClick={() => {
                  if (onboardingStep > 1) {
                    setOnboardingStep(onboardingStep - 1)
                  } else {
                    setShowOnboarding(false)
                    setShowModal(true)
                  }
                }}
                className="flex-1 px-4 py-2.5 sm:py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition-all duration-300 text-sm sm:text-base font-semibold touch-manipulation"
                style={{ minHeight: '44px' }}
              >
                {onboardingStep === 1 ? "back" : "previous"}
              </button>
              <button
                onClick={() => {
                  // Validate gender on step 2
                  if (onboardingStep === 2) {
                    if (!onboardingData.gender) {
                      alert("Please select your gender")
                      return
                    }
                  }
                  
                  // Validate country on step 6
                  if (onboardingStep === 6) {
                    if (!onboardingData.country) {
                      alert("Please select a country from the suggestions")
                      return
                    }
                  }
                  // Validate city on step 7
                  if (onboardingStep === 7) {
                    if (!onboardingData.city || onboardingData.latitude === 0 || onboardingData.longitude === 0) {
                      alert("Please select a city from the suggestions")
                      return
                    }
                  }
                  
                  if (onboardingStep < 8) {
                    setOnboardingStep(onboardingStep + 1)
                  } else {
                    // Complete onboarding - save to Supabase
                    handleOnboardingComplete()
                  }
                }}
                disabled={onboardingLoading}
                className="flex-1 px-4 py-2.5 sm:py-3 rounded-xl bg-teal-300 text-black hover:bg-teal-200 active:scale-95 transition-all duration-300 text-sm sm:text-base font-semibold shadow-lg shadow-teal-300/30 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ minHeight: '44px' }}
              >
                {onboardingLoading ? "saving..." : onboardingStep === 8 ? "complete" : "continue"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
