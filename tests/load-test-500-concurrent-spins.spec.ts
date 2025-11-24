import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Comprehensive Load Test: 500 Concurrent Spins
 * 
 * Tests system under extreme load by simulating all 500 users spinning simultaneously.
 * Monitors for:
 * - Duplicate pairs (same user in multiple pairs)
 * - Pair uniqueness
 * - System performance
 * - Error rates
 */

const TOTAL_USERS = 500;
const BATCH_SIZE = 100; // Process in batches to avoid overwhelming the system

interface TestResult {
  userId: string;
  success: boolean;
  error?: string;
  matchId?: string;
  joinTime?: number;
  matchTime?: number;
}

interface PairAnalysis {
  totalPairs: number;
  uniquePairs: number;
  duplicateUsers: Array<{ userId: string; pairCount: number; pairs: Array<{ user1: string; user2: string }> }>;
  unmatchedUsers: string[];
  performance: {
    avgJoinTime: number;
    avgMatchTime: number;
    totalDuration: number;
  };
}

function getEnvVar(key: string): string {
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
    for (const line of envFile.split('\n')) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && match[1].trim() === key) {
        return match[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch (error) {
    // Fall back to process.env
  }
  return process.env[key] || '';
}

async function clearQueue(supabase: any) {
  console.log('🧹 Clearing existing queue entries...');
  const { error } = await supabase
    .from('matching_queue')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
  if (error) {
    console.log(`  ⚠️  Error clearing queue: ${error.message}`);
  } else {
    console.log('  ✅ Queue cleared');
  }
}

async function clearMatches(supabase: any) {
  console.log('🧹 Clearing existing matches...');
  const { error } = await supabase
    .from('matches')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
  if (error) {
    console.log(`  ⚠️  Error clearing matches: ${error.message}`);
  } else {
    console.log('  ✅ Matches cleared');
  }
}

async function getAllLoadTestUsers(supabase: any): Promise<Array<{ id: string; name: string; gender: string }>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, gender')
    .like('name', 'Load Test%')
    .order('name');

  if (error) {
    throw new Error(`Failed to fetch load test users: ${error.message}`);
  }

  return data || [];
}

async function analyzePairs(supabase: any, testStartTime: number): Promise<PairAnalysis> {
  // Get all matches created during the test
  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('id, user1_id, user2_id, matched_at, status')
    .gte('matched_at', new Date(testStartTime).toISOString());

  if (matchesError) {
    throw new Error(`Failed to fetch matches: ${matchesError.message}`);
  }

  const matchesList = matches || [];
  const totalPairs = matchesList.length;

  // Check for duplicate users (same user in multiple pairs)
  const userPairCount = new Map<string, Array<{ user1: string; user2: string; matchId: string }>>();
  
  matchesList.forEach(match => {
    const user1 = match.user1_id;
    const user2 = match.user2_id;
    
    if (!userPairCount.has(user1)) {
      userPairCount.set(user1, []);
    }
    userPairCount.get(user1)!.push({ user1, user2, matchId: match.id });
    
    if (!userPairCount.has(user2)) {
      userPairCount.set(user2, []);
    }
    userPairCount.get(user2)!.push({ user1, user2, matchId: match.id });
  });

  // Find duplicate users
  const duplicateUsers: Array<{ userId: string; pairCount: number; pairs: Array<{ user1: string; user2: string }> }> = [];
  userPairCount.forEach((pairs, userId) => {
    if (pairs.length > 1) {
      duplicateUsers.push({
        userId,
        pairCount: pairs.length,
        pairs: pairs.map(p => ({ user1: p.user1, user2: p.user2 }))
      });
    }
  });

  // Check for unique pairs (no duplicate pairs)
  const uniquePairs = new Set(
    matchesList.map(m => 
      [m.user1_id, m.user2_id].sort().join('|')
    )
  ).size;

  // Get all users who spun
  const { data: queueEntries } = await supabase
    .from('matching_queue')
    .select('user_id, status')
    .in('status', ['spin_active', 'queue_waiting', 'vote_active']);

  const allSpunUsers = new Set(queueEntries?.map(e => e.user_id) || []);
  const matchedUsers = new Set<string>();
  matchesList.forEach(m => {
    matchedUsers.add(m.user1_id);
    matchedUsers.add(m.user2_id);
  });

  const unmatchedUsers = Array.from(allSpunUsers).filter(u => !matchedUsers.has(u));

  // Calculate performance metrics
  const joinTimes: number[] = [];
  const matchTimes: number[] = [];
  // Note: We don't have exact join/match times from the test, so we'll use match timestamps
  const testEndTime = Date.now();
  const avgJoinTime = 0; // Would need to track this during test
  const avgMatchTime = 0; // Would need to track this during test
  const totalDuration = testEndTime - testStartTime;

  return {
    totalPairs,
    uniquePairs,
    duplicateUsers,
    unmatchedUsers,
    performance: {
      avgJoinTime,
      avgMatchTime,
      totalDuration
    }
  };
}

