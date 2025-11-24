/**
 * Create Test Users in Backend
 * Uses Supabase MCP or direct SQL to create users
 * Run with: node tests/create-users-backend.js
 */

// This script will be used by tests to ensure users exist
// For now, we'll use SQL to create profiles/preferences for existing users
// and document that users should be created via Supabase Admin API

const testUsers = [
  {
    email: 'testuser1@example.com',
    password: 'testpass123',
    name: 'Test User 1',
    gender: 'male',
    age: 25,
    bio: 'Test bio for automated testing',
    location: 'New York, United States',
    latitude: 40.7128,
    longitude: -74.0060,
    gender_preference: 'female',
    min_age: 18,
    max_age: 30,
    max_distance: 50,
  },
  {
    email: 'testuser2@example.com',
    password: 'testpass123',
    name: 'Test User 2',
    gender: 'female',
    age: 23,
    bio: 'Test bio for automated testing',
    location: 'Los Angeles, United States',
    latitude: 34.0522,
    longitude: -118.2437,
    gender_preference: 'male',
    min_age: 20,
    max_age: 35,
    max_distance: 75,
  },
];

console.log('📋 Test Users Configuration:');
console.log(JSON.stringify(testUsers, null, 2));
console.log('\n💡 Note: Users must be created via Supabase Admin API first.');
console.log('   Then run the SQL script to create profiles and preferences.');
console.log('\n✅ Use Supabase MCP or Admin Dashboard to create users:');
testUsers.forEach(user => {
  console.log(`   - ${user.email} (${user.gender}, prefers ${user.gender_preference})`);
});

