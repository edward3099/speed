/**
 * Create 500 Test Users for Load Testing
 * Uses Supabase MCP to create users directly in the backend
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read environment variables
function getEnvVar(key) {
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

const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
const supabaseServiceKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY') || getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const TOTAL_USERS = 500;
const BATCH_SIZE = 50;

async function createUsers() {
  console.log(`🚀 Creating ${TOTAL_USERS} test users for load testing...\n`);

  const createdUsers = [];
  const errors = [];

  for (let batch = 0; batch < Math.ceil(TOTAL_USERS / BATCH_SIZE); batch++) {
    const batchStart = batch * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, TOTAL_USERS);
    
    console.log(`📝 Batch ${batch + 1}/${Math.ceil(TOTAL_USERS / BATCH_SIZE)}: Creating users ${batchStart + 1}-${batchEnd}...`);

    const batchPromises = [];
    
    for (let i = batchStart; i < batchEnd; i++) {
      const email = `loadtest${i}@example.com`;
      const password = `testpass${i}`;
      const gender = i % 2 === 0 ? 'male' : 'female';
      const age = 20 + (i % 20); // Ages 20-39
      
      const promise = supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }).then(async ({ data, error }) => {
        if (error) {
          // Check if user already exists
          if (error.message.includes('already registered') || error.message.includes('User already registered')) {
            // User exists, try to get the user ID
            try {
              const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
              if (!listError && existingUsers?.users) {
                const existingUser = existingUsers.users.find(u => u.email === email);
                if (existingUser) {
                  return { userId: existingUser.id, email, created: false };
                }
              }
            } catch (listErr) {
              // If we can't list users, try to find via profiles
              const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('id', email) // This won't work, but let's try a different approach
                .maybeSingle();
            }
          }
          
          // Log first few errors for debugging
          if (i < 3) {
            console.log(`  ⚠️  Error creating ${email}: ${error.message} (code: ${error.status || 'N/A'})`);
          }
          errors.push({ email, error: error.message, code: error.status });
          return null;
        }

        if (!data?.user) {
          errors.push({ email, error: 'No user returned' });
          return null;
        }

        const userId = data.user.id;

        // Create profile
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: userId,
          name: `Load Test User ${i}`,
          age,
          bio: `Load test user ${i}`,
          gender,
          location: 'Test Location',
          latitude: 40.7128 + (i % 10) * 0.1,
          longitude: -74.0060 + (i % 10) * 0.1,
          photo: 'https://i.pravatar.cc/150',
          onboarding_completed: true,
          is_online: true,
          visibility_penalty: 0,
          last_active_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (profileError) {
          errors.push({ email, error: `Profile: ${profileError.message}` });
        }

        // Create preferences
        const { error: prefError } = await supabase.from('user_preferences').upsert({
          user_id: userId,
          min_age: 18,
          max_age: 40,
          max_distance: 100,
          gender_preference: gender === 'male' ? 'female' : 'male',
          updated_at: new Date().toISOString(),
        });

        if (prefError) {
          errors.push({ email, error: `Preferences: ${prefError.message}` });
        }

        return { userId, email, created: true };
      }).catch(err => {
        errors.push({ email, error: err.message });
        return null;
      });

      batchPromises.push(promise);
    }

    const batchResults = await Promise.all(batchPromises);
    const batchCreated = batchResults.filter(r => r !== null);
    createdUsers.push(...batchCreated);
    
    console.log(`  ✅ Created/Found: ${batchCreated.length}/${batchEnd - batchStart} users`);
    
    // Small delay between batches
    if (batch < Math.ceil(TOTAL_USERS / BATCH_SIZE) - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\n✅ User Creation Complete!`);
  console.log(`  Total Users: ${createdUsers.length}`);
  console.log(`  Errors: ${errors.length}`);
  
  if (errors.length > 0 && errors.length <= 10) {
    console.log(`\n⚠️  Sample errors:`);
    errors.slice(0, 5).forEach((err, i) => {
      console.log(`  ${i + 1}. ${err.email}: ${err.error}`);
    });
  }

  // Save user list for the test
  const userList = createdUsers.map(u => ({
    email: u.email,
    userId: u.userId,
  }));

  fs.writeFileSync(
    path.join(__dirname, 'load-test-users.json'),
    JSON.stringify(userList, null, 2)
  );

  console.log(`\n💾 User list saved to tests/load-test-users.json`);
  console.log(`   Ready for load testing!`);
}

createUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  });

