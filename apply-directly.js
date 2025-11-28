/**
 * Apply migrations directly to Supabase
 * Uses Supabase Management API or direct SQL execution
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

async function executeSQL(sql) {
  // Try to execute SQL by creating a temporary function
  // First, create exec_sql helper function
  const createHelperSQL = `
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
  `
  
  console.log('📝 Step 1: Creating helper function...')
  
  // Try to create helper via RPC (won't work, but let's try)
  // Actually, we need to apply the helper first manually or via a different method
  
  // Alternative: Split SQL into smaller chunks and try to apply via REST API
  // But Supabase doesn't support this...
  
  // Best approach: Use Supabase Management API
  try {
    // Try Management API endpoint
    const response = await fetch(`https://api.supabase.com/v1/projects/jzautphzcbtqplltsfse/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY
      },
      body: JSON.stringify({ query: sql })
    })
    
    const result = await response.text()
    console.log('Response:', result)
    return { success: !response.ok, result }
  } catch (error) {
    console.error('Management API error:', error.message)
    return { success: false, error: error.message }
  }
}

async function main() {
  const sqlFile = join(process.cwd(), 'supabase/migrations/blueprint/ALL_MIGRATIONS_COMBINED.sql')
  const sql = readFileSync(sqlFile, 'utf8')
  
  console.log('🚀 Attempting to apply migrations directly...\n')
  console.log(`📄 SQL file: ${sqlFile}`)
  console.log(`📊 Size: ${(sql.length / 1024).toFixed(1)} KB\n`)
  
  // Split SQL into statements (rough split by semicolons, but handle DO blocks)
  const statements = []
  let currentStatement = ''
  let inDoBlock = false
  let doBlockDepth = 0
  
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]
    const nextChars = sql.substring(i, Math.min(i + 10, sql.length))
    
    if (nextChars.startsWith('DO $$')) {
      inDoBlock = true
      doBlockDepth = 1
    }
    
    if (inDoBlock) {
      currentStatement += char
      if (char === '$' && sql[i + 1] === '$') {
        doBlockDepth--
        if (doBlockDepth === 0) {
          inDoBlock = false
          if (char === ';') {
            statements.push(currentStatement.trim())
            currentStatement = ''
          }
        }
      }
    } else {
      currentStatement += char
      if (char === ';' && !inDoBlock) {
        const trimmed = currentStatement.trim()
        if (trimmed && !trimmed.startsWith('--')) {
          statements.push(trimmed)
        }
        currentStatement = ''
      }
    }
  }
  
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim())
  }
  
  console.log(`📋 Split into ${statements.length} statements\n`)
  
  // Try to apply each statement
  let successCount = 0
  let failCount = 0
  
  for (let i = 0; i < Math.min(statements.length, 5); i++) {
    const stmt = statements[i]
    console.log(`\n📄 Statement ${i + 1}/${statements.length}:`)
    console.log(stmt.substring(0, 100) + '...')
    
    const result = await executeSQL(stmt)
    if (result.success) {
      successCount++
      console.log('✅ Success')
    } else {
      failCount++
      console.log('❌ Failed:', result.error || result.result)
    }
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  console.log(`\n📊 Results: ${successCount} succeeded, ${failCount} failed`)
  console.log('\n⚠️  Note: Supabase REST API does not support direct SQL execution')
  console.log('📋 Please apply via SQL Editor or use Supabase CLI')
}

main().catch(console.error)
