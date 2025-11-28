#!/bin/bash

# Apply migrations via psql
# Usage: ./apply-with-password.sh [DATABASE_PASSWORD]

PASSWORD="${1:-}"
PROJECT_REF="jzautphzcbtqplltsfse"
REGION="eu-west-3"
SQL_FILE="supabase/migrations/blueprint/ALL_MIGRATIONS_COMBINED.sql"

if [ -z "$PASSWORD" ]; then
    echo "❌ Database password required"
    echo ""
    echo "Usage: $0 [DATABASE_PASSWORD]"
    echo ""
    echo "To get your database password:"
    echo "1. Go to: https://supabase.com/dashboard/project/${PROJECT_REF}/settings/database"
    echo "2. Copy the database password"
    echo "3. Run: $0 'your-password-here'"
    echo ""
    echo "OR apply via SQL Editor (no password needed):"
    echo "https://supabase.com/dashboard/project/${PROJECT_REF}/sql"
    exit 1
fi

# URL encode the password for connection string
ENCODED_PASSWORD=$(echo -n "$PASSWORD" | sed 's/@/%40/g' | sed 's/#/%23/g' | sed 's/&/%26/g')
CONNECTION_STRING="postgresql://postgres.${PROJECT_REF}:${ENCODED_PASSWORD}@aws-1-${REGION}.pooler.supabase.com:6543/postgres?sslmode=require"

echo "🚀 Applying migrations via psql..."
echo "📄 File: ${SQL_FILE}"
echo ""

if [ ! -f "$SQL_FILE" ]; then
    echo "❌ SQL file not found: ${SQL_FILE}"
    exit 1
fi

psql "$CONNECTION_STRING" -f "$SQL_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migrations applied successfully!"
else
    echo ""
    echo "❌ Migration failed. Check errors above."
    exit 1
fi
