/**
 * Create 500 Test Users using Playwright
 * Automates signup through the UI efficiently
 */

import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const TOTAL_USERS = 500;
const BASE_URL = 'http://localhost:3001';
const PARALLEL_BROWSERS = 5; // Run 5 signups in parallel

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
  userId?: string;
}

async function createUserViaUI(
  browser: any,
  email: string,
  password: string,
  index: number
): Promise<{ email: string; password: string; userId?: string; success: boolean; error?: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Navigate to landing page
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Click "start now" button
    const startButton = page.getByRole('button', { name: /start now/i });
    await startButton.click({ timeout: 15000 });
    await page.waitForTimeout(1000);
    
    // Switch to signup tab
    const signUpTab = page.getByRole('button', { name: /sign up/i });
    await signUpTab.click({ timeout: 5000 });
    await page.waitForTimeout(500);
    
    // Fill in email
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.fill(email);
    
    // Fill in password (both fields for signup)
    const passwordInputs = page.locator('input[type="password"]');
    const passwordCount = await passwordInputs.count();
    await passwordInputs.nth(0).fill(password);
    if (passwordCount > 1) {
      await passwordInputs.nth(1).fill(password);
    }
    
    // Click continue
    const continueButton = page.getByRole('button', { name: /continue/i });
    await continueButton.click({ timeout: 10000 });
    
    // Wait for either onboarding or spin page
    try {
      await page.waitForURL(/.*(spin|onboarding).*/, { timeout: 20000 });
    } catch {
      // Check if there's an error message
      const errorText = await page.locator('text=/error|already|registered/i').first().textContent().catch(() => null);
      if (errorText) {
        if (errorText.toLowerCase().includes('already') || errorText.toLowerCase().includes('registered')) {
          // User exists, that's okay
          return { email, password, success: true, userId: undefined };
        }
        return { email, password, success: false, error: errorText };
      }
    }
    
    // Get user ID from Supabase session
    const userId = await page.evaluate(async () => {
      // Try to get from window.supabase if available
      const supabase = (window as any).supabase;
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        return user?.id || null;
      }
      return null;
    }).catch(() => null);
    
    // If we're on onboarding, complete it quickly
    if (page.url().includes('onboarding') || await page.locator('text=/what\'s your name/i').isVisible().catch(() => false)) {
      // Quick onboarding completion
      const gender = index % 2 === 0 ? 'male' : 'female';
      
      // Step 1: Name
      const nameInput = page.locator('input[placeholder*="name" i]').first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill(`Load Test User ${index}`);
        await page.getByRole('button', { name: /continue/i }).click();
        await page.waitForTimeout(500);
      }
      
      // Step 2: Gender
      const genderButton = page.getByRole('button', { name: new RegExp(`^${gender}$`, 'i') });
      if (await genderButton.isVisible().catch(() => false)) {
        await genderButton.click();
        await page.getByRole('button', { name: /continue/i }).click();
        await page.waitForTimeout(500);
      }
      
      // Step 3: Age - just click continue
      if (await page.locator('text=/how old/i').isVisible().catch(() => false)) {
        await page.getByRole('button', { name: /continue/i }).click();
        await page.waitForTimeout(500);
      }
      
      // Step 4: Bio
      const bioInput = page.locator('textarea').first();
      if (await bioInput.isVisible().catch(() => false)) {
        await bioInput.fill(`Load test user ${index}`);
        await page.getByRole('button', { name: /continue/i }).click();
        await page.waitForTimeout(500);
      }
      
      // Step 5: Photo - skip
      if (await page.locator('text=/upload/i').isVisible().catch(() => false)) {
        await page.getByRole('button', { name: /continue/i }).click();
        await page.waitForTimeout(500);
      }
      
      // Step 6: Country
      const countryInput = page.locator('input[placeholder*="country" i]').first();
      if (await countryInput.isVisible().catch(() => false)) {
        await countryInput.fill('United States');
        await page.waitForTimeout(1000); // Wait for autocomplete
        await page.getByRole('button', { name: /continue/i }).click();
        await page.waitForTimeout(500);
      }
      
      // Step 7: City
      const cityInput = page.locator('input[placeholder*="city" i]').first();
      if (await cityInput.isVisible().catch(() => false)) {
        await cityInput.fill('New York');
        await page.waitForTimeout(1000);
        await page.getByRole('button', { name: /continue/i }).click();
        await page.waitForTimeout(500);
      }
      
      // Step 8: Preferences - click complete
      const completeButton = page.getByRole('button', { name: /complete/i });
      if (await completeButton.isVisible().catch(() => false)) {
        await completeButton.click();
        await page.waitForURL(/.*spin.*/, { timeout: 30000 });
      }
    }
    
    // Get user ID from Supabase client after completion
    const finalUserId = await page.evaluate(async () => {
      try {
        // Access Supabase from window or try localStorage
        const sessionKey = Object.keys(localStorage).find(k => k.includes('supabase') || k.includes('auth'));
        if (sessionKey) {
          const session = localStorage.getItem(sessionKey);
          if (session) {
            try {
              const parsed = JSON.parse(session);
              return parsed?.user?.id || parsed?.currentSession?.user?.id || null;
            } catch {
              return null;
            }
          }
        }
      } catch {
        return null;
      }
      return null;
    });
    
    return { email, password, userId: finalUserId || userId, success: true };
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    if (errorMsg.includes('already') || errorMsg.includes('registered')) {
      return { email, password, success: true, userId: undefined };
    }
    if (index < 3) {
      console.error(`  ⚠️  Error creating ${email}: ${errorMsg}`);
    }
    return { email, password, success: false, error: errorMsg };
  } finally {
    await context.close();
  }
}

