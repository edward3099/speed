/**
 * Module 5: Simulated Multi-User Environment
 * Create and run scripted scenarios for multiple users
 */

import { 
  engineState, 
  debugState, 
  addToQueue, 
  createPair, 
  recordVote,
  updateHeartbeat,
  setUserState
} from '../core/state';
import { logEvent, logError, logDebug } from '../core/logging';
import { captureEvent } from '../core/snapshots';
import { validateAfterEvent } from '../core/validators';

export interface SimulationEvent {
  type: 'spin' | 'vote' | 'disconnect' | 'reconnect' | 'heartbeat' | 'idle' | 'respin' | 'timeout';
  user: string | number;
  value?: any;
  delay?: number; // Milliseconds to wait before executing
  metadata?: any;
}

export interface SimulationScenario {
  name: string;
  description: string;
  events: SimulationEvent[];
  expectations?: any;
}

export interface SimulationResult {
  scenarioName: string;
  success: boolean;
  eventsProcessed: number;
  errors: any[];
  finalState: any;
  duration: number;
  validationResults: any[];
}

class MatchingSimulator {
  private static instance: MatchingSimulator;
  private isRunning: boolean = false;
  private currentScenario: string | null = null;
  private eventLog: any[] = [];
  private seed: number | null = null;
  
  private constructor() {}
  
  static getInstance(): MatchingSimulator {
    if (!MatchingSimulator.instance) {
      MatchingSimulator.instance = new MatchingSimulator();
    }
    return MatchingSimulator.instance;
  }
  
  /**
   * Process a single simulation event
   */
  private async processEvent(event: SimulationEvent): Promise<any> {
    const userId = String(event.user);
    
    // Wait if delay specified
    if (event.delay) {
      await this.wait(event.delay);
    }
    
    // Capture the event with state snapshots
    return captureEvent(
      event.type,
      userId,
      async () => {
        switch (event.type) {
          case 'spin':
            return this.handleSpin(userId, event.metadata);
            
          case 'vote':
            return this.handleVote(userId, event.value || 'yes');
            
          case 'disconnect':
            return this.handleDisconnect(userId);
            
          case 'reconnect':
            return this.handleReconnect(userId);
            
          case 'heartbeat':
            return this.handleHeartbeat(userId);
            
          case 'idle':
            return this.handleIdle(userId);
            
          case 'respin':
            return this.handleRespin(userId);
            
          case 'timeout':
            return this.handleTimeout(userId, event.value);
            
          default:
            throw new Error(`Unknown event type: ${event.type}`);
        }
      },
      event.metadata
    );
  }
  
  /**
   * Handle spin event
   */
  private handleSpin(userId: string, metadata?: any) {
    // Check if user is already in queue or paired
    if (engineState.queue.has(userId)) {
      throw new Error(`User ${userId} already in queue`);
    }
    
    if (engineState.locks.has(userId)) {
      throw new Error(`User ${userId} is locked: ${engineState.locks.get(userId)}`);
    }
    
    // Add to queue
    addToQueue(userId, metadata?.preferences);
    
    // Try to match immediately
    this.attemptMatch(userId);
    
    return {
      userId,
      action: 'spin',
      queued: true,
      matched: engineState.voteActive.has(userId)
    };
  }
  
  /**
   * Handle vote event
   */
  private handleVote(userId: string, value: 'yes' | 'pass') {
    const pairId = engineState.voteActive.get(userId);
    
    if (!pairId) {
      throw new Error(`User ${userId} is not in voting state`);
    }
    
    const pair = engineState.pairs.get(pairId);
    if (!pair) {
      throw new Error(`Pair ${pairId} not found`);
    }
    
    // Record vote
    recordVote(userId, value);
    
    // Check if both voted
    const otherUserId = pair.user1 === userId ? pair.user2 : pair.user1;
    const otherVote = pair.votes?.[otherUserId];
    
    if (otherVote) {
      // Both have voted
      if (value === 'yes' && otherVote === 'yes') {
        // Move to video
        this.moveToVideo(pairId);
      } else {
        // End pairing, return to queue
        this.endPairing(pairId);
      }
    }
    
    return {
      userId,
      action: 'vote',
      value,
      pairId,
      bothVoted: !!otherVote
    };
  }
  
