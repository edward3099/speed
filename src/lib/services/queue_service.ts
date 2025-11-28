import { SupabaseClient } from '@supabase/supabase-js'

export class QueueService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Join queue - validates online, cooldown, duplicates
   */
  async joinQueue(userId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('join_queue', {
      p_user_id: userId
    })

    if (error) {
      console.error('Error joining queue:', error)
      return false
    }

    return data === true
  }

  /**
   * Remove from queue
   */
  async removeFromQueue(userId: string): Promise<void> {
    await this.supabase.rpc('remove_from_queue', {
      p_user_id: userId
    })
  }

  /**
   * Get queue status for user
   */
  async getQueueStatus(userId: string) {
    const { data, error } = await this.supabase
      .from('queue')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error getting queue status:', error)
      return null
    }

    return data
  }
}
