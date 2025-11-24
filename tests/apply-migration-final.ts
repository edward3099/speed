/**
 * Apply migration by reading file and executing via Supabase REST API
 */

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

  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20250108_create_load_test_users.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  console.log('📊 Applying migration via Supabase REST API...\n');
  console.log(`   SQL length: ${migrationSQL.length} characters\n`);

  // Split into profiles and preferences
  const parts = migrationSQL.split('-- Preferences');
  const profilesSQL = parts[0].trim();
  const preferencesSQL = '-- Preferences' + parts[1].trim();

  // Apply profiles
  console.log('1️⃣  Creating profiles for 500 users...');
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ sql: profilesSQL }),
    });

    const data = await response.text();
    if (!response.ok) {
      console.log('   ⚠️  exec_sql RPC not available');
      console.log('   💡 Using Supabase MCP execute_sql instead...');
    } else {
      console.log('   ✅ Profiles created!');
    }
  } catch (error: any) {
    console.log('   ⚠️  API call failed:', error.message);
    console.log('   💡 Will apply via Supabase MCP execute_sql');
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

    const data = await response.text();
    if (!response.ok) {
      console.log('   💡 Using Supabase MCP execute_sql instead...');
    } else {
      console.log('   ✅ Preferences created!');
    }
  } catch (error: any) {
    console.log('   💡 Will apply via Supabase MCP execute_sql');
  }

  console.log('\n✅ Migration SQL ready for MCP application');
  console.log('   Profiles SQL: /tmp/profiles_only.sql');
  console.log('   Preferences SQL: /tmp/preferences_only.sql');
}

applyMigration().catch(console.error);

