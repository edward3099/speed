#!/bin/bash
# Script to increase macOS connection limits for high concurrency
# Run this before starting the Next.js server for 500+ user tests

echo "🔧 Increasing macOS connection limits for high concurrency..."

# Check current limits
echo "Current limits:"
ulimit -n
sysctl kern.maxfiles
sysctl kern.maxfilesperproc
sysctl kern.ipc.somaxconn

# Increase file descriptor limits (soft and hard)
# For thousands of users, we need much higher limits
ulimit -n 20000 2>/dev/null || echo "⚠️  Could not increase ulimit (may need sudo)"

# Increase macOS system limits for thousands of concurrent connections
sudo sysctl -w kern.maxfiles=100000 2>/dev/null || echo "⚠️  Could not increase maxfiles (may need sudo)"
sudo sysctl -w kern.maxfilesperproc=100000 2>/dev/null || echo "⚠️  Could not increase maxfilesperproc (may need sudo)"
sudo sysctl -w kern.ipc.somaxconn=50000 2>/dev/null || echo "⚠️  Could not increase somaxconn (may need sudo)"

# Make changes persistent (requires sudo)
if [ "$EUID" -eq 0 ]; then
  echo "Making changes persistent..."
  # Create LaunchDaemon plist for persistent limits
  cat > /Library/LaunchDaemons/limit.maxfiles.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>limit.maxfiles</string>
    <key>ProgramArguments</key>
    <array>
      <string>launchctl</string>
      <string>limit</string>
      <string>maxfiles</string>
      <string>100000</string>
      <string>100000</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>ServiceIPC</key>
    <false/>
  </dict>
</plist>
EOF
  chown root:wheel /Library/LaunchDaemons/limit.maxfiles.plist
  chmod 644 /Library/LaunchDaemons/limit.maxfiles.plist
  launchctl load -w /Library/LaunchDaemons/limit.maxfiles.plist 2>/dev/null || echo "⚠️  Could not load LaunchDaemon"
fi

echo ""
echo "✅ Connection limits increased!"
echo "New limits:"
ulimit -n
sysctl kern.maxfiles 2>/dev/null || echo "kern.maxfiles: (check with sudo)"
sysctl kern.maxfilesperproc 2>/dev/null || echo "kern.maxfilesperproc: (check with sudo)"
sysctl kern.ipc.somaxconn 2>/dev/null || echo "kern.ipc.somaxconn: (check with sudo)"
echo ""
echo "💡 Note: Some changes require sudo. Run with: sudo ./scripts/increase-connection-limits.sh"
