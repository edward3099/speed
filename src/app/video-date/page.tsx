"use client"

import { useEffect, useState, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Video, Mic, MicOff, VideoOff, PhoneOff, Heart, X, Sparkles as SparklesIcon, CheckCircle2, Star, Flag, MessageSquare, Eye, EyeOff, Clock, Settings2, Volume2, Mail, Phone, Facebook, Instagram, Link as LinkIcon, Loader2 } from "lucide-react"
import { PrimaryButton } from "@/components/ui/primary-button"
import { Modal } from "@/components/ui/modal"
import { AnimatedGradientBackground } from "@/components/magicui/animated-gradient-background"
import { Sparkles } from "@/components/magicui/sparkles"
import { createClient } from "@/lib/supabase/client"
import { Room, RoomEvent, RemoteParticipant, Track, TokenSourceConfigurable, TokenSourceFixed } from "livekit-client"
import Image from "next/image"
// Import constants for video date defaults
import { getVideoDateDefaults } from "@/lib/constants/matching-constants"
import { showError, showWarning, showInfo } from "@/lib/utils/show-error"
import { getUserFriendlyError } from "@/lib/errors/user-friendly-messages"

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
  const matchIdParam = searchParams.get('matchId')
  // matchId is now UUID (TEXT) from Commander system
  const matchId = matchIdParam || null
  
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
  const [engineReady, setEngineReady] = useState(false) // Track if WebRTC engine is ready for publishing
  const [partnerLeft, setPartnerLeft] = useState(false)
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  const [cameraMicEnabled, setCameraMicEnabled] = useState(false) // Track if user has interacted (required for mobile autoplay)
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const localAudioRef = useRef<HTMLAudioElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  
  // Store MediaStreams in refs to avoid recreating them
  const remoteVideoStreamRef = useRef<MediaStream | null>(null)
  const remoteAudioStreamRef = useRef<MediaStream | null>(null)
  
  // Track the last attached track IDs to prevent unnecessary updates
  const lastAttachedVideoTrackIdRef = useRef<string | null>(null)
  const lastAttachedAudioTrackIdRef = useRef<string | null>(null)

  const [countdown, setCountdown] = useState(15) // 15 sec pre-date countdown
  const [countdownComplete, setCountdownComplete] = useState(false)
  const [countdownStartedAt, setCountdownStartedAt] = useState<string | null>(null) // Server timestamp for synchronized countdown
  const [timeLeft, setTimeLeft] = useState(300) // 5 min
  const [dateStartedAt, setDateStartedAt] = useState<string | null>(null) // Synchronized start time from database
  const [showPostModal, setShowPostModal] = useState(false)
  const [showPassModal, setShowPassModal] = useState(false)
  const [showMatchModal, setShowMatchModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showContactModal, setShowContactModal] = useState(false)
  const [showEndDateConfirm, setShowEndDateConfirm] = useState(false)
  const [showPartnerEndedDateModal, setShowPartnerEndedDateModal] = useState(false)
  const [waitingForPartner, setWaitingForPartner] = useState(false)
  const [exchangeSubscription, setExchangeSubscription] = useState<any>(null)
  const [userContactDetails, setUserContactDetails] = useState({
    email: "",
    phone: "",
    facebook: "",
    instagram: "",
    whatsapp: ""
  })
  const [shareContactDetails, setShareContactDetails] = useState({
    email: false,
    phone: false,
    facebook: false,
    instagram: false,
    whatsapp: false
  })
  const [partnerContactDetails, setPartnerContactDetails] = useState<{
    email?: string
    phone?: string
    facebook?: string
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
  // 🔒 LOCKED: Video date countdown defaults - DO NOT MODIFY
  // Video Date Countdown Defaults
  // These defaults ensure user privacy during countdown
  const videoDefaults = getVideoDateDefaults()
  const [countdownMuted, setCountdownMuted] = useState<boolean>(videoDefaults.muted) // Default to muted during countdown
  const [countdownVideoOff, setCountdownVideoOff] = useState<boolean>(videoDefaults.videoOff) // Default to video off during countdown

  // Video SPARK logging helpers
  const logVideoEvent = async (
    eventType: string,
    eventCategory: string,
    message: string,
    eventData: Record<string, any> = {}
  ) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      await supabase.rpc('video_spark_log_event_rpc', {
        p_video_date_id: videoDateId || '',
        p_match_id: matchId ? matchId.toString() : '',
        p_user_id: authUser.id,
        p_event_type: eventType,
        p_event_category: eventCategory,
        p_message: message,
        p_event_data: eventData
      })
    } catch (error) {
      // Silently fail - logging should never break the app
      console.error('Failed to log video event:', error)
    }
  }

  const logVideoError = async (
    errorType: string,
    errorMessage: string,
    errorDetails: Record<string, any> = {},
    stackTrace?: string
  ) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      await supabase.rpc('video_spark_log_error_rpc', {
        p_video_date_id: videoDateId || '',
        p_match_id: matchId ? matchId.toString() : '',
        p_user_id: authUser.id,
        p_error_type: errorType,
        p_error_message: errorMessage,
        p_error_details: errorDetails,
        p_stack_trace: stackTrace
      })
    } catch (error) {
      // Silently fail - logging should never break the app
      console.error('Failed to log video error:', error)
    }
  }

  // Fetch match data and initialize video date
  useEffect(() => {
    const initializeVideoDate = async () => {
      if (!matchId) {
        router.push('/spin')
        return
      }

      // Track that user arrived at video_date page
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (authUser) {
          console.log('🎯 [VIDEO_DATE_TRACKING] User arrived at video_date page - tracking arrival', {
            matchId: matchId,
            userId: authUser.id,
            timestamp: new Date().toISOString()
          })
          // Confirm arrival at video_date using the new function
          const { data: confirmed, error: trackError } = await supabase.rpc('confirm_video_date_arrival', {
            p_user_id: authUser.id,
            p_match_id: matchId
          })
          if (trackError) {
            console.error('❌ [VIDEO_DATE_TRACKING] Error tracking arrival:', trackError)
          } else {
            console.log('✅ [VIDEO_DATE_TRACKING] Successfully tracked user arrival at video_date', {
              matchId: matchId,
              userId: authUser.id
            })
          }
        }
      } catch (error) {
        console.error('❌ [VIDEO_DATE_TRACKING] Error tracking user arrival at video_date:', error)
      }

      try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
        if (authError || !authUser) {
          await logVideoError('auth_error', 'Failed to get authenticated user', { error: authError })
          router.push('/')
          return
        }

        await logVideoEvent('initialization', 'connection', 'Video date initialization started', { matchId })

        // Fetch video date data directly (contains user1_id and user2_id)
        const { data: videoDate, error: videoDateError } = await supabase
          .from('video_dates')
          .select('user1_id, user2_id')
          .eq('match_id', matchId)
          .single()

        if (videoDateError || !videoDate) {
          console.error('Error fetching video date:', videoDateError)
          await logVideoError('api_error', 'Failed to fetch video date', { matchId, error: videoDateError })
          router.push('/spin')
          return
        }

        await logVideoEvent('initialization', 'connection', 'Video date fetched successfully', { matchId })

        // Determine partner ID from video_dates
        const partnerId = videoDate.user1_id === authUser.id ? videoDate.user2_id : videoDate.user1_id

        // Fetch user and partner profiles
        const [userProfile, partnerProfile] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', authUser.id).single(),
          supabase.from('profiles').select('*').eq('id', partnerId).single()
        ])

        if (userProfile.error || partnerProfile.error) {
          console.error('Error fetching profiles:', userProfile.error || partnerProfile.error)
          await logVideoError('api_error', 'Failed to fetch profiles', { 
            userProfileError: userProfile.error,
            partnerProfileError: partnerProfile.error
          })
          router.push('/spin')
          return
        }

        await logVideoEvent('initialization', 'connection', 'Profiles fetched successfully', {
          userId: authUser.id,
          partnerId
        })

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

        // Check if video date already exists (match_id is now BIGINT)
        const { data: existingVideoDate } = await supabase
          .from('video_dates')
          .select('*')
          .eq('match_id', matchId)
          .single()

        let videoDateRecord
        if (existingVideoDate) {
          videoDateRecord = existingVideoDate
          setVideoDateId(existingVideoDate.id)
          
          // If countdown_started_at is missing, trigger should set it, but for existing records we'll update it
          // This ensures the timer continues correctly when users refresh
          if (!existingVideoDate.countdown_started_at && existingVideoDate.status === 'countdown') {
            await supabase
              .from('video_dates')
              .update({ countdown_started_at: existingVideoDate.created_at })
              .eq('id', existingVideoDate.id)
            videoDateRecord.countdown_started_at = existingVideoDate.created_at
          }
          
          // CRITICAL: If user refreshes during countdown, the RPC function will calculate the correct
          // remaining time based on countdown_started_at and database NOW(). Both users will see the same time.
          
          await logVideoEvent('initialization', 'connection', 'Existing video date found', {
            videoDateId: existingVideoDate.id,
            status: existingVideoDate.status
          })
        } else {
          // Create video date record - countdown_started_at will be set by database trigger using NOW()
          // This ensures both users get the exact same timestamp for perfect synchronization
          // CRITICAL: Handle race condition - if both users try to create at the same time,
          // one will get a unique constraint violation (match_id unique), so we fetch the existing record
          const { data: newVideoDate, error: videoDateError } = await supabase
            .from('video_dates')
            .insert({
              match_id: matchId,
              user1_id: videoDate.user1_id,
              user2_id: videoDate.user2_id,
              status: 'countdown'
              // countdown_started_at will be set automatically by database trigger
            })
            .select()
            .single()

          if (videoDateError) {
            // Check if error is due to unique constraint violation (race condition)
            // PostgreSQL error code 23505 = unique_violation
            if (videoDateError.code === '23505' || videoDateError.message?.includes('unique') || videoDateError.message?.includes('duplicate')) {
              console.log('⚠️ Video date already exists (race condition), fetching existing record...')
              
              // Another user created the record first, fetch it (match_id is BIGINT)
              const { data: existingRecord, error: fetchError } = await supabase
                .from('video_dates')
                .select('*')
                .eq('match_id', matchId)
                .single()
              
              if (fetchError || !existingRecord) {
                console.error('Error fetching existing video date after race condition:', fetchError)
                await logVideoError('api_error', 'Failed to fetch existing video date after race condition', {
                  error: fetchError,
                  matchId
                })
                router.push('/spin')
                return
              }
              
              // Use the existing record
              videoDateRecord = existingRecord
              setVideoDateId(existingRecord.id)
              await logVideoEvent('initialization', 'connection', 'Using existing video date (race condition handled)', {
                videoDateId: existingRecord.id,
                status: existingRecord.status
              })
            } else {
              // Some other error occurred
            console.error('Error creating video date:', {
              error: videoDateError,
              message: videoDateError.message,
              code: videoDateError.code,
              details: videoDateError.details,
              hint: videoDateError.hint,
              matchId,
              user1_id: videoDate?.user1_id,
              user2_id: videoDate?.user2_id,
              authUserId: authUser.id
            })
            await logVideoError('api_error', 'Failed to create video date', {
              error: videoDateError,
              matchId,
              user1_id: videoDate?.user1_id,
              user2_id: videoDate?.user2_id
            })
            router.push('/spin')
            return
          }
          } else {
            // Successfully created new record
          videoDateRecord = newVideoDate
          setVideoDateId(newVideoDate.id)
          await logVideoEvent('initialization', 'connection', 'Video date created', {
            videoDateId: newVideoDate.id,
            status: 'countdown'
          })
          }
        }
        
        // Store countdown start time for synchronization
        if (videoDateRecord.countdown_started_at) {
          setCountdownStartedAt(videoDateRecord.countdown_started_at)
        } else if (videoDateRecord.created_at) {
          // Fallback to created_at if countdown_started_at is missing
          setCountdownStartedAt(videoDateRecord.created_at)
        }
        
        // Check if partner already ended the date
        if (videoDateRecord.status === 'ended_early' && videoDateRecord.ended_by_user_id) {
          const { data: { user: authUser } } = await supabase.auth.getUser()
          if (authUser && videoDateRecord.ended_by_user_id !== authUser.id) {
            // Partner already ended the date before this user loaded the page
            console.log('⚠️ Partner already ended the date - showing modal')
            setShowPartnerEndedDateModal(true)
          }
        }
        
        // If video date is already active, set countdown as complete and use started_at for timer
        if (videoDateRecord.status === 'active') {
          console.log('✅ Video date already active, setting countdown complete and syncing timer')
          setCountdownComplete(true)
          setCountdown(0)
          
          // Use started_at from database - NEVER calculate on client
          if (videoDateRecord.started_at) {
            console.log('📅 Using started_at from database:', videoDateRecord.started_at)
            setDateStartedAt(videoDateRecord.started_at)
          } else if (videoDateRecord.status === 'active') {
            // If status is active but started_at is missing, trigger should set it
            // Fetch the latest record to get started_at set by trigger
            console.log('⚠️ started_at missing for active date, fetching from database...')
            supabase
              .from('video_dates')
              .select('started_at')
              .eq('id', videoDateRecord.id)
              .single()
              .then(({ data, error }) => {
                if (error) {
                  console.error('❌ Error fetching started_at:', error)
                  return
                }
                if (data?.started_at) {
                  console.log('✅ Found started_at in database:', data.started_at)
                  setDateStartedAt(data.started_at)
                } else {
                  console.error('❌ started_at still missing after fetch - trigger may not have fired')
                }
              })
          }
        } else if (videoDateRecord.started_at) {
          // Store date started_at if it exists (for completed dates)
          setDateStartedAt(videoDateRecord.started_at)
        }

        // Check media device availability before proceeding
        // This prevents errors when LiveKit tries to access media devices
        if (typeof window !== 'undefined') {
          const hasMediaDevices = navigator?.mediaDevices?.getUserMedia
          const isSecureContext = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          
          if (!isSecureContext) {
            console.warn('⚠️ Not in secure context (HTTPS/localhost). Media devices may not be available.')
          }
          
          if (!hasMediaDevices) {
            console.warn('⚠️ navigator.mediaDevices.getUserMedia not available. This may cause errors, but connection will still be attempted.')
          }
        }

        // Generate LiveKit room name and tokens
        const roomName = `date-${matchId}`
        // Trim whitespace/newlines from URL (common issue when setting env vars)
        const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim()

        if (!wsUrl) {
          console.error('❌ LiveKit URL not configured')
          await logVideoError('configuration_error', 'LiveKit URL not configured', {
            hasEnvVar: !!process.env.NEXT_PUBLIC_LIVEKIT_URL
          })
          router.push('/spin')
          return
        }
        
        // Validate URL format
        if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
          console.error('❌ Invalid LiveKit URL format (must start with ws:// or wss://):', wsUrl)
          await logVideoError('configuration_error', 'Invalid LiveKit URL format', {
            wsUrl,
            expectedFormat: 'ws:// or wss://'
          })
          router.push('/spin')
          return
        }
        
        // Validate URL matches LiveKit Cloud format
        if (!wsUrl.includes('livekit.cloud') && !wsUrl.includes('livekit.io')) {
          console.warn('⚠️ LiveKit URL does not match expected format (should contain livekit.cloud or livekit.io):', wsUrl)
          await logVideoError('configuration_error', 'LiveKit URL format warning', {
            wsUrl,
            note: 'URL should match your LiveKit Cloud project URL'
          })
        }
        
        console.log('🔗 LiveKit connection details:', {
          wsUrl: wsUrl.replace(/\/\/.*@/, '//***@'), // Hide credentials in URL if any
          roomName,
          username: authUser.id
        })

        await logVideoEvent('initialization', 'connection', 'Requesting LiveKit token', { roomName })

        // Pre-fetch initial token to avoid connection errors
        // This ensures we have a valid token before attempting connection
        // Tokens last 6 hours, which is more than enough for video dates
        console.log('🔄 Pre-fetching initial LiveKit token...')
        const initialTokenResponse = await fetch(
          `/api/livekit-token?room=${encodeURIComponent(roomName)}&username=${encodeURIComponent(authUser.id)}`
        )
        
        if (!initialTokenResponse.ok) {
          const errorText = await initialTokenResponse.text()
          let errorMessage = `Failed to fetch initial token: ${initialTokenResponse.status} ${errorText}`
          
          // If it's a 500 error, check diagnostics
          if (initialTokenResponse.status === 500) {
            try {
              const diagnosticsResponse = await fetch('/api/livekit-token/diagnostics')
              const diagnostics = await diagnosticsResponse.json()
              if (diagnostics.errors && diagnostics.errors.length > 0) {
                errorMessage = `LiveKit configuration error: ${diagnostics.errors.join(', ')}. ${diagnostics.recommendations?.join(' ')}`
                console.error('❌ LiveKit diagnostics:', diagnostics)
              }
            } catch (diagError) {
              console.warn('Could not fetch diagnostics:', diagError)
            }
          }
          
          await logVideoError('token_fetch_failed', 'Failed to fetch LiveKit token', {
            status: initialTokenResponse.status,
            errorText,
            roomName
          })
          showError(new Error(errorMessage))
          router.push('/spin')
          return
        }
        
        const initialTokenData = await initialTokenResponse.json()
        if (!initialTokenData.token) {
          const errorMessage = 'No token in initial token response. Check LiveKit configuration in Vercel environment variables.'
          await logVideoError('token_missing', 'No token in response', {
            response: initialTokenData,
            roomName
          })
          showError(new Error(errorMessage))
          router.push('/spin')
          return
        }
        
        console.log('✅ Initial token pre-fetched successfully')
        
        // Use token directly - TokenSourceFixed may be abstract in this version
        // We'll handle token refresh manually if needed
        const token = initialTokenData.token

        await logVideoEvent('initialization', 'connection', 'Initializing LiveKit connection with token source', { roomName })

        // Connect to LiveKit room with error handling configuration
        const livekitRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
          // Don't automatically publish tracks - wait for user interaction
          publishDefaults: {
            videoCodec: 'vp8',
            audioPreset: {
              maxBitrate: 16000,
            },
          },
          // Improve connection reliability
          disconnectOnPageLeave: false, // Keep connection when navigating away temporarily
        })

        // Set up event listeners
        livekitRoom.on(RoomEvent.Connected, async () => {
          // CRITICAL: When room connects, check for any existing local video tracks
          // This handles cases where tracks were published before connection or TrackPublished event was missed
          setTimeout(() => {
            if (livekitRoom && livekitRoom.state === 'connected') {
              const localParticipant = livekitRoom.localParticipant
              const videoPubs = Array.from(localParticipant.videoTrackPublications.values())
              const videoPub = videoPubs.find(pub => pub.track && pub.track.mediaStreamTrack)
              
              if (videoPub?.track?.mediaStreamTrack && !localVideoTrack) {
                const track = videoPub.track.mediaStreamTrack
                console.log('✅ Found existing local video track on room connect, setting in state:', track.id)
                setLocalVideoTrack(track)
                setIsVideoOff(false)
                setCountdownVideoOff(false)
                
                // Attach to video element if available
                if (localVideoRef.current) {
                  try {
                    const stream = new MediaStream([track])
                    localVideoRef.current.srcObject = stream
                    localVideoRef.current.style.opacity = '1'
                    localVideoRef.current.style.display = 'block'
                    localVideoRef.current.style.visibility = 'visible'
                    localVideoRef.current.play().catch(() => {})
                  } catch (err) {
                    console.error('Error attaching video on room connect:', err)
                  }
                }
              }
            }
          }, 500) // Small delay to ensure everything is initialized
          setIsConnected(true)
          console.log('✅ Connected to LiveKit room')
          console.log('📊 Room state:', {
            state: livekitRoom.state,
            localParticipant: livekitRoom.localParticipant.identity,
            remoteParticipantsCount: livekitRoom.remoteParticipants.size,
            remoteParticipantIdentities: Array.from(livekitRoom.remoteParticipants.values()).map(p => p.identity)
          })
          
          await logVideoEvent('room_connected', 'connection', 'Connected to LiveKit room', {
            roomName,
            remoteParticipantsCount: livekitRoom.remoteParticipants.size
          })
          
          // Wait for WebRTC engine to be ready before allowing publishing
          // The room.connect() completes when signaling is ready, but engine needs more time
          console.log('⏳ Waiting for WebRTC engine to be ready...')
          
          // Check engine readiness more reliably
          const checkEngineReady = () => {
            // Check if room is connected and has proper state
            if (livekitRoom.state === 'connected' && livekitRoom.engine) {
              setEngineReady(true)
              console.log('✅ WebRTC engine ready - publishing operations can proceed')
              return true
            }
            return false
          }
          
          // Try immediately
          if (checkEngineReady()) {
            return
          }
          
          // If not ready, check periodically
          let attempts = 0
          const maxAttempts = 20 // 10 seconds total (20 * 500ms)
          const checkInterval = setInterval(() => {
            attempts++
            if (checkEngineReady() || attempts >= maxAttempts) {
              clearInterval(checkInterval)
              if (attempts >= maxAttempts && !engineReady) {
                // Even if we can't detect it, mark as ready after timeout
                // The actual publish will handle errors
                setEngineReady(true)
                console.log('⚠️ Engine ready check timed out, but marking as ready (publish will handle errors)')
              }
            }
          }, 500) // Check every 500ms
          
          // Function to check and subscribe to remote tracks
          const checkAndSubscribeToRemoteTracks = () => {
            console.log('🔍 Checking remote participants and tracks...')
            livekitRoom.remoteParticipants.forEach((participant) => {
              console.log(`👤 Remote participant: ${participant.identity}, has ${participant.trackPublications.size} track publications`)
              participant.trackPublications.forEach((publication) => {
                console.log(`  📹 ${publication.kind} track: SID=${publication.trackSid}, isSubscribed=${publication.isSubscribed}, hasTrack=${!!publication.track}`)
                
                // If already subscribed and has track, set it in state immediately
                if (publication.isSubscribed && publication.track) {
                  console.log(`✅ ${publication.kind} track already subscribed, setting in state`)
                  const track = publication.track
                  if (publication.kind === 'video') {
                    setRemoteVideoTrack((current) => {
                      if (current && current.id === track.mediaStreamTrack.id) {
                        return current // Keep existing reference
                      }
                      return track.mediaStreamTrack
                    })
                  } else if (publication.kind === 'audio') {
                    setRemoteAudioTrack((current) => {
                      if (current && current.id === track.mediaStreamTrack.id) {
                        return current
                      }
                      return track.mediaStreamTrack
                    })
                  }
                }
                // If not subscribed, subscribe to it
                else if (!publication.isSubscribed) {
                  console.log(`📥 Subscribing to ${publication.kind} track: ${publication.trackSid}`)
                  try {
                    // setSubscribed might return a Promise or be synchronous
                    if (typeof publication.setSubscribed === 'function') {
                      try {
                        publication.setSubscribed(true)
                        console.log(`✅ setSubscribed called for ${publication.kind}`)
                      } catch (err: any) {
                          // Error subscribing to track - retry logic handles this, don't log
                      }
                    }
                  } catch (err) {
                    // Error subscribing to track - retry logic handles this, don't log
                  }
                }
              })
            })
          }
          
          // Check immediately
          checkAndSubscribeToRemoteTracks()
          
          // Also check after a delay to catch tracks published after connection
          setTimeout(checkAndSubscribeToRemoteTracks, 2000)
          setTimeout(checkAndSubscribeToRemoteTracks, 5000)
        })

        livekitRoom.on(RoomEvent.Disconnected, async (reason) => {
          setIsConnected(false)
          setEngineReady(false) // Reset engine ready state on disconnect
          console.log('Disconnected from LiveKit room', reason)
          
          // Log specific disconnect reasons for debugging
          if (reason) {
            console.log('Disconnect reason details:', {
              reason: reason.toString(),
              code: (reason as any)?.code,
              message: (reason as any)?.message
            })
          }
          
          // Clean up tracks when room disconnects to prevent "skipping incoming track" errors
          setLocalVideoTrack(null)
          setLocalAudioTrack(null)
          setRemoteVideoTrack(null)
          setRemoteAudioTrack(null)
          
          await logVideoEvent('room_disconnected', 'connection', 'Disconnected from LiveKit room', { 
            reason: reason?.toString(),
            reasonCode: (reason as any)?.code,
            reasonMessage: (reason as any)?.message
          })
        })
        
        // Handle connection errors
        livekitRoom.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
          if (quality === 'poor' || quality === 'lost') {
            console.warn(`⚠️ Connection quality degraded: ${quality} for ${participant?.identity || 'unknown'}`)
          }
        })
        
        // Handle media track errors
        livekitRoom.on(RoomEvent.MediaDevicesError, (error) => {
          console.error('❌ Media devices error:', error)
          // Call logVideoError without await - event handlers don't need to be async
          logVideoError('media_devices_error', 'Media devices error', { error: error.message }).catch((err) => {
            console.error('Failed to log video error:', err)
          })
        })

        livekitRoom.on(RoomEvent.ParticipantConnected, async (participant: RemoteParticipant) => {
          if (participant.identity !== authUser.id) {
            console.log('👤 Remote participant connected:', participant.identity)
            await logVideoEvent('participant_connected', 'connection', 'Partner connected to room', {
              participantId: participant.identity
            })
            // Subscribe to all existing tracks from this remote participant
            participant.trackPublications.forEach((publication) => {
              console.log('📹 Checking track on participant connect:', publication.kind, 'isSubscribed:', publication.isSubscribed, 'hasTrack:', !!publication.track)
              
              // If already subscribed and has track, set it in state immediately
              if (publication.isSubscribed && publication.track) {
                console.log('✅ Track already subscribed on connect, setting in state:', publication.kind)
                const track = publication.track
                if (track) {
                if (publication.kind === 'video') {
                  setRemoteVideoTrack((current) => {
                      if (current && current.id === track.mediaStreamTrack.id) {
                      return current
                    }
                      return track.mediaStreamTrack
                  })
                } else if (publication.kind === 'audio') {
                  setRemoteAudioTrack((current) => {
                      if (current && current.id === track.mediaStreamTrack.id) {
                      return current
                    }
                      return track.mediaStreamTrack
                  })
                  }
                }
              }
              // If not subscribed, subscribe to it
              else if (!publication.isSubscribed) {
                console.log('📹 Subscribing to existing remote track:', publication.kind, publication.trackSid)
                try {
                  // setSubscribed might return a Promise or be synchronous
                  if (typeof publication.setSubscribed === 'function') {
                    try {
                      publication.setSubscribed(true)
                      console.log('✅ setSubscribed called for existing remote track')
                    } catch (err: any) {
                        console.error('Error subscribing to existing remote track:', err)
                    }
                  }
                } catch (err) {
                  console.error('Error subscribing to existing remote track:', err)
                }
              }
            })
          }
        })

        livekitRoom.on(RoomEvent.ParticipantDisconnected, async (participant: RemoteParticipant) => {
          if (participant.identity !== authUser.id) {
            setPartnerLeft(true)
            await logVideoEvent('participant_disconnected', 'connection', 'Partner disconnected from room', {
              participantId: participant.identity
            })
            handleEarlyExit()
          }
        })

        livekitRoom.on(RoomEvent.TrackSubscribed, async (track, publication, participant) => {
          // Only process if room is still connected to prevent "skipping incoming track" errors
          if (livekitRoom.state === 'disconnected') {
            return // Room is disconnected, ignore track subscriptions
          }
          
          // Only process remote tracks - local tracks are handled separately
          // This prevents "could not find local track subscription" warnings
          if (participant.identity === authUser.id) {
            // This is a local track - LiveKit handles this internally
            // Processing it here can cause subscription mismatches
            return
          }
          
          if (participant.identity !== authUser.id) {
            console.log('📹 Remote track subscribed:', track.kind, publication.trackSid, 'from participant:', participant.identity, 'track:', !!track, 'mediaStreamTrack:', !!track?.mediaStreamTrack, 'track readyState:', track?.mediaStreamTrack?.readyState)
            
            await logVideoEvent('track_subscribed', 'media', `Remote ${track.kind} track subscribed`, {
              trackKind: track.kind,
              trackSid: publication.trackSid,
              participantId: participant.identity,
              hasTrack: !!track,
              hasMediaStreamTrack: !!track?.mediaStreamTrack
            })
            if (track && track.mediaStreamTrack) {
              // Check if track is still active
              if (track.mediaStreamTrack.readyState === 'ended') {
                // Track already ended - this is expected, don't log
                return
              }
              
              if (track.kind === 'video') {
                console.log('✅ TrackSubscribed: Attaching video track, track ID:', track.mediaStreamTrack.id, 'readyState:', track.mediaStreamTrack.readyState)
                
                // CRITICAL: Ensure video element exists and is in DOM
                // If not ready, update state and retry attachment
                if (!remoteVideoRef.current) {
                  // Video element not ready - retry logic handles this automatically
                  setRemoteVideoTrack(track.mediaStreamTrack)
                  // Retry attachment after a delay
                  setTimeout(() => {
                    if (remoteVideoRef.current && track.mediaStreamTrack) {
                      console.log('✅ Video element now available, retrying attachment')
                      // Re-trigger attachment logic
                      const mediaTrack = track.mediaStreamTrack
                      if (!remoteVideoStreamRef.current) {
                        remoteVideoStreamRef.current = new MediaStream()
                      }
                      if (remoteVideoStreamRef.current) {
                      remoteVideoStreamRef.current.addTrack(mediaTrack)
                      }
                      if (remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = remoteVideoStreamRef.current
                        remoteVideoRef.current.play().catch(() => {})
                      }
                    }
                  }, 200)
                  return
                }
                
                const videoElement = remoteVideoRef.current
                
                // Check if element is in DOM
                if (!videoElement.isConnected) {
                  // Video element not in DOM yet - retry logic handles this, don't log
                  setRemoteVideoTrack(track.mediaStreamTrack)
                  // Retry after a delay
                  setTimeout(() => {
                    if (remoteVideoRef.current && remoteVideoRef.current.isConnected && track.mediaStreamTrack) {
                      console.log('✅ Video element now in DOM, proceeding with attachment')
                      const mediaTrack = track.mediaStreamTrack
                      if (!remoteVideoStreamRef.current) {
                        remoteVideoStreamRef.current = new MediaStream()
                      }
                      if (remoteVideoStreamRef.current) {
                      remoteVideoStreamRef.current.addTrack(mediaTrack)
                      }
                      if (remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = remoteVideoStreamRef.current
                        remoteVideoRef.current.play().catch(() => {})
                      }
                    }
                  }, 200)
                  return
                }
                
                const mediaTrack = track.mediaStreamTrack
                
                // Check element visibility and dimensions
                const rect = videoElement.getBoundingClientRect()
                const isVisible = rect.width > 0 && rect.height > 0 && 
                                 videoElement.offsetWidth > 0 && 
                                 videoElement.offsetHeight > 0
                
                console.log('📹 Video element ready:', {
                  hasElement: !!videoElement,
                  isConnected: videoElement.isConnected,
                  hasSrcObject: !!videoElement.srcObject,
                  paused: videoElement.paused,
                  readyState: videoElement.readyState,
                  width: rect.width,
                  height: rect.height,
                  offsetWidth: videoElement.offsetWidth,
                  offsetHeight: videoElement.offsetHeight,
                  isVisible: isVisible,
                  trackReadyState: mediaTrack.readyState,
                  trackEnabled: mediaTrack.enabled,
                  trackMuted: mediaTrack.muted
                })
                
                if (!isVisible) {
                  console.warn('⚠️ Video element has zero dimensions! This might prevent streaming.')
                }
                
                // Try using LiveKit's attach() method if available
                if (typeof (track as any).attach === 'function') {
                  console.log('📹 Using LiveKit track.attach() method')
                  try {
                    (track as any).attach(videoElement)
                    console.log('✅ Track attached using LiveKit attach() method')
                    setRemoteVideoTrack(mediaTrack)
                    
                    // Try to play after a short delay
                    setTimeout(() => {
                      if (videoElement && videoElement.paused) {
                        videoElement.play().catch(err => {
                          if (err.name !== 'NotAllowedError') {
                            // Error playing video - fallback handles this, don't log
                          }
                        })
                      }
                    }, 200)
                    return // Successfully attached
                  } catch (err) {
                    // track.attach() failed - fallback to MediaStream handles this
                  }
                }
                
                // Fallback: Use MediaStream approach
                console.log('📹 Using MediaStream approach for video track')
                if (!remoteVideoStreamRef.current) {
                  console.log('📹 Creating remote video stream for first track')
                  remoteVideoStreamRef.current = new MediaStream()
                }
                
                // Remove any existing video tracks from the stream
                if (remoteVideoStreamRef.current) {
                const existingVideoTracks = remoteVideoStreamRef.current.getVideoTracks()
                existingVideoTracks.forEach(t => {
                  console.log('🗑️ Removing old video track from stream:', t.id)
                    remoteVideoStreamRef.current?.removeTrack(t)
                })
                
                // Ensure track is enabled
                if (!mediaTrack.enabled) {
                  console.log('⚠️ Track is disabled, enabling it')
                  mediaTrack.enabled = true
                }
                
                // Add the new track immediately (don't wait for 'live' state)
                console.log('➕ Adding new video track to stream:', mediaTrack.id, 'readyState:', mediaTrack.readyState, 'enabled:', mediaTrack.enabled)
                remoteVideoStreamRef.current.addTrack(mediaTrack)
                }
                
                // Listen for track state changes
                const handleTrackStarted = () => {
                  console.log('🎬 Track started event fired')
                  if (remoteVideoRef.current && remoteVideoRef.current.paused) {
                    remoteVideoRef.current.play().catch(() => {})
                  }
                }
                
                const handleTrackEnded = () => {
                  // Track ended - this is expected, don't log
                }
                
                const handleTrackUnmute = () => {
                  console.log('✅ Track unmuted event fired')
                  if (remoteVideoRef.current && remoteVideoRef.current.paused) {
                    remoteVideoRef.current.play().catch(() => {})
                  }
                }
                
                // Add event listeners to track
                mediaTrack.addEventListener('started', handleTrackStarted)
                mediaTrack.addEventListener('ended', handleTrackEnded)
                mediaTrack.addEventListener('unmute', handleTrackUnmute)
                
                // CRITICAL: Always set srcObject to ensure it's attached
                // Even if it was set before, we need to ensure it has the current stream
                console.log('📹 Setting/updating srcObject for remote video')
                
                // Ensure video element exists and is ready
                if (!remoteVideoRef.current) {
                  console.error('❌ remoteVideoRef.current is null in TrackSubscribed!')
                  setRemoteVideoTrack(mediaTrack)
                  return
                }
                
                const videoEl = remoteVideoRef.current
                
                // Always update srcObject to ensure it has the current stream
                videoEl.srcObject = remoteVideoStreamRef.current
                
                // Robust play function with comprehensive checks
                const tryPlay = (attempt: number = 1, maxAttempts: number = 10) => {
                  if (!videoEl || !videoEl.srcObject) {
                    if (attempt < maxAttempts) {
                      console.warn(`⚠️ Video element or srcObject missing (attempt ${attempt}), retrying...`)
                      setTimeout(() => tryPlay(attempt + 1, maxAttempts), 200)
                    }
                    return
                  }
                  
                  const stream = videoEl.srcObject as MediaStream
                  const tracks = stream.getVideoTracks()
                  
                  if (tracks.length === 0) {
                    if (attempt < maxAttempts) {
                      // No tracks in stream - retry logic handles this
                      setTimeout(() => tryPlay(attempt + 1, maxAttempts), 200)
                    }
                    return
                  }
                  
                  const track = tracks[0]
                  
                  // Ensure track is enabled and active
                  if (!track.enabled) {
                    console.log('⚠️ Track is disabled, enabling it')
                    track.enabled = true
                  }
                  
                  if (track.readyState === 'ended') {
                    console.warn('⚠️ Track is ended, cannot play')
                    return
                  }
                  
                  // Only try to play if paused
                  if (videoEl.paused) {
                    console.log(`▶️ Attempting to play remote video (attempt ${attempt}), track readyState:`, track.readyState, 'enabled:', track.enabled)
                    
                    const playPromise = videoEl.play()
                    if (playPromise !== undefined) {
                      playPromise
                        .then(() => {
                          console.log('✅ Remote video playing successfully')
                        })
                        .catch(err => {
                          if (err.name === 'NotAllowedError') {
                            console.log('⚠️ Play blocked (needs user interaction)')
                          } else if (err.name === 'AbortError') {
                            console.warn('⚠️ Play aborted, will retry')
                            if (attempt < maxAttempts) {
                              setTimeout(() => tryPlay(attempt + 1, maxAttempts), 200)
                            }
                          } else {
                            console.error('Error playing remote video:', err)
                            if (attempt < maxAttempts) {
                              setTimeout(() => tryPlay(attempt + 1, maxAttempts), 500)
                            }
                          }
                        })
                    }
                  } else {
                    console.log('✅ Remote video is already playing')
                  }
                }
                
                // Try playing multiple times with increasing delays for maximum reliability
                tryPlay(1, 10)
                setTimeout(() => tryPlay(2, 10), 100)
                setTimeout(() => tryPlay(3, 10), 300)
                setTimeout(() => tryPlay(4, 10), 500)
                setTimeout(() => tryPlay(5, 10), 1000)
                setTimeout(() => tryPlay(6, 10), 2000)
                
                // Update state
                setRemoteVideoTrack(mediaTrack)
              } else if (track.kind === 'audio') {
                console.log('✅ TrackSubscribed: Attaching audio track, track ID:', track.mediaStreamTrack.id)
                
                // Try using LiveKit's attach() method if available
                if (remoteAudioRef.current && typeof (track as any).attach === 'function') {
                  console.log('🔊 Using LiveKit track.attach() method for audio')
                  try {
                    (track as any).attach(remoteAudioRef.current)
                    console.log('✅ Audio track attached using LiveKit attach() method')
                    setRemoteAudioTrack(track.mediaStreamTrack)
                    return
                  } catch (err) {
                    console.warn('⚠️ track.attach() failed for audio, falling back to MediaStream:', err)
                  }
                }
                
                // Fallback: Use MediaStream approach
                if (!remoteAudioStreamRef.current) {
                  console.log('🔊 Creating remote audio stream for first track')
                  remoteAudioStreamRef.current = new MediaStream()
                }
                
                if (remoteAudioStreamRef.current) {
                const existingAudioTracks = remoteAudioStreamRef.current.getAudioTracks()
                existingAudioTracks.forEach(t => {
                  console.log('🗑️ Removing old audio track from stream:', t.id)
                    remoteAudioStreamRef.current?.removeTrack(t)
                })
                
                console.log('➕ Adding new audio track to stream:', track.mediaStreamTrack.id)
                remoteAudioStreamRef.current.addTrack(track.mediaStreamTrack)
                }
                
                if (remoteAudioRef.current && !remoteAudioRef.current.srcObject) {
                  console.log('🔊 Setting srcObject for remote audio (first time)')
                  remoteAudioRef.current.srcObject = remoteAudioStreamRef.current
                  remoteAudioRef.current.play().catch(err => {
                    if (err.name !== 'NotAllowedError') {
                      console.error('Error playing remote audio:', err)
                    }
                  })
                }
                
                setRemoteAudioTrack(track.mediaStreamTrack)
              }
            } else {
              // TrackSubscribed but track missing - this is handled, don't log
            }
          }
        })

        livekitRoom.on(RoomEvent.TrackUnsubscribed, async (track, publication, participant) => {
          // Only process if room is still connected to prevent errors
          if (livekitRoom.state === 'disconnected') {
            return // Room is disconnected, ignore track unsubscriptions
          }
          
          if (participant.identity !== authUser.id) {
            console.log('📹 Remote track unsubscribed:', track.kind, publication.trackSid, 'from participant:', participant.identity)
            
            await logVideoEvent('track_unsubscribed', 'media', `Remote ${track.kind} track unsubscribed`, {
              trackKind: track.kind,
              trackSid: publication.trackSid,
              participantId: participant.identity
            })
            
            if (track && track.mediaStreamTrack) {
              if (track.kind === 'video') {
                // Try using LiveKit's detach() method if available
                if (remoteVideoRef.current && typeof (track as any).detach === 'function') {
                  console.log('📹 Using LiveKit track.detach() method')
                  try {
                    (track as any).detach(remoteVideoRef.current)
                    console.log('✅ Track detached using LiveKit detach() method')
                  } catch (err) {
                    console.warn('⚠️ track.detach() failed:', err)
                  }
                }
                
                // Also remove from MediaStream if using that approach
                if (remoteVideoStreamRef.current) {
                  console.log('🗑️ Removing video track from stream:', track.mediaStreamTrack.id)
                  remoteVideoStreamRef.current.removeTrack(track.mediaStreamTrack)
                }
                
                // Clear state if this was the current track
                setRemoteVideoTrack((current) => {
                  if (current && current.id === track.mediaStreamTrack.id) {
                    return null
                  }
                  return current
                })
              } else if (track.kind === 'audio') {
                // Try using LiveKit's detach() method if available
                if (remoteAudioRef.current && typeof (track as any).detach === 'function') {
                  console.log('🔊 Using LiveKit track.detach() method for audio')
                  try {
                    (track as any).detach(remoteAudioRef.current)
                    console.log('✅ Audio track detached using LiveKit detach() method')
                  } catch (err) {
                    console.warn('⚠️ track.detach() failed for audio:', err)
                  }
                }
                
                // Also remove from MediaStream if using that approach
                if (remoteAudioStreamRef.current) {
                  console.log('🗑️ Removing audio track from stream:', track.mediaStreamTrack.id)
                  remoteAudioStreamRef.current.removeTrack(track.mediaStreamTrack)
                }
                
                setRemoteAudioTrack((current) => {
                  if (current && current.id === track.mediaStreamTrack.id) {
                    return null
                  }
                  return current
                })
              }
            }
          }
        })

        // Listen for track publications (for both local and remote)
        livekitRoom.on(RoomEvent.TrackPublished, (publication, participant) => {
          // Only process if room is still connected to prevent errors
          if (livekitRoom.state === 'disconnected') {
            return // Room is disconnected, ignore track publications
          }
          
          console.log('📢 TrackPublished event:', {
            kind: publication.kind,
            trackSid: publication.trackSid,
            participantIdentity: participant.identity,
            isLocal: participant.identity === authUser.id,
            isSubscribed: publication.isSubscribed,
            hasTrack: !!publication.track,
            roomState: livekitRoom.state
          })
          
          // Handle local track publications
          if (participant.identity === authUser.id && publication.track) {
            console.log('📹 Local track published:', publication.kind, publication.trackSid, publication.track.mediaStreamTrack.id)
            if (publication.kind === 'video') {
              console.log('✅ Setting local video track from TrackPublished event')
              const videoTrack = publication.track.mediaStreamTrack
              
              // Ensure track is enabled
              if (!videoTrack.enabled) {
                console.log('⚠️ Video track is disabled in TrackPublished, enabling it')
                videoTrack.enabled = true
              }
              
              setLocalVideoTrack(videoTrack)
              setCameraMicEnabled(true) // Mark as enabled when we get a track
              
              // CRITICAL: Ensure video is not marked as off and countdown video is on
              setIsVideoOff(false)
              setCountdownVideoOff(false)
              
              // CRITICAL: Use direct ref attachment (bypasses React state delay)
              console.log('📹 TrackPublished: Attaching video track directly to element')
              const attached = attachTrackToVideoElement(videoTrack)
              if (attached) {
                console.log('✅ TrackPublished: Video track attached directly, user should see video immediately')
              } else {
                console.warn('⚠️ TrackPublished: Failed to attach video track directly')
              }
              
              // Note: The main useEffect will also handle attachment as a fallback
              console.log('📹 TrackPublished: Video track set in state and attached to element')
            } else if (publication.kind === 'audio') {
              console.log('✅ Setting local audio track from TrackPublished event')
              setLocalAudioTrack(publication.track.mediaStreamTrack)
              setCameraMicEnabled(true) // Mark as enabled when we get a track
            }
          } 
          // Handle remote track publications - explicitly subscribe to them
          else if (participant.identity !== authUser.id) {
            console.log('📹 Remote track published:', publication.kind, publication.trackSid, 'from participant:', participant.identity, 'isSubscribed:', publication.isSubscribed)
            // Explicitly subscribe to the remote track
            if (!publication.isSubscribed) {
              console.log('📥 Subscribing to remote track:', publication.kind, publication.trackSid)
              
              // Retry subscription with multiple attempts
              const subscribeToTrack = async (attempt: number = 1) => {
                try {
                  // Try multiple subscription methods for compatibility
                  if (typeof publication.setSubscribed === 'function') {
                    try {
                      publication.setSubscribed(true)
                      console.log('✅ Subscription call completed (sync)')
                    } catch (err: any) {
                        console.error(`Error subscribing to remote track (attempt ${attempt}):`, err)
                        // Retry up to 3 times
                        if (attempt < 3) {
                          setTimeout(() => subscribeToTrack(attempt + 1), 1000 * attempt)
                        }
                    }
                  } else if (typeof (publication as any).subscribe === 'function') {
                    // Alternative subscription method
                    await (publication as any).subscribe().catch((err: any) => {
                      console.error('Error subscribing via subscribe() method:', err)
                    })
                  }
                  // Also try subscribing via participant if available
                  if (typeof (participant as any).subscribeToTrack === 'function') {
                    (participant as any).subscribeToTrack(publication.trackSid, true).catch((err: any) => {
                      console.error('Error subscribing via participant:', err)
                    })
                  }
                } catch (err) {
                  console.error(`Error subscribing to remote track (attempt ${attempt}):`, err)
                  // Retry up to 3 times
                  if (attempt < 3) {
                    setTimeout(() => subscribeToTrack(attempt + 1), 1000 * attempt)
                  }
                }
              }
              
              subscribeToTrack(1)
            } else {
              console.log('✅ Remote track already subscribed:', publication.kind)
              // Even if subscribed, ensure track is in state if it has a track
              const track = publication.track
              if (track && track.mediaStreamTrack) {
                if (publication.kind === 'video') {
                  setRemoteVideoTrack((current) => {
                    if (current && current.id === track.mediaStreamTrack.id) {
                      return current
                    }
                    return track.mediaStreamTrack
                  })
                } else if (publication.kind === 'audio') {
                  setRemoteAudioTrack((current) => {
                    if (current && current.id === track.mediaStreamTrack.id) {
                      return current
                    }
                    return track.mediaStreamTrack
                  })
                }
              }
            }
          }
        })

        // Listen for track unpublications
        livekitRoom.on(RoomEvent.TrackUnpublished, (publication, participant) => {
          // Only process if room is still connected to prevent errors
          if (livekitRoom.state === 'disconnected') {
            return // Room is disconnected, ignore track unpublications
          }
          
          // Handle local participant tracks
          if (participant.identity === authUser.id) {
            console.log('📹 Local track unpublished:', publication.kind)
            if (publication.kind === 'video') {
              setLocalVideoTrack(null)
            } else if (publication.kind === 'audio') {
              setLocalAudioTrack(null)
            }
          }
          // Handle remote participant track unpublications
          else if (participant.identity !== authUser.id) {
            console.log('📹 Remote track unpublished:', publication.kind, 'from participant:', participant.identity, 'publication.track exists:', !!publication.track)
            
            // Only clear if track is actually unpublished (not just temporarily)
            // Add a delay to allow for re-publication
            setTimeout(() => {
              const currentPublication = participant.trackPublications.get(publication.trackSid)
              if (!currentPublication || !currentPublication.track) {
                // Track is truly unpublished, safe to clear
                console.log(`✅ Clearing ${publication.kind} track - confirmed unpublished`)
                if (publication.kind === 'video') {
                  setRemoteVideoTrack(null)
                } else if (publication.kind === 'audio') {
                  setRemoteAudioTrack(null)
                }
              } else {
                console.log(`⚠️ ${publication.kind} track was re-published, not clearing`)
              }
            }, 1000) // Wait 1 second to allow re-publication
          }
        })

        // Connect to room with error handling using token source for automatic refresh
        try {
          // Log connection details for debugging (without exposing token)
          console.log('🔗 Attempting LiveKit connection:', {
            wsUrl: wsUrl.replace(/\/\/.*@/, '//***@'),
            roomName,
            username: authUser.id,
            tokenLength: token.length,
            tokenPrefix: token.substring(0, 20) + '...'
          })
          
          await livekitRoom.connect(wsUrl, token, {
            autoSubscribe: true,
            ...(authUser.id ? { participantName: authUser.id } as any : {}),
            // Ensure we subscribe to all tracks
          })
          setRoom(livekitRoom)
          
          // After connection, explicitly ensure we're subscribed to all remote tracks
          console.log('🔍 After connection, checking remote participants and tracks...')
          setTimeout(() => {
            livekitRoom.remoteParticipants.forEach((participant) => {
              console.log(`👤 Checking participant ${participant.identity}, has ${participant.trackPublications.size} track publications`)
              participant.trackPublications.forEach((publication) => {
                console.log(`📹 Track: ${publication.kind}, SID: ${publication.trackSid}, isSubscribed: ${publication.isSubscribed}, hasTrack: ${!!publication.track}`)
                if (!publication.isSubscribed) {
                  console.log(`📥 Attempting to subscribe to ${publication.kind} track ${publication.trackSid}`)
                  try {
                    if (typeof publication.setSubscribed === 'function') {
                      publication.setSubscribed(true)
                    }
                  } catch (err) {
                    console.error(`Error subscribing to ${publication.kind}:`, err)
                  }
                }
              })
            })
          }, 1000) // Wait 1 second after connection to ensure all tracks are published
        } catch (connectError: any) {
          // Check if error is related to media devices
          const errorMessage = connectError?.message || String(connectError)
          const errorName = connectError?.name || ''
          const errorCode = (connectError as any)?.code
          const errorStatus = (connectError as any)?.status
          
          const isMediaError = errorMessage.includes('getUserMedia') || 
                               errorMessage.includes('mediaDevices') ||
                               errorMessage.includes('navigator')
          
          // Check if error is related to token/authorization (401 = invalid API key)
          const isAuthError = errorStatus === 401 || 
                             errorCode === 1 || 
                             errorMessage.includes('invalid API key') ||
                             errorMessage.includes('401') ||
                             errorMessage.includes('unauthorized') ||
                             errorMessage.includes('authentication')
          
          if (isAuthError) {
            console.error('❌ LiveKit authentication error - checking configuration...')
            try {
              const diagnosticsResponse = await fetch('/api/livekit-token/diagnostics')
              const diagnostics = await diagnosticsResponse.json()
              
              // Check if URL matches expected format
              const wsUrlCheck = wsUrl || ''
              const urlMatches = wsUrlCheck.includes('livekit.cloud') || wsUrlCheck.includes('livekit.io')
              
              let userMessage = 'LiveKit connection failed: API key/secret mismatch. '
              userMessage += 'The API key and secret in Vercel must match your LiveKit Cloud project exactly. '
              
              if (!urlMatches) {
                userMessage += 'Also verify NEXT_PUBLIC_LIVEKIT_URL matches your LiveKit project URL. '
              }
              
              userMessage += 'Update environment variables in Vercel and redeploy.'
              
              await logVideoError('livekit_auth_error', 'LiveKit authentication failed', {
                error: errorMessage,
                errorName,
                errorCode,
                errorStatus,
                diagnostics,
                wsUrl: wsUrlCheck,
                urlMatches
              })
              showError(new Error(userMessage))
            } catch (diagError) {
              await logVideoError('livekit_auth_error', 'LiveKit authentication failed', {
                error: errorMessage,
                errorName,
                errorCode,
                errorStatus
              })
              showError(new Error('LiveKit connection failed: API key/secret mismatch. Update LIVEKIT_API_KEY and LIVEKIT_API_SECRET in Vercel to match your LiveKit Cloud project, then redeploy.'))
            }
            router.push('/spin')
            return
          }
          
          // Check if error is related to token/authorization
          const isTokenError = errorMessage.includes('invalid authorization token') ||
                              errorMessage.includes('token') ||
                              errorMessage.includes('authorization') ||
                              errorMessage.includes('401') ||
                              errorMessage.includes('NotAllowed')
          
          if (isTokenError) {
            // Log as warning since we have retry logic that usually succeeds
            console.warn('⚠️ LiveKit token authorization error (will retry):', {
              message: errorMessage,
              name: errorName,
              roomName,
              username: authUser.id
            })
            // Try to get a fresh token and retry once
            try {
              console.log('🔄 Attempting to fetch fresh token and retry connection...')
              const freshTokenResponse = await fetch(
                `/api/livekit-token?room=${roomName}&username=${authUser.id}`
              )
              
              if (!freshTokenResponse.ok) {
                const errorText = await freshTokenResponse.text()
                console.error('❌ Fresh token fetch failed:', {
                  status: freshTokenResponse.status,
                  statusText: freshTokenResponse.statusText,
                  error: errorText
                })
                throw new Error(`Token fetch failed: ${freshTokenResponse.status} ${errorText}`)
              }
              
              const freshTokenData = await freshTokenResponse.json()
              
              if (!freshTokenData.token) {
                console.error('❌ No token in fresh token response:', freshTokenData)
                throw new Error('No token in response')
              }
              
              console.log('✅ Fresh token fetched, attempting connection...')
              
              // Use fresh token directly
              const freshToken = freshTokenData.token
              await livekitRoom.connect(wsUrl, freshToken, {
                autoSubscribe: true,
                ...(authUser.id ? { participantName: authUser.id } as any : {}),
              })
              setRoom(livekitRoom)
              console.log('✅ Successfully connected with fresh token')
              return
            } catch (retryError: any) {
              console.error('❌ Retry with fresh token also failed:', {
                error: retryError,
                message: retryError?.message,
                name: retryError?.name,
                wsUrl,
                roomName,
                username: authUser.id
              })
              await logVideoError('token_retry_failed', 'Retry with fresh token failed', {
                error: retryError?.message,
                wsUrl,
                roomName
              })
            }
            setLoading(false)
            return
          } else if (isMediaError) {
            // Media device errors are expected in some environments - continue anyway
            console.warn('⚠️ Media device error during connection (this is often harmless):', connectError)
            // Still set the room - connection may have succeeded despite the error
            setRoom(livekitRoom)
          } else {
            console.error('❌ Failed to connect to LiveKit room:', {
              message: errorMessage,
              name: errorName,
              error: connectError
            })
            await logVideoError('connection_failed', 'Failed to connect to LiveKit room', {
              error: errorMessage,
              errorName,
              roomName
            })
            // Don't set room if connection fails
            setLoading(false)
            return
          }
        }

        // Don't automatically enable camera/mic - iPhone requires user gesture
        // Camera/mic will be enabled when user clicks the button during countdown
        console.log('Room connected. Camera/mic will be enabled on user interaction.')

        setLoading(false)
      } catch (error: any) {
        // Check if this is a media device error
        const errorMessage = error?.message || String(error)
        const isMediaError = errorMessage.includes('getUserMedia') || 
                             errorMessage.includes('mediaDevices') ||
                             errorMessage.includes('navigator') ||
                             errorMessage.includes('undefined is not an object')
        
        if (isMediaError) {
          // Media device errors are often harmless - LiveKit can still function
          // Log as warning instead of error to reduce noise
          console.warn('⚠️ Media device error during initialization (this is often harmless):', {
            error: errorMessage,
            note: 'LiveKit connection may still work. Media devices will be requested when user enables camera/mic.',
            protocol: typeof window !== 'undefined' ? window.location.protocol : 'unknown',
            hasMediaDevices: typeof window !== 'undefined' && typeof navigator !== 'undefined' && !!navigator?.mediaDevices?.getUserMedia
          })
          // Continue anyway - the room connection might have succeeded
          setLoading(false)
        } else {
          // Real errors should be logged properly
          console.error('Error initializing video date:', {
            error,
            message: error?.message,
            name: error?.name,
            stack: error?.stack,
            matchId,
            hasWindow: typeof window !== 'undefined',
            hasNavigator: typeof navigator !== 'undefined',
            protocol: typeof window !== 'undefined' ? window.location.protocol : 'unknown',
          })
          // Don't redirect immediately - let user see the error or try to continue
          setLoading(false)
        }
      }
    }

    initializeVideoDate()

    // Cleanup on unmount
    return () => {
      // Clean up all tracks and disconnect when component unmounts
      cleanupAllTracksAndDisconnect().catch(() => {})
    }
  }, [matchId, router, supabase])

  // Set up real-time subscription to sync countdown state (separate effect)
  useEffect(() => {
    if (!videoDateId) return

    let channel: any = null
    let reconnectTimeout: NodeJS.Timeout | null = null
    let reconnectAttempts = 0
    const MAX_RECONNECT_ATTEMPTS = 5
    const INITIAL_RECONNECT_DELAY = 1000
    const MIN_RECONNECT_INTERVAL = 2000
    let lastReconnectTime = 0
    let isMounted = true

    const setupSubscription = () => {
      if (!isMounted || !videoDateId) return

      // Clean up existing channel if any
      if (channel) {
        try {
          supabase.removeChannel(channel)
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      channel = supabase
        .channel(`video-date-${videoDateId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'video_dates',
            filter: `id=eq.${videoDateId}`
          },
          async (payload) => {
            const updatedVideoDate = payload.new as any
            const oldVideoDate = payload.old as any
            
            console.log('🔄 Real-time update received:', {
              newStatus: updatedVideoDate.status,
              oldStatus: oldVideoDate?.status,
              endedBy: updatedVideoDate.ended_by_user_id
            })
            
            // Check if partner ended the date
            // Check if status is 'ended_early' and it wasn't already 'ended_early' (or old status is not available)
            const statusChangedToEndedEarly = updatedVideoDate.status === 'ended_early' && 
              (oldVideoDate?.status !== 'ended_early' || !oldVideoDate)
            
            if (statusChangedToEndedEarly && updatedVideoDate.ended_by_user_id) {
              const { data: { user: authUser } } = await supabase.auth.getUser()
              if (authUser && updatedVideoDate.ended_by_user_id !== authUser.id) {
                // Partner ended the date, show message modal
                console.log('⚠️ Partner ended the date - showing modal', {
                  endedBy: updatedVideoDate.ended_by_user_id,
                  currentUser: authUser.id
                })
                setShowPartnerEndedDateModal(true)
              } else {
                console.log('ℹ️ User ended their own date or no auth user', {
                  endedBy: updatedVideoDate.ended_by_user_id,
                  currentUser: authUser?.id
                })
              }
            }
            
            // If status changed to 'active', sync countdown completion
            if (updatedVideoDate.status === 'active' && !countdownComplete) {
              console.log('🎯 Countdown completed (synced via real-time)')
              setCountdownComplete(true)
              setCountdown(0)
              logVideoEvent('countdown_completed', 'countdown', 'Countdown completed (synced via real-time)', {
                videoDateId
              })
            }
            // Update countdown_started_at if it was set
            if (updatedVideoDate.countdown_started_at && !countdownStartedAt) {
              setCountdownStartedAt(updatedVideoDate.countdown_started_at)
            }
            // Update date started_at for synchronized timer (CRITICAL for timer sync)
            if (updatedVideoDate.started_at) {
              console.log('🔄 Updating dateStartedAt from real-time update:', updatedVideoDate.started_at)
              setDateStartedAt(updatedVideoDate.started_at)
            } else if (updatedVideoDate.status === 'active' && !dateStartedAt) {
              // If status is active but started_at is missing, fetch it (trigger should have set it)
              console.log('🔄 Status is active but started_at missing, fetching from database...')
              supabase
                .from('video_dates')
                .select('started_at')
                .eq('id', videoDateId)
                .single()
                .then(({ data }) => {
                  if (data?.started_at) {
                    console.log('✅ Found started_at after real-time update:', data.started_at)
                    setDateStartedAt(data.started_at)
                  }
                })
            }
          }
        )
        .subscribe        ((status) => {
          // Only log status changes in development to reduce console noise
          if (process.env.NODE_ENV === 'development') {
            console.log('📡 Real-time subscription status:', status)
          }
          if (status === 'SUBSCRIBED') {
            console.log('✅ Real-time subscription active for video_date:', videoDateId)
            reconnectAttempts = 0 // Reset on successful connection
          } else if (status === 'CHANNEL_ERROR') {
            // CHANNEL_ERROR is often transient - don't log to avoid ErrorDebugger noise
            // Reconnection logic handles this automatically
            if (isMounted && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              scheduleReconnect()
            }
          } else if (status === 'TIMED_OUT') {
            // TIMED_OUT is often transient - don't log to avoid ErrorDebugger noise
            // Reconnection logic handles this automatically
            if (isMounted && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              scheduleReconnect()
            }
          } else if (status === 'CLOSED') {
            // Only log if it's unexpected (not during cleanup or normal reconnection)
            if (isMounted && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              // Log at debug level instead of warn - this is expected during reconnection
              if (process.env.NODE_ENV === 'development') {
                console.log(`🔄 Real-time subscription closed, reconnecting (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`)
              }
              scheduleReconnect()
            } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
              // Max reconnection attempts reached - this is expected if connection is truly lost
              // Only log in development to avoid noise in production
              if (process.env.NODE_ENV === 'development') {
                console.error('❌ Max reconnection attempts reached for real-time subscription')
              }
            }
            // Don't warn on normal CLOSED events - they're expected during reconnection
          }
        })
    }

    const scheduleReconnect = () => {
      if (!isMounted || !videoDateId || reconnectTimeout) return

      // Debounce: Don't reconnect too frequently
      const now = Date.now()
      if (now - lastReconnectTime < MIN_RECONNECT_INTERVAL) {
        return
      }

      reconnectAttempts++
      lastReconnectTime = now
      const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1) // Exponential backoff
      
      console.log(`🔄 Scheduling real-time subscription reconnect (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`)
      
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null
        if (isMounted && videoDateId) {
          setupSubscription()
        }
      }, delay)
    }

    // Initial setup
    setupSubscription()

    return () => {
      isMounted = false
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
        reconnectTimeout = null
      }
      console.log('🧹 Cleaning up real-time subscription')
      if (channel) {
        try {
          supabase.removeChannel(channel)
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  }, [videoDateId, countdownComplete, countdownStartedAt, dateStartedAt, supabase])

  // Periodic check as fallback to detect if partner ended the date (in case real-time fails)
  useEffect(() => {
    if (!videoDateId || showPartnerEndedDateModal) return

    const checkDateStatus = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      const { data: videoDate, error } = await supabase
        .from('video_dates')
        .select('status, ended_by_user_id')
        .eq('id', videoDateId)
        .single()

      if (error) {
        console.error('❌ Error checking date status:', error)
        return
      }

      if (videoDate?.status === 'ended_early' && videoDate.ended_by_user_id && videoDate.ended_by_user_id !== authUser.id) {
        console.log('⚠️ Partner ended the date (detected via periodic check)')
        setShowPartnerEndedDateModal(true)
      }
    }

    // Check immediately
    checkDateStatus()

    // Then check every 2 seconds as fallback
    const interval = setInterval(checkDateStatus, 2000)

    return () => clearInterval(interval)
  }, [videoDateId, showPartnerEndedDateModal, supabase])

  // CRITICAL: Periodic check to find published tracks that aren't in state
  // This handles cases where TrackPublished event doesn't fire or is missed
  // Also handles cases where getUserMedia fails but LiveKit has tracks
  useEffect(() => {
    if (!room || room.state === 'disconnected') return
    
    const checkForPublishedTracks = () => {
      // Check if we have a track in publications but not in state
      const videoPubs = Array.from(room.localParticipant.videoTrackPublications.values())
      const videoPub = videoPubs.find(pub => pub.track && pub.track.mediaStreamTrack)
      
      // If we found a track in publications but not in state, set it
      if (videoPub?.track?.mediaStreamTrack) {
        const track = videoPub.track.mediaStreamTrack
        const currentTrackId = localVideoTrack?.id
        
        // Only update if it's a different track or we don't have one
        if (!currentTrackId || currentTrackId !== track.id) {
          console.log('🔍 Found published video track that wasn\'t in state, setting it now:', track.id)
          
          // Set track in state
          setLocalVideoTrack(track)
          setIsVideoOff(false)
          setCountdownVideoOff(false)
          
          // Immediately attach to video element if available
          if (localVideoRef.current) {
            try {
              // Check if track is already attached
              const currentStream = localVideoRef.current.srcObject as MediaStream | null
              const currentTrackId = currentStream?.getVideoTracks()[0]?.id
              
              if (!currentStream || currentTrackId !== track.id) {
                const stream = new MediaStream([track])
                localVideoRef.current.srcObject = stream
                localVideoRef.current.style.opacity = '1'
                localVideoRef.current.style.display = 'block'
                localVideoRef.current.style.visibility = 'visible'
                localVideoRef.current.play().catch(err => {
                  if (err.name !== 'NotAllowedError') {
                    console.error('Error playing video in periodic check:', err)
                  }
                })
              }
            } catch (err) {
              console.error('Error attaching video in periodic check:', err)
            }
          }
        }
      }
    }
    
    // Check immediately
    checkForPublishedTracks()
    
    // Then check every 500ms for the first 10 seconds (longer for slow connections)
    const interval = setInterval(checkForPublishedTracks, 500)
    const timeout = setTimeout(() => clearInterval(interval), 10000)
    
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [room, localVideoTrack])
  
  // Main effect to attach local video track to video element
  // This is the SINGLE SOURCE OF TRUTH for local video attachment
  useEffect(() => {
    // CRITICAL: If we have a video ref but no track, try to find it from room publications
    if (localVideoRef.current && !localVideoTrack && room && room.state !== 'disconnected') {
      console.log('⚠️ No localVideoTrack in state, checking room publications...')
      const videoPubs = Array.from(room.localParticipant.videoTrackPublications.values())
      const videoPub = videoPubs.find(pub => pub.track && pub.track.mediaStreamTrack)
      if (videoPub?.track?.mediaStreamTrack) {
        const track = videoPub.track.mediaStreamTrack
        console.log('✅ Found video track in publications, setting in state:', track.id)
        setLocalVideoTrack(track)
        setIsVideoOff(false)
        setCountdownVideoOff(false)
        // Don't return - continue to attach the track
      } else {
        console.log('⚠️ No video track found in publications either')
        return
      }
    }
    
    if (!localVideoRef.current || !localVideoTrack) {
      console.log('⚠️ Local video attachment skipped:', {
        hasRef: !!localVideoRef.current,
        hasTrack: !!localVideoTrack
      })
      return
    }

    const videoElement = localVideoRef.current

    try {
      // Ensure track is enabled
      if (!localVideoTrack.enabled) {
        console.log('⚠️ Local video track disabled, enabling...')
        localVideoTrack.enabled = true
      }

      // Check if track is already attached to avoid unnecessary re-attachment
      const currentStream = videoElement.srcObject as MediaStream | null
      const currentTrackId = currentStream?.getVideoTracks()[0]?.id
      const newTrackId = localVideoTrack.id
      
      // Only reattach if track changed or srcObject is missing
      if (!videoElement.srcObject || currentTrackId !== newTrackId) {
        console.log('📹 Attaching local video track:', {
          currentTrackId,
          newTrackId,
          hasSrcObject: !!videoElement.srcObject
        })

        // Clean up old stream first (but don't stop tracks - they're managed by LiveKit)
        if (videoElement.srcObject) {
          const oldStream = videoElement.srcObject as MediaStream
          oldStream.getTracks().forEach(t => {
            // Don't stop the track itself, just remove from stream
            // The track is managed by LiveKit
          })
          videoElement.srcObject = null
        }

        // Create new stream and attach
        const stream = new MediaStream([localVideoTrack])
        videoElement.srcObject = stream
        
        console.log('✅ Local video srcObject set:', {
          trackId: localVideoTrack.id,
          trackEnabled: localVideoTrack.enabled,
          streamActive: stream.active
        })
      }
      
      // Ensure video is visible (not hidden by isVideoOff)
      setIsVideoOff(false)
      setCountdownVideoOff(false)
      
      // Force video element to be visible with inline styles
      videoElement.style.setProperty('opacity', '1', 'important')
      videoElement.style.setProperty('display', 'block', 'important')
      videoElement.style.setProperty('visibility', 'visible', 'important')
      
      // Attempt to play - require user interaction for autoplay policies (especially on mobile)
      // During countdown, try to play if user has interacted
      // CRITICAL: If track exists and is attached, always try to play (user has interacted by enabling camera)
      const shouldPlay = (hasUserInteracted || localVideoTrack) && videoElement.paused
      
      if (shouldPlay) {
        const playPromise = videoElement.play()
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('✅ Local video playing successfully from main useEffect')
            })
            .catch(err => {
              // Log all errors for debugging (don't silently ignore)
              console.error('❌ Error playing local video:', {
                name: err.name,
                message: err.message,
                hasUserInteracted,
                countdownComplete,
                paused: videoElement.paused,
                trackExists: !!localVideoTrack
              })
            })
        }
      } else {
        console.log('⚠️ Local video play skipped:', {
          hasUserInteracted,
          paused: videoElement.paused,
          countdownComplete,
          trackExists: !!localVideoTrack
        })
      }
    } catch (error) {
      console.error('❌ Error attaching local video track:', error)
    }

    // NO CLEANUP FUNCTION - we don't want to clear srcObject when dependencies change
    // The video should persist once attached. Only clear on component unmount.
    // If we need cleanup, it should be in a separate useEffect with proper dependencies.
  }, [localVideoTrack, hasUserInteracted, countdownComplete])
  
  // Automatically enable video when track exists (since toggle buttons are removed)
  useEffect(() => {
    if (localVideoTrack) {
      // When a video track exists, automatically set video to "on"
      // This replaces the toggle button functionality
      setIsVideoOff(false)
      setCountdownVideoOff(false)
      console.log('✅ Auto-enabling video because track exists (toggle buttons removed)')
    }
  }, [localVideoTrack])
  
  // Dedicated effect to ensure video visibility when track exists
  useEffect(() => {
    if (!localVideoRef.current || !localVideoTrack) return
    
    const videoElement = localVideoRef.current
    
    // Force video to be visible when track exists
    requestAnimationFrame(() => {
      if (videoElement && localVideoTrack) {
        // Force visibility with inline styles (higher priority than style prop)
        videoElement.style.setProperty('opacity', '1', 'important')
        videoElement.style.setProperty('display', 'block', 'important')
        videoElement.style.setProperty('visibility', 'visible', 'important')
        
        console.log('✅ Forced local video visibility:', {
          hasTrack: !!localVideoTrack,
          isVideoOff,
          countdownVideoOff,
          computedOpacity: window.getComputedStyle(videoElement).opacity
        })
      }
    })
  }, [localVideoTrack, isVideoOff, countdownVideoOff])
  
  // Special handling for countdown video - ensure it plays immediately
  useEffect(() => {
    if (countdownComplete || !localVideoTrack) return
    
    const ensurePlaying = () => {
      if (!localVideoRef.current || !localVideoTrack) {
        console.log('⚠️ Countdown video: Element or track not ready')
        return
      }
      
      const videoEl = localVideoRef.current
      
      // Check if track is already in stream
      const currentStream = videoEl.srcObject as MediaStream | null
      const currentTrackId = currentStream?.getVideoTracks()[0]?.id
      const newTrackId = localVideoTrack.id
      
      // Always ensure srcObject is set with current track
      if (!currentStream || currentTrackId !== newTrackId) {
        console.log('📹 Countdown video: Setting srcObject, track ID:', newTrackId)
        const stream = new MediaStream([localVideoTrack])
        videoEl.srcObject = stream
      }
      
      // Ensure track is enabled
      if (!localVideoTrack.enabled) {
        console.log('⚠️ Countdown video: Track disabled, enabling')
        localVideoTrack.enabled = true
      }
      
      // Try to play
      if (videoEl.paused) {
        console.log('▶️ Countdown video: Attempting to play')
        videoEl.play()
          .then(() => {
            console.log('✅ Countdown video: Playing successfully')
          })
          .catch(err => {
            if (err.name === 'NotAllowedError') {
              console.log('⚠️ Countdown video: Play blocked (needs user interaction)')
            } else if (err.name === 'AbortError') {
              console.log('⚠️ Countdown video: Play aborted, will retry')
              setTimeout(ensurePlaying, 200)
            } else {
              console.error('❌ Countdown video: Play error:', err)
              setTimeout(ensurePlaying, 500)
            }
          })
      } else {
        console.log('✅ Countdown video: Already playing')
      }
    }
    
    // Try immediately and with multiple retries
    ensurePlaying()
    setTimeout(ensurePlaying, 100)
    setTimeout(ensurePlaying, 300)
    setTimeout(ensurePlaying, 500)
    setTimeout(ensurePlaying, 1000)
    
    // Also set up a monitor to keep checking
    const monitor = setInterval(() => {
      if (countdownComplete) {
        clearInterval(monitor)
        return
      }
      if (localVideoTrack && localVideoRef.current) {
        ensurePlaying()
      }
    }, 500)
    
    return () => {
      clearInterval(monitor)
    }
  }, [localVideoTrack, countdownComplete])

  useEffect(() => {
    if (!localAudioTrack || !localAudioRef.current) return

    let stream: MediaStream | null = null
    let audioElement = localAudioRef.current

    try {
      // Check if track is already attached to avoid unnecessary re-attachment
      const currentStream = audioElement.srcObject as MediaStream | null
      const currentTrackId = currentStream?.getAudioTracks()[0]?.id
      const newTrackId = localAudioTrack.id
      
      // Only reattach if track changed
      if (currentTrackId !== newTrackId) {
        // Clean up old stream first (but don't stop tracks - they're managed by LiveKit)
      if (audioElement.srcObject) {
        audioElement.srcObject = null
      }

      // Create new stream and attach
      stream = new MediaStream([localAudioTrack])
      audioElement.srcObject = stream
      }
      
      // Attempt to play if user has interacted and audio is not already playing
      if (hasUserInteracted && audioElement.paused) {
        audioElement.play().catch(err => {
          // Silently ignore NotAllowedError (expected on mobile without user interaction)
          if (err.name !== 'NotAllowedError') {
            console.error('Error playing local audio:', err)
          }
        })
      }
    } catch (error) {
      console.error('Error attaching local audio track:', error)
    }

      return () => {
      // Only cleanup on unmount or track removal - don't stop tracks (managed by LiveKit)
      if (audioElement && audioElement.srcObject) {
        audioElement.srcObject = null
      }
      }
  }, [localAudioTrack, hasUserInteracted])

  useEffect(() => {
    if (!remoteVideoRef.current || !room) return
    
    const videoElement = remoteVideoRef.current
    
    // CRITICAL: Get the CURRENT track from the publication, not from state
    // State might be stale - we need the live track from LiveKit
    let currentTrack: MediaStreamTrack | null = null
    room.remoteParticipants.forEach(participant => {
      participant.trackPublications.forEach(publication => {
        if (publication.kind === 'video' && publication.isSubscribed && publication.track) {
          const track = publication.track.mediaStreamTrack
          if (track && track.readyState === 'live') {
            currentTrack = track
          }
        }
      })
    })
    
    // If we have a current track from publication, ensure it's in the stream
    if (currentTrack) {
      if (!remoteVideoStreamRef.current) {
        remoteVideoStreamRef.current = new MediaStream()
      }
      
      const stream = remoteVideoStreamRef.current
      const streamTracks = stream.getVideoTracks()
      const hasCurrentTrack = streamTracks.some(t => t === currentTrack)
      
      if (!hasCurrentTrack) {
        console.log('🔄 useEffect: Stream missing current track from publication, updating...')
        // Remove old tracks
        streamTracks.forEach(t => stream.removeTrack(t))
        // Add current track
        stream.addTrack(currentTrack)
      }
      
      // Ensure srcObject is set
      if (!videoElement.srcObject) {
        console.log('📹 Setting srcObject for remote video (useEffect)')
        videoElement.srcObject = stream
      }
      
      // Try to play if paused
      if (videoElement.paused) {
        console.log('▶️ Attempting to play remote video (useEffect)')
        const playPromise = videoElement.play()
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            if (err.name === 'AbortError') {
              // Video play aborted - retry logic handles this
              setTimeout(() => {
                if (videoElement.srcObject && videoElement.paused) {
                  videoElement.play().catch(() => {})
                }
              }, 200)
            } else if (err.name !== 'NotAllowedError') {
              console.error('Error playing remote video:', err)
            }
          })
        }
      }
    }
    
    // Monitor to keep video playing and ensure stream has current track
    const checkAndPlay = () => {
      // Get current track from publication again
      let latestTrack: MediaStreamTrack | null = null
      if (room) {
        room.remoteParticipants.forEach(participant => {
          participant.trackPublications.forEach(publication => {
            if (publication.kind === 'video' && publication.isSubscribed && publication.track) {
              const track = publication.track.mediaStreamTrack
              if (track && track.readyState === 'live') {
                latestTrack = track
              }
            }
          })
        })
      }
      
      // Update stream if track changed
      if (latestTrack && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream
        const streamTracks = stream.getVideoTracks()
        const hasLatestTrack = streamTracks.some(t => t === latestTrack)
        
        if (!hasLatestTrack && streamTracks.length > 0) {
          console.log('🔄 Monitor: Updating stream with latest track from publication')
          streamTracks.forEach(t => stream.removeTrack(t))
          stream.addTrack(latestTrack)
        }
      }
      
      // Try to play if paused
      if (videoElement.srcObject && videoElement.paused) {
        videoElement.play().catch(() => {})
      }
    }
    
    const monitorInterval = setInterval(checkAndPlay, 500) // Check every 500ms
    
    return () => {
      clearInterval(monitorInterval)
    }
  }, [remoteVideoTrack, hasUserInteracted, room])

  useEffect(() => {
    if (!remoteAudioRef.current) return
    
    const audioElement = remoteAudioRef.current
    
    // CRITICAL: Stream is now managed by TrackSubscribed/TrackUnsubscribed events
    // This useEffect only ensures srcObject is set and audio is playing
    
    // Ensure srcObject is set if stream exists
    if (remoteAudioStreamRef.current && !audioElement.srcObject) {
      console.log('🔊 Setting srcObject for remote audio (useEffect)')
      audioElement.srcObject = remoteAudioStreamRef.current
    }
    
    // Try to play if paused and we have a stream
    if (audioElement.srcObject && audioElement.paused) {
      console.log('▶️ Attempting to play remote audio (useEffect)')
      audioElement.play().catch(err => {
        if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
          console.error('Error playing remote audio:', err)
        }
      })
    }
  }, [remoteAudioTrack, hasUserInteracted, room])

  // Comprehensive cleanup function to stop all tracks and disconnect
  const cleanupAllTracksAndDisconnect = async () => {
    // Stop all local tracks
    if (localVideoTrack) {
      localVideoTrack.stop()
      setLocalVideoTrack(null)
    }
    if (localAudioTrack) {
      localAudioTrack.stop()
      setLocalAudioTrack(null)
    }
    
    // Stop all remote tracks
    if (remoteVideoTrack) {
      remoteVideoTrack.stop()
      setRemoteVideoTrack(null)
    }
    if (remoteAudioTrack) {
      remoteAudioTrack.stop()
      setRemoteAudioTrack(null)
    }
    
    // Stop all tracks from room if connected
    if (room && room.state !== 'disconnected') {
      try {
        // Stop and unpublish all local participant tracks
        const tracksToUnpublish: any[] = []
        room.localParticipant.trackPublications.forEach((publication) => {
          if (publication.track) {
            publication.track.stop()
            // Get the underlying MediaStreamTrack for unpublishTracks
            if (publication.track.mediaStreamTrack) {
              tracksToUnpublish.push(publication.track.mediaStreamTrack)
            }
          }
        })
        
        // Unpublish all tracks using MediaStreamTracks
        if (tracksToUnpublish.length > 0) {
          await room.localParticipant.unpublishTracks(tracksToUnpublish)
        }
      } catch (err) {
        // Ignore errors during cleanup
      }
    }
    
    // Clear video/audio element srcObjects
    if (localVideoRef.current) {
      if (localVideoRef.current.srcObject) {
        const stream = localVideoRef.current.srcObject as MediaStream
        stream.getTracks().forEach(track => track.stop())
        localVideoRef.current.srcObject = null
      }
    }
    
    if (remoteVideoRef.current) {
      if (remoteVideoRef.current.srcObject) {
        const stream = remoteVideoRef.current.srcObject as MediaStream
        stream.getTracks().forEach(track => track.stop())
        remoteVideoRef.current.srcObject = null
      }
    }
    
    if (remoteAudioRef.current) {
      if (remoteAudioRef.current.srcObject) {
        const stream = remoteAudioRef.current.srcObject as MediaStream
        stream.getTracks().forEach(track => track.stop())
        remoteAudioRef.current.srcObject = null
      }
      remoteAudioRef.current.pause()
      remoteAudioRef.current.currentTime = 0
    }
    
    // Clear stream refs
    remoteVideoStreamRef.current = null
    remoteAudioStreamRef.current = null
    
    // Disconnect from room
    if (room) {
      try {
        await room.disconnect()
      } catch (err) {
        // Room may already be disconnected - this is fine
      }
    }
    
    // Set room to null to prevent any further operations
    setRoom(null)
  }
  
  // Cleanup when post modal is shown (date ended)
  useEffect(() => {
    if (showPostModal) {
      // Ensure all tracks are stopped when post modal appears
      cleanupAllTracksAndDisconnect().catch(() => {})
    }
  }, [showPostModal])

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

    // Clean up all tracks and disconnect
    await cleanupAllTracksAndDisconnect()

    // Show pass modal and return to spin
    setShowPassModal(true)
    setTimeout(() => {
      router.push('/spin')
    }, 2000)
  }

  // Pre-date countdown - SYNCHRONIZED using server timestamp
  useEffect(() => {
    if (countdownComplete || loading || !videoDateId) return

    // CRITICAL: Use database RPC function for countdown calculation to ensure perfect synchronization
    // Both users calling this function will get the same result because it uses database NOW()
    const fetchCountdownRemaining = async () => {
      const { data, error } = await supabase.rpc('get_video_date_countdown_remaining', {
        p_video_date_id: videoDateId
      })
      
      if (error) {
        console.error('❌ Error fetching countdown remaining from RPC:', error)
        return null
      }
      
      return data
    }

    // Initial fetch of countdown remaining
    fetchCountdownRemaining().then((remaining) => {
      if (remaining === null) {
        // RPC failed, will retry on next interval
        return
      }
      
      setCountdown(remaining)
      console.log('⏱️ Initial countdown from database:', remaining, 'seconds')

    // If countdown already completed, mark as complete
      if (remaining <= 0) {
      setCountdownComplete(true)
      logVideoEvent('countdown_completed', 'countdown', 'Countdown already completed on initialization', {
        videoDateId
      })
      // Update video date status to active if not already - trigger will set started_at
      // Note: Don't filter by status='countdown' as it may have already been updated by the other user
      supabase
        .from('video_dates')
        .update({
          status: 'active'
          // started_at will be set automatically by database trigger
        })
        .eq('id', videoDateId)
        // Removed .eq('status', 'countdown') to avoid "0 rows" error if status already updated
        .then(async ({ error: updateError }) => {
          if (updateError) {
            console.error('❌ Error updating video date status:', updateError)
          }
          
          // Always fetch started_at after update attempt (even if update failed or status already active)
          const { data: updatedData, error: fetchError } = await supabase
            .from('video_dates')
            .select('started_at, status')
            .eq('id', videoDateId)
            .single()
          
          if (fetchError) {
            console.error('❌ Error fetching started_at:', fetchError)
            return
          }
          
          // Set the synchronized start time from database (set by trigger)
          if (updatedData?.started_at) {
            console.log('✅ started_at set by database trigger:', updatedData.started_at)
            setDateStartedAt(updatedData.started_at)
          } else if (updatedData?.status === 'active') {
            // Status is active but started_at not set yet - trigger might need time
            console.log('⚠️ Status is active but started_at not set yet, will retry...')
            // Retry fetching after a short delay
            setTimeout(async () => {
              const { data: retryData } = await supabase
                .from('video_dates')
                .select('started_at')
                .eq('id', videoDateId)
                .single()
              
              if (retryData?.started_at) {
                console.log('✅ started_at fetched on retry:', retryData.started_at)
                setDateStartedAt(retryData.started_at)
              }
            }, 500)
          } else {
            // Fetch the updated record to get started_at
            supabase
              .from('video_dates')
              .select('started_at')
              .eq('id', videoDateId)
              .single()
              .then(({ data: finalData }) => {
                if (finalData?.started_at) {
                  setDateStartedAt(updatedData.started_at)
                }
              })
          }
        })
      return
    }
    })

    // Update countdown every 100ms using database RPC for perfect synchronization
    const timer = setInterval(async () => {
      const remaining = await fetchCountdownRemaining()
      
      if (remaining === null) {
        // RPC failed - don't update countdown, will retry on next interval
        // This ensures we don't use client-side calculation which causes drift
        // Retry logic handles this, don't log to avoid ErrorDebugger noise
        return
      }
      
      // Use database-calculated remaining time (perfect synchronization)
      setCountdown(remaining)
      console.log('⏱️ Countdown from database:', remaining, 'seconds')
      
      if (remaining <= 0) {
          clearInterval(timer)
        setCountdown(0)
          setCountdownComplete(true)
          logVideoEvent('countdown_completed', 'countdown', 'Countdown completed', {
            videoDateId
          })
          // Update video date status to active - trigger will automatically set started_at
          // CRITICAL: Remove status condition to make update idempotent (both users can update)
          // CRITICAL: Always fetch started_at from database after countdown completes, regardless of update success
          supabase
            .from('video_dates')
            .update({
              status: 'active'
              // started_at will be set automatically by database trigger
            })
            .eq('id', videoDateId)
            // REMOVED .eq('status', 'countdown') to make update idempotent
            // This ensures both users can update successfully, even if one completes first
            .then(async ({ error }) => {
              // Even if update fails (e.g., status already 'active'), still fetch started_at
              // This ensures both users get the same value regardless of who updates first
              
              // ALWAYS fetch started_at from database (don't rely on update response)
              // This ensures both users get the exact same value, even if they update at slightly different times
              console.log('🔄 Fetching started_at from database after countdown completion...')
              
              // Use a retry loop to ensure we get started_at (trigger might need time to fire)
              let retries = 0
              const maxRetries = 5
              const fetchStartedAt = async (): Promise<void> => {
                const { data: updatedData, error: fetchError } = await supabase
                  .from('video_dates')
                  .select('started_at, status')
                  .eq('id', videoDateId)
                  .single()
                
                if (fetchError) {
                  console.error('❌ Error fetching started_at:', fetchError)
                  if (retries < maxRetries) {
                    retries++
                    setTimeout(fetchStartedAt, 200 * retries) // Exponential backoff
                  }
                  return
                }
                
                if (updatedData?.started_at) {
                  console.log('✅ started_at fetched from database:', updatedData.started_at)
                  setDateStartedAt(updatedData.started_at)
                } else if (updatedData?.status === 'active' && retries < maxRetries) {
                  // Status is active but started_at not set yet - trigger might need more time
                  console.log(`⚠️ started_at not set yet (attempt ${retries + 1}/${maxRetries}), retrying...`)
                  retries++
                  setTimeout(fetchStartedAt, 200 * retries)
                } else {
                  console.error('❌ started_at still missing after all retries')
                }
              }
              
              // Start fetching immediately
              await fetchStartedAt()
            })
      }
    }, 100) // Update every 100ms from database for smooth display and perfect sync

    return () => clearInterval(timer)
  }, [countdownComplete, loading, videoDateId, supabase])

  // Main date timer - SYNCHRONIZED using database RPC function
  // CRITICAL: This timer is tied to the matchId/video_date record, not user sessions
  // When a user refreshes, they continue from the same timer because the RPC function
  // calculates remaining time from started_at (stored in database) and database NOW()
  // Both users always see the same time because they call the same RPC function
  useEffect(() => {
    if (!countdownComplete) return

    // If dateStartedAt is not set yet, try to fetch it from database
    // This handles the case where user refreshes and needs to get started_at
    if (!dateStartedAt && videoDateId) {
      console.log('⏱️ dateStartedAt not set, fetching from database...')
      supabase
        .from('video_dates')
        .select('started_at, countdown_started_at, status')
        .eq('id', videoDateId)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error('❌ Error fetching started_at:', error)
            return
          }
          
          if (data) {
            if (data.started_at) {
              console.log('✅ Found started_at in database:', data.started_at)
              setDateStartedAt(data.started_at)
            } else if (data.status === 'active' && !data.started_at) {
              // If status is active but started_at is missing, the trigger should set it
              // Wait a moment and fetch again (trigger may need time to fire)
              console.log('⚠️ started_at missing for active date, waiting for trigger...')
              setTimeout(() => {
                supabase
                  .from('video_dates')
                  .select('started_at')
                  .eq('id', videoDateId)
                  .single()
                  .then(({ data: retryData }) => {
                    if (retryData?.started_at) {
                      console.log('✅ Found started_at after retry:', retryData.started_at)
                      setDateStartedAt(retryData.started_at)
                    } else {
                      console.error('❌ started_at still missing - trigger may need to be triggered by status update')
                    }
                  })
              }, 500)
            }
          }
        })
      return // Wait for dateStartedAt to be set
    }

    // Note: The RPC function gets started_at directly from the database, so it works correctly
    // even if dateStartedAt state is not set yet. However, we keep this check to ensure
    // proper initialization flow. The RPC function is the source of truth for timer synchronization.
    if (!dateStartedAt) return

    // Fetch remaining time from database to ensure synchronization
    // CRITICAL: This function MUST always use the database RPC - no client-side fallback
    // Both users calling this function will get the same result because it uses database NOW()
    // When a user refreshes, this function calculates the remaining time from started_at (in database)
    // and database NOW(), so they continue from the correct time
    const fetchTimeRemaining = async () => {
      if (!videoDateId) return null
      
      const { data, error } = await supabase.rpc('get_video_date_time_remaining', {
        p_video_date_id: videoDateId
      })
      
      if (error) {
        console.error('❌ Error fetching time remaining from RPC:', error)
        // DO NOT fallback to client-side calculation - this causes drift
        // Instead, retry the RPC call or return null to trigger retry
        console.warn('⚠️ RPC failed, will retry on next interval')
        return null
      }
      
      return data
    }

    // Initial fetch of time remaining
    fetchTimeRemaining().then((remaining) => {
      if (remaining !== null) {
        setTimeLeft(remaining)
        console.log('⏱️ Initial time left from database:', remaining, 'seconds')
        
        if (remaining <= 0) {
          console.log('⏱️ Timer already completed')
          if (videoDateId) {
            supabase
              .from('video_dates')
              .update({
                status: 'completed',
                ended_at: new Date().toISOString(),
                duration_seconds: 300
              })
              .eq('id', videoDateId)
              .eq('status', 'active')
          }
          // Clean up all tracks and disconnect when timer already completed
          cleanupAllTracksAndDisconnect().catch(() => {})
          setShowPostModal(true)
          return
        }
      }
    })

    // ALWAYS use database for timer calculation - no client-side calculation to prevent drift
    // Fetch from database every 500ms for smooth updates and perfect synchronization
    const timer = setInterval(async () => {
      const dbRemaining = await fetchTimeRemaining()
      
      if (dbRemaining === null) {
        // RPC failed - don't update timer, will retry on next interval
        // This ensures we don't use client-side calculation which causes drift
        // RPC failed - retry logic handles this, don't log
        return
      }
      
      // Use database-calculated remaining time (perfect synchronization)
      setTimeLeft(dbRemaining)
      console.log('⏱️ Timer from database:', dbRemaining, 'seconds')
      
      if (dbRemaining <= 0) {
        clearInterval(timer)
        setTimeLeft(0)
        console.log('⏱️ Timer reached zero (from database)')
        if (videoDateId) {
          supabase
            .from('video_dates')
            .update({
              status: 'completed',
              ended_at: new Date().toISOString(),
              duration_seconds: 300
            })
            .eq('id', videoDateId)
            .eq('status', 'active')
        }
        setShowPostModal(true)
      }
    }, 500) // Update every 500ms from database for smooth display and perfect sync

    return () => clearInterval(timer)
  }, [countdownComplete, dateStartedAt, videoDateId, supabase])

  // Periodic check to ensure video/audio tracks are properly attached (fixes streaming issues)
  useEffect(() => {
    if (!room || !countdownComplete || room.state === 'disconnected') return

    const checkTracks = () => {
      // Don't check tracks if room is disconnected
      if (!isRoomConnected()) return
      
      // Check local video track - only reattach if srcObject is missing and track exists
      if (localVideoRef.current && localVideoTrack) {
        const currentStream = localVideoRef.current.srcObject as MediaStream | null
        const currentTrackId = currentStream?.getVideoTracks()[0]?.id
        const expectedTrackId = localVideoTrack.id
        
        if (!localVideoRef.current.srcObject || currentTrackId !== expectedTrackId) {
          console.log('⚠️ Local video track lost or changed, reattaching...')
          const stream = new MediaStream([localVideoTrack])
          localVideoRef.current.srcObject = stream
          // Try to play if user has interacted
          if (hasUserInteracted && localVideoRef.current.paused) {
            localVideoRef.current.play().catch(() => {})
          }
        }
      }

      // Check remote video track - ensure srcObject is set
      // Stream is managed by TrackSubscribed/TrackUnsubscribed, we just ensure it's attached
      if (remoteVideoRef.current && remoteVideoStreamRef.current) {
        if (!remoteVideoRef.current.srcObject) {
          console.log('⚠️ Remote video srcObject missing in checkTracks, reattaching...')
          remoteVideoRef.current.srcObject = remoteVideoStreamRef.current
          if (hasUserInteracted && remoteVideoRef.current.paused) {
            remoteVideoRef.current.play().catch(() => {})
          }
        } else if (remoteVideoRef.current.paused && hasUserInteracted) {
          // Just try to play if paused
          remoteVideoRef.current.play().catch(() => {})
        }
      }

      // Check local audio track - only reattach if srcObject is missing and track exists
      if (localAudioRef.current && localAudioTrack) {
        const currentStream = localAudioRef.current.srcObject as MediaStream | null
        const currentTrackId = currentStream?.getAudioTracks()[0]?.id
        const expectedTrackId = localAudioTrack.id
        
        if (!localAudioRef.current.srcObject || currentTrackId !== expectedTrackId) {
          console.log('⚠️ Local audio track lost or changed, reattaching...')
          const stream = new MediaStream([localAudioTrack])
          localAudioRef.current.srcObject = stream
          // Try to play if user has interacted
          if (hasUserInteracted && localAudioRef.current.paused) {
            localAudioRef.current.play().catch(() => {})
          }
        }
      }

      // Check remote audio track - ensure srcObject is set
      // Stream is managed by TrackSubscribed/TrackUnsubscribed, we just ensure it's attached
      if (remoteAudioRef.current && remoteAudioStreamRef.current) {
        if (!remoteAudioRef.current.srcObject) {
          console.log('⚠️ Remote audio srcObject missing in checkTracks, reattaching...')
          remoteAudioRef.current.srcObject = remoteAudioStreamRef.current
          if (hasUserInteracted && remoteAudioRef.current.paused) {
            remoteAudioRef.current.play().catch(() => {})
          }
        } else if (remoteAudioRef.current.paused && hasUserInteracted) {
          // Just try to play if paused
          remoteAudioRef.current.play().catch(() => {})
        }
      }

      // Fallback: Check for subscribed remote tracks that aren't in state yet
      // Also actively subscribe to tracks that should be subscribed but aren't
      room.remoteParticipants.forEach((participant) => {
        console.log(`🔍 Checking participant ${participant.identity}, has ${participant.trackPublications.size} publications`)
        participant.trackPublications.forEach((publication) => {
          console.log(`  📹 ${publication.kind} track: SID=${publication.trackSid}, isSubscribed=${publication.isSubscribed}, hasTrack=${!!publication.track}`)
          
          // If track is subscribed and has track, ensure it's in state AND in the stream
          if (publication.isSubscribed && publication.track) {
            const track = publication.track
            if (track.kind === 'video' && track.mediaStreamTrack) {
              const currentTrack = track.mediaStreamTrack
              
              // Update state if needed
              setRemoteVideoTrack((current) => {
                if (current && current.id === currentTrack.id) {
                  // Same ID - but check if it's the same object reference
                  if (current === currentTrack) {
                    return current // Same object, keep it
                  }
                  // Different object with same ID - update to current
                  console.log('🔄 Track object changed (same ID), updating:', currentTrack.id)
                  return currentTrack
                }
                console.log('🔄 Found subscribed remote video track not in state, setting it:', currentTrack.id)
                return currentTrack
              })
              
              // Stream is managed by TrackSubscribed event - don't modify here
              // Just ensure srcObject is set if stream exists
              if (remoteVideoRef.current && remoteVideoStreamRef.current && !remoteVideoRef.current.srcObject) {
                console.log('🔄 Setting srcObject for remote video from checkTracks')
                remoteVideoRef.current.srcObject = remoteVideoStreamRef.current
                if (remoteVideoRef.current.paused) {
                  remoteVideoRef.current.play().catch(() => {})
                }
              }
            } else if (track.kind === 'audio' && track.mediaStreamTrack) {
              const currentTrack = track.mediaStreamTrack
              
              // Update state if needed
              setRemoteAudioTrack((current) => {
                if (current && current.id === currentTrack.id) {
                  if (current === currentTrack) {
                    return current
                  }
                  console.log('🔄 Audio track object changed (same ID), updating:', currentTrack.id)
                  return currentTrack
                }
                console.log('🔄 Found subscribed remote audio track not in state, setting it:', currentTrack.id)
                return currentTrack
              })
              
              // Stream is managed by TrackSubscribed event - don't modify here
              // Just ensure srcObject is set if stream exists
              if (remoteAudioRef.current && remoteAudioStreamRef.current && !remoteAudioRef.current.srcObject) {
                console.log('🔄 Setting srcObject for remote audio from checkTracks')
                remoteAudioRef.current.srcObject = remoteAudioStreamRef.current
                if (remoteAudioRef.current.paused) {
                  remoteAudioRef.current.play().catch(() => {})
                }
              }
            }
          }
          // If track is published but not subscribed, try to subscribe (AGGRESSIVELY)
          else if (!publication.isSubscribed && publication.trackSid) {
            console.log(`🔄 Found unsubscribed ${publication.kind} track, FORCING subscription:`, publication.trackSid)
            try {
              // Try setSubscribed
              if (typeof publication.setSubscribed === 'function') {
                try {
                  publication.setSubscribed(true)
                  console.log(`✅ setSubscribed called for ${publication.kind} track (sync)`)
                } catch (err: any) {
                  console.error(`Error subscribing to ${publication.kind} track in checkTracks:`, err)
                }
              }
              // Also try alternative methods
              if (typeof (publication as any).subscribe === 'function') {
                (publication as any).subscribe().catch((err: any) => {
                  console.error(`Error subscribing via subscribe() for ${publication.kind}:`, err)
                })
              }
              // Try via participant
              if (typeof (participant as any).subscribeToTrack === 'function') {
                (participant as any).subscribeToTrack(publication.trackSid, true).catch((err: any) => {
                  console.error(`Error subscribing via participant for ${publication.kind}:`, err)
                })
              }
            } catch (err) {
              console.error(`Error subscribing to ${publication.kind} track in checkTracks:`, err)
            }
          }
        })
      })
    }

    // Check every 2 seconds
    const interval = setInterval(checkTracks, 2000)

    return () => clearInterval(interval)
  }, [room, countdownComplete, localVideoTrack, remoteVideoTrack, localAudioTrack, remoteAudioTrack, hasUserInteracted])

  // Listen for user interaction to enable audio/video playback (required for mobile browsers)
  useEffect(() => {
    const handleUserInteraction = () => {
      setHasUserInteracted(true)
      // Try to play all media elements after user interaction
      if (localVideoRef.current) {
        localVideoRef.current.play().catch(() => {}) // Ignore errors
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.play().catch(() => {}) // Ignore errors
      }
      if (localAudioRef.current) {
        localAudioRef.current.play().catch(() => {}) // Ignore errors
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.play().catch(() => {}) // Ignore errors
      }
    }

    // Listen for various user interaction events (only once per event)
    const events = ['click', 'touchstart', 'touchend', 'keydown']
    events.forEach(event => {
      document.addEventListener(event, handleUserInteraction, { once: true, passive: true })
    })

    // No cleanup needed since we use { once: true }
  }, [])

  // Ensure videos play when hasUserInteracted becomes true (even if tracks were already attached)
  useEffect(() => {
    if (!hasUserInteracted) return

    // Play videos if they're paused and have tracks
    if (localVideoRef.current && localVideoTrack && localVideoRef.current.paused) {
      localVideoRef.current.play().catch(err => {
        if (err.name !== 'NotAllowedError') {
          console.error('Error playing local video after user interaction:', err)
        }
      })
    }

    if (remoteVideoRef.current && remoteVideoTrack && remoteVideoRef.current.paused) {
      // Ensure srcObject is set
      if (!remoteVideoRef.current.srcObject && remoteVideoStreamRef.current) {
        remoteVideoRef.current.srcObject = remoteVideoStreamRef.current
      }
      
      const playPromise = remoteVideoRef.current.play()
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          if (err.name === 'AbortError') {
            console.warn('⚠️ Video play was aborted after user interaction, will retry')
            // Retry multiple times
            const retries = [100, 200, 500]
            retries.forEach(delay => {
              setTimeout(() => {
                if (remoteVideoRef.current && remoteVideoRef.current.paused && remoteVideoRef.current.srcObject) {
                  remoteVideoRef.current.play().catch(() => {})
                }
              }, delay)
            })
          } else if (err.name !== 'NotAllowedError') {
            console.error('Error playing remote video after user interaction:', err)
            // Still retry
            setTimeout(() => {
              if (remoteVideoRef.current && remoteVideoRef.current.paused && remoteVideoRef.current.srcObject) {
                remoteVideoRef.current.play().catch(() => {})
              }
            }, 200)
          }
        })
      }
    }

    // Play audio if it's paused and has tracks
    if (localAudioRef.current && localAudioTrack && localAudioRef.current.paused) {
      localAudioRef.current.play().catch(err => {
        if (err.name !== 'NotAllowedError') {
          console.error('Error playing local audio after user interaction:', err)
        }
      })
    }

    if (remoteAudioRef.current && remoteAudioTrack && remoteAudioRef.current.paused) {
      remoteAudioRef.current.play().catch(err => {
        if (err.name !== 'NotAllowedError') {
          console.error('Error playing remote audio after user interaction:', err)
        }
      })
    }
  }, [hasUserInteracted, localVideoTrack, remoteVideoTrack, localAudioTrack, remoteAudioTrack]) // Empty dependency array - only set up once

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s < 10 ? "0" + s : s}`
  }

  const handleEndDate = () => {
    // Show confirmation modal first
    setShowEndDateConfirm(true)
  }

  const handleConfirmEndDate = async () => {
    setShowEndDateConfirm(false)
    setIsEnding(true)
    
    await logVideoEvent('date_action', 'action', 'User ended date', {
      timeLeft,
      countdownComplete
    })
    
    // Calculate duration
    const startTime = countdownComplete ? Date.now() - ((300 - timeLeft) * 1000) : Date.now()
    const duration = Math.floor((Date.now() - startTime) / 1000)
    
    // Clean up all tracks and disconnect
    await cleanupAllTracksAndDisconnect()

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

    await logVideoEvent('date_action', 'action', 'User voted yes', {
      rating,
      hasFeedback: !!feedback.trim()
    })

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
    if (!videoDateId || !user || !partner) {
      console.error('❌ Missing required data for contact submission:', { videoDateId, user: !!user, partner: !!partner })
      return
    }

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !authUser) {
      console.error('❌ Auth error:', authError)
      await logVideoError('auth_error', 'Failed to get authenticated user for contact submission', { error: authError })
      return
    }

    console.log('📤 Submitting contact details...', {
      shareEmail: shareContactDetails.email,
      sharePhone: shareContactDetails.phone,
      shareFacebook: shareContactDetails.facebook,
      shareInstagram: shareContactDetails.instagram,
      shareWhatsapp: shareContactDetails.whatsapp
    })

    await logVideoEvent('date_action', 'action', 'User submitted contact details', {
      shareEmail: shareContactDetails.email,
      sharePhone: shareContactDetails.phone,
      shareFacebook: shareContactDetails.facebook,
      shareInstagram: shareContactDetails.instagram,
      shareWhatsapp: shareContactDetails.whatsapp
    })

    try {
      // Encrypt and save user's contact details
      const contactDetailsToSave: any = {}
      
      try {
      if (shareContactDetails.email && userContactDetails.email) {
          console.log('🔐 Encrypting email...')
        contactDetailsToSave.email_encrypted = await encryptContact(userContactDetails.email)
        contactDetailsToSave.share_email = true
          console.log('✅ Email encrypted')
      }
      if (shareContactDetails.phone && userContactDetails.phone) {
          console.log('🔐 Encrypting phone...')
        contactDetailsToSave.phone_encrypted = await encryptContact(userContactDetails.phone)
        contactDetailsToSave.share_phone = true
          console.log('✅ Phone encrypted')
        }
        if (shareContactDetails.facebook && userContactDetails.facebook) {
          console.log('🔐 Encrypting facebook...')
          contactDetailsToSave.facebook_encrypted = await encryptContact(userContactDetails.facebook)
          contactDetailsToSave.share_facebook = true
          console.log('✅ Facebook encrypted')
      }
      if (shareContactDetails.instagram && userContactDetails.instagram) {
          console.log('🔐 Encrypting instagram...')
        contactDetailsToSave.instagram_encrypted = await encryptContact(userContactDetails.instagram)
        contactDetailsToSave.share_instagram = true
          console.log('✅ Instagram encrypted')
      }
      if (shareContactDetails.whatsapp && userContactDetails.whatsapp) {
          console.log('🔐 Encrypting whatsapp...')
        contactDetailsToSave.whatsapp_encrypted = await encryptContact(userContactDetails.whatsapp)
        contactDetailsToSave.share_whatsapp = true
          console.log('✅ WhatsApp encrypted')
        }
      } catch (encryptError: any) {
        console.error('❌ Error during encryption:', encryptError)
        await logVideoError('encryption_error', 'Failed to encrypt contact details', {
          error: encryptError?.message || String(encryptError),
          stack: encryptError?.stack
        }, encryptError?.stack)
        showError(new Error(`Failed to encrypt contact details: ${encryptError?.message || 'Unknown error'}`))
        return
      }

      if (Object.keys(contactDetailsToSave).length > 0) {
        // Convert encrypted bytea data to proper format for Supabase
        const contactDataToSave: any = {
            user_id: authUser.id,
            updated_at: new Date().toISOString()
        }
        
        // Handle each encrypted field
        for (const [key, value] of Object.entries(contactDetailsToSave)) {
          if (key.endsWith('_encrypted')) {
            // If value is a Buffer or ArrayBuffer, convert to base64 or keep as is
            if (value instanceof ArrayBuffer) {
              contactDataToSave[key] = new Uint8Array(value)
            } else if (Buffer.isBuffer(value)) {
              contactDataToSave[key] = value
            } else if (typeof value === 'string') {
              // If it's already a string, might need to convert
              // Try to parse as base64 or keep as is
              try {
                contactDataToSave[key] = Buffer.from(value, 'base64')
              } catch (e) {
                contactDataToSave[key] = value
              }
            } else {
              contactDataToSave[key] = value
            }
          } else {
            contactDataToSave[key] = value
          }
        }
        
        console.log('💾 Saving contact details:', {
          user_id: contactDataToSave.user_id,
          fields: Object.keys(contactDataToSave).filter(k => k !== 'user_id' && k !== 'updated_at'),
          encryptedFields: Object.keys(contactDataToSave).filter(k => k.endsWith('_encrypted'))
        })
        
        // Use upsert with explicit conflict resolution on user_id
        // Since there's a unique constraint on user_id, we need to specify it
        const { data: contactData, error: contactError } = await supabase
          .from('contact_details')
          .upsert(contactDataToSave, {
            onConflict: 'user_id'
          })
          .select()
        
        if (contactError) {
          // Extract error information more thoroughly
          const errorInfo: any = {}
          
          // Try to get standard error properties
          try {
            errorInfo.message = contactError?.message || 'Unknown error'
            errorInfo.code = contactError?.code || null
            errorInfo.details = contactError?.details || null
            errorInfo.hint = contactError?.hint || null
          } catch (e) {
            console.error('Error extracting standard properties:', e)
          }
          
          // Try to get all enumerable properties
          try {
            const enumerableProps: any = {}
            for (const key in contactError) {
              try {
                enumerableProps[key] = (contactError as any)[key]
              } catch (e) {
                enumerableProps[key] = '[Unable to read]'
              }
            }
            errorInfo.enumerableProperties = enumerableProps
          } catch (e) {
            errorInfo.enumerableError = String(e)
          }
          
          // Try to get all own properties (including non-enumerable)
          try {
            const ownProps: any = {}
            const propNames = Object.getOwnPropertyNames(contactError)
            propNames.forEach(prop => {
              try {
                ownProps[prop] = (contactError as any)[prop]
              } catch (e) {
                ownProps[prop] = '[Unable to read]'
              }
            })
            errorInfo.ownProperties = ownProps
          } catch (e) {
            errorInfo.ownPropertiesError = String(e)
          }
          
          // Try JSON stringify with replacer
          try {
            errorInfo.jsonString = JSON.stringify(contactError, (key, value) => {
              if (value instanceof Error) {
                return {
                  name: value.name,
                  message: value.message,
                  stack: value.stack
                }
              }
              return value
            })
          } catch (e) {
            errorInfo.jsonError = String(e)
          }
          
          // Try toString
          try {
            errorInfo.toString = String(contactError)
          } catch (e) {
            errorInfo.toStringError = String(e)
          }
          
          // Log error info as JSON to avoid object serialization issues
          console.error('❌ Error saving contact details:', JSON.stringify(errorInfo, null, 2))
          try {
            console.error('❌ Raw error object:', JSON.stringify(contactError, Object.getOwnPropertyNames(contactError), 2))
          } catch (e) {
            console.error('❌ Raw error (could not serialize):', String(contactError))
          }
          
          const errorMessage = errorInfo.message || errorInfo.toString || errorInfo.jsonString || 'Unknown error occurred'
          await logVideoError('api_error', 'Failed to save contact details', errorInfo)
          showError(new Error(`Failed to save contact details: ${errorMessage}`))
          return
        }
        console.log('✅ Contact details saved successfully:', contactData)
      } else {
        console.log('⚠️ No contact details to save (all checkboxes unchecked)')
        // Still update the exchange even if no contact details were shared
      }

      // Update contact exchange
      const isUser1 = authUser.id < partner.id
      const user1Id = isUser1 ? authUser.id : partner.id
      const user2Id = isUser1 ? partner.id : authUser.id
      
      const exchangeUpdate: any = {
        video_date_id: videoDateId,
        user1_id: user1Id,
        user2_id: user2Id
      }

      if (isUser1) {
        exchangeUpdate.user1_shared = true
      } else {
        exchangeUpdate.user2_shared = true
      }

      console.log('💾 Updating contact exchange:', exchangeUpdate)
      
      // Check if contact exchange already exists (to handle unique constraint)
      // The unique constraint is on (video_date_id, user1_id, user2_id)
      let exchange: any = null
      const { data: existingExchange, error: fetchError } = await supabase
        .from('contact_exchanges')
        .select('*')
        .eq('video_date_id', videoDateId)
        .eq('user1_id', user1Id)
        .eq('user2_id', user2Id)
        .maybeSingle()

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows returned
        const exchangeErrorInfo = {
          message: fetchError?.message || 'Unknown error',
          code: fetchError?.code || null,
          details: fetchError?.details || null
        }
        console.error('❌ Error checking existing contact exchange:', JSON.stringify(exchangeErrorInfo, null, 2))
        await logVideoError('api_error', 'Failed to check existing contact exchange', exchangeErrorInfo)
        showError(new Error(`Failed to update contact exchange: ${exchangeErrorInfo.message}`))
        return
      }

      if (existingExchange) {
        // Record exists - update it
        console.log('📝 Updating existing contact exchange')
        const updateData: any = {}
        if (isUser1) {
          updateData.user1_shared = true
        } else {
          updateData.user2_shared = true
        }
        
        const { data: updatedExchange, error: updateError } = await supabase
          .from('contact_exchanges')
          .update(updateData)
          .eq('id', existingExchange.id)
        .select()
        .single()

        if (updateError) {
        const exchangeErrorInfo = {
            message: updateError?.message || 'Unknown error',
            code: updateError?.code || null,
            details: updateError?.details || null
          }
          console.error('❌ Error updating existing contact exchange:', JSON.stringify(exchangeErrorInfo, null, 2))
          await logVideoError('api_error', 'Failed to update existing contact exchange', exchangeErrorInfo)
        showError(new Error(`Failed to update contact exchange: ${exchangeErrorInfo.message}`))
        return
        }
        
        exchange = updatedExchange
      } else {
        // Record doesn't exist - insert it
        console.log('➕ Creating new contact exchange')
        const { data: newExchange, error: insertError } = await supabase
          .from('contact_exchanges')
          .insert(exchangeUpdate)
          .select()
          .single()
        
        if (insertError) {
          const exchangeErrorInfo = {
            message: insertError?.message || 'Unknown error',
            code: insertError?.code || null,
            details: insertError?.details || null
          }
          console.error('❌ Error creating contact exchange:', JSON.stringify(exchangeErrorInfo, null, 2))
          await logVideoError('api_error', 'Failed to create contact exchange', exchangeErrorInfo)
          showError(new Error(`Failed to create contact exchange: ${exchangeErrorInfo.message}`))
          return
        }
        
        exchange = newExchange
      }

      console.log('✅ Contact exchange updated:', exchange)

      // Check if both users have shared
      if (exchange) {
        const bothShared = (isUser1 && exchange.user2_shared) || (!isUser1 && exchange.user1_shared)
        console.log('🔍 Checking if both shared:', { isUser1, user1_shared: exchange.user1_shared, user2_shared: exchange.user2_shared, bothShared })
        
        if (bothShared) {
          console.log('✅ Both users shared - exchanging contacts')
          // Both shared - exchange contacts
          const { error: updateError } = await supabase
            .from('contact_exchanges')
            .update({
              exchanged_at: new Date().toISOString()
            })
            .eq('id', exchange.id)

          if (updateError) {
            console.error('❌ Error updating exchange timestamp:', JSON.stringify({
              message: updateError?.message || 'Unknown error',
              code: updateError?.code || null
            }, null, 2))
          }

          // Fetch partner's contact details (decrypted)
          // Use maybeSingle() instead of single() to handle case where partner hasn't saved contacts yet
          const { data: partnerContacts, error: partnerError } = await supabase
            .from('contact_details')
            .select('*')
            .eq('user_id', partner.id)
            .maybeSingle()

          if (partnerError) {
            // Only log as error if it's not a "no rows" error (PGRST116)
            // PGRST116 means no rows found, which is expected if partner hasn't saved contacts yet
            if (partnerError.code !== 'PGRST116') {
            console.error('❌ Error fetching partner contacts:', JSON.stringify({
              message: partnerError?.message || 'Unknown error',
              code: partnerError?.code || null
            }, null, 2))
            } else {
              console.log('ℹ️ Partner has not saved contact details yet')
            }
          }

          if (partnerContacts) {
            console.log('✅ Partner contacts found, decrypting...')
            const decrypted: any = {}
            if (partnerContacts.share_email && partnerContacts.email_encrypted) {
              decrypted.email = await decryptContact(partnerContacts.email_encrypted)
            }
            if (partnerContacts.share_phone && partnerContacts.phone_encrypted) {
              decrypted.phone = await decryptContact(partnerContacts.phone_encrypted)
            }
            if (partnerContacts.share_facebook && partnerContacts.facebook_encrypted) {
              decrypted.facebook = await decryptContact(partnerContacts.facebook_encrypted)
            }
            if (partnerContacts.share_instagram && partnerContacts.instagram_encrypted) {
              decrypted.instagram = await decryptContact(partnerContacts.instagram_encrypted)
            }
            if (partnerContacts.share_whatsapp && partnerContacts.whatsapp_encrypted) {
              decrypted.whatsapp = await decryptContact(partnerContacts.whatsapp_encrypted)
            }

            console.log('✅ Contacts decrypted, showing match modal')
            setPartnerContactDetails(decrypted)
            setShowContactModal(false)
            setShowMatchModal(true)
          } else {
            console.log('⚠️ Partner contacts not found, redirecting to spin')
            setShowContactModal(false)
            router.push('/spin')
          }
        } else {
          console.log('⏳ Waiting for partner to share')
          // Waiting for partner to share - show waiting state
          setShowContactModal(false)
          setWaitingForPartner(true)
          
          // Set up real-time subscription to detect when partner shares
          const exchangeChannel = supabase
            .channel(`contact_exchange_${exchange.id}`)
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'contact_exchanges',
                filter: `id=eq.${exchange.id}`
              },
              async (payload) => {
                console.log('🔄 Contact exchange updated:', payload)
                const updatedExchange = payload.new as any
                
                // Check if partner has now shared
                const partnerShared = (isUser1 && updatedExchange.user2_shared) || (!isUser1 && updatedExchange.user1_shared)
                
                if (partnerShared && updatedExchange.exchanged_at) {
                  console.log('✅ Partner has shared! Exchanging contacts...')
                  setWaitingForPartner(false)
                  
                  // Fetch partner's contact details (decrypted)
                  // Use maybeSingle() instead of single() to handle case where partner hasn't saved contacts yet
                  const { data: partnerContacts, error: partnerError } = await supabase
                    .from('contact_details')
                    .select('*')
                    .eq('user_id', partner.id)
                    .maybeSingle()

                  if (partnerError) {
                    // Only treat as error if it's not a "no rows" error (PGRST116)
                    // PGRST116 means no rows found, which is expected if partner hasn't saved contacts yet
                    if (partnerError.code !== 'PGRST116') {
                    console.error('❌ Error fetching partner contacts:', JSON.stringify({
                      message: partnerError?.message || 'Unknown error',
                      code: partnerError?.code || null
                    }, null, 2))
                    setWaitingForPartner(false)
          router.push('/spin')
                    return
                    } else {
                      console.log('ℹ️ Partner has not saved contact details yet')
                      // Partner hasn't saved contacts - this is okay, just means they haven't shared yet
                      // Continue without partner contacts
                    }
                  }

                  if (partnerContacts) {
                    console.log('✅ Partner contacts found, decrypting...')
                    const decrypted: any = {}
                    if (partnerContacts.share_email && partnerContacts.email_encrypted) {
                      decrypted.email = await decryptContact(partnerContacts.email_encrypted)
                    }
                    if (partnerContacts.share_phone && partnerContacts.phone_encrypted) {
                      decrypted.phone = await decryptContact(partnerContacts.phone_encrypted)
                    }
                    if (partnerContacts.share_facebook && partnerContacts.facebook_encrypted) {
                      decrypted.facebook = await decryptContact(partnerContacts.facebook_encrypted)
                    }
                    if (partnerContacts.share_instagram && partnerContacts.instagram_encrypted) {
                      decrypted.instagram = await decryptContact(partnerContacts.instagram_encrypted)
                    }
                    if (partnerContacts.share_whatsapp && partnerContacts.whatsapp_encrypted) {
                      decrypted.whatsapp = await decryptContact(partnerContacts.whatsapp_encrypted)
                    }

                    console.log('✅ Contacts decrypted, showing match modal')
                    setPartnerContactDetails(decrypted)
                    setShowMatchModal(true)
                  } else {
                    console.log('⚠️ Partner contacts not found')
                    setWaitingForPartner(false)
                    router.push('/spin')
                  }
                  
                  // Unsubscribe after exchange
                  await supabase.removeChannel(exchangeChannel)
                  setExchangeSubscription(null)
                }
              }
            )
            .subscribe()
          
          // Store subscription for cleanup
          setExchangeSubscription(exchangeChannel)
        }
      } else {
        console.error('❌ Exchange update returned no data')
        setShowContactModal(false)
        router.push('/spin')
      }
    } catch (error) {
      console.error('Error submitting contact details:', error)
      showError(new Error('Failed to submit contact details. Please try again.'))
    }
  }

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      if (exchangeSubscription) {
        supabase.removeChannel(exchangeSubscription)
        setExchangeSubscription(null)
      }
    }
  }, [exchangeSubscription])

  // Helper functions for encryption (using pgcrypto via Supabase RPC)
  const encryptContact = async (value: string): Promise<string> => {
    try {
      console.log('🔐 Calling encrypt_contact RPC with:', { plaintext: value?.substring(0, 10) + '...' })
    const { data, error } = await supabase.rpc('encrypt_contact', {
      plaintext: value
    })
      
      if (error) {
        // Extract all possible error properties
        const errorInfo: any = {
          message: error?.message || 'Unknown error',
          code: error?.code || null,
          details: error?.details || null,
          hint: error?.hint || null,
        }
        
        // Try to get all properties from the error object
        try {
          const errorKeys = Object.keys(error)
          const errorValues: any = {}
          errorKeys.forEach(key => {
            try {
              errorValues[key] = (error as any)[key]
            } catch (e) {
              errorValues[key] = '[Unable to serialize]'
            }
          })
          errorInfo.allProperties = errorValues
        } catch (e) {
          errorInfo.serializationError = String(e)
        }
        
        console.error('❌ Encryption RPC error:', JSON.stringify(errorInfo, null, 2))
        await logVideoError('encryption_rpc_error', 'Failed to encrypt contact via RPC', errorInfo)
        throw new Error(`Encryption failed: ${errorInfo.message}`)
      }
      
      if (!data) {
        console.error('❌ Encryption returned null/undefined')
        await logVideoError('encryption_error', 'Encryption RPC returned no data', { value: value?.substring(0, 10) })
        throw new Error('Encryption returned no data')
      }
      
      console.log('✅ Encryption successful, data type:', typeof data, 'isBuffer:', Buffer.isBuffer(data), 'isArrayBuffer:', data instanceof ArrayBuffer, 'length:', data?.length || 'N/A')
      
      // Ensure we return the data as a string (function signature requires Promise<string>)
      // Convert Buffer/ArrayBuffer to base64 string for Supabase
      if (Buffer.isBuffer(data)) {
        return data.toString('base64')
      } else if (data instanceof ArrayBuffer) {
        return Buffer.from(data).toString('base64')
      } else if (typeof data === 'string') {
        // If it's already a string, return as is
        return data
      } else {
        // Try to convert to Buffer then to base64 string
        return Buffer.from(data as any).toString('base64')
      }
      } catch (err: any) {
        const errorDetails = {
          message: err?.message || String(err),
          stack: err?.stack,
          name: err?.name,
          cause: err?.cause
        }
        console.error('❌ Error in encryptContact:', JSON.stringify(errorDetails, null, 2))
      await logVideoError('encryption_error', 'Error in encryptContact function', {
        error: err?.message || String(err),
        stack: err?.stack
      }, err?.stack)
      throw err
    }
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

  const handleClose = async () => {
    if (!videoDateId || !partner) {
      router.push('/spin')
      return
    }

    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      router.push('/spin')
      return
    }

    // Save rating and feedback if provided
    if (rating !== null || feedback.trim()) {
      await supabase
        .from('date_ratings')
        .upsert({
          video_date_id: videoDateId,
          rater_id: authUser.id,
          rated_user_id: partner.id,
          rating: rating || null,
          feedback: feedback || null
        })
    }

    // Clean up all tracks before navigating away
    await cleanupAllTracksAndDisconnect()
    
    // Close modal and navigate to spin page
    setShowPostModal(false)
    router.push('/spin')
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

  // Enable camera and microphone (called on user interaction - required for iPhone)
  // Helper function to safely check room connection state
  const isRoomConnected = (): boolean => {
    if (!room) return false
    // ConnectionState enum: Disconnected, Connecting, Connected, Reconnecting, SignalReconnecting
    return room.state !== 'disconnected'
  }

  // Helper function to publish track with retry logic for engine connection errors
  /**
   * Promise-based function to wait for a local video track to appear in LiveKit publications.
   * Uses exponential backoff polling with multiple check intervals.
   * This eliminates React state synchronization delays by directly checking LiveKit publications.
   * 
   * @param timeoutMs Maximum time to wait (default: 2000ms)
   * @returns Promise that resolves with the MediaStreamTrack or null if not found
   */
  const waitForLocalVideoTrack = async (timeoutMs: number = 2000): Promise<MediaStreamTrack | null> => {
    if (!room || !isRoomConnected()) {
      console.warn('⚠️ waitForLocalVideoTrack: Room not connected')
      return null
    }

    const startTime = Date.now()
    const checkIntervals = [0, 50, 100, 200, 400, 800] // Exponential backoff intervals
    
    return new Promise((resolve) => {
      let checkIndex = 0
      
      const checkForTrack = () => {
        // Check timeout
        if (Date.now() - startTime > timeoutMs) {
          console.warn(`⚠️ waitForLocalVideoTrack: Timeout after ${timeoutMs}ms`)
          resolve(null)
          return
        }

        // Check if room is still connected
        if (!room || !isRoomConnected()) {
          console.warn('⚠️ waitForLocalVideoTrack: Room disconnected during check')
          resolve(null)
          return
        }

        // Check for video track in publications
        const videoPubs = Array.from(room.localParticipant.videoTrackPublications.values())
        const videoPub = videoPubs.find(pub => pub.track && pub.track.mediaStreamTrack)
        
        if (videoPub?.track?.mediaStreamTrack) {
          const track = videoPub.track.mediaStreamTrack
          console.log(`✅ waitForLocalVideoTrack: Found track after ${Date.now() - startTime}ms:`, track.id)
          resolve(track)
          return
        }

        // Schedule next check if we haven't exhausted intervals
        if (checkIndex < checkIntervals.length - 1) {
          const nextInterval = checkIntervals[checkIndex + 1] - checkIntervals[checkIndex]
          checkIndex++
          setTimeout(checkForTrack, nextInterval)
        } else {
          // After all intervals, do final check
          setTimeout(() => {
            const finalVideoPubs = Array.from(room.localParticipant.videoTrackPublications.values())
            const finalVideoPub = finalVideoPubs.find(pub => pub.track && pub.track.mediaStreamTrack)
            if (finalVideoPub?.track?.mediaStreamTrack) {
              resolve(finalVideoPub.track.mediaStreamTrack)
            } else {
              console.warn(`⚠️ waitForLocalVideoTrack: Track not found after ${Date.now() - startTime}ms`)
              resolve(null)
            }
          }, timeoutMs - (Date.now() - startTime))
        }
      }

      // Start checking immediately
      checkForTrack()
    })
  }

  /**
   * Directly attach a MediaStreamTrack to the video element using refs.
   * This bypasses React state delays for immediate visual feedback.
   */
  const attachTrackToVideoElement = (track: MediaStreamTrack) => {
    if (!localVideoRef.current) {
      console.warn('⚠️ attachTrackToVideoElement: localVideoRef.current is null')
      return false
    }

    try {
      const videoElement = localVideoRef.current
      const currentStream = videoElement.srcObject as MediaStream | null
      const currentTrackId = currentStream?.getVideoTracks()[0]?.id
      
      // Only reattach if track changed
      if (currentTrackId === track.id && videoElement.srcObject) {
        console.log('✅ attachTrackToVideoElement: Track already attached')
        return true
      }

      // Clean up old stream
      if (videoElement.srcObject) {
        const oldStream = videoElement.srcObject as MediaStream
        oldStream.getTracks().forEach(t => {
          // Don't stop the track - it's managed by LiveKit
        })
        videoElement.srcObject = null
      }

      // Create new stream and attach
      const stream = new MediaStream([track])
      videoElement.srcObject = stream
      
      // Force visibility with inline styles (higher priority than CSS)
      videoElement.style.setProperty('opacity', '1', 'important')
      videoElement.style.setProperty('display', 'block', 'important')
      videoElement.style.setProperty('visibility', 'visible', 'important')
      
      console.log('✅ attachTrackToVideoElement: Track attached directly to video element:', track.id)
      
      // Attempt to play
      videoElement.play().catch(err => {
        if (err.name !== 'NotAllowedError') {
          console.error('Error playing video in attachTrackToVideoElement:', err)
        }
      })
      
      return true
    } catch (err) {
      console.error('Error in attachTrackToVideoElement:', err)
      return false
    }
  }

  const publishTrackWithRetry = async (
    track: MediaStreamTrack,
    options: { source: Track.Source },
    attempt: number = 1
  ): Promise<void> => {
    if (!room || !isRoomConnected()) {
      throw new Error('Room not connected')
    }

    // Check if engine is ready
    if (!engineReady && attempt === 1) {
      console.warn('⚠️ Engine not ready, waiting before publishing...')
      let waitAttempts = 0
      while (!engineReady && waitAttempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 500))
        waitAttempts++
      }
    }

    try {
      await room.localParticipant.publishTrack(track, options)
      console.log(`✅ Track published successfully (${options.source})`)
    } catch (error: any) {
      const errorMsg = error?.message || String(error)
      const errorName = error?.name || ''
      
      // Handle "engine not connected" error with retry
      if (errorMsg.includes('engine not connected') || 
          errorMsg.includes('publishing rejected') ||
          errorName === 'PublishTrackError') {
        console.warn(`⚠️ Engine not ready for publishTrack (attempt ${attempt}), retrying...`)
        
        if (attempt < 3) {
          // Wait with exponential backoff: 1s, 2s
          const delay = 1000 * attempt
          await new Promise(resolve => setTimeout(resolve, delay))
          return publishTrackWithRetry(track, options, attempt + 1)
        } else {
          console.error('❌ Engine not ready after 3 publish attempts')
          throw new Error('Connection is still initializing. Please wait a moment and try again.')
        }
      }
      
      // Re-throw other errors
      throw error
    }
  }

  const enableCameraAndMic = async () => {
    console.log('🎥 enableCameraAndMic called')
    
    // CRITICAL: Set hasUserInteracted immediately when user clicks button
    // This is required for video.play() to work on mobile (autoplay policy)
    setHasUserInteracted(true)
    
    if (!isRoomConnected()) {
      console.error('❌ Room not available or disconnected')
      showWarning('Room not connected. Please wait and try again.')
      return
    }

    // Check if WebRTC engine is ready - with better detection
    if (!engineReady) {
      console.warn('⚠️ WebRTC engine not ready yet, waiting...')
      // Wait for engine to be ready (with timeout)
      let attempts = 0
      const maxAttempts = 20 // 10 seconds total
      while (!engineReady && attempts < maxAttempts) {
        // Check actual room state instead of just waiting
        if (room && room.state === 'connected' && room.engine) {
          setEngineReady(true)
          console.log('✅ Engine detected as ready during wait')
          break
        }
        await new Promise(resolve => setTimeout(resolve, 500))
        attempts++
      }
      if (!engineReady) {
        // Even if we can't detect it, try anyway - the actual publish will handle errors
        console.warn('⚠️ Engine ready check timed out, but proceeding anyway (publish will handle errors)')
        setEngineReady(true) // Mark as ready to allow publish attempt
      }
    }

    // Check if media devices are available
    if (typeof window === 'undefined') {
      console.error('❌ Window not available')
      return
    }

    if (!navigator.mediaDevices) {
      console.error('❌ navigator.mediaDevices not available')
      showError(new Error('Camera/microphone not available. Please use HTTPS or localhost.'))
      return
    }

    if (!navigator.mediaDevices.getUserMedia) {
      console.error('❌ getUserMedia not available')
      showError(new Error('Camera/microphone not available. Please use HTTPS or localhost.'))
      return
    }

    try {
      console.log('🎥 Requesting camera and microphone permissions...')
      
      // First, try to get permissions directly (this will show the permission prompt on iPhone)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        })
        console.log('✅ Permissions granted, got stream:', stream)
        
        // Stop the stream - we'll let LiveKit handle it
        stream.getTracks().forEach(track => track.stop())
      } catch (permError: any) {
        console.error('❌ Permission error:', permError)
        if (permError.name === 'NotAllowedError') {
          showError(new Error('Camera/microphone permission denied. Please allow access in your browser settings.'))
          return
        }
        // Continue anyway - LiveKit might still work
      }

      // Now enable via LiveKit with retry logic for engine connection
      console.log('🎥 Enabling via LiveKit...')
      const enableWithRetry = async (attempt: number = 1): Promise<void> => {
        try {
          // Check connection state before operation
          if (!room || !isRoomConnected()) {
            console.warn('⚠️ Room disconnected before enabling camera/mic')
            return
          }
          
      await room.localParticipant.enableCameraAndMicrophone()
          console.log('✅ LiveKit enableCameraAndMicrophone called successfully')
          
          // CRITICAL: Use Promise-based waitForTrack for deterministic behavior
          // This eliminates race conditions and React state synchronization delays
          const detectedTrack = await waitForLocalVideoTrack(2000) // 2 second timeout
          
          if (detectedTrack) {
            console.log('✅ Video track detected via waitForLocalVideoTrack:', detectedTrack.id)
            
            // Set track in React state for UI rendering
            setLocalVideoTrack(detectedTrack)
            setIsVideoOff(false)
            setCountdownVideoOff(false)
            
            // CRITICAL: Attach directly to video element using refs (bypasses React state delay)
            const attached = attachTrackToVideoElement(detectedTrack)
            if (attached) {
              console.log('✅ Video track attached directly to element, user should see video immediately')
            }
            
            // Also handle audio track if available
            if (room && isRoomConnected()) {
              const audioPubs = Array.from(room.localParticipant.audioTrackPublications.values())
              const audioPub = audioPubs.find(pub => pub.track && pub.track.mediaStreamTrack)
              if (audioPub?.track?.mediaStreamTrack && !localAudioTrack) {
                setLocalAudioTrack(audioPub.track.mediaStreamTrack)
              }
            }
          } else {
            console.warn('⚠️ waitForLocalVideoTrack: Track not found within timeout, TrackPublished event will handle it')
            // TrackPublished event handler will catch it as fallback
          }
        } catch (enableError: any) {
          const errorMsg = enableError?.message || String(enableError)
          const errorName = enableError?.name || ''
          
          // Handle connection errors
          if (errorMsg.includes('closed') || errorMsg.includes('disconnected')) {
            console.warn('⚠️ Room disconnected during enable operation')
            return
          }
          
          // Handle "engine not connected" error with retry
          if (errorMsg.includes('engine not connected') || 
              errorMsg.includes('publishing rejected') ||
              errorName === 'PublishTrackError') {
            console.warn(`⚠️ Engine not ready (attempt ${attempt}), retrying...`)
            
            if (attempt < 3) {
              // Wait with exponential backoff: 1s, 2s, 4s
              const delay = 1000 * Math.pow(2, attempt - 1)
              await new Promise(resolve => setTimeout(resolve, delay))
              return enableWithRetry(attempt + 1)
            } else {
              console.error('❌ Engine not ready after 3 attempts')
              showInfo('Connection is still initializing. Please wait a moment and try again.')
              throw enableError
            }
          }
          
          // Handle NotSupportedError gracefully - this happens in test environments
          if (errorName === 'NotSupportedError' || errorMsg.includes('Not supported')) {
            console.warn('⚠️ enableCameraAndMicrophone not supported - checking for existing tracks...')
            // Don't throw - continue to check for existing tracks
            return
          }
          
          // Re-throw other errors
          throw enableError
        }
      }
      
      // Try to enable - if it fails with NotSupportedError, we'll still check for tracks
      try {
        await enableWithRetry(1)
      } catch (enableErr: any) {
        // If enableCameraAndMicrophone fails, still check for existing tracks
        const enableErrMsg = enableErr?.message || String(enableErr)
        const enableErrName = enableErr?.name || ''
        
        if (enableErrName === 'NotSupportedError' || enableErrMsg.includes('Not supported')) {
          console.warn('⚠️ enableCameraAndMicrophone failed with NotSupportedError - will check for existing tracks')
          // Continue to track checking logic below - don't throw
        } else {
          // For other errors, re-throw to be caught by outer catch
          throw enableErr
        }
      }
      
      // Wait for tracks to be published - longer wait for iPhone
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Get local tracks with more aggressive retries
      let tracksFound = false
      const updateLocalTracks = (attempt: number) => {
        if (!isRoomConnected()) {
          console.log(`⚠️ Room disconnected during track check (attempt ${attempt})`)
          return
        }
        
        console.log(`🔍 Checking for tracks (attempt ${attempt})...`)
        
        if (!room) {
          // Room is null - this is checked and handled
          return
        }
        
        // Get video track - check all publications
        const videoPubs = Array.from(room.localParticipant.videoTrackPublications.values())
        console.log(`📹 Found ${videoPubs.length} video publications`)
        const videoPub = videoPubs.find(pub => pub.track && pub.track.mediaStreamTrack)
        if (videoPub?.track?.mediaStreamTrack) {
          const trackId = videoPub.track.mediaStreamTrack.id
          const track = videoPub.track.mediaStreamTrack
          console.log('✅ Video track found:', trackId, 'enabled:', track.enabled, 'readyState:', track.readyState)
          
          // Ensure track is enabled
          if (!track.enabled) {
            console.log('⚠️ Video track is disabled, enabling it')
            track.enabled = true
          }
          
          // Set the track in state
          setLocalVideoTrack(track)
          tracksFound = true
          
          // Ensure video is not marked as off (both states)
          setIsVideoOff(false)
          setCountdownVideoOff(false) // Also set countdown video to on
          
          // CRITICAL: Use direct ref attachment (bypasses React state delay)
          console.log('📹 Immediately attaching video track to local video element using direct ref')
          const attached = attachTrackToVideoElement(track)
          if (attached) {
            console.log('✅ Video track attached directly, user should see video immediately')
          } else {
            console.warn('⚠️ Failed to attach video track directly')
          }
        } else {
          console.log('⚠️ No video track found yet (checked', videoPubs.length, 'publications)')
        }

        // Get audio track
        const audioPubs = Array.from(room.localParticipant.audioTrackPublications.values())
        console.log(`🎤 Found ${audioPubs.length} audio publications`)
        const audioPub = audioPubs.find(pub => pub.track && pub.track.mediaStreamTrack)
        if (audioPub?.track?.mediaStreamTrack) {
          const trackId = audioPub.track.mediaStreamTrack.id
          console.log('✅ Audio track found:', trackId, 'enabled:', audioPub.track.mediaStreamTrack.enabled)
          // Ensure track is enabled
          if (!audioPub.track.mediaStreamTrack.enabled) {
            audioPub.track.mediaStreamTrack.enabled = true
          }
          setLocalAudioTrack(audioPub.track.mediaStreamTrack)
          tracksFound = true
        } else {
          console.log('⚠️ No audio track found yet (checked', audioPubs.length, 'publications)')
        }

        // If we found at least one track, mark as enabled
        if (tracksFound) {
          setCameraMicEnabled(true)
          setHasUserInteracted(true)
          console.log('✅ Camera/mic enabled successfully!')
        }
      }

      // CRITICAL: Set isVideoOff to false immediately when enabling (optimistic update)
      // This prevents the "video off" placeholder from showing while tracks are being published
      setIsVideoOff(false)
      setCountdownVideoOff(false)
      
      // Try multiple times with longer delays for iPhone
      updateLocalTracks(1)
      setTimeout(() => updateLocalTracks(2), 500)
      setTimeout(() => updateLocalTracks(3), 1000)
      setTimeout(() => updateLocalTracks(4), 2000)
      setTimeout(() => updateLocalTracks(5), 3000)
      setTimeout(() => {
        if (!tracksFound) {
          console.warn('⚠️ Tracks not found after 4 seconds, checking one more time...')
          
          // Final attempt: Check if tracks are now available
          if (room && isRoomConnected()) {
            const finalVideoPubs = Array.from(room.localParticipant.videoTrackPublications.values())
            const finalVideoPub = finalVideoPubs.find(pub => pub.track && pub.track.mediaStreamTrack)
            const finalAudioPubs = Array.from(room.localParticipant.audioTrackPublications.values())
            const finalAudioPub = finalAudioPubs.find(pub => pub.track && pub.track.mediaStreamTrack)
            
            if (finalVideoPub?.track?.mediaStreamTrack || finalAudioPub?.track?.mediaStreamTrack) {
              console.log('✅ Found tracks on final attempt')
              
              if (finalVideoPub?.track?.mediaStreamTrack) {
                const track = finalVideoPub.track.mediaStreamTrack
                setLocalVideoTrack(track)
                setIsVideoOff(false)
                setCountdownVideoOff(false)
                
                // Attach to video element
                if (localVideoRef.current) {
                  try {
                    const stream = new MediaStream([track])
                    localVideoRef.current.srcObject = stream
                    localVideoRef.current.style.opacity = '1'
                    localVideoRef.current.style.display = 'block'
                    localVideoRef.current.style.visibility = 'visible'
                    localVideoRef.current.play().catch(() => {})
                  } catch (err) {
                    console.error('Error attaching track on final attempt:', err)
                  }
                }
              }
              
              if (finalAudioPub?.track?.mediaStreamTrack) {
                setLocalAudioTrack(finalAudioPub.track.mediaStreamTrack)
              }
              
              setCameraMicEnabled(true)
              setHasUserInteracted(true)
              tracksFound = true
            } else {
              // No tracks found - mark as enabled anyway (user might have camera issues)
              console.warn('⚠️ No tracks found after all attempts, but marking as enabled')
              setCameraMicEnabled(true)
              setHasUserInteracted(true)
            }
          } else {
            setCameraMicEnabled(true)
            setHasUserInteracted(true)
          }
        }
      }, 4000)

    } catch (error: any) {
      console.error('❌ Error enabling camera/microphone:', {
        error,
        message: error?.message,
        name: error?.name,
        constraint: error?.constraint,
        stack: error?.stack,
      })
      
      const errorMsg = error?.message || String(error)
      const errorName = error?.name || ''
      
      // Suppress "createOffer with closed peer connection" errors - they're harmless
      if (errorMsg.includes('createOffer') && errorMsg.includes('closed')) {
        console.log('⚠️ WebRTC connection closed, but continuing...')
        setCameraMicEnabled(true)
        setHasUserInteracted(true)
        return
      }
      
      // Handle NotSupportedError - check for existing tracks before showing error
      if (errorName === 'NotSupportedError' || errorMsg.includes('Not supported')) {
        console.warn('⚠️ getUserMedia/enableCameraAndMicrophone not supported - checking for existing tracks...')
        
        // CRITICAL: Even if getUserMedia fails, check if LiveKit already has tracks
        if (room && isRoomConnected()) {
          const videoPubs = Array.from(room.localParticipant.videoTrackPublications.values())
          const videoPub = videoPubs.find(pub => pub.track && pub.track.mediaStreamTrack)
          const audioPubs = Array.from(room.localParticipant.audioTrackPublications.values())
          const audioPub = audioPubs.find(pub => pub.track && pub.track.mediaStreamTrack)
          
          if (videoPub?.track?.mediaStreamTrack || audioPub?.track?.mediaStreamTrack) {
            console.log('✅ Found existing tracks despite NotSupportedError - using them')
            
            if (videoPub?.track?.mediaStreamTrack) {
              const track = videoPub.track.mediaStreamTrack
              setLocalVideoTrack(track)
              setIsVideoOff(false)
              setCountdownVideoOff(false)
              
              // Attach to video element
              if (localVideoRef.current) {
                try {
                  const stream = new MediaStream([track])
                  localVideoRef.current.srcObject = stream
                  localVideoRef.current.style.opacity = '1'
                  localVideoRef.current.style.display = 'block'
                  localVideoRef.current.style.visibility = 'visible'
                  localVideoRef.current.play().catch(() => {})
                } catch (err) {
                  console.error('Error attaching existing video track:', err)
                }
              }
            }
            
            if (audioPub?.track?.mediaStreamTrack) {
              setLocalAudioTrack(audioPub.track.mediaStreamTrack)
            }
            
            setCameraMicEnabled(true)
            setHasUserInteracted(true)
            // Don't show error if we found tracks
            return
          }
        }
        
        // Only show error if no tracks were found
        showError(new Error('Camera/microphone not supported in this environment. Please use a supported browser with camera access.'))
        return
      }

      // Show user-friendly error message using toast for other errors
      showError(error)
    }
  }

  // Handle mute toggle
  const toggleMute = async () => {
    if (!isRoomConnected() || !room) return
    
    const newMutedState = !isMuted
    const localParticipant = room.localParticipant
    
    await logVideoEvent('user_interaction', 'media', `Microphone ${newMutedState ? 'muted' : 'unmuted'}`, {
      isMuted: newMutedState
    })
    
    try {
      // First, try to toggle existing tracks directly (works on mobile without getUserMedia)
      const audioPubs = Array.from(localParticipant.audioTrackPublications.values())
      const audioPub = audioPubs.find(pub => pub.track)
      
      if (audioPub?.track?.mediaStreamTrack) {
        // Track exists - toggle it directly without calling getUserMedia
        audioPub.track.mediaStreamTrack.enabled = !newMutedState
        setIsMuted(newMutedState)
        
        // Update local audio track state
        setLocalAudioTrack(audioPub.track.mediaStreamTrack)
        setCameraMicEnabled(true)
      } else {
        // No track - get stream directly and publish to LiveKit (required for iPhone)
        try {
          if (typeof window === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showError(new Error('Microphone not available. Please use HTTPS or localhost.'))
            setIsMuted(!newMutedState)
            return
          }

          // Request permission and get stream (preserves user gesture on iPhone)
          console.log('🎤 Requesting microphone permission...')
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          const audioTrack = stream.getAudioTracks()[0]
          
          if (!audioTrack) {
            showWarning('No audio track found')
            setIsMuted(!newMutedState)
            return
          }

          // Publish track to LiveKit
          console.log('📤 Publishing audio track to LiveKit...')
          await publishTrackWithRetry(audioTrack, {
            source: Track.Source.Microphone,
          })
          
          // Set track immediately
          setLocalAudioTrack(audioTrack)
          setIsMuted(newMutedState)
          setCameraMicEnabled(true)
          console.log('✅ Microphone enabled and published')
        } catch (err: any) {
          console.error('❌ Error enabling microphone:', err)
          if (err.name === 'NotAllowedError') {
            showError(new Error('Microphone permission denied. Please allow access in your browser settings.'))
          } else if (err.name === 'NotFoundError') {
            showError(new Error('No microphone found. Please check your device.'))
          } else {
            showError(err instanceof Error ? err : new Error(`Failed to enable microphone: ${err.message || 'Unknown error'}`))
          }
          setIsMuted(!newMutedState) // Revert on error
        }
      }
    } catch (error: any) {
      // Suppress "createOffer with closed peer connection" errors
      const errorMessage = error?.message || String(error)
      if (errorMessage.includes('createOffer') && errorMessage.includes('closed')) {
        // Harmless WebRTC error - connection was already closed
        setIsMuted(newMutedState)
        return
      }
      // Silently handle getUserMedia errors - expected on HTTP/mobile
      if (errorMessage.includes('getUserMedia') || errorMessage.includes('mediaDevices')) {
        // Expected error on HTTP/mobile - just update UI state
        setIsMuted(newMutedState)
      } else if (error?.name !== 'NotAllowedError' && error?.name !== 'NotFoundError') {
        console.error('Error toggling microphone:', error)
        setIsMuted(newMutedState)
      } else {
        setIsMuted(newMutedState)
      }
    }
  }

  // Handle video toggle
  const toggleVideo = async () => {
    if (!isRoomConnected() || !room) return
    
    const newVideoOffState = !isVideoOff
    const localParticipant = room.localParticipant
    
    await logVideoEvent('user_interaction', 'media', `Video ${newVideoOffState ? 'turned off' : 'turned on'}`, {
      isVideoOff: newVideoOffState
    })
    
    // Mark user as interacted when toggling video
    setHasUserInteracted(true)
    
    try {
      // First, try to toggle existing tracks directly (works on mobile without getUserMedia)
      const videoPubs = Array.from(localParticipant.videoTrackPublications.values())
      const videoPub = videoPubs.find(pub => pub.track)
      
      if (videoPub?.track?.mediaStreamTrack) {
        // Track exists - toggle it directly without calling getUserMedia
        const track = videoPub.track.mediaStreamTrack
        track.enabled = !newVideoOffState
        setIsVideoOff(newVideoOffState)
        
        // Update local video track state - CRITICAL: Always set track when enabling
        if (!newVideoOffState) {
          // Video is being enabled - ensure track is in state and enabled
          setLocalVideoTrack(track)
          setIsVideoOff(false) // Ensure video is marked as on
          setCountdownVideoOff(false) // Also ensure countdown video is on
          
          // Immediately attach to video element if available
          if (localVideoRef.current) {
            try {
              const stream = new MediaStream([track])
              localVideoRef.current.srcObject = stream
              localVideoRef.current.style.opacity = '1'
              localVideoRef.current.style.display = 'block'
              localVideoRef.current.style.visibility = 'visible'
              
              // Try to play immediately
              localVideoRef.current.play().catch(err => {
                if (err.name !== 'NotAllowedError') {
                  console.error('Error playing local video in toggleVideo:', err)
                }
              })
            } catch (err) {
              console.error('Error attaching video track in toggleVideo:', err)
            }
          }
        } else {
          // Video is being disabled
          setLocalVideoTrack(null)
        }
        setCameraMicEnabled(true)
      } else {
        // No track - get stream directly and publish to LiveKit (required for iPhone)
        try {
          if (typeof window === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showError(new Error('Camera not available. Please use HTTPS or localhost.'))
            setIsVideoOff(!newVideoOffState)
            return
          }

          // Request permission and get stream (preserves user gesture on iPhone)
          console.log('📹 Requesting camera permission...')
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          const videoTrack = stream.getVideoTracks()[0]
          
          if (!videoTrack) {
            showWarning('No video track found')
            setIsVideoOff(!newVideoOffState)
            return
          }

          // Publish track to LiveKit
          console.log('📤 Publishing video track to LiveKit...')
          await publishTrackWithRetry(videoTrack, {
            source: Track.Source.Camera,
          })
          
          // Set track immediately - CRITICAL: Ensure state is correct for video display
          setLocalVideoTrack(videoTrack)
          setIsVideoOff(false) // Video is being enabled, so set to false
          setCountdownVideoOff(false) // Also ensure countdown video is on
          setCameraMicEnabled(true)
          
          // Immediately attach to video element if available
          if (localVideoRef.current) {
            try {
              const stream = new MediaStream([videoTrack])
              localVideoRef.current.srcObject = stream
              localVideoRef.current.style.opacity = '1'
              localVideoRef.current.style.display = 'block'
              localVideoRef.current.style.visibility = 'visible'
              
              // Try to play immediately
              localVideoRef.current.play().catch(err => {
                if (err.name !== 'NotAllowedError') {
                  console.error('Error playing local video after publish:', err)
                }
              })
            } catch (err) {
              console.error('Error attaching video track after publish:', err)
            }
          }
          
          console.log('✅ Camera enabled and published')
        } catch (err: any) {
          console.error('❌ Error enabling camera:', err)
          if (err.name === 'NotAllowedError') {
            showError(new Error('Camera permission denied. Please allow access in your browser settings.'))
          } else if (err.name === 'NotFoundError') {
            showError(new Error('No camera found. Please check your device.'))
          } else {
            showError(err instanceof Error ? err : new Error(`Failed to enable camera: ${err.message || 'Unknown error'}`))
          }
          setIsVideoOff(!newVideoOffState) // Revert on error
        }
      }
    } catch (error: any) {
      // Silently handle getUserMedia errors - expected on HTTP/mobile
      const errorMessage = error?.message || String(error)
      if (errorMessage.includes('getUserMedia') || errorMessage.includes('mediaDevices')) {
        // Expected error on HTTP/mobile - just update UI state
        setIsVideoOff(newVideoOffState)
      } else if (error?.name !== 'NotAllowedError' && error?.name !== 'NotFoundError') {
        console.error('Error toggling camera:', error)
        setIsVideoOff(newVideoOffState)
      } else {
        setIsVideoOff(newVideoOffState)
      }
    }
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
    <div className="min-h-screen w-full bg-[#050810] text-white relative overflow-hidden pt-16 sm:pt-16">
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
                      {/* CRITICAL: Always render video element so ref is available */}
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                        style={{ 
                          // Video should be visible when track exists (auto-enabled since toggle buttons removed)
                          opacity: localVideoTrack ? 1 : 0,
                          display: 'block'
                        }}
                        onError={(e) => {
                          console.error('Countdown video element error:', e)
                        }}
                        onLoadedMetadata={() => {
                          console.log('✅ Countdown video metadata loaded')
                          if (localVideoRef.current && localVideoTrack) {
                            localVideoRef.current.play().catch(err => {
                              if (err.name !== 'NotAllowedError') {
                                console.error('Error playing countdown video:', err)
                              }
                            })
                          }
                        }}
                        onPlay={() => {
                          console.log('▶️ Countdown video started playing')
                        }}
                      />
                      {/* Show placeholder when video is off */}
                      {/* User info overlay - only show when video is on */}
                      {!countdownVideoOff && localVideoTrack && (
                        <div className="relative w-full h-full">
                          <div className="absolute bottom-1 left-1 sm:bottom-2 sm:left-2 flex items-center gap-1 sm:gap-2">
                            <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-lg overflow-hidden border border-teal-300/50 bg-white/10 backdrop-blur-sm">
                              {user.photo && user.photo.trim() !== '' && !user.photo.includes('pravatar.cc') ? (
                              <Image
                                src={user.photo}
                                alt={user.name}
                                fill
                                sizes="(max-width: 640px) 32px, 40px"
                                className="object-cover"
                                placeholder="empty"
                                unoptimized={user.photo?.includes('supabase.co')}
                              />
                              ) : null}
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
                      {user.photo && user.photo.trim() !== '' && !user.photo.includes('pravatar.cc') ? (
                      <Image
                        src={user.photo}
                        alt={user.name}
                        fill
                        sizes="(max-width: 640px) 64px, 80px"
                        className="object-cover"
                          placeholder="empty"
                      />
                      ) : null}
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
                      {partner.photo && partner.photo.trim() !== '' && !partner.photo.includes('pravatar.cc') ? (
                      <Image
                        src={partner.photo}
                        alt={partner.name}
                        fill
                        sizes="(max-width: 640px) 64px, 80px"
                        className="object-cover"
                        placeholder="empty"
                        unoptimized={partner.photo?.includes('supabase.co')}
                      />
                      ) : null}
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
                      {partner.photo && partner.photo.trim() !== '' && !partner.photo.includes('pravatar.cc') ? (
                        <Image
                          src={partner.photo}
                          alt={partner.name}
                          fill
                          sizes="(max-width: 640px) 96px, (max-width: 768px) 112px, 128px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                          <span className="text-white text-2xl font-bold">{partner.name.charAt(0).toUpperCase()}</span>
                        </div>
                      )}
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
                        {/* CRITICAL: Always render video element so ref is available */}
                        <video
                          ref={localVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                          style={{ 
                            opacity: (countdownVideoOff || !localVideoTrack) ? 0 : 1,
                            display: 'block'
                          }}
                          onError={(e) => {
                            console.error('Countdown video element error (desktop):', e)
                          }}
                          onLoadedMetadata={() => {
                            console.log('✅ Countdown video metadata loaded (desktop)')
                            if (localVideoRef.current && localVideoTrack) {
                              localVideoRef.current.play().catch(err => {
                                if (err.name !== 'NotAllowedError') {
                                  console.error('Error playing countdown video (desktop):', err)
                                }
                              })
                            }
                          }}
                          onPlay={() => {
                            console.log('▶️ Countdown video started playing (desktop)')
                          }}
                        />
                        {/* User info overlay - only show when video is on */}
                        {!countdownVideoOff && localVideoTrack && (
                          <div className="relative w-full h-full">
                            <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 md:bottom-4 md:left-4 flex items-center gap-2 sm:gap-3">
                              <div className="relative w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg sm:rounded-xl overflow-hidden border-2 border-teal-300/50 bg-white/10 backdrop-blur-sm">
                                {user.photo && user.photo.trim() !== '' && !user.photo.includes('pravatar.cc') ? (
                                <Image
                                  src={user.photo}
                                  alt={user.name}
                                  fill
                                  sizes="(max-width: 640px) 40px, (max-width: 768px) 48px, 56px"
                                  className="object-cover"
                                  placeholder="empty"
                                  unoptimized={user.photo?.includes('supabase.co')}
                                />
                                ) : null}
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
                          onClick={async () => {
                            const newMutedState = !countdownMuted
                            setCountdownMuted(newMutedState)
                            
                            if (!isRoomConnected() || !room) {
                              return
                            }

                            const localParticipant = room.localParticipant
                            const audioPubs = Array.from(localParticipant.audioTrackPublications.values())
                            const audioPub = audioPubs.find(pub => pub.track)
                            
                            if (audioPub?.track?.mediaStreamTrack) {
                              // Track exists - toggle directly
                              audioPub.track.mediaStreamTrack.enabled = !newMutedState
                              setLocalAudioTrack(audioPub.track.mediaStreamTrack)
                              setCameraMicEnabled(true)
                            } else {
                              // No track - get stream directly and publish to LiveKit (required for iPhone)
                              try {
                                if (typeof window === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                                  showError(new Error('Microphone not available. Please use HTTPS or localhost.'))
                                  setCountdownMuted(!newMutedState)
                                  return
                                }

                                // Request permission and get stream (preserves user gesture on iPhone)
                                console.log('🎤 Requesting microphone permission...')
                                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                                const audioTrack = stream.getAudioTracks()[0]
                                
                                if (!audioTrack) {
                                  showWarning('No audio track found')
                                  setCountdownMuted(!newMutedState)
                                  return
                                }

                                // Publish track to LiveKit
                                console.log('📤 Publishing audio track to LiveKit...')
                                await publishTrackWithRetry(audioTrack, {
                                  source: Track.Source.Microphone,
                                })
                                
                                // Set track immediately
                                setLocalAudioTrack(audioTrack)
                                setCameraMicEnabled(true)
                                console.log('✅ Microphone enabled and published')
                              } catch (err: any) {
                                console.error('❌ Error enabling microphone:', err)
                                if (err.name === 'NotAllowedError') {
                                  showError(new Error('Microphone permission denied. Please allow access in your browser settings.'))
                                } else if (err.name === 'NotFoundError') {
                                  showError(new Error('No microphone found. Please check your device.'))
                                } else {
                                  showError(err instanceof Error ? err : new Error(`Failed to enable microphone: ${err.message || 'Unknown error'}`))
                                }
                                setCountdownMuted(!newMutedState) // Revert on error
                              }
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
                          onClick={async () => {
                            const newVideoOffState = !countdownVideoOff
                            setCountdownVideoOff(newVideoOffState)
                            
                            if (!isRoomConnected() || !room) {
                              return
                            }

                            const localParticipant = room.localParticipant
                            const videoPubs = Array.from(localParticipant.videoTrackPublications.values())
                            const videoPub = videoPubs.find(pub => pub.track)
                            
                            if (videoPub?.track?.mediaStreamTrack) {
                              // Track exists - toggle directly
                              videoPub.track.mediaStreamTrack.enabled = !newVideoOffState
                              if (!newVideoOffState) {
                                setLocalVideoTrack(videoPub.track.mediaStreamTrack)
                              } else {
                                setLocalVideoTrack(null)
                              }
                              setCameraMicEnabled(true)
                            } else {
                              // No track - get stream directly and publish to LiveKit (required for iPhone)
                              try {
                                if (typeof window === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                                  showError(new Error('Camera not available. Please use HTTPS or localhost.'))
                                  setCountdownVideoOff(!newVideoOffState)
                                  return
                                }

                                // Request permission and get stream (preserves user gesture on iPhone)
                                console.log('📹 Requesting camera permission...')
                                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
                                const videoTrack = stream.getVideoTracks()[0]
                                
                                if (!videoTrack) {
                                  showWarning('No video track found')
                                  setCountdownVideoOff(!newVideoOffState)
                                  return
                                }

                                // Publish track to LiveKit
                                console.log('📤 Publishing video track to LiveKit...')
                                await publishTrackWithRetry(videoTrack, {
                                  source: Track.Source.Camera,
                                })
                                
                                // Set track immediately
                                setLocalVideoTrack(videoTrack)
                                setCameraMicEnabled(true)
                                console.log('✅ Camera enabled and published')
                                
                                // Note: Don't attach here - let the main useEffect handle attachment
                                // This ensures consistent attachment logic and avoids race conditions
                                console.log('📹 Countdown (desktop): Video track set in state, main useEffect will attach')
                              } catch (err: any) {
                                console.error('❌ Error enabling camera:', err)
          if (err.name === 'NotAllowedError') {
            showError(new Error('Camera permission denied. Please allow access in your browser settings.'))
          } else if (err.name === 'NotFoundError') {
                                  showError(new Error('No camera found. Please check your device.'))
                                } else {
                                  showError(err instanceof Error ? err : new Error(`Failed to enable camera: ${err.message || 'Unknown error'}`))
                                }
                                setCountdownVideoOff(!newVideoOffState) // Revert on error
                              }
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
                        data-testid="countdown-timer"
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
                      {user.photo && user.photo.trim() !== '' && !user.photo.includes('pravatar.cc') ? (
                      <Image
                        src={user.photo}
                        alt={user.name}
                        fill
                        sizes="128px"
                        className="object-cover"
                          placeholder="empty"
                      />
                      ) : null}
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
            className="relative z-10 px-4 sm:px-5 md:px-6 pt-2 sm:pt-5 md:pt-6 pb-3 sm:pb-4"
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
                        <span data-testid="main-timer" className="text-xl font-bold text-teal-300 tabular-nums">
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

                  {/* Control buttons - moved next to timer */}
                  <div className="flex items-center gap-1.5 sm:gap-2.5">
                    {/* Enable Camera & Mic Button - Show if not enabled yet */}
                    {!cameraMicEnabled && !localVideoTrack && !localAudioTrack && (
                      <motion.button
                        onClick={enableCameraAndMic}
                        className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl backdrop-blur-md border-2 border-teal-300/50 bg-teal-300/20 text-teal-300 hover:bg-teal-300/30 hover:border-teal-300 transition-all duration-300 shadow-lg shadow-teal-300/20"
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        title="Enable camera and microphone"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                      >
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <Video className="w-4 h-4 sm:w-5 sm:h-5" />
                          <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
                          <span className="text-xs sm:text-sm font-semibold">Enable</span>
                        </div>
                      </motion.button>
                    )}

                  <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="touch-manipulation"
                    >
                      <PrimaryButton
                        onClick={handleEndDate}
                        size="sm"
                        variant="secondary"
                        className="px-2 sm:px-3 md:px-4 text-[10px] sm:text-xs md:text-sm h-8 sm:h-9 md:h-10 min-h-[32px] sm:min-h-[36px] md:min-h-[40px] font-semibold"
                      >
                        <div className="flex items-center gap-1 sm:gap-1.5">
                          <PhoneOff className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" />
                          <span className="hidden sm:inline">end date</span>
                          <span className="sm:hidden">end</span>
                        </div>
                      </PrimaryButton>
                </motion.div>
                  </div>
                </div>
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
                    {/* CRITICAL: Always render video element so ref is available and track can attach */}
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      style={{ 
                        // Show video if track exists, even if isVideoOff is temporarily true
                        opacity: !localVideoTrack ? 0 : 1,
                        display: 'block',
                        visibility: !localVideoTrack ? 'hidden' : 'visible'
                      }}
                      onError={(e) => {
                        console.error('Local video element error:', e)
                      }}
                      onLoadedMetadata={() => {
                        console.log('✅ Local video metadata loaded, track:', !!localVideoTrack)
                        // Always attempt play when metadata loads
                        if (localVideoRef.current && localVideoTrack) {
                          console.log('▶️ Attempting to play local video after metadata loaded')
                          localVideoRef.current.play()
                            .then(() => {
                              console.log('✅ Local video playing after metadata loaded')
                            })
                            .catch(err => {
                              // Silently ignore NotAllowedError (expected on mobile without user interaction)
                              if (err.name !== 'NotAllowedError') {
                                console.error('Error playing local video after metadata loaded:', err)
                              }
                            })
                        }
                      }}
                      onPlay={() => {
                        console.log('▶️ Local video started playing')
                      }}
                    />
                    {/* Show placeholder when video is off - but only if no track exists */}
                    {isVideoOff && !localVideoTrack && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-center">
                          <VideoOff className="w-20 h-20 text-white/30 mx-auto mb-2" />
                          <p className="text-sm opacity-60 font-medium">video off</p>
                        </div>
                      </div>
                    )}

                    <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 md:bottom-4 md:left-4 flex items-center gap-2 sm:gap-3">
                      <div className="relative w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg sm:rounded-xl overflow-hidden border-2 border-teal-300/50 bg-white/10 backdrop-blur-sm">
                        {user.photo && user.photo.trim() !== '' && !user.photo.includes('pravatar.cc') ? (
                        <Image
                          src={user.photo}
                          alt={user.name}
                          fill
                          sizes="(max-width: 640px) 40px, (max-width: 768px) 48px, 56px"
                          className="object-cover"
                          placeholder="empty"
                          unoptimized={user.photo?.includes('supabase.co')}
                        />
                        ) : null}
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
                    {/* CRITICAL: Always render video element so ref is available for attachment */}
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      muted={false}
                      className="w-full h-full object-cover"
                      style={{ opacity: (isPartnerVideoOff || !remoteVideoTrack) ? 0 : 1 }}
                        onError={(e) => {
                          console.error('❌ Remote video element error:', e)
                        }}
                        onLoadedMetadata={() => {
                          console.log('✅ Remote video metadata loaded')
                          // Always attempt play, but handle AbortError
                          if (remoteVideoRef.current) {
                            const playPromise = remoteVideoRef.current.play()
                            if (playPromise !== undefined) {
                              playPromise.catch(err => {
                                if (err.name === 'AbortError') {
                                  console.warn('⚠️ Video play was aborted after metadata loaded, will retry')
                                  setTimeout(() => {
                                    if (remoteVideoRef.current && remoteVideoRef.current.paused) {
                                      remoteVideoRef.current.play().catch(() => {})
                                    }
                                  }, 200)
                                } else if (err.name !== 'NotAllowedError') {
                                console.error('Error playing remote video after metadata loaded:', err)
                              }
                            })
                            }
                          }
                        }}
                        onPlay={() => {
                          console.log('▶️ Remote video started playing')
                        }}
                        onPause={() => {
                          // Remote video paused - resume logic handles this
                          // Aggressively try to resume immediately and with retries
                          if (remoteVideoTrack && remoteVideoRef.current && remoteVideoRef.current.srcObject) {
                            // Try immediately
                            const tryPlay = () => {
                              if (remoteVideoRef.current && remoteVideoRef.current.paused && remoteVideoRef.current.srcObject) {
                                const playPromise = remoteVideoRef.current.play()
                                if (playPromise !== undefined) {
                                  playPromise.catch(err => {
                                    if (err.name === 'AbortError') {
                                      // Retry after abort
                                      setTimeout(tryPlay, 50)
                                    } else if (err.name !== 'NotAllowedError') {
                                      console.warn('Error resuming paused video:', err)
                                      // Still retry
                                      setTimeout(tryPlay, 200)
                                    }
                                  })
                                }
                              }
                            }
                            
                            // Try multiple times with increasing delays
                            tryPlay()
                            setTimeout(tryPlay, 50)
                            setTimeout(tryPlay, 100)
                            setTimeout(tryPlay, 200)
                            setTimeout(tryPlay, 500)
                          }
                        }}
                        onStalled={() => {
                          // Remote video stalled - resume logic handles this
                          if (remoteVideoRef.current && remoteVideoRef.current.paused && remoteVideoRef.current.srcObject) {
                            setTimeout(() => {
                              remoteVideoRef.current?.play().catch(() => {})
                            }, 100)
                          }
                        }}
                        onSuspend={() => {
                          console.warn('⚠️ Remote video suspended - attempting to resume')
                          if (remoteVideoRef.current && remoteVideoRef.current.paused && remoteVideoRef.current.srcObject) {
                            setTimeout(() => {
                              remoteVideoRef.current?.play().catch(() => {})
                            }, 100)
                          }
                        }}
                        onWaiting={() => {
                          // This is a normal event when video buffer is waiting for data
                          // Only log in development mode to reduce noise
                          if (process.env.NODE_ENV === 'development') {
                            console.log('ℹ️ Remote video waiting for data (normal buffering)')
                          }
                          // Check if stream is still active
                          if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
                            const stream = remoteVideoRef.current.srcObject as MediaStream
                            const tracks = stream.getVideoTracks()
                            if (tracks.length > 0 && tracks[0].readyState === 'live') {
                              // Track is live, just waiting for data - try to play
                              if (remoteVideoRef.current.paused) {
                                setTimeout(() => {
                                  remoteVideoRef.current?.play().catch(() => {})
                                }, 100)
                              }
                            } else {
                              // Stream track not live - this is checked and handled
                            }
                          }
                        }}
                      />
                    {/* Show placeholder when video is off */}
                    {(isPartnerVideoOff || !remoteVideoTrack) && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-center">
                          <VideoOff className="w-20 h-20 text-white/30 mx-auto mb-2" />
                          <p className="text-sm opacity-60 font-medium">partner video off</p>
                        </div>
                      </div>
                    )}
                    <audio 
                      ref={remoteAudioRef} 
                      autoPlay 
                      playsInline
                      muted={false}
                    />

                    <div className="absolute bottom-4 left-4 flex items-center gap-3">
                      <div className="relative w-14 h-14 rounded-xl overflow-hidden border-2 border-blue-400/50 bg-white/10 backdrop-blur-sm">
                        {partner.photo && partner.photo.trim() !== '' && !partner.photo.includes('pravatar.cc') ? (
                        <Image
                          src={partner.photo}
                          alt={partner.name}
                          fill
                          sizes="56px"
                          className="object-cover"
                            placeholder="empty"
                        />
                        ) : null}
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

            </div>
          </div>
        </>
      )}

      {/* Post-date feedback modal - Mobile: Compact and centered */}
      <Modal
        isOpen={showPostModal}
        onClose={() => {}}
        title="how was your date?"
        className="max-w-sm sm:max-w-sm"
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
              {partner.photo && partner.photo.trim() !== '' && !partner.photo.includes('pravatar.cc') ? (
              <Image
                src={partner.photo}
                alt={partner.name}
                fill
                sizes="(max-width: 640px) 64px, 80px"
                className="object-cover"
                placeholder="empty"
                unoptimized={partner.photo?.includes('supabase.co')}
              />
              ) : null}
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
              className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-red-500/50 hover:bg-red-500/10 transition-all duration-300 text-[10px] text-red-300/80 hover:text-red-300 flex items-center justify-center gap-1"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Flag className="w-3 h-3" />
              <span>report inappropriate behavior</span>
            </motion.button>
          </motion.div>

          <motion.div
            className="w-full pt-1 sm:pt-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <motion.button
              onClick={handleClose}
              className="w-full px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all duration-300 font-semibold text-xs sm:text-base flex items-center justify-center gap-2"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>close</span>
            </motion.button>
          </motion.div>
        </motion.div>
      </Modal>

      {/* Report modal */}
      <Modal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        title="report inappropriate behavior"
        className="max-w-sm sm:max-w-sm"
      >
        <motion.div
          className="flex flex-col gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="text-center">
            <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <Flag className="w-6 h-6 text-red-400" />
            </div>
            <p className="text-xs opacity-80 mb-4">
              help us keep the community safe. please describe what happened.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium opacity-80">
              category
            </label>
            <select
              value={reportCategory}
              onChange={(e) => setReportCategory(e.target.value)}
              className="w-full p-2 rounded-lg bg-white/5 border border-white/10 focus:border-red-500/50 focus:outline-none text-white text-xs transition-all duration-300"
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

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium opacity-80">
              details
            </label>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="describe what happened..."
              className="w-full p-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-red-500/50 focus:outline-none text-white placeholder-white/40 text-xs transition-all duration-300 resize-none min-h-[80px]"
              rows={4}
            />
          </div>

          <div className="flex gap-2">
            <motion.button
              onClick={() => setShowReportModal(false)}
              className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all duration-300 font-semibold text-xs"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              cancel
            </motion.button>
            <motion.button
              onClick={handleSubmitReport}
              disabled={!reportCategory || !reportReason.trim()}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold text-xs transition-all duration-300 ${
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

          <p className="text-[10px] opacity-60 text-center">
            reports are reviewed by our team. we take all reports seriously.
          </p>
        </motion.div>
      </Modal>

      {/* End date confirmation modal */}
      <Modal
        isOpen={showEndDateConfirm}
        onClose={() => setShowEndDateConfirm(false)}
        title="end date?"
        className="max-w-sm sm:max-w-sm"
      >
        <motion.div
          className="flex flex-col gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <p className="text-center text-sm opacity-80">
            are you sure you want to end date?
          </p>
          <div className="flex gap-3">
            <motion.button
              onClick={() => setShowEndDateConfirm(false)}
              className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all duration-300 font-semibold text-sm"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              cancel
            </motion.button>
            <motion.button
              onClick={handleConfirmEndDate}
              className="flex-1 px-4 py-2.5 rounded-lg bg-teal-300 text-black font-semibold hover:bg-teal-200 transition-all duration-300 shadow-lg shadow-teal-300/30 text-sm"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              yes
            </motion.button>
          </div>
        </motion.div>
      </Modal>

      {/* Partner ended date modal */}
      <AnimatePresence>
        {showPartnerEndedDateModal && (
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
                <PhoneOff className="w-8 h-8 text-white/60" />
              </motion.div>
              <h2 className="text-xl font-bold text-teal-300 mb-2">
                date ended
              </h2>
              <p className="opacity-80 text-sm mb-6">your partner ended the date</p>
              <motion.button
                onClick={() => {
                  setShowPartnerEndedDateModal(false)
                  router.push('/spin')
                }}
                className="w-full px-4 py-2.5 rounded-lg bg-teal-300 text-black font-semibold hover:bg-teal-200 transition-all duration-300 shadow-lg shadow-teal-300/30"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                ok
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                <Facebook className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-teal-300 flex-shrink-0" />
                <span>facebook (optional)</span>
                <input
                  type="checkbox"
                  checked={shareContactDetails.facebook}
                  onChange={(e) => setShareContactDetails(prev => ({ ...prev, facebook: e.target.checked }))}
                  className="ml-auto w-4 h-4 rounded border-white/20 bg-white/5 text-teal-300 focus:ring-teal-300"
                />
              </label>
              {shareContactDetails.facebook && (
              <input
                type="text"
                  value={userContactDetails.facebook}
                  onChange={(e) => setUserContactDetails(prev => ({ ...prev, facebook: e.target.value }))}
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

      {/* Waiting for partner modal */}
      <AnimatePresence>
        {waitingForPartner && (
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
              className="relative bg-white/10 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-6 sm:p-8 max-w-md w-full max-w-[calc(100vw-1.5rem)] border border-white/10 shadow-2xl text-center"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                className="w-16 h-16 bg-teal-300/20 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  <Loader2 className="w-8 h-8 text-teal-300" />
                </motion.div>
              </motion.div>
              
              <motion.h2
                className="text-xl sm:text-2xl font-bold text-teal-300 mb-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                waiting for {partner?.name || 'partner'}
              </motion.h2>
              
              <motion.p
                className="opacity-80 text-sm mb-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.8 }}
                transition={{ delay: 0.4 }}
              >
                you've shared your contact details!<br />
                waiting for {partner?.name || 'your partner'} to share theirs...
              </motion.p>

              <motion.button
                onClick={() => {
                  setWaitingForPartner(false)
                  if (exchangeSubscription) {
                    supabase.removeChannel(exchangeSubscription)
                    setExchangeSubscription(null)
                  }
                  router.push('/spin')
                }}
                className="px-6 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-all duration-300 text-sm"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                go back to spin
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
