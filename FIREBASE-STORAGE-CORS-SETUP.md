# Firebase Storage CORS Configuration Guide

## Problem
User-uploaded media files (background images/videos) are blocked by CORS policy when accessed from `https://habs-meet-prod.web.app`.

## Solution
Configure CORS in Firebase Storage to allow requests from your production domain.

## ⚠️ IMPORTANT: Why Firebase CLI is Required

**Google Cloud removed the CORS editor from the console for Firebase buckets.**

Firebase-managed buckets like `habs-meet-prod.firebasestorage.app` are locked, and Google Cloud Console **hides** the CORS UI for them. This is why you don't see:
- "Edit CORS configuration"
- CORS tab
- JSON editor
- "Advanced settings"
- "Interoperability" options

**The ONLY supported method is using Firebase CLI with `gsutil`.**

## Steps to Configure CORS

### Step 1: Create `cors.json` file

Create a file named `cors.json` in your project root with this content:

```json
[
  {
    "origin": [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://habs-meet-dev.web.app",
      "https://habs-meet-prod.web.app"
    ],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "x-goog-meta-*"],
    "maxAgeSeconds": 3600
  }
]
```

### Step 2: Set CORS using Firebase CLI

1. **Login to Firebase** (if not already logged in):
   ```bash
   firebase login
   ```

2. **Set CORS for production bucket**:
   ```bash
   gsutil cors set cors.json gs://habs-meet-prod.firebasestorage.app
   ```

3. **Set CORS for development bucket** (optional):
   ```bash
   gsutil cors set cors.json gs://habs-meet-dev.firebasestorage.app
   ```

That's it! CORS is now configured immediately, no UI required.

## Verify Configuration

After configuring CORS, test by:

1. Upload a background image/video in the app
2. Try to use it as a background
3. Check browser console - CORS errors should be gone

## Troubleshooting

- **CORS errors persist**: Wait 5-10 minutes for changes to propagate
- **Still seeing errors**: Clear browser cache and hard refresh (Ctrl+Shift+R)
- **Multiple domains**: Add all domains to the `origin` array:
  ```json
  "origin": [
    "https://habs-meet-prod.web.app",
    "https://habs-meet-prod.firebaseapp.com"
  ]
  ```

## Note

The code has been updated with improved CORS handling fallbacks, but configuring CORS in Firebase Storage is the proper solution for production.


