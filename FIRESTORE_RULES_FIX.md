# ✅ Firestore Rules Fix - Subscription Plans

## Problem
The development project (`habs-meet-dev`) was showing permission errors when trying to read from the `subscriptionPlans` collection:
```
[SubscriptionPlans] Error loading plan pro: FirebaseError: Missing or insufficient permissions.
```

## Solution
The Firestore security rules were not deployed to the dev project. The rules file already had the correct permissions, but they needed to be deployed.

## What Was Done
✅ Deployed Firestore rules to `habs-meet-dev` project

The rules include:
```javascript
// Subscription Plans collection - editable only by admins, readable by all authenticated users
match /subscriptionPlans/{planId} {
  // All authenticated users can read plan configs (needed for subscription checks)
  allow read: if isAuthenticated();
  // Only admins can create/update/delete plan configs
  allow create, update, delete: if isAdmin();
}
```

## Next Steps
1. **Refresh your browser** - The rules are now active, but you may need to refresh to clear cached errors
2. **Check the console** - The permission errors should be gone
3. **Verify it works** - Try accessing the pricing page or subscription features

## Verification
To verify the rules are deployed:
1. Go to Firebase Console → Firestore Database → Rules
2. Check that the `subscriptionPlans` rules are present
3. The rules should match what's in `firestore.rules` file

## Note
The production project (`habs-meet-prod`) already had the rules deployed, which is why it was working there. Now both projects have the same rules.




