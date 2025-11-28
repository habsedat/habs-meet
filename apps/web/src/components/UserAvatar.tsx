import React from 'react';

interface UserAvatarProps {
  photoURL?: string | null;
  displayName?: string;
  email?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const UserAvatar: React.FC<UserAvatarProps> = ({
  photoURL,
  displayName,
  email,
  size = 'md',
  className = '',
}) => {
  // Get first letter of name or email
  const getInitials = () => {
    if (displayName) {
      const names = displayName.trim().split(' ');
      if (names.length > 1) {
        return (names[0][0] + names[names.length - 1][0]).toUpperCase();
      }
      return displayName[0].toUpperCase();
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return 'U';
  };

  // Size classes
  const sizeClasses = {
    sm: 'w-7 h-7 sm:w-8 sm:h-8 text-xs',
    md: 'w-8 h-8 sm:w-10 sm:h-10 text-sm',
    lg: 'w-12 h-12 sm:w-16 sm:h-16 text-lg',
  };

  const sizeClass = sizeClasses[size];

  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={displayName || email || 'User'}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0 ${className}`}
        style={{
          borderRadius: '50%',
          aspectRatio: '1 / 1',
        }}
        onError={(e) => {
          // Fallback to initials if image fails to load
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          const parent = target.parentElement;
          if (parent) {
            const fallback = document.createElement('div');
            fallback.className = `${sizeClass} rounded-full bg-techBlue text-cloud flex items-center justify-center font-semibold flex-shrink-0 ${className}`;
            fallback.style.borderRadius = '50%';
            fallback.textContent = getInitials();
            parent.appendChild(fallback);
          }
        }}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-techBlue text-cloud flex items-center justify-center font-semibold flex-shrink-0 ${className}`}
      style={{
        borderRadius: '50%',
        aspectRatio: '1 / 1',
      }}
    >
      {getInitials()}
    </div>
  );
};

export default UserAvatar;

