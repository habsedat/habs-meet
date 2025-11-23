/**
 * AuthContext - Authentication Context Provider
 * 
 * This authentication system works for BOTH development and production environments.
 * It uses environment variables (VITE_FIREBASE_*) which are configured per environment:
 * - Development: Uses habs-meet-dev Firebase project
 * - Production: Uses habs-meet-prod Firebase project
 * 
 * Key features:
 * - Email verification required before login (works for both environments)
 * - Automatic email verification sending on signup
 * - Handles existing unverified accounts gracefully
 * - Uses window.location.origin for email verification URLs (automatically adapts to dev/prod)
 * - Shared Firestore rules apply to both environments
 * 
 * Environment Configuration:
 * - Dev: Set VITE_FIREBASE_* variables in apps/web/.env.local (or demo.env)
 * - Prod: Set VITE_FIREBASE_* variables in apps/web/prod.env
 * 
 * Both environments use the same Firestore rules (firestore.rules) and Storage rules (storage.rules)
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification as firebaseSendEmailVerification,
  sendPasswordResetEmail,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  verifyPasswordResetCode,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { AuthErrorCodes } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { isValidPhoneNumber } from 'react-phone-number-input';
import { auth, db } from '../lib/firebase';
import toast from '../lib/toast';

interface UserProfile {
  displayName: string;
  email: string;
  phoneNumber: string;
  dateOfBirth: string;
  createdAt: string;
  lastLoginAt: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  role: 'user' | 'admin' | 'superadmin';
  photoURL?: string;
  savedBackground?: { type: 'none' | 'blur' | 'image' | 'video'; url?: string } | null;
  // User preferences - account-specific, not device-specific
  preferences?: {
    backgroundEffectsEnabled?: boolean;
    alwaysShowPreview?: boolean;
    viewMode?: 'gallery' | 'speaker' | 'grid' | 'multi-speaker' | 'immersive';
    videoDeviceId?: string | null;
    audioDeviceId?: string | null;
    videoEnabled?: boolean;
    audioEnabled?: boolean;
  };
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isEmailVerified: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, phoneNumber: string, dateOfBirth: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (displayName: string, phoneNumber?: string) => Promise<void>;
  updateProfilePicture: (photoURL: string) => Promise<void>;
  updateSavedBackground: (background: { type: 'none' | 'blur' | 'image' | 'video'; url?: string } | null) => Promise<void>;
  updateUserPreferences: (preferences: Partial<UserProfile['preferences']>) => Promise<void>;
  sendEmailVerification: () => Promise<void>;
  sendPhoneVerification: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  confirmPasswordReset: (code: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Age validation function - must be 16 or older
  const validateAge = (dateOfBirth: string): boolean => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      return age - 1 >= 16;
    }
    return age >= 16;
  };

  // Update last activity timestamp
  const updateLastActivity = () => {
    try {
      const rememberMeData = localStorage.getItem('rememberMe');
      if (rememberMeData) {
        const data = JSON.parse(rememberMeData);
        if (data.enabled) {
          localStorage.setItem('rememberMe', JSON.stringify({
            ...data,
            lastActivity: Date.now(),
          }));
        }
      }
    } catch (error) {
      console.error('Error updating last activity:', error);
    }
  };

  useEffect(() => {
    // Ensure loading starts as true
    setLoading(true);
    
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('[Auth] onAuthStateChanged:', user?.uid || 'null');
      
      try {
        if (!user) {
          setUser(null);
          setUserProfile(null);
          setIsEmailVerified(false);
          setIsAdmin(false);
          setLoading(false);
          return;
        }

          // Reload user to get latest verification status
          await user.reload();
          
        // Set user and verification status
        setUser(user);
          setIsEmailVerified(user.emailVerified);
          
          // Update last activity if Remember Me is enabled
          updateLastActivity();
          
          // Load user profile from Firestore
          const profileDoc = await getDoc(doc(db, 'users', user.uid));
          if (profileDoc.exists()) {
            const profileData = profileDoc.data() as UserProfile;
            setUserProfile(profileData);
            // Calculate admin status
            setIsAdmin(profileData.role === 'admin' || profileData.role === 'superadmin');
            // Update email verification status from profile if different
            if (profileData.isEmailVerified !== user.emailVerified) {
              await setDoc(doc(db, 'users', user.uid), {
                isEmailVerified: user.emailVerified
              }, { merge: true });
            }
            // Update Firebase Auth photoURL if different from Firestore
            if (profileData.photoURL && profileData.photoURL !== user.photoURL) {
              await updateProfile(user, { photoURL: profileData.photoURL });
            }
          } else {
          // Profile doesn't exist - this is normal during signup
          // Don't create it here, let signup function handle it
          setUserProfile(null);
          setIsAdmin(false);
        }
      } catch (error) {
        console.error('[Auth] Error in auth state change:', error);
        // Don't clear user on error - keep them logged in
      } finally {
        setLoading(false);
      }
    });

    // Update activity on user interactions (page visibility, focus, etc.)
    const handleActivity = () => {
      if (auth.currentUser) {
        updateLastActivity();
      }
    };

    // Track activity on various events
    window.addEventListener('focus', handleActivity);
    window.addEventListener('click', handleActivity);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && auth.currentUser) {
        updateLastActivity();
      }
    });

    return () => {
      unsubscribe();
      window.removeEventListener('focus', handleActivity);
      window.removeEventListener('click', handleActivity);
    };
  }, []);

  const signIn = async (email: string, password: string, rememberMe: boolean = false) => {
    try {
      // Set persistence based on Remember Me
      if (rememberMe) {
        await setPersistence(auth, browserLocalPersistence);
        // Store Remember Me preference and last activity
        localStorage.setItem('rememberMe', JSON.stringify({
          enabled: true,
          email: email.toLowerCase(),
          lastActivity: Date.now(),
        }));
      } else {
        await setPersistence(auth, browserSessionPersistence);
        // Clear Remember Me if unchecked
        localStorage.removeItem('rememberMe');
      }

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // CRITICAL: Reload user to get latest email verification status
      await user.reload();
      
      // Check if email is verified - REQUIRED for login
      if (!user.emailVerified) {
        // Sign out the user immediately
        await signOut(auth);
        
        // Send verification email again
        try {
          await firebaseSendEmailVerification(user, {
            url: `${window.location.origin}/`,
            handleCodeInApp: false,
          });
          throw new Error('Email not verified. Please check your email inbox (including spam folder) and verify your account before logging in. A new verification email has been sent.');
        } catch (error: any) {
          console.error('Error sending verification email:', error);
          if (error.message && error.message.includes('Email not verified')) {
            throw error; // Re-throw our custom error
          }
          throw new Error('Email not verified. Please check your email inbox (including spam folder) and verify your account before logging in.');
        }
      }
      
      // Update last login time
      if (auth.currentUser) {
        await setDoc(doc(db, 'users', auth.currentUser.uid), {
          lastLoginAt: serverTimestamp(),
        }, { merge: true });
        
        // Update last activity if Remember Me is enabled
        if (rememberMe) {
          updateLastActivity();
        }
      }
      
      toast.success('Signed in successfully');
    } catch (error: any) {
      // Provide user-friendly error messages
      let errorMessage = 'Authentication failed. Please check your credentials and try again.';
      
      if (error.code === AuthErrorCodes.INVALID_EMAIL || error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address. Please check your email and try again.';
      } else if (error.code === AuthErrorCodes.USER_DELETED || error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email address. Please check your email or sign up for a new account.';
      } else if (error.code === AuthErrorCodes.INVALID_PASSWORD || error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password. Please check your password and try again.';
      } else if (error.code === 'auth/invalid-credential') {
        errorMessage = 'Incorrect email or password. Please check your credentials and try again.';
      } else if (error.code === AuthErrorCodes.USER_DISABLED || error.code === 'auth/user-disabled') {
        errorMessage = 'This account has been disabled. Please contact support for assistance.';
      } else if (error.code === AuthErrorCodes.TOO_MANY_ATTEMPTS_TRY_LATER || error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed login attempts. Please try again later or reset your password.';
      } else if (error.code === AuthErrorCodes.NETWORK_REQUEST_FAILED || error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      }
      
      const customError = new Error(errorMessage);
      (customError as any).code = error.code;
      toast.error(errorMessage);
      throw customError;
    }
  };

  const signUp = async (email: string, password: string, displayName: string, phoneNumber: string, dateOfBirth: string) => {
    try {
      // Validate age - must be 16 or older
      if (!validateAge(dateOfBirth)) {
        throw new Error('You must be at least 16 years old to create an account');
      }

      // Strict phone number validation - must have country code and be valid
      if (!phoneNumber || !phoneNumber.trim()) {
        throw new Error('Phone number is required');
      }
      if (!phoneNumber.startsWith('+')) {
        throw new Error('Please select a country code for your phone number');
      }
      // Validate phone number format using library - ensures country-specific format and length
      if (!isValidPhoneNumber(phoneNumber)) {
        throw new Error('Please enter a valid phone number for the selected country');
      }
      // Additional length check (country code + digits)
      const phoneWithoutPlus = phoneNumber.replace('+', '');
      if (phoneWithoutPlus.length < 7 || phoneWithoutPlus.length > 15) {
        throw new Error('Phone number length is invalid. Please enter a complete phone number for the selected country');
      }

      console.log('[SignUp] Starting signup');
      
      // 1) Create Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log('[SignUp] User created with UID:', user.uid);
      
      // 2) Update display name
      await updateProfile(user, { displayName });
      console.log('[SignUp] Profile updated');
      
      // 3) Create Firestore doc WHILE user is signed in
      console.log('[SignUp] Writing to Firestore. User UID:', user.uid);
      await setDoc(doc(db, 'users', user.uid), {
        displayName,
        email: user.email || email,
        phoneNumber,
        dateOfBirth,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        isEmailVerified: false,
        isPhoneVerified: false,
        role: 'user',
      });
      console.log('[SignUp] ✅ User profile created successfully in Firestore');
      
      // 4) Send verification email
      await sendEmailVerificationWithBetterDeliverability(user, displayName);
      console.log('[SignUp] Verification email sent');
        
    } catch (error: any) {
      // Log the actual error for debugging
      console.error('[SignUp] Error code:', error?.code);
      console.error('[SignUp] Error message:', error?.message);
      
      // ❌ IMPORTANT: DO NOT signOut(auth) here
      // ❌ DO NOT deleteUser(user) here
      // ❌ DO NOT clear signup flag here - let it stay set
      
      // Handle case where email already exists - ONLY if the error code matches
      if (error.code === AuthErrorCodes.EMAIL_EXISTS || error.code === 'auth/email-already-in-use') {
          console.log('[SignUp] Account with this email already exists. Attempting to handle unverified account...');
          
        // Try to sign in with the provided password
        try {
          const signInCredential = await signInWithEmailAndPassword(auth, email, password);
          const existingUser = signInCredential.user;
          
          await existingUser.reload();
          
          if (existingUser.emailVerified) {
            // Account exists and is verified - user should sign in instead
            throw new Error('An account with this email already exists and is verified. Please sign in instead.');
          }
          
          // Account exists but email is not verified - update profile and resend verification
          console.log('[SignUp] Account exists but email not verified. Updating profile and resending verification email.');
          
          await updateProfile(existingUser, { displayName });
          
          await setDoc(doc(db, 'users', existingUser.uid), {
            displayName,
            email: existingUser.email || email,
            phoneNumber,
            dateOfBirth,
            createdAt: existingUser.metadata.creationTime || serverTimestamp(),
            lastLoginAt: serverTimestamp(),
            isEmailVerified: false,
            isPhoneVerified: false,
            role: 'user',
          }, { merge: true });
          
          await sendEmailVerificationWithBetterDeliverability(existingUser, displayName);
          console.log('[SignUp] ✅ Successfully handled existing unverified account. Verification email sent.');
          return; // Exit successfully
          
        } catch (signInError: any) {
          if (signInError.code === AuthErrorCodes.INVALID_PASSWORD || 
              signInError.code === 'auth/wrong-password' || 
              signInError.code === 'auth/invalid-credential') {
            throw new Error('An account with this email already exists, but the password you entered is incorrect. Please sign in with your existing password, or use "Forgot Password" if you don\'t remember it.');
          }
          throw signInError;
        }
      }
      
      // For other errors, provide user-friendly messages
      if (error.code === AuthErrorCodes.INVALID_EMAIL || error.code === 'auth/invalid-email') {
        throw new Error('Invalid email address. Please check your email and try again.');
      } else if (error.code === AuthErrorCodes.WEAK_PASSWORD || error.code === 'auth/weak-password') {
        throw new Error('Password is too weak. Please use a stronger password (at least 8 characters).');
      } else if (error.code === 'auth/operation-not-allowed') {
        throw new Error('Email/password accounts are not enabled. Please contact support.');
      } else if (error.code === 'auth/network-request-failed') {
        throw new Error('Network error. Please check your internet connection and try again.');
      }
      
      // Re-throw the original error
      throw error;
    }
  };

  const sendEmailVerificationWithBetterDeliverability = async (user: any, displayName: string) => {
    try {
      // Ensure user is reloaded to get latest state
      await user.reload();
      
      // Check if email is already verified (shouldn't happen during signup, but check anyway)
      if (user.emailVerified) {
        console.log(`[EmailVerification] Email ${user.email} is already verified`);
        return;
      }
      
      // Send email verification immediately after signup
      // Use actionCodeSettings to customize the email link
      const actionCodeSettings = {
        url: `${window.location.origin}/`,
        handleCodeInApp: false,
      };
      
      await firebaseSendEmailVerification(user, actionCodeSettings);
      
      // Log for debugging
      console.log(`[EmailVerification] ✅ Verification email sent successfully to ${user.email} for user ${displayName}`);
      console.log(`[EmailVerification] Action URL: ${actionCodeSettings.url}`);
      
      // TODO: Integrate with SendGrid, Mailgun, or other services for better deliverability
      // Example: await sendGridService.sendVerificationEmail(user.email, displayName);
      
    } catch (error: any) {
      console.error('[EmailVerification] ❌ Error sending verification email:', error);
      console.error('[EmailVerification] Error code:', error.code);
      console.error('[EmailVerification] Error message:', error.message);
      
      // Fallback to Firebase's default method (without actionCodeSettings)
      try {
        console.log('[EmailVerification] Attempting fallback method...');
        await firebaseSendEmailVerification(user);
        console.log('[EmailVerification] ✅ Fallback verification email sent successfully');
      } catch (fallbackError: any) {
        console.error('[EmailVerification] ❌ Fallback email verification also failed:', fallbackError);
        console.error('[EmailVerification] Fallback error code:', fallbackError.code);
        console.error('[EmailVerification] Fallback error message:', fallbackError.message);
        
        // Don't throw here - let the account creation succeed
        // The user can request a resend from the verification instructions page
        throw new Error('Failed to send verification email. You can request a new verification email from the verification page.');
      }
    }
  };

  const logout = async () => {
    try {
      // Clear Remember Me on logout
      localStorage.removeItem('rememberMe');
      await signOut(auth);
      toast.success('Signed out successfully');
    } catch (error: any) {
      toast.error('Failed to sign out');
      throw error;
    }
  };

  const updateUserProfile = async (displayName: string, phoneNumber?: string) => {
    if (!user) throw new Error('No user logged in');
    
    try {
      await updateProfile(user, { displayName });
      const updatedProfile = { 
        ...userProfile!, 
        displayName,
        ...(phoneNumber && { phoneNumber })
      };
      await setDoc(doc(db, 'users', user.uid), updatedProfile);
      setUserProfile(updatedProfile);
      toast.success('Profile updated successfully');
    } catch (error: any) {
      toast.error('Failed to update profile');
      throw error;
    }
  };

  const updateSavedBackground = async (background: { type: 'none' | 'blur' | 'image' | 'video'; url?: string } | null) => {
    if (!user) throw new Error('No user logged in');
    
    try {
      // Update Firestore user profile with saved background preference
      await setDoc(doc(db, 'users', user.uid), {
        savedBackground: background
      }, { merge: true });
      
      // Update local state
      if (userProfile) {
        setUserProfile({ ...userProfile, savedBackground: background });
      }
      
      // DO NOT save to localStorage - it's device-specific and causes cross-user contamination
      // Only save to Firestore (user-specific)
    } catch (error: any) {
      console.error('Failed to save background preference:', error);
      toast.error('Failed to save background preference');
      throw error;
    }
  };

  const updateUserPreferences = async (preferences: Partial<UserProfile['preferences']>) => {
    if (!user) throw new Error('No user logged in');
    
    try {
      // Merge with existing preferences
      const currentPreferences = userProfile?.preferences || {};
      const updatedPreferences = { ...currentPreferences, ...preferences };
      
      // Update Firestore user profile with preferences
      await setDoc(doc(db, 'users', user.uid), {
        preferences: updatedPreferences
      }, { merge: true });
      
      // Update local state
      if (userProfile) {
        setUserProfile({ ...userProfile, preferences: updatedPreferences });
      }
      
      // DO NOT save to localStorage - preferences are user-specific, not device-specific
    } catch (error: any) {
      console.error('Failed to save user preferences:', error);
      toast.error('Failed to save preferences');
      throw error;
    }
  };

  const updateProfilePicture = async (photoURL: string) => {
    if (!user) throw new Error('No user logged in');
    
    try {
      // Update Firebase Auth profile
      await updateProfile(user, { photoURL });
      // Update Firestore profile
      const updatedProfile = { 
        ...userProfile!, 
        photoURL
      };
      await setDoc(doc(db, 'users', user.uid), updatedProfile, { merge: true });
      setUserProfile(updatedProfile);
    } catch (error: any) {
      toast.error('Failed to update profile picture');
      throw error;
    }
  };

  const sendEmailVerification = async () => {
    if (!user) throw new Error('No user logged in');
    
    try {
      await firebaseSendEmailVerification(user);
      toast.success('Verification email sent! Please check your inbox.');
    } catch (error: any) {
      toast.error('Failed to send verification email');
      throw error;
    }
  };

  const sendPhoneVerification = async () => {
    if (!user) throw new Error('No user logged in');
    
    try {
      // TODO: Implement phone verification with Firebase Auth
      toast('Phone verification will be implemented soon');
    } catch (error: any) {
      toast.error('Failed to send phone verification');
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      // Check rate limiting
      const rateLimitKey = `passwordReset_${email.toLowerCase()}`;
      const storedData = localStorage.getItem(rateLimitKey);
      const now = Date.now();
      const twentyFourHours = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      
      let requests: number[] = [];
      if (storedData) {
        const parsed = JSON.parse(storedData);
        // Filter out requests older than 24 hours
        requests = parsed.requests.filter((timestamp: number) => now - timestamp < twentyFourHours);
      }
      
      // Check if user has exceeded limit
      if (requests.length >= 4) {
        const oldestRequest = Math.min(...requests);
        const timeUntilReset = twentyFourHours - (now - oldestRequest);
        const hours = Math.floor(timeUntilReset / (60 * 60 * 1000));
        const minutes = Math.floor((timeUntilReset % (60 * 60 * 1000)) / (60 * 1000));
        
        const errorMessage = `You've reached the limit of 4 password reset requests in 24 hours. Please wait ${hours}h ${minutes}m before requesting again.`;
        toast.error(errorMessage);
        throw new Error(errorMessage);
      }
      
      const actionCodeSettings = {
        url: `${window.location.origin}/reset-password`,
        handleCodeInApp: false,
      };
      
      await sendPasswordResetEmail(auth, email, actionCodeSettings);
      
      // Store this request timestamp
      requests.push(now);
      localStorage.setItem(rateLimitKey, JSON.stringify({
        requests,
        lastRequest: now,
      }));
      
      toast.success('Password reset email sent! Please check your inbox (including spam folder).');
    } catch (error: any) {
      console.error('Error sending password reset email:', error);
      // Only show toast if it's not our custom rate limit error (already shown)
      if (!error.message.includes('limit of 4 password reset requests')) {
        toast.error('Failed to send password reset email: ' + error.message);
      }
      throw error;
    }
  };

  const confirmPasswordReset = async (code: string, newPassword: string) => {
    try {
      // Verify the code first and get the email
      const email = await verifyPasswordResetCode(auth, code);
      
      // Check if the new password is the same as the old password
      // by attempting to sign in with the new password
      try {
        await signInWithEmailAndPassword(auth, email, newPassword);
        // If sign in succeeds, the password is the same - reject it
        // Sign out immediately since we don't want to keep them signed in
        await signOut(auth);
        toast.error('You cannot use your existing password. Please choose a different password.');
        throw new Error('Password must be different from the current password');
      } catch (signInError: any) {
        // If sign in fails, it means the password is different (which is what we want)
        // Check if it's a wrong password error (which is expected) or another error
        if (signInError.code === AuthErrorCodes.INVALID_PASSWORD || 
            signInError.code === 'auth/wrong-password' ||
            signInError.code === 'auth/invalid-credential') {
          // This is expected - password is different, proceed with reset
        } else if (signInError.message.includes('Password must be different')) {
          // Re-throw our custom error
          throw signInError;
        } else {
          // Some other error occurred, but we'll proceed anyway
          // (user might not exist, etc.)
        }
      }
      
      // Confirm the password reset
      await firebaseConfirmPasswordReset(auth, code, newPassword);
      toast.success('Password reset successfully! You can now sign in with your new password.');
    } catch (error: any) {
      console.error('Error confirming password reset:', error);
      // Don't show error if it's our custom "password must be different" error
      // (already shown above)
      if (!error.message.includes('Password must be different')) {
        toast.error('Failed to reset password: ' + error.message);
      }
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    userProfile,
    loading,
    isEmailVerified,
    isAdmin,
    signIn,
    signUp,
    logout,
    updateUserProfile,
    updateProfilePicture,
    updateSavedBackground,
    updateUserPreferences,
    sendEmailVerification,
    sendPhoneVerification,
    resetPassword,
    confirmPasswordReset,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
