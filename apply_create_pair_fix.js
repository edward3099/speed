import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const accessToken = 'sbp_d1dc0543f8e3bb426134ed5dc59fddd2c4a33f4e'
const projectRef = 'jzautphzcbtqplltsfse'

const sql = readFileSync(join(__dirname, 'fix_create_pair_atomic.sql'), 'utf8')

console.log('🔧 Applying create_pair_atomic fix...\n')

async function applyFix() {
  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: sql
      })
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      console.error('❌ Error:', JSON.stringify(data, null, 2))
      return
    }
    
    console.log('✅ create_pair_atomic fixed successfully!')
    console.log('Response:', JSON.stringify(data, null, 2))
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

applyFix()
