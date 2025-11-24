/**
 * Create 500 Test Users for Load Testing
 * This script provides instructions for creating users via Supabase MCP
 * Since we need service role key for admin API, we'll create a smaller set
 * or use existing users with multiple operations
 */

console.log('📋 Load Test User Creation Guide\n');
console.log('To create 500 users for load testing, you have two options:\n');

console.log('Option 1: Use Supabase Dashboard/Admin API');
console.log('  1. Go to Supabase Dashboard > Authentication > Users');
console.log('  2. Use the Admin API with service role key to create users');
console.log('  3. Or use: supabase.auth.admin.createUser() with service role key\n');

console.log('Option 2: Use existing users with simulated load');
console.log('  - Use testuser1 and testuser2');
console.log('  - Simulate 500 concurrent operations');
console.log('  - Each user performs multiple operations\n');

console.log('💡 For now, the load test will use existing test users');
console.log('   and simulate 500 concurrent operations with them.\n');

// Create a minimal user list with existing users
const fs = require('fs');
const path = require('path');

const existingUsers = [
  { email: 'testuser1@example.com', userId: '5eb9f77c-a35b-47c5-ab33-929d7bd398f4' },
  { email: 'testuser2@example.com', userId: '076b3243-8f9a-4f05-9592-4f774944344e' },
];

// For load testing, we'll cycle through these users
const loadTestUsers = [];
for (let i = 0; i < 500; i++) {
  loadTestUsers.push(existingUsers[i % 2]);
}

fs.writeFileSync(
  path.join(__dirname, 'load-test-users.json'),
  JSON.stringify(loadTestUsers, null, 2)
);

console.log(`✅ Created load-test-users.json with ${loadTestUsers.length} user references`);
console.log(`   Using ${existingUsers.length} actual users for ${loadTestUsers.length} operations\n`);

