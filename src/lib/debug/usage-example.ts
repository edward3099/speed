/**
 * Usage Example: Integrating Debug Toolkit with Matching Engine
 * This file demonstrates how to use the debugging toolkit in practice
 */

import DebugToolkit, {
  debugState,
  logEvent,
  captureEvent,
  validateAfterEvent,
  simulate,
  createCheckpoint,
  getDebugFeed,
  setVoteTimer,
  freezeState,
  scenarios
} from './index';

/**
 * Example 1: Basic State Debugging
 */
export async function exampleBasicDebugging() {
  console.log('=== Basic State Debugging ===');
  
  // Get current state
  const state = debugState();
  console.log('Current queue size:', state.queue.length);
  console.log('Active pairs:', Object.keys(state.pairs).length);
  console.log('Server time:', new Date(state.serverTimestamp).toISOString());
  
  // Validate state
  const validation = DebugToolkit.validate();
  if (!validation.isValid) {
    console.error('State validation failed!');
    validation.errors.forEach(error => {
      console.error(`- ${error.rule}: ${error.message}`);
    });
  }
  
  // Get compact feed for monitoring
  const feed = getDebugFeed();
  console.log('System health:', feed.systemHealth.overallHealth);
  console.log('Match rate:', Math.round(feed.stats.matchRate * 100) + '%');
  console.log('Average wait time:', Math.round(feed.stats.averageWaitTime / 1000) + 's');
}

/**
 * Example 2: Simulating User Interactions
 */
export async function exampleSimulation() {
  console.log('\n=== Simulating User Interactions ===');
  
  // Create checkpoint before simulation
  const checkpointId = createCheckpoint('Before simulation');
  console.log('Created checkpoint:', checkpointId);
  
  // Run basic match simulation
  const result = await simulate([
    { type: 'spin', user: 'alice' },
    { type: 'spin', user: 'bob' },
    { type: 'vote', user: 'alice', value: 'yes', delay: 1000 },
    { type: 'vote', user: 'bob', value: 'yes', delay: 1500 }
  ]);
  
  console.log('Simulation result:');
  console.log('- Success:', result.success);
  console.log('- Events processed:', result.eventsProcessed);
  console.log('- Errors:', result.errors.length);
  console.log('- Final pairs:', Object.keys(result.finalState.pairs).length);
  
  // Rollback after simulation
  DebugToolkit.rollback();
  console.log('Rolled back to checkpoint');
}

/**
 * Example 3: Debugging a Specific User Journey
 */
export async function exampleUserJourney() {
  console.log('\n=== Debugging User Journey ===');
  
  const userId = 'user_123';
  
  // Track user through the system
  const { result, snapshot } = await captureEvent(
    'spin',
    userId,
    () => {
      // Simulate user spinning
      return {
        userId,
        action: 'queued',
        timestamp: Date.now()
      };
    },
    { preferences: { minAge: 25, maxAge: 35 } }
  );
  
  console.log('User spin captured:');
  console.log('- Snapshot ID:', snapshot.id);
  console.log('- Queue before:', snapshot.beforeState.queue.length);
  console.log('- Queue after:', snapshot.afterState.queue.length);
  
  // Check user state
  const currentState = debugState();
  const userInQueue = currentState.queue.some((e: any) => e.userId === userId);
  const userPaired = Object.values(currentState.pairs).some((p: any) => 
    p.user1 === userId || p.user2 === userId
  );
  
  console.log('User status:');
  console.log('- In queue:', userInQueue);
  console.log('- Paired:', userPaired);
}

/**
 * Example 4: Testing Disconnect/Reconnect Scenarios
 */
export async function exampleDisconnectScenario() {
  console.log('\n=== Testing Disconnect/Reconnect ===');
  
  // Freeze state before test
  freezeState('disconnect_test', 'Testing disconnect scenario');
  
  const result = await simulate([
    { type: 'spin', user: 1 },
    { type: 'spin', user: 2 },
    { type: 'disconnect', user: 2, delay: 500 },
    { type: 'reconnect', user: 2, delay: 2000 },
    { type: 'vote', user: 1, value: 'yes' },
    { type: 'vote', user: 2, value: 'yes' }
  ]);
  
  // Check validation after each event
  let hasValidationErrors = false;
  result.validationResults.forEach((validation, index) => {
    if (!validation.isValid) {
      console.error(`Validation failed after event ${index}:`, validation.errors);
      hasValidationErrors = true;
    }
  });
  
  console.log('Disconnect test completed:');
  console.log('- Has validation errors:', hasValidationErrors);
  console.log('- Final state valid:', result.validationResults[result.validationResults.length - 1]?.isValid);
}

/**
 * Example 5: Chaos Testing
 */
export async function exampleChaosTest() {
  console.log('\n=== Chaos Testing ===');
  
  // Create checkpoint
  createCheckpoint('Before chaos');
  
  // Run chaos simulation with 20 users and 200 events
  const chaosResult = await DebugToolkit.simulate(
    generateChaosEvents(20, 200)
  );
  
  console.log('Chaos test results:');
  console.log('- Events processed:', chaosResult.eventsProcessed);
  console.log('- Errors encountered:', chaosResult.errors.length);
  console.log('- Validation failures:', chaosResult.validationResults.filter(v => !v.isValid).length);
  
  // Analyze final state
  const finalState = chaosResult.finalState;
  console.log('Final state:');
  console.log('- Queue size:', finalState.queue.length);
  console.log('- Active pairs:', Object.keys(finalState.pairs).length);
  console.log('- Users in vote:', Object.keys(finalState.voteActive).length);
  console.log('- Users in video:', Object.keys(finalState.videoActive).length);
  
  // Check system health
  const feed = getDebugFeed();
  console.log('System health after chaos:', feed.systemHealth.overallHealth);
  if (feed.systemHealth.issues.length > 0) {
    console.log('Issues detected:');
    feed.systemHealth.issues.forEach(issue => console.log(`  - ${issue}`));
  }
}

