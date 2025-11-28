import { SupabaseClient } from '@supabase/supabase-js'

export interface VoteOutcome {
  outcome: 'both_yes' | 'yes_pass' | 'both_pass' | 'waiting'
  next_state?: string
}

export class VoteService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Record vote and resolve outcomes
   */
  async recordVote(
    userId: string,
    matchId: string | number,
    voteType: 'yes' | 'pass'
  ): Promise<VoteOutcome | null> {
    // Convert matchId to number if it's a string (matches table uses BIGINT)
    const matchIdNum = typeof matchId === 'string' ? parseInt(matchId, 10) : matchId
    
    if (isNaN(matchIdNum as number)) {
      console.error('❌ Invalid matchId format in recordVote:', matchId)
      return null
    }

    const { data, error } = await this.supabase.rpc('record_vote', {
      p_user_id: userId,
      p_match_id: matchIdNum,
      p_vote_type: voteType
    })

    if (error) {
      console.error('Error recording vote:', error)
      return null
    }

    return data as VoteOutcome
  }

  /**
   * Handle idle voter (countdown expired)
   */
  async handleIdleVoter(userId: string, matchId: string): Promise<void> {
    await this.supabase.rpc('handle_idle_voter', {
      p_match_id: matchId,
      p_idle_user_id: userId
    })
  }

  /**
   * Get votes for a match
   */
  async getVotes(matchId: string | number) {
    // Convert matchId to number if it's a string (matches table uses BIGINT)
    const matchIdNum = typeof matchId === 'string' ? parseInt(matchId, 10) : matchId
    
    if (isNaN(matchIdNum as number)) {
      console.error('❌ Invalid matchId format in getVotes:', matchId)
      return []
    }

    const { data, error } = await this.supabase
      .from('votes')
      .select('*')
      .eq('match_id', matchIdNum)

    if (error) {
      console.error('Error getting votes:', error)
      return []
    }

    return data || []
  }
}
