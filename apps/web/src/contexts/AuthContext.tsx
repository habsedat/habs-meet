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
import { doc, setDoc, getDoc } from 'firebase/firestore';
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

  // Check if Remember Me session is still valid (within 60 days)
  const checkRememberMeSession = (): boolean => {
    try {
      const rememberMeData = localStorage.getItem('rememberMe');
      if (!rememberMeData) return false;

      const { enabled, lastActivity } = JSON.parse(rememberMeData);
      if (!enabled) return false;

      const now = Date.now();
      const sixtyDaysInMs = 60 * 24 * 60 * 60 * 1000; // 60 days in milliseconds
      const timeSinceLastActivity = now - lastActivity;

      if (timeSinceLastActivity > sixtyDaysInMs) {
        // Session expired - clear Remember Me
        localStorage.removeItem('rememberMe');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking Remember Me session:', error);
      return false;
    }
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
    
    // Check Remember Me session validity before checking auth state
    const isRememberMeValid = checkRememberMeSession();
    
    // If Remember Me is invalid, sign out
    if (!isRememberMeValid && auth.currentUser) {
      signOut(auth).catch(console.error);
    }
    
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        // Check Remember Me again when auth state changes
        const rememberMeValid = checkRememberMeSession();
        
        if (user && !rememberMeValid) {
          // User is logged in but Remember Me expired - sign them out
          await signOut(auth);
          setUser(null);
          setUserProfile(null);
          setIsEmailVerified(false);
          setLoading(false);
          return;
        }

        setUser(user);
        if (user) {
          // Update last activity if Remember Me is enabled
          updateLastActivity();
          
          // Update email verification status
          setIsEmailVerified(user.emailVerified);
          
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
            // Create profile if it doesn't exist
            const profile: UserProfile = {
              displayName: user.displayName || '',
              email: user.email || '',
              phoneNumber: '',
              dateOfBirth: '',
              createdAt: new Date().toISOString(),
              lastLoginAt: new Date().toISOString(),
              isEmailVerified: user.emailVerified,
              isPhoneVerified: false,
              role: 'user',
              photoURL: user.photoURL || undefined,
            };
            await setDoc(doc(db, 'users', user.uid), profile);
            setUserProfile(profile);
            setIsAdmin(false); // New users are not admin by default
          }
        } else {
          setUserProfile(null);
          setIsEmailVerified(false);
          setIsAdmin(false);
        }
      } catch (error) {
        console.error('Error in auth state change:', error);
        setUser(null);
        setUserProfile(null);
        setIsEmailVerified(false);
      } finally {
        // Always set loading to false after auth state is determined
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

      await signInWithEmailAndPassword(auth, email, password);
      
      // Update last login time
      if (auth.currentUser) {
        await setDoc(doc(db, 'users', auth.currentUser.uid), {
          lastLoginAt: new Date().toISOString(),
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

      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(user, { displayName });
      
      // Create user profile in Firestore
      const profile: UserProfile = {
        displayName,
        email,
        phoneNumber,
        dateOfBirth,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        isEmailVerified: false,
        isPhoneVerified: false,
        role: 'user',
      };
      await setDoc(doc(db, 'users', user.uid), profile);
      
      // Send email verification with better deliverability
      await sendEmailVerificationWithBetterDeliverability(user, displayName);
      
      // Sign out the user immediately after signup to force email verification
      await signOut(auth);
      
      toast.success('Account created successfully! Please check your email (including spam folder) to verify your account.');
    } catch (error: any) {
      toast.error(error.message);
      throw error;
    }
  };

  const sendEmailVerificationWithBetterDeliverability = async (user: any, displayName: string) => {
    try {
      // First, try Firebase's built-in email verification
      await firebaseSendEmailVerification(user);
      
      // Log for debugging
      console.log(`Verification email sent to ${user.email} for user ${displayName}`);
      
      // TODO: Integrate with SendGrid, Mailgun, or other services for better deliverability
      // Example: await sendGridService.sendVerificationEmail(user.email, displayName);
      
    } catch (error) {
      console.error('Error sending verification email:', error);
      // Fallback to Firebase's default method
      await firebaseSendEmailVerification(user);
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
    sendEmailVerification,
    sendPhoneVerification,
    resetPassword,
    confirmPasswordReset,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
