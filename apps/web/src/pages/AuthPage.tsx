import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword, signOut as firebaseSignOut, sendEmailVerification as firebaseSendEmailVerification } from 'firebase/auth';
import BiometricAuth from '../components/BiometricAuth';
import ForgotPasswordModal from '../components/ForgotPasswordModal';
import EmailVerificationInstructions from '../components/EmailVerificationInstructions';
import PhoneInput from 'react-phone-number-input';
import { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import '../styles/phone-input.css';
import toast from '../lib/toast';

const AuthPage: React.FC = () => {
  const { signIn, signUp, loading, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Redirect authenticated users to home page
  useEffect(() => {
    if (!loading && user) {
      navigate('/home');
    }
  }, [loading, user, navigate]);
  
  // Check URL parameter for mode (signin or signup)
  const modeParam = searchParams.get('mode');
  const [isSignUp, setIsSignUp] = useState(modeParam === 'signup');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [loginError, setLoginError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showVerificationInstructions, setShowVerificationInstructions] = useState(false);
  const [signupEmail, setSignupEmail] = useState<string>('');
  const [signupPassword, setSignupPassword] = useState<string>(''); // Store password temporarily for resend
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  
  // Signup form data
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    dateOfBirth: '',
    password: '',
    confirmPassword: '',
    agreeToTerms: false
  });
  const [phoneError, setPhoneError] = useState<string>('');
  
  // Login form data
  const [loginData, setLoginData] = useState({
    email: '',
    password: '',
    rememberMe: false
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    
    if (isSignUp) {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    } else {
      setLoginData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
  };

  const validateForm = () => {
    if (isSignUp) {
      if (!formData.fullName.trim()) {
        toast.error('Full name is required');
        return false;
      }
      if (!formData.email.trim()) {
        toast.error('Email is required');
        return false;
      }
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        toast.error('Please enter a valid email address');
        return false;
      }
      // Strict phone number validation - must have country code and be valid
      if (!formData.phoneNumber || !formData.phoneNumber.trim()) {
        setPhoneError('Phone number is required');
        toast.error('Phone number is required');
        return false;
      }
      // Ensure phone number includes country code (starts with +)
      if (!formData.phoneNumber.startsWith('+')) {
        setPhoneError('Please select a country code');
        toast.error('Please select a country code for your phone number');
        return false;
      }
      // Strict validation: phone number must be valid for the selected country
      // This ensures the number matches the country's format and length requirements
      if (!isValidPhoneNumber(formData.phoneNumber)) {
        setPhoneError('Please enter a valid phone number for the selected country');
        toast.error('Please enter a valid phone number for the selected country');
        return false;
      }
      // Additional validation: ensure phone number has minimum length (at least country code + 4 digits)
      const phoneWithoutPlus = formData.phoneNumber.replace('+', '');
      if (phoneWithoutPlus.length < 7) {
        setPhoneError('Phone number is too short');
        toast.error('Please enter a complete phone number');
        return false;
      }
      setPhoneError('');
      if (!formData.dateOfBirth.trim()) {
        toast.error('Date of birth is required');
        return false;
      }
      if (formData.password.length < 8) {
        toast.error('Password must be at least 8 characters');
        return false;
      }
      if (formData.password !== formData.confirmPassword) {
        toast.error('Passwords do not match');
        return false;
      }
      if (!formData.agreeToTerms) {
        toast.error('You must agree to the terms and conditions');
        return false;
      }
    } else {
      if (!loginData.email.trim()) {
        toast.error('Email is required');
        return false;
      }
      if (!loginData.password.trim()) {
        toast.error('Password is required');
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);
    setLoginError('');

    try {
      if (isSignUp) {
        // Call signUp function which handles account creation and email sending
        await signUp(formData.email, formData.password, formData.fullName, formData.phoneNumber, formData.dateOfBirth);
        
        // Account created successfully - show verification instructions page
        setSignupEmail(formData.email);
        setSignupPassword(formData.password); // Store password temporarily for resend functionality
        setShowVerificationInstructions(true);
        
        // Reset form
        setFormData({
          fullName: '',
          email: '',
          phoneNumber: '',
          dateOfBirth: '',
          password: '',
          confirmPassword: '',
          agreeToTerms: false
        });
      } else {
        await signIn(loginData.email, loginData.password, loginData.rememberMe);
        // Only navigate if sign in successful (email verified)
        toast.success('Welcome back!');
        navigate('/home');
      }
    } catch (error: any) {
      // Set error message for display in UI
      const errorMessage = error.message || 'Authentication failed. Please check your credentials and try again.';
      setLoginError(errorMessage);
      
      // Log full error for debugging
      console.error('[AuthPage] Sign up error:', error);
      console.error('[AuthPage] Error code:', error.code);
      console.error('[AuthPage] Error message:', errorMessage);
      
      // Show specific error messages
      if (errorMessage.includes('Email not verified') || errorMessage.includes('verify your email')) {
        // Email verification error - show helpful message
        toast.error('Please verify your email address before logging in. Check your inbox (including spam folder) for the verification email.', { duration: 6000 });
      } else if (errorMessage.includes('phone number')) {
        // Phone number validation error
        toast.error(errorMessage);
      } else if (errorMessage.includes('Firebase') || errorMessage.includes('configuration')) {
        // Firebase configuration error
        toast.error('Configuration error: ' + errorMessage + ' Please contact support.', { duration: 8000 });
      } else {
        // Other authentication errors
        toast.error(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerificationEmail = async () => {
    if (!signupEmail || !signupPassword) {
      toast.error('Unable to resend email. Please sign up again or check your inbox.');
      return;
    }
    
    setIsResendingEmail(true);
    try {
      // Sign in directly with Firebase Auth (bypassing AuthContext to avoid email verification check)
      console.log('[ResendEmail] Signing in temporarily to resend verification email...');
      const userCredential = await signInWithEmailAndPassword(auth, signupEmail, signupPassword);
      const user = userCredential.user;
      
      // Reload user to get latest state
      await user.reload();
      
      // Check if email is already verified
      if (user.emailVerified) {
        await firebaseSignOut(auth);
        toast.success('Your email is already verified! You can now sign in.');
        return;
      }
      
      // Resend verification email
      await firebaseSendEmailVerification(user, {
        url: `${window.location.origin}/`,
        handleCodeInApp: false,
      });
      
      // Sign out again immediately
      await firebaseSignOut(auth);
      
      toast.success('Verification email resent! Please check your inbox (including spam folder).');
    } catch (error: any) {
      console.error('[ResendEmail] Error resending verification email:', error);
      
      // Ensure we're signed out even if there's an error
      try {
        await firebaseSignOut(auth);
      } catch (signOutError) {
        // Ignore sign out errors
      }
      
      // Provide helpful error messages
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        toast.error('Invalid email or password. Please check your credentials or try signing up again.');
      } else if (error.code === 'auth/too-many-requests') {
        toast.error('Too many requests. Please wait a few minutes before trying again.');
      } else {
        toast.error('Failed to resend verification email. Please check your inbox (including spam folder) or try signing up again.');
      }
      throw error;
    } finally {
      setIsResendingEmail(false);
    }
  };

  const handleBiometricSuccess = () => {
    toast.success('Biometric authentication successful!');
    navigate('/home');
  };

  const handleBiometricError = (error: string) => {
    toast.error('Biometric authentication failed: ' + error);
  };

  // Show verification instructions page if signup was successful
  if (showVerificationInstructions) {
    return (
      <EmailVerificationInstructions
        email={signupEmail}
        onResendEmail={handleResendVerificationEmail}
        isResending={isResendingEmail}
      />
    );
  }

  return (
    <div className="min-h-screen bg-midnight flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Brand Logo */}
        <div className="text-center mb-8">
          <img 
            src="/logo.png" 
            alt="Habs Meet Logo" 
            className="w-16 h-16 mx-auto mb-4 object-contain"
          />
          <h1 className="text-3xl font-bold text-cloud font-brand">Habs Meet</h1>
          <p className="text-gray-400 mt-2">Premium video meetings</p>
        </div>

        {/* Auth Form */}
        <div className="bg-cloud rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-midnight">
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </h2>
            <p className="text-gray-600 mt-2">
              {isSignUp 
                ? 'Sign up to start hosting premium meetings' 
                : 'Sign in to your account'
              }
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name (Signup only) */}
            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-midnight mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent"
                  placeholder="Enter your full name"
                  required
                />
              </div>
            )}

            {/* Date of Birth (Signup only) */}
            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-midnight mb-2">
                  Date of Birth *
                </label>
                <input
                  type="date"
                  name="dateOfBirth"
                  value={formData.dateOfBirth}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent text-gray-900"
                  style={{color: '#111827', backgroundColor: 'white'}}
                  required
                  max={new Date(new Date().setFullYear(new Date().getFullYear() - 16)).toISOString().split('T')[0]}
                  title="You must be at least 16 years old"
                />
                <p className="text-xs text-gray-500 mt-1">You must be at least 16 years old to create an account</p>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-midnight mb-2">
                Email Address *
              </label>
              <input
                type="email"
                name="email"
                value={isSignUp ? formData.email : loginData.email}
                onChange={(e) => {
                  handleInputChange(e);
                  // Clear error when user starts typing
                  if (!isSignUp && loginError) {
                    setLoginError('');
                  }
                }}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent ${
                  !isSignUp && loginError ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
                placeholder="Enter your email address"
                required
              />
            </div>

            {/* Phone Number (Signup only) */}
            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-midnight mb-2">
                  Phone Number *
                </label>
                <div className={`border rounded-lg ${phoneError ? 'border-red-300 bg-red-50' : 'border-gray-300'} focus-within:ring-2 focus-within:ring-techBlue focus-within:border-transparent`}>
                  <PhoneInput
                    international
                    defaultCountry="SL"
                    value={formData.phoneNumber}
                    onChange={(value) => {
                      setFormData(prev => ({ ...prev, phoneNumber: value || '' }));
                      // Clear error when user starts typing
                      if (phoneError) {
                        setPhoneError('');
                      }
                      // Real-time validation - must be valid phone number with country code
                      if (value) {
                        // Ensure it starts with +
                        if (!value.startsWith('+')) {
                          setPhoneError('Please select a country code');
                          return;
                        }
                        // Validate phone number format for the selected country
                        if (!isValidPhoneNumber(value)) {
                          setPhoneError('Please enter a valid phone number for the selected country');
                        } else {
                          setPhoneError('');
                        }
                      } else {
                        // Empty value is allowed while typing, but will be validated on submit
                        setPhoneError('');
                      }
                    }}
                    onBlur={() => {
                      // Validate on blur - strict validation
                      if (formData.phoneNumber) {
                        if (!formData.phoneNumber.startsWith('+')) {
                          setPhoneError('Please select a country code');
                        } else if (!isValidPhoneNumber(formData.phoneNumber)) {
                          setPhoneError('Please enter a valid phone number for the selected country');
                        } else {
                          setPhoneError('');
                        }
                      }
                    }}
                    className="!w-full"
                    numberInputProps={{
                      className: `!w-full px-4 py-3 border-0 focus:ring-0 focus:outline-none ${phoneError ? 'bg-red-50' : ''}`,
                      required: true,
                      placeholder: 'Enter phone number',
                    }}
                    countrySelectProps={{
                      className: '!px-2 !py-3',
                    }}
                    style={{
                      '--PhoneInputCountryFlag-height': '1.2em',
                      '--PhoneInputCountryFlag-width': '1.5em',
                    } as React.CSSProperties}
                  />
                </div>
                {phoneError && (
                  <p className="text-xs text-red-600 mt-1">{phoneError}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">Select your country code and enter your phone number</p>
              </div>
            )}

            {/* Login Error Message */}
            {!isSignUp && loginError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-red-600 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-800">Login Failed</p>
                    <p className="text-sm text-red-700 mt-1">{loginError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLoginError('')}
                    className="text-red-400 hover:text-red-600 ml-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-midnight mb-2">
                Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={isSignUp ? formData.password : loginData.password}
                  onChange={(e) => {
                    handleInputChange(e);
                    // Clear error when user starts typing
                    if (!isSignUp && loginError) {
                      setLoginError('');
                    }
                  }}
                  className={`w-full px-4 py-3 pr-12 border rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent ${
                    !isSignUp && loginError ? 'border-red-300 bg-red-50' : 'border-gray-300'
                  }`}
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password (Signup only) */}
            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-midnight mb-2">
                  Confirm Password *
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent"
                    placeholder="Confirm your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showConfirmPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Remember Me / Terms */}
            <div className="flex items-center justify-between">
              {isSignUp ? (
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="agreeToTerms"
                    checked={formData.agreeToTerms}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-techBlue border-gray-300 rounded focus:ring-techBlue"
                  />
                  <span className="ml-2 text-sm text-gray-600">
                    I agree to the{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        navigate('/terms');
                      }}
                      className="text-techBlue hover:underline"
                    >
                      Terms and Conditions
                    </button>
                  </span>
                </label>
              ) : (
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="rememberMe"
                    checked={loginData.rememberMe}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-techBlue border-gray-300 rounded focus:ring-techBlue"
                  />
                  <span className="ml-2 text-sm text-gray-600">Remember me</span>
                </label>
              )}
              
              {!isSignUp && (
                <button
                  type="button"
                  onClick={() => setShowForgotPasswordModal(true)}
                  className="text-sm text-techBlue hover:underline"
                >
                  Forgot password?
                </button>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-techBlue to-violetDeep text-cloud py-3 px-4 rounded-lg font-semibold hover:from-techBlue/90 hover:to-violetDeep/90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Please wait...' : (isSignUp ? 'Create Account' : 'Sign In')}
            </button>
          </form>

          {/* Biometric Login (Login only) */}
          {!isSignUp && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-center text-sm text-gray-600 mb-4">
                Or sign in with biometric authentication
              </p>
              <BiometricAuth
                onSuccess={handleBiometricSuccess}
                onError={handleBiometricError}
              />
            </div>
          )}

          {/* Switch between Sign Up and Sign In */}
          <div className="mt-6 text-center">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-techBlue hover:underline text-sm font-bold"
            >
              {isSignUp 
                ? 'Already have an account? Sign in' 
                : "Don't have an account? Sign up"
              }
            </button>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
      />
    </div>
  );
};

export default AuthPage;
