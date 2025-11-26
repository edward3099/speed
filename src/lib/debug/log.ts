import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Frontend logger for client-side events
 * Logs all user interactions and frontend state changes
 */
export async function logClientEvent(
  supabase: SupabaseClient,
  eventType: string,
  metadata: Record<string, any> = {},
  userId?: string,
  severity: 'debug' | 'info' | 'warning' | 'error' | 'critical' = 'info'
) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const finalUserId = userId || user?.id

    await supabase.from('debug_logs').insert([
      {
        user_id: finalUserId,
        event_type: eventType,
        state_before: null,
        state_after: null,
        metadata: {
          ...metadata,
          browser: typeof window !== 'undefined' ? navigator.userAgent : null,
          timestamp: new Date().toISOString(),
        },
        severity,
      },
    ])
  } catch (error) {
    // Silently fail - logging should never break the app
    console.error('Failed to log client event:', error)
  }
}

/**
 * Log spin button press
 */
export async function logSpinPressed(
  supabase: SupabaseClient,
  userId?: string
) {
  await logClientEvent(
    supabase,
    'frontend_spin_pressed',
    {
      session_id: typeof window !== 'undefined' ? sessionStorage.getItem('session_id') : null,
    },
    userId,
    'info'
  )
}

/**
 * Log successful queue join
 */
export async function logJoinQueueSuccess(
  supabase: SupabaseClient,
  queueId: string,
  userId?: string
) {
  await logClientEvent(
    supabase,
    'frontend_join_queue_success',
    { queue_id: queueId },
    userId,
    'info'
  )
}

/**
 * Log match received
 */
export async function logMatchReceived(
  supabase: SupabaseClient,
  matchId: string,
  partnerId: string,
  userId?: string
) {
  await logClientEvent(
    supabase,
    'frontend_match_received',
    { match_id: matchId, partner_id: partnerId },
    userId,
    'info'
  )
}

/**
 * Compute remaining seconds from vote_expires_at
 */
export function computeRemainingSeconds(voteExpiresAt: string | null): number {
  if (!voteExpiresAt) return 0
  
  const now = Date.now()
  const expiresAt = new Date(voteExpiresAt).getTime()
  return Math.max(0, Math.floor((expiresAt - now) / 1000))
}

/**
 * Log vote window start with remaining seconds
 */
export async function logVoteWindowStart(
  supabase: SupabaseClient,
  matchId: string,
  partnerId: string,
  voteStartedAt: string | null,
  voteExpiresAt: string | null,
  remainingSeconds: number,
  userId?: string
) {
  await logClientEvent(
    supabase,
    'frontend_vote_window_start',
    {
      match_id: matchId,
      partner_id: partnerId,
      vote_started_at: voteStartedAt,
      vote_expires_at: voteExpiresAt,
      remaining_seconds: remainingSeconds,
    },
    userId,
    'info'
  )
}

/**
 * Log invalid vote window (remaining seconds too low or missing)
 */
export async function logVoteWindowInvalid(
  supabase: SupabaseClient,
  matchId: string,
  remainingSeconds: number | null,
  fallbackWindowSec: number,
  userId?: string
) {
  await logClientEvent(
    supabase,
    'frontend_vote_window_invalid',
    {
      match_id: matchId,
      remaining_seconds: remainingSeconds,
      fallback_window_sec: fallbackWindowSec,
    },
    userId,
    'error'
  )
}

/**
 * Log vote cast
 */
export async function logVote(
  supabase: SupabaseClient,
  voteType: 'yes' | 'pass',
  partnerId: string,
  matchId: string,
  userId?: string
) {
  await logClientEvent(
    supabase,
    'frontend_vote',
    { vote_type: voteType, partner_id: partnerId, match_id: matchId },
    userId,
    'info'
  )
}

/**
 * Log idle timeout
 */
export async function logIdleTimeout(
  supabase: SupabaseClient,
  userId?: string
) {
  await logClientEvent(
    supabase,
    'frontend_idle_timeout',
    {},
    userId,
    'warning'
  )
}

/**
 * Log respin trigger
 */
export async function logRespinTrigger(
  supabase: SupabaseClient,
  reason: 'partner_passed' | 'partner_disconnected' | 'countdown_end',
  userId?: string
) {
  await logClientEvent(
    supabase,
    'frontend_respin_trigger',
    { reason },
    userId,
    'info'
  )
}

/**
 * Log video date start
 */
export async function logVideoDateStart(
  supabase: SupabaseClient,
  matchId: string,
  userId?: string
) {
  await logClientEvent(
    supabase,
    'frontend_video_date_start',
    { match_id: matchId },
    userId,
    'info'
  )
}

