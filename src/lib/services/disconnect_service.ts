import { SupabaseClient } from '@supabase/supabase-js'

export class DisconnectService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Handle user disconnect
   */
  async handleDisconnect(userId: string): Promise<void> {
    await this.supabase.rpc('handle_disconnect', {
      p_user_id: userId
    })
  }
}
