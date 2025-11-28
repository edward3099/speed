/**
 * Vitest Test Setup
 * 
 * Configures test environment, mocks, and utilities
 */

import { beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jzautphzcbtqplltsfse.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YXV0cGh6Y2J0cXBsbHRzZnNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzQ5NTc2NCwiZXhwIjoyMDc5MDcxNzY0fQ.3u57IsBUeJlHZ5IEbIFDtI9l3TSSeo_nDUBXYSiXh5k';

// Create Supabase client for tests
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Test user credentials
export const TEST_USERS = {
  user1: {
    email: process.env.TEST_USER1_EMAIL || 'testuser1@example.com',
    password: process.env.TEST_USER1_PASSWORD || 'testpass123',
  },
  user2: {
    email: process.env.TEST_USER2_EMAIL || 'testuser2@example.com',
    password: process.env.TEST_USER2_PASSWORD || 'testpass123',
  },
};

// Global test state
export const testState = {
  user1Id: null as string | null,
  user2Id: null as string | null,
};

beforeAll(async () => {
  console.log('🧪 Setting up test environment...');
  
  // Get user IDs - Use known test user IDs from database
  // These are the actual IDs from the database query
  try {
    // Known test user IDs (from Supabase query)
    const knownUserIds = {
      'testuser1@example.com': '5eb9f77c-a35b-47c5-ab33-929d7bd398f4',
      'testuser2@example.com': '076b3243-8f9a-4f05-9592-4f774944344e',
    };
    
    testState.user1Id = knownUserIds[TEST_USERS.user1.email] || null;
    testState.user2Id = knownUserIds[TEST_USERS.user2.email] || null;
    
    // Verify users exist in profiles table
    if (testState.user1Id && testState.user2Id) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .in('id', [testState.user1Id, testState.user2Id]);
      
      if (!profiles || profiles.length < 2) {
        console.warn('⚠️ Test users not found in profiles table');
        testState.user1Id = null;
        testState.user2Id = null;
      }
    }
    
    if (!testState.user1Id || !testState.user2Id) {
      console.warn('⚠️ Test users not found. Run: npm run test:setup-users');
    } else {
      console.log(`✅ Test users ready: ${testState.user1Id.substring(0, 8)}..., ${testState.user2Id.substring(0, 8)}...`);
    }
  } catch (error) {
    console.error('❌ Failed to setup test users:', error);
  }
});

afterAll(async () => {
  console.log('🧹 Cleaning up test environment...');
});

