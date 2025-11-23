import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, getDocs, getDoc, arrayUnion, query, where } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import toast from '../lib/toast';
import Header from '../components/Header';
import EmojiPicker from 'emoji-picker-react';
import type { EmojiClickData } from 'emoji-picker-react';

interface PrivateMessage {
  id: string;
  roomId: string;
  senderId: string;
  receiverId: string;
  senderName: string;
  receiverName: string;
  text?: string;
  files?: Array<{
    url: string;
    type: 'image' | 'video' | 'pdf';
    name: string;
  }>;
  createdAt: any;
  read: boolean;
  deletedBy?: string[]; // Array of user IDs who deleted this message
  replyTo?: {
    messageId: string;
    senderName: string;
    text?: string;
    fileCount?: number;
  }; // Reference to the message being replied to
}

interface Conversation {
  participantId: string;
  participantName: string;
  participantPhotoURL?: string;
  lastMessage: PrivateMessage;
  unreadCount: number;
  hasUnread: boolean;
}

const InboxPage: React.FC = () => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<Array<{ name: string; progress: number }>>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [showChatView, setShowChatView] = useState(false);
  const [participantProfiles, setParticipantProfiles] = useState<Map<string, { displayName: string; photoURL?: string }>>(new Map());
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
  const MAX_VIDEO_DURATION = 180;
  const MAX_FILE_SIZE = 100 * 1024 * 1024;

  // Detect mobile/tablet devices
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = window.innerWidth < 1024;
      setIsMobile(isMobileDevice);
      if (isMobileDevice && !selectedConversation) {
        setShowChatView(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [selectedConversation]);

  // Load participant profiles
  useEffect(() => {
    if (!user || messages.length === 0) return;

    const loadProfiles = async () => {
      const profileMap = new Map<string, { displayName: string; photoURL?: string }>();
      const participantIds = new Set<string>();

      messages.forEach(msg => {
        if (msg.senderId !== user.uid) participantIds.add(msg.senderId);
        if (msg.receiverId !== user.uid) participantIds.add(msg.receiverId);
      });

      for (const pid of participantIds) {
        if (!profileMap.has(pid)) {
          try {
            const profileDoc = await getDoc(doc(db, 'users', pid));
            if (profileDoc.exists()) {
              const data = profileDoc.data();
              profileMap.set(pid, {
                displayName: data.displayName || pid,
                photoURL: data.photoURL
              });
            } else {
              profileMap.set(pid, { displayName: pid });
            }
          } catch (error) {
            profileMap.set(pid, { displayName: pid });
          }
        }
      }

      setParticipantProfiles(profileMap);
    };

    loadProfiles();
  }, [messages, user]);

  // Handle conversation selection
  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    if (isMobile) {
      setShowChatView(true);
    }
  };

  // Handle back from chat to list
  const handleBackToList = () => {
    if (isMobile) {
      setShowChatView(false);
      setSelectedConversation(null);
    }
  };

  // ✅ CRITICAL FIX: Load all private messages from all rooms where user has messages
  // This includes messages from ended rooms or rooms where user is no longer a participant
  useEffect(() => {
    if (!user) return;

    const loadMessages = async () => {
      try {
        const roomsSnapshot = await getDocs(collection(db, 'rooms'));
        const unsubscribes: Array<() => void> = [];
        const roomIdsWithMessages = new Set<string>();
        
        // ✅ First, find all rooms where user has messages (by checking privateMessages collections)
        // This ensures we load messages even from ended rooms or where user is no longer a participant
        for (const roomDoc of roomsSnapshot.docs) {
          const roomId = roomDoc.id;
          
          try {
            // Try to query for messages where user is sender or receiver
            // Use a limit query to check if any messages exist
            const messagesRef = collection(db, 'rooms', roomId, 'privateMessages');
            
            // ✅ CRITICAL FIX: Use WHERE queries instead of fetching all and filtering
            // Firestore security rules can't evaluate resource.data in collection queries
            // So we query for messages where user is sender OR receiver using separate queries
            
            // Query 1: Messages where user is the sender
            const sentMessagesQuery = query(
              messagesRef,
              where('senderId', '==', user.uid)
            );
            
            // Query 2: Messages where user is the receiver
            const receivedMessagesQuery = query(
              messagesRef,
              where('receiverId', '==', user.uid)
            );
            
            const allRoomMessages = new Map<string, PrivateMessage>();
            
            const updateRoomMessages = () => {
              const roomMessages = Array.from(allRoomMessages.values())
                .filter((msg) => {
                  // Skip self-messages
                  return msg.senderId !== msg.receiverId;
                });
              
              if (roomMessages.length > 0) {
                roomIdsWithMessages.add(roomId);
              }
              
              setMessages(prev => {
                const filtered = prev.filter(m => m.roomId !== roomId);
                return [...filtered, ...roomMessages];
              });
            };
            
            // Subscribe to sent messages
            const sentUnsubscribe = onSnapshot(
              sentMessagesQuery,
              (snapshot) => {
                snapshot.docs.forEach(doc => {
                  allRoomMessages.set(doc.id, {
                    id: doc.id,
                    roomId,
                    ...doc.data()
                  } as PrivateMessage);
                });
                updateRoomMessages();
              },
              (error) => {
                // Silently handle permission errors - user might not have access to this room
                if (error.code !== 'permission-denied') {
                  console.error(`Error loading sent messages for room ${roomId}:`, error);
                }
              }
            );
            
            // Subscribe to received messages
            const receivedUnsubscribe = onSnapshot(
              receivedMessagesQuery,
              (snapshot) => {
                snapshot.docs.forEach(doc => {
                  allRoomMessages.set(doc.id, {
                    id: doc.id,
                    roomId,
                    ...doc.data()
                  } as PrivateMessage);
                });
                updateRoomMessages();
              },
              (error) => {
                // Silently handle permission errors - user might not have access to this room
                if (error.code !== 'permission-denied') {
                  console.error(`Error loading received messages for room ${roomId}:`, error);
                }
              }
            );
            
            // Store both unsubscribe functions
            unsubscribes.push(() => {
              sentUnsubscribe();
              receivedUnsubscribe();
            });
          } catch (error) {
            // If we can't access messages, skip this room silently
            console.warn(`Could not access messages for room ${roomId}:`, error);
            continue;
          }
        }
        
        return () => {
          unsubscribes.forEach(unsub => unsub());
        };
      } catch (error: any) {
        console.error('Error loading messages:', error);
        toast.error('Failed to load messages: ' + error.message);
      }
    };

    const cleanup = loadMessages();
    return () => {
      cleanup.then(cleanupFn => cleanupFn && cleanupFn());
    };
  }, [user]);

  // ✅ CRITICAL FIX: Get conversations grouped by participant ONLY (like WhatsApp - one conversation per contact)
  // All messages with the same contact are grouped together, regardless of which room they're from
  const conversations = useMemo(() => {
    const conversationMap = new Map<string, Conversation>();

    messages.forEach((message) => {
      // Skip self-messages
      if (message.senderId === message.receiverId) {
        return;
      }
      
      const isSender = message.senderId === user?.uid;
      const otherParticipantId = isSender ? message.receiverId : message.senderId;
      const otherParticipantName = isSender ? message.receiverName : message.senderName;
      const profile = participantProfiles.get(otherParticipantId);
      
      // ✅ CRITICAL FIX: Use ONLY participantId as key (not roomId) to group all messages with same contact
      // This creates one conversation per contact, like WhatsApp
      const key = otherParticipantId;

      if (!conversationMap.has(key)) {
        conversationMap.set(key, {
          participantId: otherParticipantId,
          participantName: profile?.displayName || otherParticipantName,
          participantPhotoURL: profile?.photoURL,
          lastMessage: message,
          unreadCount: 0,
          hasUnread: false,
        });
      }
      
      const conv = conversationMap.get(key)!;
      
      // Update last message if this one is more recent
      const lastTime = conv.lastMessage.createdAt?.toDate?.() || new Date(0);
      const msgTime = message.createdAt?.toDate?.() || new Date(0);
      if (msgTime > lastTime) {
        conv.lastMessage = message;
      }
      
      // ✅ Count unread messages (only for messages received by user, not sent)
      if (message.receiverId === user?.uid && !message.read) {
        conv.unreadCount++;
        conv.hasUnread = true;
      }
    });

    return Array.from(conversationMap.values()).sort((a, b) => {
      if (a.hasUnread && !b.hasUnread) return -1;
      if (!a.hasUnread && b.hasUnread) return 1;
      const timeA = a.lastMessage.createdAt?.toDate?.() || new Date(0);
      const timeB = b.lastMessage.createdAt?.toDate?.() || new Date(0);
      return timeB.getTime() - timeA.getTime();
    });
  }, [messages, user, participantProfiles]);

  // ✅ CRITICAL FIX: Get ALL messages with selected contact from ALL rooms (like WhatsApp)
  const conversationMessages = useMemo(() => {
    if (!selectedConversation || !user) return [];
    
    return messages
      .filter(
        (m) => {
          // Skip self-messages
          if (m.senderId === m.receiverId) {
            return false;
          }
          
          // Include all messages where user is sender and contact is receiver, OR contact is sender and user is receiver
          // This includes messages from ALL rooms, not just one room
          const isNormalMessage = 
            (m.senderId === user.uid && m.receiverId === selectedConversation.participantId) ||
            (m.senderId === selectedConversation.participantId && m.receiverId === user.uid);
          
          return isNormalMessage &&
            !(m.deletedBy || []).includes(user.uid); // Filter out messages deleted by current user
        }
      )
      .sort((a, b) => {
        const timeA = a.createdAt?.toDate?.() || new Date(0);
        const timeB = b.createdAt?.toDate?.() || new Date(0);
        return timeA.getTime() - timeB.getTime();
      });
  }, [messages, selectedConversation, user]);

  // Mark messages as read
  useEffect(() => {
    if (selectedConversation && user) {
      conversationMessages.forEach((msg) => {
        if (!msg.read && msg.senderId === selectedConversation.participantId && msg.receiverId === user.uid) {
          updateDoc(doc(db, 'rooms', msg.roomId, 'privateMessages', msg.id), { read: true }).catch(console.error);
        }
      });
    }
  }, [selectedConversation, conversationMessages, user]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversationMessages]);

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;
    if (diffMins < 10080) {
      const days = Math.floor(diffMins / 1440);
      return days === 1 ? 'Yesterday' : `${days}d`;
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatChatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getLastMessagePreview = (message: PrivateMessage) => {
    if (message.text) {
      return message.text.length > 35 ? message.text.substring(0, 35) + '...' : message.text;
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
    if (!user || !selectedConversation) return;
    
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
      if (currentDeletedBy.includes(user.uid)) {
        // Already deleted by this user
        return;
      }
      
      // Add current user to deletedBy array using arrayUnion to avoid race conditions
      await updateDoc(messageRef, {
        deletedBy: arrayUnion(user.uid)
      });
      
      toast.success('Message deleted');
    } catch (error: any) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message: ' + error.message);
    }
  };

  // Delete individual file from message
  const handleDeleteFile = async (message: PrivateMessage, fileIndex: number) => {
    if (!user || !selectedConversation) return;
    
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

  const checkVideoDuration = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration <= MAX_VIDEO_DURATION);
      };
      video.onerror = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(false);
      };
      video.src = URL.createObjectURL(file);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !selectedConversation) return;

    const validFiles: File[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} exceeds 100MB limit`);
        continue;
      }

      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (!isImage && !isVideo && !isPDF) {
        toast.error(`${file.name} is not a supported file type`);
        continue;
      }

      if (isVideo) {
        try {
          const isValidDuration = await checkVideoDuration(file);
          if (!isValidDuration) {
            toast.error(`${file.name} must be 3 minutes or less`);
            continue;
          }
        } catch (error) {
          continue;
        }
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    setUploading(true);
    const fileUploads = validFiles.map(file => ({ name: file.name, progress: 0 }));
    setUploadingFiles(fileUploads);

    try {
      // ✅ CRITICAL FIX: Use the most recent message's roomId for sending new messages
      const lastMsgForRoom = conversationMessages.length > 0 
        ? conversationMessages[conversationMessages.length - 1]
        : selectedConversation!.lastMessage;
      const targetRoomIdForFiles = lastMsgForRoom?.roomId || selectedConversation!.lastMessage.roomId;

      const uploadPromises = validFiles.map(async (file, index) => {
        const timestamp = Date.now();
        const fileExtension = file.name.split('.').pop();
        const fileName = `${timestamp}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
        const storagePath = `rooms/${targetRoomIdForFiles}/privateMessages/${user!.uid}/${selectedConversation!.participantId}/${fileName}`;
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
            reject,
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
      
      const fileMessageData: any = {
        senderId: user!.uid,
        receiverId: selectedConversation!.participantId,
        senderName: userProfile?.displayName || user!.email || 'Anonymous',
        receiverName: selectedConversation!.participantName,
        files: uploadedFiles,
        read: false,
        createdAt: serverTimestamp(),
      };
      
      // Add reply reference if replying to a message
      if (replyingTo) {
        fileMessageData.replyTo = {
          messageId: replyingTo.id,
          senderName: replyingTo.senderName,
          text: replyingTo.text,
          fileCount: replyingTo.files?.length || 0,
        };
      }
      
      await addDoc(collection(db, 'rooms', targetRoomIdForFiles, 'privateMessages'), fileMessageData);
      
      setReplyingTo(null);
      
      toast.success(`${uploadedFiles.length} file${uploadedFiles.length > 1 ? 's' : ''} sent`);
      setUploading(false);
      setUploadingFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error: any) {
      toast.error('Failed to upload files: ' + error.message);
      setUploading(false);
      setUploadingFiles([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation || !user || !userProfile) return;
    
    if ((newMessage.trim() || uploading) && newMessage.length <= MAX_LENGTH) {
      if (!uploading) {
        try {
          // ✅ CRITICAL FIX: Use the most recent message's roomId for sending new messages
          const lastMsgForText = conversationMessages.length > 0 
            ? conversationMessages[conversationMessages.length - 1]
            : selectedConversation.lastMessage;
          const targetRoomIdForText = lastMsgForText?.roomId || selectedConversation.lastMessage.roomId;
          
          const messageData: any = {
            senderId: user.uid,
            receiverId: selectedConversation.participantId,
            senderName: userProfile.displayName || user.email || 'Anonymous',
            receiverName: selectedConversation.participantName,
            text: newMessage.trim(),
            read: false,
            createdAt: serverTimestamp(),
          };
          
          // Add reply reference if replying to a message
          if (replyingTo) {
            messageData.replyTo = {
              messageId: replyingTo.id,
              senderName: replyingTo.senderName,
              text: replyingTo.text,
              fileCount: replyingTo.files?.length || 0,
            };
          }
          
          await addDoc(collection(db, 'rooms', targetRoomIdForText, 'privateMessages'), messageData);
          
          setNewMessage('');
          setReplyingTo(null);
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = '40px';
          }
        } catch (error: any) {
          toast.error('Failed to send message: ' + error.message);
        }
      }
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 100;
      const minHeight = 20;
      const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
      textareaRef.current.style.height = `${newHeight}px`;
    }
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

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  return (
    <div className={`${isMobile ? 'min-h-screen' : 'h-screen'} ${isMobile ? 'bg-midnight' : 'bg-midnight'} flex flex-col`}>
      {/* Header - Hidden on mobile when in inbox */}
      {!isMobile && <Header showUserMenu={true} />}
      
      {/* Mobile: Full screen, Desktop: Centered container */}
      <div className={isMobile ? 'fixed inset-0 flex flex-col' : 'flex-1 flex flex-col overflow-hidden'}>
        {/* Desktop: Center container with max-width */}
        <div className={`${isMobile ? 'flex-1 flex flex-col overflow-hidden' : 'w-full max-w-[1400px] mx-auto px-4 pb-4 flex-1 flex flex-col overflow-hidden'}`}>
          <div className={`${isMobile ? 'flex-1 flex flex-col overflow-hidden' : 'flex-1 bg-cloud rounded-lg shadow-lg overflow-hidden'} flex flex-col`}>
            <div className="flex flex-1 min-h-0">
              {/* Conversations List - WhatsApp Style */}
              <div className={`${isMobile && showChatView ? 'hidden' : 'flex'} ${isMobile ? 'w-full' : 'w-64 sm:w-80'} flex-col bg-midnight border-r border-gray-800`}>
              {/* Header */}
              <div className="bg-gray-800 px-4 py-2 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center space-x-3">
                  {isMobile && (
                    <button
                      onClick={() => navigate('/home')}
                      className="text-cloud hover:text-gray-300 p-1"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                    </button>
                  )}
                  <h2 className="text-cloud font-semibold text-base">Inbox</h2>
                </div>
              </div>
              
              {/* Conversations */}
              <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                  <div className="p-4 text-center text-gray-400 text-sm">
                    <p>No conversations yet</p>
                  </div>
                ) : (
                  conversations.map((conv) => {
                    const isSelected = selectedConversation?.participantId === conv.participantId;
                    
                    return (
                      <button
                        key={conv.participantId}
                        onClick={() => handleSelectConversation(conv)}
                        className={`w-full text-left px-4 py-3 border-b border-gray-800 hover:bg-gray-800/50 transition-colors flex items-center space-x-3 ${
                          isSelected ? 'bg-gray-800' : ''
                        } ${conv.hasUnread ? 'bg-gray-800/70' : ''}`}
                      >
                        {/* Profile Picture */}
                        <div className="flex-shrink-0">
                          {conv.participantPhotoURL ? (
                            <img
                              src={conv.participantPhotoURL}
                              alt={conv.participantName}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-techBlue to-violetDeep flex items-center justify-center text-cloud font-semibold text-sm">
                              {getInitials(conv.participantName)}
                            </div>
                          )}
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className={`text-cloud font-medium text-sm truncate ${
                              conv.hasUnread ? 'font-semibold' : ''
                            }`}>
                              {conv.participantName}
                            </p>
                            <span className="text-gray-400 text-xs ml-2 flex-shrink-0">
                              {formatTime(conv.lastMessage.createdAt)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className={`text-gray-400 text-sm truncate ${
                              conv.hasUnread ? 'text-gray-300 font-medium' : ''
                            }`}>
                              {getLastMessagePreview(conv.lastMessage)}
                            </p>
                            {conv.unreadCount > 0 && (
                              <span className="ml-2 bg-techBlue text-cloud text-xs font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center flex-shrink-0">
                                {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Chat View - WhatsApp Style */}
            <div className={`${isMobile && !showChatView ? 'hidden' : 'flex'} flex-1 flex-col min-w-0 bg-midnight`}>
              {selectedConversation ? (
                <>
                  {/* Chat Header */}
                  <div className="bg-gray-800 px-4 py-2 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center space-x-3">
                      {isMobile && (
                        <button
                          onClick={handleBackToList}
                          className="text-cloud hover:text-gray-300 p-1"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7m0 0l7-7m-7 7h18" />
                          </svg>
                        </button>
                      )}
                      {selectedConversation.participantPhotoURL ? (
                        <img
                          src={selectedConversation.participantPhotoURL}
                          alt={selectedConversation.participantName}
                          className="w-9 h-9 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-techBlue to-violetDeep flex items-center justify-center text-cloud font-semibold text-xs">
                          {getInitials(selectedConversation.participantName)}
                        </div>
                      )}
                      <p className="text-cloud font-semibold text-sm">{selectedConversation.participantName}</p>
                    </div>
                    {!isMobile && (
                      <button
                        onClick={() => navigate('/home')}
                        className="text-techBlue hover:text-techBlue/80 text-sm"
                      >
                        Go to Home
                      </button>
                    )}
                  </div>

                  {/* Messages Area */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-midnight min-h-0" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(14, 58, 138, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(108, 99, 255, 0.1) 0%, transparent 50%)' }}>
                    {conversationMessages.length === 0 ? (
                      <div className="text-center text-gray-400 py-8">
                        <p className="font-medium">No messages yet</p>
                        <p className="text-sm mt-1">Start the conversation!</p>
                      </div>
                    ) : (
                      conversationMessages.map((message) => {
                        const isOwnMessage = message.senderId === user?.uid;
                        return (
                          <div
                            key={message.id}
                            ref={(el) => {
                              if (el) messageRefs.current.set(message.id, el);
                            }}
                            className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} group relative`}
                          >
                            <div className={`max-w-[75%] sm:max-w-[65%] lg:max-w-[50%]`}>
                              <div
                                className={`rounded-lg px-3 py-2 relative ${
                                  isOwnMessage 
                                    ? 'bg-techBlue text-white rounded-tr-none' 
                                    : 'bg-gray-800 text-white rounded-tl-none'
                                }`}
                                style={{
                                  borderRadius: isOwnMessage 
                                    ? '0.5rem 0.5rem 0.25rem 0.5rem' 
                                    : '0.5rem 0.5rem 0.5rem 0.25rem'
                                }}
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
                                            {/* Delete file button */}
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
                                            {/* Delete file button */}
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
                                          <div className="border border-gray-600 rounded-lg p-3 bg-gray-700">
                                            <div className="flex items-center space-x-2 mb-2">
                                              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                              </svg>
                                              <div className="flex-1">
                                                <p className="text-sm font-medium text-white truncate">{message.files[0].name}</p>
                                                <p className="text-xs text-gray-400">PDF Document</p>
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
                                              {file.type === 'image' && (
                                                <>
                                                  <img
                                                    src={file.url}
                                                    alt={file.name}
                                                    className="w-full h-full object-cover"
                                                    style={{ aspectRatio: '1/1', minHeight: '100px', maxHeight: '100px' }}
                                                  />
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
                                {message.text && (
                                  <p className="text-sm whitespace-pre-wrap break-words text-white">{message.text}</p>
                                )}
                                {/* Time inside message bubble */}
                                <p className={`text-xs text-white/70 mt-1 ${isOwnMessage ? 'text-right' : 'text-left'}`}>
                                  {formatChatTime(message.createdAt)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
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

                  {/* Input Area - WhatsApp Style */}
                  <div className="bg-midnight px-3 py-2 flex-shrink-0">
                    {/* Reply preview with thumbnail */}
                    {replyingTo && (
                      <div className="mb-2 p-2 bg-gray-800 rounded-lg border-l-2 border-techBlue flex items-start justify-between">
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
                                <div className="w-12 h-12 rounded bg-gray-700 relative overflow-hidden">
                                  <video 
                                    src={replyingTo.files[0].url} 
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M8 5v14l11-7z" />
                                    </svg>
                                  </div>
                                </div>
                              ) : (
                                <div className="w-12 h-12 rounded bg-gray-700 flex items-center justify-center">
                                  <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                  </svg>
                                </div>
                              )
                            ) : (
                              <div className="w-12 h-12 rounded bg-gray-700 flex items-center justify-center">
                                <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                              </div>
                            )}
                          </div>
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-techBlue mb-1">Replying to {replyingTo.senderName}</p>
                            {replyingTo.text && (
                              <p className="text-xs text-gray-300 line-clamp-1">{replyingTo.text}</p>
                            )}
                            {replyingTo.files && replyingTo.files.length > 0 && (
                              <p className="text-xs text-gray-400 mt-1">📎 {replyingTo.files.length} file{replyingTo.files.length > 1 ? 's' : ''}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setReplyingTo(null)}
                          className="text-gray-400 hover:text-white ml-2 flex-shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                    {uploading && uploadingFiles.length > 0 && (
                      <div className="mb-2 space-y-1 px-1">
                        {uploadingFiles.map((file, index) => (
                          <div key={index} className="flex items-center justify-between text-xs text-gray-400">
                            <span className="truncate">{file.name}</span>
                            <span>{Math.round(file.progress)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <form onSubmit={handleSubmit} className="flex items-end space-x-2 relative">
                      {/* Emoji Picker */}
                      {showEmojiPicker && (
                        <div 
                          ref={emojiPickerRef}
                          className="absolute bottom-full right-0 mb-2 z-50"
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
                        className="text-gray-400 hover:text-techBlue p-2 disabled:opacity-50 transition-colors flex-shrink-0"
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
                        className="text-gray-400 hover:text-techBlue p-2 disabled:opacity-50 transition-colors flex-shrink-0"
                        title="Attach files"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                      </button>
                      <textarea
                        ref={textareaRef}
                        value={newMessage}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value.length <= MAX_LENGTH) {
                            setNewMessage(value);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit(e as any);
                          }
                        }}
                        onClick={() => setShowEmojiPicker(false)}
                        placeholder="Type a message"
                        className="flex-1 bg-gray-800 rounded-full px-4 py-2.5 text-white placeholder-gray-400 resize-none focus:outline-none text-sm leading-5 min-h-[44px] max-h-[120px] overflow-y-auto"
                        style={{ 
                          minHeight: '44px',
                          maxHeight: '120px',
                          height: '44px',
                          lineHeight: '1.25',
                          border: 'none',
                          wordWrap: 'break-word',
                          overflowWrap: 'break-word'
                        }}
                        rows={1}
                        maxLength={MAX_LENGTH}
                        disabled={uploading}
                      />
                      <button
                        type="submit"
                        disabled={(!newMessage.trim() && !uploading) || uploading}
                        className="bg-techBlue text-cloud rounded-full p-2.5 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-techBlue/90 transition-colors flex-shrink-0"
                        style={{ width: '44px', height: '44px' }}
                        title="Send"
                      >
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center bg-midnight">
                  <div className="text-center text-gray-400">
                    <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <p className="font-medium text-lg">Select a conversation</p>
                    <p className="text-sm mt-1">Choose a conversation from the sidebar</p>
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InboxPage;
