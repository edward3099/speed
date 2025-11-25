/**
 * Custom Playwright Fixtures for Speed Dating Tests
 * 
 * This file defines reusable fixtures that provide:
 * - Worker-scoped authentication (login once per worker)
 * - Isolated test users per worker
 * - Shared Supabase client per worker
 * - Better test isolation and parallelization
 */

import { test as baseTest, expect, Page, BrowserContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginUser } from './helpers';

// ============================================================================
// Types
// ============================================================================

interface TestUser {
  email: string;
  password: string;
  userId: string | null;
  page: Page;
  context: BrowserContext;
}

interface WorkerTestUsers {
  user1: TestUser;
  user2: TestUser;
}

interface SupabaseClient {
  client: any;
  getUserIdByEmail: (email: string) => Promise<string | null>;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

async function getUserIdByEmail(supabase: any, email: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.admin.getUserByEmail(email);
    if (error || !data?.user) {
      console.warn(`Failed to get user ID for ${email}:`, error?.message);
      return null;
    }
    return data.user.id;
  } catch (e: any) {
    console.warn(`Error getting user ID for ${email}:`, e?.message || e);
    return null;
  }
}

// ============================================================================
// Worker-Scoped Fixtures (Shared across all tests in a worker)
// ============================================================================

/**
 * Supabase Client Fixture (Worker-scoped)
 * Creates a single Supabase client per worker for efficient database operations
 */
const supabaseFixture = baseTest.extend<{}, { supabase: SupabaseClient }>({
  supabase: [
    async ({}, use, workerInfo) => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
      }

      const client = createClient(supabaseUrl, supabaseKey);

      const supabase: SupabaseClient = {
        client,
        getUserIdByEmail: (email: string) => getUserIdByEmail(client, email),
      };

      console.log(`[Worker ${workerInfo.workerIndex}] ✅ Supabase client initialized`);

      await use(supabase);

      // Cleanup (if needed)
      console.log(`[Worker ${workerInfo.workerIndex}] 🧹 Supabase client cleaned up`);
    },
    { scope: 'worker' },
  ],
});

/**
 * Test Users Fixture (Worker-scoped)
 * Creates authenticated test users once per worker, reused across all tests
 * This is much more efficient than logging in before each test
 */
const testUsersFixture = supabaseFixture.extend<{}, { testUsers: WorkerTestUsers }>({
  testUsers: [
    async ({ browser, supabase }, use, workerInfo) => {
      const workerIndex = workerInfo.workerIndex;

      // Test user credentials
      const TEST_USERS = {
        user1: {
          email: process.env.TEST_USER1_EMAIL || 'testuser1@example.com',
          password: process.env.TEST_USER1_PASSWORD || 'testpass123',
        },
        user2: {
          email: process.env.TEST_USER2_EMAIL || 'testuser2@example.com',
          password: process.env.TEST_USER2_PASSWORD || 'testpass123',
        },
      };

      console.log(`[Worker ${workerIndex}] 🔄 Setting up test users...`);

      // Get user IDs from database (fast, no browser needed)
      const user1Id = await supabase.getUserIdByEmail(TEST_USERS.user1.email);
      const user2Id = await supabase.getUserIdByEmail(TEST_USERS.user2.email);

      if (!user1Id || !user2Id) {
        throw new Error(
          `Test users not found. User1: ${!!user1Id}, User2: ${!!user2Id}. Run: npm run test:setup-users`
        );
      }

      console.log(
        `[Worker ${workerIndex}] ✅ User IDs: ${user1Id.substring(0, 8)}..., ${user2Id.substring(0, 8)}...`
      );

      // Create separate browser contexts for each user
      const user1Context = await browser.newContext();
      const user2Context = await browser.newContext();

      const user1Page = await user1Context.newPage();
      const user2Page = await user2Context.newPage();

      // Login both users in parallel
      console.log(`[Worker ${workerIndex}] 🔐 Logging in users...`);
      await Promise.all([
        loginUser(user1Page, TEST_USERS.user1.email, TEST_USERS.user1.password),
        loginUser(user2Page, TEST_USERS.user2.email, TEST_USERS.user2.password),
      ]);

      console.log(`[Worker ${workerIndex}] ✅ Both users logged in`);

      const testUsers: WorkerTestUsers = {
        user1: {
          email: TEST_USERS.user1.email,
          password: TEST_USERS.user1.password,
          userId: user1Id,
          page: user1Page,
          context: user1Context,
        },
        user2: {
          email: TEST_USERS.user2.email,
          password: TEST_USERS.user2.password,
          userId: user2Id,
          page: user2Page,
          context: user2Context,
        },
      };

      await use(testUsers);

      // Cleanup: Close contexts
      console.log(`[Worker ${workerIndex}] 🧹 Cleaning up test users...`);
      await user1Context.close();
      await user2Context.close();
      console.log(`[Worker ${workerIndex}] ✅ Cleanup complete`);
    },
    { scope: 'worker' },
  ],
});

// ============================================================================
// Test-Scoped Fixtures (Fresh for each test)
// ============================================================================

/**
 * Fresh Pages Fixture (Test-scoped)
 * Provides fresh pages for each test, but uses worker-scoped authenticated contexts
 * This allows tests to have clean state while reusing authentication
 */
export const test = testUsersFixture.extend<{
  freshUser1Page: Page;
  freshUser2Page: Page;
}>({
  freshUser1Page: async ({ testUsers }, use) => {
    // Create a fresh page in the existing authenticated context
    const freshPage = await testUsers.user1.context.newPage();
    await use(freshPage);
    await freshPage.close();
  },

  freshUser2Page: async ({ testUsers }, use) => {
    // Create a fresh page in the existing authenticated context
    const freshPage = await testUsers.user2.context.newPage();
    await use(freshPage);
    await freshPage.close();
  },
});

// Export expect for convenience
export { expect };

// ============================================================================
// Extended Test with Log Fetching
// ============================================================================

/**
 * Test with Log Fetcher Fixture
 * Extends base test with log fetching capability
 */
export const testWithLogs = test.extend<{
  fetchSpinLogs: (
    userId?: string,
    eventTypes?: string[],
    since?: Date
  ) => Promise<any[]>;
}>({
  fetchSpinLogs: async ({ testUsers }, use) => {
    const fetchSpinLogs = async (
      userId?: string,
      eventTypes?: string[],
      since?: Date
    ): Promise<any[]> => {
      const params = new URLSearchParams();
      if (userId) params.append('user', userId);
      if (eventTypes) params.append('types', eventTypes.join(','));
      params.append('limit', '100');

      try {
        const response = await testUsers.user1.page.request.get(
          `/api/debug/spin-logs?${params.toString()}`
        );
        if (!response.ok()) {
          console.warn(`Failed to fetch logs: ${response.status()}`);
          return [];
        }

        const data = await response.json();
        if (!data.success || !data.logs) return [];

        if (since) {
          return data.logs.filter((log: any) => {
            const logTime = new Date(log.timestamp);
            return logTime >= since;
          });
        }

        return data.logs;
      } catch (error) {
        console.warn('Error fetching logs:', error);
        return [];
      }
    };

    await use(fetchSpinLogs);
  },
});