  /**
   * Handle disconnect event
   */
  private handleDisconnect(userId: string) {
    // Mark as disconnected
    engineState.userStates.set(userId, 'disconnected');
    engineState.heartbeat.delete(userId);
    
    // Handle based on current state
    const pairId = engineState.voteActive.get(userId) || engineState.videoActive.get(userId);
    
    if (pairId) {
      const pair = engineState.pairs.get(pairId);
      if (pair) {
        // Notify partner
        const partnerId = pair.user1 === userId ? pair.user2 : pair.user1;
        logEvent({
          type: 'partner_disconnected',
          user: partnerId,
          metadata: { disconnectedUser: userId, pairId }
        });
        
        // End pairing after timeout
        this.scheduleTimeout('disconnect', pairId, 5000);
      }
    }
    
    return {
      userId,
      action: 'disconnect',
      wasInPair: !!pairId
    };
  }
  
  /**
   * Handle reconnect event
   */
  private handleReconnect(userId: string) {
    const previousState = engineState.userStates.get(userId);
    
    if (previousState !== 'disconnected') {
      throw new Error(`User ${userId} was not disconnected`);
    }
    
    // Restore heartbeat
    updateHeartbeat(userId);
    
    // Check if still in a pair
    const pairId = engineState.voteActive.get(userId) || engineState.videoActive.get(userId);
    
    if (pairId) {
      // Rejoin pair
      setUserState(userId, engineState.videoActive.has(userId) ? 'video' : 'voting');
    } else {
      // Return to queue
      setUserState(userId, 'idle');
    }
    
    return {
      userId,
      action: 'reconnect',
      rejoinedPair: !!pairId
    };
  }
  
  /**
   * Handle heartbeat event
   */
  private handleHeartbeat(userId: string) {
    updateHeartbeat(userId);
    
    return {
      userId,
      action: 'heartbeat',
      timestamp: Date.now()
    };
  }
  
  /**
   * Handle idle event
   */
  private handleIdle(userId: string) {
    engineState.idle.set(userId, Date.now());
    setUserState(userId, 'idle');
    
    return {
      userId,
      action: 'idle'
    };
  }
  
  /**
   * Handle respin event
   */
  private handleRespin(userId: string) {
    const pairId = engineState.voteActive.get(userId);
    
    if (!pairId) {
      // User not in vote, just spin
      return this.handleSpin(userId);
    }
    
    // Vote pass and respin
    this.handleVote(userId, 'pass');
    
    // Add back to queue
    return this.handleSpin(userId);
  }
  
  /**
   * Handle timeout event
   */
  private handleTimeout(userId: string, timeoutType?: string) {
    const type = timeoutType || 'vote';
    
    switch (type) {
      case 'vote':
        const pairId = engineState.voteActive.get(userId);
        if (pairId) {
          this.endPairing(pairId);
        }
        break;
        
      case 'disconnect':
        // Force disconnect cleanup
        engineState.queue.delete(userId);
        engineState.locks.delete(userId);
        engineState.heartbeat.delete(userId);
        break;
    }
    
    return {
      userId,
      action: 'timeout',
      type
    };
  }
  
  /**
   * Attempt to match a user
   */
  private attemptMatch(userId: string) {
    // Find available partner in queue
    const availableUsers = Array.from(engineState.queue.keys())
      .filter(id => id !== userId && !engineState.locks.has(id));
    
    if (availableUsers.length > 0) {
      // Simple matching - just take first available
      const partnerId = availableUsers[0];
      
      // Create pair
      const pairId = createPair(userId, partnerId);
      
      logEvent({
        type: 'match_created',
        user: userId,
        metadata: { partnerId, pairId }
      });
    }
  }
  
  /**
   * Move pair to video state
   */
  private moveToVideo(pairId: string) {
    const pair = engineState.pairs.get(pairId);
    if (!pair) return;
    
    pair.status = 'video';
    engineState.voteActive.delete(pair.user1);
    engineState.voteActive.delete(pair.user2);
    engineState.videoActive.set(pair.user1, pairId);
    engineState.videoActive.set(pair.user2, pairId);
    setUserState(pair.user1, 'video');
    setUserState(pair.user2, 'video');
    
    // Schedule video end
    this.scheduleTimeout('video', pairId, 180000); // 3 minutes
  }
  
