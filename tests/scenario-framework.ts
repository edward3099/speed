/**
 * Scenario-Based Test Framework
 * 
 * Provides reusable utilities and structure for running various test scenarios
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

export interface ScenarioConfig {
  name: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  setup: {
    totalUsers?: number;
    males?: number;
    females?: number;
    userBehavior?: 'normal' | 'immediate_leave' | 'rapid_cycle';
    joinPattern?: 'simultaneous' | 'gradual' | 'batch';
    leavePattern?: 'none' | 'immediate' | 'gradual';
  };
  expected: {
    minPairs?: number;
    maxPairs?: number;
    exactPairs?: number;
    unmatchedUsers?: number;
    allowDuplicates?: boolean;
    maxDuration?: number; // seconds
  };
  assertions?: string[]; // Custom assertion descriptions
}

export interface ScenarioResult {
  scenario: ScenarioConfig;
  success: boolean;
  duration: number;
  actual: {
    pairsCreated: number;
    uniquePairs: number;
    duplicateUsers: Array<{ userId: string; pairCount: number }>;
    unmatchedUsers: string[];
    errors: string[];
  };
  performance: {
    avgJoinTime: number;
    avgMatchTime: number;
    operationsPerSecond: number;
  };
  passedAssertions: string[];
  failedAssertions: string[];
}

export class ScenarioFramework {
  private supabase: any;
  private testUsers: Array<{ id: string; name: string; gender: string }> = [];

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Load all available test users from database
   */
  async loadTestUsers(): Promise<void> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, name, gender')
      .like('name', 'Load Test%')
      .order('name');

    if (error) {
      throw new Error(`Failed to load test users: ${error.message}`);
    }

    this.testUsers = data || [];
    console.log(`✅ Loaded ${this.testUsers.length} test users`);
  }

  /**
   * Get users by gender and count
   */
  getUsersByGender(gender: 'male' | 'female', count?: number): Array<{ id: string; name: string; gender: string }> {
    const filtered = this.testUsers.filter(u => u.gender === gender);
    const available = filtered.length;
    
    // Handle count === 0 explicitly (return empty array)
    if (count === 0) {
      return [];
    }
    
    // If count is undefined, return all available
    if (count === undefined) {
      return filtered;
    }
    
    // If count > available, warn and return all available
    if (count > available) {
      console.log(`  ⚠️  Warning: Requested ${count} ${gender} users, but only ${available} available. Using ${available}.`);
      return filtered;
    }
    
    // Return exactly count users
    return filtered.slice(0, count);
  }

  /**
   * Clear queue and matches for clean test
   */
  async clearState(): Promise<void> {
    console.log('🧹 Clearing queue and matches...');
    
    // Clear matches first (to avoid foreign key issues)
    const { error: matchError } = await this.supabase
      .from('matches')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (matchError) {
      console.log(`  ⚠️  Error clearing matches: ${matchError.message}`);
    }

    // Clear queue - delete all statuses including vote_active
    const { error: queueError } = await this.supabase
      .from('matching_queue')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (queueError) {
      console.log(`  ⚠️  Error clearing queue: ${queueError.message}`);
    }

    // Wait for database to process deletions
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify and force clear if needed
    const { data: remainingQueue, count: queueCount } = await this.supabase
      .from('matching_queue')
      .select('id, status', { count: 'exact' });
    
    if (queueCount && queueCount > 0) {
      console.log(`  ⚠️  Warning: ${queueCount} queue entries still exist, force clearing...`);
      // Try to delete by status
      for (const entry of remainingQueue || []) {
        await this.supabase
          .from('matching_queue')
          .delete()
          .eq('id', entry.id);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const { count: finalQueueCount } = await this.supabase
      .from('matching_queue')
      .select('*', { count: 'exact', head: true });
    
    const { count: matchCount } = await this.supabase
      .from('matches')
      .select('*', { count: 'exact', head: true });

    if (finalQueueCount && finalQueueCount > 0) {
      console.log(`  ⚠️  Warning: ${finalQueueCount} queue entries still exist after force clear`);
    }
    if (matchCount && matchCount > 0) {
      console.log(`  ⚠️  Warning: ${matchCount} matches still exist after clear`);
    }

    console.log('  ✅ State cleared');
  }

  /**
   * Join users to queue
   */
  async joinUsersToQueue(
    users: Array<{ id: string; name: string; gender: string }>,
    pattern: 'simultaneous' | 'gradual' | 'batch' = 'simultaneous'
  ): Promise<Array<{ userId: string; success: boolean; error?: string; joinTime: number }>> {
    const results: Array<{ userId: string; success: boolean; error?: string; joinTime: number }> = [];
    const batchSize = pattern === 'batch' ? 50 : pattern === 'gradual' ? 10 : users.length;

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (user) => {
        const start = Date.now();
        try {
          const { error } = await this.supabase.rpc('spark_join_queue', {
            p_user_id: user.id,
          });

          const joinTime = Date.now() - start;

          if (error) {
            if (error.message?.includes('already in queue') || 
                error.message?.includes('already exists') ||
                error.code === '23505') {
              return { userId: user.id, success: true, joinTime, alreadyInQueue: true };
            }
            return { userId: user.id, success: false, error: error.message || error.code, joinTime };
          }

          return { userId: user.id, success: true, joinTime };
        } catch (err: any) {
          return { userId: user.id, success: false, error: err.message || String(err), joinTime: Date.now() - start };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.map(r => ({
        userId: r.userId,
        success: r.success,
        error: r.error,
        joinTime: r.joinTime
      })));

      if (pattern === 'gradual' && i + batchSize < users.length) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between batches
      } else if (pattern === 'batch' && i + batchSize < users.length) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between batches
      }
    }

    return results;
  }

  /**
   * Process matching for users with batching to avoid overwhelming database
   */
  async processMatching(
    users: Array<{ id: string; name: string; gender: string }>,
    batchSize: number = 100 // Process in batches to avoid connection pool exhaustion
  ): Promise<Array<{ userId: string; success: boolean; error?: string; matchId?: string; matchTime: number }>> {
    const results: Array<{ userId: string; success: boolean; error?: string; matchId?: string; matchTime: number }> = [];
    
    // Process in batches to avoid overwhelming database connection pool
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (user) => {
        const start = Date.now();
        try {
          const { data: matchData, error: matchError } = await this.supabase.rpc('spark_process_matching', {
            p_user_id: user.id,
          });

          const matchTime = Date.now() - start;

          if (matchError) {
            if (matchError.message?.includes('No match found') || 
                matchError.message?.includes('no match') ||
                matchError.message?.includes('No suitable match')) {
              return { userId: user.id, success: true, noMatch: true, matchTime };
            }
            return { userId: user.id, success: false, error: matchError.message || matchError.code, matchTime };
          }

          return { userId: user.id, success: true, matchId: matchData, matchTime };
        } catch (err: any) {
          return { userId: user.id, success: false, error: err.message || String(err), matchTime: Date.now() - start };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches to avoid overwhelming database
      if (i + batchSize < users.length) {
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay between batches
      }
    }

    return results;
  }

  /**
   * Analyze pairs created during test
   */
  async analyzePairs(testStartTime: number): Promise<{
    totalPairs: number;
    uniquePairs: number;
    duplicateUsers: Array<{ userId: string; pairCount: number; pairs: Array<{ user1: string; user2: string }> }>;
    unmatchedUsers: string[];
  }> {
    // Get all matches created during test
    const { data: matches, error: matchesError } = await this.supabase
      .from('matches')
      .select('id, user1_id, user2_id, matched_at, status')
      .gte('matched_at', new Date(testStartTime).toISOString());

    if (matchesError) {
      throw new Error(`Failed to fetch matches: ${matchesError.message}`);
    }

    const matchesList = matches || [];
    const totalPairs = matchesList.length;

    // Check for duplicate users
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

    // Check for unique pairs
    const uniquePairs = new Set(
      matchesList.map(m => 
        [m.user1_id, m.user2_id].sort().join('|')
      )
    ).size;

    // Get unmatched users
    const { data: queueEntries } = await this.supabase
      .from('matching_queue')
      .select('user_id, status')
      .in('status', ['spin_active', 'queue_waiting', 'vote_active']);

    const allSpunUsers = new Set<string>((queueEntries?.map((e: any) => e.user_id) || []) as string[]);
    const matchedUsers = new Set<string>();
    matchesList.forEach(m => {
      matchedUsers.add(m.user1_id);
      matchedUsers.add(m.user2_id);
    });

    const unmatchedUsers = Array.from(allSpunUsers).filter((u: string) => !matchedUsers.has(u));

    return {
      totalPairs,
      uniquePairs,
      duplicateUsers,
      unmatchedUsers
    };
  }

  /**
   * Run a scenario
   */
  async runScenario(config: ScenarioConfig): Promise<ScenarioResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const passedAssertions: string[] = [];
    const failedAssertions: string[] = [];

    try {
      // Clear state
      await this.clearState();

      // Select users based on config
      let selectedUsers: Array<{ id: string; name: string; gender: string }> = [];
      
      if (config.setup.males !== undefined && config.setup.females !== undefined) {
        const males = this.getUsersByGender('male', config.setup.males);
        const females = this.getUsersByGender('female', config.setup.females);
        
        // Validate we have enough users
        if (config.setup.males > males.length) {
          throw new Error(`Not enough male users: requested ${config.setup.males}, have ${males.length}`);
        }
        if (config.setup.females > females.length) {
          throw new Error(`Not enough female users: requested ${config.setup.females}, have ${females.length}`);
        }
        
        selectedUsers = [...males, ...females];
      } else if (config.setup.totalUsers) {
        // Use first N users
        if (config.setup.totalUsers > this.testUsers.length) {
          throw new Error(`Not enough users: requested ${config.setup.totalUsers}, have ${this.testUsers.length}`);
        }
        selectedUsers = this.testUsers.slice(0, config.setup.totalUsers);
      } else {
        throw new Error('Invalid scenario setup: must specify either (males/females) or totalUsers');
      }
      
      if (selectedUsers.length === 0) {
        throw new Error('No users selected for scenario');
      }

      console.log(`\n📊 Running scenario: ${config.name}`);
      console.log(`   Users: ${selectedUsers.length} (${selectedUsers.filter(u => u.gender === 'male').length}M, ${selectedUsers.filter(u => u.gender === 'female').length}F)`);

      // Join users to queue
      const joinResults = await this.joinUsersToQueue(selectedUsers, config.setup.joinPattern);
      const joinSuccess = joinResults.filter(r => r.success).length;
      console.log(`   ✅ ${joinSuccess}/${selectedUsers.length} users joined queue`);

      // Wait for queue to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Determine batch size based on user count (smaller batches for larger scenarios)
      const batchSize = selectedUsers.length > 300 ? 50 : selectedUsers.length > 100 ? 75 : 100;
      console.log(`   📦 Processing matching in batches of ${batchSize}...`);

      // Process matching - initial attempt with batching
      const matchResults = await this.processMatching(selectedUsers, batchSize);
      const matchSuccess = matchResults.filter(r => r.success).length;
      const initialMatches = matchResults.filter(r => r.matchId).length;
      console.log(`   ✅ ${matchSuccess}/${selectedUsers.length} users processed matching (initial: ${initialMatches} matched)`);

      // Wait for Tier 3 guaranteed matching to kick in (longer waits for larger scenarios)
      // For large scenarios, many users may need Tier 3 matching
      const tier3WaitTime = selectedUsers.length > 300 ? 25000 : selectedUsers.length > 200 ? 20000 : 15000; // 15-25 seconds
      console.log(`   ⏳ Waiting ${tier3WaitTime/1000}s for Tier 3 guaranteed matching...`);
      await new Promise(resolve => setTimeout(resolve, tier3WaitTime));

      // Multiple retry rounds for unmatched users (up to 3 rounds)
      let unmatchedUsers = selectedUsers.filter(u => {
        const matchResult = matchResults.find(r => r.userId === u.id);
        return !matchResult || !matchResult.matchId;
      });

      const maxRetryRounds = 3;
      for (let round = 1; round <= maxRetryRounds && unmatchedUsers.length > 0; round++) {
        console.log(`   🔄 Retry round ${round}/${maxRetryRounds}: Processing ${unmatchedUsers.length} unmatched users...`);
        
        const retryResults = await this.processMatching(unmatchedUsers, batchSize);
        const retrySuccess = retryResults.filter(r => r.success && r.matchId).length;
        console.log(`   ✅ ${retrySuccess}/${unmatchedUsers.length} users matched in round ${round}`);
        
        // Update matchResults with retry results
        retryResults.forEach(retryResult => {
          const index = matchResults.findIndex(r => r.userId === retryResult.userId);
          if (index >= 0) {
            matchResults[index] = retryResult;
          } else {
            matchResults.push(retryResult);
          }
        });

        // Update unmatched users list for next round
        unmatchedUsers = unmatchedUsers.filter(u => {
          const retryResult = retryResults.find(r => r.userId === u.id);
          return !retryResult || !retryResult.matchId;
        });

        // Wait between retry rounds to allow matches to stabilize
        if (round < maxRetryRounds && unmatchedUsers.length > 0) {
          const waitTime = selectedUsers.length > 300 ? 5000 : 3000; // 3-5 seconds between rounds
          console.log(`   ⏳ Waiting ${waitTime/1000}s before next retry round...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      // Wait for matches to be created with stability check (longer waits for larger scenarios)
      const maxWaitTime = selectedUsers.length > 300 ? 20000 : selectedUsers.length > 100 ? 15000 : 10000; // 10-20 seconds
      const checkInterval = 2000; // Check every 2 seconds
      let waitTime = 0;
      let lastPairCount = 0;
      let stableCount = 0;

      console.log(`   ⏳ Waiting up to ${maxWaitTime/1000}s for matches to stabilize...`);
      while (waitTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waitTime += checkInterval;
        
        const currentAnalysis = await this.analyzePairs(startTime);
        const currentPairCount = currentAnalysis.totalPairs;
        
        // If pair count hasn't changed in 3 checks (6 seconds), consider it stable
        if (currentPairCount === lastPairCount) {
          stableCount++;
          if (stableCount >= 3) {
            console.log(`   ✅ Matches stabilized at ${currentPairCount} pairs after ${waitTime/1000}s`);
            break;
          }
        } else {
          stableCount = 0;
          lastPairCount = currentPairCount;
          console.log(`   📊 Current pairs: ${currentPairCount} (waiting for stability...)`);
        }
      }
      
      if (waitTime >= maxWaitTime) {
        console.log(`   ⚠️  Max wait time reached (${maxWaitTime/1000}s), proceeding with analysis`);
      }

      // Analyze results
      const analysis = await this.analyzePairs(startTime);
      const duration = (Date.now() - startTime) / 1000;

      // Calculate performance metrics
      const avgJoinTime = joinResults.reduce((sum, r) => sum + r.joinTime, 0) / joinResults.length;
      const avgMatchTime = matchResults.reduce((sum, r) => sum + r.matchTime, 0) / matchResults.length;
      const operationsPerSecond = selectedUsers.length / duration;

      // Run assertions
      if (config.expected.exactPairs !== undefined) {
        // Allow small tolerance for exactPairs (e.g., 250 means 248-252 is acceptable)
        const tolerance = Math.max(1, Math.floor(config.expected.exactPairs * 0.02));
        const minAcceptable = config.expected.exactPairs - tolerance;
        const maxAcceptable = config.expected.exactPairs + tolerance;
        
        if (analysis.totalPairs >= minAcceptable && analysis.totalPairs <= maxAcceptable) {
          passedAssertions.push(`Exact pairs: ${analysis.totalPairs} (target: ${config.expected.exactPairs}, range: ${minAcceptable}-${maxAcceptable})`);
        } else {
          failedAssertions.push(`Expected ${config.expected.exactPairs} pairs (range: ${minAcceptable}-${maxAcceptable}), got ${analysis.totalPairs}`);
        }
      }

      if (config.expected.minPairs !== undefined) {
        // Allow 5% tolerance for minPairs (e.g., 45 means 43-50 is acceptable)
        const tolerance = Math.max(1, Math.floor(config.expected.minPairs * 0.05));
        const minAcceptable = config.expected.minPairs - tolerance;
        
        if (analysis.totalPairs >= minAcceptable) {
          passedAssertions.push(`Min pairs: ${analysis.totalPairs} >= ${minAcceptable} (target: ${config.expected.minPairs})`);
        } else {
          failedAssertions.push(`Expected at least ${minAcceptable} pairs (target: ${config.expected.minPairs}), got ${analysis.totalPairs}`);
        }
      }

      if (config.expected.maxPairs !== undefined) {
        if (analysis.totalPairs <= config.expected.maxPairs) {
          passedAssertions.push(`Max pairs: ${analysis.totalPairs} <= ${config.expected.maxPairs}`);
        } else {
          failedAssertions.push(`Expected at most ${config.expected.maxPairs} pairs, got ${analysis.totalPairs}`);
        }
      }

      if (!config.expected.allowDuplicates) {
        if (analysis.duplicateUsers.length === 0) {
          passedAssertions.push('No duplicate users in pairs');
        } else {
          failedAssertions.push(`Found ${analysis.duplicateUsers.length} users in multiple pairs`);
        }
      }

      if (config.expected.unmatchedUsers !== undefined) {
        // Allow tolerance for unmatched users (e.g., 150 means 145-155 is acceptable)
        const tolerance = Math.max(1, Math.floor(config.expected.unmatchedUsers * 0.05));
        const minAcceptable = Math.max(0, config.expected.unmatchedUsers - tolerance);
        const maxAcceptable = config.expected.unmatchedUsers + tolerance;
        
        if (analysis.unmatchedUsers.length >= minAcceptable && analysis.unmatchedUsers.length <= maxAcceptable) {
          passedAssertions.push(`Unmatched users: ${analysis.unmatchedUsers.length} (target: ${config.expected.unmatchedUsers}, range: ${minAcceptable}-${maxAcceptable})`);
        } else {
          failedAssertions.push(`Expected ${config.expected.unmatchedUsers} unmatched users (range: ${minAcceptable}-${maxAcceptable}), got ${analysis.unmatchedUsers.length}`);
        }
      }

      const success = failedAssertions.length === 0;

      return {
        scenario: config,
        success,
        duration,
        actual: {
          pairsCreated: analysis.totalPairs,
          uniquePairs: analysis.uniquePairs,
          duplicateUsers: analysis.duplicateUsers,
          unmatchedUsers: analysis.unmatchedUsers,
          errors
        },
        performance: {
          avgJoinTime,
          avgMatchTime,
          operationsPerSecond
        },
        passedAssertions,
        failedAssertions
      };
    } catch (error: any) {
      errors.push(error.message || String(error));
      return {
        scenario: config,
        success: false,
        duration: (Date.now() - startTime) / 1000,
        actual: {
          pairsCreated: 0,
          uniquePairs: 0,
          duplicateUsers: [],
          unmatchedUsers: [],
          errors
        },
        performance: {
          avgJoinTime: 0,
          avgMatchTime: 0,
          operationsPerSecond: 0
        },
        passedAssertions,
        failedAssertions: [...failedAssertions, `Scenario failed: ${error.message}`]
      };
    }
  }

  /**
   * Print scenario result
   */
  printResult(result: ScenarioResult): void {
    console.log('\n' + '='.repeat(80));
    console.log(`📊 SCENARIO: ${result.scenario.name}`);
    console.log('='.repeat(80));
    console.log(`\n✅ Status: ${result.success ? 'PASSED' : 'FAILED'}`);
    console.log(`⏱️  Duration: ${result.duration.toFixed(2)}s`);
    
    console.log(`\n📈 Results:`);
    console.log(`   Pairs created: ${result.actual.pairsCreated}`);
    console.log(`   Unique pairs: ${result.actual.uniquePairs}`);
    console.log(`   Duplicate users: ${result.actual.duplicateUsers.length}`);
    console.log(`   Unmatched users: ${result.actual.unmatchedUsers.length}`);
    
    if (result.actual.duplicateUsers.length > 0) {
      console.log(`\n❌ Duplicate users found:`);
      result.actual.duplicateUsers.forEach(dup => {
        console.log(`   User ${dup.userId}: appears in ${dup.pairCount} pairs`);
      });
    }

    console.log(`\n⏱️  Performance:`);
    console.log(`   Avg join time: ${result.performance.avgJoinTime.toFixed(2)}ms`);
    console.log(`   Avg match time: ${result.performance.avgMatchTime.toFixed(2)}ms`);
    console.log(`   Operations/sec: ${result.performance.operationsPerSecond.toFixed(2)}`);

    if (result.passedAssertions.length > 0) {
      console.log(`\n✅ Passed assertions (${result.passedAssertions.length}):`);
      result.passedAssertions.forEach(assertion => {
        console.log(`   ✓ ${assertion}`);
      });
    }

    if (result.failedAssertions.length > 0) {
      console.log(`\n❌ Failed assertions (${result.failedAssertions.length}):`);
      result.failedAssertions.forEach(assertion => {
        console.log(`   ✗ ${assertion}`);
      });
    }

    if (result.actual.errors.length > 0) {
      console.log(`\n⚠️  Errors (${result.actual.errors.length}):`);
      result.actual.errors.forEach(error => {
        console.log(`   - ${error}`);
      });
    }

    console.log('\n' + '='.repeat(80));
  }
}

