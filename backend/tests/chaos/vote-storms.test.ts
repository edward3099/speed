/**
 * Chaos Test: Vote Storms
 * 
 * Simulate:
 * - Hundreds of yes/pass votes
 * - Random timing
 * - Votes arriving out of order
 * 
 * System must:
 * - Reject invalid ordering
 * - Maintain vote_active integrity
 * - Always resolve pairs
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Chaos Test: Vote Storms', () => {
  const matchIds: string[] = [];
  const userIds: string[] = [];

  beforeEach(async () => {
    // Create 50 matches
    for (let i = 0; i < 50; i++) {
      const user1Id = crypto.randomUUID();
      const user2Id = crypto.randomUUID();

      await supabase.from('users').insert([
        { id: user1Id, gender: 'male', is_online: true },
        { id: user2Id, gender: 'female', is_online: true },
      ]);

      const matchId = crypto.randomUUID();
      await supabase.from('matches').insert({
        id: matchId,
        user1_id: user1Id,
        user2_id: user2Id,
        status: 'vote_active',
      });

      matchIds.push(matchId);
      userIds.push(user1Id, user2Id);
    }
  }, 30000);

  afterEach(async () => {
    await supabase.from('votes').delete().in('match_id', matchIds);
    await supabase.from('matches').delete().in('id', matchIds);
    await supabase.from('users').delete().in('id', userIds);
  }, 30000);

  it('should handle vote storms with random timing', async () => {
    // Get all matches
    const { data: matches } = await supabase
      .from('matches')
      .select('id, user1_id, user2_id')
      .in('id', matchIds);

    // Create random votes
    const votePromises = matches?.flatMap(match => {
      const votes = [];
      // Random vote for user1
      const vote1 = Math.random() > 0.5 ? 'yes' : 'pass';
      votes.push(
        new Promise(resolve => {
          setTimeout(async () => {
            await supabase.rpc('record_vote', {
              p_match_id: match.id,
              p_user_id: match.user1_id,
              p_vote: vote1,
            });
            resolve(null);
          }, Math.random() * 1000);
        })
      );

      // Random vote for user2
      const vote2 = Math.random() > 0.5 ? 'yes' : 'pass';
      votes.push(
        new Promise(resolve => {
          setTimeout(async () => {
            await supabase.rpc('record_vote', {
              p_match_id: match.id,
              p_user_id: match.user2_id,
              p_vote: vote2,
            });
            resolve(null);
          }, Math.random() * 1000);
        })
      );

      return votes;
    }) || [];

    await Promise.all(votePromises);

    // Verify all matches resolved
    const { data: finalMatches } = await supabase
      .from('matches')
      .select('status')
      .in('id', matchIds);

    finalMatches?.forEach(match => {
      expect(match.status).toBe('ended');
    });
  }, 60000);
});

