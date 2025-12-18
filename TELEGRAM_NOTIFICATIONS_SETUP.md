# Telegram Notifications Setup

You'll now receive real-time Telegram notifications when users submit reports or ratings!

## ✅ What Was Implemented

1. **API Endpoint**: `/api/admin/notify-telegram` - Handles sending notifications to Telegram
2. **Report Notifications**: Automatically sends when a user reports another user
3. **Rating Notifications**: Automatically sends when a user rates another user after a date

## 📋 Setup Instructions

### Step 1: Add Environment Variables to `.env.local`

Add these lines to your `.env.local` file:

```env
TELEGRAM_BOT_TOKEN=7553486909:AAHM0uMBasfPFGWF155rg9awVF3qiD1-tA4
TELEGRAM_CHAT_ID=796320731
```

### Step 2: Add Environment Variables to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: **speed**
3. Go to **Settings** → **Environment Variables**
4. Add the following:

**Variable 1:**
- **Name:** `TELEGRAM_BOT_TOKEN`
- **Value:** `7553486909:AAHM0uMBasfPFGWF155rg9awVF3qiD1-tA4`
- **Environments:** ✅ Production, ✅ Preview, ✅ Development

**Variable 2:**
- **Name:** `TELEGRAM_CHAT_ID`
- **Value:** `796320731`
- **Environments:** ✅ Production, ✅ Preview, ✅ Development

### Step 3: Redeploy

After adding the environment variables to Vercel:
1. Go to **Deployments** tab
2. Click the **⋯** (three dots) on the latest deployment
3. Click **Redeploy**

Or push a new commit to trigger a new deployment.

## 📱 What You'll Receive

### Report Notifications Include:
- 👤 Reporter email
- 🎯 Reported user email
- 📋 Report category
- 📝 Report details
- 🆔 Video date ID
- ⏰ Timestamp

### Rating Notifications Include:
- 👤 Rater email
- 🎯 Rated user email
- ⭐ Rating (1-5 stars)
- 💬 Feedback text (if provided)
- 🆔 Video date ID
- ⏰ Timestamp

## 🔒 Security Notes

- Bot token and chat ID are stored as environment variables (secure)
- Notifications are sent server-side (never exposed to client)
- Failed notifications don't block user actions (graceful degradation)

## 🧪 Testing

To test if it's working:
1. Complete a video date
2. Submit a rating or report
3. Check your Telegram for the notification

## 🛠️ Troubleshooting

**Not receiving notifications?**
- Check that environment variables are set correctly
- Verify bot token and chat ID are correct
- Check Vercel deployment logs for errors
- Ensure the bot hasn't been blocked

**Notifications not working in production?**
- Make sure you added variables to Vercel (not just .env.local)
- Redeploy after adding variables
- Check Vercel function logs

## 📝 Notes

- Notifications are sent asynchronously (won't slow down user actions)
- If Telegram API fails, it logs an error but doesn't affect user experience
- User emails are fetched from Supabase auth (requires service role key)


