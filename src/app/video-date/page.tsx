"use client"

import { useEffect, useState, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Video, Mic, MicOff, VideoOff, PhoneOff, Heart, X, Sparkles as SparklesIcon, CheckCircle2, Star, Flag, MessageSquare, Eye, EyeOff, Clock, Settings2, Volume2, Mail, Phone, Facebook, Instagram, Link as LinkIcon } from "lucide-react"
import { PrimaryButton } from "@/components/ui/primary-button"
import { Modal } from "@/components/ui/modal"
import { AnimatedGradientBackground } from "@/components/magicui/animated-gradient-background"
import { Sparkles } from "@/components/magicui/sparkles"
import { createClient } from "@/lib/supabase/client"
import { Room, RoomEvent, RemoteParticipant, Track } from "livekit-client"
import Image from "next/image"

interface Partner {
  id: string
  name: string
  photo: string
  bio: string
}

function VideoDateContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const matchId = searchParams.get('matchId')
  
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<Partner | null>(null)
  const [partner, setPartner] = useState<Partner | null>(null)
  const [videoDateId, setVideoDateId] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [localVideoTrack, setLocalVideoTrack] = useState<MediaStreamTrack | null>(null)
  const [localAudioTrack, setLocalAudioTrack] = useState<MediaStreamTrack | null>(null)
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<MediaStreamTrack | null>(null)
  const [remoteAudioTrack, setRemoteAudioTrack] = useState<MediaStreamTrack | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [partnerLeft, setPartnerLeft] = useState(false)
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const localAudioRef = useRef<HTMLAudioElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)

  const [countdown, setCountdown] = useState(15) // 15 sec pre-date countdown
  const [countdownComplete, setCountdownComplete] = useState(false)
  const [timeLeft, setTimeLeft] = useState(300) // 5 min
  const [showPostModal, setShowPostModal] = useState(false)
  const [showPassModal, setShowPassModal] = useState(false)
  const [showMatchModal, setShowMatchModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showContactModal, setShowContactModal] = useState(false)
  const [userContactDetails, setUserContactDetails] = useState({
    email: "",
    phone: "",
    instagram: "",
    whatsapp: ""
  })
  const [shareContactDetails, setShareContactDetails] = useState({
    email: false,
    phone: false,
    instagram: false,
    whatsapp: false
  })
  const [partnerContactDetails, setPartnerContactDetails] = useState<{
    email?: string
    phone?: string
    instagram?: string
    whatsapp?: string
  } | null>(null)
  const [rating, setRating] = useState<number | null>(null)
  const [feedback, setFeedback] = useState("")
  const [reportReason, setReportReason] = useState("")
  const [reportCategory, setReportCategory] = useState("")
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isPartnerMuted, setIsPartnerMuted] = useState(true)
  const [isPartnerVideoOff, setIsPartnerVideoOff] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [isTimerVisible, setIsTimerVisible] = useState(true)
  const [countdownMuted, setCountdownMuted] = useState(false)
  const [countdownVideoOff, setCountdownVideoOff] = useState(false)

  // Fetch match data and initialize video date
  useEffect(() => {
    const initializeVideoDate = async () => {
      if (!matchId) {
        router.push('/spin')
        return
      }

      try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
        if (authError || !authUser) {
          router.push('/')
          return
        }

        // Fetch match data
        const { data: match, error: matchError } = await supabase
          .from('matches')
          .select('*')
          .eq('id', matchId)
          .single()

        if (matchError || !match) {
          console.error('Error fetching match:', matchError)
          router.push('/spin')
          return
        }

        // Determine partner ID
        const partnerId = match.user1_id === authUser.id ? match.user2_id : match.user1_id

        // Fetch user and partner profiles
        const [userProfile, partnerProfile] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', authUser.id).single(),
          supabase.from('profiles').select('*').eq('id', partnerId).single()
        ])

        if (userProfile.error || partnerProfile.error) {
          console.error('Error fetching profiles:', userProfile.error || partnerProfile.error)
          router.push('/spin')
          return
        }

        setUser({
          id: userProfile.data.id,
          name: userProfile.data.name,
          photo: userProfile.data.photo || '',
          bio: userProfile.data.bio || ''
        })

        setPartner({
          id: partnerProfile.data.id,
          name: partnerProfile.data.name,
          photo: partnerProfile.data.photo || '',
          bio: partnerProfile.data.bio || ''
        })

        // Check if video date already exists
        const { data: existingVideoDate } = await supabase
          .from('video_dates')
          .select('*')
          .eq('match_id', matchId)
          .single()

        let videoDateRecord
        if (existingVideoDate) {
          videoDateRecord = existingVideoDate
          setVideoDateId(existingVideoDate.id)
        } else {
          // Create video date record
          const { data: newVideoDate, error: videoDateError } = await supabase
            .from('video_dates')
            .insert({
              match_id: matchId,
              user1_id: match.user1_id,
              user2_id: match.user2_id,
              status: 'countdown'
            })
            .select()
            .single()

          if (videoDateError) {
            console.error('Error creating video date:', videoDateError)
            router.push('/spin')
            return
          }

          videoDateRecord = newVideoDate
          setVideoDateId(newVideoDate.id)
        }

        // Generate LiveKit room name and tokens
        const roomName = `date-${matchId}`
        const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL

        if (!wsUrl) {
          console.error('LiveKit URL not configured')
          router.push('/spin')
          return
        }

        // Get LiveKit token
        const tokenResponse = await fetch(
          `/api/livekit-token?room=${roomName}&username=${authUser.id}`
        )
        const { token } = await tokenResponse.json()

        if (!token) {
          console.error('Failed to get LiveKit token')
          router.push('/spin')
          return
        }

        // Connect to LiveKit room
        const livekitRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
        })

        // Set up event listeners
        livekitRoom.on(RoomEvent.Connected, () => {
          setIsConnected(true)
          console.log('Connected to LiveKit room')
        })

        livekitRoom.on(RoomEvent.Disconnected, () => {
          setIsConnected(false)
          console.log('Disconnected from LiveKit room')
        })

        livekitRoom.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          if (participant.identity !== authUser.id) {
            setPartnerLeft(true)
            handleEarlyExit()
          }
        })

        livekitRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          if (participant.identity !== authUser.id) {
            if (track.kind === 'video') {
              setRemoteVideoTrack(track.mediaStreamTrack)
            } else if (track.kind === 'audio') {
              setRemoteAudioTrack(track.mediaStreamTrack)
            }
          }
        })

        livekitRoom.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
          if (participant.identity !== authUser.id) {
            if (track.kind === 'video') {
              setRemoteVideoTrack(null)
            } else if (track.kind === 'audio') {
              setRemoteAudioTrack(null)
            }
          }
        })

        // Connect to room
        await livekitRoom.connect(wsUrl, token)
        setRoom(livekitRoom)

        // Enable camera and microphone
        await livekitRoom.localParticipant.enableCameraAndMicrophone()

        // Get local tracks
        livekitRoom.localParticipant.videoTrackPublications.forEach((pub) => {
          if (pub.track) {
            setLocalVideoTrack(pub.track.mediaStreamTrack)
          }
        })

        livekitRoom.localParticipant.audioTrackPublications.forEach((pub) => {
          if (pub.track) {
            setLocalAudioTrack(pub.track.mediaStreamTrack)
          }
        })

        // Update video date status to active when countdown completes
        // This will be handled in the countdown completion effect

        setLoading(false)
      } catch (error) {
        console.error('Error initializing video date:', error)
        router.push('/spin')
      }
    }

    initializeVideoDate()

    // Cleanup on unmount
    return () => {
      if (room) {
        room.disconnect()
      }
    }
  }, [matchId, router, supabase])

  // Attach video/audio tracks to elements
  useEffect(() => {
    if (localVideoTrack && localVideoRef.current) {
      const stream = new MediaStream([localVideoTrack])
      localVideoRef.current.srcObject = stream
      return () => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = null
        }
      }
    }
  }, [localVideoTrack])

  useEffect(() => {
    if (localAudioTrack && localAudioRef.current) {
      const stream = new MediaStream([localAudioTrack])
      localAudioRef.current.srcObject = stream
      return () => {
        if (localAudioRef.current) {
          localAudioRef.current.srcObject = null
        }
      }
    }
  }, [localAudioTrack])

  useEffect(() => {
    if (remoteVideoTrack && remoteVideoRef.current) {
      const stream = new MediaStream([remoteVideoTrack])
      remoteVideoRef.current.srcObject = stream
      return () => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null
        }
      }
    }
  }, [remoteVideoTrack])

  useEffect(() => {
    if (remoteAudioTrack && remoteAudioRef.current) {
      const stream = new MediaStream([remoteAudioTrack])
      remoteAudioRef.current.srcObject = stream
      return () => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = null
        }
      }
    }
  }, [remoteAudioTrack])

  // Handle early exit
  const handleEarlyExit = async () => {
    if (!videoDateId || !user || !partner) return

    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return

    // Update video date status
    await supabase
      .from('video_dates')
      .update({
        status: 'ended_early',
        ended_by_user_id: authUser.id,
        ended_at: new Date().toISOString(),
        outcome: 'pass'
      })
      .eq('id', videoDateId)

    // Apply visibility penalty to early leaver
    await supabase.rpc('increment_visibility_penalty', {
      user_id: authUser.id
    })

    // Disconnect from room
    if (room) {
      await room.disconnect()
    }

    // Show pass modal and return to spin
    setShowPassModal(true)
    setTimeout(() => {
      router.push('/spin')
    }, 2000)
  }

  // Pre-date countdown
  useEffect(() => {
    if (countdownComplete || loading) return

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          setCountdownComplete(true)
          // Update video date status to active
          if (videoDateId) {
            supabase
              .from('video_dates')
              .update({
                status: 'active',
                started_at: new Date().toISOString()
              })
              .eq('id', videoDateId)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [countdownComplete, loading, videoDateId, supabase])

  // Main date timer (only starts after countdown)
  useEffect(() => {
    if (!countdownComplete) return

    const startTime = Date.now()
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          // Save duration when timer ends
          if (videoDateId) {
            const duration = Math.floor((Date.now() - startTime) / 1000)
            supabase
              .from('video_dates')
              .update({
                status: 'completed',
                ended_at: new Date().toISOString(),
                duration_seconds: duration
              })
              .eq('id', videoDateId)
          }
          setShowPostModal(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [countdownComplete, videoDateId, supabase])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s < 10 ? "0" + s : s}`
  }

  const handleEndDate = async () => {
    setIsEnding(true)
    
    // Calculate duration
    const startTime = countdownComplete ? Date.now() - ((300 - timeLeft) * 1000) : Date.now()
    const duration = Math.floor((Date.now() - startTime) / 1000)
    
    // Disconnect from LiveKit room
    if (room) {
      await room.disconnect()
    }

    // Update video date status
    if (videoDateId) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        await supabase
          .from('video_dates')
          .update({
            status: 'ended_early',
            ended_by_user_id: authUser.id,
            ended_at: new Date().toISOString(),
            duration_seconds: duration
          })
          .eq('id', videoDateId)
      }
    }

    setTimeout(() => {
      setShowPostModal(true)
      setIsEnding(false)
    }, 500)
  }

  const handleYes = async () => {
    if (!videoDateId || !user || !partner) return

    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return

    // Save rating and feedback if provided
    if (rating !== null || feedback.trim()) {
      await supabase
        .from('date_ratings')
        .upsert({
          video_date_id: videoDateId,
          rater_id: authUser.id,
          rated_user_id: partner.id,
          rating: rating || 5,
          feedback: feedback || null
        })
    }

    // Update video date outcome
    await supabase
      .from('video_dates')
      .update({
        outcome: 'yes'
      })
      .eq('id', videoDateId)

    setShowPostModal(false)
    // Show contact details form (both said yes)
    setShowContactModal(true)
  }

  const handleSubmitContactDetails = async () => {
    if (!videoDateId || !user || !partner) return

    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return

    try {
      // Encrypt and save user's contact details
      const contactDetailsToSave: any = {}
      if (shareContactDetails.email && userContactDetails.email) {
        contactDetailsToSave.email_encrypted = await encryptContact(userContactDetails.email)
        contactDetailsToSave.share_email = true
      }
      if (shareContactDetails.phone && userContactDetails.phone) {
        contactDetailsToSave.phone_encrypted = await encryptContact(userContactDetails.phone)
        contactDetailsToSave.share_phone = true
      }
      if (shareContactDetails.instagram && userContactDetails.instagram) {
        contactDetailsToSave.instagram_encrypted = await encryptContact(userContactDetails.instagram)
        contactDetailsToSave.share_instagram = true
      }
      if (shareContactDetails.whatsapp && userContactDetails.whatsapp) {
        contactDetailsToSave.whatsapp_encrypted = await encryptContact(userContactDetails.whatsapp)
        contactDetailsToSave.share_whatsapp = true
      }

      if (Object.keys(contactDetailsToSave).length > 0) {
        await supabase
          .from('contact_details')
          .upsert({
            user_id: authUser.id,
            ...contactDetailsToSave,
            updated_at: new Date().toISOString()
          })
      }

      // Update contact exchange
      const isUser1 = authUser.id < partner.id
      const exchangeUpdate: any = {
        video_date_id: videoDateId,
        user1_id: isUser1 ? authUser.id : partner.id,
        user2_id: isUser1 ? partner.id : authUser.id
      }

      if (isUser1) {
        exchangeUpdate.user1_shared = true
      } else {
        exchangeUpdate.user2_shared = true
      }

      const { data: exchange } = await supabase
        .from('contact_exchanges')
        .upsert(exchangeUpdate)
        .select()
        .single()

      // Check if both users have shared
      if (exchange) {
        const bothShared = (isUser1 && exchange.user2_shared) || (!isUser1 && exchange.user1_shared)
        
        if (bothShared) {
          // Both shared - exchange contacts
          await supabase
            .from('contact_exchanges')
            .update({
              exchanged_at: new Date().toISOString()
            })
            .eq('id', exchange.id)

          // Fetch partner's contact details (decrypted)
          const { data: partnerContacts } = await supabase
            .from('contact_details')
            .select('*')
            .eq('user_id', partner.id)
            .single()

          if (partnerContacts) {
            const decrypted: any = {}
            if (partnerContacts.share_email && partnerContacts.email_encrypted) {
              decrypted.email = await decryptContact(partnerContacts.email_encrypted)
            }
            if (partnerContacts.share_phone && partnerContacts.phone_encrypted) {
              decrypted.phone = await decryptContact(partnerContacts.phone_encrypted)
            }
            if (partnerContacts.share_instagram && partnerContacts.instagram_encrypted) {
              decrypted.instagram = await decryptContact(partnerContacts.instagram_encrypted)
            }
            if (partnerContacts.share_whatsapp && partnerContacts.whatsapp_encrypted) {
              decrypted.whatsapp = await decryptContact(partnerContacts.whatsapp_encrypted)
            }

            setPartnerContactDetails(decrypted)
            setShowContactModal(false)
            setShowMatchModal(true)
          } else {
            setShowContactModal(false)
            router.push('/spin')
          }
        } else {
          // Waiting for partner to share
          setShowContactModal(false)
          // Show waiting message or redirect
          router.push('/spin')
        }
      }
    } catch (error) {
      console.error('Error submitting contact details:', error)
      alert('Failed to submit contact details. Please try again.')
    }
  }

  // Helper functions for encryption (using pgcrypto via Supabase RPC)
  const encryptContact = async (value: string): Promise<string> => {
    const { data, error } = await supabase.rpc('encrypt_contact', {
      plaintext: value
    })
    if (error) throw error
    return data
  }

  const decryptContact = async (encrypted: any): Promise<string> => {
    const { data, error } = await supabase.rpc('decrypt_contact', {
      encrypted_value: encrypted
    })
    if (error) throw error
    return data
  }

  const handleContinueFromMatch = () => {
    setShowMatchModal(false)
    router.push("/spin")
  }

  const handlePass = async () => {
    if (!videoDateId || !partner) return

    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return

    // Save rating and feedback if provided
    if (rating !== null || feedback.trim()) {
      await supabase
        .from('date_ratings')
        .upsert({
          video_date_id: videoDateId,
          rater_id: authUser.id,
          rated_user_id: partner.id,
          rating: rating || 3,
          feedback: feedback || null
        })
    }

    // Update video date outcome
    await supabase
      .from('video_dates')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
        outcome: 'pass'
      })
      .eq('id', videoDateId)

    setShowPostModal(false)
    setShowPassModal(true)
    setTimeout(() => {
      router.push("/spin")
    }, 2000)
  }

  const handleReport = () => {
    setShowPostModal(false)
    setShowReportModal(true)
  }

  const handleSubmitReport = async () => {
    if (!videoDateId || !partner) return

    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return

    // Save report
    await supabase
      .from('reports')
      .insert({
        reporter_id: authUser.id,
        reported_user_id: partner.id,
        video_date_id: videoDateId,
        category: reportCategory || 'inappropriate_behaviour',
        details: reportReason
      })

    setShowReportModal(false)
    setShowPassModal(true)
    setTimeout(() => {
      router.push("/spin")
    }, 2000)
  }

  // Update mute/video state based on room
  useEffect(() => {
    if (!room) return

    const updateMediaState = async () => {
      const localParticipant = room.localParticipant
      const isMicEnabled = localParticipant.isMicrophoneEnabled
      const isCamEnabled = localParticipant.isCameraEnabled

      setIsMuted(!isMicEnabled)
      setIsVideoOff(!isCamEnabled)
    }

    updateMediaState()
  }, [room, isMuted, isVideoOff])

  // Handle mute toggle
  const toggleMute = async () => {
    if (!room) return
    const newMutedState = !isMuted
    await room.localParticipant.setMicrophoneEnabled(!newMutedState)
    setIsMuted(newMutedState)
  }

  // Handle video toggle
  const toggleVideo = async () => {
    if (!room) return
    const newVideoOffState = !isVideoOff
    await room.localParticipant.setCameraEnabled(!newVideoOffState)
    setIsVideoOff(newVideoOffState)
  }

  if (loading || !user || !partner) {
    return (
      <div className="min-h-screen w-full bg-[#050810] text-white flex items-center justify-center">
        <div className="text-teal-300 text-xl">Loading...</div>
      </div>
    )
  }

  const progressPercentage = countdownComplete ? ((300 - timeLeft) / 300) * 100 : 0

  return (
    <div className="min-h-screen w-full bg-[#050810] text-white relative overflow-hidden safe-area-inset">
      {/* Pre-date countdown screen */}
      <AnimatePresence>
        {!countdownComplete && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-[#050810]" />
            <AnimatedGradientBackground />
            
            <Sparkles
              sparklesCount={30}
              className="absolute inset-0 pointer-events-none"
              colors={{
                first: "#5eead4",
                second: "#3b82f6"
              }}
            />

            {/* Floating orbs - Mobile: Compact, Desktop: Original */}
            <motion.div
              className="absolute top-1/4 left-1/4 w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 lg:w-96 lg:h-96 bg-teal-500/15 lg:bg-teal-500/20 rounded-full blur-2xl lg:blur-3xl pointer-events-none"
              animate={{
                x: [0, 50, 0],
                y: [0, -30, 0],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <motion.div
              className="absolute bottom-1/4 right-1/4 w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 lg:w-96 lg:h-96 bg-blue-500/15 lg:bg-blue-500/20 rounded-full blur-2xl lg:blur-3xl pointer-events-none"
              animate={{
                x: [0, -40, 0],
                y: [0, 40, 0],
                scale: [1, 1.15, 1],
              }}
              transition={{
                duration: 10,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 2,
              }}
            />

            {/* Countdown content - Mobile: compact, Desktop: 3-column grid */}
            <div className="relative z-10 w-full max-w-full px-2 sm:px-4 lg:px-4 overflow-hidden">
              {/* Mobile: Compact vertical layout */}
              <div className="flex flex-col items-center justify-center min-h-screen py-4 sm:py-6 gap-4 sm:gap-6 lg:hidden">
                {/* Center: Video preview, countdown, and status */}
                <div className="flex flex-col items-center gap-3 sm:gap-4 w-full max-w-full">
                  {/* Video preview - Centered and symmetrical */}
                  <motion.div
                    className="relative w-full max-w-[280px] sm:max-w-[320px] md:max-w-[360px] lg:max-w-[480px] mx-auto"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <div className="relative aspect-video rounded-xl sm:rounded-2xl lg:rounded-3xl overflow-hidden bg-gradient-to-br from-teal-500/20 via-blue-500/20 to-purple-500/20 backdrop-blur-sm border border-teal-300/50 lg:border-2 shadow-lg lg:shadow-2xl">
                      {countdownVideoOff ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <VideoOff className="w-12 h-12 sm:w-16 sm:h-16 text-white/30 mx-auto mb-1 sm:mb-2" />
                            <p className="text-xs sm:text-sm opacity-60 font-medium">video off</p>
                          </div>
                        </div>
                      ) : (
                        <div className="relative w-full h-full">
                          <div className="absolute inset-0 flex items-center justify-center">
                            <motion.div
                              animate={{
                                scale: [1, 1.1, 1],
                                opacity: [0.4, 0.7, 0.4],
                              }}
                              transition={{
                                duration: 2,
                                repeat: Infinity,
                              }}
                            >
                              <Video className="w-16 h-16 sm:w-20 sm:h-20 text-white/40" />
                            </motion.div>
                          </div>
                          <div className="absolute bottom-1 left-1 sm:bottom-2 sm:left-2 flex items-center gap-1 sm:gap-2">
                            <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-lg overflow-hidden border border-teal-300/50 bg-white/10 backdrop-blur-sm">
                              <Image
                                src={user.photo}
                                alt={user.name}
                                fill
                                className="object-cover"
                              />
                            </div>
                            <div>
                              <p className="text-[10px] sm:text-xs font-semibold">{user.name}</p>
                              <p className="text-[9px] sm:text-[10px] opacity-60">you</p>
                            </div>
                          </div>
                          {!countdownMuted && (
                            <motion.div
                              className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full bg-green-500/90 backdrop-blur-sm flex items-center gap-1 text-[9px] sm:text-[10px] font-semibold shadow-lg"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.5 }}
                            >
                              <motion.div
                                className="w-1.5 h-1.5 bg-white rounded-full"
                                animate={{
                                  scale: [1, 1.4, 1],
                                  opacity: [1, 0.6, 1],
                                }}
                                transition={{
                                  duration: 1,
                                  repeat: Infinity,
                                }}
                              />
                              <span>mic</span>
                            </motion.div>
                          )}
                          {countdownMuted && (
                            <motion.div
                              className="absolute top-1 right-1 sm:top-2 sm:right-2 p-1 sm:p-1.5 rounded-full bg-red-500/90 backdrop-blur-sm shadow-lg"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                            >
                              <MicOff className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            </motion.div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Controls - Compact */}
                    <motion.div
                      className="flex items-center justify-center gap-1.5 sm:gap-2 mt-1.5 sm:mt-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                    >
                      <motion.button
                        onClick={() => {
                          setCountdownMuted(!countdownMuted)
                          if (room) {
                            room.localParticipant.setMicrophoneEnabled(countdownMuted)
                          }
                        }}
                        className={`p-1.5 sm:p-2 rounded-lg backdrop-blur-sm border transition-all duration-300 ${
                          countdownMuted
                            ? "bg-red-500/20 border-red-500/50 text-red-300 shadow-lg shadow-red-500/20"
                            : "bg-white/10 border-white/20 hover:border-teal-300/50 text-white hover:bg-white/15"
                        }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        title={countdownMuted ? "Unmute" : "Mute"}
                      >
                        {countdownMuted ? <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                      </motion.button>

                      <motion.button
                        onClick={() => {
                          setCountdownVideoOff(!countdownVideoOff)
                          if (room) {
                            room.localParticipant.setCameraEnabled(countdownVideoOff)
                          }
                        }}
                        className={`p-1.5 sm:p-2 rounded-lg backdrop-blur-sm border transition-all duration-300 ${
                          countdownVideoOff
                            ? "bg-red-500/20 border-red-500/50 text-red-300 shadow-lg shadow-red-500/20"
                            : "bg-white/10 border-white/20 hover:border-teal-300/50 text-white hover:bg-white/15"
                        }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        title={countdownVideoOff ? "Turn on video" : "Turn off video"}
                      >
                        {countdownVideoOff ? <VideoOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                      </motion.button>
                    </motion.div>
                  </motion.div>

                  {/* Countdown number - Centered */}
                  <motion.div
                    key={countdown}
                    initial={{ scale: 0, rotate: -180, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    exit={{ scale: 1.2, opacity: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 20,
                    }}
                    className="relative flex items-center justify-center lg:my-4"
                  >
                    <motion.div
                      className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-blue-400 to-teal-300 leading-none"
                      animate={{
                        backgroundPosition: ["0%", "100%", "0%"],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      style={{
                        backgroundSize: "200% 100%",
                      }}
                    >
                      {countdown}
                    </motion.div>
                    <motion.div
                      className="absolute inset-0 -z-10"
                      animate={{
                        scale: [1, 1.15, 1],
                        opacity: [0.3, 0.5, 0.3],
                      }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                      }}
                    >
                      <div className="w-full h-full bg-teal-300/20 rounded-full blur-2xl" />
                    </motion.div>
                  </motion.div>

                  {/* Status text - Centered */}
                  <motion.div
                    className="text-center w-full lg:mb-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                  >
                    <motion.p
                      className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl font-semibold mb-1 lg:mb-2"
                      animate={{
                        opacity: [0.7, 1, 0.7],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                      }}
                    >
                      {countdown > 3 ? "your date is starting" : "get ready"}
                    </motion.p>
                    <p className="text-[10px] sm:text-xs lg:text-sm xl:text-base opacity-60 line-clamp-1">
                      {countdown > 10 ? "test your mic and video" : countdown > 5 ? "smile and be yourself" : "here we go"}
                    </p>
                  </motion.div>

                  {/* Progress ring - Centered */}
                  <motion.div
                    className="relative w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 xl:w-28 xl:h-28 mx-auto"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        fill="none"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth="3"
                      />
                      <motion.circle
                        cx="50"
                        cy="50"
                        r="45"
                        fill="none"
                        stroke="url(#countdownGradient)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        initial={{ pathLength: 1 }}
                        animate={{ pathLength: countdown / 15 }}
                        transition={{ duration: 1, ease: "linear" }}
                      />
                      <defs>
                        <linearGradient id="countdownGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#5eead4" />
                          <stop offset="50%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#5eead4" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </motion.div>
                </div>

                {/* Profiles - Horizontal layout under video/mic (Mobile only) */}
                <motion.div
                  className="flex items-center justify-center gap-6 sm:gap-8 w-full max-w-md"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  {/* User profile - Left */}
                  <motion.div
                    className="flex flex-col items-center gap-1.5 sm:gap-2"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl overflow-hidden border-2 border-teal-300/50 shadow-[0_0_20px_rgba(94,234,212,0.3)]">
                      <Image
                        src={user.photo}
                        alt={user.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="text-center w-full max-w-[120px] sm:max-w-[140px]">
                      <h3 className="text-sm sm:text-base font-semibold text-teal-300">{user.name}</h3>
                      <p className="text-[10px] sm:text-xs opacity-70 mt-0.5">you</p>
                    </div>
                  </motion.div>

                  {/* Partner profile - Right */}
                  <motion.div
                    className="flex flex-col items-center gap-1.5 sm:gap-2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl overflow-hidden border-2 border-blue-400/50 shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                      <Image
                        src={partner.photo}
                        alt={partner.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="text-center w-full max-w-[120px] sm:max-w-[140px]">
                      <h3 className="text-sm sm:text-base font-semibold text-blue-300 mb-0.5">{partner.name}</h3>
                      <p className="text-[10px] sm:text-xs opacity-70 leading-tight break-words px-1">
                        {partner.bio}
                      </p>
                    </div>
                  </motion.div>
                </motion.div>
              </div>

              {/* Desktop: 3-column grid layout (exactly like GitHub) */}
              <div className="hidden lg:block relative z-10 w-full max-w-6xl px-4 sm:px-6 mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-center min-h-screen py-8">
                  {/* Left: Partner preview */}
                  <motion.div
                    className="flex flex-col items-center gap-3 sm:gap-4"
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <div className="relative w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-3xl overflow-hidden border-4 border-blue-400/50 shadow-[0_0_40px_rgba(59,130,246,0.4)]">
                      <Image
                        src={partner.photo}
                        alt={partner.name}
                        fill
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-semibold text-blue-300">{partner.name}</h3>
                      <p className="text-xs opacity-70 mt-1">{partner.bio}</p>
                    </div>
                  </motion.div>

                  {/* Center: Countdown and video preview */}
                  <div className="flex flex-col items-center gap-6">
                    {/* Video preview */}
                    <motion.div
                      className="relative w-full max-w-md"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      <div className="relative aspect-video rounded-3xl overflow-hidden bg-gradient-to-br from-teal-500/20 via-blue-500/20 to-purple-500/20 backdrop-blur-sm border-2 border-teal-300/50 shadow-2xl">
                        {countdownVideoOff ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center">
                              <VideoOff className="w-20 h-20 text-white/30 mx-auto mb-3" />
                              <p className="text-sm opacity-60 font-medium">video off</p>
                            </div>
                          </div>
                        ) : (
                          <div className="relative w-full h-full">
                            <div className="absolute inset-0 flex items-center justify-center">
                              <motion.div
                                animate={{
                                  scale: [1, 1.1, 1],
                                  opacity: [0.4, 0.7, 0.4],
                                }}
                                transition={{
                                  duration: 2,
                                  repeat: Infinity,
                                }}
                              >
                                <Video className="w-24 h-24 text-white/40" />
                              </motion.div>
                            </div>
                            <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 md:bottom-4 md:left-4 flex items-center gap-2 sm:gap-3">
                              <div className="relative w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg sm:rounded-xl overflow-hidden border-2 border-teal-300/50 bg-white/10 backdrop-blur-sm">
                                <Image
                                  src={user.photo}
                                  alt={user.name}
                                  fill
                                  className="object-cover"
                                />
                              </div>
                              <div>
                                <p className="text-xs sm:text-sm font-semibold">{user.name}</p>
                                <p className="text-[10px] sm:text-xs opacity-60">you</p>
                              </div>
                            </div>
                            {!countdownMuted && (
                              <motion.div
                                className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 md:bottom-4 md:right-4 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full bg-green-500/90 backdrop-blur-sm flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-semibold shadow-lg"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.5 }}
                              >
                                <motion.div
                                  className="w-2 h-2 bg-white rounded-full"
                                  animate={{
                                    scale: [1, 1.4, 1],
                                    opacity: [1, 0.6, 1],
                                  }}
                                  transition={{
                                    duration: 1,
                                    repeat: Infinity,
                                  }}
                                />
                                <span>mic active</span>
                              </motion.div>
                            )}
                            {countdownMuted && (
                              <motion.div
                                className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 p-1.5 sm:p-2 md:p-2.5 rounded-full bg-red-500/90 backdrop-blur-sm shadow-lg"
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                              >
                                <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                              </motion.div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Controls */}
                      <motion.div
                        className="flex items-center justify-center gap-2 sm:gap-3 mt-3 sm:mt-4"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                      >
                        <motion.button
                          onClick={() => {
                            setCountdownMuted(!countdownMuted)
                            if (room) {
                              room.localParticipant.setMicrophoneEnabled(countdownMuted)
                            }
                          }}
                          className={`p-2.5 sm:p-3.5 rounded-xl backdrop-blur-sm border-2 transition-all duration-300 ${
                            countdownMuted
                              ? "bg-red-500/20 border-red-500/50 text-red-300 shadow-lg shadow-red-500/20"
                              : "bg-white/10 border-white/20 hover:border-teal-300/50 text-white hover:bg-white/15"
                          }`}
                          whileHover={{ scale: 1.1, y: -2 }}
                          whileTap={{ scale: 0.9 }}
                          title={countdownMuted ? "Unmute" : "Mute"}
                        >
                          {countdownMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
                        </motion.button>

                        <motion.button
                          onClick={() => {
                            setCountdownVideoOff(!countdownVideoOff)
                            if (room) {
                              room.localParticipant.setCameraEnabled(countdownVideoOff)
                            }
                          }}
                          className={`p-2.5 sm:p-3.5 rounded-xl backdrop-blur-sm border-2 transition-all duration-300 ${
                            countdownVideoOff
                              ? "bg-red-500/20 border-red-500/50 text-red-300 shadow-lg shadow-red-500/20"
                              : "bg-white/10 border-white/20 hover:border-teal-300/50 text-white hover:bg-white/15"
                          }`}
                          whileHover={{ scale: 1.1, y: -2 }}
                          whileTap={{ scale: 0.9 }}
                          title={countdownVideoOff ? "Turn on video" : "Turn off video"}
                        >
                          {countdownVideoOff ? <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Video className="w-4 h-4 sm:w-5 sm:h-5" />}
                        </motion.button>
                      </motion.div>
                    </motion.div>

                    {/* Countdown number */}
                    <motion.div
                      key={countdown}
                      initial={{ scale: 0, rotate: -180, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      exit={{ scale: 1.5, opacity: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 20,
                      }}
                      className="relative"
                    >
                      <motion.div
                        className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-blue-400 to-teal-300"
                        animate={{
                          backgroundPosition: ["0%", "100%", "0%"],
                        }}
                        transition={{
                          duration: 3,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                        style={{
                          backgroundSize: "200% 100%",
                        }}
                      >
                        {countdown}
                      </motion.div>
                      <motion.div
                        className="absolute inset-0 -z-10"
                        animate={{
                          scale: [1, 1.2, 1],
                          opacity: [0.4, 0.7, 0.4],
                        }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                        }}
                      >
                        <div className="w-full h-full bg-teal-300/30 rounded-full blur-3xl" />
                      </motion.div>
                    </motion.div>

                    {/* Status text */}
                    <motion.div
                      className="text-center"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                    >
                      <motion.p
                        className="text-base sm:text-lg md:text-xl lg:text-2xl font-semibold mb-2"
                        animate={{
                          opacity: [0.7, 1, 0.7],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                        }}
                      >
                        {countdown > 3 ? "your date is starting" : "get ready"}
                      </motion.p>
                      <p className="text-xs sm:text-sm opacity-60">
                        {countdown > 10 ? "test your mic and video" : countdown > 5 ? "smile and be yourself" : "here we go"}
                      </p>
                    </motion.div>

                    {/* Progress ring */}
                    <motion.div
                      className="relative w-28 h-28"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4 }}
                    >
                      <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 100 100">
                        <circle
                          cx="50"
                          cy="50"
                          r="45"
                          fill="none"
                          stroke="rgba(255,255,255,0.1)"
                          strokeWidth="3"
                        />
                        <motion.circle
                          cx="50"
                          cy="50"
                          r="45"
                          fill="none"
                          stroke="url(#countdownGradient)"
                          strokeWidth="3"
                          strokeLinecap="round"
                          initial={{ pathLength: 1 }}
                          animate={{ pathLength: countdown / 15 }}
                          transition={{ duration: 1, ease: "linear" }}
                        />
                        <defs>
                          <linearGradient id="countdownGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#5eead4" />
                            <stop offset="50%" stopColor="#3b82f6" />
                            <stop offset="100%" stopColor="#5eead4" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </motion.div>
                  </div>

                  {/* Right: User preview */}
                  <motion.div
                    className="flex flex-col items-center gap-4"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <div className="relative w-32 h-32 rounded-3xl overflow-hidden border-4 border-teal-300/50 shadow-[0_0_40px_rgba(94,234,212,0.4)]">
                      <Image
                        src={user.photo}
                        alt={user.name}
                        fill
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-semibold text-teal-300">{user.name}</h3>
                      <p className="text-xs opacity-70 mt-1">you</p>
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main video interface */}
      {countdownComplete && (
        <>
          <div className="fixed inset-0 bg-[#050810] pointer-events-none" />
          <AnimatedGradientBackground />
          
          <Sparkles
            sparklesCount={15}
            className="absolute inset-0 pointer-events-none"
            colors={{
              first: "#5eead4",
              second: "#3b82f6"
            }}
          />

          {/* Floating orbs */}
          <motion.div
            className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 bg-teal-500/20 rounded-full blur-3xl pointer-events-none"
            animate={{
              x: [0, 50, 0],
              y: [0, -30, 0],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none"
            animate={{
              x: [0, -40, 0],
              y: [0, 40, 0],
              scale: [1, 1.15, 1],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 2,
            }}
          />

          {/* Top bar - Mobile optimized */}
          <motion.div
            className="relative z-10 px-4 sm:px-5 md:px-6 pt-safe sm:pt-5 md:pt-6 pb-3 sm:pb-4"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, type: "spring", stiffness: 300 }}
          >
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2.5">
                <div className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0">
                  <AnimatePresence mode="wait">
                    {isTimerVisible && (
                      <motion.div
                        key="timer"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/5 backdrop-blur-md border border-white/10 shadow-lg"
                        whileHover={{ scale: 1.05, borderColor: "rgba(94,234,212,0.5)" }}
                      >
                        <motion.div
                          animate={{
                            scale: [1, 1.1, 1],
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                        >
                          <Clock className="w-5 h-5 text-teal-300" />
                        </motion.div>
                        <span className="text-xl font-bold text-teal-300 tabular-nums">
                          {formatTime(timeLeft)}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.button
                    onClick={() => setIsTimerVisible(!isTimerVisible)}
                    className={`p-2.5 rounded-full backdrop-blur-md border-2 transition-all duration-300 ${
                      isTimerVisible
                        ? "bg-white/5 border-white/10 hover:border-teal-300/50 text-white"
                        : "bg-teal-300/20 border-teal-300/50 text-teal-300 shadow-lg shadow-teal-300/20"
                    }`}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    title={isTimerVisible ? "Hide timer" : "Show timer"}
                  >
                    {isTimerVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </motion.button>
                </div>

                <motion.div
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 backdrop-blur-md border border-white/10 shadow-lg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <motion.div
                    className="w-2 h-2 bg-green-400 rounded-full"
                    animate={{
                      scale: [1, 1.3, 1],
                      opacity: [1, 0.7, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                    }}
                  />
                  <span className="text-sm opacity-80 font-medium">connected</span>
                </motion.div>
              </div>

              <AnimatePresence>
                {isTimerVisible && (
                  <motion.div
                    className="h-1.5 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 6 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <motion.div
                      className="h-full bg-gradient-to-r from-teal-300 via-blue-400 to-teal-300 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercentage}%` }}
                      transition={{ duration: 1, ease: "linear" }}
                      style={{
                        backgroundSize: "200% 100%",
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Main video layout - Mobile optimized */}
          <div className="relative z-10 px-4 sm:px-5 md:px-6 pb-safe sm:pb-5 md:pb-6">
            <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 md:gap-6 mb-4 sm:mb-5 md:mb-6">
                {/* Your video */}
                <motion.div
                  className="relative group"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  whileHover={{ scale: 1.01 }}
                >
                  <div className="relative aspect-video rounded-xl sm:rounded-2xl md:rounded-3xl overflow-hidden bg-white/5 backdrop-blur-sm border-2 border-white/10 group-hover:border-teal-300/50 transition-all duration-300 shadow-2xl">
                    {isVideoOff ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <VideoOff className="w-20 h-20 text-white/30 mx-auto mb-2" />
                          <p className="text-sm opacity-60 font-medium">video off</p>
                        </div>
                      </div>
                    ) : (
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                    )}

                    <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 md:bottom-4 md:left-4 flex items-center gap-2 sm:gap-3">
                      <div className="relative w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg sm:rounded-xl overflow-hidden border-2 border-teal-300/50 bg-white/10 backdrop-blur-sm">
                        <Image
                          src={user.photo}
                          alt={user.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-semibold">{user.name}</p>
                        <p className="text-[10px] sm:text-xs opacity-60">you</p>
                      </div>
                    </div>

                    {isMuted && (
                      <motion.div
                        className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 p-1.5 sm:p-2 md:p-2.5 rounded-full bg-red-500/90 backdrop-blur-sm shadow-lg z-10"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                      >
                        <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                      </motion.div>
                    )}
                    {isVideoOff && (
                      <motion.div
                        className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 p-1.5 sm:p-2 md:p-2.5 rounded-full bg-red-500/90 backdrop-blur-sm shadow-lg z-10"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                      >
                        <VideoOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                      </motion.div>
                    )}
                  </div>
                </motion.div>

                {/* Partner video */}
                <motion.div
                  className="relative group"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  whileHover={{ scale: 1.01 }}
                >
                  <div className="relative aspect-video rounded-3xl overflow-hidden bg-white/5 backdrop-blur-sm border-2 border-white/10 group-hover:border-blue-400/50 transition-all duration-300 shadow-2xl">
                    {isPartnerVideoOff || !remoteVideoTrack ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <VideoOff className="w-20 h-20 text-white/30 mx-auto mb-2" />
                          <p className="text-sm opacity-60 font-medium">partner video off</p>
                        </div>
                      </div>
                    ) : (
                      <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    )}
                    <audio ref={remoteAudioRef} autoPlay />

                    <div className="absolute bottom-4 left-4 flex items-center gap-3">
                      <div className="relative w-14 h-14 rounded-xl overflow-hidden border-2 border-blue-400/50 bg-white/10 backdrop-blur-sm">
                        <Image
                          src={partner.photo}
                          alt={partner.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-semibold">{partner.name}</p>
                        <p className="text-[10px] sm:text-xs opacity-60">partner</p>
                      </div>
                    </div>

                    {isPartnerMuted && (
                      <motion.div
                        className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 p-1.5 sm:p-2 md:p-2.5 rounded-full bg-red-500/90 backdrop-blur-sm shadow-lg z-10"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                      >
                        <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                      </motion.div>
                    )}
                    {isPartnerVideoOff && (
                      <motion.div
                        className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 p-1.5 sm:p-2 md:p-2.5 rounded-full bg-red-500/90 backdrop-blur-sm shadow-lg z-10"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                      >
                        <VideoOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Control panel - Mobile optimized */}
              <motion.div
                className="flex items-center justify-center gap-3 sm:gap-4 px-4 pb-safe sm:pb-0"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, type: "spring", stiffness: 300 }}
              >
                <motion.button
                  onClick={toggleMute}
                  className={`p-3.5 sm:p-4 rounded-xl backdrop-blur-md border-2 transition-all duration-300 shadow-lg touch-manipulation ${
                    isMuted
                      ? "bg-red-500/20 border-red-500/50 text-red-300 shadow-red-500/20 active:scale-95"
                      : "bg-white/10 border-white/20 hover:border-teal-300/50 text-white hover:bg-white/15 active:scale-95"
                  }`}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  title={isMuted ? "Unmute" : "Mute"}
                  style={{ minWidth: '48px', minHeight: '48px' }}
                >
                  {isMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
                </motion.button>

                <motion.button
                  onClick={toggleVideo}
                  className={`p-3.5 sm:p-4 rounded-xl backdrop-blur-md border-2 transition-all duration-300 shadow-lg touch-manipulation ${
                    isVideoOff
                      ? "bg-red-500/20 border-red-500/50 text-red-300 shadow-red-500/20 active:scale-95"
                      : "bg-white/10 border-white/20 hover:border-teal-300/50 text-white hover:bg-white/15 active:scale-95"
                  }`}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  title={isVideoOff ? "Turn on video" : "Turn off video"}
                  style={{ minWidth: '48px', minHeight: '48px' }}
                >
                  {isVideoOff ? <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Video className="w-5 h-5 sm:w-6 sm:h-6" />}
                </motion.button>

                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="touch-manipulation"
                >
                  <PrimaryButton
                    onClick={handleEndDate}
                    size="md"
                    variant="secondary"
                    className="px-5 sm:px-6 md:px-8 text-sm sm:text-base h-12 sm:h-auto min-h-[48px] font-semibold"
                  >
                    <div className="flex items-center gap-2">
                      <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span>end date</span>
                    </div>
                  </PrimaryButton>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </>
      )}

      {/* Post-date feedback modal - Mobile: Compact and centered */}
      <Modal
        isOpen={showPostModal}
        onClose={() => {}}
        title="how was your date?"
        className="max-w-lg sm:max-w-lg"
      >
        <motion.div
          className="flex flex-col gap-3 sm:gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <motion.div
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl overflow-hidden border-2 border-teal-300/50 shadow-[0_0_20px_rgba(94,234,212,0.3)] mb-2 sm:mb-3">
              <Image
                src={partner.photo}
                alt={partner.name}
                fill
                className="object-cover"
              />
            </div>
            <h3 className="text-base sm:text-lg font-semibold mb-0.5 sm:mb-1">{partner.name}</h3>
            <p className="opacity-70 text-[11px] sm:text-xs text-center max-w-xs px-2">{partner.bio}</p>
          </motion.div>

          <motion.div
            className="flex flex-col gap-2 sm:gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <label className="text-xs sm:text-sm font-medium opacity-80 flex items-center gap-1.5 sm:gap-2">
              <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-300 flex-shrink-0" />
              <span>rate your experience</span>
            </label>
            <div className="flex gap-1.5 sm:gap-2 justify-center">
              {[1, 2, 3, 4, 5].map((star) => (
                <motion.button
                  key={star}
                  onClick={() => setRating(star)}
                  className={`p-1.5 sm:p-2 rounded-lg transition-all duration-300 ${
                    rating && star <= rating
                      ? "bg-teal-300/20 border-2 border-teal-300/50"
                      : "bg-white/5 border-2 border-white/10 hover:border-teal-300/30"
                  }`}
                  whileHover={{ scale: 1.1, y: -2 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <Star
                    className={`w-5 h-5 sm:w-6 sm:h-6 ${
                      rating && star <= rating
                        ? "fill-teal-300 text-teal-300"
                        : "text-white/40"
                    }`}
                  />
                </motion.button>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="flex flex-col gap-1.5 sm:gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <label className="text-xs sm:text-sm font-medium opacity-80 flex items-center gap-1.5 sm:gap-2">
              <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-300 flex-shrink-0" />
              <span>optional feedback</span>
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="share your thoughts about the date..."
              className="w-full p-3 sm:p-4 rounded-lg sm:rounded-xl bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white placeholder-white/40 transition-all duration-300 resize-none min-h-[70px] sm:min-h-[80px] text-xs sm:text-sm"
              rows={3}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <motion.button
              onClick={handleReport}
              className="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl bg-white/5 border border-white/10 hover:border-red-500/50 hover:bg-red-500/10 transition-all duration-300 text-xs sm:text-sm text-red-300/80 hover:text-red-300 flex items-center justify-center gap-1.5 sm:gap-2"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Flag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>report inappropriate behavior</span>
            </motion.button>
          </motion.div>

          <motion.div
            className="flex gap-2 sm:gap-3 w-full pt-1 sm:pt-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <motion.button
              onClick={handlePass}
              className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all duration-300 font-semibold text-xs sm:text-base"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              pass
            </motion.button>
            <motion.button
              onClick={handleYes}
              className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-xl bg-teal-300 text-black font-semibold hover:bg-teal-200 transition-all duration-300 shadow-lg shadow-teal-300/30 text-xs sm:text-base"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                <Heart className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>yes</span>
              </div>
            </motion.button>
          </motion.div>
        </motion.div>
      </Modal>

      {/* Report modal */}
      <Modal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        title="report inappropriate behavior"
        className="max-w-md"
      >
        <motion.div
          className="flex flex-col gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Flag className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-sm opacity-80 mb-6">
              help us keep the community safe. please describe what happened.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium opacity-80">
              category
            </label>
            <select
              value={reportCategory}
              onChange={(e) => setReportCategory(e.target.value)}
              className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-red-500/50 focus:outline-none text-white transition-all duration-300"
            >
              <option value="">select a category</option>
              <option value="inappropriate_behaviour">inappropriate behaviour</option>
              <option value="harassment">harassment</option>
              <option value="sexual_content">sexual content</option>
              <option value="camera_refusal">camera refusal</option>
              <option value="fake_profile">fake profile</option>
              <option value="underage_suspicion">underage suspicion</option>
              <option value="scam_attempts">scam attempts</option>
              <option value="hate_speech">hate speech</option>
            </select>
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium opacity-80">
              details
            </label>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="describe what happened..."
              className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-red-500/50 focus:outline-none text-white placeholder-white/40 transition-all duration-300 resize-none min-h-[120px]"
              rows={5}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <motion.button
              onClick={() => setShowReportModal(false)}
              className="flex-1 px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all duration-300 font-semibold"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              cancel
            </motion.button>
            <motion.button
              onClick={handleSubmitReport}
              disabled={!reportCategory || !reportReason.trim()}
              className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
                reportCategory && reportReason.trim()
                  ? "bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/30"
                  : "bg-white/5 border border-white/10 text-white/40 cursor-not-allowed"
              }`}
              whileHover={reportCategory && reportReason.trim() ? { scale: 1.05 } : {}}
              whileTap={reportCategory && reportReason.trim() ? { scale: 0.95 } : {}}
            >
              submit report
            </motion.button>
          </div>

          <p className="text-xs opacity-60 text-center">
            reports are reviewed by our team. we take all reports seriously.
          </p>
        </motion.div>
      </Modal>

      {/* Pass modal */}
      <AnimatePresence>
        {showPassModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {}}
            />
            <motion.div
              className="relative bg-white/10 backdrop-blur-xl rounded-3xl p-8 max-w-sm w-full border border-white/10 shadow-2xl text-center"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <X className="w-8 h-8 text-white/60" />
              </motion.div>
              <h2 className="text-xl font-bold text-teal-300 mb-2">
                thanks for the date
              </h2>
              <p className="opacity-80 text-sm">you can try another match</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contact details modal - Compact design to fit without scroll */}
      <Modal
        isOpen={showContactModal}
        onClose={() => {}}
        title="exchange contact details"
        className="max-w-lg"
      >
        <motion.div
          className="flex flex-col gap-2 sm:gap-2.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-teal-300/20 rounded-full flex items-center justify-center mx-auto mb-1.5 sm:mb-2">
              <Heart className="w-5 h-5 sm:w-6 sm:h-6 text-teal-300" />
            </div>
            <h3 className="text-sm sm:text-base font-semibold mb-1">you both want to connect!</h3>
            <p className="text-[10px] sm:text-xs opacity-70 px-1">
              share your preferred contact details with {partner.name}
            </p>
          </motion.div>

          <div className="space-y-1.5 sm:space-y-2">
            <motion.div
              className="flex flex-col gap-1 sm:gap-1.5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
            >
              <label className="text-[11px] sm:text-xs font-medium opacity-80 flex items-center gap-1">
                <Mail className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-teal-300 flex-shrink-0" />
                <span>email (optional)</span>
                <input
                  type="checkbox"
                  checked={shareContactDetails.email}
                  onChange={(e) => setShareContactDetails(prev => ({ ...prev, email: e.target.checked }))}
                  className="ml-auto w-4 h-4 rounded border-white/20 bg-white/5 text-teal-300 focus:ring-teal-300"
                />
              </label>
              {shareContactDetails.email && (
                <input
                  type="email"
                  value={userContactDetails.email}
                  onChange={(e) => setUserContactDetails(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="your@email.com"
                  className="w-full p-2 sm:p-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white placeholder-white/40 transition-all duration-300 text-xs sm:text-sm touch-manipulation"
                  style={{ minHeight: '36px' }}
                />
              )}
            </motion.div>

            <motion.div
              className="flex flex-col gap-1 sm:gap-1.5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
            >
              <label className="text-[11px] sm:text-xs font-medium opacity-80 flex items-center gap-1">
                <Phone className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-teal-300 flex-shrink-0" />
                <span>phone number (optional)</span>
                <input
                  type="checkbox"
                  checked={shareContactDetails.phone}
                  onChange={(e) => setShareContactDetails(prev => ({ ...prev, phone: e.target.checked }))}
                  className="ml-auto w-4 h-4 rounded border-white/20 bg-white/5 text-teal-300 focus:ring-teal-300"
                />
              </label>
              {shareContactDetails.phone && (
                <input
                  type="tel"
                  value={userContactDetails.phone}
                  onChange={(e) => setUserContactDetails(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+1 (555) 123-4567"
                  className="w-full p-2 sm:p-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white placeholder-white/40 transition-all duration-300 text-xs sm:text-sm touch-manipulation"
                  style={{ minHeight: '36px' }}
                />
              )}
            </motion.div>

            <motion.div
              className="flex flex-col gap-1 sm:gap-1.5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, type: "spring", stiffness: 300 }}
            >
              <label className="text-[11px] sm:text-xs font-medium opacity-80 flex items-center gap-1">
                <Instagram className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-teal-300 flex-shrink-0" />
                <span>facebook (optional)</span>
              </label>
              <input
                type="text"
                value={shareContactDetails.instagram ? userContactDetails.instagram : ""}
                onChange={(e) => setUserContactDetails(prev => ({ ...prev, instagram: e.target.value }))}
                placeholder="@yourusername"
                className="w-full p-2 sm:p-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white placeholder-white/40 transition-all duration-300 text-xs sm:text-sm touch-manipulation"
                style={{ minHeight: '36px' }}
              />
            </motion.div>

            <motion.div
              className="flex flex-col gap-1 sm:gap-1.5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, type: "spring", stiffness: 300 }}
            >
              <label className="text-[11px] sm:text-xs font-medium opacity-80 flex items-center gap-1">
                <Instagram className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-teal-300 flex-shrink-0" />
                <span>instagram (optional)</span>
                <input
                  type="checkbox"
                  checked={shareContactDetails.instagram}
                  onChange={(e) => setShareContactDetails(prev => ({ ...prev, instagram: e.target.checked }))}
                  className="ml-auto w-4 h-4 rounded border-white/20 bg-white/5 text-teal-300 focus:ring-teal-300"
                />
              </label>
              {shareContactDetails.instagram && (
                <input
                  type="text"
                  value={userContactDetails.instagram}
                  onChange={(e) => setUserContactDetails(prev => ({ ...prev, instagram: e.target.value }))}
                  placeholder="@yourusername"
                  className="w-full p-2 sm:p-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white placeholder-white/40 transition-all duration-300 text-xs sm:text-sm touch-manipulation"
                  style={{ minHeight: '36px' }}
                />
              )}
            </motion.div>

            <motion.div
              className="flex flex-col gap-1 sm:gap-1.5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, type: "spring", stiffness: 300 }}
            >
              <label className="text-[11px] sm:text-xs font-medium opacity-80 flex items-center gap-1">
                <Phone className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-teal-300 flex-shrink-0" />
                <span>whatsapp (optional)</span>
                <input
                  type="checkbox"
                  checked={shareContactDetails.whatsapp}
                  onChange={(e) => setShareContactDetails(prev => ({ ...prev, whatsapp: e.target.checked }))}
                  className="ml-auto w-4 h-4 rounded border-white/20 bg-white/5 text-teal-300 focus:ring-teal-300"
                />
              </label>
              {shareContactDetails.whatsapp && (
                <input
                  type="tel"
                  value={userContactDetails.whatsapp}
                  onChange={(e) => setUserContactDetails(prev => ({ ...prev, whatsapp: e.target.value }))}
                  placeholder="+1 (555) 123-4567"
                  className="w-full p-2 sm:p-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-teal-300/50 focus:outline-none text-white placeholder-white/40 transition-all duration-300 text-xs sm:text-sm touch-manipulation"
                  style={{ minHeight: '36px' }}
                />
              )}
            </motion.div>
          </div>

          <motion.div
            className="flex gap-2 sm:gap-2.5 pt-1 sm:pt-1.5 pb-safe sm:pb-0 flex-shrink-0"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, type: "spring", stiffness: 300 }}
          >
            <motion.button
              onClick={() => {
                setShowContactModal(false)
                router.push("/spin")
              }}
              className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 active:scale-95 transition-all duration-300 font-semibold text-xs sm:text-sm touch-manipulation"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              style={{ minHeight: '40px' }}
            >
              skip
            </motion.button>
            <motion.button
              onClick={handleSubmitContactDetails}
              className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-teal-300 text-black font-semibold hover:bg-teal-200 active:scale-95 transition-all duration-300 shadow-lg shadow-teal-300/30 touch-manipulation"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              style={{ minHeight: '40px' }}
            >
              <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                <Heart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-xs sm:text-sm">share details</span>
              </div>
            </motion.button>
          </motion.div>
        </motion.div>
      </Modal>

      {/* Match modal - shows contact details */}
      <AnimatePresence>
        {showMatchModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {}}
            />
            <motion.div
              className="relative bg-white/10 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 max-w-md w-full max-w-[calc(100vw-1.5rem)] border border-white/10 shadow-2xl text-center"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
                <Sparkles
                  sparklesCount={30}
                  className="absolute inset-0"
                  colors={{
                    first: "#5eead4",
                    second: "#3b82f6"
                  }}
                />
              </div>

              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                className="w-20 h-20 bg-teal-300 rounded-full flex items-center justify-center mx-auto mb-4 shadow-[0_0_40px_rgba(94,234,212,0.8)]"
              >
                <CheckCircle2 className="w-10 h-10 text-black" />
              </motion.div>
              
              <motion.h2
                className="text-2xl font-bold text-teal-300 mb-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                connection made!
              </motion.h2>
              
              <motion.p
                className="opacity-80 text-sm mb-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.8 }}
                transition={{ delay: 0.4 }}
              >
                {partner.name}'s contact details
              </motion.p>

              {partnerContactDetails && (
                <motion.div
                  className="space-y-3 mb-6 flex flex-col items-center"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  {partnerContactDetails.email && (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3 w-full max-w-xs justify-center">
                      <Mail className="w-5 h-5 text-teal-300 flex-shrink-0" />
                      <span className="text-sm">{partnerContactDetails.email}</span>
                    </div>
                  )}
                  {partnerContactDetails.phone && (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3 w-full max-w-xs justify-center">
                      <Phone className="w-5 h-5 text-teal-300 flex-shrink-0" />
                      <span className="text-sm">{partnerContactDetails.phone}</span>
                    </div>
                  )}
                  {partnerContactDetails.instagram && (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3 w-full max-w-xs justify-center">
                      <Instagram className="w-5 h-5 text-teal-300 flex-shrink-0" />
                      <span className="text-sm">{partnerContactDetails.instagram}</span>
                    </div>
                  )}
                </motion.div>
              )}
              
              <motion.div
                className="flex justify-center pt-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
              >
                <motion.button
                  onClick={handleContinueFromMatch}
                  className="px-8 py-3 rounded-xl bg-teal-300 text-black font-semibold hover:bg-teal-200 transition-all duration-300 shadow-lg shadow-teal-300/30"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  continue
                </motion.button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reject modal */}
      <AnimatePresence>
        {showRejectModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {}}
            />
            <motion.div
              className="relative bg-white/10 backdrop-blur-xl rounded-3xl p-8 max-w-sm w-full border border-white/10 shadow-2xl text-center"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <X className="w-8 h-8 text-white/60" />
              </motion.div>
              <h2 className="text-xl font-bold text-teal-300 mb-2">
                they chose not to continue
              </h2>
              <p className="opacity-80 text-sm">thanks for the date</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function VideoDate() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-black via-purple-900/20 to-black">
        <div className="text-white text-lg">Loading...</div>
      </div>
    }>
      <VideoDateContent />
    </Suspense>
  )
}
