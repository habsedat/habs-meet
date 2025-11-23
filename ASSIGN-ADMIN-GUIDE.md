# How to Assign Admin Role

There are several ways to assign admin privileges to a user. Choose the method that works best for you.

## Method 1: Firebase Console (Easiest - Recommended)

### For Development Project (habs-meet-dev):
1. Go to: https://console.firebase.google.com/project/habs-meet-dev/firestore
2. Navigate to the `users` collection
3. Find the user document (by their UID or email)
4. Click on the document to edit it
5. Add or update the `role` field to `"admin"` or `"superadmin"`
6. Click **Save**

### For Production Project (habs-meet-prod):
1. Go to: https://console.firebase.google.com/project/habs-meet-prod/firestore
2. Follow the same steps as above

**Note:** You can find a user's UID by:
- Checking the Authentication tab in Firebase Console
- Looking at the browser console logs when they're logged in
- Using the script below

## Method 2: Using the Script (Command Line)

### Prerequisites:
1. Install Node.js if you haven't already
2. Download Firebase service account key:
   - Go to Firebase Console > Project Settings > Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file securely

### Setup:
```bash
# Set the service account key path
export GOOGLE_APPLICATION_CREDENTIALS="path/to/your/serviceAccountKey.json"

# Or on Windows PowerShell:
$env:GOOGLE_APPLICATION_CREDENTIALS="path\to\your\serviceAccountKey.json"
```

### Run the script:
```bash
# For dev project
node scripts/assign-admin.js user@example.com habs-meet-dev

# For prod project
node scripts/assign-admin.js user@example.com habs-meet-prod
```

## Method 3: Direct Firestore Update (Using Firebase CLI)

```bash
# Switch to the project
firebase use habs-meet-dev  # or habs-meet-prod

# Use Firestore emulator or Firebase Console to update
# Or use gcloud CLI if you have it set up
```

## Quick Steps Summary:

**Fastest Method (Firebase Console):**
1. Open Firebase Console → Firestore
2. Go to `users` collection
3. Find user document
4. Set `role: "admin"`
5. Save

**After assigning admin:**
- The user needs to **refresh the page** or **sign out and sign back in**
- They will then have access to `/admin` page

## Troubleshooting:

**"Access Denied" still showing?**
- Make sure you refreshed the page after assigning admin
- Check that the `role` field is exactly `"admin"` (not `"Admin"` or `"ADMIN"`)
- Verify you're looking at the correct Firebase project (dev vs prod)
- Check browser console for any errors

**Can't find user in Firestore?**
- User must have signed up at least once
- Check Authentication tab to find their UID
- Create the user document manually if needed with the structure:
  ```json
  {
    "displayName": "User Name",
    "email": "user@example.com",
    "role": "admin",
    "createdAt": "timestamp",
    "isEmailVerified": true
  }
  ```

## Security Note:

- Admin role gives full access to admin dashboard
- Only assign admin to trusted users
- Consider using `superadmin` for highest privileges (if you implement that distinction)