  /**
   * End a pairing
   */
  private endPairing(pairId: string) {
    const pair = engineState.pairs.get(pairId);
    if (!pair) return;
    
    // Clean up state
    engineState.voteActive.delete(pair.user1);
    engineState.voteActive.delete(pair.user2);
    engineState.videoActive.delete(pair.user1);
    engineState.videoActive.delete(pair.user2);
    engineState.locks.delete(pair.user1);
    engineState.locks.delete(pair.user2);
    
    // Mark pair as ended
    pair.status = 'ended';
    
    // Users return to idle
    setUserState(pair.user1, 'idle');
    setUserState(pair.user2, 'idle');
  }
  
  /**
   * Schedule a timeout
   */
  private scheduleTimeout(type: string, targetId: string, delay: number) {
    const timerId = `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    engineState.timers.set(timerId, {
      id: timerId,
      type: type as any,
      expiresAt: new Date(Date.now() + delay).toISOString(),
      pairId: targetId
    });
    
    // In simulation, we don't actually set timeouts
    // Real implementation would use setTimeout
  }
  
  /**
   * Run a simulation scenario
   */
  async simulate(events: SimulationEvent[]): Promise<SimulationResult> {
    if (this.isRunning) {
      throw new Error('Simulation already running');
    }
    
    this.isRunning = true;
    this.eventLog = [];
    const startTime = Date.now();
    const errors: any[] = [];
    const validationResults: any[] = [];
    
    // Reset state
    engineState.reset();
    
    // Process events
    let eventsProcessed = 0;
    
    for (const event of events) {
      try {
        logDebug({
          type: 'simulation_event',
          message: `Processing ${event.type} for user ${event.user}`,
          metadata: event
        });
        
        const result = await this.processEvent(event);
        
        this.eventLog.push({
          event,
          result,
          timestamp: Date.now()
        });
        
        eventsProcessed++;
        
        // Validate after each event
        const validation = validateAfterEvent(
          event.type,
          result.snapshot.beforeState,
          result.snapshot.afterState
        );
        
        validationResults.push(validation);
        
        if (!validation.isValid) {
          console.error(`Validation failed after event ${event.type}:`, validation.errors);
        }
        
      } catch (error) {
        errors.push({
          event,
          error: error instanceof Error ? error.message : error,
          eventIndex: eventsProcessed
        });
        
        logError({
          type: 'simulation_error',
          error,
          user: String(event.user),
          metadata: { event }
        });
      }
    }
    
    const finalState = debugState();
    const duration = Date.now() - startTime;
    
    this.isRunning = false;
    
    return {
      scenarioName: 'custom',
      success: errors.length === 0,
      eventsProcessed,
      errors,
      finalState,
      duration,
      validationResults
    };
  }
  
  /**
   * Run a named scenario
   */
  async runScenario(scenario: SimulationScenario): Promise<SimulationResult> {
    this.currentScenario = scenario.name;
    
    logEvent({
      type: 'scenario_start',
      metadata: {
        name: scenario.name,
        description: scenario.description,
        eventCount: scenario.events.length
      }
    });
    
    const result = await this.simulate(scenario.events);
    
    // Check expectations if provided
    if (scenario.expectations) {
      this.checkExpectations(result.finalState, scenario.expectations);
    }
    
    this.currentScenario = null;
    
    return {
      ...result,
      scenarioName: scenario.name
    };
  }
  
  /**
   * Generate random chaos events
   */
  generateChaosEvents(userCount: number, eventCount: number): SimulationEvent[] {
    const events: SimulationEvent[] = [];
    const users = Array.from({ length: userCount }, (_, i) => i + 1);
    
    for (let i = 0; i < eventCount; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const eventTypes: SimulationEvent['type'][] = [
        'spin', 'vote', 'disconnect', 'reconnect', 'heartbeat', 'idle', 'respin'
      ];
      const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      
      const event: SimulationEvent = { type, user };
      
      if (type === 'vote') {
        event.value = Math.random() > 0.5 ? 'yes' : 'pass';
      }
      
      // Random delay between 0-1000ms
      event.delay = Math.floor(Math.random() * 1000);
      
      events.push(event);
    }
    
    return events;
  }
  
  /**
   * Run chaos simulation
   */
  async runChaos(userCount: number = 10, eventCount: number = 100): Promise<SimulationResult> {
    const events = this.generateChaosEvents(userCount, eventCount);
    
    logEvent({
      type: 'chaos_simulation_start',
      metadata: {
        userCount,
        eventCount,
        seed: this.seed
      }
    });
    
    return this.simulate(events);
  }
  
  /**
   * Set random seed for deterministic chaos
   */
  setSeed(seed: number) {
    this.seed = seed;
    // In a real implementation, this would seed the random number generator
  }
  
  /**
   * Check expectations against final state
   */
  private checkExpectations(state: any, expectations: any) {
    const results: any[] = [];
    
    for (const [key, expected] of Object.entries(expectations)) {
      const actual = state[key];
      const passed = JSON.stringify(actual) === JSON.stringify(expected);
      
      results.push({
        key,
        expected,
        actual,
        passed
      });
      
      if (!passed) {
        logError({
          type: 'expectation_failed',
          error: `Expected ${key} to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
          metadata: { key, expected, actual }
        });
      }
    }
    
    return results;
  }
  
  /**
   * Helper to wait
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get event log
   */
  getEventLog(): any[] {
    return [...this.eventLog];
  }
  
  /**
   * Clear event log
   */
  clearEventLog() {
    this.eventLog = [];
  }
}

