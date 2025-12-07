/**
 * Optimized Load Test: 100 Males + 50 Females
 * More realistic load that won't overwhelm the server
 * Still tests matching logic effectively
 * 
 * Run: BASE_URL=http://localhost:3000 k6 run tests/k6/scenario-optimized-load.js
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
const usersLeft = new Counter('users_left');
const usersJoined = new Counter('users_joined');

export const options = {
  scenarios: {
    // Males: 100 users, joining over 1 minute
    males: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 25 },  // Ramp to 25 males
        { duration: '20s', target: 50 },  // Ramp to 50 males
        { duration: '20s', target: 75 },  // Ramp to 75 males
        { duration: '20s', target: 100 },  // Ramp to 100 males
        { duration: '2m', target: 100 },   // Maintain 100 males
        { duration: '20s', target: 75 },  // Some leave
        { duration: '20s', target: 50 },  // More leave
        { duration: '20s', target: 25 },  // Continue leaving
        { duration: '20s', target: 0 },    // All leave
      ],
      gracefulRampDown: '20s',
      tags: { gender: 'male' },
    },
    
    // Females: 50 users, joining over 40 seconds
    females: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 15 },   // Ramp to 15 females
        { duration: '15s', target: 30 },  // Ramp to 30 females
        { duration: '15s', target: 50 },  // Ramp to 50 females
        { duration: '2m', target: 50 },   // Maintain 50 females
        { duration: '15s', target: 30 },  // Some leave
        { duration: '15s', target: 15 },  // More leave
        { duration: '15s', target: 0 },    // All leave
      ],
      gracefulRampDown: '20s',
      tags: { gender: 'female' },
    },
    
    // Dynamic join/leave: New users joining while others are active
    dynamic_join: {
      executor: 'constant-arrival-rate',
      rate: 2, // 2 new users per second (reduced from 3)
      timeUnit: '1s',
      duration: '4m',
      preAllocatedVUs: 20, // Pre-allocate 20 VUs
      maxVUs: 30, // Max 30 concurrent new users
      tags: { type: 'dynamic_join' },
    },
  },
  
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% < 3s (more lenient)
    http_req_failed: ['rate<0.1'],    // < 10% failures (more lenient)
    spin_success: ['rate>0.8'],        // 80% success rate
    match_found: ['rate>0.3'],         // At least 30% find matches
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

/**
 * Simulate a user session with realistic behavior
 */
function simulateUserSession(gender = 'male') {
  const userId = generateUUID();
  const startTime = Date.now();
  
  // Realistic delay: users don't all join at exactly the same time
  sleep(Math.random() * 2);
  
  usersJoined.add(1);
  
  // Step 1: Join Queue (Start Spin)
  const spinResponse = http.post(
    `${BASE_URL}/api/test/spin`,
    JSON.stringify({ user_id: userId, gender: gender }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: { name: 'Spin', gender: gender },
      timeout: '10s', // 10 second timeout
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
  
  // Realistic behavior: Some users leave immediately (got distracted, etc.)
  const leaveEarly = Math.random() < 0.1; // 10% leave within 10 seconds
  if (leaveEarly) {
    sleep(Math.random() * 10);
    usersLeft.add(1);
    return;
  }
  
  // Step 2: Poll for Match (realistic polling interval: 1-2 seconds)
  let matched = false;
  let attempts = 0;
  const maxAttempts = 40; // 40 seconds max wait (reduced from 60)
  
  // Realistic: Some users have shorter patience
  const patience = Math.random() < 0.2 ? 15 : maxAttempts; // 20% have short patience (15s)
  
  while (!matched && attempts < patience) {
    // Realistic polling interval: 1-2 seconds
    sleep(1 + Math.random());
    
    const statusResponse = http.get(
      `${BASE_URL}/api/test/match-status?user_id=${userId}`,
      {
        tags: { name: 'MatchStatus', gender: gender },
        timeout: '5s', // 5 second timeout
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
      
      // Realistic delay before voting (users read profile)
      sleep(2 + Math.random() * 3); // 2-5 seconds
      
      // Step 3: Vote (realistic: 60% yes, 40% pass)
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
          timeout: '10s', // 10 second timeout
        }
      );
      
      const voteSuccess = check(voteResponse, {
        'vote status is 200': (r) => r.status === 200,
      });
      
      voteSuccessRate.add(voteSuccess);
      
      break;
    }
    
    // Realistic: Some users get impatient and leave
    if (attempts > 10 && Math.random() < 0.05) { // 5% chance after 10 attempts
      usersLeft.add(1);
      return;
    }
  }
  
  if (!matched) {
    // Realistic: User gives up and leaves
    usersLeft.add(1);
  }
}

export default function () {
  // Determine gender based on scenario tag
  const scenario = __ENV.scenario || '';
  let gender = 'male';
  
  if (scenario.includes('female')) {
    gender = 'female';
  } else if (scenario.includes('dynamic')) {
    // Dynamic join: 66.7% male (100/150 ratio)
    gender = Math.random() < 0.667 ? 'male' : 'female';
  }
  
  simulateUserSession(gender);
}

