# How to Run 2 Users Spinning Test

## ✅ Easiest Method: Browser Test Page

**No setup required!**

1. **Open browser test page:**
   ```
   http://localhost:3000/test/2-users-spinning
   ```

2. **Click "Run Test" button**
   - This will make User 1 (current session) spin

3. **Open another browser/incognito window**
   - Navigate to: `http://localhost:3000/spin`
   - Log in as a different user (User 2)
   - Press "Start Spin"

4. **Watch both windows**
   - Both should redirect to `/voting-window` when matched
   - Check the test page logs for status

## 🧪 Automated Test: Playwright

**Requires authentication setup**

```bash
# Run browser test (simplest)
npm run test tests/2-users-spinning-browser.spec.ts

# Run full E2E test (requires login helpers)
npm run test tests/2-users-spinning.spec.ts
```

## 📝 What to Verify

✅ **User 1 spins** → Joins queue or matches immediately
✅ **User 2 spins** → Should match with User 1
✅ **Both users** → State changes to `matched`
✅ **Both users** → Redirect to `/voting-window`
✅ **Cache invalidation** → Both get fresh match status
✅ **Vote window** → Starts when both acknowledge

## 🔍 Debugging

If test fails:
1. Check browser console for errors
2. Check network tab for API calls
3. Verify server is running on `localhost:3000`
4. Check database for match creation
5. Verify both users are authenticated

## 🎯 Quick Test Command

```bash
# Open test page
open http://localhost:3000/test/2-users-spinning
```

Then manually test with 2 browser windows!


