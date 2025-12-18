#!/bin/bash
cd /Users/bb/Desktop/speed

export NODE_ENV=test
export FORCE_COLOR=1

echo "=== Starting 100 Users Stress Test ==="
echo "Time: $(date)"
echo ""

# Run test with output to both terminal and file
npx playwright test tests/100-users-stress.spec.ts --reporter=list 2>&1 | tee /tmp/stress-test-live.log

EXIT_CODE=$?
echo ""
echo "=== Test completed with exit code: $EXIT_CODE ==="
echo "Time: $(date)"
exit $EXIT_CODE

















