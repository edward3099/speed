/**
 * Apply migrations step by step
 * First creates helper function, then uses it to apply migrations
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

async function applySQL(sql) {
  // Try to execute via RPC exec_sql function
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql })
    
    if (error) {
      // If function doesn't exist, return error
      if (error.message.includes('function') && error.message.includes('not found')) {
        return { success: false, needsHelper: true, error: error.message }
      }
      return { success: false, error: error.message }
    }
    
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function main() {
  console.log('🚀 Step-by-step migration application\n')
  
  // Step 1: Create helper function
  const helperSQL = readFileSync(
    join(process.cwd(), 'supabase/migrations/blueprint/000_helper_exec_sql.sql'),
    'utf8'
  )
  
  console.log('📝 Step 1: Creating helper function...')
  console.log('⚠️  This requires manual application first:\n')
  console.log('='.repeat(60))
  console.log(helperSQL)
  console.log('='.repeat(60))
  console.log('\n📋 Please apply the helper function SQL above via SQL Editor first')
  console.log('   Then run this script again to apply migrations\n')
  
  // For now, try to apply migrations anyway (in case helper already exists)
  const sqlFile = join(process.cwd(), 'supabase/migrations/blueprint/ALL_MIGRATIONS_COMBINED.sql')
  const sql = readFileSync(sqlFile, 'utf8')
  
  console.log('📄 Attempting to apply migrations...')
  console.log(`📊 Size: ${(sql.length / 1024).toFixed(1)} KB\n`)
  
  // Split SQL into smaller chunks (by migration file boundaries)
  const migrations = [
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
  
  console.log(`📋 Found ${migrations.length} migration files\n`)
  
  // Try to apply each migration
  for (const migration of migrations) {
    const filePath = join(process.cwd(), 'supabase/migrations/blueprint', migration)
    try {
      const sql = readFileSync(filePath, 'utf8')
      console.log(`📄 Applying ${migration}...`)
      
      const result = await applySQL(sql)
      
      if (result.success) {
        console.log(`✅ ${migration} applied`)
      } else if (result.needsHelper) {
        console.log(`⚠️  Helper function needed - skipping ${migration}`)
        break
      } else {
        console.log(`❌ ${migration} failed: ${result.error}`)
        // Continue with next migration
      }
      
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error) {
      console.log(`❌ Error reading ${migration}: ${error.message}`)
    }
  }
  
  console.log('\n✅ Migration application complete (or helper function needed)')
}

main().catch(console.error)
