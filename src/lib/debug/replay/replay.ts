/**
 * Module 6: Event Replay Engine
 * Read log files and replay events to reconstruct state
 */

import { engineState, debugState } from '../core/state';
import { logEvent, logError, LogEntry } from '../core/logging';
import { SimulationEvent } from '../simulation/simulator';
import { validateState } from '../core/validators';

export interface ReplayOptions {
  validateEachStep?: boolean;
  stopOnError?: boolean;
  compareSnapshots?: boolean;
  verbose?: boolean;
}

export interface ReplayResult {
  success: boolean;
  eventsReplayed: number;
  errors: ReplayError[];
  divergences: StateDivergence[];
  finalState: any;
  duration: number;
}

export interface ReplayError {
  eventIndex: number;
  event: LogEntry;
  error: string;
  expectedState?: any;
  actualState?: any;
}

export interface StateDivergence {
  eventIndex: number;
  event: LogEntry;
  field: string;
  expected: any;
  actual: any;
}

class EventReplayEngine {
  private static instance: EventReplayEngine;
  private isReplaying: boolean = false;
  private replayLog: any[] = [];
  
  private constructor() {}
  
  static getInstance(): EventReplayEngine {
    if (!EventReplayEngine.instance) {
      EventReplayEngine.instance = new EventReplayEngine();
    }
    return EventReplayEngine.instance;
  }
  
