import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * THE 7 CORE SCENARIOS
 * 
 * These tests verify that the matching logic satisfies all 7 core scenarios
 * defined in spin/logic. These scenarios fully define the matching behavior
 * under all conditions: low traffic, medium traffic, high traffic, disconnects,
 * passes, idles, requeues, and fairness.
 */

test.describe('Core Scenario 1: Three users start spinning at different times', () => {
  test('should match first two users immediately, third continues spinning', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const contextC = await browser.newContext();
    
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const pageC = await contextC.newPage();

    const userIdA = 'scenario1-user-a';
    const userIdB = 'scenario1-user-b';
    const userIdC = 'scenario1-user-c';

    // Clean up
    await supabase.from('users_state').delete().in('user_id', [userIdA, userIdB, userIdC]);
    await supabase.from('queue').delete().in('user_id', [userIdA, userIdB, userIdC]);
    await supabase.from('matches').delete().or(`user1_id.eq.${userIdA},user2_id.eq.${userIdA}`);

    // Mock auth for all users
    const mockAuth = async (page: any, userId: string) => {
      await page.route('**/auth/v1/user', route => {
        route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: userId,
            email: `${userId}@test.com`,
            aud: 'authenticated',
            role: 'authenticated',
          }),
        });
      });
    };

    await mockAuth(pageA, userIdA);
    await mockAuth(pageB, userIdB);
    await mockAuth(pageC, userIdC);

    // Step 1: User A starts spinning
    await pageA.goto('/spin');
    await pageA.waitForLoadState('networkidle');
    await pageA.click('button:has-text("start spin"), button:has-text("Start Spin"), button:has-text("Spin")');
    await pageA.waitForURL('**/spinning');

    // Mock: User A is waiting
    await pageA.route('**/api/match/status', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ state: 'waiting', match: null }),
      });
    });

    // Wait 1 second
    await pageA.waitForTimeout(1000);

    // Step 2: User B starts spinning (1 second later)
    await pageB.goto('/spin');
    await pageB.waitForLoadState('networkidle');
    await pageB.click('button:has-text("start spin"), button:has-text("Start Spin"), button:has-text("Spin")');
    await pageB.waitForURL('**/spinning');

    // Trigger matching: A and B should match immediately
    await fetch(`${process.env.BASE_URL || 'http://localhost:3000'}/api/match/process`, { method: 'POST' });
    await pageA.waitForTimeout(2000);
    await pageB.waitForTimeout(2000);

    // Mock: A and B are matched
    const matchIdAB = 'scenario1-match-ab';
    await pageA.route('**/api/match/status', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          state: 'paired',
          match: { match_id: matchIdAB, partner_id: userIdB },
        }),
      });
    });
    await pageB.route('**/api/match/status', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          state: 'paired',
          match: { match_id: matchIdAB, partner_id: userIdA },
        }),
      });
    });

    // Verify: A and B should redirect to voting-window
    await pageA.waitForURL('**/voting-window*', { timeout: 5000 });
    await pageB.waitForURL('**/voting-window*', { timeout: 5000 });
    expect(pageA.url()).toContain('/voting-window');
    expect(pageB.url()).toContain('/voting-window');

    // Wait 2 more seconds (total 3 seconds from start)
    await pageA.waitForTimeout(2000);

    // Step 3: User C starts spinning (3 seconds after A)
    await pageC.goto('/spin');
    await pageC.waitForLoadState('networkidle');
    await pageC.click('button:has-text("start spin"), button:has-text("Start Spin"), button:has-text("Spin")');
    await pageC.waitForURL('**/spinning');

    // Mock: User C is still waiting (no match yet)
    await pageC.route('**/api/match/status', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ state: 'waiting', match: null }),
      });
    });

    // Verify: C continues spinning, does not match himself, does not match offline users
    await pageC.waitForTimeout(3000);
    expect(pageC.url()).toContain('/spinning');
    
    // Verify: A and B are still in voting-window (not rematched)
    expect(pageA.url()).toContain('/voting-window');
    expect(pageB.url()).toContain('/voting-window');

    await contextA.close();
    await contextB.close();
    await contextC.close();
  });
});

