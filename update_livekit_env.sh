#!/bin/bash
# Update LiveKit credentials in .env.local

ENV_FILE=".env.local"

# Check if .env.local exists
if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env.local..."
    touch "$ENV_FILE"
fi

# Remove old LiveKit variables if they exist
sed -i.bak '/^LIVEKIT_API_KEY=/d' "$ENV_FILE"
sed -i.bak '/^LIVEKIT_API_SECRET=/d' "$ENV_FILE"
sed -i.bak '/^NEXT_PUBLIC_LIVEKIT_URL=/d' "$ENV_FILE"

# Add new credentials
echo "" >> "$ENV_FILE"
echo "# LiveKit Cloud Credentials (updated $(date +%Y-%m-%d))" >> "$ENV_FILE"
echo "LIVEKIT_API_KEY=APIsJfm8HVjU6LS" >> "$ENV_FILE"
echo "LIVEKIT_API_SECRET=ePTsz8UZcOJaXsjeRPN1sUiyiYUQp1EwObe1MLFfywXD" >> "$ENV_FILE"
echo "NEXT_PUBLIC_LIVEKIT_URL=wss://speed-date-7sbpx8ua.livekit.cloud" >> "$ENV_FILE"

echo "✅ Updated .env.local with new LiveKit credentials"
echo "📝 Backup saved as .env.local.bak"
