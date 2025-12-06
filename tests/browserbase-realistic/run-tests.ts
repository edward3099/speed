#!/usr/bin/env tsx
/**
 * Run Realistic Browserbase Tests
 * 
 * This script orchestrates multiple browser sessions using Browserbase MCP
 * to test the app with realistic user behavior.
 * 
 * Usage:
 *   npm run test:browserbase:realistic
 *   npm run test:browserbase:scenario -- "Both Users Vote Yes"
 */

import { RealisticTestOrchestrator } from './orchestrator'
import { allScenarios, scenarioBothYes, scenarioYesPass, scenarioBothPass } from './scenarios'

// Test user credentials (should be created in Supabase)
const TEST_USERS = [
  {
    email: process.env.TEST_USER1_EMAIL || 'testuser1@example.com',
    password: process.env.TEST_USER1_PASSWORD || 'testpass123',
  },
  {
    email: process.env.TEST_USER2_EMAIL || 'testuser2@example.com',
    password: process.env.TEST_USER2_PASSWORD || 'testpass123',
  },
  {
    email: process.env.TEST_USER3_EMAIL || 'testuser3@example.com',
    password: process.env.TEST_USER3_PASSWORD || 'testpass123',
  },
  {
    email: process.env.TEST_USER4_EMAIL || 'testuser4@example.com',
    password: process.env.TEST_USER4_PASSWORD || 'testpass123',
  },
]

async function main() {
  console.log('🚀 Starting Realistic Browserbase Tests')
  console.log('=' .repeat(60))

  // Check if server is running
  const APP_URL = process.env.TEST_APP_URL || 'http://localhost:3000'
  try {
    const response = await fetch(APP_URL)
    if (!response.ok) {
      throw new Error(`Server not responding: ${response.status}`)
    }
    console.log(`✅ Server is running at ${APP_URL}`)
  } catch (error: any) {
    console.error(`❌ Server is not running at ${APP_URL}`)
    console.error('Please start the server with: npm run dev')
    process.exit(1)
  }

  // Initialize orchestrator
  const orchestrator = new RealisticTestOrchestrator(TEST_USERS)

  // Get scenario from command line or run all
  const scenarioName = process.argv[2]
  let scenariosToRun = allScenarios

  if (scenarioName) {
    const scenario = allScenarios.find(s => 
      s.name.toLowerCase().includes(scenarioName.toLowerCase())
    )
    if (scenario) {
      scenariosToRun = [scenario]
      console.log(`🎯 Running single scenario: ${scenario.name}`)
    } else {
      console.error(`❌ Scenario not found: ${scenarioName}`)
      console.log('Available scenarios:')
      allScenarios.forEach(s => console.log(`  - ${s.name}`))
      process.exit(1)
    }
  } else {
    console.log(`📋 Running ${scenariosToRun.length} scenarios`)
  }

  // Run scenarios
  const results = await orchestrator.runScenarios(scenariosToRun)

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 Test Summary')
  console.log('='.repeat(60))
  console.log(`✅ Passed: ${results.passed}`)
  console.log(`❌ Failed: ${results.failed}`)
  console.log(`⏱️  Total Duration: ${(results.totalDuration / 1000).toFixed(2)}s`)

  if (results.failed > 0) {
    console.log('\n❌ Failed Scenarios:')
    results.results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`  - ${r.scenario}`)
        r.errors.forEach(e => console.log(`    Error: ${e}`))
      })
  }

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0)
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  })
}

export { main }

