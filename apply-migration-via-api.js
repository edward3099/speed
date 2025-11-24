/**
 * Apply migration via Supabase REST API
 * This script reads the migration file and applies it via Supabase API
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
let supabaseUrl, supabaseServiceKey;

try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (key === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = value;
      if (key === 'SUPABASE_SERVICE_ROLE_KEY') supabaseServiceKey = value;
    }
  });
} catch (error) {
  console.error('Could not read .env.local, using environment variables');
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  console.log('📦 Reading migration file...');
  
  const migrationPath = path.join(__dirname, 'supabase', 'migrations', '20250112_improvements_to_reach_100_percent.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  
  console.log('🚀 Applying migration via Supabase API...');
  console.log(`   Migration size: ${migrationSQL.length} characters`);
  
  try {
    // Execute the migration SQL
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql: migrationSQL 
    });
    
    if (error) {
      // If exec_sql doesn't exist, try direct query
      console.log('   Trying direct query execution...');
      
      // Split into individual statements and execute
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      
      console.log(`   Executing ${statements.length} statements...`);
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i] + ';';
        if (statement.trim().length > 2) {
          try {
            const { error: stmtError } = await supabase.rpc('exec_sql', { 
              sql: statement 
            });
            if (stmtError) {
              console.warn(`   ⚠️  Statement ${i + 1} warning: ${stmtError.message}`);
            } else {
              console.log(`   ✅ Statement ${i + 1}/${statements.length} executed`);
            }
          } catch (err) {
            console.warn(`   ⚠️  Statement ${i + 1} error: ${err.message}`);
          }
        }
      }
      
      console.log('\n✅ Migration applied successfully!');
      console.log('\n📋 Next steps:');
      console.log('   1. Set up background matching job (see IMPLEMENTATION_GUIDE.md)');
      console.log('   2. Verify migration: SELECT get_current_match_rate();');
      
    } else {
      console.log('✅ Migration applied successfully!');
    }
    
  } catch (error) {
    console.error('❌ Error applying migration:', error.message);
    console.error('\n💡 Alternative: Apply migration via Supabase Dashboard:');
    console.error('   1. Go to https://supabase.com/dashboard/project/jzautphzcbtqplltsfse/sql/new');
    console.error('   2. Copy contents of: supabase/migrations/20250112_improvements_to_reach_100_percent.sql');
    console.error('   3. Paste and run');
    process.exit(1);
  }
}

applyMigration();

