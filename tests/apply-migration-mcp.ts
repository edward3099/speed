/**
 * Apply migration via Supabase MCP execute_sql
 */

import * as fs from 'fs';
import * as path from 'path';

async function applyMigration() {
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20250108_create_load_test_users.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  console.log('📊 Migration SQL loaded');
  console.log(`   Length: ${migrationSQL.length} characters\n`);
  console.log('💡 To apply via Supabase MCP, use:');
  console.log('   mcp_supabase_execute_sql with the full SQL content\n');
  console.log('   First 200 chars:', migrationSQL.substring(0, 200));
  console.log('   Last 200 chars:', migrationSQL.substring(migrationSQL.length - 200));
}

applyMigration().catch(console.error);

