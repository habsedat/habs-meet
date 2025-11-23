# Background Assets Migration Script

This script copies background images and videos from the dev Firebase project to the prod Firebase project.

## Prerequisites

1. **Service Account Keys**: You need service account keys for both Firebase projects:
   - Download from Firebase Console → Project Settings → Service Accounts
   - Save them as:
     - `apps/functions/serviceAccountKey-dev.json`
     - `apps/functions/serviceAccountKey-prod.json`

2. **Node.js**: Make sure Node.js 18+ is installed

3. **Dependencies**: Install script dependencies:
   ```bash
   cd scripts
   npm install
   ```

## Usage

```bash
cd scripts
npm run copy-assets
```

Or directly:
```bash
node scripts/copy-background-assets.js
```

## What it does

1. ✅ Reads all `defaultMedia` documents from dev Firestore
2. ✅ Downloads images/videos from dev Firebase Storage
3. ✅ Uploads them to prod Firebase Storage
4. ✅ Updates prod Firestore documents with new URLs
5. ✅ Preserves all metadata (name, type, category, etc.)

## Output

The script will show:
- Progress for each file being copied
- Success/failure status
- Summary at the end

## Important Notes

- ⚠️ This script will **overwrite** existing files in prod storage if they have the same path
- ⚠️ Make sure you have proper permissions for both Firebase projects
- ⚠️ Large files may take time to copy
- ✅ The script is idempotent - you can run it multiple times safely

## Troubleshooting

### Service Account Keys Not Found
- Make sure the JSON files are in the correct location
- Check file names match exactly: `serviceAccountKey-dev.json` and `serviceAccountKey-prod.json`

### Permission Errors
- Ensure service account has Storage Admin and Firestore Admin roles
- Check Firebase Console → IAM & Admin for permissions

### Network Errors
- Check your internet connection
- Verify Firebase project IDs are correct

