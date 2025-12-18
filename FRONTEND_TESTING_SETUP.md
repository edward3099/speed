# Frontend Testing Setup - Based on GitHub Best Practices

## Overview

Based on GitHub examples and best practices, here are the recommended approaches for testing the 2-users spinning scenario:

## 1. Browser-Based Test (Easiest - Already Created)

**Location:** `/test/2-users-spinning`

**How to use:**
1. Navigate to `http://localhost:3000/test/2-users-spinning`
2. Click "Run Test" button
3. Open another browser/incognito window
4. Navigate to `/spin` and press "Start Spin"
5. Watch both windows for redirects

**Pros:**
- ✅ No setup required
- ✅ Runs in real browser
- ✅ Visual feedback
- ✅ Real-time logs

**Cons:**
- ❌ Manual verification needed
- ❌ Not automated

## 2. Playwright E2E Test (Recommended for Automation)

**Location:** `tests/2-users-spinning.spec.ts`

**How to run:**
```bash
npm run test tests/2-users-spinning.spec.ts
```

**Features:**
- ✅ Automated
- ✅ Tests in real browser
- ✅ Can test 2 users simultaneously
- ✅ Verifies redirects and state changes

**Based on GitHub patterns:**
- Uses multiple browser contexts for 2 users
- Tests user interactions (clicks, navigation)
- Verifies URL changes and content
- Proper cleanup with try/finally

## 3. React Testing Library (For Component Testing)

**Location:** `src/app/test/2-users-spinning/test.spec.tsx`

**How to run:**
```bash
npm run test:vitest
```

**Features:**
- ✅ Fast unit/integration tests
- ✅ Tests component behavior
- ✅ Mocks external dependencies
- ✅ User-centric queries

**Best practices from GitHub:**
- Use `userEvent` instead of `fireEvent`
- Query by role/label/text
- Use `waitFor` for async operations
- Test from user's perspective

## Quick Start

### Option 1: Browser Test (Easiest)
```bash
# Just open in browser
open http://localhost:3000/test/2-users-spinning
```

### Option 2: Playwright (Automated)
```bash
# Run the test
npm run test tests/2-users-spinning.spec.ts

# Run with UI
npm run test:ui

# Run in headed mode (see browser)
npm run test:headed
```

### Option 3: React Testing Library
```bash
# Run unit tests
npm run test:vitest

# Watch mode
npm run test:vitest:watch
```

## Test Coverage

### What Each Test Covers:

**Browser Test:**
- ✅ User authentication
- ✅ Spin API call
- ✅ Match creation
- ✅ Status polling
- ✅ State verification

**Playwright Test:**
- ✅ 2 users spinning simultaneously
- ✅ Match creation
- ✅ Redirect to voting window
- ✅ Cache invalidation
- ✅ URL navigation

**React Testing Library:**
- ✅ Component rendering
- ✅ Button clicks
- ✅ API mocking
- ✅ State updates
- ✅ Redirect logic

## Best Practices from GitHub

1. **Use `userEvent` over `fireEvent`**
   ```typescript
   await userEvent.click(button) // ✅ Better
   fireEvent.click(button) // ❌ Less realistic
   ```

2. **Query by role/label**
   ```typescript
   screen.getByRole('button', { name: /start spin/i }) // ✅
   screen.getByTestId('spin-button') // ❌ Less accessible
   ```

3. **Wait for async operations**
   ```typescript
   await waitFor(() => {
     expect(screen.getByText(/matched/i)).toBeInTheDocument()
   })
   ```

4. **Test user flows, not implementation**
   ```typescript
   // ✅ Test what user sees
   expect(screen.getByText(/matched/i)).toBeInTheDocument()
   
   // ❌ Don't test internal state
   expect(component.state.isMatched).toBe(true)
   ```

## Next Steps

1. ✅ Browser test created - ready to use
2. ✅ Playwright test created - run with `npm run test`
3. ⚠️ React Testing Library test needs setup (Vitest config)

Choose the approach that fits your needs!






























