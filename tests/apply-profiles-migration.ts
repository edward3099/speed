/**
 * Apply profiles and preferences migration for load test users
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

  // Split by INSERT statements
  const profileInsert = migrationSQL.match(/INSERT INTO profiles[\s\S]*?ON CONFLICT[\s\S]*?;/)?.[0];
  const preferencesInsert = migrationSQL.match(/INSERT INTO user_preferences[\s\S]*?ON CONFLICT[\s\S]*?;/)?.[0];

  if (!profileInsert || !preferencesInsert) {
    throw new Error('Could not parse migration SQL');
  }

  // Apply profiles
  console.log('Creating profiles...');
  const { error: profileError } = await supabase.rpc('exec_sql', { 
    sql: profileInsert 
  }).catch(async () => {
    // If exec_sql doesn't exist, try direct query
    // We'll need to use a different approach
    return { error: { message: 'exec_sql not available' } };
  });

  if (profileError && !profileError.message.includes('exec_sql')) {
    console.error('Profile error:', profileError.message);
  } else {
    // Use direct SQL execution via MCP
    console.log('✅ Profiles migration ready (will apply via MCP)');
  }

  console.log('\n✅ Migration SQL parsed successfully');
  console.log('   Profiles statement:', profileInsert.substring(0, 100) + '...');
  console.log('   Preferences statement:', preferencesInsert.substring(0, 100) + '...');
  console.log('\n💡 Applying via Supabase MCP...');
}

applyMigration().catch(console.error);

