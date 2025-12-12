/**
 * ADMIN ENDPOINT: /api/admin/queue-stats
 * 
 * Returns queue statistics including gender distribution, wait times, and match rates
 * Used for monitoring and user communication about wait times
 * 
 * Requires authentication (admin only in production)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // In production, add admin check here
    // For now, allow authenticated users (can restrict later)
    const isAdmin = process.env.NODE_ENV === 'development' || 
                    request.headers.get('x-admin-key') === process.env.ADMIN_API_KEY

    if (!isAdmin && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      )
    }

    // Get queue statistics with gender distribution
    const { data: queueStats, error: queueError } = await supabase.rpc('get_queue_stats')
    
    if (queueError) {
      // Fallback to manual query if RPC doesn't exist
      const { data: queueData, error: queueQueryError } = await supabase
        .from('queue')
        .select(`
          user_id,
          waiting_since,
          fairness,
          profiles!inner(gender)
        `)

      if (queueQueryError) {
        throw queueQueryError
      }

      // Calculate statistics
      const totalInQueue = queueData?.length || 0
      const now = new Date()
      
      // Gender distribution
      const genderCounts = queueData?.reduce((acc, item: any) => {
        const gender = item.profiles?.gender || 'unknown'
        acc[gender] = (acc[gender] || 0) + 1
        return acc
      }, {} as Record<string, number>) || {}

      // Wait times
      const waitTimes = queueData?.map(item => {
        const waitingSince = new Date(item.waiting_since)
        return Math.max(0, (now.getTime() - waitingSince.getTime()) / 1000) // seconds
      }) || []

      const avgWaitTime = waitTimes.length > 0
        ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
        : 0

      const maxWaitTime = waitTimes.length > 0
        ? Math.max(...waitTimes)
        : 0

      const usersWaitingOver60s = waitTimes.filter(t => t > 60).length

      // Get recent match rate
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
      const { count: matchesLastHour } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo)

      // Calculate estimated wait times by gender
      const estimatedWaitTimes: Record<string, number> = {}
      
      // Calculate estimated wait times using a combination of:
      // 1. Actual average wait time (if available and meaningful)
      // 2. Queue size and match rate (theoretical calculation)
      // 3. Gender ratio adjustment
      const matchRatePerMin = Math.max((matchesLastHour || 0) / 60, 0.01) // matches per minute
      const baseWaitMinutes = Math.max(avgWaitTime / 60, 1) // Actual average wait in minutes
      
      Object.keys(genderCounts).forEach(gender => {
        const count = genderCounts[gender]
        const oppositeGender = gender === 'male' ? 'female' : 'male'
        const oppositeCount = genderCounts[oppositeGender] || 0
        
        if (oppositeCount === 0) {
          estimatedWaitTimes[gender] = -1 // Cannot estimate (no opposite gender)
        } else {
          const ratio = count / oppositeCount
          
          // Calculate wait time based on queue position and match rate
          // Key insight: If you're at position N, you need approximately N/2 matches to happen before you
          // (assuming you're in the middle of your gender group)
          
          let estimatedMinutes: number
          
          // Average position in queue for this gender (assuming you're in the middle)
          const avgPosition = count / 2
          
          // Base calculation: how many matches need to happen before you
          // Each match removes 2 people (one of each gender), so matches happen at rate of matchRatePerMin
          const matchesNeeded = avgPosition / 2 // Half because each match processes 2 people
          const baseWaitMinutes = matchesNeeded / matchRatePerMin
          
          if (ratio > 1.2) {
            // Your gender is abundant - you'll wait longer due to competition
            // The bottleneck is the opposite gender availability
            // Apply a multiplier based on how much more abundant your gender is
            // For ratio 2:1, multiplier ~1.3x; for 5:1, ~1.6x; for 11.5:1, ~2.0x
            const ratioMultiplier = 1 + Math.log(ratio) * 0.25
            estimatedMinutes = baseWaitMinutes * ratioMultiplier
            
            // However, if there are more people of your gender than can possibly be matched
            // (i.e., more than opposite gender count), some will never match
            // In that case, show a more realistic estimate based on bottleneck
            if (count > oppositeCount * 2) {
              // Extreme imbalance - many people won't match
              // Estimate based on how long to process all possible matches
              const maxPossibleMatches = oppositeCount
              const timeToProcessAll = maxPossibleMatches / matchRatePerMin
              // If you're in the unlucky group, your wait could be very long
              // Use a more conservative estimate: blend base wait with bottleneck time
              estimatedMinutes = Math.min(estimatedMinutes, timeToProcessAll * 1.5)
            }
          } else if (ratio < 0.8) {
            // Your gender is scarce - you'll match faster
            // Apply a reduction factor
            const ratioMultiplier = Math.max(0.7, 1 - (1/ratio - 1) * 0.2)
            estimatedMinutes = baseWaitMinutes * ratioMultiplier
          } else {
            // Balanced ratio - use base calculation
            estimatedMinutes = baseWaitMinutes
          }
          
          // Blend with actual average wait time if available and meaningful
          // For smaller queues, actual wait time is more reliable
          // For larger queues, theoretical is more accurate
          if (baseWaitMinutes > 5 && totalInQueue > 10 && totalInQueue < 200) {
            // Small-medium queues: blend 50/50
            estimatedMinutes = estimatedMinutes * 0.5 + baseWaitMinutes * 0.5
          } else if (totalInQueue >= 200 && totalInQueue < 500) {
            // Medium-large queues: favor theoretical (70/30)
            estimatedMinutes = estimatedMinutes * 0.7 + baseWaitMinutes * 0.3
          } else if (totalInQueue >= 500) {
            // Very large queues: mostly theoretical (90/10) since actual wait may not reflect current state
            estimatedMinutes = estimatedMinutes * 0.9 + baseWaitMinutes * 0.1
          }
          
          // Cap at reasonable maximum (12 hours) and minimum (1 minute)
          // For extremely long waits, show 12h as "very long wait" rather than unrealistic numbers
          estimatedWaitTimes[gender] = Math.round(Math.max(1, Math.min(estimatedMinutes, 720)))
        }
      })

      return NextResponse.json({
        success: true,
        timestamp: now.toISOString(),
        queue: {
          total: totalInQueue,
          averageWaitSeconds: Math.round(avgWaitTime),
          maxWaitSeconds: Math.round(maxWaitTime),
          usersWaitingOver60s,
        },
        genderDistribution: {
          male: genderCounts.male || 0,
          female: genderCounts.female || 0,
          other: genderCounts.other || 0,
          unknown: genderCounts.unknown || 0,
          ratio: genderCounts.male && genderCounts.female
            ? (genderCounts.male / genderCounts.female).toFixed(2)
            : 'N/A',
        },
        estimatedWaitTimes: {
          male: estimatedWaitTimes.male || -1,
          female: estimatedWaitTimes.female || -1,
        },
        matchRate: {
          matchesLastHour: matchesLastHour || 0,
          matchesPerMinute: ((matchesLastHour || 0) / 60).toFixed(2),
        },
        health: {
          status: usersWaitingOver60s > totalInQueue * 0.5 ? 'warning' : 'healthy',
          message: usersWaitingOver60s > totalInQueue * 0.5
            ? 'High number of users waiting >60s - check gender balance'
            : 'Queue operating normally',
        },
      })
    }

    return NextResponse.json(queueStats)

  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in /api/admin/queue-stats:', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      })
    }
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    )
  }
}



