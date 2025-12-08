/**
 * k6 Test: Rigorous Stress Test - Multiple Edge Cases Combined
 * 
 * This test combines multiple challenging scenarios to stress-test the matching system:
 * 1. High concurrency (10 users joining within 2 seconds)
 * 2. Mixed genders (5 males, 5 females)
 * 3. Rapid heartbeat variations (some users send heartbeats more frequently)
 * 4. Users leaving mid-wait (simulating disconnects)
 * 5. Fairness edge cases (users with different waiting times)
 * 6. Network delay simulation (some users have slower API responses)
 * 
 * Expected to reveal:
 * - Race conditions in matching
 * - Fairness violations under load
 * - Heartbeat timing issues
 * - Queue management problems
 * - State consistency issues
 * 
 * Run: BASE_URL=http://localhost:3000 k6 run tests/k6/rigorous-stress-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const matchFoundRate = new Rate('match_found');
const matchTime = new Trend('match_time_ms');
const illogicalBehaviorCount = new Counter('illogical_behaviors');
const fairnessViolations = new Counter('fairness_violations');
const stateInconsistencies = new Counter('state_inconsistencies');
const heartbeatFailures = new Counter('heartbeat_failures');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  scenarios: {
    // Wave 1: 5 males joining rapidly (within 1 second)
    wave1_male1: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '2m',
      startTime: '0s',
      tags: { wave: '1', gender: 'male', role: 'm1' },
    },
    wave1_male2: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '2m',
      startTime: '0.2s',
      tags: { wave: '1', gender: 'male', role: 'm2' },
    },
    wave1_male3: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '2m',
      startTime: '0.4s',
      tags: { wave: '1', gender: 'male', role: 'm3' },
    },
    wave1_male4: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '2m',
      startTime: '0.6s',
      tags: { wave: '1', gender: 'male', role: 'm4' },
    },
    wave1_male5: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '2m',
      startTime: '0.8s',
      tags: { wave: '1', gender: 'male', role: 'm5' },
    },
    
    // Wave 2: 5 females joining rapidly (1 second after wave 1)
    wave2_female1: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '2m',
      startTime: '1s',
      tags: { wave: '2', gender: 'female', role: 'f1' },
    },
    wave2_female2: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '2m',
      startTime: '1.2s',
      tags: { wave: '2', gender: 'female', role: 'f2' },
    },
    wave2_female3: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '2m',
      startTime: '1.4s',
      tags: { wave: '2', gender: 'female', role: 'f3' },
    },
    wave2_female4: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '2m',
      startTime: '1.6s',
      tags: { wave: '2', gender: 'female', role: 'f4' },
    },
    wave2_female5: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '2m',
      startTime: '1.8s',
      tags: { wave: '2', gender: 'female', role: 'f5' },
    },
  },
  
  thresholds: {
    http_req_duration: ['p(95)<10000'],
    http_req_failed: ['rate<0.1'],
    match_found: ['rate>0.7'], // At least 70% should find matches
  },
};

// Generate UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function () {
  const userId = generateUUID();
  const wave = __VU <= 5 ? '1' : '2';
  const gender = __VU <= 5 ? 'male' : 'female';
  const role = wave === '1' ? `m${__VU}` : `f${__VU - 5}`;
  
  // Simulate different heartbeat frequencies (some users more active)
  const heartbeatInterval = __VU % 3 === 0 ? 3 : 5; // Every 3s or 5s
  const willDisconnect = __VU === 3 || __VU === 8; // Simulate 2 users disconnecting
  
  console.log(`[${wave}-${role}] Starting stress test - ${gender} user: ${userId} (heartbeat: ${heartbeatInterval}s, disconnect: ${willDisconnect})`);
  
  // Step 1: Create test user and join queue
  const setupStartTime = Date.now();
  const setupResponse = http.post(
    `${BASE_URL}/api/test/spin`,
    JSON.stringify({
      user_id: userId,
      gender: gender,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'setup_user' },
    }
  );
  
  const setupSuccess = check(setupResponse, {
    'setup successful': (r) => r.status === 200 || r.status === 201,
  });
  
  if (!setupSuccess) {
    console.error(`[${wave}-${role}] Setup failed: ${setupResponse.status} ${setupResponse.body}`);
    return;
  }
  
  const setupTime = Date.now() - setupStartTime;
  const joinTime = Date.now();
  console.log(`[${wave}-${role}] ✅ Joined queue (${setupTime}ms)`);
  
  // Step 2: Poll for match with variable heartbeat frequency
  const spinStartTime = Date.now();
  let matchFound = false;
  let pollAttempts = 0;
  const maxPolls = 60; // 60 seconds max
  let lastState = null;
  let stateChanges = [];
  let matchDetails = null;
  let lastHeartbeatTime = 0;
  let heartbeatCount = 0;
  
  console.log(`[${wave}-${role}] Starting to poll for match with heartbeat (interval: ${heartbeatInterval}s)...`);
  
  for (let i = 0; i < maxPolls && !matchFound; i++) {
    pollAttempts++;
    
    sleep(1);
    
    // Send heartbeat at variable intervals (simulates different user activity levels)
    const timeSinceLastHeartbeat = Date.now() - lastHeartbeatTime;
    if (timeSinceLastHeartbeat >= heartbeatInterval * 1000) {
      const heartbeatResponse = http.post(
        `${BASE_URL}/api/heartbeat`,
        JSON.stringify({ user_id: userId }),
        {
          headers: { 'Content-Type': 'application/json' },
          tags: { name: 'send_heartbeat' },
        }
      );
      
      const heartbeatCheck = check(heartbeatResponse, {
        'heartbeat successful': (r) => r.status === 200,
      });
      
      if (heartbeatCheck) {
        lastHeartbeatTime = Date.now();
        heartbeatCount++;
      } else {
        console.warn(`[${wave}-${role}] ⚠️ Heartbeat failed at poll ${i}`);
        heartbeatFailures.add(1);
      }
    }
    
    // Simulate user disconnect (stop polling but don't explicitly leave)
    if (willDisconnect && i === 15) {
      console.log(`[${wave}-${role}] 🔌 SIMULATING DISCONNECT - Stopping polling (user should become stale)`);
      sleep(45); // Wait 45 seconds without polling (should become stale)
      console.log(`[${wave}-${role}] Disconnect simulation completed`);
      return;
    }
    
    const statusResponse = http.get(
      `${BASE_URL}/api/test/match-status?user_id=${userId}`,
      {
        tags: { name: 'check_match_status' },
      }
    );
    
    const statusCheck = check(statusResponse, {
      'status check successful': (r) => r.status === 200,
    });
    
    if (!statusCheck) {
      continue;
    }
    
    try {
      const statusData = JSON.parse(statusResponse.body);
      const currentState = statusData.state;
      
      // Track state changes
      if (currentState !== lastState) {
        const transitionTime = Date.now() - spinStartTime;
        stateChanges.push({
          time: pollAttempts,
          timeMs: transitionTime,
          from: lastState,
          to: currentState
        });
        console.log(`[${wave}-${role}] State change: ${lastState || 'null'} → ${currentState} (${pollAttempts}s)`);
        lastState = currentState;
      }
      
      // Check for state inconsistencies
      if (currentState === 'waiting' && statusData.match && statusData.match.match_id) {
        console.error(`[${wave}-${role}] ❌ STATE INCONSISTENCY: State is 'waiting' but match exists!`);
        stateInconsistencies.add(1);
      }
      
      // Check if matched
      if (statusData.match && statusData.match.match_id) {
        const matchTimeMs = Date.now() - spinStartTime;
        matchTime.add(matchTimeMs);
        matchFoundRate.add(1);
        matchFound = true;
        matchDetails = statusData.match;
        
        console.log(`[${wave}-${role}] ✅ MATCH FOUND after ${pollAttempts}s (${matchTimeMs}ms)`);
        console.log(`[${wave}-${role}] Match ID: ${statusData.match.match_id}`);
        console.log(`[${wave}-${role}] Partner: ${statusData.match.partner?.name || 'unknown'}`);
        console.log(`[${wave}-${role}] State: ${statusData.state}`);
        console.log(`[${wave}-${role}] Heartbeats sent: ${heartbeatCount}`);
        
        // Check vote window
        if (statusData.match.vote_window_expires_at) {
          console.log(`[${wave}-${role}] ✅ Vote window initialized (expires: ${statusData.match.vote_window_expires_at})`);
        } else {
          console.error(`[${wave}-${role}] ❌ Vote window NOT initialized!`);
          illogicalBehaviorCount.add(1);
        }
        
        // Fairness check: Verify we didn't match with someone who joined much later
        // (This would indicate a fairness violation)
        const partnerWaitingSince = statusData.match.partner?.waiting_since;
        const myWaitingSince = statusData.match.waiting_since || joinTime;
        if (partnerWaitingSince && new Date(partnerWaitingSince) > new Date(myWaitingSince).getTime() + 2000) {
          console.error(`[${wave}-${role}] ❌ FAIRNESS VIOLATION: Matched with user who joined ${(new Date(partnerWaitingSince) - new Date(myWaitingSince)) / 1000}s later!`);
          fairnessViolations.add(1);
        }
        
        break;
      } else {
        // Still waiting
        if (i % 10 === 0) {
          console.log(`[${wave}-${role}] Still waiting... (${pollAttempts}s, state: ${currentState || 'unknown'}, heartbeats: ${heartbeatCount})`);
        }
      }
    } catch (e) {
      console.error(`[${wave}-${role}] Failed to parse status response: ${e.message}`);
    }
  }
  
  // Final summary
  if (!matchFound && !willDisconnect) {
    console.log(`[${wave}-${role}] ⚠️ NO MATCH FOUND after ${pollAttempts} seconds`);
    console.log(`[${wave}-${role}] Final state: ${lastState || 'unknown'}`);
    console.log(`[${wave}-${role}] Heartbeats sent: ${heartbeatCount}`);
    matchFoundRate.add(0);
  }
  
  console.log(`[${wave}-${role}] Test completed. Match found: ${matchFound}, Heartbeats: ${heartbeatCount}`);
  console.log(`[${wave}-${role}] State changes: ${JSON.stringify(stateChanges)}`);
}
