## System Patterns

- **Architecture**: 
  - Next.js 16 App Router with `/src/app` structure
  - Supabase backend for database, auth, and real-time subscriptions
  - Event-driven matching system with database functions
  - Client-side state management with React hooks and Supabase Realtime

- **Database Architecture**:
  - **Core Tables**: `users_state` (single source of truth for user state), `matches` (match records with votes), `match_history` (historical matches), `video_dates` (video session records)
  - **State Machine**: 3 states (`idle`, `waiting`, `matched`) with database CHECK constraints
  - **Key Functions**: `join_queue()`, `try_match_user()`, `record_vote()`, `acknowledge_match()`, `handle_disconnect()`, `resolve_expired_votes()`
  - **Matching Logic**: Event-driven, uses advisory locks to prevent race conditions, respects fairness (waiting time priority)
    - **City Matching**: Users with NULL or empty city preferences match with anyone; users with city preferences match if they have at least one city in common
    - **Age Matching**: Both users' ages must be within each other's min_age/max_age preferences
    - **Gender Matching**: Opposite genders required (male ↔ female)
    - **Rematch Prevention**: Uses `match_history` table to prevent matching same users again

- **API Patterns**:
  - RESTful API routes in `/src/app/api`
  - Key endpoints: `/api/spin`, `/api/match/status`, `/api/match/acknowledge`, `/api/vote`, `/api/heartbeat`
  - Cron endpoints: `/api/cron/resolve-expired-votes`, `/api/cron/handle-disconnects`
  - Admin endpoints: `/api/admin/queue-stats`, `/api/admin/notify-telegram`

- **Real-time Patterns**:
  - Supabase Realtime subscriptions for match notifications
  - WebSocket-based updates for state changes
  - Fallback polling mechanism for reliability
  - LiveKit for video conferencing

- **State/Styling**:
  - Chakra UI provider for theming
  - Tailwind CSS + utility helpers (`clsx`, `class-variance-authority`, `tailwind-merge`)
  - Framer Motion for animations
  - Custom components in `src/components` (`magicui`, `ui`)

- **User Flow Pages**:
  - `/` - Landing page with auth
  - `/onboarding` - Profile setup
  - `/dashboard` - User dashboard
  - `/spin` - Spin button and initial state
  - `/spinning` - Waiting for match (with heartbeat)
  - `/voting-window` - Vote on match (60s countdown)
  - `/video-date` - LiveKit video call

- **Testing Patterns**:
  - **Test Setup**: Always use Supabase for user creation and preference setting (avoids UI issues)
  - **Test Flow**: Supabase setup → Playwright sign-in → Click Start Spin → Verify matches
  - **Test Files Location**: `/tests/*.spec.ts`
  - **Test Helpers**: `tests/helpers/create-users.ts` for user creation/cleanup
  - **Playwright Configs**: 
    - `playwright.config.ts` - Local development (includes webServer)
    - `playwright.vercel.config.ts` - Vercel production tests (no webServer, uses Vercel URL)
  - **Deployment**: Production Vercel project at `https://speed-silk.vercel.app`
