import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, getDoc, arrayUnion } from 'firebase/firestore';
import { db, storage } from '../lib/firebase';
import toast from '../lib/toast';
import EmojiPicker from 'emoji-picker-react';
import type { EmojiClickData } from 'emoji-picker-react';

interface PrivateMessage {
  id: string;
  senderId: string;
  receiverId: string;
  senderName: string;
  receiverName: string;
  text?: string;
  files?: Array<{
    url: string;
    type: 'image' | 'video' | 'pdf';
    name: string;
    size?: number;
  }>;
  createdAt: any;
  read: boolean;
  deletedBy?: string[]; // Array of user IDs who deleted this message
  roomId?: string;
  replyTo?: {
    messageId: string;
    senderName: string;
    text?: string;
    fileCount?: number;
  }; // Reference to the message being replied to
}

interface Participant {
  id: string;
  uid: string;
  displayName?: string;
  role?: string;
}

interface PrivateMessagesPanelProps {
  messages: PrivateMessage[];
  participants: Participant[];
  currentUserId: string;
  roomId: string;
  onSendMessage: (text: string, receiverId: string, files?: Array<{ url: string; type: 'image' | 'video' | 'pdf'; name: string }>, replyTo?: { messageId: string; senderName: string; text?: string; fileCount?: number }) => void;
  onMarkAsRead?: (messageId: string) => void;
}

