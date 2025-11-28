#!/bin/bash

# Apply all migrations in order
# Run this from the blueprint directory

echo "Applying matching engine migrations..."

for file in $(ls -1 [0-9]*.sql | sort -n); do
    echo "Applying $file..."
    psql $DATABASE_URL -f "$file" || {
        echo "Failed to apply $file"
        exit 1
    }
done

echo "All migrations applied successfully!"
