import React, { useState, forwardRef, useEffect, useRef } from 'react';

interface PasswordInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  minLength?: number;
  style?: React.CSSProperties;
}

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ value, onChange, placeholder, className, required, minLength, style }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Force styling on every render and when showPassword changes
    useEffect(() => {
      const input = inputRef.current;
      if (input) {
        // Force black text styling
        input.style.setProperty('color', '#000000', 'important');
        input.style.setProperty('background-color', '#FFFFFF', 'important');
        input.style.setProperty('-webkit-text-fill-color', '#000000', 'important');
        input.style.setProperty('caret-color', '#000000', 'important');
        input.style.setProperty('text-fill-color', '#000000', 'important');
      }
    }, [showPassword, value]);

    return (
      <div className="relative">
        <input
          ref={(node) => {
            if (inputRef.current !== node) {
              (inputRef as any).current = node;
            }
            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              (ref as any).current = node;
            }
          }}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={className}
          required={required}
          minLength={minLength}
          style={{
            color: '#000000',
            backgroundColor: '#FFFFFF',
            WebkitTextFillColor: '#000000',
            caretColor: '#000000',
            ...style
          } as React.CSSProperties}
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
    );
  }
);

PasswordInput.displayName = 'PasswordInput';

export default PasswordInput;
