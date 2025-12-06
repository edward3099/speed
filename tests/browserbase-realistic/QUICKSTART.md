# Quick Start Guide

## Installation

```bash
npm install @browserbasehq/sdk playwright-core
```

## Setup Environment Variables

Copy `.env.example` and fill in your credentials:

```bash
cp tests/browserbase-realistic/.env.example .env.test
```

Edit `.env.test` with your Browserbase credentials:
- `BROWSERBASE_API_KEY` - From Browserbase dashboard
- `BROWSERBASE_PROJECT_ID` - From Browserbase dashboard
- `TEST_APP_URL` - Your app URL (default: http://localhost:3000)
- Test user credentials

## Run Tests

```bash
# Run all scenarios
npm run test:browserbase:realistic

# Run single scenario
npm run test:browserbase:scenario -- "Both Users Vote Yes"
```

## What Happens

1. Creates multiple Browserbase browser sessions (one per user)
2. Logs in users with realistic timing
3. Executes test scenario (spin, vote, etc.)
4. Verifies database state
5. Reports results with replay URLs

## View Replays

Each test session creates a replay URL:
```
📺 View replay: https://www.browserbase.com/sessions/{session-id}
```

Use these to debug any failures!