// Export singleton instance
const simulator = MatchingSimulator.getInstance();

export const simulate = simulator.simulate.bind(simulator);
export const runScenario = simulator.runScenario.bind(simulator);
export const runChaos = simulator.runChaos.bind(simulator);
export const generateChaosEvents = simulator.generateChaosEvents.bind(simulator);
export const setSeed = simulator.setSeed.bind(simulator);
export const getSimulationEventLog = simulator.getEventLog.bind(simulator);
export const clearSimulationEventLog = simulator.clearEventLog.bind(simulator);

// Export pre-defined scenarios
export const scenarios = {
  basicMatch: {
    name: 'basic_match',
    description: 'Two users spin and match',
    events: [
      { type: 'spin', user: 1 },
      { type: 'spin', user: 2 },
      { type: 'vote', user: 1, value: 'yes' },
      { type: 'vote', user: 2, value: 'yes' }
    ]
  } as SimulationScenario,
  
  respinScenario: {
    name: 'respin_flow',
    description: 'User votes pass and respins',
    events: [
      { type: 'spin', user: 1 },
      { type: 'spin', user: 2 },
      { type: 'vote', user: 1, value: 'pass' },
      { type: 'spin', user: 1 },
      { type: 'spin', user: 3 }
    ]
  } as SimulationScenario,
  
  disconnectReconnect: {
    name: 'disconnect_reconnect',
    description: 'User disconnects and reconnects during vote',
    events: [
      { type: 'spin', user: 1 },
      { type: 'spin', user: 2 },
      { type: 'disconnect', user: 2 },
      { type: 'reconnect', user: 2, delay: 2000 },
      { type: 'vote', user: 1, value: 'yes' },
      { type: 'vote', user: 2, value: 'yes' }
    ]
  } as SimulationScenario,
  
  multipleMatches: {
    name: 'multiple_matches',
    description: 'Multiple users spinning and matching',
    events: [
      { type: 'spin', user: 1 },
      { type: 'spin', user: 2 },
      { type: 'spin', user: 3 },
      { type: 'spin', user: 4 },
      { type: 'vote', user: 1, value: 'yes' },
      { type: 'vote', user: 2, value: 'yes' },
      { type: 'vote', user: 3, value: 'pass' },
      { type: 'spin', user: 3 },
      { type: 'spin', user: 5 }
    ]
  } as SimulationScenario
};

export default simulator;