/**
 * Example 6: Performance Monitoring
 */
export async function examplePerformanceMonitoring() {
  console.log('\n=== Performance Monitoring ===');
  
  // Monitor performance over time
  const performanceData: any[] = [];
  
  for (let i = 0; i < 5; i++) {
    // Simulate some activity
    await simulate([
      { type: 'spin', user: `user_${i * 2}` },
      { type: 'spin', user: `user_${i * 2 + 1}` }
    ]);
    
    // Collect metrics
    const feed = getDebugFeed();
    performanceData.push({
      iteration: i,
      queueSize: feed.currentQueue.length,
      activePairs: feed.currentPairs.length,
      matchRate: feed.stats.matchRate,
      avgWaitTime: feed.stats.averageWaitTime,
      errorRate: feed.stats.errorRate
    });
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Analyze performance trends
  console.log('Performance over time:');
  performanceData.forEach(data => {
    console.log(`Iteration ${data.iteration}:`, {
      queue: data.queueSize,
      pairs: data.activePairs,
      matchRate: Math.round(data.matchRate * 100) + '%',
      avgWait: Math.round(data.avgWaitTime / 1000) + 's'
    });
  });
}

/**
 * Example 7: Using Predefined Scenarios
 */
export async function examplePredefinedScenarios() {
  console.log('\n=== Running Predefined Scenarios ===');
  
  // Run basic match scenario
  const basicResult = await runScenario(scenarios.basicMatch);
  console.log('Basic match scenario:', basicResult.success ? 'PASSED' : 'FAILED');
  
  // Run respin scenario
  const respinResult = await runScenario(scenarios.respinScenario);
  console.log('Respin scenario:', respinResult.success ? 'PASSED' : 'FAILED');
  
  // Run disconnect/reconnect scenario
  const disconnectResult = await runScenario(scenarios.disconnectReconnect);
  console.log('Disconnect/reconnect scenario:', disconnectResult.success ? 'PASSED' : 'FAILED');
  
  // Run multiple matches scenario
  const multipleResult = await runScenario(scenarios.multipleMatches);
  console.log('Multiple matches scenario:', multipleResult.success ? 'PASSED' : 'FAILED');
}

/**
 * Example 8: Event Replay from Logs
 */
export async function exampleEventReplay() {
  console.log('\n=== Event Replay ===');
  
  // First, generate some events and log them
  await simulate([
    { type: 'spin', user: 'replay_user_1' },
    { type: 'spin', user: 'replay_user_2' },
    { type: 'vote', user: 'replay_user_1', value: 'yes' },
    { type: 'vote', user: 'replay_user_2', value: 'pass' }
  ]);
  
  // Export logs
  const logs = getLogs();
  console.log('Captured', logs.length, 'log entries');
  
  // Reset state
  DebugToolkit.reset();
  console.log('State reset');
  
  // Replay from memory
  const replayResult = await replayFromMemory(logs, {
    validateEachStep: true,
    compareSnapshots: true
  });
  
  console.log('Replay results:');
  console.log('- Success:', replayResult.success);
  console.log('- Events replayed:', replayResult.eventsReplayed);
  console.log('- Divergences found:', replayResult.divergences.length);
  
  if (replayResult.divergences.length > 0) {
    console.log('State divergences:');
    replayResult.divergences.forEach(div => {
      console.log(`  - Field ${div.field} differs at event ${div.eventIndex}`);
    });
  }
}

/**
 * Helper function to generate chaos events
 */
function generateChaosEvents(userCount: number, eventCount: number) {
  const events: any[] = [];
  const users = Array.from({ length: userCount }, (_, i) => `chaos_user_${i}`);
  
  for (let i = 0; i < eventCount; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    const eventTypes = ['spin', 'vote', 'disconnect', 'reconnect', 'heartbeat'];
    const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    
    const event: any = { type, user };
    
    if (type === 'vote') {
      event.value = Math.random() > 0.5 ? 'yes' : 'pass';
    }
    
    event.delay = Math.floor(Math.random() * 100);
    events.push(event);
  }
  
  return events;
}

/**
 * Helper to run scenario
 */
async function runScenario(scenario: any) {
  return simulate(scenario.events);
}

/**
 * Helper to get logs
 */
function getLogs() {
  // This would be imported from the logging module
  return [];
}

/**
 * Helper to replay from memory
 */
async function replayFromMemory(logs: any[], options: any) {
  // This would be imported from the replay module
  return {
    success: true,
    eventsReplayed: logs.length,
    divergences: [],
    errors: [],
    finalState: debugState(),
    duration: 0
  };
}

/**
 * Main function to run all examples
 */
export async function runAllExamples() {
  console.log('🚀 Starting Debug Toolkit Examples\n');
  
  try {
    await exampleBasicDebugging();
    await exampleSimulation();
    await exampleUserJourney();
    await exampleDisconnectScenario();
    await exampleChaosTest();
    await examplePerformanceMonitoring();
    await examplePredefinedScenarios();
    await exampleEventReplay();
    
    console.log('\n✅ All examples completed successfully!');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
  } finally {
    // Clean up
    DebugToolkit.reset();
    console.log('\n🧹 Debug toolkit reset');
  }
}

// Export for use in other modules
export default {
  exampleBasicDebugging,
  exampleSimulation,
  exampleUserJourney,
  exampleDisconnectScenario,
  exampleChaosTest,
  examplePerformanceMonitoring,
  examplePredefinedScenarios,
  exampleEventReplay,
  runAllExamples
};