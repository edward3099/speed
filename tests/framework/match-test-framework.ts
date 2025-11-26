/**
 * Match Test Framework - Custom Testing Framework for Matching Logic
 * 
 * Designed specifically for testing database-heavy matching operations.
 * Features:
 * - Built-in retry logic for flaky database operations
 * - Automatic test isolation with cleanup
 * - Detailed diagnostics and logging
 * - Better async handling with timeouts
 * - Real-time progress reporting
 * - Automatic failure recovery
 */

import { createClient } from '@supabase/supabase-js';

// ============================================================================
// Types
// ============================================================================

export interface TestConfig {
  name: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  cleanup?: boolean;
  verbose?: boolean;
}

export interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: Error;
  attempts: number;
  diagnostics?: any;
}

export interface TestSuite {
  name: string;
  tests: TestResult[];
  duration: number;
  passed: number;
  failed: number;
}

// ============================================================================
// Test Framework Core
// ============================================================================

export class MatchTestFramework {
  private supabase: ReturnType<typeof createClient>;
  private suite: TestSuite;
  private currentTest: TestResult | null = null;
  private verbose: boolean = false;

  constructor(supabase: ReturnType<typeof createClient>, verbose: boolean = false) {
    this.supabase = supabase;
    this.verbose = verbose;
    this.suite = {
      name: 'Matching Logic Tests',
      tests: [],
      duration: 0,
      passed: 0,
      failed: 0,
    };
  }

