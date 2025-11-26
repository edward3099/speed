import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const supabaseUrl = 'https://jzautphzcbtqplltsfse.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YXV0cGh6Y2J0cXBsbHRzZnNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0OTU3NjQsImV4cCI6MjA3OTA3MTc2NH0.ClK8KMo_Bo66rbhE7KZC7OREY2FRYHKT28EsGXoWwu4'
const accessToken = 'sbp_d1dc0543f8e3bb426134ed5dc59fddd2c4a33f4e'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

const migrationSQL = readFileSync(join(__dirname, 'apply_matching_fixes.sql'), 'utf8')

console.log('🚀 Applying migration via Supabase Management API...\n')

async function applyViaManagementAPI() {
  try {
    // Try using Supabase Management API
    const response = await fetch(`https://api.supabase.com/v1/projects/jzautphzcbtqplltsfse/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: migrationSQL
      })
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      console.error('❌ API Error:', data)
      throw new Error(data.message || 'API request failed')
    }
    
    console.log('✅ Migration applied via Management API:', data)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.log('\n📋 Management API not available, trying alternative...')
    
    // Alternative: Try to create exec_sql function first, then use it
    const executorSQL = readFileSync(join(__dirname, 'STEP1_create_executor.sql'), 'utf8')
    
    console.log('\n📝 Step 1: Creating exec_sql function via RPC...')
    console.log('⚠️  This requires manual application first')
    console.log('\nPlease apply STEP1_create_executor.sql, then we can execute the full migration')
  }
}

applyViaManagementAPI()
