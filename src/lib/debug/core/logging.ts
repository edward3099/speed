/**
 * Module 2: Structured Logging Engine
 * Provides structured logging with before/after state tracking
 */

import { debugState } from './state';

export interface LogEntry {
  id: string;
  timestamp: string;
  timestampMs: number;
  type: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  user?: string;
  beforeState?: any;
  afterState?: any;
  metadata?: any;
  error?: any;
  duration?: number;
}

class LoggingEngine {
  private static instance: LoggingEngine;
  private logs: LogEntry[] = [];
  private maxMemoryLogs: number = 10000;
  private logFile: string | null = null;
  private writeStream: any = null;
  private enableFileLogging: boolean = false;
  
  private constructor() {
    // File logging disabled for client-side compatibility
    // Can be enabled server-side if needed
    this.enableFileLogging = false;
  }
  
  static getInstance(): LoggingEngine {
    if (!LoggingEngine.instance) {
      LoggingEngine.instance = new LoggingEngine();
    }
    return LoggingEngine.instance;
  }
  
  private initFileLogging() {
    // File logging disabled for client-side compatibility
    // This would be implemented server-side if needed
  }
  
  private createLogEntry(
    type: string,
    level: LogEntry['level'],
    data: Partial<LogEntry>
  ): LogEntry {
    const now = Date.now();
    return {
      id: `log_${now}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(now).toISOString(),
      timestampMs: now,
      type,
      level,
      ...data
    };
  }
  
  private writeToFile(entry: LogEntry) {
    // File logging disabled for client-side compatibility
    // Logs are stored in memory only
  }
  
  private addLog(entry: LogEntry) {
    // Add to memory
    this.logs.push(entry);
    
    // Trim if exceeded max
    if (this.logs.length > this.maxMemoryLogs) {
      this.logs = this.logs.slice(-this.maxMemoryLogs);
    }
    
    // Write to file
    this.writeToFile(entry);
    
    // Console output in development
    if (typeof window !== 'undefined' && (process.env.NODE_ENV === 'development' || true)) {
      const output = {
        type: entry.type,
        level: entry.level,
        timestamp: entry.timestamp,
        ...(entry.user && { user: entry.user }),
        ...(entry.metadata && { metadata: entry.metadata }),
        ...(entry.error && { error: entry.error })
      };
      
      switch (entry.level) {
        case 'error':
          console.error('[DEBUG]', output);
          break;
        case 'warn':
          console.warn('[DEBUG]', output);
          break;
        case 'debug':
          console.debug('[DEBUG]', output);
          break;
        default:
          console.log('[DEBUG]', output);
      }
    }
  }
  
  logEvent(data: {
    type: string;
    user?: string;
    timestamp?: string;
    beforeState?: any;
    afterState?: any;
    metadata?: any;
  }) {
    const entry = this.createLogEntry(data.type, 'info', {
      user: data.user,
      beforeState: data.beforeState,
      afterState: data.afterState,
      metadata: data.metadata,
      timestamp: data.timestamp || new Date().toISOString()
    });
    
    this.addLog(entry);
    return entry;
  }
  
  logError(data: {
    type: string;
    error: any;
    user?: string;
    beforeState?: any;
    afterState?: any;
    metadata?: any;
  }) {
    const entry = this.createLogEntry(data.type, 'error', {
      user: data.user,
      error: data.error instanceof Error ? {
        message: data.error.message,
        stack: data.error.stack,
        name: data.error.name
      } : data.error,
      beforeState: data.beforeState,
      afterState: data.afterState,
      metadata: data.metadata
    });
    
    this.addLog(entry);
    return entry;
  }
  
  logDebug(data: {
    type: string;
    message?: string;
    user?: string;
    metadata?: any;
  }) {
    const entry = this.createLogEntry(data.type, 'debug', {
      user: data.user,
      metadata: {
        message: data.message,
        ...data.metadata
      }
    });
    
    this.addLog(entry);
    return entry;
  }
  
  getLogs(limit?: number): LogEntry[] {
    if (limit) {
      return this.logs.slice(-limit);
    }
    return [...this.logs];
  }
  
  getLogsByType(type: string, limit?: number): LogEntry[] {
    const filtered = this.logs.filter(log => log.type === type);
    if (limit) {
      return filtered.slice(-limit);
    }
    return filtered;
  }
  
  getLogsByUser(userId: string, limit?: number): LogEntry[] {
    const filtered = this.logs.filter(log => log.user === userId);
    if (limit) {
      return filtered.slice(-limit);
    }
    return filtered;
  }
  
  getErrors(limit?: number): LogEntry[] {
    const filtered = this.logs.filter(log => log.level === 'error');
    if (limit) {
      return filtered.slice(-limit);
    }
    return filtered;
  }
  
  clearLogs() {
    this.logs = [];
  }
  
  async flushToFile(): Promise<void> {
    return new Promise((resolve) => {
      if (this.writeStream) {
        this.writeStream.once('drain', resolve);
        if (!this.writeStream.write('')) {
          // Already resolved via drain event
        } else {
          resolve();
        }
      } else {
        resolve();
      }
    });
  }
  
  close() {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }
}

// Export singleton instance methods
const logger = LoggingEngine.getInstance();

export const logEvent = logger.logEvent.bind(logger);
export const logError = logger.logError.bind(logger);
export const logDebug = logger.logDebug.bind(logger);
export const getLogs = logger.getLogs.bind(logger);
export const getLogsByType = logger.getLogsByType.bind(logger);
export const getLogsByUser = logger.getLogsByUser.bind(logger);
export const getErrors = logger.getErrors.bind(logger);
export const clearLogs = logger.clearLogs.bind(logger);
export const flushLogsToFile = logger.flushToFile.bind(logger);

// Helper function to log with state capture
export function logWithState(
  type: string,
  user?: string,
  metadata?: any
): { beforeState: any; logEntry: LogEntry } {
  const beforeState = debugState();
  
  const logEntry = logEvent({
    type,
    user,
    beforeState,
    metadata
  });
  
  return { beforeState, logEntry };
}

// Helper to log after state change
export function logAfterState(
  logEntryId: string,
  afterState?: any
) {
  const logs = logger.getLogs();
  const entry = logs.find(l => l.id === logEntryId);
  
  if (entry) {
    entry.afterState = afterState || debugState();
    entry.duration = Date.now() - entry.timestampMs;
  }
}

export default logger;