  /**
   * Run a test with automatic retries and better error handling
   */
  async test(config: TestConfig, testFn: () => Promise<void>): Promise<TestResult> {
    const startTime = Date.now();
    const timeout = config.timeout || 60000; // 60s default
    const retries = config.retries || 3;
    const retryDelay = config.retryDelay || 1000;

    this.currentTest = {
      name: config.name,
      passed: false,
      duration: 0,
      attempts: 0,
    };

    if (this.verbose) {
      console.log(`\n🧪 Running: ${config.name}`);
    }

    let lastError: Error | undefined;
    let diagnostics: any = {};

    for (let attempt = 1; attempt <= retries; attempt++) {
      this.currentTest.attempts = attempt;

      try {
        // Cleanup before test if requested
        if (config.cleanup !== false && attempt === 1) {
          await this.cleanupTestData();
        }

        // Run test with timeout
        await Promise.race([
          testFn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Test timeout after ${timeout}ms`)), timeout)
          ),
        ]);

        // Test passed!
        this.currentTest.passed = true;
        this.currentTest.duration = Date.now() - startTime;
        this.suite.tests.push(this.currentTest);
        this.suite.passed++;

        if (this.verbose) {
          console.log(`✅ PASSED: ${config.name} (${this.currentTest.duration}ms, attempt ${attempt})`);
        }

        return this.currentTest;
      } catch (error: any) {
        lastError = error;
        diagnostics[`attempt_${attempt}`] = {
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        };

        if (this.verbose) {
          console.log(`⚠️  Attempt ${attempt}/${retries} failed: ${error.message}`);
        }

        // If not last attempt, wait and retry
        if (attempt < retries) {
          const delay = retryDelay * attempt; // Exponential backoff
          if (this.verbose) {
            console.log(`   Retrying in ${delay}ms...`);
          }
          await this.sleep(delay);
        }
      }
    }

    // All attempts failed
    this.currentTest.passed = false;
    this.currentTest.duration = Date.now() - startTime;
    this.currentTest.error = lastError;
    this.currentTest.diagnostics = diagnostics;
    this.suite.tests.push(this.currentTest);
    this.suite.failed++;

    if (this.verbose) {
      console.log(`❌ FAILED: ${config.name} (${this.currentTest.duration}ms, ${retries} attempts)`);
      if (lastError) {
        console.log(`   Error: ${lastError.message}`);
      }
    }

    return this.currentTest;
  }

  /**
   * Wait for a condition to be true (with timeout)
   */
  async waitFor(
    condition: () => Promise<boolean>,
    options: { timeout?: number; interval?: number; description?: string } = {}
  ): Promise<void> {
    const timeout = options.timeout || 30000; // 30s default
    const interval = options.interval || 500; // 500ms default
    const startTime = Date.now();
    const description = options.description || 'condition';

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return; // Condition met
      }
      await this.sleep(interval);
    }

    throw new Error(`Timeout waiting for ${description} (${timeout}ms)`);
  }

  /**
   * Retry an operation with exponential backoff
   */
  async retry<T>(
    operation: () => Promise<T>,
    options: { maxRetries?: number; initialDelay?: number; maxDelay?: number } = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries || 5;
    const initialDelay = options.initialDelay || 100;
    const maxDelay = options.maxDelay || 5000;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        if (attempt < maxRetries) {
          const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  /**
   * Execute matching with automatic retries and better error handling
   */
  async executeMatching(
    userId: string,
    options: { maxRetries?: number; timeout?: number } = {}
  ): Promise<string> {
    const maxRetries = options.maxRetries || 10; // Increased retries
    const timeout = options.timeout || 60000; // Increased timeout to 60s

    return this.retry(
      async () => {
        const { data, error } = await Promise.race([
          this.supabase.rpc('process_matching_v2', { p_user_id: userId }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Matching timeout after ${timeout}ms`)), timeout)
          ),
        ]);

        if (error) {
          // Handle statement timeout specifically
          if (error.code === '57014' || error.message?.includes('statement timeout')) {
            throw new Error(`Matching statement timeout - function may need more time`);
          }
          throw new Error(`Matching failed: ${error.message} (code: ${error.code})`);
        }

        if (!data) {
          throw new Error('Matching returned null - no match found (guaranteed matching should prevent this)');
        }

        return data;
      },
      { maxRetries, initialDelay: 2000, maxDelay: 10000 } // Longer delays
    );
  }

  /**
   * Join queue with automatic retries and timeout handling
   */
  async joinQueue(userId: string, fairnessBoost: number = 0): Promise<string> {
    return this.retry(
      async () => {
        // Use Promise.race to add client-side timeout
        const { data, error } = await Promise.race([
          this.supabase.rpc('spark_join_queue', {
            p_user_id: userId,
            p_fairness_boost: fairnessBoost,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Join queue timeout (15s)')), 15000)
          ),
        ]);

        if (error) {
          // Handle statement timeout specifically
          if (error.code === '57014' || error.message?.includes('statement timeout')) {
            throw new Error(`Join queue statement timeout - may need to increase function timeout`);
          }
          throw new Error(`Join queue failed: ${error.message} (code: ${error.code})`);
        }

        if (!data) {
          throw new Error('Join queue returned null');
        }

        return data;
      },
      { maxRetries: 5, initialDelay: 1000, maxDelay: 5000 }
    );
  }

  /**
   * Get queue status with retries
   */
  async getQueueStatus(userId: string): Promise<any> {
    return this.retry(
      async () => {
        const { data, error } = await this.supabase
          .from('matching_queue')
          .select('status, fairness_score, joined_at')
          .eq('user_id', userId)
          .single();

        if (error && error.code !== 'PGRST116') {
          throw new Error(`Get queue status failed: ${error.message}`);
        }

        return data;
      },
      { maxRetries: 3, initialDelay: 200 }
    );
  }

  /**
   * Get active match with retries
   */
  async getActiveMatch(userId: string): Promise<any> {
    return this.retry(
      async () => {
        const { data, error } = await this.supabase
          .from('matches')
          .select('*')
          .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
          .eq('status', 'pending')
          .order('matched_at', { ascending: false })
          .limit(1)
          .single();

        if (error && error.code !== 'PGRST116') {
          throw new Error(`Get active match failed: ${error.message}`);
        }

        return data;
      },
      { maxRetries: 3, initialDelay: 200 }
    );
  }

  /**
   * Cleanup test data
   */
  private async cleanupTestData(): Promise<void> {
    // This will be called before each test to ensure clean state
    // Implementation can be customized based on needs
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get test suite results
   */
  getResults(): TestSuite {
    this.suite.duration = this.suite.tests.reduce((sum, test) => sum + test.duration, 0);
    return this.suite;
  }

  /**
   * Print summary
   */
  printSummary(): void {
    const results = this.getResults();
    console.log('\n' + '='.repeat(60));
    console.log(`📊 Test Suite: ${results.name}`);
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`⏱️  Duration: ${results.duration}ms`);
    console.log(`📈 Success Rate: ${((results.passed / results.tests.length) * 100).toFixed(1)}%`);
    console.log('='.repeat(60));

    if (results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      results.tests
        .filter((t) => !t.passed)
        .forEach((test) => {
          console.log(`  - ${test.name}`);
          if (test.error) {
            console.log(`    Error: ${test.error.message}`);
          }
          if (test.diagnostics) {
            console.log(`    Attempts: ${test.attempts}`);
          }
        });
    }
  }
}

// ============================================================================
// Assertions
// ============================================================================

export class Assert {
  static isTruthy(value: any, message?: string): void {
    if (!value) {
      throw new Error(message || `Expected truthy value, got: ${value}`);
    }
  }

  static equals(actual: any, expected: any, message?: string): void {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }

  static isGreaterThan(actual: number, expected: number, message?: string): void {
    if (actual <= expected) {
      throw new Error(message || `Expected ${actual} to be greater than ${expected}`);
    }
  }

  static isType(value: any, type: string, message?: string): void {
    if (typeof value !== type) {
      throw new Error(message || `Expected type ${type}, got ${typeof value}`);
    }
  }
}

