import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const supabaseUrl = 'https://jzautphzcbtqplltsfse.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YXV0cGh6Y2J0cXBsbHRzZnNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzQ5NTc2NCwiZXhwIjoyMDc5MDcxNzY0fQ.YourServiceRoleKeyHere'

// Create Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Read SQL file
const sql = readFileSync('./fix_create_pair_atomic.sql', 'utf8')

console.log('Applying create_pair_atomic fix...')

// Execute SQL via RPC (if available) or use direct query
// Note: Supabase doesn't support direct SQL execution via REST API
// We need to use psql or the Supabase dashboard

// For now, let's try using the REST API with a custom function
// But actually, the best way is to use psql or the dashboard

console.log('SQL to apply:')
console.log('---')
console.log(sql)
console.log('---')
console.log('\n⚠️  Supabase REST API does not support direct SQL execution.')
console.log('Please apply this SQL manually via:')
console.log('1. Supabase Dashboard > SQL Editor')
console.log('2. Or via psql with correct connection string')
console.log('\nThe SQL file is ready at: ./fix_create_pair_atomic.sql')
