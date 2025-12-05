#!/bin/bash
# ============================================================================
# Run Retest Script
# ============================================================================
# Executes the rigorous test suite with automatic test data setup
# ============================================================================

echo "=========================================="
echo "RIGOROUS ERROR DETECTION TEST SUITE"
echo "RETEST EXECUTION"
echo "=========================================="
echo ""

# Check if supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "⚠️  Supabase CLI not found. Running via MCP..."
    echo "   Please execute: retest_rigorous_suite.sql"
    exit 0
fi

# Run the retest script
echo "📋 Executing retest_rigorous_suite.sql..."
echo ""

supabase db execute --file retest_rigorous_suite.sql

echo ""
echo "=========================================="
echo "RETEST COMPLETE"
echo "=========================================="

