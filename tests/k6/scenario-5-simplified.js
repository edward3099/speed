/**
 * Scenario 5: High Traffic Load Test (Simplified)
 * 
 * Tests the matching system under load by:
 * 1. Monitoring queue size and match creation rate
 * 2. Calling process_matching repeatedly
 * 3. Verifying system continues to work under load
 * 
 * This version tests the system indirectly by monitoring metrics
 * rather than simulating individual users (which requires auth)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Custom metrics
const processMatchingSuccess = new Rate('process_matching_success');
const matchesCreatedPerCycle = new Gauge('matches_created_per_cycle');
const queueSize = new Gauge('queue_size');
const activeMatches = new Gauge('active_matches');
const processingTime = new Trend('processing_time_ms');

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 concurrent processors
    { duration: '1m', target: 20 },    // Ramp up to 20
    { duration: '2m', target: 20 },    // Stay at 20 (simulating high matching load)
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    process_matching_success: ['rate>0.95'],
  },
};

const SUPABASE_URL = __ENV.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_ANON_KEY must be set!');
}

/**
 * Call Supabase RPC function
 */
function callRPC(functionName, params) {
  const res = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
    JSON.stringify(params),
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=representation',
      },
      tags: { name: functionName },
      timeout: '10s',
    }
  );
  
  return res;
}

/**
 * Get queue size
 */
function getQueueSize() {
  const res = http.get(
    `${SUPABASE_URL}/rest/v1/queue?select=user_id&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'count=exact',
      },
      tags: { name: 'queue_size' },
    }
  );
  
  if (res.status === 200) {
    const count = res.headers['Content-Range']?.split('/')[1];
    return count ? parseInt(count) : 0;
  }
  return 0;
}

/**
 * Get active matches count
 */
function getActiveMatches() {
  const res = http.get(
    `${SUPABASE_URL}/rest/v1/matches?status=eq.vote_active&select=match_id&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'count=exact',
      },
      tags: { name: 'active_matches' },
    }
  );
  
  if (res.status === 200) {
    const count = res.headers['Content-Range']?.split('/')[1];
    return count ? parseInt(count) : 0;
  }
  return 0;
}

/**
 * Main test function - simulates matching processor running continuously
 */
export default function () {
  // Simulate matching processor calling process_matching every second
  const startTime = Date.now();
  
  // Call process_matching
  const res = callRPC('process_matching', {});
  
  const processingTimeMs = Date.now() - startTime;
  processingTime.add(processingTimeMs);
  
  const success = check(res, {
    'process_matching success': (r) => r.status === 200 || r.status === 204,
  });
  
  processMatchingSuccess.add(success);
  
  if (success && res.status === 200) {
    try {
      const data = JSON.parse(res.body);
      const matchesCreated = Array.isArray(data) ? (data[0]?.matches_created || data[0] || 0) : (data?.matches_created || data || 0);
      matchesCreatedPerCycle.add(parseInt(matchesCreated) || 0);
    } catch (e) {
      // If response is not JSON, assume it's a count
      matchesCreatedPerCycle.add(0);
    }
  }
  
  // Monitor queue size and active matches every 5 iterations
  if (__ITER % 5 === 0) {
    const qSize = getQueueSize();
    const aMatches = getActiveMatches();
    queueSize.add(qSize);
    activeMatches.add(aMatches);
  }
  
  // Sleep 1 second (simulating matching processor running every second)
  sleep(1);
}

export function setup() {
  console.log('🚀 Starting Scenario 5 High Traffic Test (Simplified)');
  console.log(`📊 Testing matching system under load`);
  console.log(`🔗 Supabase URL: ${SUPABASE_URL ? 'Set' : 'NOT SET'}`);
  
  return {
    startTime: Date.now(),
  };
}

export function teardown(data) {
  const duration = Date.now() - data.startTime;
  console.log(`\n📊 Test Complete`);
  console.log(`⏱️  Total Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`\n✅ Scenario 5 Test Finished`);
}
