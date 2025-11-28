import { defineConfig } from 'vitest/config';
import path from 'path';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    test: {
      // Test environment
      environment: 'node',
      
      // Test file patterns
      include: ['backend/tests/**/*.test.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
      ],
      
      // Global setup/teardown
      globalSetup: ['./tests/setup/global-setup.ts'],
      globalTeardown: ['./tests/setup/global-teardown.ts'],
      
      // Test timeout - increased for load/chaos tests
      testTimeout: 120000, // 120 seconds
      hookTimeout: 60000,
      
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
          'backend/tests/',
          '**/*.config.ts',
          '**/*.d.ts',
        ],
      },
      
      // Reporter
      reporters: ['verbose', 'json', 'html'],
      
      // Setup files
      setupFiles: ['./tests/setup/test-setup.ts'],
      
      // Environment variables
      env: {
        ...env,
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '../../src'),
      },
    },
  };
});