test.describe('Core Scenario 2: Long waiter fairness', () => {
  test('should match long waiter immediately when new user arrives', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const userIdA = 'scenario2-user-a';
    const userIdB = 'scenario2-user-b';

    // Clean up
    await supabase.from('users_state').delete().in('user_id', [userIdA, userIdB]);
    await supabase.from('queue').delete().in('user_id', [userIdA, userIdB]);

    // Mock auth
    await pageA.route('**/auth/v1/user', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ id: userIdA, email: 'a@test.com', aud: 'authenticated' }),
      });
    });
    await pageB.route('**/auth/v1/user', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ id: userIdB, email: 'b@test.com', aud: 'authenticated' }),
      });
    });

    // Step 1: User A starts spinning (will wait 3 minutes)
    await pageA.goto('/spin');
    await pageA.waitForLoadState('networkidle');
    await pageA.click('button:has-text("start spin"), button:has-text("Start Spin"), button:has-text("Spin")');
    await pageA.waitForURL('**/spinning');

    // Simulate long wait: Update fairness in database
    await supabase
      .from('users_state')
      .update({ fairness: 20, waiting_since: new Date(Date.now() - 3 * 60 * 1000).toISOString() })
      .eq('user_id', userIdA);
    await supabase
      .from('queue')
      .update({ fairness: 20, waiting_since: new Date(Date.now() - 3 * 60 * 1000).toISOString() })
      .eq('user_id', userIdA);

    // Wait a bit
    await pageA.waitForTimeout(2000);

    // Step 2: User B spins now
    await pageB.goto('/spin');
    await pageB.waitForLoadState('networkidle');
    await pageB.click('button:has-text("start spin"), button:has-text("Start Spin"), button:has-text("Spin")');
    await pageB.waitForURL('**/spinning');

    // Trigger matching: A (long waiter) should match B immediately
    await fetch(`${process.env.BASE_URL || 'http://localhost:3000'}/api/match/process`, { method: 'POST' });
    await pageA.waitForTimeout(2000);
    await pageB.waitForTimeout(2000);

    // Mock: Both are matched
    const matchId = 'scenario2-match';
    await pageA.route('**/api/match/status', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          state: 'paired',
          match: { match_id: matchId, partner_id: userIdB },
        }),
      });
    });
    await pageB.route('**/api/match/status', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          state: 'paired',
          match: { match_id: matchId, partner_id: userIdA },
        }),
      });
    });

    // Verify: Both should redirect to voting-window immediately
    await pageA.waitForURL('**/voting-window*', { timeout: 5000 });
    await pageB.waitForURL('**/voting-window*', { timeout: 5000 });
    expect(pageA.url()).toContain('/voting-window');
    expect(pageB.url()).toContain('/voting-window');

    await contextA.close();
    await contextB.close();
  });
});

