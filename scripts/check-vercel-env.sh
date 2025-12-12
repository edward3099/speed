#!/bin/bash
# Script to check if LiveKit environment variables are set in Vercel
# Usage: ./scripts/check-vercel-env.sh

echo "🔍 Checking LiveKit environment variables..."
echo ""
echo "To set these in Vercel:"
echo "1. Go to https://vercel.com/dashboard"
echo "2. Select your project"
echo "3. Go to Settings → Environment Variables"
echo "4. Add the following variables:"
echo ""

# Read from .env.local
if [ -f .env.local ]; then
    echo "📋 Variables from .env.local:"
    echo ""
    
    LIVEKIT_API_KEY=$(grep "^LIVEKIT_API_KEY=" .env.local | cut -d '=' -f2)
    LIVEKIT_API_SECRET=$(grep "^LIVEKIT_API_SECRET=" .env.local | cut -d '=' -f2)
    NEXT_PUBLIC_LIVEKIT_URL=$(grep "^NEXT_PUBLIC_LIVEKIT_URL=" .env.local | cut -d '=' -f2)
    
    if [ -n "$LIVEKIT_API_KEY" ]; then
        echo "✅ LIVEKIT_API_KEY=$LIVEKIT_API_KEY"
    else
        echo "❌ LIVEKIT_API_KEY not found in .env.local"
    fi
    
    if [ -n "$LIVEKIT_API_SECRET" ]; then
        echo "✅ LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET:0:10}... (hidden)"
    else
        echo "❌ LIVEKIT_API_SECRET not found in .env.local"
    fi
    
    if [ -n "$NEXT_PUBLIC_LIVEKIT_URL" ]; then
        echo "✅ NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL"
    else
        echo "❌ NEXT_PUBLIC_LIVEKIT_URL not found in .env.local"
    fi
    
    echo ""
    echo "📝 Copy these to Vercel Environment Variables:"
    echo ""
    echo "Name: LIVEKIT_API_KEY"
    echo "Value: $LIVEKIT_API_KEY"
    echo "Environments: Production, Preview, Development"
    echo ""
    echo "Name: LIVEKIT_API_SECRET"
    echo "Value: $LIVEKIT_API_SECRET"
    echo "Environments: Production, Preview, Development"
    echo ""
    echo "Name: NEXT_PUBLIC_LIVEKIT_URL"
    echo "Value: $NEXT_PUBLIC_LIVEKIT_URL"
    echo "Environments: Production, Preview, Development"
    echo ""
else
    echo "❌ .env.local file not found"
    exit 1
fi

echo "✅ After setting variables in Vercel, redeploy your application"
echo "🔗 Check diagnostics: https://your-app.vercel.app/api/livekit-token/diagnostics"
