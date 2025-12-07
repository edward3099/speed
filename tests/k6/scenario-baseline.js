/**
 * Baseline Load Test: 10-20 Users
 * 
 * Use this to verify system works at low load before scaling up
 * 
 * Setup:
 * 1. Pre-create users: curl -X POST "http://localhost:3000/api/test/batch-setup?count=50&genderRatio=0.714"
 * 2. Run: BASE_URL=http://localhost:3000 k6 run tests/k6/scenario-baseline.js
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
    { duration: '10s', target: 5 },   // Ramp to 5 users
    { duration: '20s', target: 10 },  // Ramp to 10 users
    { duration: '30s', target: 20 },  // Stay at 20 users
    { duration: '10s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% < 2s
    http_req_failed: ['rate<0.05'],    // < 5% failures
    spin_success: ['rate>0.95'],       // 95% success rate
    match_found: ['rate>0.3'],         // At least 30% find matches
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Pre-fetch user pool
let userPool = {
  males: [],
  females: [],
  currentMaleIndex: 0,
  currentFemaleIndex: 0,
};

export function setup() {
  console.log('🔧 Setting up user pool...');
  
  // Fetch users from pool
  const maleRes = http.get(`${BASE_URL}/api/test/user-pool?count=50&gender=male`, { timeout: '30s' });
  if (maleRes.status === 200) {
    try {
      const maleData = JSON.parse(maleRes.body);
      userPool.males = maleData.user_ids || [];
      console.log(`✅ Loaded ${userPool.males.length} male users`);
    } catch (e) {
      console.log(`⚠️ Failed to parse male users: ${e}`);
    }
  }
  
  const femaleRes = http.get(`${BASE_URL}/api/test/user-pool?count=50&gender=female`, { timeout: '30s' });
  if (femaleRes.status === 200) {
    try {
      const femaleData = JSON.parse(femaleRes.body);
      userPool.females = femaleData.user_ids || [];
      console.log(`✅ Loaded ${userPool.females.length} female users`);
    } catch (e) {
      console.log(`⚠️ Failed to parse female users: ${e}`);
    }
  }
  
  if (userPool.males.length === 0 && userPool.females.length === 0) {
    console.log('⚠️ No users in pool. Run: curl -X POST "http://localhost:3000/api/test/batch-setup?count=50"');
  }
  
  return { userPool };
}

function getUserId(pool, gender) {
  if (gender === 'male' && pool.males.length > 0) {
    const index = pool.currentMaleIndex++ % pool.males.length;
    return pool.males[index];
  } else if (gender === 'female' && pool.females.length > 0) {
    const index = pool.currentFemaleIndex++ % pool.females.length;
    return pool.females[index];
  }
  return null;
}

export default function (data) {
  const pool = data?.userPool || userPool;
  
  // Alternate between male and female
  const isMale = __VU % 2 === 1;
  const gender = isMale ? 'male' : 'female';
  const userId = getUserId(pool, gender);
  
  if (!userId) {
    console.log(`⚠️ No ${gender} users available in pool`);
    return;
  }
  
  const startTime = Date.now();
  
  // Realistic delay
  sleep(Math.random() * 2);
  
  // Step 1: Join Queue
  const spinResponse = http.post(
    `${BASE_URL}/api/test/spin`,
    JSON.stringify({ user_id: userId, gender: gender }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'Spin', gender: gender },
      timeout: '10s',
    }
  );
  
  const spinSuccess = check(spinResponse, {
    'spin status is 200': (r) => r.status === 200,
    'spin response time < 1s': (r) => r.timings.duration < 1000,
  });
  
  spinSuccessRate.add(spinSuccess);
  
  if (!spinSuccess) {
    if (spinResponse.status === 429) {
      console.log(`⚠️ Rate limited, retrying after delay...`);
      sleep(2);
      return; // Will retry on next iteration
    }
    return;
  }
  
  spinsInitiated.add(1);
  
  // Step 2: Poll for Match
  let matched = false;
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds max wait
  
  while (!matched && attempts < maxAttempts) {
    sleep(1 + Math.random());
    
    const statusResponse = http.get(
      `${BASE_URL}/api/test/match-status?user_id=${userId}`,
      {
        tags: { name: 'MatchStatus', gender: gender },
        timeout: '5s',
      }
    );
    
    if (statusResponse.status === 429) {
      // Rate limited, wait and retry
      sleep(2);
      attempts++;
      continue;
    }
    
    if (statusResponse.status !== 200) {
      attempts++;
      continue;
    }
    
    const statusData = JSON.parse(statusResponse.body);
    matched = statusData.state === 'paired' && statusData.match !== null;
    attempts++;
    
    if (matched) {
      const matchId = statusData.match.match_id;
      const matchTimeMs = Date.now() - startTime;
      matchTime.add(matchTimeMs);
      matchFoundRate.add(1);
      matchesCreated.add(1);
      
      sleep(2 + Math.random() * 3);
      
      // Step 3: Vote
      const vote = Math.random() < 0.6 ? 'yes' : 'pass';
      const voteResponse = http.post(
        `${BASE_URL}/api/test/vote`,
        JSON.stringify({
          user_id: userId,
          match_id: matchId,
          vote: vote,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          tags: { name: 'Vote', gender: gender },
          timeout: '10s',
        }
      );
      
      const voteSuccess = check(voteResponse, {
        'vote status is 200': (r) => r.status === 200,
      });
      
      voteSuccessRate.add(voteSuccess);
      break;
    }
  }
}
