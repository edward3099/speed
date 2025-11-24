/**
 * Test Scenario Definitions
 * 
 * Defines all test scenarios with their configurations
 */

import { ScenarioConfig } from './scenario-framework';

export const SCENARIOS: ScenarioConfig[] = [
  // ============================================================================
  // HIGH PRIORITY SCENARIOS
  // ============================================================================
  
  {
    name: 'Gender Imbalance - Extreme Male Majority',
    description: '200 males, 50 females - test system with extreme gender imbalance',
    priority: 'high',
    category: 'gender_imbalance',
    setup: {
      males: 200,
      females: 50,
      joinPattern: 'simultaneous',
    },
    expected: {
      exactPairs: 50,
      unmatchedUsers: 150, // All females matched, 150 males unmatched
      allowDuplicates: false,
    },
  },

  {
    name: 'Gender Imbalance - Extreme Female Majority',
    description: '50 males, 200 females - test system with extreme gender imbalance',
    priority: 'high',
    category: 'gender_imbalance',
    setup: {
      males: 50,
      females: 200,
      joinPattern: 'simultaneous',
    },
    expected: {
      exactPairs: 50,
      unmatchedUsers: 150, // All males matched, 150 females unmatched
      allowDuplicates: false,
    },
  },

  {
    name: 'Odd Number - Single Odd User',
    description: '250 males, 250 females (500 total) - test with even number (all should match)',
    priority: 'high',
    category: 'odd_numbers',
    setup: {
      males: 250,
      females: 250,
      joinPattern: 'simultaneous',
    },
    expected: {
      exactPairs: 250, // With 2% tolerance: 245-255 acceptable
      unmatchedUsers: 0, // With 5% tolerance: 0-12 acceptable
      allowDuplicates: false,
    },
  },

  {
    name: 'Odd Number - Single Unmatched User',
    description: '250 males, 249 females (499 total) - test with one unmatched user',
    priority: 'high',
    category: 'odd_numbers',
    setup: {
      males: 250,
      females: 249, // Creates odd total of 499
      joinPattern: 'simultaneous',
    },
    expected: {
      exactPairs: 249, // With 2% tolerance: 244-254 acceptable
      unmatchedUsers: 1, // With 5% tolerance: 0-6 acceptable (1-7 unmatched)
      allowDuplicates: false,
    },
  },

  {
    name: 'Single User Spinning',
    description: '1 user spinning alone - test graceful handling',
    priority: 'high',
    category: 'odd_numbers',
    setup: {
      males: 1,
      females: 0,
      joinPattern: 'simultaneous',
    },
    expected: {
      exactPairs: 0,
      unmatchedUsers: 1,
      allowDuplicates: false,
    },
  },

  {
    name: 'Immediate Leave After Pairing',
    description: 'Users pair then immediately leave voting window',
    priority: 'high',
    category: 'user_behavior',
    setup: {
      males: 50,
      females: 50,
      joinPattern: 'simultaneous',
      userBehavior: 'immediate_leave',
    },
    expected: {
      minPairs: 45, // Some pairs may be created before leaves
      allowDuplicates: false,
    },
  },

  {
    name: 'Rapid Queue Growth',
    description: '100 users join queue within 5 seconds',
    priority: 'high',
    category: 'queue_dynamics',
    setup: {
      males: 50,
      females: 50,
      joinPattern: 'simultaneous',
    },
    expected: {
      minPairs: 43, // 45 - 5% tolerance = 43
      allowDuplicates: false,
      maxDuration: 30, // Should complete quickly
    },
  },

  {
    name: 'Peak Hours Simulation',
    description: 'Simulate realistic peak hour activity with gradual joins',
    priority: 'high',
    category: 'natural_flow',
    setup: {
      males: 100,
      females: 100,
      joinPattern: 'gradual',
    },
    expected: {
      minPairs: 90,
      allowDuplicates: false,
    },
  },

  // ============================================================================
  // MEDIUM PRIORITY SCENARIOS
  // ============================================================================

  {
    name: 'Gender Imbalance + Odd Number',
    description: '201 males, 50 females (251 total) - test both conditions',
    priority: 'medium',
    category: 'complex',
    setup: {
      males: 201,
      females: 50,
      joinPattern: 'simultaneous',
    },
    expected: {
      exactPairs: 50,
      unmatchedUsers: 151,
      allowDuplicates: false,
    },
  },

  {
    name: 'Batch Arrivals',
    description: '5 batches of 20 users, 2 seconds apart',
    priority: 'medium',
    category: 'natural_flow',
    setup: {
      males: 50,
      females: 50,
      joinPattern: 'batch',
    },
    expected: {
      minPairs: 45,
      allowDuplicates: false,
    },
  },

  {
    name: 'Re-pairing - Same Users',
    description: 'Users who matched before spin again together',
    priority: 'medium',
    category: 're_pairing',
    setup: {
      males: 10,
      females: 10,
      joinPattern: 'simultaneous',
    },
    expected: {
      minPairs: 8,
      allowDuplicates: false,
    },
  },

  // ============================================================================
  // LOW PRIORITY SCENARIOS (for future implementation)
  // ============================================================================

  {
    name: 'Single Gender - All Males',
    description: '100 males, 0 females - test single gender scenario',
    priority: 'low',
    category: 'gender_imbalance',
    setup: {
      males: 100,
      females: 0,
      joinPattern: 'simultaneous',
    },
    expected: {
      exactPairs: 0,
      unmatchedUsers: 100,
      allowDuplicates: false,
    },
  },

  {
    name: 'Gradual Gender Imbalance Recovery',
    description: 'Start 200M/50F, then 50 females join',
    priority: 'low',
    category: 'gender_imbalance',
    setup: {
      males: 200,
      females: 100, // Will be split into two phases in implementation
      joinPattern: 'gradual',
    },
    expected: {
      minPairs: 90,
      allowDuplicates: false,
    },
  },
];

/**
 * Get scenarios by priority
 */
export function getScenariosByPriority(priority: 'high' | 'medium' | 'low'): ScenarioConfig[] {
  return SCENARIOS.filter(s => s.priority === priority);
}

/**
 * Get scenarios by category
 */
export function getScenariosByCategory(category: string): ScenarioConfig[] {
  return SCENARIOS.filter(s => s.category === category);
}

/**
 * Get scenario by name
 */
export function getScenarioByName(name: string): ScenarioConfig | undefined {
  return SCENARIOS.find(s => s.name === name);
}

