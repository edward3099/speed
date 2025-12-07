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
          
          // Calculate theoretical wait based on queue position and match rate
          // Average position in queue (assuming you're in the middle)
          const avgPosition = count / 2
          // Each match uses 2 people, so people are matched at rate of matchRatePerMin * 2
          const theoreticalWait = avgPosition / (matchRatePerMin * 2)
          
          // Use actual average wait time if it's meaningful (queue has been active)
          // Otherwise fall back to theoretical calculation
          let estimatedMinutes: number
          if (baseWaitMinutes > 5 && totalInQueue > 10) {
            // Use actual wait time as base, adjusted for gender ratio
            if (ratio > 1.5) {
              // Your gender is abundant - wait longer
              // Use logarithmic scaling: 2:1 = 1.3x, 5:1 = 1.8x, 11.5:1 = 2.4x
              const ratioMultiplier = 1 + Math.log(ratio) * 0.4
              estimatedMinutes = baseWaitMinutes * ratioMultiplier
            } else if (ratio < 0.67) {
              // Your gender is scarce - wait less
              const ratioMultiplier = Math.max(0.6, 1 - (1/ratio - 1) * 0.25)
              estimatedMinutes = baseWaitMinutes * ratioMultiplier
            } else {
              // Balanced ratio
              estimatedMinutes = baseWaitMinutes
            }
            
            // Blend with theoretical calculation (30% weight) to account for current queue state
            estimatedMinutes = estimatedMinutes * 0.7 + theoreticalWait * 0.3
          } else {
            // Use theoretical calculation, adjusted for ratio
            if (ratio > 1) {
              estimatedMinutes = theoreticalWait * Math.min(ratio / 1.5, 3) // Cap ratio effect
            } else {
              estimatedMinutes = theoreticalWait
            }
          }
          
          // Cap at reasonable maximum (4 hours) and minimum (1 minute)
          estimatedWaitTimes[gender] = Math.round(Math.max(1, Math.min(estimatedMinutes, 240)))
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
    console.error('Error in /api/admin/queue-stats:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    )
  }
}



