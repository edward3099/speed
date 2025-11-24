/**
 * Scenario-Based Test Runner
 * 
 * Runs test scenarios using the scenario framework
 */

import { test, expect } from '@playwright/test';
import { ScenarioFramework } from './scenario-framework';
import { SCENARIOS, getScenariosByPriority } from './scenarios';
import * as fs from 'fs';
import * as path from 'path';

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

test.describe('Scenario-Based Testing', () => {
  test('Run all high-priority scenarios', async () => {
    test.setTimeout(900000); // 15 minutes (increased for retry logic)

    const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
    }

    const framework = new ScenarioFramework(supabaseUrl, supabaseKey);
    
    // Load test users
    await framework.loadTestUsers();

    // Get high-priority scenarios
    const highPriorityScenarios = getScenariosByPriority('high');
    console.log(`\n🚀 Running ${highPriorityScenarios.length} high-priority scenarios...\n`);

    const results = [];

    for (const scenario of highPriorityScenarios) {
      const result = await framework.runScenario(scenario);
      framework.printResult(result);
      results.push(result);
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 SCENARIO TEST SUMMARY');
    console.log('='.repeat(80));
    
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n✅ Passed: ${passed}/${results.length}`);
    console.log(`❌ Failed: ${failed}/${results.length}`);
    
    console.log(`\n📈 Results by scenario:`);
    results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`   ${status} ${result.scenario.name}: ${result.actual.pairsCreated} pairs, ${result.duration.toFixed(2)}s`);
    });

    // Assertions
    expect(passed).toBeGreaterThan(0); // At least one scenario should pass
    expect(failed).toBeLessThan(results.length); // Not all should fail
  });

  test('Run specific scenario: Gender Imbalance - Extreme Male Majority', async () => {
    test.setTimeout(300000); // 5 minutes

    const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
    }

    const framework = new ScenarioFramework(supabaseUrl, supabaseKey);
    await framework.loadTestUsers();

    const scenario = SCENARIOS.find(s => s.name === 'Gender Imbalance - Extreme Male Majority');
    if (!scenario) {
      throw new Error('Scenario not found');
    }

    const result = await framework.runScenario(scenario);
    framework.printResult(result);

    expect(result.success).toBe(true);
    expect(result.actual.duplicateUsers.length).toBe(0);
    expect(result.actual.pairsCreated).toBe(50);
  });
});

