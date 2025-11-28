import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const accessToken = 'sbp_d1dc0543f8e3bb426134ed5dc59fddd2c4a33f4e'
const projectRef = 'jzautphzcbtqplltsfse'

const diagnosticSQL = readFileSync(join(__dirname, 'diagnose_matching_now.sql'), 'utf8')

console.log('🔍 Running diagnostics...\n')

async function runDiagnostics() {
  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: diagnosticSQL
      })
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      console.error('❌ Error:', JSON.stringify(data, null, 2))
      return
    }
    
    console.log('✅ Diagnostic Results:')
    console.log(JSON.stringify(data, null, 2))
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

runDiagnostics()
