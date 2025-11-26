/**
 * Apply all migrations automatically
 * Strategy: First create helper function, then use it to apply migrations
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
  const helperSQL = `
CREATE OR REPLACE FUNCTION exec_sql(sql_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_text;
  RETURN 'Success';
EXCEPTION WHEN OTHERS THEN
  RETURN 'Error: ' || SQLERRM;
END;
$$;
  `.trim()
  
  // Try to create helper via REST API RPC (won't work, but let's try)
  // Actually, we need to apply this SQL first manually or via psql
  
  console.log('📝 Helper function SQL (apply this first via SQL Editor):')
  console.log('='.repeat(60))
  console.log(helperSQL)
  console.log('='.repeat(60))
  console.log('\n⚠️  This must be applied manually first\n')
  
  return false
}

async function applyViaHelper(sql) {
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql })
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function main() {
  console.log('🚀 Automatic Migration Application\n')
  
  // Step 1: Create helper function
  const helperCreated = await createHelperFunction()
  
  if (!helperCreated) {
    console.log('📋 Two-step process:\n')
    console.log('STEP 1: Apply helper function (copy SQL above to SQL Editor)')
    console.log('STEP 2: Run this script again to apply migrations\n')
    console.log('OR: Apply entire migration file at once:')
    console.log('   File: supabase/migrations/blueprint/ALL_MIGRATIONS_COMBINED.sql')
    console.log('   URL: https://supabase.com/dashboard/project/jzautphzcbtqplltsfse/sql\n')
    return
  }
  
  // Step 2: Apply migrations using helper
  const sqlFile = join(process.cwd(), 'supabase/migrations/blueprint/ALL_MIGRATIONS_COMBINED.sql')
  const sql = readFileSync(sqlFile, 'utf8')
  
  console.log('📄 Applying migrations via helper function...\n')
  
  const result = await applyViaHelper(sql)
  
  if (result.success) {
    console.log('✅ All migrations applied successfully!')
    console.log('Result:', result.data)
  } else {
    console.log('❌ Failed to apply migrations')
    console.log('Error:', result.error)
  }
}

main().catch(console.error)
