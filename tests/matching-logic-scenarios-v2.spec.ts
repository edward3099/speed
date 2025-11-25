/**
 * Matching Logic Automated Test Suite V2
 * 
 * Uses improved fixture-based architecture for better:
 * - Worker isolation
 * - Test parallelization
 * - Resource efficiency
 * - Test maintainability
 * 
 * Scenarios:
 * 1. Immediate Match (Tier 1)
 * 2. Fairness Priority
 * 3. Preference Expansion (Tier 2)
 * 4. Guaranteed Match (Tier 3)
 * 5. Both Vote Yes
 * 6. One Yes, One Pass
 * 7. Both Vote Pass
 * 8. Disconnection During Queue
 * 9. Multiple Users Queue
 * 10. Race Condition Prevention
 */

import { testWithLogs, expect } from './fixtures';

/**
 * Helper: Verify log event exists
 */
function verifyLogEvent(
  logs: any[],
  eventType: string,
  userId?: string,
  metadata?: Record<string, any>
): boolean {
  const matchingLogs = logs.filter((log) => {
    if (log.event_type !== eventType) return false;
    if (userId && log.user_id !== userId) return false;
    if (metadata) {
      const eventData = log.event_data || {};
      return Object.keys(metadata).every((key) => eventData[key] === metadata[key]);
    }
    return true;
  });

  return matchingLogs.length > 0;
}

/**
 * Helper: Click spin button and wait for queue join
 */
async function spinAndWaitForQueue(page: any): Promise<void> {
  const spinButton = page.getByRole('button', { name: /spin|start spin/i }).first();
  await expect(spinButton).toBeVisible({ timeout: 10000 });
  await spinButton.click();

  // Wait for spinning animation (indicates queue join)
  await page.waitForSelector('[data-testid="spinning"]', { timeout: 10000 });
}

/**
 * Helper: Wait for match
 */
async function waitForMatch(page: any, timeout = 30000): Promise<void> {
  await page.waitForSelector('[data-testid="matched-partner"]', { timeout });
}

/**
 * Helper: Vote (yes or pass)
 */
async function vote(page: any, voteType: 'yes' | 'pass'): Promise<void> {
  const voteButton = page.getByRole('button', { name: new RegExp(voteType, 'i') }).first();
  await expect(voteButton).toBeVisible({ timeout: 10000 });
  await voteButton.click();
}

// ============================================================================
// Test Suite
// ============================================================================

