/**
 * k6 Test for Spin Logic
 * Fast, realistic testing of spin/matching functionality
 * 
 * Tests the matching logic directly via Supabase RPC (faster, no auth needed)
 * 
 * Run: k6 run tests/k6/spin-test.js
 * With env: 
 *   SUPABASE_URL=https://your-project.supabase.co
 *   SUPABASE_ANON_KEY=your-anon-key
 *   k6 run tests/k6/spin-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const spinSuccessRate = new Rate('spin_success');
const matchFoundRate = new Rate('match_found');
const voteSuccessRate = new Rate('vote_success');
const matchTime = new Trend('match_time_ms');
const spinsInitiated = new Counter('spins_initiated');
const matchesCreated = new Counter('matches_created');

export const options = {
  stages: [
    { duration: '10s', target: 5 },   // Ramp up to 5 users
    { duration: '30s', target: 20 },  // Ramp up to 20 users
    { duration: '1m', target: 50 },    // Stay at 50 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests < 2s
    spin_success: ['rate>0.95'],        // 95% success rate
    match_found: ['rate>0.5'],          // At least 50% find matches
  },
};

const SUPABASE_URL = __ENV.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_ANON_KEY must be set!');
  console.error('Run: SUPABASE_URL=xxx SUPABASE_ANON_KEY=yyy k6 run tests/k6/spin-test.js');
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
    }
  );
  
  return res;
}

/**
 * Join queue via RPC
 */
function joinQueue(userId) {
  const res = callRPC('join_queue', { p_user_id: userId });
  return check(res, {
    'join_queue success': (r) => r.status === 200 || r.status === 204,
  });
}

/**
 * Get match status via RPC
 */
function getMatchStatus(userId) {
  const res = callRPC('get_user_match_status', { p_user_id: userId });
  
  if (res.status !== 200) {
    return null;
  }
  
  try {
    return JSON.parse(res.body);
  } catch (e) {
    return null;
  }
}

/**
 * Record vote via RPC
 */
function recordVote(userId, matchId, vote) {
  const res = callRPC('record_vote_and_resolve', {
    p_user_id: userId,
    p_match_id: matchId,
    p_vote: vote,
  });
  
  return check(res, {
    'vote success': (r) => r.status === 200,
  });
}

export default function () {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return; // Skip if not configured
  }
  
  // Generate unique user ID
  const userId = `k6-${__VU}-${__ITER}-${Date.now()}`;
  const startTime = Date.now();
  
  // Realistic delay: users don't all spin at exactly the same time
  sleep(Math.random() * 2);
  
  // Step 1: Join Queue (Start Spin)
  const spinSuccess = joinQueue(userId);
  spinSuccessRate.add(spinSuccess);
  
  if (!spinSuccess) {
    console.log(`❌ User ${userId} failed to join queue`);
    return;
  }
  
  spinsInitiated.add(1);
  console.log(`✅ User ${userId} joined queue`);
  
  // Step 2: Poll for Match (realistic behavior - poll every 1-2 seconds)
  let matched = false;
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds max wait
  let matchId = null;
  
  while (!matched && attempts < maxAttempts) {
    // Realistic polling interval: 1-2 seconds
    sleep(1 + Math.random());
    
    const statusData = getMatchStatus(userId);
    
    if (!statusData) {
      attempts++;
      continue;
    }
    
    matched = statusData.state === 'paired' && statusData.match !== null;
    attempts++;
    
    if (matched) {
      matchId = statusData.match.match_id;
      const matchTimeMs = Date.now() - startTime;
      matchTime.add(matchTimeMs);
      matchFoundRate.add(1);
      matchesCreated.add(1);
      
      console.log(`🎯 User ${userId} matched after ${matchTimeMs}ms! Match: ${matchId}`);
      
      // Step 3: Realistic delay before voting (users read profile)
      sleep(2 + Math.random() * 3); // 2-5 seconds
      
      // Step 4: Vote
      const vote = Math.random() > 0.5 ? 'yes' : 'pass'; // Random vote for realism
      const voteSuccess = recordVote(userId, matchId, vote);
      
      voteSuccessRate.add(voteSuccess);
      
      if (voteSuccess) {
        console.log(`✅ User ${userId} voted ${vote} successfully`);
      } else {
        console.log(`❌ User ${userId} failed to vote`);
      }
      
      break;
    }
  }
  
  if (!matched) {
    console.log(`⏱️ User ${userId} timed out waiting for match after ${attempts} attempts`);
  }
}
