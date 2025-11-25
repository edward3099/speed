/**
 * Global Test Setup
 * Runs once before all tests
 */

export async function setup() {
  console.log('🚀 Global test setup starting...');
  
  // Verify Supabase connection
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Missing Supabase credentials. Some tests may fail.');
  } else {
    console.log('✅ Supabase credentials found');
  }
  
  console.log('✅ Global setup complete');
}

