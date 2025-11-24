/**
 * Create 500 Test Users using Supabase Admin API + MCP
 * 250 males and 250 females
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const TOTAL_USERS = 500;
const MALES = 250;
const FEMALES = 250;

// Read environment variables
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

async function createUsers() {
  console.log(`🚀 Creating ${TOTAL_USERS} users (${MALES} males, ${FEMALES} females)...\n`);

  const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
    console.error('   This is required to create users via Admin API');
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

  // Create males first (0-249)
  console.log(`📝 Creating ${MALES} male users...`);
  for (let i = 0; i < MALES; i++) {
    const email = `loadtestmale${i}@example.com`;
    const password = `testpass${i}`;
    const age = 20 + (i % 20); // Ages 20-39

    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error) {
        if (error.message.includes('already registered')) {
          // User exists, get ID
          const { data: existingUsers } = await supabase.auth.admin.listUsers();
          const existingUser = existingUsers?.users?.find(u => u.email === email);
          if (existingUser) {
            createdUsers.push({
              email,
              password,
              userId: existingUser.id,
              gender: 'male',
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
          gender: 'male',
          age,
        });
      }

      if ((i + 1) % 50 === 0) {
        console.log(`  ✅ Created ${i + 1}/${MALES} male users...`);
      }
    } catch (err: any) {
      errors.push({ email, error: err.message });
    }

    // Small delay to avoid rate limiting
    if (i % 10 === 0 && i > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`✅ Created ${createdUsers.length} male users\n`);

  // Create females (250-499)
  console.log(`📝 Creating ${FEMALES} female users...`);
  for (let i = 0; i < FEMALES; i++) {
    const email = `loadtestfemale${i}@example.com`;
    const password = `testpass${i + 250}`;
    const age = 20 + (i % 20); // Ages 20-39

    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error) {
        if (error.message.includes('already registered')) {
          // User exists, get ID
          const { data: existingUsers } = await supabase.auth.admin.listUsers();
          const existingUser = existingUsers?.users?.find(u => u.email === email);
          if (existingUser) {
            createdUsers.push({
              email,
              password,
              userId: existingUser.id,
              gender: 'female',
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
          gender: 'female',
          age,
        });
      }

      if ((i + 1) % 50 === 0) {
        console.log(`  ✅ Created ${i + 1}/${FEMALES} female users...`);
      }
    } catch (err: any) {
      errors.push({ email, error: err.message });
    }

    // Small delay to avoid rate limiting
    if (i % 10 === 0 && i > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`✅ Created ${createdUsers.length} total users\n`);

  // Now use Supabase MCP to create profiles and preferences via SQL
  console.log('📊 Setting up profiles and preferences via Supabase MCP...\n');

  // Prepare SQL for bulk insert
  const profilesSQL = createdUsers.map(user => {
    const genderNum = user.gender === 'male' ? 15 : 20;
    return `(
      '${user.userId}'::uuid,
      'Load Test ${user.gender === 'male' ? 'Male' : 'Female'} User ${user.email.match(/\d+/)?.[0] || ''}',
      ${user.age},
      'Load test user',
      '${user.gender}',
      'Test Location',
      ${40.7128 + (parseInt(user.email.match(/\d+/)?.[0] || '0') % 10) * 0.1},
      ${-74.0060 + (parseInt(user.email.match(/\d+/)?.[0] || '0') % 10) * 0.1},
      'https://i.pravatar.cc/150?img=${genderNum}',
      true,
      true,
      0,
      NOW(),
      NOW(),
      NOW(),
      NOW()
    )`;
  }).join(',\n    ');

  const preferencesSQL = createdUsers.map(user => {
    return `(
      '${user.userId}'::uuid,
      18,
      40,
      100,
      '${user.gender === 'male' ? 'female' : 'male'}',
      NOW()
    )`;
  }).join(',\n    ');

  const migrationSQL = `
-- Create profiles for all load test users
INSERT INTO profiles (
  id, name, age, bio, gender, location, latitude, longitude, 
  photo, onboarding_completed, is_online, visibility_penalty,
  created_at, updated_at, last_active_at
)
VALUES
    ${profilesSQL}
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

-- Create preferences for all load test users
INSERT INTO user_preferences (
  user_id, min_age, max_age, max_distance, gender_preference, updated_at
)
VALUES
    ${preferencesSQL}
ON CONFLICT (user_id) DO UPDATE SET
  min_age = EXCLUDED.min_age,
  max_age = EXCLUDED.max_age,
  max_distance = EXCLUDED.max_distance,
  gender_preference = EXCLUDED.gender_preference,
  updated_at = NOW();
`;

  // Save migration SQL to file
  fs.writeFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', `20250108_create_load_test_users.sql`),
    migrationSQL
  );

  console.log('💾 Migration SQL saved. Now applying via Supabase MCP...\n');

  // Save user list for tests
  fs.writeFileSync(
    path.join(__dirname, 'load-test-users.json'),
    JSON.stringify(createdUsers.map(u => ({ email: u.email, password: u.password, userId: u.userId })), null, 2)
  );

  console.log(`✅ User list saved to tests/load-test-users.json`);
  console.log(`   Total: ${createdUsers.length} users (${createdUsers.filter(u => u.gender === 'male').length} males, ${createdUsers.filter(u => u.gender === 'female').length} females)`);
  console.log(`   Errors: ${errors.length}\n`);

  if (errors.length > 0 && errors.length <= 10) {
    console.log('⚠️  Sample errors:');
    errors.slice(0, 5).forEach((err, i) => {
      console.log(`  ${i + 1}. ${err.email}: ${err.error}`);
    });
  }

  return { createdUsers, migrationSQL };
}

// Run if called directly
if (require.main === module) {
  createUsers()
    .then(({ createdUsers, migrationSQL }) => {
      console.log('\n✅ User creation complete!');
      console.log(`   Created ${createdUsers.length} users`);
      console.log(`   Migration file ready: supabase/migrations/20250108_create_load_test_users.sql`);
      console.log('\n💡 Next step: Apply the migration via Supabase MCP to set up profiles and preferences');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed:', error);
      process.exit(1);
    });
}

export { createUsers };

