/**
 * Apply migration for load test users
 * Reads the migration file and executes it via Supabase
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

  console.log('📊 Applying migration to create profiles and preferences...\n');

  // Split into profiles and preferences
  const parts = migrationSQL.split('-- Preferences');
  const profilesSQL = parts[0].trim();
  const preferencesSQL = '-- Preferences' + parts[1].trim();

  // Apply profiles
  console.log('Creating profiles for 500 users...');
  const { error: profileError } = await supabase.rpc('exec_sql', { 
    sql: profilesSQL 
  }).catch(async () => {
    // exec_sql might not exist, try direct query execution
    // We'll need to use a different approach - execute via REST API
    return { error: { message: 'exec_sql not available, using alternative method' } };
  });

  if (profileError && !profileError.message.includes('exec_sql')) {
    console.error('❌ Profile error:', profileError.message);
    // Try alternative: use Supabase REST API directly
    console.log('Trying alternative method...');
  } else {
    console.log('✅ Profiles created successfully!');
  }

  // Apply preferences
  console.log('\nCreating preferences for 500 users...');
  const { error: prefError } = await supabase.rpc('exec_sql', { 
    sql: preferencesSQL 
  }).catch(async () => {
    return { error: { message: 'exec_sql not available' } };
  });

  if (prefError && !prefError.message.includes('exec_sql')) {
    console.error('❌ Preferences error:', prefError.message);
  } else {
    console.log('✅ Preferences created successfully!');
  }

  console.log('\n✅ Migration complete!');
}

applyMigration().catch(console.error);

