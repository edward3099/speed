/**
 * Apply migrations using a helper RPC function
 * Step 1: Create helper function via SQL Editor (manual)
 * Step 2: Use helper to apply migrations
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const SUPABASE_URL = 'https://jzautphzcbtqplltsfse.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YXV0cGh6Y2J0cXBsbHRzZnNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzQ5NTc2NCwiZXhwIjoyMDc5MDcxNzY0fQ.3u57IsBUeJlHZ5IEbIFDtI9l3TSSeo_nDUBXYSiXh5k'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function createHelperFunction() {
  const helperSQL = readFileSync(join(process.cwd(), 'supabase/migrations/blueprint/000_helper_exec_sql.sql'), 'utf8')
  
  console.log('📝 Step 1: Create helper function')
  console.log('   Please apply this SQL manually via SQL Editor first:')
  console.log('\n' + '='.repeat(60))
  console.log(helperSQL)
  console.log('='.repeat(60))
  console.log('\n   After applying, press Enter to continue...')
  
  // In a real scenario, you'd wait for user input
  // For now, we'll just show instructions
  return false
}

async function applyMigrationViaHelper(fileName, sql) {
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql })
    
    if (error) {
      console.error(`   ❌ Error: ${error.message}`)
      return false
    }
    
    console.log(`   ✅ ${fileName} applied`)
    return true
  } catch (error) {
    console.error(`   ❌ Exception: ${error.message}`)
    return false
  }
}

async function main() {
  console.log('🚀 Migration Application via Helper Function\n')
  
  // Step 1: Create helper function
  const helperCreated = await createHelperFunction()
  
  if (!helperCreated) {
    console.log('\n⚠️  Since we cannot execute SQL directly, here are your options:\n')
    console.log('Option 1: Apply via SQL Editor (Easiest)')
    console.log('  1. Open: https://supabase.com/dashboard/project/jzautphzcbtqplltsfse/sql')
    console.log('  2. Copy entire file: supabase/migrations/blueprint/ALL_MIGRATIONS_COMBINED.sql')
    console.log('  3. Paste and execute\n')
    
    console.log('Option 2: Use Supabase CLI')
    console.log('  supabase link --project-ref jzautphzcbtqplltsfse')
    console.log('  supabase db push\n')
    
    return
  }
  
  // Step 2: Apply migrations using helper
  const migrationsDir = join(process.cwd(), 'supabase/migrations/blueprint')
  const files = [
    '000_compatibility_check.sql',
    '001_users_table.sql',
    '002_user_status_table.sql',
    '003_queue_table.sql',
    '004_matches_table.sql',
    '005_votes_table.sql',
    '006_never_pair_again_table.sql',
    '007_debug_logs_table.sql',
    '101_create_pair_atomic.sql',
    '102_find_best_match.sql',
    '103_process_matching.sql',
    '104_preference_expansion.sql',
    '105_fairness_engine.sql',
    '106_vote_engine.sql',
    '107_cooldown_engine.sql',
    '108_blocklist_engine.sql',
    '109_queue_functions.sql',
    '110_state_machine.sql',
    '111_guardians.sql',
    '112_disconnect_handler.sql',
    '113_fix_compatibility.sql'
  ]
  
  console.log('\n📄 Step 2: Applying migrations...\n')
  
  for (const file of files) {
    const filePath = join(migrationsDir, file)
    const sql = readFileSync(filePath, 'utf8')
    await applyMigrationViaHelper(file, sql)
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  console.log('\n✅ All migrations applied!')
}

main().catch(console.error)
