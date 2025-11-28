# Environment File Backup System

This project includes a permanent backup system for `.env.local` to prevent accidental loss of credentials.

## Files Created

1. **`.env.local.backup`** - Permanent backup of your environment variables (gitignored)
2. **`.env.local.example`** - Template file with placeholders (can be committed to git)
3. **`restore-env.sh`** - Script to restore `.env.local` from backup

## Automatic Protection

- **Git hooks** automatically restore `.env.local` if it's missing after:
  - `git checkout`
  - `git pull` / `git merge`
  - Any git operation that might overwrite files

## Manual Commands

### Restore environment file:
```bash
npm run env:restore
# or
./restore-env.sh
```

### Update backup:
```bash
npm run env:backup
# or
cp .env.local .env.local.backup
```

## What's Protected

- ✅ `.env.local` - Your actual credentials (gitignored)
- ✅ `.env.local.backup` - Backup copy (gitignored)
- ✅ `.env.local.example` - Template (can be committed)

## If .env.local Gets Deleted

The system will automatically restore it from `.env.local.backup` on the next git operation, or you can manually run:
```bash
npm run env:restore
```

## Current Credentials Stored

- Supabase URL and Anon Key
- LiveKit URL, API Key, and Secret

All credentials are stored in `.env.local.backup` and will be automatically restored if needed.
