/**
 * k6 Test for Spin Logic - FAST VERSION
 * Uses test endpoints that bypass authentication
 * 
 * Run: k6 run tests/k6/spin-test-fast.js
 * With env: BASE_URL=http://localhost:3000 k6 run tests/k6/spin-test-fast.js
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

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

/**
 * Generate a valid UUID v4
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function () {
  // Generate unique user ID (must be valid UUID)
  const userId = generateUUID();
  const startTime = Date.now();
  
  // Realistic delay: users don't all spin at exactly the same time
  sleep(Math.random() * 2);
  
  // Step 1: Join Queue (Start Spin) - using test endpoint
  const spinResponse = http.post(
    `${BASE_URL}/api/test/spin`,
    JSON.stringify({ user_id: userId }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: { name: 'Spin' },
    }
  );
  
  const spinSuccess = check(spinResponse, {
    'spin status is 200': (r) => r.status === 200,
    'spin response time < 1s': (r) => r.timings.duration < 1000,
  });
  
  spinSuccessRate.add(spinSuccess);
  
  if (!spinSuccess) {
    if (spinResponse.status === 200) {
      // Response was 200 but check failed - might be response time
      console.log(`⚠️ User ${userId} spin check failed (status 200, but slow): ${spinResponse.body}`);
    } else {
      console.log(`❌ User ${userId} failed to spin: ${spinResponse.status} - ${spinResponse.body}`);
    }
    return;
  }
  
  spinsInitiated.add(1);
  console.log(`✅ User ${userId} started spinning`);
  
  // Step 2: Poll for Match (realistic behavior - poll every 1-2 seconds)
  let matched = false;
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds max wait
  let matchId = null;
  
  while (!matched && attempts < maxAttempts) {
    // Realistic polling interval: 1-2 seconds
    sleep(1 + Math.random());
    
    const statusResponse = http.get(
      `${BASE_URL}/api/test/match-status?user_id=${userId}`,
      {
        tags: { name: 'MatchStatus' },
      }
    );
    
    if (statusResponse.status !== 200) {
      attempts++;
      continue;
    }
    
    const statusData = JSON.parse(statusResponse.body);
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
      const voteResponse = http.post(
        `${BASE_URL}/api/test/vote`,
        JSON.stringify({
          user_id: userId,
          match_id: matchId,
          vote: vote,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          tags: { name: 'Vote' },
        }
      );
      
      const voteSuccess = check(voteResponse, {
        'vote status is 200': (r) => r.status === 200,
      });
      
      voteSuccessRate.add(voteSuccess);
      
      if (voteSuccess) {
        console.log(`✅ User ${userId} voted ${vote} successfully`);
      } else {
        console.log(`❌ User ${userId} failed to vote: ${voteResponse.status}`);
      }
      
      break;
    }
  }
  
  if (!matched) {
    console.log(`⏱️ User ${userId} timed out waiting for match after ${attempts} attempts`);
  }
}

