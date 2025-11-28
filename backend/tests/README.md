# Backend Test Architecture

## Overview

This directory contains the complete industrial-grade testing framework for the matching engine backend, ensuring:

- ✅ Correctness
- ✅ Stability  
- ✅ Fairness
- ✅ Race condition safety
- ✅ High load behavior
- ✅ Resilience to disconnects
- ✅ No duplicates
- ✅ No ghost users
- ✅ Guaranteed pairing
- ✅ Preference expansion correctness
- ✅ Never-pair-again correctness
- ✅ Cooldown correctness
- ✅ Voting correctness
- ✅ Online-only matching
- ✅ Predictable state machine

## Folder Structure

```
backend/tests/
├── unit/           # Small isolated behavior tests
├── integration/    # Multiple modules at once
├── simulation/     # Realistic user interactions
├── chaos/          # Randomized destructive testing
├── load/           # High concurrency
└── regression/     # Prevents breaking fixed bugs
```

## Test Suites

### Unit Tests (`unit/`)
Tests each module in isolation:
- Queue operations
- Matching logic
- Voting outcomes
- State machine transitions
- Disconnection handling

### Integration Tests (`integration/`)
Tests combining multiple modules:
- End-to-end flows (spin → queue → match → vote)
- Preference expansion integration
- Online/offline integration
- Cooldown integration
- Never-pair-again integration

### Simulation Tests (`simulation/`)
Realistic step-by-step user interactions:
- Low concurrency (5 users)
- Moderate concurrency (50 users)
- High concurrency (200 users)
- Extreme concurrency (500 users)

### Chaos Tests (`chaos/`)
Purposefully destructive testing:
- Disconnect storms
- Vote storms
- Random state injection

### Load Tests (`load/`)
Artificial heavy load:
- RPC flood test (200 req/s)
- Database lock pressure
- Queue expansion under stress

### Regression Tests (`regression/`)
Prevents bugs from returning:
- All fixed bugs become regression tests
- Ensures bugs never return

## Running Tests

```bash
# Run all tests
npm run test:backend:all

# Run specific suite
npm run test:backend:unit
npm run test:backend:integration
npm run test:backend:simulation
npm run test:backend:chaos
npm run test:backend:load
npm run test:backend:regression

# Run with coverage
npm run test:backend:coverage
```

## Acceptance Criteria

For production readiness, all tests must pass:

1. ✅ Zero duplicate matches
2. ✅ Zero ghost queue entries
3. ✅ Zero mismatched states
4. ✅ 100% matches always found
5. ✅ Fairness stays within normal range
6. ✅ No rematches for yes-yes history
7. ✅ No pairing with offline users
8. ✅ Cooldown consistently enforced
9. ✅ Queue never corrupts
10. ✅ Guardian repairs all broken states

## Test Framework

Tests use Vitest for fast, reliable database function testing via RPC calls.



