#!/bin/bash
# Restore .env.local from backup if it doesn't exist or is empty

if [ ! -f .env.local ] || [ ! -s .env.local ]; then
    if [ -f .env.local.backup ]; then
        echo "Restoring .env.local from backup..."
        cp .env.local.backup .env.local
        echo "✅ .env.local restored successfully!"
    else
        echo "⚠️  No backup found. Creating from example..."
        if [ -f .env.local.example ]; then
            cp .env.local.example .env.local
            echo "✅ .env.local created from example. Please update with your credentials."
        else
            echo "❌ No backup or example file found!"
            exit 1
        fi
    fi
else
    echo "✅ .env.local already exists and is not empty."
fi
