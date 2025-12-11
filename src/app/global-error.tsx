'use client'

/**
 * Global Error Handler
 * Catches React rendering errors that escape error boundaries
 * 
 * This file suppresses the Sentry warning about missing global error handler.
 * Since Sentry was removed, we use console.error for error logging.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Log error to console (Sentry was removed)
  if (process.env.NODE_ENV === 'development') {
    console.error('Global error caught:', {
      message: error.message,
      stack: error.stack,
      digest: error.digest,
    })
  }

  return (
    <html>
      <body>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>
            Something went wrong!
          </h1>
          <p style={{ color: '#666', marginBottom: '2rem', textAlign: 'center' }}>
            {error.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={reset}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              backgroundColor: '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}







