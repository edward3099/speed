import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    
    // Test file patterns - Only Vitest tests, exclude Playwright tests
    // Use explicit include pattern to only match .vitest.test.ts files
    include: ['tests/**/*.vitest.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/*.spec.ts',  // Exclude all Playwright spec files
      '**/*.e2e.spec.ts',
      '**/*.e2e.test.ts',
      'tests/**/*.spec.ts',  // Explicitly exclude all spec files in tests
      'tests/setup/**',  // Exclude setup files from being run as tests
      'tests/fixtures.ts',  // Exclude fixtures file
    ],
    
    // Global setup/teardown
    globalSetup: ['./tests/setup/global-setup.ts'],
    globalTeardown: ['./tests/setup/global-teardown.ts'],
    
    // Test timeout - increased for guaranteed matching (may wait up to 30 seconds)
    testTimeout: 120000,  // 120 seconds for guaranteed matching operations
    hookTimeout: 60000,  // Increased hook timeout
    
    // Parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: 4,
      },
    },
    
    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.config.ts',
        '**/*.d.ts',
      ],
    },
    
    // Reporter
    reporters: ['verbose', 'json', 'html'],
    
    // Setup files
    setupFiles: ['./tests/setup/test-setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

