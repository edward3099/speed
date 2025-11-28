/**
 * Apply migrations via Supabase Management API
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YXV0cGh6Y2J0cXBsbHRzZnNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzQ5NTc2NCwiZXhwIjoyMDc5MDcxNzY0fQ.3u57IsBUeJlHZ5IEbIFDtI9l3TSSeo_nDUBXYSiXh5k'
const PROJECT_REF = 'jzautphzcbtqplltsfse'

async function executeSQL(sql) {
  // Try Supabase Management API
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY
      },
      body: JSON.stringify({ query: sql })
    })
    
    const text = await response.text()
    return { success: response.ok, status: response.status, result: text }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function main() {
  const sqlFile = join(process.cwd(), 'supabase/migrations/blueprint/ALL_MIGRATIONS_COMBINED.sql')
  const sql = readFileSync(sqlFile, 'utf8')
  
  console.log('🚀 Applying migrations via Management API...\n')
  console.log(`📄 File: ${sqlFile}`)
  console.log(`📊 Size: ${(sql.length / 1024).toFixed(1)} KB\n`)
  
  const result = await executeSQL(sql)
  
  if (result.success) {
    console.log('✅ Migrations applied successfully!')
    console.log('Result:', result.result)
  } else {
    console.log('❌ Failed to apply migrations')
    console.log('Status:', result.status)
    console.log('Response:', result.result || result.error)
    
    if (result.status === 401 || result.status === 403) {
      console.log('\n⚠️  Management API requires different authentication')
      console.log('📋 Alternative: Apply via SQL Editor')
    }
  }
}

main().catch(console.error)