const PrivateMessagesPanel: React.FC<PrivateMessagesPanelProps> = ({
  messages,
  participants,
  currentUserId,
  roomId,
  onSendMessage,
  onMarkAsRead,
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<string | null>(null);
  const [showRecipientSelector, setShowRecipientSelector] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<Array<{ name: string; progress: number }>>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [showChatView, setShowChatView] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<{ url: string; type: 'image' | 'video'; name: string } | null>(null);
  const [selectedMessageFiles, setSelectedMessageFiles] = useState<{ files: Array<{ url: string; type: 'image' | 'video' | 'pdf'; name: string }>; startIndex: number; message: PrivateMessage } | null>(null);
  const [replyingTo, setReplyingTo] = useState<PrivateMessage | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const MAX_LENGTH = 5000;
  const MAX_VIDEO_DURATION = 180; // 3 minutes in seconds
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB max file size

  // Detect if device is mobile/tablet
  const isMobileDevice = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTablet = typeof window !== 'undefined' &&
                     window.matchMedia('(max-width: 1024px)').matches &&
                     !window.matchMedia('(max-width: 768px)').matches;
    const isiPad = /iPad/.test(navigator.userAgent) ||
                   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return isMobile || isTablet || isiPad;
  }, []);

  // Detect screen size for responsive layout
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
      if (window.innerWidth < 1024 && !selectedRecipient) {
        setShowChatView(false);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [selectedRecipient]);

  // Handle recipient selection - on mobile, switch to chat view
  const handleSelectRecipient = (recipientId: string) => {
    setSelectedRecipient(recipientId);
    if (isMobile) {
      setShowChatView(true);
    }
  };

  // Handle back from chat to list (mobile only)
  const handleBackToList = () => {
    if (isMobile) {
      setShowChatView(false);
      setSelectedRecipient(null);
    }
  };

  // Get unique conversations with unread counts (WhatsApp-style)
  const conversations = useMemo(() => {
    const conversationMap = new Map<string, {
      participantId: string;
      participantName: string;
      lastMessage: PrivateMessage;
      unreadCount: number;
      hasUnread: boolean;
    }>();

    messages.forEach((message) => {
      const isSender = message.senderId === currentUserId;
      const otherParticipantId = isSender ? message.receiverId : message.senderId;
      const otherParticipantName = isSender ? message.receiverName : message.senderName;

      if (!conversationMap.has(otherParticipantId)) {
        conversationMap.set(otherParticipantId, {
          participantId: otherParticipantId,
          participantName: otherParticipantName,
          lastMessage: message,
          unreadCount: 0,
          hasUnread: false,
        });
      }
      
      const conv = conversationMap.get(otherParticipantId)!;
      
      // Update last message if this is newer
      const lastTime = conv.lastMessage.createdAt?.toDate?.() || new Date(0);
      const msgTime = message.createdAt?.toDate?.() || new Date(0);
      if (msgTime > lastTime) {
        conv.lastMessage = message;
      }
      
      // Count unread messages (messages sent TO current user that are unread)
      if (message.receiverId === currentUserId && !message.read) {
        conv.unreadCount++;
        conv.hasUnread = true;
      }
    });

    // Sort by last message time (most recent first), unread messages first
    return Array.from(conversationMap.values()).sort((a, b) => {
      // Unread conversations first
      if (a.hasUnread && !b.hasUnread) return -1;
      if (!a.hasUnread && b.hasUnread) return 1;
      
      // Then by last message time
      const timeA = a.lastMessage.createdAt?.toDate?.() || new Date(0);
      const timeB = b.lastMessage.createdAt?.toDate?.() || new Date(0);
      return timeB.getTime() - timeA.getTime();
    });
  }, [messages, currentUserId]);

  // Get messages for selected recipient
  const conversationMessages = useMemo(() => {
    if (!selectedRecipient) return [];
    
    return messages
      .filter(
        (m) =>
          ((m.senderId === currentUserId && m.receiverId === selectedRecipient) ||
           (m.senderId === selectedRecipient && m.receiverId === currentUserId)) &&
          !(m.deletedBy || []).includes(currentUserId) // Filter out messages deleted by current user
      )
      .sort((a, b) => {
        const timeA = a.createdAt?.toDate?.() || new Date(0);
        const timeB = b.createdAt?.toDate?.() || new Date(0);
        return timeA.getTime() - timeB.getTime();
      });
  }, [messages, selectedRecipient, currentUserId]);

  // Mark messages as read when conversation is opened
  useEffect(() => {
    if (selectedRecipient && onMarkAsRead) {
      conversationMessages.forEach((msg) => {
        if (!msg.read && msg.senderId === selectedRecipient && msg.receiverId === currentUserId) {
          onMarkAsRead(msg.id);
        }
      });
    }
  }, [selectedRecipient, conversationMessages, currentUserId, onMarkAsRead]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversationMessages]);

  // Auto-resize textarea
  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const minHeight = 40;
      const maxHeight = 150;
      const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
      textareaRef.current.style.height = `${newHeight}px`;
      
      if (scrollHeight > maxHeight) {
        textareaRef.current.style.overflowY = 'auto';
      } else {
        textareaRef.current.style.overflowY = 'hidden';
      }
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [newMessage]);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest('button[title="Emoji"]')
      ) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showEmojiPicker]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
    }
  }, []);

  // Check video duration
  const checkVideoDuration = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        const duration = video.duration;
        resolve(duration <= MAX_VIDEO_DURATION);
      };
      
      video.onerror = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(false);
      };
      
      video.src = URL.createObjectURL(file);
    });
  };

  // Handle multiple file uploads
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !selectedRecipient) return;

    // Validate files
    const validFiles: File[] = [];
    for (const file of files) {
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} exceeds 100MB limit`);
        continue;
      }

      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (!isImage && !isVideo && !isPDF) {
        toast.error(`${file.name} is not a supported file type (image, video, or PDF)`);
        continue;
      }

      // Check video duration
      if (isVideo) {
        try {
          const isValidDuration = await checkVideoDuration(file);
          if (!isValidDuration) {
            toast.error(`${file.name} must be 3 minutes or less`);
            continue;
          }
        } catch (error) {
          console.error('Error checking video duration:', error);
          toast.error(`Failed to validate ${file.name}`);
          continue;
        }
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    // Upload all files
    setUploading(true);
    const fileUploads = validFiles.map(file => ({ name: file.name, progress: 0 }));
    setUploadingFiles(fileUploads);

    try {
      const uploadPromises = validFiles.map(async (file, index) => {
        const timestamp = Date.now();
        const fileExtension = file.name.split('.').pop();
        const fileName = `${timestamp}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
        const storagePath = `rooms/${roomId}/privateMessages/${currentUserId}/${selectedRecipient}/${fileName}`;
        const storageRef = ref(storage, storagePath);

        const uploadTask = uploadBytesResumable(storageRef, file);

        return new Promise<{ url: string; type: 'image' | 'video' | 'pdf'; name: string }>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadingFiles(prev => {
                const updated = [...prev];
                updated[index] = { name: file.name, progress };
                return updated;
              });
            },
            (error) => {
              console.error('Upload error:', error);
              reject(error);
            },
            async () => {
              try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                const isImage = file.type.startsWith('image/');
                const isVideo = file.type.startsWith('video/');
                const mediaType = isImage ? 'image' : isVideo ? 'video' : 'pdf';
                resolve({ url: downloadURL, type: mediaType, name: file.name });
              } catch (error) {
                reject(error);
              }
            }
          );
        });
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      
      // Send message with all files
      const replyToData = replyingTo ? {
        messageId: replyingTo.id,
        senderName: replyingTo.senderName,
        text: replyingTo.text,
        fileCount: replyingTo.files?.length || 0,
      } : undefined;
      
      onSendMessage('', selectedRecipient, uploadedFiles, replyToData);
      
      setReplyingTo(null);
      toast.success(`${uploadedFiles.length} file${uploadedFiles.length > 1 ? 's' : ''} sent successfully`);
      setUploading(false);
      setUploadingFiles([]);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Failed to upload files: ' + error.message);
      setUploading(false);
      setUploadingFiles([]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((newMessage.trim() || uploading) && newMessage.length <= MAX_LENGTH && selectedRecipient) {
      if (!uploading) {
        const replyToData = replyingTo ? {
          messageId: replyingTo.id,
          senderName: replyingTo.senderName,
          text: replyingTo.text,
          fileCount: replyingTo.files?.length || 0,
        } : undefined;
        
        onSendMessage(newMessage, selectedRecipient, undefined, replyToData);
        setNewMessage('');
        setReplyingTo(null);
        if (textareaRef.current) {
          textareaRef.current.style.height = '40px';
        }
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (isMobileDevice) {
        return;
      } else {
        if (!e.shiftKey) {
          e.preventDefault();
          handleSubmit(e as any);
        }
      }
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Get participant name
  const getParticipantName = (participantId: string) => {
    const participant = participants.find(p => p.uid === participantId);
    return participant?.displayName || participantId;
  };

  // Get last message preview
  const getLastMessagePreview = (message: PrivateMessage) => {
    if (message.text) {
      return message.text.length > 30 ? message.text.substring(0, 30) + '...' : message.text;
    }
    if (message.files && message.files.length > 0) {
      const fileTypes = message.files.map(f => {
        if (f.type === 'image') return '📷';
        if (f.type === 'video') return '🎥';
        if (f.type === 'pdf') return '📄';
        return '📎';
      });
      return `${fileTypes.join(' ')} ${message.files.length} file${message.files.length > 1 ? 's' : ''}`;
    }
    return 'No message';
  };

  // Download file
  const handleDownload = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Delete message (only from user's own view)
  const handleDeleteMessage = async (message: PrivateMessage) => {
    if (!message.roomId) return;
    
    // Confirm deletion
    if (!window.confirm('Delete this message? It will only be removed from your inbox.')) {
      return;
    }
    
    try {
      const messageRef = doc(db, 'rooms', message.roomId, 'privateMessages', message.id);
      const messageDoc = await getDoc(messageRef);
      
      if (!messageDoc.exists()) {
        toast.error('Message not found');
        return;
      }
      
      const currentDeletedBy = messageDoc.data().deletedBy || [];
      if (currentDeletedBy.includes(currentUserId)) {
        // Already deleted by this user
        return;
      }
      
      // Add current user to deletedBy array using arrayUnion to avoid race conditions
      await updateDoc(messageRef, {
        deletedBy: arrayUnion(currentUserId)
      });
      
      toast.success('Message deleted');
    } catch (error: any) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message: ' + error.message);
    }
  };

  // Delete individual file from message
  const handleDeleteFile = async (message: PrivateMessage, fileIndex: number) => {
    if (!message.roomId) return;
    
    if (!message.files || fileIndex >= message.files.length) return;
    
    const fileToDelete = message.files[fileIndex];
    
    // Confirm deletion
    if (!window.confirm(`Delete ${fileToDelete.name}?`)) {
      return;
    }
    
    try {
      const messageRef = doc(db, 'rooms', message.roomId, 'privateMessages', message.id);
      const messageDoc = await getDoc(messageRef);
      
      if (!messageDoc.exists()) {
        toast.error('Message not found');
        return;
      }
      
      const currentFiles = messageDoc.data().files || [];
      const updatedFiles = currentFiles.filter((_: any, index: number) => index !== fileIndex);
      
      // If no files left and no text, delete the entire message
      if (updatedFiles.length === 0 && !message.text) {
        await handleDeleteMessage(message);
        return;
      }
      
      // Update files array
      await updateDoc(messageRef, {
        files: updatedFiles
      });
      
      toast.success('File deleted');
    } catch (error: any) {
      console.error('Error deleting file:', error);
      toast.error('Failed to delete file: ' + error.message);
    }
  };

  const availableParticipants = participants.filter(p => p.uid !== currentUserId);

  return (
    <div className="flex h-full min-h-0">
      {/* Conversations sidebar - WhatsApp style - Hidden on mobile when chat is open */}
      <div className={`${isMobile && showChatView ? 'hidden' : 'flex'} ${isMobile ? 'w-full' : 'w-64 sm:w-80'} border-r border-gray-300 bg-white flex-col flex-shrink-0`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-lg text-gray-800">Inbox</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowRecipientSelector(!showRecipientSelector)}
                className="p-2 text-gray-600 hover:text-techBlue hover:bg-gray-100 rounded-full transition-colors"
                title="New message"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
          {/* New message selector */}
          {showRecipientSelector && (
            <div className="relative mb-2">
              <select
                onChange={(e) => {
                  const recipientId = e.target.value;
                  if (recipientId) {
                    setSelectedRecipient(recipientId);
                    setShowRecipientSelector(false);
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-techBlue focus:border-transparent bg-white"
                defaultValue=""
              >
                <option value="">Select participant...</option>
                {availableParticipants.map((p) => (
                  <option key={p.uid} value={p.uid}>
                    {p.displayName || p.uid}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        
        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              <p>No conversations yet</p>
              <p className="text-xs mt-1">Start a conversation!</p>
            </div>
          ) : (
            conversations.map((conv) => {
              const isSelected = selectedRecipient === conv.participantId;
              const lastMessagePreview = getLastMessagePreview(conv.lastMessage);
              
              return (
                <button
                  key={conv.participantId}
                  onClick={() => handleSelectRecipient(conv.participantId)}
                  className={`w-full text-left p-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                    isSelected ? 'bg-techBlue/10 border-l-4 border-l-techBlue' : ''
                  } ${conv.hasUnread ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className={`font-semibold text-sm truncate ${
                          conv.hasUnread ? 'text-gray-900 font-bold' : 'text-gray-800'
                        }`}>
                          {conv.participantName}
                        </p>
                        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                          {formatTime(conv.lastMessage.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className={`text-xs truncate ${
                          conv.hasUnread ? 'text-gray-900 font-medium' : 'text-gray-600'
                        }`}>
                          {lastMessagePreview}
                        </p>
                        {conv.unreadCount > 0 && (
                          <span className="ml-2 bg-techBlue text-white text-xs font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center flex-shrink-0">
                            {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat area - Hidden on mobile when list is shown */}
      <div className={`${isMobile && !showChatView ? 'hidden' : 'flex'} flex-1 flex-col min-w-0`}>
        {/* Selected recipient header */}
        {selectedRecipient ? (
          <>
            <div className="p-3 bg-white border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center space-x-2">
                {/* Back button - visible on mobile */}
                {isMobile && (
                  <button
                    onClick={handleBackToList}
                    className="text-gray-600 hover:text-gray-800 p-1"
                    title="Back to conversations"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                )}
                <span className="text-sm text-gray-600">To:</span>
                <span className="text-sm font-medium text-gray-800">{getParticipantName(selectedRecipient)}</span>
              </div>
              {/* Desktop: Back button */}
              {!isMobile && (
                <button
                  onClick={() => setSelectedRecipient(null)}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  Back
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-br from-techBlue to-violetDeep/20 min-h-0">
              {conversationMessages.length === 0 ? (
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
                conversationMessages.map((message) => {
                  const isOwnMessage = message.senderId === currentUserId;
                  return (
                    <div
                      key={message.id}
                      ref={(el) => {
                        if (el) messageRefs.current.set(message.id, el);
                      }}
                      className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200 group relative`}
                    >
                      <div className={`max-w-xs sm:max-w-md lg:max-w-lg ${isOwnMessage ? 'order-2' : 'order-1'}`}>
                        {!isOwnMessage && (
                          <p className="text-xs font-medium text-gray-700 mb-1 px-2">
                            {message.senderName || 'Unknown User'}
                          </p>
                        )}
                        <div
                          className={`rounded-lg px-3 py-2 relative ${
                            isOwnMessage 
                              ? 'bg-techBlue text-white' 
                              : 'bg-white text-gray-800 border border-gray-200 shadow-sm'
                          } ${!message.read && !isOwnMessage ? 'border-l-4 border-l-techBlue' : ''}`}
                        >
                          {/* Action buttons - visible on hover (desktop) */}
                          <div className="absolute -top-2 -right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            {/* Reply button */}
                            <button
                              onClick={() => setReplyingTo(message)}
                              className="bg-gray-700 hover:bg-gray-600 text-white rounded-full p-1.5 shadow-lg"
                              title="Reply to message"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                              </svg>
                            </button>
                            {/* Delete message button */}
                            <button
                              onClick={() => handleDeleteMessage(message)}
                              className="bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg"
                              title="Delete message"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                          
                          {/* Reply preview - Clickable thumbnail */}
                          {message.replyTo && (() => {
                            const originalMessage = conversationMessages.find(m => m.id === message.replyTo?.messageId);
                            return (
                              <div 
                                className={`mb-2 p-2 rounded border-l-2 cursor-pointer hover:opacity-80 transition-opacity ${isOwnMessage ? 'border-white/30 bg-white/10' : 'border-gray-600 bg-gray-700/50'}`}
                                onClick={() => {
                                  if (originalMessage) {
                                    const messageElement = messageRefs.current.get(originalMessage.id);
                                    if (messageElement) {
                                      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                      // Highlight briefly
                                      messageElement.classList.add('ring-2', 'ring-techBlue', 'ring-opacity-50');
                                      setTimeout(() => {
                                        messageElement.classList.remove('ring-2', 'ring-techBlue', 'ring-opacity-50');
                                      }, 2000);
                                    }
                                  }
                                }}
                              >
                                <div className="flex items-start space-x-2">
                                  {/* Thumbnail/Icon */}
                                  <div className="flex-shrink-0">
                                    {originalMessage?.files && originalMessage.files.length > 0 ? (
                                      originalMessage.files[0].type === 'image' ? (
                                        <img 
                                          src={originalMessage.files[0].url} 
                                          alt="Preview" 
                                          className="w-10 h-10 rounded object-cover"
                                        />
                                      ) : originalMessage.files[0].type === 'video' ? (
                                        <div className="w-10 h-10 rounded bg-gray-600 relative overflow-hidden">
                                          <video 
                                            src={originalMessage.files[0].url} 
                                            className="w-full h-full object-cover"
                                          />
                                          <div className="absolute inset-0 flex items-center justify-center">
                                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                              <path d="M8 5v14l11-7z" />
                                            </svg>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="w-10 h-10 rounded bg-gray-600 flex items-center justify-center">
                                          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                          </svg>
                                        </div>
                                      )
                                    ) : (
                                      <div className="w-10 h-10 rounded bg-gray-600 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                        </svg>
                                      </div>
                                    )}
                                  </div>
                                  {/* Content */}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold opacity-80 mb-1">{message.replyTo.senderName}</p>
                                    {message.replyTo.text && (
                                      <p className="text-xs opacity-70 line-clamp-2">{message.replyTo.text}</p>
                                    )}
                                    {message.replyTo.fileCount && message.replyTo.fileCount > 0 && (
                                      <p className="text-xs opacity-70 mt-1">📎 {message.replyTo.fileCount} file{message.replyTo.fileCount > 1 ? 's' : ''}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                          {/* Files */}
                          {message.files && message.files.length > 0 && (
                            <div className="mb-2">
                              {/* Single file - display large */}
                              {message.files.length === 1 && (
                                <div>
                                  {message.files[0].type === 'image' && (
                                    <div className="relative group/file">
                                      <img
                                        src={message.files[0].url}
                                        alt={message.files[0].name}
                                        className="max-w-full h-auto rounded-lg cursor-pointer"
                                        onClick={() => setSelectedMedia({ url: message.files![0].url, type: 'image', name: message.files![0].name })}
                                      />
                                      {/* Delete file button - only show if multiple files */}
                                      {message.files.length > 1 && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteFile(message, 0);
                                          }}
                                          className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 opacity-0 group-hover/file:opacity-100 transition-opacity shadow-lg z-10"
                                          title="Delete this file"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  {message.files[0].type === 'video' && (
                                    <div className="relative group/file">
                                      <video
                                        src={message.files[0].url}
                                        className="max-w-full h-auto rounded-lg cursor-pointer"
                                        style={{ maxHeight: '400px' }}
                                        onClick={() => setSelectedMedia({ url: message.files![0].url, type: 'video', name: message.files![0].name })}
                                      />
                                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="bg-black/50 rounded-full p-3">
                                          <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                          </svg>
                                        </div>
                                      </div>
                                      {/* Delete file button - only show if multiple files */}
                                      {message.files.length > 1 && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteFile(message, 0);
                                          }}
                                          className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 opacity-0 group-hover/file:opacity-100 transition-opacity shadow-lg z-10"
                                          title="Delete this file"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  {message.files[0].type === 'pdf' && (
                                    <div className="border border-gray-300 rounded-lg p-3 bg-gray-50">
                                      <div className="flex items-center space-x-2 mb-2">
                                        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                        </svg>
                                        <div className="flex-1">
                                          <p className="text-sm font-medium text-gray-800 truncate">{message.files[0].name}</p>
                                          <p className="text-xs text-gray-500">PDF Document</p>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => handleDownload(message.files![0].url, message.files![0].name)}
                                        className="w-full px-3 py-1 bg-techBlue text-white text-xs rounded hover:bg-techBlue/90"
                                      >
                                        Download PDF
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              {/* Multiple files - gallery grid */}
                              {message.files.length > 1 && (
                                <div className="grid grid-cols-2 gap-1 rounded-lg overflow-hidden max-w-[280px]">
                                  {message.files.slice(0, 4).map((file, index) => {
                                    const filesLength = message.files?.length || 0;
                                    return (
                                      <div
                                        key={index}
                                        className={`relative group/file ${index === 0 && filesLength > 4 ? 'col-span-2' : ''} cursor-pointer`}
                                        onClick={() => {
                                          if (file.type === 'image' || file.type === 'video') {
                                            setSelectedMedia({ url: file.url, type: file.type, name: file.name });
                                          }
                                        }}
                                      >
                                        {/* Delete file button */}
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteFile(message, index);
                                          }}
                                          className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover/file:opacity-100 transition-opacity shadow-lg z-20"
                                          title="Delete this file"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                        {file.type === 'image' && (
                                          <>
                                            <img
                                              src={file.url}
                                              alt={file.name}
                                              className="w-full h-full object-cover"
                                              style={{ aspectRatio: '1/1', minHeight: '100px', maxHeight: '100px' }}
                                            />
                                            {index === 3 && filesLength > 4 && (
                                              <div 
                                                className="absolute inset-0 bg-black/60 flex items-center justify-center cursor-pointer hover:bg-black/70 transition-colors z-10"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setSelectedMessageFiles({ files: message.files!, startIndex: 0, message });
                                                }}
                                              >
                                                <span className="text-white text-lg font-semibold">+{filesLength - 4}</span>
                                              </div>
                                            )}
                                          </>
                                        )}
                                        {file.type === 'video' && (
                                          <>
                                            <video
                                              src={file.url}
                                              className="w-full h-full object-cover"
                                              style={{ aspectRatio: '1/1', minHeight: '100px', maxHeight: '100px' }}
                                            />
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                              <div className="bg-black/50 rounded-full p-2">
                                                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                  <path d="M8 5v14l11-7z" />
                                                </svg>
                                              </div>
                                            </div>
                                            {index === 3 && filesLength > 4 && (
                                              <div 
                                                className="absolute inset-0 bg-black/60 flex items-center justify-center cursor-pointer hover:bg-black/70 transition-colors z-10"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setSelectedMessageFiles({ files: message.files!, startIndex: 0, message });
                                                }}
                                              >
                                                <span className="text-white text-lg font-semibold">+{filesLength - 4}</span>
                                              </div>
                                            )}
                                          </>
                                        )}
                                        {file.type === 'pdf' && (
                                          <div className="w-full h-full bg-gray-700 flex items-center justify-center p-2" style={{ aspectRatio: '1/1', minHeight: '100px', maxHeight: '100px' }}>
                                            <div className="text-center">
                                              <svg className="w-8 h-8 text-red-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                              </svg>
                                              <p className="text-xs text-white truncate px-1">{file.name}</p>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                          {/* Text */}
                          {message.text && (
                            <p className="text-base whitespace-pre-wrap break-words">{message.text}</p>
                          )}
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

            {/* Message input */}
            <div className="border-t border-gray-300 bg-white flex-shrink-0">
              {uploading && uploadingFiles.length > 0 && (
                <div className="px-4 py-2 bg-blue-50 border-b border-blue-200">
                  <div className="space-y-1">
                    {uploadingFiles.map((file, index) => (
                      <div key={index}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-600 truncate">{file.name}</span>
                          <span className="text-xs text-gray-600">{Math.round(file.progress)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-techBlue h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Reply preview with thumbnail */}
              {replyingTo && (
                <div className="px-4 pt-2 pb-0">
                  <div className="p-2 bg-gray-100 rounded-lg border-l-2 border-techBlue flex items-start justify-between">
                    <div className="flex items-start space-x-2 flex-1 min-w-0">
                      {/* Thumbnail/Icon */}
                      <div className="flex-shrink-0">
                        {replyingTo.files && replyingTo.files.length > 0 ? (
                          replyingTo.files[0].type === 'image' ? (
                            <img 
                              src={replyingTo.files[0].url} 
                              alt="Preview" 
                              className="w-12 h-12 rounded object-cover"
                            />
                          ) : replyingTo.files[0].type === 'video' ? (
                            <div className="w-12 h-12 rounded bg-gray-200 relative overflow-hidden">
                              <video 
                                src={replyingTo.files[0].url} 
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded bg-gray-200 flex items-center justify-center">
                              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )
                        ) : (
                          <div className="w-12 h-12 rounded bg-gray-200 flex items-center justify-center">
                            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-techBlue mb-1">Replying to {replyingTo.senderName}</p>
                        {replyingTo.text && (
                          <p className="text-xs text-gray-600 line-clamp-1">{replyingTo.text}</p>
                        )}
                        {replyingTo.files && replyingTo.files.length > 0 && (
                          <p className="text-xs text-gray-500 mt-1">📎 {replyingTo.files.length} file{replyingTo.files.length > 1 ? 's' : ''}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setReplyingTo(null)}
                      className="text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
              <form onSubmit={handleSubmit} className="p-4 relative">
                {/* Emoji Picker */}
                {showEmojiPicker && (
                  <div 
                    ref={emojiPickerRef}
                    className="absolute bottom-full right-4 mb-2 z-50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <EmojiPicker
                      onEmojiClick={(emojiData: EmojiClickData) => {
                        const cursorPosition = textareaRef.current?.selectionStart || newMessage.length;
                        const textBefore = newMessage.substring(0, cursorPosition);
                        const textAfter = newMessage.substring(cursorPosition);
                        const newText = textBefore + emojiData.emoji + textAfter;
                        
                        if (newText.length <= MAX_LENGTH) {
                          setNewMessage(newText);
                          // Set cursor position after inserted emoji
                          setTimeout(() => {
                            if (textareaRef.current) {
                              const newPosition = cursorPosition + emojiData.emoji.length;
                              textareaRef.current.setSelectionRange(newPosition, newPosition);
                              textareaRef.current.focus();
                            }
                          }, 0);
                        }
                      }}
                      width={350}
                      height={400}
                      previewConfig={{ showPreview: false }}
                      skinTonesDisabled={false}
                      searchDisabled={false}
                    />
                  </div>
                )}
                <div className="flex space-x-2 items-end">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,.pdf"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="p-2 text-gray-600 hover:text-techBlue hover:bg-gray-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Emoji"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="p-2 text-gray-600 hover:text-techBlue hover:bg-gray-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Attach files (images, videos, PDFs)"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </button>
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
                      onClick={() => setShowEmojiPicker(false)}
                      placeholder={isMobileDevice 
                        ? "Type a private message... (Press Enter for new line, click Send to send)" 
                        : "Type a private message... (Press Enter to send, Shift+Enter for new line)"}
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
                      disabled={uploading}
                    />
                    <div className="text-xs text-gray-500 mt-1 text-right">
                      {newMessage.length} / {MAX_LENGTH}
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={(!newMessage.trim() && !uploading) || newMessage.length > MAX_LENGTH || uploading}
                    className="btn btn-primary px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed self-end mb-1 h-fit"
                  >
                    Send
                  </button>
                </div>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-techBlue to-violetDeep/20">
            <div className="text-center text-gray-500">
              <svg
                className="w-16 h-16 mx-auto mb-4 text-gray-400"
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
              <p className="font-medium text-lg">Select a conversation</p>
              <p className="text-sm mt-1">Choose a conversation from the sidebar to start messaging</p>
            </div>
          </div>
        )}
      </div>

      {/* All Files Gallery Modal */}
      {selectedMessageFiles && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex flex-col"
          onClick={() => setSelectedMessageFiles(null)}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h3 className="text-white font-semibold">
              {selectedMessageFiles.files.length} {selectedMessageFiles.files.length === 1 ? 'file' : 'files'}
            </h3>
            <button
              onClick={() => setSelectedMessageFiles(null)}
              className="text-white hover:text-gray-300 p-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Gallery Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-w-6xl mx-auto">
              {selectedMessageFiles.files.map((file, index) => (
                <div
                  key={index}
                  className="relative cursor-pointer group"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (file.type === 'image' || file.type === 'video') {
                      setSelectedMessageFiles(null);
                      setSelectedMedia({ url: file.url, type: file.type, name: file.name });
                    } else if (file.type === 'pdf') {
                      handleDownload(file.url, file.name);
                    }
                  }}
                >
                  {/* Delete file button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFile(selectedMessageFiles.message, index);
                      // Update the files list
                      const updatedFiles = selectedMessageFiles.files.filter((_, i) => i !== index);
                      if (updatedFiles.length === 0) {
                        setSelectedMessageFiles(null);
                      } else {
                        setSelectedMessageFiles({ ...selectedMessageFiles, files: updatedFiles });
                      }
                    }}
                    className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-20"
                    title="Delete this file"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  {file.type === 'image' && (
                    <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-800">
                      <img
                        src={file.url}
                        alt={file.name}
                        className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                      </div>
                    </div>
                  )}
                  {file.type === 'video' && (
                    <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-800">
                      <video
                        src={file.url}
                        className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="bg-black/50 rounded-full p-3">
                          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                    </div>
                  )}
                  {file.type === 'pdf' && (
                    <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center group-hover:bg-gray-700 transition-colors">
                      <div className="text-center p-4">
                        <svg className="w-12 h-12 text-red-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <p className="text-xs text-white truncate px-2">{file.name}</p>
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 right-2 bg-black/70 rounded px-2 py-1">
                    <p className="text-xs text-white truncate">{file.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Media Modal - WhatsApp Style */}
      {selectedMedia && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
          onClick={() => setSelectedMedia(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full mx-4">
            <button
              onClick={() => setSelectedMedia(null)}
              className="absolute top-4 right-4 text-white hover:text-gray-300 z-10 bg-black/50 rounded-full p-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {selectedMedia.type === 'image' && (
              <div className="relative">
                <img
                  src={selectedMedia.url}
                  alt={selectedMedia.name}
                  className="max-w-full max-h-[90vh] mx-auto object-contain rounded-lg"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
            
            {selectedMedia.type === 'video' && (
              <div className="relative">
                <video
                  src={selectedMedia.url}
                  controls
                  autoPlay
                  className="max-w-full max-h-[90vh] mx-auto rounded-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  Your browser does not support the video tag.
                </video>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PrivateMessagesPanel;
