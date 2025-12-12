# Vercel Environment Variables Setup

## Problem
The LiveKit connection fails with "invalid API key" error because environment variables are only set locally in `.env.local`, but Vercel deployments need them configured in the Vercel dashboard.

## Solution: Set Environment Variables in Vercel

### Step 1: Get Your LiveKit Credentials
From your `.env.local` file, you need these three variables:
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `NEXT_PUBLIC_LIVEKIT_URL`

### Step 2: Add to Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: **speed**
3. Go to **Settings** → **Environment Variables**
4. Add the following variables:

#### For Production, Preview, and Development:

**Variable 1:**
- **Name:** `LIVEKIT_API_KEY`
- **Value:** `APIpT7RBpk6mJ2E` (from your .env.local)
- **Environments:** ✅ Production, ✅ Preview, ✅ Development

**Variable 2:**
- **Name:** `LIVEKIT_API_SECRET`
- **Value:** `0qeDeznnQMY7ZIxg4LfghkritFouI83EfeRVGf2EEyDG` (from your .env.local)
- **Environments:** ✅ Production, ✅ Preview, ✅ Development

**Variable 3:**
- **Name:** `NEXT_PUBLIC_LIVEKIT_URL`
- **Value:** `wss://speed-date-7sbpx8ua.livekit.cloud` (from your .env.local)
- **Environments:** ✅ Production, ✅ Preview, ✅ Development

### Step 3: Redeploy

After adding the environment variables:
1. Go to **Deployments** tab
2. Click the **⋯** (three dots) on the latest deployment
3. Click **Redeploy**
4. Or push a new commit to trigger a new deployment

### Step 4: Verify

After redeployment, you can verify the configuration by visiting:
- `https://your-vercel-url.vercel.app/api/livekit-token/diagnostics`

This will show you if the environment variables are properly set.

## Important Notes

- **Never commit `.env.local` to git** - it contains secrets
- **Always set environment variables in Vercel** for production deployments
- Environment variables set in Vercel are encrypted and secure
- Changes to environment variables require a redeploy to take effect

## Troubleshooting

If you still see "invalid API key" errors after setting variables:

1. **Check variable names** - They must match exactly (case-sensitive)
2. **Check all environments** - Make sure variables are enabled for Production
3. **Redeploy** - Environment variable changes require a new deployment
4. **Check diagnostics endpoint** - Visit `/api/livekit-token/diagnostics` to see what's configured
