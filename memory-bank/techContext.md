## Tech Context

- **Framework**: Next.js 16 (App Router) with React 19 + TypeScript 5
- **Backend**: Supabase (PostgreSQL database, Auth, Realtime subscriptions, Storage)
- **Database**: PostgreSQL with 50+ migrations, complex matching functions, triggers, and constraints
- **Video**: LiveKit for real-time video conferencing (`livekit-client`, `livekit-server-sdk`)
- **UI libraries**: Chakra UI 3, Tailwind CSS 3, Lucide icons, custom magicui components
- **Animation**: Framer Motion for page transitions and UI animations
- **Real-time**: Supabase Realtime for WebSocket subscriptions, LiveKit for video streams
- **Testing**: 
  - Playwright for E2E tests (15+ test files)
  - Vitest for unit/integration tests
  - Load testing capabilities (500+ concurrent users)
  - **Standard Test Format**:
    1. Create users via Supabase (using `createTestUser` helper)
    2. Set preferences via Supabase (REST API or Supabase client)
    3. Sign in with Playwright (browser automation)
    4. Click Start Spin (Playwright)
    5. Check matches (verify results and validate criteria)
  - **Test Configuration**: 
    - `playwright.config.ts` - Local tests with webServer
    - `playwright.vercel.config.ts` - Production tests against Vercel (no webServer)
  - **Test Base URL**: `https://speed-silk.vercel.app` for production tests
- **Monitoring**: 
  - Telegram notifications for admin alerts
  - Health check endpoints
  - Queue stats and metrics
- **Cron Jobs**: Node-cron for scheduled tasks (resolve expired votes, handle disconnects)
- **Dev requirements**:
  - Node.js 20+
  - Supabase project with database migrations applied
  - Environment variables for Supabase, LiveKit, Telegram
  - `npm run dev` runs on port 3000 (override default PORT=26053)
  - Cloudflare `cloudflared` binary for remote access (optional)
- **Deployment**: 
  - **Production Vercel Project**: `https://speed-silk.vercel.app`
  - This is the main Vercel deployment for the project
  - Used for production testing and live deployment
- **External services**: 
  - Supabase (database, auth, realtime)
  - LiveKit (video conferencing)
  - Telegram (admin notifications)
  - Cloudflare Tunnel (optional remote access)
