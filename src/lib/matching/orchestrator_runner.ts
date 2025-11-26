/**
 * Orchestrator Runner Helper
 * 
 * Wrapper functions for running the matching orchestrator
 * Handles scheduling and execution of matching processes
 */

import { createClient } from '@/lib/supabase/server';

export interface OrchestratorResult {
  status: 'success' | 'locked' | 'error';
  tier1_processed?: number;
  tier2_processed?: number;
  tier3_processed?: number;
  total_processed?: number;
  message?: string;
}

/**
 * Run the matching orchestrator
 * 
 * This function processes users in the queue by fairness tiers
 * and attempts to match them using the unified matching engine
 * 
 * @returns Orchestrator result
 */
export async function runMatchingOrchestrator(): Promise<OrchestratorResult> {
  const supabase = await createClient();
  
  const { data, error } = await supabase.rpc('matching_orchestrator');

  if (error) {
    // Check if it's a lock error (another process is running)
    if (error.message?.includes('locked') || error.message?.includes('running')) {
      return {
        status: 'locked',
        message: 'Another matching process is running'
      };
    }

    console.error('Error running matching orchestrator:', error);
    return {
      status: 'error',
      message: error.message || 'Failed to run matching orchestrator'
    };
  }

  // Parse the result
  if (data?.status === 'locked') {
    return {
      status: 'locked',
      message: data.message || 'Another matching process is running'
    };
  }

  return {
    status: 'success',
    tier1_processed: data?.tier1_processed || 0,
    tier2_processed: data?.tier2_processed || 0,
    tier3_processed: data?.tier3_processed || 0,
    total_processed: data?.total_processed || 0,
    message: 'Matching orchestrator completed successfully'
  };
}

/**
 * Check if matching orchestrator is available
 * 
 * @returns True if orchestrator can be run
 */
export async function isOrchestratorAvailable(): Promise<boolean> {
  try {
    const result = await runMatchingOrchestrator();
    // If we get 'locked', that means the function exists and works
    return result.status === 'locked' || result.status === 'success';
  } catch (error) {
    return false;
  }
}

/**
 * Run orchestrator with retry logic
 * 
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param retryDelay - Delay between retries in ms (default: 1000)
 * @returns Orchestrator result
 */
export async function runOrchestratorWithRetry(
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<OrchestratorResult> {
  let lastError: OrchestratorResult | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await runMatchingOrchestrator();

    if (result.status === 'success') {
      return result;
    }

    if (result.status === 'locked') {
      // If locked, wait and retry
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
    }

    lastError = result;
  }

  return lastError || {
    status: 'error',
    message: 'Failed after retries'
  };
}

