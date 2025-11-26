import { SupabaseClient } from '@supabase/supabase-js'

export class BlocklistService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Add pair to never_pair_again blocklist
   */
  async addToBlocklist(
    user1Id: string,
    user2Id: string,
    reason: string
  ): Promise<void> {
    await this.supabase.rpc('add_to_blocklist', {
      p_user1: user1Id,
      p_user2: user2Id,
      p_reason: reason
    })
  }

  /**
   * Check if pair is blocked
   */
  async isBlocked(user1Id: string, user2Id: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('is_blocked', {
      p_user1: user1Id,
      p_user2: user2Id
    })

    if (error) {
      return false
    }

    return data === true
  }
}
