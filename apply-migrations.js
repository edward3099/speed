/**
 * Apply migrations to Supabase using service role key
 */

const SUPABASE_URL = 'https://jzautphzcbtqplltsfse.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YXV0cGh6Y2J0cXBsbHRzZnNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzQ5NTc2NCwiZXhwIjoyMDc5MDcxNzY0fQ.3u57IsBUeJlHZ5IEbIFDtI9l3TSSeo_nDUBXYSiXh5k'

const fs = require('fs')
const path = require('path')

async function applyMigration(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8')
  const fileName = path.basename(filePath)
  
  console.log(`\n📄 Applying ${fileName}...`)
  
  try {
    // Use Supabase REST API to execute SQL via RPC
    // Note: We'll use the REST API with service role key
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ sql })
    })
    
    if (!response.ok) {
      // Try alternative: direct SQL execution via pg REST API
      // Supabase doesn't expose direct SQL execution, so we need to use a different approach
      throw new Error(`HTTP ${response.status}: ${await response.text()}`)
    }
    
    console.log(`✅ ${fileName} applied successfully`)
    return true
  } catch (error) {
    console.error(`❌ Error applying ${fileName}:`, error.message)
    return false
  }
}

async function main() {
  const migrationsDir = path.join(__dirname, 'supabase/migrations/blueprint')
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
  
  console.log('🚀 Starting migration application...\n')
  
  for (const file of files) {
    const filePath = path.join(migrationsDir, file)
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${file}`)
      continue
    }
    
    const success = await applyMigration(filePath)
    if (!success) {
      console.log(`\n❌ Migration failed at ${file}. Stopping.`)
      process.exit(1)
    }
    
    // Small delay between migrations
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  console.log('\n✅ All migrations applied successfully!')
}

main().catch(console.error)
