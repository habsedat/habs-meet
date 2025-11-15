import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface ChatMessage {
  id: string;
  uid: string;
  displayName: string;
  text: string;
  createdAt: any;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ messages, onSendMessage }) => {
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuth();

  const MAX_LENGTH = 5000;

  // Detect if device is mobile/tablet (phone/tablet don't have physical keyboard)
  const isMobileDevice = React.useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTablet = typeof window !== 'undefined' &&
                     window.matchMedia('(max-width: 1024px)').matches &&
                     !window.matchMedia('(max-width: 768px)').matches;
    const isiPad = /iPad/.test(navigator.userAgent) ||
                   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return isMobile || isTablet || isiPad;
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea - WhatsApp-like behavior
  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      // Temporarily remove height constraint to get accurate scrollHeight
      textareaRef.current.style.height = 'auto';
      
      // Get the natural height needed for content
      const scrollHeight = textareaRef.current.scrollHeight;
      
      // Calculate the new height based on scrollHeight
      // Minimum height: ~40px (1 line), Maximum height: ~150px (about 5-6 lines)
      const minHeight = 40;
      const maxHeight = 150;
      const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
      
      // Apply the new height
      textareaRef.current.style.height = `${newHeight}px`;
      
      // If content exceeds max height, enable scrolling
      if (scrollHeight > maxHeight) {
        textareaRef.current.style.overflowY = 'auto';
      } else {
        textareaRef.current.style.overflowY = 'hidden';
      }
    }
  };

  // Adjust height when message changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [newMessage]);

  // Set initial height on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && newMessage.length <= MAX_LENGTH) {
      onSendMessage(newMessage);
      setNewMessage('');
      // Reset textarea height to initial single line
      if (textareaRef.current) {
        textareaRef.current.style.height = '40px';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (isMobileDevice) {
        // On mobile/tablet: Enter always creates new line (don't prevent default)
        // User must click Send button to send message
        return; // Allow default behavior (new line)
      } else {
        // On desktop/laptop: Enter sends, Shift+Enter creates new line
        if (!e.shiftKey) {
          e.preventDefault();
          handleSubmit(e as any);
        }
        // If Shift+Enter, allow default (new line)
      }
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages - flex-1 allows it to shrink when input expands */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-br from-techBlue to-violetDeep/20 min-h-0">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <svg
              className="w-12 h-12 mx-auto mb-2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p className="font-medium">No messages yet</p>
            <p className="text-sm text-gray-400">Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => {
            const isOwnMessage = message.uid === user?.uid;
            return (
              <div
                key={message.id}
                className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}
              >
                <div className={`max-w-xs sm:max-w-md ${isOwnMessage ? 'order-2' : 'order-1'}`}>
                  {!isOwnMessage && (
                    <p className="text-xs font-medium text-gray-700 mb-1 px-2">
                      {message.displayName || 'Unknown User'}
                    </p>
                  )}
                  <div
                    className={`rounded-lg px-3 py-2 ${
                      isOwnMessage 
                        ? 'bg-techBlue text-white' 
                        : 'bg-white text-gray-800 border border-gray-200 shadow-sm'
                    }`}
                  >
                    <p className="text-base whitespace-pre-wrap break-words">{message.text}</p>
                  </div>
                  <p className={`text-xs text-gray-500 mt-1 px-2 ${
                    isOwnMessage ? 'text-right' : 'text-left'
                  }`}>
                    {formatTime(message.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input - positioned at bottom, can expand upward */}
      <div className="border-t border-gray-300 bg-white flex-shrink-0">
        <form onSubmit={handleSubmit} className="p-4">
          <div className="flex space-x-2 items-end">
            <div className="flex-1 flex flex-col">
              <textarea
                ref={textareaRef}
                value={newMessage}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.length <= MAX_LENGTH) {
                    setNewMessage(value);
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder={isMobileDevice 
                  ? "Type a message... (Press Enter for new line, click Send to send)" 
                  : "Type a message... (Press Enter to send, Shift+Enter for new line)"}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-techBlue focus:border-transparent text-sm resize-none overflow-y-auto"
                style={{ 
                  minHeight: '40px',
                  maxHeight: '150px',
                  height: '40px',
                  lineHeight: '1.5',
                  boxSizing: 'border-box'
                }}
                rows={1}
                maxLength={MAX_LENGTH}
              />
              {/* Character counter */}
              <div className="text-xs text-gray-500 mt-1 text-right">
                {newMessage.length} / {MAX_LENGTH}
              </div>
            </div>
            <button
              type="submit"
              disabled={!newMessage.trim() || newMessage.length > MAX_LENGTH}
              className="btn btn-primary px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed self-end mb-1 h-fit"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatPanel;
