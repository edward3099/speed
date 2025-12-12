# Frontend Testing Guide for 2 Users Spinning

Based on GitHub best practices and React Testing Library patterns.

## Testing Approaches

### 1. React Testing Library (Unit/Integration Tests)

**Best for:** Testing component behavior and user interactions

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

test('user can spin and get matched', async () => {
  const user = userEvent.setup()
  
  // Render component
  render(<SpinPage />)
  
  // Find and click button
  const spinButton = screen.getByRole('button', { name: /start spin/i })
  await user.click(spinButton)
  
  // Wait for match
  await waitFor(() => {
    expect(screen.getByText(/matched/i)).toBeInTheDocument()
  })
})
```

**Key Points:**
- Use `userEvent` instead of `fireEvent` (more realistic)
- Query by role, label, or text (user-centric)
- Use `waitFor` for async operations
- Test from user's perspective, not implementation

### 2. Playwright (E2E Tests)

**Best for:** Testing full user flows across multiple pages

```typescript
import { test, expect } from '@playwright/test'

test('2 users spinning and matching', async ({ page, context }) => {
  // User 1
  await page.goto('http://localhost:3000/spin')
  await page.click('button:has-text("Start Spin")')
  
  // User 2 (new browser context)
  const page2 = await context.newPage()
  await page2.goto('http://localhost:3000/spin')
  await page2.click('button:has-text("Start Spin")')
  
  // Wait for both to redirect
  await expect(page).toHaveURL(/voting-window/)
  await expect(page2).toHaveURL(/voting-window/)
})
```

**Key Points:**
- Test in real browser environment
- Can test multiple users with different contexts
- Better for testing navigation and redirects
- Slower but more comprehensive

### 3. Manual Testing with Test Page

**Best for:** Quick verification during development

The test page at `/test/2-users-spinning` provides:
- Visual feedback
- Real-time logs
- Status verification
- Easy debugging

## Recommended Setup

### Install Dependencies

```bash
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom vitest
# OR for Playwright
npm install -D @playwright/test
```

### Test Structure

```
src/
  app/
    test/
      2-users-spinning/
        page.tsx          # Test UI page
        test.spec.tsx     # React Testing Library tests
        e2e.spec.ts       # Playwright E2E tests
```

## Testing the 2 Users Spinning Scenario

### What to Test:

1. **User 1 spins** → Should join queue
2. **User 2 spins** → Should match with User 1
3. **Both users** → Should see matched state
4. **Both users** → Should redirect to `/voting-window`
5. **Cache invalidation** → Both should get fresh data
6. **WebSocket updates** → Real-time state changes

### Example Test Flow:

```typescript
// 1. User 1 presses spin
await user.click(screen.getByRole('button', { name: /start spin/i }))

// 2. Verify API call
expect(fetch).toHaveBeenCalledWith('/api/spin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
})

// 3. Wait for match status update
await waitFor(() => {
  expect(screen.getByText(/matched/i)).toBeInTheDocument()
})

// 4. Verify redirect
expect(mockRouter.push).toHaveBeenCalledWith(
  expect.stringContaining('/voting-window')
)
```

## Best Practices from GitHub Examples

1. **Use `userEvent` over `fireEvent`**
   - More realistic event simulation
   - Fires multiple events (hover, focus, click)

2. **Query by role/label/text**
   - `getByRole('button', { name: /start spin/i })`
   - More accessible and resilient

3. **Wait for async operations**
   - `waitFor()` for state changes
   - `findBy*` queries auto-wait

4. **Mock external dependencies**
   - Mock API calls
   - Mock router navigation
   - Mock Supabase client

5. **Test user flows, not implementation**
   - Test what user sees/does
   - Don't test internal state directly

## Running Tests

```bash
# React Testing Library (Vitest)
npm run test

# Playwright E2E
npx playwright test

# Watch mode
npm run test:watch
```

## Next Steps

1. Set up Vitest or Jest for unit tests
2. Set up Playwright for E2E tests
3. Create test utilities for common patterns
4. Add tests to CI/CD pipeline







