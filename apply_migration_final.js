import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const accessToken = 'sbp_d1dc0543f8e3bb426134ed5dc59fddd2c4a33f4e'
const projectRef = 'jzautphzcbtqplltsfse'

const migrationSQL = readFileSync(join(__dirname, 'apply_matching_fixes.sql'), 'utf8')

console.log('🚀 Applying migration via Supabase Management API...\n')
console.log(`SQL size: ${migrationSQL.length} characters\n`)

async function applyMigration() {
  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
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
      console.error('❌ API Error:', JSON.stringify(data, null, 2))
      throw new Error(data.message || 'API request failed')
    }
    
    console.log('✅ Migration applied successfully!')
    console.log('Response:', JSON.stringify(data, null, 2))
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.message.includes('syntax error')) {
      console.log('\n⚠️  SQL syntax error detected. The SQL file may need manual review.')
    }
  }
}

applyMigration()
