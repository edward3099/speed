/**
 * Create 500 Users and Apply via Supabase MCP
 * This script creates users via Admin API, then uses MCP to set up profiles
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const TOTAL_USERS = 500;
const MALES = 250;
const FEMALES = 250;

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
    // Fall back to process.env
  }
  return process.env[key] || '';
}

interface User {
  email: string;
  password: string;
  userId: string;
  gender: 'male' | 'female';
  age: number;
}

async function createUsersAndGenerateSQL() {
  console.log(`🚀 Creating ${TOTAL_USERS} users (${MALES} males, ${FEMALES} females)...\n`);

  const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL');
    process.exit(1);
  }

  if (!supabaseServiceKey) {
    console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY');
    console.error('   Please add SUPABASE_SERVICE_ROLE_KEY to .env.local');
    console.error('   You can find it in Supabase Dashboard > Settings > API');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const createdUsers: User[] = [];
  const errors: Array<{ email: string; error: string }> = [];

  // Create all users
  console.log(`📝 Creating users via Admin API...\n`);
  
  for (let i = 0; i < TOTAL_USERS; i++) {
    const isMale = i < MALES;
    const email = isMale 
      ? `loadtestmale${i}@example.com`
      : `loadtestfemale${i - MALES}@example.com`;
    const password = `testpass${i}`;
    const gender = isMale ? 'male' : 'female';
    const age = 20 + (i % 20); // Ages 20-39

    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error) {
        if (error.message.includes('already registered') || error.message.includes('User already registered')) {
          // User exists, try to get ID
          const { data: existingUsers } = await supabase.auth.admin.listUsers();
          const existingUser = existingUsers?.users?.find(u => u.email === email);
          if (existingUser) {
            createdUsers.push({
              email,
              password,
              userId: existingUser.id,
              gender,
              age,
            });
            continue;
          }
        }
        errors.push({ email, error: error.message });
        continue;
      }

      if (data?.user) {
        createdUsers.push({
          email,
          password,
          userId: data.user.id,
          gender,
          age,
        });
      }

      if ((i + 1) % 50 === 0) {
        console.log(`  ✅ Created ${i + 1}/${TOTAL_USERS} users...`);
      }
    } catch (err: any) {
      errors.push({ email, error: err.message });
    }

    // Small delay to avoid rate limiting
    if (i % 10 === 0 && i > 0) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  console.log(`\n✅ Created ${createdUsers.length} users`);
  console.log(`   Males: ${createdUsers.filter(u => u.gender === 'male').length}`);
  console.log(`   Females: ${createdUsers.filter(u => u.gender === 'female').length}`);
  console.log(`   Errors: ${errors.length}\n`);

  // Generate SQL for profiles and preferences
  console.log('📊 Generating SQL for profiles and preferences...\n');

  const profilesValues = createdUsers.map(user => {
    const index = parseInt(user.email.match(/\d+/)?.[0] || '0');
    const genderNum = user.gender === 'male' ? 15 : 20;
    return `('${user.userId}'::uuid, 'Load Test ${user.gender === 'male' ? 'Male' : 'Female'} User ${index}', ${user.age}, 'Load test user', '${user.gender}', 'Test Location', ${40.7128 + (index % 10) * 0.1}, ${-74.0060 + (index % 10) * 0.1}, 'https://i.pravatar.cc/150?img=${genderNum}', true, true, 0, NOW(), NOW(), NOW(), NOW())`;
  }).join(',\n    ');

  const preferencesValues = createdUsers.map(user => {
    return `('${user.userId}'::uuid, 18, 40, 100, '${user.gender === 'male' ? 'female' : 'male'}', NOW())`;
  }).join(',\n    ');

  const migrationSQL = `-- Create profiles for ${createdUsers.length} load test users
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

-- Create preferences for ${createdUsers.length} load test users
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

  // Save migration
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', `20250108_create_load_test_users.sql`);
  fs.writeFileSync(migrationPath, migrationSQL);
  console.log(`💾 Migration saved: ${migrationPath}\n`);

  // Save user list
  fs.writeFileSync(
    path.join(__dirname, 'load-test-users.json'),
    JSON.stringify(createdUsers.map(u => ({ email: u.email, password: u.password, userId: u.userId })), null, 2)
  );
  console.log(`💾 User list saved: tests/load-test-users.json\n`);

  return { createdUsers, migrationSQL };
}

if (require.main === module) {
  createUsersAndGenerateSQL()
    .then(({ createdUsers, migrationSQL }) => {
      console.log('✅ Setup complete!');
      console.log(`   ${createdUsers.length} users created`);
      console.log(`   Migration file ready for MCP application\n`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed:', error);
      process.exit(1);
    });
}

export { createUsersAndGenerateSQL };

