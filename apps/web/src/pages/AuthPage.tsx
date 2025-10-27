import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import BiometricAuth from '../components/BiometricAuth';
import toast from 'react-hot-toast';

const AuthPage: React.FC = () => {
  const { signIn, signUp, loading, user } = useAuth();
  const navigate = useNavigate();
  
  // Redirect authenticated users to home page
  useEffect(() => {
    if (!loading && user) {
      navigate('/home');
    }
  }, [loading, user, navigate]);
  
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
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
      if (!formData.phoneNumber.trim()) {
        toast.error('Phone number is required');
        return false;
      }
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
    
    if (!validateForm()) return;

    try {
      if (isSignUp) {
        await signUp(formData.email, formData.password, formData.fullName, formData.phoneNumber, formData.dateOfBirth);
        toast.success('Account created successfully! Please check your email for verification.');
        navigate('/home');
      } else {
        await signIn(loginData.email, loginData.password);
        toast.success('Welcome back!');
        navigate('/home');
      }
    } catch (error: any) {
      toast.error(error.message || 'Authentication failed');
    }
  };

  const handleBiometricSuccess = () => {
    toast.success('Biometric authentication successful!');
    navigate('/home');
  };

  const handleBiometricError = (error: string) => {
    toast.error('Biometric authentication failed: ' + error);
  };

  return (
    <div className="min-h-screen bg-midnight flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Brand Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-techBlue to-violetDeep rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-bold text-cloud">H</span>
          </div>
          <h1 className="text-3xl font-bold text-cloud font-brand">Habs Meet</h1>
          <p className="text-gray-400 mt-2">Professional video meetings</p>
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
                ? 'Sign up to start hosting professional meetings' 
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
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent"
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
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent"
                  placeholder="Enter your phone number"
                  required
                />
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
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-techBlue focus:border-transparent"
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
                    <a href="#" className="text-techBlue hover:underline">
                      Terms and Conditions
                    </a>
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
                <a href="#" className="text-sm text-techBlue hover:underline">
                  Forgot password?
                </a>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-techBlue to-violetDeep text-cloud py-3 px-4 rounded-lg font-semibold hover:from-techBlue/90 hover:to-violetDeep/90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Please wait...' : (isSignUp ? 'Create Account' : 'Sign In')}
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
              className="text-techBlue hover:underline text-sm"
            >
              {isSignUp 
                ? 'Already have an account? Sign in' 
                : "Don't have an account? Sign up"
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
