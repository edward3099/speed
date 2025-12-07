/**
 * Realistic Load Test: 500 Males + 200 Females
 * Simulates real-world behavior:
 * - Users join and leave dynamically
 * - Different arrival times
 * - Random session durations
 * - Realistic matching patterns
 * 
 * Run: BASE_URL=http://localhost:3000 k6 run tests/k6/scenario-realistic-load.js
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
    // Males: 500 users, joining over 2 minutes, leaving after random durations
    males: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },  // Ramp to 100 males
        { duration: '30s', target: 250 },  // Ramp to 250 males
        { duration: '30s', target: 400 },  // Ramp to 400 males
        { duration: '30s', target: 500 },  // Ramp to 500 males
        { duration: '2m', target: 500 },   // Maintain 500 males
        { duration: '30s', target: 400 },  // Some leave
        { duration: '30s', target: 300 },  // More leave
        { duration: '30s', target: 200 },  // Continue leaving
        { duration: '30s', target: 100 },  // Most leave
        { duration: '30s', target: 0 },    // All leave
      ],
      gracefulRampDown: '30s',
      tags: { gender: 'male' },
    },
    
    // Females: 200 users, joining over 1 minute, leaving after random durations
    females: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 50 },   // Ramp to 50 females
        { duration: '20s', target: 100 },  // Ramp to 100 females
        { duration: '20s', target: 150 },  // Ramp to 150 females
        { duration: '20s', target: 200 },  // Ramp to 200 females
        { duration: '2m', target: 200 },   // Maintain 200 females
        { duration: '30s', target: 150 },  // Some leave
        { duration: '30s', target: 100 },  // More leave
        { duration: '30s', target: 50 },   // Continue leaving
        { duration: '30s', target: 0 },    // All leave
      ],
      gracefulRampDown: '30s',
      tags: { gender: 'female' },
    },
    
    // Dynamic join/leave: New users joining while others are active
    dynamic_join: {
      executor: 'constant-arrival-rate',
      rate: 3, // 3 new users per second
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 30, // Pre-allocate 30 VUs
      maxVUs: 50, // Max 50 concurrent new users
      tags: { type: 'dynamic_join' },
    },
  },
  
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% < 2s
    http_req_failed: ['rate<0.05'],    // < 5% failures
    spin_success: ['rate>0.95'],        // 95% success rate
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
  sleep(Math.random() * 3);
  
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
    }
  );
  
  const spinSuccess = check(spinResponse, {
    'spin status is 200': (r) => r.status === 200,
    'spin response time < 1s': (r) => r.timings.duration < 1000,
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
  const maxAttempts = 60; // 60 seconds max wait (realistic patience)
  
  // Realistic: Some users have shorter patience
  const patience = Math.random() < 0.2 ? 20 : maxAttempts; // 20% have short patience (20s)
  
  while (!matched && attempts < patience) {
    // Realistic polling interval: 1-2 seconds
    sleep(1 + Math.random());
    
    const statusResponse = http.get(
      `${BASE_URL}/api/test/match-status?user_id=${userId}`,
      {
        tags: { name: 'MatchStatus', gender: gender },
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
      sleep(2 + Math.random() * 5); // 2-7 seconds
      
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
        }
      );
      
      const voteSuccess = check(voteResponse, {
        'vote status is 200': (r) => r.status === 200,
      });
      
      voteSuccessRate.add(voteSuccess);
      
      break;
    }
    
    // Realistic: Some users get impatient and leave
    if (attempts > 15 && Math.random() < 0.05) { // 5% chance after 15 attempts
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
    // Dynamic join: 71.4% male (500/700 ratio)
    gender = Math.random() < 0.714 ? 'male' : 'female';
  }
  
  simulateUserSession(gender);
}
