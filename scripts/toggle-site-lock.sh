#!/bin/bash

# Site Lock Toggle Script
# Usage: ./scripts/toggle-site-lock.sh [lock|unlock]

set -e

ACTION=${1:-lock}

if [ "$ACTION" != "lock" ] && [ "$ACTION" != "unlock" ]; then
  echo "Usage: $0 [lock|unlock]"
  echo "  lock   - Lock the site (show lock page)"
  echo "  unlock - Unlock the site (show normal site)"
  exit 1
fi

if [ "$ACTION" == "lock" ]; then
  VALUE="true"
  echo "🔒 Locking the site..."
else
  VALUE="false"
  echo "🔓 Unlocking the site..."
fi

# Set the environment variable
echo "$VALUE" | npx vercel env add NEXT_PUBLIC_SITE_LOCKED production --force

# Deploy to production
echo "🚀 Deploying to production..."
npx vercel --prod --yes

echo ""
echo "✅ Site lock set to: $VALUE"
echo "⏳ Wait 30-60 seconds for the deployment to complete and propagate."
echo "🌐 Check: https://meetchristians.live"
