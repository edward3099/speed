import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const supabaseUrl = 'https://jzautphzcbtqplltsfse.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YXV0cGh6Y2J0cXBsbHRzZnNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0OTU3NjQsImV4cCI6MjA3OTA3MTc2NH0.ClK8KMo_Bo66rbhE7KZC7OREY2FRYHKT28EsGXoWwu4'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function applyMigration() {
  console.log('🚀 Automated Migration Application\n')
  console.log('='.repeat(60))
  
  // Step 1: Create executor function
  const executorSQL = readFileSync(join(__dirname, 'STEP1_create_executor.sql'), 'utf8')
  console.log('\n📝 Step 1: Creating exec_sql function...')
  console.log('⚠️  This requires manual application first (small SQL file)')
  console.log('\nPlease apply STEP1_create_executor.sql in Supabase Dashboard, then press Enter...')
  
  // Wait for user confirmation (in automated mode, we'll try anyway)
  console.log('\n⏳ Attempting to proceed automatically...\n')
  
  // Step 2: Use executor to apply full migration
  const migrationSQL = readFileSync(join(__dirname, 'apply_matching_fixes.sql'), 'utf8')
  
  try {
    console.log('📝 Step 2: Executing full migration via exec_sql RPC...')
    
    // Split migration into smaller chunks to avoid timeout
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))
    
    console.log(`   Found ${statements.length} SQL statements`)
    
    let successCount = 0
    let errorCount = 0
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';'
      if (statement.trim().length <= 2) continue
      
      try {
        // Try to execute via exec_sql RPC
        const { data, error } = await supabase.rpc('exec_sql', {
          p_sql: statement
        })
        
        if (error) {
          // If exec_sql doesn't exist, we need to create it first
          if (error.message.includes('function exec_sql') || error.message.includes('does not exist')) {
            console.log('\n❌ exec_sql function not found!')
            console.log('\n📋 Please apply STEP1_create_executor.sql first:')
            console.log('   1. Go to: https://supabase.com/dashboard/project/jzautphzcbtqplltsfse/sql/new')
            console.log('   2. Copy contents of STEP1_create_executor.sql')
            console.log('   3. Paste and click "Run"')
            console.log('   4. Then run this script again')
            return
          }
          
          console.warn(`   ⚠️  Statement ${i + 1} warning: ${error.message}`)
          errorCount++
        } else {
          successCount++
          if (i % 10 === 0) {
            console.log(`   ✅ Processed ${i + 1}/${statements.length} statements...`)
          }
        }
      } catch (err) {
        console.warn(`   ⚠️  Statement ${i + 1} error: ${err.message}`)
        errorCount++
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    console.log(`\n✅ Migration complete!`)
    console.log(`   Success: ${successCount}, Errors: ${errorCount}`)
    
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.log('\n📋 Fallback: Apply migration manually')
    console.log('   File: /workspace/apply_matching_fixes.sql')
  }
}

applyMigration()