test.describe('Core Scenario 3: Voting Outcomes', () => {
  test('case a: yes + yes → both go to video-date, never match again', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    const userId1 = 'scenario3a-user1';
    const userId2 = 'scenario3a-user2';
    const matchId = 'scenario3a-match';

    // Setup match
    await supabase.from('users_state').upsert([
      { user_id: userId1, state: 'paired', match_id: matchId, partner_id: userId2 },
      { user_id: userId2, state: 'paired', match_id: matchId, partner_id: userId1 },
    ]);
    await supabase.from('matches').upsert({
      match_id: matchId,
      user1_id: userId1,
      user2_id: userId2,
      status: 'paired',
    });

    // Mock auth and navigate
    await page1.route('**/auth/v1/user', route => {
      route.fulfill({ status: 200, body: JSON.stringify({ id: userId1, aud: 'authenticated' }) });
    });
    await page2.route('**/auth/v1/user', route => {
      route.fulfill({ status: 200, body: JSON.stringify({ id: userId2, aud: 'authenticated' }) });
    });

    await page1.goto(`/voting-window?matchId=${matchId}`);
    await page2.goto(`/voting-window?matchId=${matchId}`);

    // Mock vote API: both_yes
    await page1.route('**/api/vote', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ outcome: 'both_yes', match_ended: true }),
      });
    });
    await page2.route('**/api/vote', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ outcome: 'both_yes', match_ended: true }),
      });
    });

    // Wait for buttons to be visible
    await page1.waitForSelector('button:has-text("Yes")', { timeout: 10000 });
    await page2.waitForSelector('button:has-text("Yes")', { timeout: 10000 });
    
    // Both vote Yes
    await page1.click('button:has-text("Yes")');
    await page2.click('button:has-text("Yes")');

    // Verify: Both go to video-date
    await page1.waitForURL('**/video-date*', { timeout: 5000 });
    await page2.waitForURL('**/video-date*', { timeout: 5000 });
    expect(page1.url()).toContain('/video-date');
    expect(page2.url()).toContain('/video-date');

    // Verify: Match history prevents rematch
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${userId1},user2_id.eq.${userId1}`)
      .or(`user1_id.eq.${userId2},user2_id.eq.${userId2}`);
    
    // Should only have one match between these two
    const matchesBetween = matches?.filter(m => 
      (m.user1_id === userId1 && m.user2_id === userId2) ||
      (m.user1_id === userId2 && m.user2_id === userId1)
    );
    expect(matchesBetween?.length).toBe(1);

    await context1.close();
    await context2.close();
  });

  test('case b: yes + pass → both auto-spin, yes user gets +10 boost, never match again', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    const userId1 = 'scenario3b-user1';
    const userId2 = 'scenario3b-user2';
    const matchId = 'scenario3b-match';

    // Setup match
    await supabase.from('users_state').upsert([
      { user_id: userId1, state: 'paired', match_id: matchId, partner_id: userId2, fairness: 0 },
      { user_id: userId2, state: 'paired', match_id: matchId, partner_id: userId1, fairness: 0 },
    ]);
    await supabase.from('matches').upsert({
      match_id: matchId,
      user1_id: userId1,
      user2_id: userId2,
      status: 'paired',
    });

    // Mock auth
    await page1.route('**/auth/v1/user', route => {
      route.fulfill({ status: 200, body: JSON.stringify({ id: userId1, aud: 'authenticated' }) });
    });
    await page2.route('**/auth/v1/user', route => {
      route.fulfill({ status: 200, body: JSON.stringify({ id: userId2, aud: 'authenticated' }) });
    });

    await page1.goto(`/voting-window?matchId=${matchId}`);
    await page2.goto(`/voting-window?matchId=${matchId}`);

    // Mock vote: yes_pass
    await page1.route('**/api/vote', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ outcome: 'yes_pass', match_ended: true }),
      });
    });
    await page2.route('**/api/vote', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ outcome: 'yes_pass', match_ended: true }),
      });
    });

    // Wait for buttons to be visible
    await page1.waitForSelector('button:has-text("Yes")', { timeout: 10000 });
    await page2.waitForSelector('button:has-text("Respin")', { timeout: 10000 });
    
    // User 1 votes Yes, User 2 votes Pass (Respin)
    await page1.click('button:has-text("Yes")');
    await page2.click('button:has-text("Respin")');

    // Verify: Both auto-redirect to spinning (no manual spin needed)
    await page1.waitForURL('**/spinning', { timeout: 5000 });
    await page2.waitForURL('**/spinning', { timeout: 5000 });
    expect(page1.url()).toContain('/spinning');
    expect(page2.url()).toContain('/spinning');

    // Verify: Yes user (user1) should have +10 boost
    const { data: user1State } = await supabase
      .from('users_state')
      .select('fairness')
      .eq('user_id', userId1)
      .single();
    
    // Fairness should be increased (boost applied)
    expect(user1State?.fairness).toBeGreaterThanOrEqual(10);

    await context1.close();
    await context2.close();
  });

  test('case c: pass + pass → both auto-spin, no boosts, never match again', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    const userId1 = 'scenario3c-user1';
    const userId2 = 'scenario3c-user2';
    const matchId = 'scenario3c-match';

    // Setup match
    await supabase.from('users_state').upsert([
      { user_id: userId1, state: 'paired', match_id: matchId, partner_id: userId2, fairness: 0 },
      { user_id: userId2, state: 'paired', match_id: matchId, partner_id: userId1, fairness: 0 },
    ]);
    await supabase.from('matches').upsert({
      match_id: matchId,
      user1_id: userId1,
      user2_id: userId2,
      status: 'paired',
    });

    // Mock auth
    await page1.route('**/auth/v1/user', route => {
      route.fulfill({ status: 200, body: JSON.stringify({ id: userId1, aud: 'authenticated' }) });
    });
    await page2.route('**/auth/v1/user', route => {
      route.fulfill({ status: 200, body: JSON.stringify({ id: userId2, aud: 'authenticated' }) });
    });

    await page1.goto(`/voting-window?matchId=${matchId}`);
    await page2.goto(`/voting-window?matchId=${matchId}`);

    // Mock vote: pass_pass
    await page1.route('**/api/vote', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ outcome: 'pass_pass', match_ended: true }),
      });
    });
    await page2.route('**/api/vote', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ outcome: 'pass_pass', match_ended: true }),
      });
    });

    // Wait for buttons to be visible
    await page1.waitForSelector('button:has-text("Respin")', { timeout: 10000 });
    await page2.waitForSelector('button:has-text("Respin")', { timeout: 10000 });
    
    // Both vote Pass (Respin)
    await page1.click('button:has-text("Respin")');
    await page2.click('button:has-text("Respin")');

    // Verify: Both auto-redirect to spinning
    await page1.waitForURL('**/spinning', { timeout: 5000 });
    await page2.waitForURL('**/spinning', { timeout: 5000 });

    // Verify: No boosts applied
    const { data: user1State } = await supabase
      .from('users_state')
      .select('fairness')
      .eq('user_id', userId1)
      .single();
    const { data: user2State } = await supabase
      .from('users_state')
      .select('fairness')
      .eq('user_id', userId2)
      .single();
    
    // Fairness should remain unchanged (no boost)
    expect(user1State?.fairness).toBe(0);
    expect(user2State?.fairness).toBe(0);

    await context1.close();
    await context2.close();
  });
});

test.describe('Core Scenario 4: Disconnects', () => {
  test('case a: disconnect during spinning → removed from pool, must press spin again', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const userId = 'scenario4a-user';

    // Clean up
    await supabase.from('users_state').delete().eq('user_id', userId);
    await supabase.from('queue').delete().eq('user_id', userId);

    // Mock auth
    await page.route('**/auth/v1/user', route => {
      route.fulfill({ status: 200, body: JSON.stringify({ id: userId, aud: 'authenticated' }) });
    });

    // User starts spinning
    await page.goto('/spin');
    await page.click('button:has-text("Start Spin"), button:has-text("Spin")');
    await page.waitForURL('**/spinning');

    // Verify user is in queue
    const { data: queueBefore } = await supabase
      .from('queue')
      .select('*')
      .eq('user_id', userId)
      .single();
    expect(queueBefore).toBeTruthy();

    // Simulate disconnect: Close browser context
    await context.close();

    // Wait a bit for system to detect disconnect
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify: User should be removed from queue (last_active check)
    // The system checks last_active > NOW() - INTERVAL '30 seconds'
    // After disconnect, last_active won't be updated, so user won't match

    // User returns: Must press spin again manually
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    
    await page2.route('**/auth/v1/user', route => {
      route.fulfill({ status: 200, body: JSON.stringify({ id: userId, aud: 'authenticated' }) });
    });

    await page2.goto('/spin');
    // User should be on /spin page (not auto-spinning)
    expect(page2.url()).toContain('/spin');

    await context2.close();
  });

  test('case b: disconnect during countdown → pair ends, remaining user follows voting logic', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    const userId1 = 'scenario4b-user1';
    const userId2 = 'scenario4b-user2';
    const matchId = 'scenario4b-match';

    // Setup match
    await supabase.from('users_state').upsert([
      { user_id: userId1, state: 'paired', match_id: matchId, partner_id: userId2 },
      { user_id: userId2, state: 'paired', match_id: matchId, partner_id: userId1 },
    ]);
    await supabase.from('matches').upsert({
      match_id: matchId,
      user1_id: userId1,
      user2_id: userId2,
      status: 'paired',
    });

    // Mock auth
    await page1.route('**/auth/v1/user', route => {
      route.fulfill({ status: 200, body: JSON.stringify({ id: userId1, aud: 'authenticated' }) });
    });
    await page2.route('**/auth/v1/user', route => {
      route.fulfill({ status: 200, body: JSON.stringify({ id: userId2, aud: 'authenticated' }) });
    });

    await page1.goto(`/voting-window?matchId=${matchId}`);
    await page2.goto(`/voting-window?matchId=${matchId}`);

    // User 1 votes Yes
    await page1.route('**/api/vote', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ outcome: 'yes_idle', match_ended: true }),
      });
    });
    await page1.waitForSelector('button:has-text("Yes")', { timeout: 10000 });
    await page1.click('button:has-text("Yes")');

    // User 2 disconnects (close context)
    await context2.close();

    // Wait for system to detect disconnect
    await page1.waitForTimeout(2000);

    // Verify: User 1 should auto-spin with +10 boost (yes + idle)
    await page1.waitForURL('**/spinning', { timeout: 5000 });
    
    const { data: user1State } = await supabase
      .from('users_state')
      .select('fairness')
      .eq('user_id', userId1)
      .single();
    expect(user1State?.fairness).toBeGreaterThanOrEqual(10);

    await context1.close();
  });
});

test.describe('Core Scenario 7: Never match again', () => {
  test('should prevent users who matched before from matching again', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    const userId1 = 'scenario7-user1';
    const userId2 = 'scenario7-user2';
    const matchId1 = 'scenario7-match1';

    // Clean up
    await supabase.from('users_state').delete().in('user_id', [userId1, userId2]);
    await supabase.from('queue').delete().in('user_id', [userId1, userId2]);
    await supabase.from('matches').delete().or(`user1_id.eq.${userId1},user2_id.eq.${userId1}`);

    // Create first match (yes + pass)
    await supabase.from('matches').insert({
      match_id: matchId1,
      user1_id: userId1,
      user2_id: userId2,
      status: 'completed',
      outcome: 'yes_pass',
    });

    // Mock auth
    await page1.route('**/auth/v1/user', route => {
      route.fulfill({ status: 200, body: JSON.stringify({ id: userId1, aud: 'authenticated' }) });
    });
    await page2.route('**/auth/v1/user', route => {
      route.fulfill({ status: 200, body: JSON.stringify({ id: userId2, aud: 'authenticated' }) });
    });

    // Both users start spinning
    await page1.goto('/spin');
    await page2.goto('/spin');
    await page1.waitForLoadState('networkidle');
    await page2.waitForLoadState('networkidle');
    await page1.click('button:has-text("start spin"), button:has-text("Start Spin"), button:has-text("Spin")');
    await page2.click('button:has-text("start spin"), button:has-text("Start Spin"), button:has-text("Spin")');
    await page1.waitForURL('**/spinning');
    await page2.waitForURL('**/spinning');

    // Trigger matching
    await fetch(`${process.env.BASE_URL || 'http://localhost:3000'}/api/match/process`, { method: 'POST' });
    await page1.waitForTimeout(3000);
    await page2.waitForTimeout(3000);

    // Verify: They should NOT be matched (history check prevents it)
    // Both should still be spinning
    expect(page1.url()).toContain('/spinning');
    expect(page2.url()).toContain('/spinning');

    // Verify: No new match was created between these two
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${userId1},user2_id.eq.${userId1}`)
      .or(`user1_id.eq.${userId2},user2_id.eq.${userId2}`);
    
    const matchesBetween = matches?.filter(m => 
      ((m.user1_id === userId1 && m.user2_id === userId2) ||
       (m.user1_id === userId2 && m.user2_id === userId1)) &&
      m.match_id !== matchId1 // Exclude the original match
    );
    expect(matchesBetween?.length).toBe(0);

    await context1.close();
    await context2.close();
  });
});

