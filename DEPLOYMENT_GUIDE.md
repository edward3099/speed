# Production Deployment Guide

## Quick Start

This guide will help you deploy the spin logic to production with all the new monitoring and infrastructure features.

---

## ✅ Pre-Deployment Checklist

### 1. Environment Variables

Copy `env.template` to `.env.local` and fill in:

**Required**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**For Production Monitoring**:
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_DSN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN`

**For Security**:
- `TEST_API_KEY` (generate secure random string)
- `ADMIN_API_KEY` (generate secure random string)

**For Distributed Cache** (choose one):
- Vercel KV: `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`
- OR Upstash Redis: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- OR Standard Redis: `REDIS_URL`

---

### 2. Set Up Sentry

1. Create account at [sentry.io](https://sentry.io)
2. Create new project (Next.js)
3. Copy DSN to environment variables
4. Set up alerting rules:
   - Critical errors → Email/Slack
   - Performance degradation → Alert
   - Queue bottlenecks → Alert

---

### 3. Set Up Distributed Cache

**Option A: Vercel KV** (if on Vercel)
1. Go to Vercel dashboard → Storage → Create KV Database
2. Copy connection details to environment variables

**Option B: Upstash Redis** (serverless)
1. Create account at [upstash.com](https://upstash.com)
2. Create Redis database
3. Copy REST URL and token to environment variables

**Option C: Standard Redis**
1. Set up Redis instance (AWS ElastiCache, Redis Cloud, etc.)
2. Copy connection URL to `REDIS_URL`

---

### 4. Generate API Keys

```bash
# Generate secure random keys
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use output for:
- `TEST_API_KEY`
- `ADMIN_API_KEY`
- `NEXT_PUBLIC_ADMIN_KEY` (same as ADMIN_API_KEY)

---

## 🚀 Deployment Steps

### Step 1: Build and Test Locally

```bash
# Install dependencies
npm install

# Type check
npm run type-check

# Build
npm run build

# Test locally
npm start
```

### Step 2: Deploy to Production

**If using Vercel**:
```bash
vercel --prod
```

**If using other platform**:
- Build: `npm run build`
- Start: `npm start`

---

### Step 3: Verify Deployment

1. **Check Health Endpoint**:
   ```bash
   curl https://your-domain.com/api/health
   ```

2. **Test Queue Stats** (with admin key):
   ```bash
   curl -H "x-admin-key: YOUR_ADMIN_KEY" \
        https://your-domain.com/api/admin/queue-stats
   ```

3. **Check Sentry**:
   - Go to Sentry dashboard
   - Verify errors are being tracked
   - Check performance metrics

4. **Test Wait Time Indicator**:
   - Visit `/spinning` page
   - Verify wait time information displays

5. **Test Admin Dashboard**:
   - Visit `/admin/queue-dashboard`
   - Verify metrics display correctly

---

## 🔍 Post-Deployment Monitoring

### Daily Checks

1. **Sentry Dashboard**
   - Review error rates
   - Check performance metrics
   - Review new issues

2. **Admin Dashboard**
   - Check queue health
   - Monitor gender distribution
   - Review match rates

3. **Queue Stats API**
   - Verify response times
   - Check for errors

### Weekly Reviews

1. **Performance Trends**
   - API response times
   - Database query performance
   - Cache hit rates

2. **User Experience**
   - Average wait times
   - Match success rates
   - Error rates

3. **System Health**
   - Queue bottlenecks
   - Gender balance trends
   - Match rate trends

---

## 🚨 Troubleshooting

### Sentry Not Working

**Symptoms**: No errors in Sentry dashboard

**Fix**:
1. Verify `NEXT_PUBLIC_SENTRY_DSN` is set
2. Check Sentry project settings
3. Verify source maps are uploading (check build logs)
4. Test with: `throw new Error('Test error')` in an API route

---

### Distributed Cache Not Working

**Symptoms**: Still using in-memory cache

**Fix**:
1. Verify environment variables are set correctly
2. Check cache adapter logs (should show which backend is used)
3. Test cache operations manually
4. Verify network connectivity to cache backend

---

### Test Endpoints Returning 403

**Symptoms**: Test endpoints fail in production

**Fix**:
1. Verify `TEST_API_KEY` is set
2. Include header: `x-test-api-key: YOUR_KEY`
3. Or use: `Authorization: Bearer YOUR_KEY`

---

### Admin Dashboard Not Accessible

**Symptoms**: 403 error on admin dashboard

**Fix**:
1. Verify `ADMIN_API_KEY` is set
2. Include header: `x-admin-key: YOUR_KEY`
3. Or set `NEXT_PUBLIC_ADMIN_KEY` for client-side access

---

## 📊 Monitoring Endpoints

### Public Endpoints
- `/api/health` - Health check
- `/api/match/status` - Match status (authenticated)

### Admin Endpoints (require API key)
- `/api/admin/queue-stats` - Queue statistics
- `/admin/queue-dashboard` - Admin dashboard UI

### Test Endpoints (require API key in production)
- `/api/test/*` - All test endpoints

---

## 🔐 Security Best Practices

1. **Never commit API keys** to git
2. **Rotate keys regularly** (every 90 days)
3. **Use different keys** for test and admin
4. **Monitor access logs** for suspicious activity
5. **Limit admin dashboard access** to trusted IPs (optional)

---

## 📈 Performance Optimization

### Cache Configuration

- **Match Status**: 15 second TTL (aggressive caching)
- **Queue Stats**: 10 second refresh (admin dashboard)
- **User Profiles**: 60 second TTL (if cached)

### Rate Limiting

- **Production API**: 100 requests/10s per IP
- **Test Endpoints**: 500 requests/10s per IP
- **Admin Endpoints**: 50 requests/10s per IP

---

## 🎯 Success Metrics

After deployment, monitor:

1. **Error Rate**: < 0.1% of requests
2. **API Response Time**: p95 < 500ms
3. **Cache Hit Rate**: > 80%
4. **Match Success Rate**: > 70%
5. **Queue Processing**: < 60s average wait

---

## 📞 Support

If you encounter issues:

1. Check Sentry for error details
2. Review admin dashboard for queue health
3. Check application logs
4. Verify environment variables
5. Test endpoints individually

---

## ✅ Deployment Complete!

Once all checks pass, your spin logic is production-ready! 🎉

Monitor the system closely for the first 24-48 hours to ensure everything is working correctly.



