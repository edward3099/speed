/**
 * Setup Test Users Script
 * Run with: node tests/setup-users.js
 * 
 * Creates test users and their profiles in Supabase
 */

const { createClient } = require('@supabase/supabase-js');

// Read from .env.local manually (no dotenv dependency)
const fs = require('fs');
const path = require('path');

let supabaseUrl, supabaseServiceKey;

try {
  const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
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

// Use service role key for admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const testUsers = [
  {
    email: 'testuser1@example.com',
    password: 'testpass123',
    name: 'Test User 1',
    gender: 'male',
    age: 25,
    bio: 'Test bio for automated testing',
    country: 'United States',
    city: 'New York',
    latitude: 40.7128,
    longitude: -74.0060,
  },
  {
    email: 'testuser2@example.com',
    password: 'testpass123',
    name: 'Test User 2',
    gender: 'female',
    age: 23,
    bio: 'Test bio for automated testing',
    country: 'United States',
    city: 'Los Angeles',
    latitude: 34.0522,
    longitude: -118.2437,
  },
];

async function setupUsers() {
  console.log('🚀 Setting up test users...\n');

  for (const user of testUsers) {
    try {
      console.log(`📝 Setting up ${user.email}...`);

      // Check if user already exists
      const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
      let existingUser = existingUsers?.users?.find(u => u.email === user.email);
      
      let userId;

      if (existingUser) {
        // User exists, update password if needed
        console.log(`  ℹ️  User exists, updating...`);
        userId = existingUser.id;
        
        // Update password using admin API
        const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
          password: user.password,
          email_confirm: true, // Auto-confirm email
        });
        
        if (updateError) {
          console.log(`  ⚠️  Could not update password: ${updateError.message}`);
        } else {
          console.log(`  ✅ Password updated`);
        }
      } else {
        // Create user using admin API (backend creation)
        console.log(`  🔨 Creating user via admin API...`);
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email: user.email,
          password: user.password,
          email_confirm: true, // Auto-confirm email
        });

        if (createError) {
          throw new Error(`Failed to create user: ${createError.message}`);
        }

        if (!newUser.user) {
          throw new Error('User creation returned no user');
        }

        userId = newUser.user.id;
        console.log(`  ✅ User created via backend: ${userId}`);
      }

      // Create/update profile (backend creation)
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          name: user.name,
          age: user.age,
          bio: user.bio,
          gender: user.gender,
          location: `${user.city}, ${user.country}`,
          latitude: user.latitude,
          longitude: user.longitude,
          photo: `https://i.pravatar.cc/150?img=${user.gender === 'male' ? 15 : 20}`,
          onboarding_completed: true,
          is_online: true,
          visibility_penalty: 0,
          last_active_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id'
        });

      if (profileError) {
        throw new Error(`Profile error: ${profileError.message}`);
      }
      console.log(`  ✅ Profile created/updated`);

      // Create/update preferences (backend creation)
      const genderPreference = user.gender === 'male' ? 'female' : 'male';
      const { error: prefError } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: userId,
          min_age: user.gender === 'male' ? 18 : 20,
          max_age: user.gender === 'male' ? 30 : 35,
          max_distance: user.gender === 'male' ? 50 : 75,
          gender_preference: genderPreference,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (prefError) {
        console.log(`  ⚠️  Preferences error: ${prefError.message}`);
      } else {
        console.log(`  ✅ Preferences set`);
      }

      console.log(`  ✅ ${user.email} ready!\n`);

    } catch (error) {
      console.error(`  ❌ Error: ${error.message}\n`);
    }
  }

  console.log('✅ Test user setup complete!');
}

setupUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  });