test.describe('Load Test: 500 Concurrent Spins', () => {
  test('All 500 users spin simultaneously - monitor for duplicate pairs', async () => {
    test.setTimeout(600000); // 10 minutes

    console.log(`🚀 Starting comprehensive load test with ${TOTAL_USERS} concurrent spins...`);

    const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Clear existing queue and matches for clean test
    await clearQueue(supabase);
    await clearMatches(supabase);

    // Get all 500 load test users
    console.log('📋 Fetching all load test users...');
    const allUsers = await getAllLoadTestUsers(supabase);
    console.log(`  ✅ Found ${allUsers.length} load test users`);

    if (allUsers.length < TOTAL_USERS) {
      throw new Error(`Expected ${TOTAL_USERS} users, found ${allUsers.length}`);
    }

    // Use exactly 500 users
    const testUsers = allUsers.slice(0, TOTAL_USERS);
    const maleUsers = testUsers.filter(u => u.gender === 'male');
    const femaleUsers = testUsers.filter(u => u.gender === 'female');
    
    console.log(`  👥 Male users: ${maleUsers.length}`);
    console.log(`  👥 Female users: ${femaleUsers.length}`);

    const testStartTime = Date.now();
    const results: TestResult[] = [];

    console.log('\n📊 Phase 1: All users join queue simultaneously...');
    
    // Join all users to queue in batches
    for (let batch = 0; batch < Math.ceil(TOTAL_USERS / BATCH_SIZE); batch++) {
      const batchStart = batch * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, TOTAL_USERS);
      const batchUsers = testUsers.slice(batchStart, batchEnd);
      
      console.log(`  Processing batch ${batch + 1}/${Math.ceil(TOTAL_USERS / BATCH_SIZE)} (${batchUsers.length} users)...`);
      
      const batchPromises = batchUsers.map(async (user) => {
        const joinStart = Date.now();
        try {
          const { data: joinData, error: joinError } = await supabase.rpc('spark_join_queue', {
            p_user_id: user.id,
          });

          const joinTime = Date.now() - joinStart;

          if (joinError) {
            // "already in queue" is acceptable
            if (joinError.message?.includes('already in queue') || 
                joinError.message?.includes('already exists') ||
                joinError.code === '23505') {
              return {
                userId: user.id,
                success: true,
                joinTime,
                alreadyInQueue: true
              };
            }
            return {
              userId: user.id,
              success: false,
              error: joinError.message || joinError.code,
              joinTime
            };
          }

          return {
            userId: user.id,
            success: true,
            joinTime
          };
        } catch (err: any) {
          return {
            userId: user.id,
            success: false,
            error: err.message || String(err),
            joinTime: Date.now() - joinStart
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.map(r => ({
        userId: r.userId,
        success: r.success,
        error: r.error,
        joinTime: r.joinTime
      })));

      // Small delay between batches
      if (batch < Math.ceil(TOTAL_USERS / BATCH_SIZE) - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    const joinSuccessCount = results.filter(r => r.success).length;
    console.log(`  ✅ ${joinSuccessCount}/${TOTAL_USERS} users joined queue successfully`);

    // Wait a moment for queue to stabilize
    console.log('\n⏳ Waiting 2 seconds for queue to stabilize...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n📊 Phase 2: Processing matching for all users...');
    
    // Process matching for all users
    const matchPromises = testUsers.map(async (user) => {
      const matchStart = Date.now();
      try {
        const { data: matchData, error: matchError } = await supabase.rpc('spark_process_matching', {
          p_user_id: user.id,
        });

        const matchTime = Date.now() - matchStart;

        if (matchError) {
          if (matchError.message?.includes('No match found') || 
              matchError.message?.includes('no match') ||
              matchError.message?.includes('No suitable match')) {
            return {
              userId: user.id,
              success: true,
              noMatch: true,
              matchTime
            };
          }
          return {
            userId: user.id,
            success: false,
            error: matchError.message || matchError.code,
            matchTime
          };
        }

        return {
          userId: user.id,
          success: true,
          matchId: matchData,
          matchTime
        };
      } catch (err: any) {
        return {
          userId: user.id,
          success: false,
          error: err.message || String(err),
          matchTime: Date.now() - matchStart
        };
      }
    });

    const matchResults = await Promise.all(matchPromises);
    
    // Update results with match information
    matchResults.forEach((matchResult, index) => {
      const result = results.find(r => r.userId === matchResult.userId);
      if (result) {
        result.matchId = matchResult.matchId;
        result.matchTime = matchResult.matchTime;
        if (!result.success && matchResult.success) {
          result.success = true;
        }
        if (matchResult.error) {
          result.error = matchResult.error;
        }
      }
    });

    const matchSuccessCount = matchResults.filter(r => r.success).length;
    console.log(`  ✅ ${matchSuccessCount}/${TOTAL_USERS} users processed matching`);

    // Wait for matches to be created
    console.log('\n⏳ Waiting 5 seconds for matches to be created...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Analyze results
    console.log('\n📊 Phase 3: Analyzing results...');
    const analysis = await analyzePairs(supabase, testStartTime);

    // Print comprehensive report
    console.log('\n' + '='.repeat(80));
    console.log('📊 LOAD TEST RESULTS');
    console.log('='.repeat(80));
    
    console.log(`\n✅ Queue Operations:`);
    console.log(`  Total users: ${TOTAL_USERS}`);
    console.log(`  Successfully joined: ${joinSuccessCount} (${((joinSuccessCount / TOTAL_USERS) * 100).toFixed(2)}%)`);
    console.log(`  Failed to join: ${TOTAL_USERS - joinSuccessCount}`);
    
    console.log(`\n✅ Matching Operations:`);
    console.log(`  Total users: ${TOTAL_USERS}`);
    console.log(`  Successfully processed: ${matchSuccessCount} (${((matchSuccessCount / TOTAL_USERS) * 100).toFixed(2)}%)`);
    console.log(`  Failed to process: ${TOTAL_USERS - matchSuccessCount}`);
    
    console.log(`\n💑 Pair Analysis:`);
    console.log(`  Total pairs created: ${analysis.totalPairs}`);
    console.log(`  Unique pairs: ${analysis.uniquePairs}`);
    console.log(`  Expected pairs: ${Math.floor(TOTAL_USERS / 2)}`);
    console.log(`  Pair efficiency: ${((analysis.totalPairs / (TOTAL_USERS / 2)) * 100).toFixed(2)}%`);
    
    if (analysis.duplicateUsers.length > 0) {
      console.log(`\n❌ CRITICAL: Found ${analysis.duplicateUsers.length} users in multiple pairs!`);
      analysis.duplicateUsers.forEach(dup => {
        console.log(`  User ${dup.userId}: appears in ${dup.pairCount} pairs`);
        dup.pairs.forEach((pair, idx) => {
          console.log(`    Pair ${idx + 1}: ${pair.user1} <-> ${pair.user2}`);
        });
      });
    } else {
      console.log(`\n✅ No duplicate users found - all pairs are unique!`);
    }
    
    if (analysis.unmatchedUsers.length > 0) {
      console.log(`\n⚠️  Unmatched users: ${analysis.unmatchedUsers.length}`);
      if (analysis.unmatchedUsers.length <= 10) {
        analysis.unmatchedUsers.forEach(userId => {
          console.log(`  - ${userId}`);
        });
      } else {
        console.log(`  (Showing first 10 of ${analysis.unmatchedUsers.length})`);
        analysis.unmatchedUsers.slice(0, 10).forEach(userId => {
          console.log(`  - ${userId}`);
        });
      }
    } else {
      console.log(`\n✅ All users were matched!`);
    }
    
    console.log(`\n⏱️  Performance:`);
    console.log(`  Total duration: ${(analysis.performance.totalDuration / 1000).toFixed(2)}s`);
    console.log(`  Operations/sec: ${(TOTAL_USERS / (analysis.performance.totalDuration / 1000)).toFixed(2)}`);
    
    // Show sample errors
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.log(`\n⚠️  Errors encountered: ${errors.length}`);
      const uniqueErrors = new Map<string, number>();
      errors.forEach(e => {
        const key = e.error || 'Unknown error';
        uniqueErrors.set(key, (uniqueErrors.get(key) || 0) + 1);
      });
      console.log(`  Error breakdown:`);
      uniqueErrors.forEach((count, error) => {
        console.log(`    ${error}: ${count} occurrences`);
      });
    }

    console.log('\n' + '='.repeat(80));

    // Assertions
    expect(joinSuccessCount).toBeGreaterThan(TOTAL_USERS * 0.95); // At least 95% should join
    expect(analysis.totalPairs).toBeGreaterThan(0); // Should create some pairs
    expect(analysis.duplicateUsers.length).toBe(0); // CRITICAL: No duplicate users!
    expect(analysis.uniquePairs).toBe(analysis.totalPairs); // All pairs should be unique
    
    // Check that we got close to expected number of pairs
    const expectedPairs = Math.floor(TOTAL_USERS / 2);
    const pairRatio = analysis.totalPairs / expectedPairs;
    expect(pairRatio).toBeGreaterThan(0.8); // At least 80% of expected pairs

    console.log('\n✅ Load test completed successfully!');
  });
});

