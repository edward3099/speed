/**
 * Optimized Load Test with User Pool
 * Uses pre-created users for better performance
 * 
 * Setup: POST /api/test/batch-setup?count=200&genderRatio=0.714
 * Run: BASE_URL=http://localhost:3000 k6 run tests/k6/scenario-optimized-with-pool.js
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
  scenarios: {
    // Males: 100 users
    males: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 25 },
        { duration: '20s', target: 50 },
        { duration: '20s', target: 75 },
        { duration: '20s', target: 100 },
        { duration: '2m', target: 100 },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '20s',
      tags: { gender: 'male' },
    },
    
    // Females: 50 users
    females: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 15 },
        { duration: '15s', target: 30 },
        { duration: '15s', target: 50 },
        { duration: '2m', target: 50 },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '20s',
      tags: { gender: 'female' },
    },
  },
  
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.1'],
    spin_success: ['rate>0.9'],
    match_found: ['rate>0.3'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Pre-fetch user pool at test start
let userPool = {
  males: [],
  females: [],
  currentMaleIndex: 0,
  currentFemaleIndex: 0,
};

export function setup() {
  console.log('🔧 Setting up user pool...');
  
  // Fetch male users
  const maleRes = http.get(`${BASE_URL}/api/test/user-pool?count=200&gender=male`, { timeout: '30s' });
  if (maleRes.status === 200) {
    try {
      const maleData = JSON.parse(maleRes.body);
      userPool.males = maleData.user_ids || [];
      console.log(`✅ Loaded ${userPool.males.length} male users`);
    } catch (e) {
      console.log(`⚠️ Failed to parse male users: ${e}`);
    }
  } else {
    console.log(`⚠️ Failed to fetch male users: ${maleRes.status}`);
  }
  
  // Fetch female users
  const femaleRes = http.get(`${BASE_URL}/api/test/user-pool?count=200&gender=female`, { timeout: '30s' });
  if (femaleRes.status === 200) {
    try {
      const femaleData = JSON.parse(femaleRes.body);
      userPool.females = femaleData.user_ids || [];
      console.log(`✅ Loaded ${userPool.females.length} female users`);
    } catch (e) {
      console.log(`⚠️ Failed to parse female users: ${e}`);
    }
  } else {
    console.log(`⚠️ Failed to fetch female users: ${femaleRes.status}`);
  }
  
  // If pools are empty, generate some UUIDs as fallback
  if (userPool.males.length === 0 && userPool.females.length === 0) {
    console.log('⚠️ No users in pool, will generate UUIDs on the fly');
  }
  
  return { userPool };
}

export default function (data) {
  const pool = data?.userPool || userPool;
  
  // Determine gender based on scenario
  let gender = 'male';
  let userId = null;
  
  // Use __VU and __ITER to determine gender (alternate or use scenario tag)
  const vuId = __VU || 1
  const isFemale = vuId > 100 // VUs 1-100 are males, 101-150 are females
  
  if (isFemale) {
    gender = 'female';
    if (pool.females && pool.females.length > 0) {
      const index = (pool.currentFemaleIndex++) % pool.females.length;
      userId = pool.females[index];
    }
  } else {
    if (pool.males && pool.males.length > 0) {
      const index = (pool.currentMaleIndex++) % pool.males.length;
      userId = pool.males[index];
    }
  }
  
  // Fallback: generate UUID if pool is empty
  if (!userId) {
    userId = generateUUID();
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
  });
  
  spinSuccessRate.add(spinSuccess);
  
  if (!spinSuccess) {
    return;
  }
  
  spinsInitiated.add(1);
  
  // Step 2: Poll for Match
  let matched = false;
  let attempts = 0;
  const maxAttempts = 40;
  
  while (!matched && attempts < maxAttempts) {
    sleep(1 + Math.random());
    
    const statusResponse = http.get(
      `${BASE_URL}/api/test/match-status?user_id=${userId}`,
      {
        tags: { name: 'MatchStatus', gender: gender },
        timeout: '5s',
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

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

