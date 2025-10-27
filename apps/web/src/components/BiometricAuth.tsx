import React, { useState, useEffect } from 'react';

interface BiometricAuthProps {
  onSuccess: () => void;
  onError: (error: string) => void;
}

const BiometricAuth: React.FC<BiometricAuthProps> = ({ onSuccess, onError }) => {
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [availableMethods, setAvailableMethods] = useState<string[]>([]);

  useEffect(() => {
    checkBiometricSupport();
  }, []);

  const checkBiometricSupport = async () => {
    try {
      // Check for WebAuthn support
      if (window.PublicKeyCredential) {
        setIsSupported(true);
        
        // Check available authenticators
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (available) {
          setAvailableMethods(prev => [...prev, 'platform']);
        }
        
        // Check for external authenticators (simplified check)
        try {
          const external = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          if (external) {
            setAvailableMethods(prev => [...prev, 'external']);
          }
        } catch (error) {
          // External authenticator check failed, continue without it
        }
      }
    } catch (error) {
      console.log('Biometric authentication not supported:', error);
      setIsSupported(false);
    }
  };

  const handleFaceID = async () => {
    if (!isSupported) {
      onError('Face ID is not supported on this device');
      return;
    }

    setIsLoading(true);
    try {
      // Create credential for Face ID authentication
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: new Uint8Array(32),
          rp: {
            name: 'Habs Meet',
            id: window.location.hostname,
          },
          user: {
            id: new TextEncoder().encode('user-id'),
            name: 'user@example.com',
            displayName: 'User',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 }, // ES256
            { type: 'public-key', alg: -257 }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
          },
          timeout: 60000,
          attestation: 'direct',
        },
      });

      if (credential) {
        onSuccess();
      }
    } catch (error: any) {
      onError(error.message || 'Face ID authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFingerprint = async () => {
    if (!isSupported) {
      onError('Fingerprint authentication is not supported on this device');
      return;
    }

    setIsLoading(true);
    try {
      // Create credential for fingerprint authentication
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: new Uint8Array(32),
          rp: {
            name: 'Habs Meet',
            id: window.location.hostname,
          },
          user: {
            id: new TextEncoder().encode('user-id'),
            name: 'user@example.com',
            displayName: 'User',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 }, // ES256
            { type: 'public-key', alg: -257 }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'cross-platform',
            userVerification: 'required',
          },
          timeout: 60000,
          attestation: 'direct',
        },
      });

      if (credential) {
        onSuccess();
      }
    } catch (error: any) {
      onError(error.message || 'Fingerprint authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSupported) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-gray-500">
          Biometric authentication is not supported on this device
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-gray-600 mb-4">
        Choose your preferred biometric authentication method
      </p>
      
      <div className="flex justify-center space-x-4">
        <button
          type="button"
          onClick={handleFaceID}
          disabled={isLoading}
          className="flex items-center space-x-2 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-techBlue"></div>
          ) : (
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
            </svg>
          )}
          <span className="text-sm font-medium">Face ID</span>
        </button>
        
        <button
          type="button"
          onClick={handleFingerprint}
          disabled={isLoading}
          className="flex items-center space-x-2 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-techBlue"></div>
          ) : (
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          )}
          <span className="text-sm font-medium">Fingerprint</span>
        </button>
      </div>
      
      <div className="text-center">
        <p className="text-xs text-gray-500">
          Available methods: {availableMethods.join(', ') || 'None detected'}
        </p>
      </div>
    </div>
  );
};

export default BiometricAuth;
