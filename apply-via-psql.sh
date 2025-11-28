#!/bin/bash

# Apply migrations via psql if available
# This requires database connection string

SUPABASE_URL="https://jzautphzcbtqplltsfse.supabase.co"
PROJECT_REF="jzautphzcbtqplltsfse"

echo "🔍 Checking for psql..."
if ! command -v psql &> /dev/null; then
    echo "❌ psql not found. Installing..."
    # Try to install psql (PostgreSQL client)
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y postgresql-client
    elif command -v yum &> /dev/null; then
        sudo yum install -y postgresql
    else
        echo "⚠️  Cannot install psql automatically. Please install PostgreSQL client manually."
        exit 1
    fi
fi

echo "📋 To apply migrations via psql, you need:"
echo "   1. Database password (from Supabase Dashboard → Settings → Database)"
echo "   2. Connection string format:"
echo "      postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"
echo ""
echo "   Then run:"
echo "   psql 'postgresql://...' -f supabase/migrations/blueprint/ALL_MIGRATIONS_COMBINED.sql"
echo ""
echo "📝 Or apply via Supabase Dashboard SQL Editor (easiest):"
echo "   https://supabase.com/dashboard/project/${PROJECT_REF}/sql"
