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
    matchId: number,
    voteType: 'yes' | 'pass'
  ): Promise<VoteOutcome | null> {
    const { data, error } = await this.supabase.rpc('record_vote', {
      p_user_id: userId,
      p_match_id: matchId,
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
  async handleIdleVoter(userId: string, matchId: number): Promise<void> {
    await this.supabase.rpc('handle_idle_voter', {
      p_user_id: userId,
      p_match_id: matchId
    })
  }

  /**
   * Get votes for a match
   */
  async getVotes(matchId: number) {
    const { data, error } = await this.supabase
      .from('votes')
      .select('*')
      .eq('match_id', matchId)

    if (error) {
      console.error('Error getting votes:', error)
      return []
    }

    return data || []
  }
}
