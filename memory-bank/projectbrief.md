## Project Brief

- **Project**: Speed Date - Production Speed Dating Application
- **Purpose**: A full-stack production speed dating platform where users can match, vote, and have video dates in real-time. The application handles real-time matching, voting windows, video conferencing, and complex state management.
- **Core requirements**:
  - Next.js 16 App Router with TypeScript, Tailwind CSS, and Chakra UI
  - Supabase backend with PostgreSQL database for matching logic, state management, and user data
  - Real-time matching system with queue management, fairness algorithms, and race condition prevention
  - Voting system with time-limited windows and automatic outcome resolution
  - LiveKit integration for real-time video dating
  - WebSocket/Realtime subscriptions for live updates
  - Comprehensive testing suite (Playwright, Vitest) with load testing capabilities
  - Production features: cron jobs, heartbeat system, disconnect handling, admin dashboards
  - Production deployment on Vercel at `https://speed-silk.vercel.app`
- **High-level deliverables**:
  - Complete user flow: Landing → Onboarding → Dashboard → Spin → Spinning → Voting Window → Video Date
  - Database architecture with optimized matching functions, state management, and constraints
  - Real-time matching engine with event-driven architecture
  - Video dating experience with LiveKit integration
  - Admin tools and monitoring systems