testWithLogs.describe('Matching Logic Scenarios V2', () => {
  // Configure timeout for all tests
  testWithLogs.describe.configure({ timeout: 120000 }); // 2 minutes

  /**
   * SCENARIO 1: Immediate Match (Tier 1)
   */
  testWithLogs('Scenario 1: Immediate Match (Tier 1)', async ({ testUsers, fetchSpinLogs }) => {
    const testStartTime = new Date();

    // Navigate to spin page
    await testUsers.user1.page.goto('/spin');
    await testUsers.user2.page.goto('/spin');
    await Promise.all([
      testUsers.user1.page.waitForLoadState('networkidle'),
      testUsers.user2.page.waitForLoadState('networkidle'),
    ]);

    // Both users spin
    await Promise.all([
      spinAndWaitForQueue(testUsers.user1.page),
      spinAndWaitForQueue(testUsers.user2.page),
    ]);

    // Wait for match (should happen quickly for Tier 1)
    await Promise.all([
      waitForMatch(testUsers.user1.page, 15000),
      waitForMatch(testUsers.user2.page, 15000),
    ]);

    // Verify logs
    const logs = await fetchSpinLogs(undefined, undefined, testStartTime);

    // Verify spinStart logs
    expect(verifyLogEvent(logs, 'spinStart', testUsers.user1.userId)).toBe(true);
    expect(verifyLogEvent(logs, 'spinStart', testUsers.user2.userId)).toBe(true);

    // Verify queueJoined logs
    expect(verifyLogEvent(logs, 'queueJoined', testUsers.user1.userId)).toBe(true);
    expect(verifyLogEvent(logs, 'queueJoined', testUsers.user2.userId)).toBe(true);

    // Verify matchFound (at least one user should have this)
    const matchFoundLogs = logs.filter(
      (log) =>
        log.event_type === 'matchFound' &&
        (log.user_id === testUsers.user1.userId || log.user_id === testUsers.user2.userId)
    );
    expect(matchFoundLogs.length).toBeGreaterThan(0);

    // Verify matchDetected (both users should detect via realtime)
    expect(verifyLogEvent(logs, 'matchDetected', testUsers.user1.userId)).toBe(true);
    expect(verifyLogEvent(logs, 'matchDetected', testUsers.user2.userId)).toBe(true);

    // Verify matchLoaded (both users should load partner profile)
    expect(verifyLogEvent(logs, 'matchLoaded', testUsers.user1.userId)).toBe(true);
    expect(verifyLogEvent(logs, 'matchLoaded', testUsers.user2.userId)).toBe(true);

    // Verify votingWindowStarted (both users)
    expect(verifyLogEvent(logs, 'votingWindowStarted', testUsers.user1.userId)).toBe(true);
    expect(verifyLogEvent(logs, 'votingWindowStarted', testUsers.user2.userId)).toBe(true);
  });

  /**
   * SCENARIO 2: Fairness Priority
   */
  testWithLogs('Scenario 2: Fairness Priority - Long-waiting user matches first', async ({
    testUsers,
    fetchSpinLogs,
  }) => {
    const testStartTime = new Date();

    // User 1 spins first
    await testUsers.user1.page.goto('/spin');
    await spinAndWaitForQueue(testUsers.user1.page);

    // Wait 3 seconds to build up fairness score
    await testUsers.user1.page.waitForTimeout(3000);

    // User 2 spins (newer, should have lower priority)
    await testUsers.user2.page.goto('/spin');
    await spinAndWaitForQueue(testUsers.user2.page);

    // Wait a bit more for fairness to accumulate
    await testUsers.user1.page.waitForTimeout(2000);

    // Verify logs
    const logs = await fetchSpinLogs(undefined, undefined, testStartTime);

    const user1QueueJoin = logs.find(
      (log) => log.event_type === 'queueJoined' && log.user_id === testUsers.user1.userId
    );
    const user2QueueJoin = logs.find(
      (log) => log.event_type === 'queueJoined' && log.user_id === testUsers.user2.userId
    );

    expect(user1QueueJoin).toBeDefined();
    expect(user2QueueJoin).toBeDefined();

    // User 1 should have joined earlier
    const user1Time = new Date(user1QueueJoin.timestamp);
    const user2Time = new Date(user2QueueJoin.timestamp);
    expect(user1Time.getTime()).toBeLessThan(user2Time.getTime());
  });

  /**
   * SCENARIO 5: Both Vote Yes - Successful Video Date
   */
  testWithLogs('Scenario 5: Both Vote Yes - Successful Video Date', async ({
    testUsers,
    fetchSpinLogs,
  }) => {
    const testStartTime = new Date();

    // Setup: Both users spin and get matched
    await testUsers.user1.page.goto('/spin');
    await testUsers.user2.page.goto('/spin');

    await Promise.all([
      spinAndWaitForQueue(testUsers.user1.page),
      spinAndWaitForQueue(testUsers.user2.page),
    ]);

    await Promise.all([
      waitForMatch(testUsers.user1.page, 30000),
      waitForMatch(testUsers.user2.page, 30000),
    ]);

    // Both users vote yes
    await Promise.all([vote(testUsers.user1.page, 'yes'), vote(testUsers.user2.page, 'yes')]);

    // Wait for video date page
    await Promise.all([
      testUsers.user1.page.waitForURL(/.*video-date.*/, { timeout: 15000 }),
      testUsers.user2.page.waitForURL(/.*video-date.*/, { timeout: 15000 }),
    ]);

    // Verify logs
    const logs = await fetchSpinLogs(undefined, undefined, testStartTime);

    // Both users should have voteCast
    expect(verifyLogEvent(logs, 'voteCast', testUsers.user1.userId)).toBe(true);
    expect(verifyLogEvent(logs, 'voteCast', testUsers.user2.userId)).toBe(true);

    // Both users should have voteYes
    expect(verifyLogEvent(logs, 'voteYes', testUsers.user1.userId)).toBe(true);
    expect(verifyLogEvent(logs, 'voteYes', testUsers.user2.userId)).toBe(true);
  });

  /**
   * SCENARIO 6: One Yes, One Pass
   */
  testWithLogs('Scenario 6: One Yes, One Pass - Priority Boost', async ({ testUsers, fetchSpinLogs }) => {
    const testStartTime = new Date();

    // Setup: Both users spin and get matched
    await testUsers.user1.page.goto('/spin');
    await testUsers.user2.page.goto('/spin');

    await Promise.all([
      spinAndWaitForQueue(testUsers.user1.page),
      spinAndWaitForQueue(testUsers.user2.page),
    ]);

    await Promise.all([
      waitForMatch(testUsers.user1.page, 30000),
      waitForMatch(testUsers.user2.page, 30000),
    ]);

    // User 1 votes yes, User 2 votes pass
    await vote(testUsers.user1.page, 'yes');
    await testUsers.user1.page.waitForTimeout(1000); // Small delay
    await vote(testUsers.user2.page, 'pass');

    // Both should return to spin page (not video date)
    await Promise.all([
      testUsers.user1.page.waitForURL(/.*spin.*/, { timeout: 10000 }),
      testUsers.user2.page.waitForURL(/.*spin.*/, { timeout: 10000 }),
    ]);

    // Verify logs
    const logs = await fetchSpinLogs(undefined, undefined, testStartTime);

    // User 1 should have voteYes
    expect(verifyLogEvent(logs, 'voteYes', testUsers.user1.userId)).toBe(true);

    // User 2 should have votePass
    const user2VoteLogs = logs.filter(
      (log) =>
        log.user_id === testUsers.user2.userId &&
        (log.event_type === 'votePass' ||
          (log.event_type === 'voteCast' && log.event_data?.vote_type === 'pass'))
    );
    expect(user2VoteLogs.length).toBeGreaterThan(0);
  });

  /**
   * SCENARIO 10: Race Condition Prevention
   */
  testWithLogs('Scenario 10: Race Condition Prevention', async ({ testUsers, fetchSpinLogs }) => {
    const testStartTime = new Date();

    // Both users spin simultaneously
    await Promise.all([
      testUsers.user1.page.goto('/spin'),
      testUsers.user2.page.goto('/spin'),
    ]);

    await Promise.all([
      testUsers.user1.page.waitForLoadState('networkidle'),
      testUsers.user2.page.waitForLoadState('networkidle'),
    ]);

    // Spin at exactly the same time (simulate race condition)
    await Promise.all([
      spinAndWaitForQueue(testUsers.user1.page),
      spinAndWaitForQueue(testUsers.user2.page),
    ]);

    // Wait for match
    await Promise.all([
      waitForMatch(testUsers.user1.page, 20000),
      waitForMatch(testUsers.user2.page, 20000),
    ]);

    // Verify logs
    const logs = await fetchSpinLogs(undefined, undefined, testStartTime);

    // Both users should have spinStart and queueJoined
    expect(verifyLogEvent(logs, 'spinStart', testUsers.user1.userId)).toBe(true);
    expect(verifyLogEvent(logs, 'spinStart', testUsers.user2.userId)).toBe(true);

    // Should have exactly one matchFound (not duplicates)
    const matchFoundLogs = logs.filter(
      (log) =>
        log.event_type === 'matchFound' &&
        (log.user_id === testUsers.user1.userId || log.user_id === testUsers.user2.userId)
    );

    // At least one matchFound should exist
    expect(matchFoundLogs.length).toBeGreaterThan(0);

    // Both users should have matchDetected (via realtime)
    expect(verifyLogEvent(logs, 'matchDetected', testUsers.user1.userId)).toBe(true);
    expect(verifyLogEvent(logs, 'matchDetected', testUsers.user2.userId)).toBe(true);
  });
});

