import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const supabaseUrl = 'https://jzautphzcbtqplltsfse.supabase.co'
// Try to get service role key from environment or use anon key
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YXV0cGh6Y2J0cXBsbHRzZnNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0OTU3NjQsImV4cCI6MjA3OTA3MTc2NH0.ClK8KMo_Bo66rbhE7KZC7OREY2FRYHKT28EsGXoWwu4'

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

const migrationSQL = readFileSync(join(__dirname, 'apply_matching_fixes.sql'), 'utf8')

console.log('🔧 Attempting to apply migration via Supabase REST API...\n')

async function applyMigration() {
  try {
    // Strategy: Try to execute SQL via a custom RPC function
    // First check if exec_sql exists
    console.log('Step 1: Checking for exec_sql function...')
    
    const { data: checkData, error: checkError } = await supabase.rpc('exec_sql', {
      p_sql: 'SELECT 1;'
    })
    
    if (checkError) {
      console.log('❌ exec_sql function not available')
      console.log('📋 Creating exec_sql function first...')
      
      // Try to create exec_sql function via a workaround
      // We'll need to apply create_sql_executor.sql first manually
      console.log('\n⚠️  Manual step required:')
      console.log('1. Apply create_sql_executor.sql first (small file)')
      console.log('2. Then this script can execute the full migration')
      console.log('\nSQL to apply first:')
      console.log('─'.repeat(60))
      console.log(readFileSync(join(__dirname, 'create_sql_executor.sql'), 'utf8'))
      console.log('─'.repeat(60))
      return
    }
    
    console.log('✅ exec_sql function exists, proceeding...')
    
    // Execute the migration
    console.log('\nStep 2: Executing migration SQL...')
    const { data, error } = await supabase.rpc('exec_sql', {
      p_sql: migrationSQL
    })
    
    if (error) {
      console.error('❌ Error executing migration:', error)
      return
    }
    
    console.log('✅ Migration result:', data)
    console.log('\n✅ Migration applied successfully!')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.log('\n📋 Fallback: Apply migration manually')
    console.log('File: /workspace/apply_matching_fixes.sql')
  }
}

applyMigration()
