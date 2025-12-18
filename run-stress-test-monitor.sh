#!/bin/bash
cd /Users/bb/Desktop/speed

# Run test with output both to terminal and file
OUTPUT_FILE="/tmp/stress-test-output-$(date +%s).txt"
echo "Running stress test - output will be saved to: $OUTPUT_FILE"
echo "================================================"

# Run with line reporter and save to file
npx playwright test tests/100-users-stress.spec.ts --reporter=list 2>&1 | tee "$OUTPUT_FILE"

echo ""
echo "Test completed. Full output saved to: $OUTPUT_FILE"
echo "To view: cat $OUTPUT_FILE"

















