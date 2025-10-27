import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification as firebaseSendEmailVerification,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import toast from 'react-hot-toast';

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
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isEmailVerified: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, phoneNumber: string, dateOfBirth: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (displayName: string, phoneNumber?: string) => Promise<void>;
  sendEmailVerification: () => Promise<void>;
  sendPhoneVerification: () => Promise<void>;
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

  useEffect(() => {
    // Ensure loading starts as true
    setLoading(true);
    
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        setUser(user);
        if (user) {
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

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      
      // Update last login time
      if (auth.currentUser) {
        await setDoc(doc(db, 'users', auth.currentUser.uid), {
          lastLoginAt: new Date().toISOString(),
        }, { merge: true });
      }
      
      toast.success('Signed in successfully');
    } catch (error: any) {
      toast.error(error.message);
      throw error;
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
    sendEmailVerification,
    sendPhoneVerification,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
