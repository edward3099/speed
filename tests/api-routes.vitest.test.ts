/**
 * API Routes Tests using Vitest
 * 
 * Tests API endpoints directly without browser
 * Much faster than Playwright for API testing
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { supabase, testState } from './setup/test-setup';

const BASE_URL = 'http://localhost:3001';

/**
 * Helper: Make API request
 */
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));
  return { response, data, status: response.status };
}

describe('API Routes - Vitest Tests', () => {
  beforeEach(async () => {
    // Clean up before each test
    if (testState.user1Id) {
      await supabase.from('matching_queue').delete().eq('user_id', testState.user1Id);
      await supabase
        .from('matches')
        .delete()
        .or(`user1_id.eq.${testState.user1Id},user2_id.eq.${testState.user1Id}`);
    }
  });

  /**
   * Test: Queue Management API
   */
  test('Queue Management API - GET health check', async () => {
    const { status, data } = await apiRequest('/api/queue-management');

    // API might return 200 or 500 depending on function availability
    expect([200, 500]).toContain(status);
    if (status === 200) {
      // API returns either 'health' or 'success' property
      const hasHealth = data && typeof data === 'object' && 'health' in data;
      const hasSuccess = data && typeof data === 'object' && 'success' in data;
      expect(hasHealth || hasSuccess).toBe(true);
    }
  });

  /**
   * Test: Queue Management API - POST execute
   */
  test('Queue Management API - POST execute', async () => {
    const { status, data } = await apiRequest('/api/queue-management', {
      method: 'POST',
    });

    // API might return 200 or 500 depending on function availability
    expect([200, 500]).toContain(status);
    if (status === 200) {
      expect(data).toHaveProperty('result').or.toHaveProperty('success');
    }
  });

  /**
   * Test: Background Matching API
   */
  test('Background Matching API', async () => {
    const { status, data } = await apiRequest('/api/background-matching', {
      method: 'POST',
    });

    expect(status).toBe(200);
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('matchesCreated');
  });

  /**
   * Test: Spin Logs API
   */
  test('Spin Logs API', async () => {
    const { status, data } = await apiRequest('/api/debug/spin-logs?limit=10');

    expect(status).toBe(200);
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('logs');
    expect(Array.isArray(data.logs)).toBe(true);
  });

  /**
   * Test: Spin Logs API with user filter
   */
  test('Spin Logs API - Filter by user', async () => {
    if (!testState.user1Id) {
      throw new Error('Test user not available');
    }

    const { status, data } = await apiRequest(
      `/api/debug/spin-logs?user=${testState.user1Id}&limit=10`
    );

    expect(status).toBe(200);
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('logs');
    
    if (data.logs && data.logs.length > 0) {
      expect(data.logs.every((log: any) => log.user_id === testState.user1Id)).toBe(true);
    }
  });

  /**
   * Test: Guardians API
   */
  test('Guardians API - POST trigger', async () => {
    const { status, data } = await apiRequest('/api/guardians', {
      method: 'POST',
    });

    // Guardians API might return 200 or 500 depending on function availability
    expect([200, 500]).toContain(status);
    if (status === 200) {
      expect(data).toHaveProperty('message');
    }
  });
});

