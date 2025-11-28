import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const supabaseUrl = 'https://jzautphzcbtqplltsfse.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YXV0cGh6Y2J0cXBsbHRzZnNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0OTU3NjQsImV4cCI6MjA3OTA3MTc2NH0.ClK8KMo_Bo66rbhE7KZC7OREY2FRYHKT28EsGXoWwu4'

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Read SQL file
const sql = readFileSync(join(__dirname, 'apply_matching_fixes.sql'), 'utf8')

console.log('📋 Applying matching engine fixes...')
console.log(`SQL file size: ${sql.length} characters\n`)

// Strategy: Create a temporary RPC function that executes the SQL, call it, then drop it
async function applyMigration() {
  try {
    // Step 1: Create a temporary function that executes our SQL
    const createExecutorFunction = `
      CREATE OR REPLACE FUNCTION temp_execute_migration()
      RETURNS TEXT
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        -- Execute the migration SQL
        ${sql.replace(/\$\$/g, '$$$$')} -- Escape dollar signs
        
        RETURN 'Migration applied successfully';
      END;
      $$;
    `
    
    console.log('Step 1: Creating temporary executor function...')
    const { error: createError } = await supabase.rpc('exec_sql', { 
      sql: createExecutorFunction 
    })
    
    if (createError) {
      // If exec_sql doesn't exist, try direct approach
      console.log('exec_sql RPC not available, trying alternative method...')
      
      // Alternative: Split SQL into statements and execute via RPC
      // But Supabase doesn't support this directly...
      
      // Let's try using the Management API instead
      console.log('\n⚠️  Direct SQL execution via Supabase REST API is not supported.')
      console.log('\n✅ The SQL file is ready at: /workspace/apply_matching_fixes.sql')
      console.log('\n📝 Please apply it manually via Supabase Dashboard:')
      console.log('   1. Go to: https://supabase.com/dashboard/project/jzautphzcbtqplltsfse/sql/new')
      console.log('   2. Copy the contents of apply_matching_fixes.sql')
      console.log('   3. Paste and click "Run"')
      
      return
    }
    
    // Step 2: Call the executor function
    console.log('Step 2: Executing migration...')
    const { data, error: execError } = await supabase.rpc('temp_execute_migration')
    
    if (execError) {
      console.error('❌ Error executing migration:', execError)
      return
    }
    
    console.log('✅ Migration result:', data)
    
    // Step 3: Drop the temporary function
    console.log('Step 3: Cleaning up...')
    const { error: dropError } = await supabase.rpc('exec_sql', {
      sql: 'DROP FUNCTION IF EXISTS temp_execute_migration();'
    })
    
    if (dropError) {
      console.warn('⚠️  Could not drop temporary function:', dropError.message)
    } else {
      console.log('✅ Cleanup complete')
    }
    
    console.log('\n✅ Migration applied successfully!')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error('\n💡 Alternative: Apply migration manually via Supabase Dashboard')
  }
}

applyMigration()
