import { SupabaseClient } from '@supabase/supabase-js'

export class CooldownService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Set cooldown for user (5 minutes)
   */
  async setCooldown(userId: string): Promise<void> {
    await this.supabase.rpc('set_cooldown', {
      p_user_id: userId
    })
  }

  /**
   * Check if user is in cooldown
   */
  async isInCooldown(userId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('is_in_cooldown', {
      p_user_id: userId
    })

    if (error) {
      return false
    }

    return data === true
  }

  /**
   * Get cooldown expiry time
   */
  async getCooldownUntil(userId: string): Promise<Date | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('cooldown_until')
      .eq('id', userId)
      .single()

    if (error || !data?.cooldown_until) {
      return null
    }

    return new Date(data.cooldown_until)
  }
}
