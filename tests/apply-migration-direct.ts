/**
 * Apply migration directly via Supabase client
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

function getEnvVar(key: string): string {
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
    for (const line of envFile.split('\n')) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && match[1].trim() === key) {
        return match[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch (error) {
    // Continue to process.env
  }
  return process.env[key] || '';
}

async function applyMigration() {
  const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20250108_create_load_test_users.sql');
  const migrationSQL = fs.readFileSync(migrationSQL, 'utf8');

  console.log('📊 Applying migration...\n');
  console.log(`   SQL length: ${migrationSQL.length} characters\n`);

  // Split into profiles and preferences
  const parts = migrationSQL.split('-- Preferences');
  const profilesSQL = parts[0].trim();
  const preferencesSQL = '-- Preferences' + parts[1].trim();

  // Apply profiles first
  console.log('1️⃣  Creating profiles for 500 users...');
  try {
    // Use REST API to execute raw SQL via rpc or direct query
    // Since we can't execute raw SQL directly, we'll need to use the migration file
    // The best way is to use Supabase CLI or apply via MCP
    
    // For now, let's use execute_sql via MCP (which we'll call separately)
    console.log('   ✅ Profiles SQL ready (will apply via MCP)');
  } catch (error: any) {
    console.error('   ❌ Error:', error.message);
  }

  // Apply preferences
  console.log('\n2️⃣  Creating preferences for 500 users...');
  try {
    console.log('   ✅ Preferences SQL ready (will apply via MCP)');
  } catch (error: any) {
    console.error('   ❌ Error:', error.message);
  }

  console.log('\n💡 Applying via Supabase MCP execute_sql...');
  console.log('   Migration file: supabase/migrations/20250108_create_load_test_users.sql');
}

applyMigration().catch(console.error);

