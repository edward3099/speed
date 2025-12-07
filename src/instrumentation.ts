/**
 * Next.js Instrumentation Hook
 * Runs once when the server starts
 * Perfect for initializing cron jobs
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only run on Node.js runtime (server-side)
    try {
      const { startMatchingScheduler } = await import('./lib/cron/matching-scheduler')
      
      // Start the matching scheduler after a short delay
      // This ensures the server is fully initialized
      setTimeout(() => {
        try {
          startMatchingScheduler()
        } catch (error) {
          console.error('❌ Failed to start matching scheduler:', error)
          // Don't crash the server if scheduler fails to start
        }
      }, 3000) // Increased delay to ensure server is fully ready
    } catch (error) {
      console.error('❌ Failed to load matching scheduler:', error)
      // Don't crash the server if import fails
    }
  }
}

