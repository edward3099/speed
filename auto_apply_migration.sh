#!/bin/bash
# Auto-apply migration using Supabase Management API

SUPABASE_URL="https://jzautphzcbtqplltsfse.supabase.co"
PROJECT_REF="jzautphzcbtqplltsfse"
PASSWORD="Domyenemies1@"

echo "📋 Attempting to apply migration automatically..."
echo ""

# Method 1: Try using Supabase Management API (requires API key)
echo "Method 1: Trying Supabase Management API..."
echo "⚠️  This requires a service role key or API token"

# Method 2: Try direct psql connection with different formats
echo ""
echo "Method 2: Trying direct psql connection..."

# Try connection pooler format
export PGPASSWORD="$PASSWORD"
psql "postgresql://postgres.${PROJECT_REF}:${PASSWORD}@aws-0-eu-west-3.pooler.supabase.com:6543/postgres?sslmode=require" -f apply_matching_fixes.sql 2>&1 | head -20

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Direct connection failed. Trying alternative method..."
    
    # Output SQL for manual application
    echo ""
    echo "=" | head -c 60 && echo ""
    echo "SQL Migration File Ready"
    echo "=" | head -c 60 && echo ""
    echo ""
    echo "File location: /workspace/apply_matching_fixes.sql"
    echo "File size: $(wc -c < apply_matching_fixes.sql) bytes"
    echo ""
    echo "To apply manually:"
    echo "1. Go to: https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new"
    echo "2. Copy contents of apply_matching_fixes.sql"
    echo "3. Paste and run"
fi
