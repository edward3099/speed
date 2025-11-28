import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const supabaseUrl = 'https://jzautphzcbtqplltsfse.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YXV0cGh6Y2J0cXBsbHRzZnNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0OTU3NjQsImV4cCI6MjA3OTA3MTc2NH0.ClK8KMo_Bo66rbhE7KZC7OREY2FRYHKT28EsGXoWwu4'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Step 1: Create exec_sql function first (small, can be applied manually if needed)
const createExecutorSQL = readFileSync(join(__dirname, 'create_sql_executor.sql'), 'utf8')

// Step 2: Read the main migration
const migrationSQL = readFileSync(join(__dirname, 'apply_matching_fixes.sql'), 'utf8')

console.log('📋 Step-by-step Migration Application\n')
console.log('='.repeat(60))

async function applyMigration() {
  try {
    // First, try to create the executor function via a workaround
    // We'll use the Supabase REST API to create a function that can execute SQL
    
    console.log('\n📝 Step 1: Creating SQL executor function...')
    console.log('⚠️  Note: This requires manual application of create_sql_executor.sql first')
    console.log('\nPlease run this SQL in Supabase Dashboard:')
    console.log('─'.repeat(60))
    console.log(createExecutorSQL)
    console.log('─'.repeat(60))
    
    // Wait a moment, then try to use it
    console.log('\n⏳ Waiting 3 seconds for you to apply the executor function...')
    console.log('(If you haven\'t applied it yet, please do so now)')
    
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Try to use exec_sql if it exists
    console.log('\n📝 Step 2: Attempting to execute migration via exec_sql RPC...')
    
    // Escape the SQL properly for the function call
    const escapedSQL = migrationSQL.replace(/'/g, "''").replace(/\$\$/g, '$$$$')
    
    const { data, error } = await supabase.rpc('exec_sql', {
      p_sql: migrationSQL
    })
    
    if (error) {
      if (error.message.includes('function exec_sql') || error.message.includes('does not exist')) {
        console.log('\n❌ exec_sql function not found.')
        console.log('📋 Please apply the migration manually:')
        console.log('\n' + '='.repeat(60))
        console.log('FULL MIGRATION SQL:')
        console.log('='.repeat(60))
        console.log(migrationSQL)
        console.log('='.repeat(60))
        console.log('\n📝 Steps:')
        console.log('1. Go to: https://supabase.com/dashboard/project/jzautphzcbtqplltsfse/sql/new')
        console.log('2. Copy the SQL above')
        console.log('3. Paste and click "Run"')
      } else {
        console.error('❌ Error:', error)
      }
      return
    }
    
    console.log('✅ Migration result:', data)
    console.log('\n✅ Migration applied successfully!')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.log('\n📋 Fallback: Apply migration manually')
    console.log('SQL file location: /workspace/apply_matching_fixes.sql')
  }
}

applyMigration()
