/**
 * Authentication Helper for k6 Tests
 * Creates test users and authenticates them
 */

import http from 'k6/http';
import { check } from 'k6';

const SUPABASE_URL = __ENV.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';

/**
 * Create a test user and authenticate
 * Returns cookies for authenticated session
 */
export function authenticateUser(userId) {
  const email = `k6-test-${userId}@test.com`;
  const password = 'test-password-123';
  
  // Step 1: Sign up (or sign in if exists)
  const signUpRes = http.post(
    `${SUPABASE_URL}/auth/v1/signup`,
    JSON.stringify({
      email,
      password,
      data: { test_user: true }
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
    }
  );
  
  // Step 2: Sign in to get session
  const signInRes = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({
      email,
      password,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
    }
  );
  
  if (signInRes.status !== 200) {
    console.error(`❌ Failed to authenticate user ${userId}:`, signInRes.body);
    return null;
  }
  
  const authData = JSON.parse(signInRes.body);
  
  // Extract cookies from response
  const cookies = {};
  const setCookieHeaders = signInRes.headers['Set-Cookie'] || [];
  
  if (Array.isArray(setCookieHeaders)) {
    setCookieHeaders.forEach(cookie => {
      const parts = cookie.split(';')[0].split('=');
      if (parts.length === 2) {
        cookies[parts[0].trim()] = parts[1].trim();
      }
    });
  }
  
  // Return session info
  return {
    accessToken: authData.access_token,
    refreshToken: authData.refresh_token,
    userId: authData.user?.id || userId,
    cookies: cookies,
    email: email,
  };
}

/**
 * Create authenticated headers for API requests
 */
export function getAuthHeaders(session) {
  if (!session) return {};
  
  // For Next.js API routes, we need to set the Supabase session cookie
  // The cookie name is typically: sb-<project-ref>-auth-token
  const cookieString = Object.entries(session.cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  
  return {
    'Cookie': cookieString,
    'Authorization': `Bearer ${session.accessToken}`,
  };
}

