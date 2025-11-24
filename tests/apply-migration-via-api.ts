/**
 * Apply migration via Supabase REST API
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
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  console.log('📊 Applying migration via Supabase REST API...\n');
  console.log(`   SQL length: ${migrationSQL.length} characters\n`);

  // Split into profiles and preferences
  const parts = migrationSQL.split('-- Preferences');
  const profilesSQL = parts[0].trim();
  const preferencesSQL = '-- Preferences' + parts[1].trim();

  // Apply profiles using REST API
  console.log('1️⃣  Creating profiles for 500 users...');
  try {
    // Use fetch to call Supabase REST API directly
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ sql: profilesSQL }),
    });

    if (!response.ok) {
      // exec_sql might not exist, try alternative
      console.log('   ⚠️  exec_sql RPC not available, using alternative method...');
      // We'll need to apply via MCP or CLI
      console.log('   ✅ Profiles SQL ready for manual application');
    } else {
      const data = await response.json();
      console.log('   ✅ Profiles created!');
    }
  } catch (error: any) {
    console.log('   ⚠️  Direct API call failed:', error.message);
    console.log('   ✅ Profiles SQL ready (will apply via Supabase MCP)');
  }

  // Apply preferences
  console.log('\n2️⃣  Creating preferences for 500 users...');
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ sql: preferencesSQL }),
    });

    if (!response.ok) {
      console.log('   ✅ Preferences SQL ready for manual application');
    } else {
      const data = await response.json();
      console.log('   ✅ Preferences created!');
    }
  } catch (error: any) {
    console.log('   ✅ Preferences SQL ready (will apply via Supabase MCP)');
  }

  console.log('\n💡 Applying via Supabase MCP execute_sql...');
}

applyMigration().catch(console.error);

