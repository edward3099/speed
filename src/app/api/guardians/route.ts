import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * Guardian API Route
 * 
 * Provides endpoints to trigger guardian functions manually or check their status.
 * These guardians act as traffic controllers/wardens for the spinning logic.
 */

/**
 * POST /api/guardians
 * 
 * Triggers the master guardian orchestrator to run all guardians.
 * Use this for manual triggering or as a backup if pg_cron is unavailable.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('guardian_orchestrator');

    if (error) {
      console.error('Error in guardian orchestrator:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`Guardian orchestrator executed. Results:`, data);
    return NextResponse.json({ 
      message: 'Guardian orchestrator executed', 
      results: data 
    });
  } catch (e: any) {
    console.error('Unexpected error in guardian orchestrator API route:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * GET /api/guardians
 * 
 * Returns information about available guardians and their purposes.
 */
export async function GET(request: Request) {
  const guardians = [
    {
      name: 'guardian_ensure_no_failed_spins',
      purpose: 'Ensures no spin fails. Monitors users waiting >30 seconds and forces matching attempts.',
      invariant: 'Every spin leads to a pairing',
    },
    {
      name: 'guardian_enforce_state_transitions',
      purpose: 'Enforces proper state transitions. Corrects invalid states.',
      invariant: 'Proper state transitions (spin_active → queue_waiting → vote_active)',
    },
    {
      name: 'guardian_enforce_fairness',
      purpose: 'Enforces fairness. Boosts fairness scores for long-waiting users.',
      invariant: 'Fair matching for all users. Everyone eventually reaches front of queue.',
    },
    {
      name: 'guardian_prevent_duplicates',
      purpose: 'Prevents duplicates. Ensures no user appears for more than one person.',
      invariant: 'No user can appear for more than one person at the same time',
    },
    {
      name: 'guardian_enforce_voting_behavior',
      purpose: 'Enforces voting behavior. Applies priority boosts to yes voters.',
      invariant: 'Proper voting behavior with priority boosts',
    },
    {
      name: 'guardian_enforce_online_status',
      purpose: 'CRITICAL: Enforces online status. Breaks matches where one or both users are offline.',
      invariant: 'Users can only match with online users',
    },
    {
      name: 'guardian_enforce_preference_expansion',
      purpose: 'Enforces preference expansion. Triggers expansion for users waiting >60 seconds.',
      invariant: 'Preferences expand only when needed and in small steps',
    },
    {
      name: 'guardian_orchestrator',
      purpose: 'Master orchestrator. Runs all guardians in optimal order.',
      invariant: 'All spinning logic invariants are enforced',
    },
  ];

  return NextResponse.json({
    guardians,
    schedule: 'Master guardian orchestrator runs every 10 seconds via pg_cron',
    manual_trigger: 'POST /api/guardians to trigger manually',
  });
}

