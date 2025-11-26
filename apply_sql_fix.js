import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read SQL file
const sql = readFileSync(join(__dirname, 'fix_create_pair_atomic.sql'), 'utf8')

console.log('📋 SQL Fix to Apply:')
console.log('='.repeat(60))
console.log(sql)
console.log('='.repeat(60))
console.log('\n⚠️  Direct SQL execution via Supabase REST API is not supported.')
console.log('\n✅ The fix has been prepared and saved to:')
console.log('   - /workspace/fix_create_pair_atomic.sql')
console.log('   - /workspace/supabase/migrations/20250126_fix_create_pair_atomic.sql')
console.log('\n📝 To apply this fix, please:')
console.log('   1. Go to: https://supabase.com/dashboard/project/jzautphzcbtqplltsfse/sql/new')
console.log('   2. Copy the SQL above')
console.log('   3. Paste and click "Run"')
console.log('\n🔧 Alternatively, if you have psql access:')
console.log('   psql "your-connection-string" -f fix_create_pair_atomic.sql')
