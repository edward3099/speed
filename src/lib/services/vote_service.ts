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
    matchId: string,
    voteType: 'yes' | 'pass'
  ): Promise<VoteOutcome | null> {
    const { data, error } = await this.supabase.rpc('record_vote', {
      p_user_id: userId,
      p_match_id: matchId,
      p_vote: voteType
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
  async getVotes(matchId: string) {
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
