import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const WelcomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  // Redirect authenticated users to home
  useEffect(() => {
    if (!loading && user) {
      navigate('/home');
    }
  }, [loading, user, navigate]);

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-midnight flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-goldBright"></div>
      </div>
    );
  }

  const features = [
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
      title: 'HD Video Meetings',
      description: 'Crystal-clear video quality with adaptive streaming for the best experience on any device.'
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      title: 'Screen Sharing',
      description: 'Share your screen with high-quality streaming up to 3.5 Mbps for presentations and collaboration.'
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
      title: 'HD Recording',
      description: 'Record your meetings in HD quality with automatic cloud storage and easy access.'
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      title: 'Background Effects',
      description: 'Professional blur effects and virtual backgrounds to maintain privacy and professionalism.'
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      title: 'Secure & Private',
      description: 'Invite-only meetings with HMAC-signed tokens and host controls for maximum security.'
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      title: 'Real-time Chat',
      description: 'Instant messaging during meetings with persistent chat history and notifications.'
    }
  ];

  return (
    <div className="min-h-screen bg-midnight text-cloud">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-techBlue/20 via-midnight to-violetDeep/20"></div>
        
        <div className="relative container mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-24 lg:py-32">
          <div className="max-w-4xl mx-auto text-center">
            {/* Logo */}
            <div className="mb-4 sm:mb-6 flex flex-col items-center animate-fade-in">
              <img 
                src="/logo.png" 
                alt="Habs Meet Logo" 
                className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 object-contain mb-3 sm:mb-4"
              />
              <p className="text-xs sm:text-sm md:text-base text-cloud/70 font-medium">
                Modern, secure, and intelligent video meetings.
              </p>
            </div>

            {/* Main Headline */}
            <h1 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold mb-4 md:mb-6 bg-gradient-to-r from-cloud via-goldBright to-cloud bg-clip-text text-transparent animate-fade-in-up delay-100">
              Welcome to Habs Meet
            </h1>
            
            <p className="text-base sm:text-lg md:text-xl text-cloud/80 mb-3 md:mb-4 max-w-2xl mx-auto animate-fade-in-up delay-200">
              Premium video meetings for professionals
            </p>
            
            <p className="text-sm sm:text-base md:text-lg text-cloud/70 mb-8 md:mb-12 max-w-xl mx-auto animate-fade-in-up delay-300">
              Experience crystal-clear HD video, secure invite-only meetings, and powerful collaboration tools designed for modern teams.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center mb-12 md:mb-16 animate-fade-in-up delay-400">
              <button
                onClick={() => navigate('/auth?mode=signup')}
                className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-techBlue to-violetDeep text-cloud font-bold rounded-full hover:from-techBlue/90 hover:to-violetDeep/90 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-2xl hover:shadow-techBlue/50 text-sm sm:text-base md:text-lg relative overflow-hidden group"
              >
                <span className="relative z-10">Get Started Free</span>
                <span className="absolute inset-0 bg-gradient-to-r from-techBlue to-violetDeep opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300"></span>
              </button>
              <button
                onClick={() => navigate('/auth')}
                className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-transparent border-2 border-goldBright text-goldBright font-bold rounded-full hover:bg-goldBright hover:text-midnight transition-all duration-300 text-sm sm:text-base md:text-lg relative overflow-hidden group"
              >
                <span className="relative z-10">Sign In</span>
                <span className="absolute inset-0 bg-goldBright opacity-0 group-hover:opacity-20 blur-md transition-opacity duration-300"></span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 sm:py-16 md:py-20 px-6 animate-slide-in-up">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-10 md:mb-16">
            <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-cloud mb-3 md:mb-4">
              Everything you need for professional meetings
            </h2>
            <p className="text-sm sm:text-base md:text-lg text-cloud/70 max-w-2xl mx-auto">
              Powerful features designed to make your video meetings seamless, secure, and productive.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-cloud/5 backdrop-blur-sm border border-cloud/10 rounded-xl md:rounded-2xl p-4 sm:p-5 md:p-6 hover:bg-cloud/10 transition-all duration-300 transform hover:scale-105 animate-fade-in-up"
                style={{ animationDelay: `${500 + index * 100}ms` }}
              >
                <div className="text-goldBright mb-3 md:mb-4">
                  <div className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8">
                    {feature.icon}
                  </div>
                </div>
                <h3 className="text-base sm:text-lg md:text-xl font-bold text-cloud mb-2">
                  {feature.title}
                </h3>
                <p className="text-xs sm:text-sm md:text-base text-cloud/70">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 sm:py-16 md:py-20 px-6 bg-gradient-to-r from-techBlue/10 via-violetDeep/10 to-techBlue/10 animate-slide-in-up">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-cloud mb-4 md:mb-6">
            Ready to get started?
          </h2>
          <p className="text-sm sm:text-base md:text-lg text-cloud/80 mb-6 md:mb-8 max-w-2xl mx-auto">
            Join thousands of professionals who trust Habs Meet for their video meetings. Start your free account today.
          </p>
          <button
            onClick={() => navigate('/auth?mode=signup')}
            className="px-6 sm:px-8 md:px-10 py-3 sm:py-3.5 md:py-4 bg-gradient-to-r from-goldBright to-goldBright/80 text-midnight font-bold rounded-full hover:from-goldBright/90 hover:to-goldBright/70 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-2xl hover:shadow-goldBright/50 text-sm sm:text-base md:text-lg relative overflow-hidden group"
          >
            <span className="relative z-10">Create Your Free Account</span>
            <span className="absolute inset-0 bg-goldBright opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300"></span>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-cloud/10">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <p className="text-cloud/60 text-sm">
                © {new Date().getFullYear()} Habs Technologies Group. All rights reserved.
              </p>
            </div>
            <div className="flex flex-wrap gap-4 md:gap-6 justify-center md:justify-end">
              <button
                onClick={() => navigate('/pricing')}
                className="text-cloud/60 hover:text-cloud text-sm transition-colors"
              >
                Pricing
              </button>
              <button
                onClick={() => navigate('/terms')}
                className="text-cloud/60 hover:text-cloud text-sm transition-colors"
              >
                Terms
              </button>
              <button
                onClick={() => navigate('/privacy')}
                className="text-cloud/60 hover:text-cloud text-sm transition-colors"
              >
                Privacy
              </button>
              <button
                onClick={() => navigate('/global-privacy-policy')}
                className="text-cloud/60 hover:text-cloud text-sm transition-colors"
              >
                Global Privacy Policy
              </button>
              <button
                onClick={() => navigate('/global-user-rights')}
                className="text-cloud/60 hover:text-cloud text-sm transition-colors"
              >
                Global User Rights
              </button>
              <button
                onClick={() => navigate('/cookie-policy')}
                className="text-cloud/60 hover:text-cloud text-sm transition-colors"
              >
                Cookie Policy
              </button>
              <button
                onClick={() => navigate('/data-processing-agreement')}
                className="text-cloud/60 hover:text-cloud text-sm transition-colors"
              >
                DPA
              </button>
              <button
                onClick={() => navigate('/international-compliance')}
                className="text-cloud/60 hover:text-cloud text-sm transition-colors"
              >
                International Compliance
              </button>
              <button
                onClick={() => navigate('/recording-consent-info')}
                className="text-cloud/60 hover:text-cloud text-sm transition-colors"
              >
                Recording Consent Info
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default WelcomePage;

