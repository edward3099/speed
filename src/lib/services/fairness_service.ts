import { SupabaseClient } from '@supabase/supabase-js'

export class FairnessService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Calculate fairness score for user
   */
  async calculateFairness(userId: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('calculate_fairness_score', {
      p_user_id: userId
    })

    if (error) {
      console.error('Error calculating fairness:', error)
      return 0
    }

    return data || 0
  }

  /**
   * Apply yes boost (+10 fairness)
   */
  async applyYesBoost(userId: string): Promise<void> {
    await this.supabase.rpc('apply_yes_boost', {
      p_user_id: userId
    })
  }
}
