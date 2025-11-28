/**
 * Apply migrations directly to Supabase using service role key
 * Uses exec_sql helper function
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { readdirSync } from 'fs'
import { join } from 'path'

const SUPABASE_URL = 'https://jzautphzcbtqplltsfse.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YXV0cGh6Y2J0cXBsbHRzZnNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzQ5NTc2NCwiZXhwIjoyMDc5MDcxNzY0fQ.3u57IsBUeJlHZ5IEbIFDtI9l3TSSeo_nDUBXYSiXh5k'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function applyMigration(filePath, fileName) {
  const sql = readFileSync(filePath, 'utf8')
  
  console.log(`\n📄 Applying ${fileName}...`)
  
  try {
    // First, try to create the helper function if it doesn't exist
    // Then use it to execute the migration SQL
    
    // Actually, Supabase RPC functions can't execute arbitrary SQL for security
    // We need a different approach
    
    // Let's try using the REST API to call a function that executes SQL
    // But first we need to create that function via SQL Editor
    
    // For now, let's output instructions
    console.log(`   ⚠️  Cannot execute SQL directly via REST API`)
    console.log(`   📝 Please apply this migration manually via SQL Editor`)
    
    return { fileName, sql, applied: false }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`)
    return { fileName, sql, applied: false, error: error.message }
  }
}

async function main() {
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
  
  console.log('🚀 Attempting to apply migrations...\n')
  console.log('⚠️  Note: Supabase REST API does not support direct SQL execution')
  console.log('📋 We will create a combined SQL file for manual application\n')
  
  const results = []
  for (const file of files) {
    const filePath = join(migrationsDir, file)
    try {
      const result = await applyMigration(filePath, file)
      results.push(result)
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message)
    }
  }
  
  // Create combined SQL file
  const { writeFileSync } = await import('fs')
  const combinedSQL = results.map(r => 
    `-- ============================================================================\n-- ${r.fileName}\n-- ============================================================================\n\n${r.sql}`
  ).join('\n\n')
  
  const outputFile = join(process.cwd(), 'supabase/migrations/blueprint/APPLY_THIS.sql')
  writeFileSync(outputFile, combinedSQL)
  
  console.log(`\n✅ Created migration file: APPLY_THIS.sql`)
  console.log(`\n📋 To apply migrations:`)
  console.log(`   1. Open Supabase Dashboard → SQL Editor`)
  console.log(`   2. Copy entire contents of: supabase/migrations/blueprint/APPLY_THIS.sql`)
  console.log(`   3. Paste into SQL Editor and click "Run"`)
  console.log(`\n   OR use Supabase CLI:`)
  console.log(`   supabase db push`)
  
  // Try to apply via REST API using a workaround
  console.log(`\n🔄 Attempting alternative method...`)
  
  // Try to apply the combined SQL via a POST request to the REST API
  // This won't work, but let's try anyway
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql_text: combinedSQL })
    })
    
    const result = await response.text()
    console.log(`   Response: ${result}`)
  } catch (error) {
    console.log(`   ⚠️  Direct API execution not available: ${error.message}`)
    console.log(`   ✅ Please use SQL Editor method above`)
  }
}

main().catch(console.error)
