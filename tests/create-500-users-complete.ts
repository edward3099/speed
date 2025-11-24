/**
 * Complete Solution: Create 500 Users (250 males, 250 females)
 * Uses Supabase Admin API + MCP for profiles
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const TOTAL_USERS = 500;
const MALES = 250;
const FEMALES = 250;
const BATCH_SIZE = 50;

function getEnvVar(key: string): string {
  // Try .env.local first
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

interface User {
  email: string;
  password: string;
  userId: string;
  gender: 'male' | 'female';
  age: number;
  index: number;
}

async function createUsersInBatches(
  supabase: any,
  startIndex: number,
  count: number,
  gender: 'male' | 'female'
): Promise<User[]> {
  const users: User[] = [];
  const baseIndex = gender === 'male' ? startIndex : startIndex + MALES;

  for (let i = 0; i < count; i++) {
    const index = startIndex + i;
    const email = gender === 'male' 
      ? `loadtestmale${index}@example.com`
      : `loadtestfemale${index - MALES}@example.com`;
    const password = `testpass${index}`;
    const age = 20 + (index % 20);

    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error) {
        if (error.message.includes('already registered') || 
            error.message.includes('User already registered') ||
            error.message.includes('already exists')) {
          // User exists, find it
          const { data: existingUsers } = await supabase.auth.admin.listUsers();
          const existingUser = existingUsers?.users?.find((u: any) => u.email === email);
          if (existingUser) {
            users.push({ email, password, userId: existingUser.id, gender, age, index });
            continue;
          }
        }
        console.error(`  ⚠️  ${email}: ${error.message}`);
        continue;
      }

      if (data?.user) {
        users.push({ email, password, userId: data.user.id, gender, age, index });
      }
    } catch (err: any) {
      console.error(`  ⚠️  ${email}: ${err.message}`);
    }
  }

  return users;
}

async function createAllUsers() {
  console.log(`🚀 Creating ${TOTAL_USERS} users (${MALES} males, ${FEMALES} females)...\n`);

  const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  }

  if (!supabaseServiceKey) {
    throw new Error(`
❌ Missing SUPABASE_SERVICE_ROLE_KEY

To create users, you need to add your Supabase service role key to .env.local:

1. Go to Supabase Dashboard > Settings > API
2. Copy the "service_role" key (NOT the anon key)
3. Add to .env.local:
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

⚠️  Keep this key secret! Never commit it to git.
    `);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const allUsers: User[] = [];

  // Create males in batches
  console.log(`📝 Creating ${MALES} male users...`);
  for (let batch = 0; batch < Math.ceil(MALES / BATCH_SIZE); batch++) {
    const start = batch * BATCH_SIZE;
    const count = Math.min(BATCH_SIZE, MALES - start);
    const batchUsers = await createUsersInBatches(supabase, start, count, 'male');
    allUsers.push(...batchUsers);
    console.log(`  ✅ Batch ${batch + 1}: ${batchUsers.length} users (Total: ${allUsers.length})`);
    if (batch < Math.ceil(MALES / BATCH_SIZE) - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Create females in batches
  console.log(`\n📝 Creating ${FEMALES} female users...`);
  for (let batch = 0; batch < Math.ceil(FEMALES / BATCH_SIZE); batch++) {
    const start = batch * BATCH_SIZE;
    const count = Math.min(BATCH_SIZE, FEMALES - start);
    const batchUsers = await createUsersInBatches(supabase, start, count, 'female');
    allUsers.push(...batchUsers);
    console.log(`  ✅ Batch ${batch + 1}: ${batchUsers.length} users (Total: ${allUsers.length})`);
    if (batch < Math.ceil(FEMALES / BATCH_SIZE) - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\n✅ Created ${allUsers.length} total users`);
  console.log(`   Males: ${allUsers.filter(u => u.gender === 'male').length}`);
  console.log(`   Females: ${allUsers.filter(u => u.gender === 'female').length}\n`);

  return allUsers;
}

function generateMigrationSQL(users: User[]): string {
  const profilesValues = users.map(user => {
    const genderNum = user.gender === 'male' ? 15 : 20;
    const latOffset = (user.index % 10) * 0.1;
    const lonOffset = (user.index % 10) * 0.1;
    return `('${user.userId}'::uuid, 'Load Test ${user.gender === 'male' ? 'Male' : 'Female'} User ${user.index}', ${user.age}, 'Load test user ${user.index}', '${user.gender}', 'Test Location', ${40.7128 + latOffset}, ${-74.0060 + lonOffset}, 'https://i.pravatar.cc/150?img=${genderNum}', true, true, 0, NOW(), NOW(), NOW(), NOW())`;
  }).join(',\n    ');

  const preferencesValues = users.map(user => {
    return `('${user.userId}'::uuid, 18, 40, 100, '${user.gender === 'male' ? 'female' : 'male'}', NOW())`;
  }).join(',\n    ');

  return `-- Create profiles and preferences for ${users.length} load test users
-- Generated automatically

-- Profiles
INSERT INTO profiles (
  id, name, age, bio, gender, location, latitude, longitude, 
  photo, onboarding_completed, is_online, visibility_penalty,
  created_at, updated_at, last_active_at
)
VALUES
    ${profilesValues}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  age = EXCLUDED.age,
  bio = EXCLUDED.bio,
  gender = EXCLUDED.gender,
  location = EXCLUDED.location,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  onboarding_completed = true,
  is_online = true,
  updated_at = NOW();

-- Preferences
INSERT INTO user_preferences (
  user_id, min_age, max_age, max_distance, gender_preference, updated_at
)
VALUES
    ${preferencesValues}
ON CONFLICT (user_id) DO UPDATE SET
  min_age = EXCLUDED.min_age,
  max_age = EXCLUDED.max_age,
  max_distance = EXCLUDED.max_distance,
  gender_preference = EXCLUDED.gender_preference,
  updated_at = NOW();
`;
}

async function main() {
  try {
    // Step 1: Create auth users
    const users = await createAllUsers();

    // Step 2: Generate migration SQL
    console.log('📊 Generating migration SQL...');
    const migrationSQL = generateMigrationSQL(users);

    // Step 3: Save migration file
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', `20250108_create_load_test_users.sql`);
    fs.writeFileSync(migrationPath, migrationSQL);
    console.log(`💾 Migration saved: ${path.basename(migrationPath)}\n`);

    // Step 4: Save user list
    fs.writeFileSync(
      path.join(__dirname, 'load-test-users.json'),
      JSON.stringify(users.map(u => ({ email: u.email, password: u.password, userId: u.userId })), null, 2)
    );
    console.log(`💾 User list saved: tests/load-test-users.json\n`);

    console.log('✅ Setup complete!');
    console.log(`   ${users.length} users created`);
    console.log(`   Migration ready to apply via Supabase MCP\n`);
    console.log('💡 Next: Apply the migration using Supabase MCP to set up profiles and preferences');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { createAllUsers, generateMigrationSQL };

