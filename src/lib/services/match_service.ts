import { SupabaseClient } from '@supabase/supabase-js'

export class MatchService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Process matching - runs matching engine
   */
  async processMatching(): Promise<number> {
    const { data, error } = await this.supabase.rpc('process_matching')

    if (error) {
      console.error('Error processing matching:', error)
      return 0
    }

    return data || 0
  }

  /**
   * Get active match for user
   */
  async getActiveMatch(userId: string) {
    const { data, error } = await this.supabase
      .from('matches')
      .select('*, user1:profiles!matches_user1_id_fkey(*), user2:profiles!matches_user2_id_fkey(*)')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .eq('status', 'vote_active')
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error getting active match:', error)
      return null
    }

    return data
  }

  /**
   * Get partner profile from match
   */
  async getPartnerProfile(matchId: number, userId: string) {
    const { data: match, error: matchError } = await this.supabase
      .from('matches')
      .select('user1_id, user2_id')
      .eq('id', matchId)
      .single()

    if (matchError || !match) {
      return null
    }

    const partnerId = match.user1_id === userId ? match.user2_id : match.user1_id

    const { data: partner, error: partnerError } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', partnerId)
      .single()

    if (partnerError) {
      return null
    }

    return partner
  }
}
