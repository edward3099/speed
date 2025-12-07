/**
 * Matching Query Optimizer
 * Based on trade-matching-engine patterns
 * Optimizes matching queries with better patterns
 */

import { SupabaseClient } from '@supabase/supabase-js'

export interface MatchingQueryOptions {
  limit?: number
  minFairness?: number
  maxWaitTime?: number // seconds
  excludeUserIds?: string[]
}

/**
 * Optimized query to get waiting users for matching
 * Uses indexes: idx_users_state_matching, idx_queue_matching_priority
 */
export async function getWaitingUsersForMatching(
  supabase: SupabaseClient,
  options: MatchingQueryOptions = {}
): Promise<Array<{ user_id: string; fairness: number; waiting_since: string }>> {
  const { limit = 50, minFairness = 0, excludeUserIds = [] } = options

  // Use optimized query with indexes
  // This query uses idx_queue_matching_priority and idx_users_state_matching
  const { data, error } = await supabase
    .from('queue')
    .select(
      `
      user_id,
      fairness,
      waiting_since,
      users_state!inner(state, last_active)
    `
    )
    .eq('users_state.state', 'waiting')
    .gte('fairness', minFairness)
    .gt('users_state.last_active', new Date(Date.now() - 30 * 1000).toISOString())
    .not('user_id', 'in', `(${excludeUserIds.join(',')})`)
    .order('fairness', { ascending: false })
    .order('waiting_since', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('Error getting waiting users:', error)
    return []
  }

  return (
    data?.map((item: any) => ({
      user_id: item.user_id,
      fairness: item.fairness,
      waiting_since: item.waiting_since,
    })) || []
  )
}

/**
 * Optimized query to check if users have matched before
 * Uses index: idx_matches_user_pair
 */
export async function haveUsersMatchedBefore(
  supabase: SupabaseClient,
  user1Id: string,
  user2Id: string
): Promise<boolean> {
  // Use optimized query with idx_matches_user_pair index
  const { data, error } = await supabase
    .from('matches')
    .select('match_id')
    .or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`)
    .or(`user1_id.eq.${user2Id},user2_id.eq.${user2Id}`)
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') {
    // PGRST116 means no rows found, which is fine
    console.error('Error checking match history:', error)
    return false
  }

  return !!data
}

/**
 * Optimized query to get match history for a user
 * Uses index: idx_matches_user_pair
 */
export async function getUserMatchHistory(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 10
): Promise<Array<{ match_id: string; user1_id: string; user2_id: string; created_at: string }>> {
  const { data, error } = await supabase
    .from('matches')
    .select('match_id, user1_id, user2_id, created_at')
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error getting match history:', error)
    return []
  }

  return data || []
}

/**
 * Batch check multiple user pairs for previous matches
 * More efficient than checking one by one
 */
export async function batchCheckMatchHistory(
  supabase: SupabaseClient,
  userPairs: Array<{ user1Id: string; user2Id: string }>
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>()

  // Get all user IDs
  const allUserIds = new Set<string>()
  userPairs.forEach((pair) => {
    allUserIds.add(pair.user1Id)
    allUserIds.add(pair.user2Id)
  })

  // Fetch all matches for these users in one query
  const { data, error } = await supabase
    .from('matches')
    .select('user1_id, user2_id')
    .or(`user1_id.in.(${Array.from(allUserIds).join(',')}),user2_id.in.(${Array.from(allUserIds).join(',')})`)

  if (error) {
    console.error('Error batch checking match history:', error)
    // Return all false if error
    userPairs.forEach((pair) => {
      results.set(`${pair.user1Id}-${pair.user2Id}`, false)
    })
    return results
  }

  // Build a set of matched pairs
  const matchedPairs = new Set<string>()
  data?.forEach((match) => {
    matchedPairs.add(`${match.user1_id}-${match.user2_id}`)
    matchedPairs.add(`${match.user2_id}-${match.user1_id}`)
  })

  // Check each pair
  userPairs.forEach((pair) => {
    const key1 = `${pair.user1Id}-${pair.user2Id}`
    const key2 = `${pair.user2Id}-${pair.user1Id}`
    results.set(key1, matchedPairs.has(key1) || matchedPairs.has(key2))
  })

  return results
}