  /**
   * Read log file and parse events
   */
  private async readLogFile(logFile: string): Promise<LogEntry[]> {
    return new Promise((resolve, reject) => {
      const events: LogEntry[] = [];
      const fileStream = fs.createReadStream(logFile);
      
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      rl.on('line', (line) => {
        try {
          if (line.trim()) {
            const entry = JSON.parse(line) as LogEntry;
            events.push(entry);
          }
        } catch (err) {
          console.error('Failed to parse log line:', line, err);
        }
      });
      
      rl.on('close', () => {
        resolve(events);
      });
      
      rl.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  /**
   * Replay a single event
   */
  private replayEvent(entry: LogEntry): any {
    // Extract event details
    const { type, user, metadata } = entry;
    
    // Apply state changes based on event type
    switch (type) {
      case 'spin':
      case 'spinStart':
        if (user) {
          engineState.queue.set(user, {
            userId: user,
            joinedAt: entry.timestamp,
            preferences: metadata?.preferences || {},
            fairnessScore: 0,
            status: 'waiting'
          });
          engineState.userStates.set(user, 'queue');
        }
        break;
        
      case 'match_created':
        if (metadata?.pairId && user && metadata?.partnerId) {
          engineState.pairs.set(metadata.pairId, {
            id: metadata.pairId,
            user1: user,
            user2: metadata.partnerId,
            createdAt: entry.timestamp,
            status: 'voting',
            votes: {
              [user]: null,
              [metadata.partnerId]: null
            }
          });
          engineState.queue.delete(user);
          engineState.queue.delete(metadata.partnerId);
          engineState.voteActive.set(user, metadata.pairId);
          engineState.voteActive.set(metadata.partnerId, metadata.pairId);
          engineState.userStates.set(user, 'voting');
          engineState.userStates.set(metadata.partnerId, 'voting');
        }
        break;
        
      case 'vote':
        if (user && metadata?.value) {
          const pairId = engineState.voteActive.get(user);
          if (pairId) {
            const pair = engineState.pairs.get(pairId);
            if (pair && pair.votes) {
              pair.votes[user] = metadata.value;
            }
          }
        }
        break;
        
      case 'disconnect':
        if (user) {
          engineState.userStates.set(user, 'disconnected');
          engineState.heartbeat.delete(user);
        }
        break;
        
      case 'reconnect':
        if (user) {
          engineState.heartbeat.set(user, entry.timestampMs);
          const pairId = engineState.voteActive.get(user) || engineState.videoActive.get(user);
          if (pairId) {
            engineState.userStates.set(user, engineState.videoActive.has(user) ? 'video' : 'voting');
          } else {
            engineState.userStates.set(user, 'idle');
          }
        }
        break;
        
      case 'heartbeat':
        if (user) {
          engineState.heartbeat.set(user, entry.timestampMs);
        }
        break;
        
      case 'video_start':
        if (metadata?.pairId) {
          const pair = engineState.pairs.get(metadata.pairId);
          if (pair) {
            pair.status = 'video';
            engineState.voteActive.delete(pair.user1);
            engineState.voteActive.delete(pair.user2);
            engineState.videoActive.set(pair.user1, metadata.pairId);
            engineState.videoActive.set(pair.user2, metadata.pairId);
            engineState.userStates.set(pair.user1, 'video');
            engineState.userStates.set(pair.user2, 'video');
          }
        }
        break;
        
      case 'pair_ended':
        if (metadata?.pairId) {
          const pair = engineState.pairs.get(metadata.pairId);
          if (pair) {
            pair.status = 'ended';
            engineState.voteActive.delete(pair.user1);
            engineState.voteActive.delete(pair.user2);
            engineState.videoActive.delete(pair.user1);
            engineState.videoActive.delete(pair.user2);
            engineState.locks.delete(pair.user1);
            engineState.locks.delete(pair.user2);
            engineState.userStates.set(pair.user1, 'idle');
            engineState.userStates.set(pair.user2, 'idle');
          }
        }
        break;
    }
    
    return debugState();
  }
  
  /**
   * Compare two states for divergence
   */
  private compareStates(expected: any, actual: any): StateDivergence[] {
    const divergences: StateDivergence[] = [];
    
    // Helper to deep compare
    const compare = (exp: any, act: any, path: string) => {
      if (typeof exp !== typeof act) {
        return false;
      }
      
      if (typeof exp === 'object' && exp !== null && act !== null) {
        if (Array.isArray(exp) && Array.isArray(act)) {
          if (exp.length !== act.length) {
            return false;
          }
          for (let i = 0; i < exp.length; i++) {
            if (!compare(exp[i], act[i], `${path}[${i}]`)) {
              return false;
            }
          }
        } else {
          const expKeys = Object.keys(exp).sort();
          const actKeys = Object.keys(act).sort();
          
          if (expKeys.join(',') !== actKeys.join(',')) {
            return false;
          }
          
          for (const key of expKeys) {
            if (!compare(exp[key], act[key], `${path}.${key}`)) {
              return false;
            }
          }
        }
        return true;
      }
      
      return exp === act;
    };
    
    // Check main state fields
    const fields = ['queue', 'pairs', 'voteActive', 'videoActive', 'locks', 'userStates'];
    
    for (const field of fields) {
      if (!compare(expected[field], actual[field], field)) {
        divergences.push({
          eventIndex: -1,
          event: {} as LogEntry,
          field,
          expected: expected[field],
          actual: actual[field]
        });
      }
    }
    
    return divergences;
  }
  
  /**
   * Main replay function
   */
  async replay(logFile: string, options: ReplayOptions = {}): Promise<ReplayResult> {
    if (this.isReplaying) {
      throw new Error('Replay already in progress');
    }
    
    const {
      validateEachStep = true,
      stopOnError = false,
      compareSnapshots = true,
      verbose = false
    } = options;
    
    this.isReplaying = true;
    this.replayLog = [];
    
    const startTime = Date.now();
    const errors: ReplayError[] = [];
    const divergences: StateDivergence[] = [];
    
    try {
      // Reset state
      engineState.reset();
      
      // Read log file
      const events = await this.readLogFile(logFile);
      
      if (verbose) {
        console.log(`Replaying ${events.length} events from ${logFile}`);
      }
      
      let eventsReplayed = 0;
      
      for (let i = 0; i < events.length; i++) {
        const entry = events[i];
        
        try {
          // Replay the event
          const actualState = this.replayEvent(entry);
          
          // Validate if requested
          if (validateEachStep) {
            const validation = validateState(undefined, actualState);
            if (!validation.isValid) {
              errors.push({
                eventIndex: i,
                event: entry,
                error: `Validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
                actualState
              });
              
              if (stopOnError) {
                break;
              }
            }
          }
          
          // Compare with logged snapshot if available
          if (compareSnapshots && entry.afterState) {
            const divs = this.compareStates(entry.afterState, actualState);
            if (divs.length > 0) {
              divs.forEach(d => {
                d.eventIndex = i;
                d.event = entry;
                divergences.push(d);
              });
              
              if (stopOnError) {
                errors.push({
                  eventIndex: i,
                  event: entry,
                  error: 'State divergence detected',
                  expectedState: entry.afterState,
                  actualState
                });
                break;
              }
            }
          }
          
          eventsReplayed++;
          
          this.replayLog.push({
            index: i,
            event: entry,
            replayedState: actualState,
            success: true
          });
          
        } catch (err) {
          const error: ReplayError = {
            eventIndex: i,
            event: entry,
            error: err instanceof Error ? err.message : String(err)
          };
          
          errors.push(error);
          
          this.replayLog.push({
            index: i,
            event: entry,
            error,
            success: false
          });
          
          if (stopOnError) {
            break;
          }
        }
      }
      
      const finalState = debugState();
      const duration = Date.now() - startTime;
      
      if (verbose) {
        console.log(`Replay completed: ${eventsReplayed}/${events.length} events`);
        if (errors.length > 0) {
          console.error(`${errors.length} errors encountered`);
        }
        if (divergences.length > 0) {
          console.warn(`${divergences.length} divergences detected`);
        }
      }
      
      return {
        success: errors.length === 0 && divergences.length === 0,
        eventsReplayed,
        errors,
        divergences,
        finalState,
        duration
      };
      
    } finally {
      this.isReplaying = false;
    }
  }
  
  /**
   * Replay from memory (array of events)
   */
  async replayFromMemory(events: LogEntry[], options: ReplayOptions = {}): Promise<ReplayResult> {
    if (this.isReplaying) {
      throw new Error('Replay already in progress');
    }
    
    // Create temporary file
    const tempFile = path.join(process.cwd(), 'logs', `temp_replay_${Date.now()}.jsonl`);
    
    try {
      // Write events to temp file
      const stream = fs.createWriteStream(tempFile);
      for (const event of events) {
        stream.write(JSON.stringify(event) + '\n');
      }
      stream.end();
      
      // Wait for stream to finish
      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });
      
      // Replay from temp file
      return await this.replay(tempFile, options);
      
    } finally {
      // Clean up temp file
      // Client-side: File deletion not supported
      // if (tempFile && fs.existsSync(tempFile)) {
      //   fs.unlinkSync(tempFile);
      // }
    }
  }
  
  /**
   * Compare two replay results
   */
  compareReplays(replay1: ReplayResult, replay2: ReplayResult): any {
    return {
      eventsMatched: replay1.eventsReplayed === replay2.eventsReplayed,
      successMatched: replay1.success === replay2.success,
      errorCountMatched: replay1.errors.length === replay2.errors.length,
      divergenceCountMatched: replay1.divergences.length === replay2.divergences.length,
      finalStateMatched: JSON.stringify(replay1.finalState) === JSON.stringify(replay2.finalState),
      durationDiff: replay2.duration - replay1.duration
    };
  }
  
  /**
   * Get replay log
   */
  getReplayLog(): any[] {
    return [...this.replayLog];
  }
  
  /**
   * Clear replay log
   */
  clearReplayLog() {
    this.replayLog = [];
  }
  
  /**
   * Check if currently replaying
   */
  isCurrentlyReplaying(): boolean {
    return this.isReplaying;
  }
}

// Export singleton instance
const replayEngine = EventReplayEngine.getInstance();

export const replay = replayEngine.replay.bind(replayEngine);
export const replayFromMemory = replayEngine.replayFromMemory.bind(replayEngine);
export const compareReplays = replayEngine.compareReplays.bind(replayEngine);
export const getReplayLog = replayEngine.getReplayLog.bind(replayEngine);
export const clearReplayLog = replayEngine.clearReplayLog.bind(replayEngine);
export const isReplaying = replayEngine.isCurrentlyReplaying.bind(replayEngine);

export default replayEngine;