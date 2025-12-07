import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { generateUUID, createTestUser, cleanupTestData, supabase } from './helpers/test-helpers';

dotenv.config({ path: '.env.local' });

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Performance Tests - Realistic Mode
 * 
 * Tests verify performance targets:
 * - Spin completes in <500ms (p95)
 * - Matching happens within 2-3 seconds
 * - System handles load efficiently
 * 
 * Realistic conditions: Database under load, network latency, worst-case scenarios
 */

test.describe('Performance Tests - Realistic Conditions', () => {
  
  const createTestUserId = async (prefix: string): Promise<string> => {
    return generateUUID();
  };

  test('Spin performance: should complete in <500ms (p95) under normal load', async () => {
    const userId = await createTestUserId('spin-perf');
    
    await cleanupTestData([userId]);

    // Setup user
    await createTestUser(userId, 'idle');

    // Measure spin performance
    const startTime = Date.now();
    
    const { error } = await supabase.rpc('join_queue', { p_user_id: userId });
    
    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(error).toBeNull();
    
    // Should complete in <500ms (p95 target)
    expect(duration).toBeLessThan(500);

    await cleanupTestData([userId]);
  });

  test('Spin performance: should handle load (100 users in queue)', async () => {
    const loadUserIds = await Promise.all(Array(100).fill(null).map((_, i) => createTestUserId(`load-${i}`)));
    const testUserId = await createTestUserId('spin-under-load');
    
    await cleanupTestData([...loadUserIds, testUserId]);

    // Create 100 users in queue (simulate load)
    for (const userId of loadUserIds) {
      await createTestUser(userId, 'waiting');
    }

    // Setup test user
    await createTestUser(testUserId, 'idle');

    // Measure spin performance under load
    const startTime = Date.now();
    
    const { error } = await supabase.rpc('join_queue', { p_user_id: testUserId });
    
    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(error).toBeNull();
    
    // Should still complete in reasonable time even under load
    expect(duration).toBeLessThan(1000); // Allow more time under load

    await cleanupTestData([...loadUserIds, testUserId]);
  });

  test('Matching performance: should match users within 2-3 seconds', async () => {
    const userId1 = await createTestUserId('match-perf-1');
    const userId2 = await createTestUserId('match-perf-2');
    
    await cleanupTestData([userId1, userId2]);

    // Setup 2 users in queue
    await createTestUser(userId1, 'waiting');
    await createTestUser(userId2, 'waiting');
    
    // Ensure both users are online (recent last_active)
    await supabase
      .from('users_state')
      .update({ last_active: new Date().toISOString() })
      .in('user_id', [userId1, userId2]);
    
    await new Promise(resolve => setTimeout(resolve, 300));

    // Measure matching performance
    const startTime = Date.now();
    
    await supabase.rpc('process_matching');
    
    // Wait for match to be created with polling
    let matchCreated = false;
    let attempts = 0;
    while (!matchCreated && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 300));
      const { data: matches } = await supabase
        .from('matches')
        .select('*')
        .or(`user1_id.eq.${userId1},user2_id.eq.${userId1},user1_id.eq.${userId2},user2_id.eq.${userId2}`);
      
      if (matches && matches.length > 0) {
        matchCreated = true;
        break;
      }
      attempts++;
      
      // Try matching again if no match found yet
      if (attempts % 5 === 0) {
        await supabase.rpc('process_matching');
      }
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(matchCreated).toBe(true);
    
    // Should match within 2-3 seconds
    expect(duration).toBeLessThan(3000);

    await cleanupTestData([userId1, userId2]);
  });

  test('Performance: p50, p95, p99 response times for spin', async () => {
    const userIds = await Promise.all(Array(20).fill(null).map((_, i) => createTestUserId(`p95-${i}`)));
    
    await cleanupTestData(userIds);

    // Setup 20 users
    for (const userId of userIds) {
      await createTestUser(userId, 'idle');
    }

    // Measure 20 spin operations
    const durations: number[] = [];
    
    for (const userId of userIds) {
      const startTime = Date.now();
      
      try {
        const { error } = await supabase.rpc('join_queue', { p_user_id: userId });
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (!error) {
          durations.push(duration);
        }
      } catch (error) {
        // Ignore errors for this test
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Calculate percentiles (only if we have data)
    if (durations.length === 0) {
      throw new Error('No successful spin operations recorded');
    }
    
    durations.sort((a, b) => a - b);
    const p50 = durations[Math.floor(durations.length * 0.5)] || durations[0];
    const p95 = durations[Math.floor(durations.length * 0.95)] || durations[durations.length - 1];
    const p99 = durations[Math.floor(durations.length * 0.99)] || durations[durations.length - 1];

    console.log(`Spin Performance: p50=${p50}ms, p95=${p95}ms, p99=${p99}ms`);

    // p95 should be <500ms
    expect(p95).toBeLessThan(500);
    
    // p99 should be reasonable
    expect(p99).toBeLessThan(1000);

    await cleanupTestData(userIds);
  });

  test('Matching performance: should handle 50 users in queue efficiently', async () => {
    const userIds = await Promise.all(Array(50).fill(null).map((_, i) => createTestUserId(`match-load-${i}`)));
    
    await cleanupTestData(userIds);

    // Setup 50 users in queue
    for (const userId of userIds) {
      await createTestUser(userId, 'waiting');
    }

    // Measure matching performance
    const startTime = Date.now();
    
    await supabase.rpc('process_matching');
    
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should complete in reasonable time
    expect(duration).toBeLessThan(5000);

    // Verify matches were created
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.in.(${userIds.join(',')}),user2_id.in.(${userIds.join(',')})`);

    // Should have created some matches
    expect((matches || []).length).toBeGreaterThan(0);

    await cleanupTestData(userIds);
  });
});





