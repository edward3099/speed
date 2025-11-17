#!/bin/bash

# Start Next.js dev server in background
echo "Starting Next.js dev server..."
npm run dev &
NEXT_PID=$!

# Wait for Next.js to be ready
echo "Waiting for Next.js to start..."
sleep 5

# Check if Next.js is running
if ! kill -0 $NEXT_PID 2>/dev/null; then
    echo "Error: Next.js dev server failed to start"
    exit 1
fi

# Start Cloudflare tunnel
echo "Starting Cloudflare tunnel..."
echo "Your app will be available at the URL shown below:"
cloudflared tunnel --url http://localhost:3000

# Cleanup on exit
trap "kill $NEXT_PID 2>/dev/null; exit" INT TERM EXIT
