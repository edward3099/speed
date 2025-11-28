/**
 * Apply migrations to Supabase using service role key
 * Uses Supabase JS client to execute SQL via RPC
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

async function executeSQL(sql) {
  // Supabase doesn't expose direct SQL execution via REST API
  // We need to use the management API or create a helper function
  // For now, we'll use the REST API with a workaround
  
  // Try using the REST API's rpc endpoint with a custom function
  // Or use the Supabase management API if available
  
  // Actually, the best way is to use psql or Supabase CLI
  // But since we don't have that, let's try the REST API approach
  
  // Note: This is a workaround - Supabase doesn't allow direct SQL execution via REST API
  // We'll need to apply migrations manually or use Supabase CLI
  
  console.log('⚠️  Direct SQL execution via REST API is not supported by Supabase')
  console.log('📝 Please apply migrations using one of these methods:')
  console.log('   1. Supabase Dashboard → SQL Editor')
  console.log('   2. Supabase CLI: supabase db push')
  console.log('   3. psql connection')
  
  return false
}

async function applyMigration(filePath, fileName) {
  const sql = readFileSync(filePath, 'utf8')
  
  console.log(`\n📄 ${fileName}`)
  console.log(`   Length: ${sql.length} characters`)
  
  // For now, we'll output the SQL so you can apply it manually
  // Or we can try to use a different approach
  
  return { fileName, sql, success: false }
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
  
  console.log('🚀 Preparing migrations for application...\n')
  
  const migrations = []
  for (const file of files) {
    const filePath = join(migrationsDir, file)
    try {
      const result = await applyMigration(filePath, file)
      migrations.push(result)
    } catch (error) {
      console.error(`❌ Error reading ${file}:`, error.message)
    }
  }
  
  // Since Supabase REST API doesn't support direct SQL execution,
  // we'll create a combined SQL file that can be applied via SQL Editor
  const { writeFileSync } = await import('fs')
  const combinedSQL = migrations.map(m => `-- ============================================================================\n-- ${m.fileName}\n-- ============================================================================\n\n${m.sql}`).join('\n\n')
  
  const outputFile = join(process.cwd(), 'supabase/migrations/blueprint/ALL_MIGRATIONS_COMBINED.sql')
  writeFileSync(outputFile, combinedSQL)
  
  console.log(`\n✅ Created combined migration file: ${outputFile}`)
  console.log(`\n📋 Next steps:`)
  console.log(`   1. Open Supabase Dashboard → SQL Editor`)
  console.log(`   2. Copy contents of ALL_MIGRATIONS_COMBINED.sql`)
  console.log(`   3. Paste and execute in SQL Editor`)
  console.log(`\n   OR use Supabase CLI:`)
  console.log(`   supabase db push --file supabase/migrations/blueprint/ALL_MIGRATIONS_COMBINED.sql`)
}

main().catch(console.error)
