import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';
import Header from '../components/Header';

interface Recording {
  id: string;
  roomId: string;
  storagePath: string;
  size: number;
  duration: number;
  layout: string;
  createdAt: any;
}

const HistoryPage: React.FC = () => {
  const { user } = useAuth();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadRecordings();
  }, [user]);

  const loadRecordings = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Get all rooms where user is host
      const roomsQuery = query(
        collection(db, 'rooms'),
        where('createdBy', '==', user.uid)
      );
      const roomsSnapshot = await getDocs(roomsQuery);
      const roomIds = roomsSnapshot.docs.map(doc => doc.id);

      if (roomIds.length === 0) {
        setRecordings([]);
        setLoading(false);
        return;
      }

      // Get recordings for these rooms
      const recordingsQuery = query(
        collection(db, 'recordings'),
        where('roomId', 'in', roomIds),
        orderBy('createdAt', 'desc')
      );
      const recordingsSnapshot = await getDocs(recordingsQuery);
      
      const recordingsData = recordingsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Recording[];

      setRecordings(recordingsData);
    } catch (error: any) {
      toast.error('Failed to load recordings: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleDownload = async () => {
    try {
      // TODO: Implement download from Firebase Storage
      toast('Download functionality coming soon');
    } catch (error: any) {
      toast.error('Failed to download recording: ' + error.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this recording?')) return;
    
    try {
      // TODO: Implement delete from Firebase Storage and Firestore
      toast('Delete functionality coming soon');
    } catch (error: any) {
      toast.error('Failed to delete recording: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-midnight">
        <Header title="Recording History" />
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-techBlue"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-midnight">
      <Header title="Recording History" />
      
      <main className="container mx-auto px-6 py-8">
        <div className="max-w-6xl mx-auto">
          {recordings.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg
                  className="w-12 h-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-cloud mb-4">No Recordings Yet</h2>
              <p className="text-gray-300 mb-8">
                Your meeting recordings will appear here once you start recording meetings.
              </p>
              <button
                onClick={() => window.history.back()}
                className="btn btn-primary"
              >
                Go Back
              </button>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-cloud">Recording History</h1>
                <p className="text-gray-300">
                  {recordings.length} recording{recordings.length !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="grid gap-6">
                {recordings.map((recording) => (
                  <div key={recording.id} className="card p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                          <svg
                            className="w-6 h-6 text-red-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </div>
                        
                        <div>
                          <h3 className="font-semibold text-midnight">
                            Meeting Recording
                          </h3>
                          <p className="text-sm text-gray-600">
                            Room: {recording.roomId}
                          </p>
                          <p className="text-sm text-gray-500">
                            {formatDate(recording.createdAt)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="text-right text-sm text-gray-600">
                          <p>Duration: {formatDuration(recording.duration)}</p>
                          <p>Size: {formatFileSize(recording.size)}</p>
                          <p>Layout: {recording.layout}</p>
                        </div>

                        <div className="flex space-x-2">
                          <button
                            onClick={handleDownload}
                            className="btn btn-primary text-sm"
                          >
                            Download
                          </button>
                          <button
                            onClick={handleDelete}
                            className="btn btn-danger text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default HistoryPage;