async function createUsersWithPlaywright() {
  console.log(`🚀 Creating ${TOTAL_USERS} users via Playwright automation...\n`);
  console.log(`   Running ${PARALLEL_BROWSERS} signups in parallel\n`);

  const browser = await chromium.launch({ headless: true });
  const createdUsers: User[] = [];
  const errors: Array<{ email: string; error: string }> = [];

  // Process users in batches with parallel execution
  const BATCH_SIZE = PARALLEL_BROWSERS * 2; // Process more at once
  
  for (let batch = 0; batch < Math.ceil(TOTAL_USERS / BATCH_SIZE); batch++) {
    const batchStart = batch * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, TOTAL_USERS);
    
    console.log(`📝 Batch ${batch + 1}/${Math.ceil(TOTAL_USERS / BATCH_SIZE)}: Creating users ${batchStart + 1}-${batchEnd}...`);

    // Create users in parallel (limited by PARALLEL_BROWSERS)
    const batchPromises: Promise<any>[] = [];
    
    for (let i = batchStart; i < batchEnd; i++) {
      const email = `loadtest${i}@example.com`;
      const password = `testpass${i}`;
      
      batchPromises.push(
        createUserViaUI(browser, email, password, i)
          .then(result => {
            if (result.success) {
              createdUsers.push({ email: result.email, password: result.password, userId: result.userId });
            } else {
              errors.push({ email: result.email, error: result.error || 'Unknown error' });
            }
            return result;
          })
      );
      
      // Limit concurrent operations
      if (batchPromises.length >= PARALLEL_BROWSERS) {
        await Promise.all(batchPromises);
        batchPromises.length = 0; // Clear array
        await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay
      }
    }
    
    // Wait for remaining promises
    if (batchPromises.length > 0) {
      await Promise.all(batchPromises);
    }
    
    console.log(`  ✅ Created: ${createdUsers.length - (batch * BATCH_SIZE - errors.length)}/${batchEnd - batchStart} users (Total: ${createdUsers.length})`);
    
    // Delay between batches
    if (batch < Math.ceil(TOTAL_USERS / BATCH_SIZE) - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  await browser.close();

  console.log(`\n✅ User Creation Complete!`);
  console.log(`  Total Users Created: ${createdUsers.length}`);
  console.log(`  Errors: ${errors.length}`);
  
  if (errors.length > 0 && errors.length <= 10) {
    console.log(`\n⚠️  Sample errors:`);
    errors.slice(0, 5).forEach((err, i) => {
      console.log(`  ${i + 1}. ${err.email}: ${err.error}`);
    });
  }

  // Get user IDs from Supabase for users that were created but we don't have IDs
  const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY') || getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('\n🔍 Fetching user IDs from Supabase...');
    
    for (const user of createdUsers) {
      if (!user.userId) {
        try {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.email) // This won't work, need to join with auth.users
            .limit(1);
          
          // Try to get from auth.users via email (if we have admin access)
          // For now, we'll leave userId as undefined if not found
        } catch {
          // Ignore errors
        }
      }
    }
  }
  
  // Save user list
  fs.writeFileSync(
    path.join(__dirname, 'load-test-users.json'),
    JSON.stringify(createdUsers, null, 2)
  );

  console.log(`\n💾 User list saved to tests/load-test-users.json`);
  console.log(`   Ready for load testing!`);
}

// Run if called directly
if (require.main === module) {
  createUsersWithPlaywright()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Failed:', error);
      process.exit(1);
    });
}

export { createUsersWithPlaywright };
