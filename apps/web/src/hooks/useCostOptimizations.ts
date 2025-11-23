import { useEffect, useRef } from 'react';
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrackPublication,
  Track,
  VideoQuality,
} from 'livekit-client';

/**
 * Hook to optimize LiveKit costs and bandwidth usage
 * 
 * Features:
 * - Active speaker-based video quality (only active speaker gets HIGH quality)
 * - Pause local camera when tab/window is in background
 * - Auto-disconnect on beforeunload to avoid ghost participants
 * - Auto-disconnect when alone for >10 minutes
 * 
 * This significantly reduces LiveKit participant minutes and bandwidth costs
 */
export function useCostOptimizations(room: Room | null | undefined) {
  // ✅ REMOVED: previousCameraEnabledRef - no longer needed since cameras stay on always
  const aloneTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!room || room.state !== 'connected') return;

    // ============================================
    // 1. Active Speaker-based Video Quality
    // ============================================
    // Only the current active speaker gets HIGH quality video
    // All other participants get LOW quality to save bandwidth and participant minutes
    const adjustRemoteVideoQuality = (activeSpeakers: Array<RemoteParticipant | any>) => {
      const activeIds = new Set(
        activeSpeakers
          .filter((p) => p.identity) // defensive check
          .map((p) => p.identity),
      );

      room.participants.forEach((participant) => {
        // Only process RemoteParticipants, skip LocalParticipant
        if (!(participant instanceof RemoteParticipant)) return;

        // Access trackPublications - it may be a Map or array
        const trackPublications = (participant as any).trackPublications;
        if (!trackPublications) return;

        const publications = trackPublications instanceof Map
          ? Array.from(trackPublications.values())
          : Array.isArray(trackPublications)
          ? trackPublications
          : [];

        publications.forEach((pub: RemoteTrackPublication) => {
          if (pub.source !== Track.Source.Camera) return;
          if (!pub.isSubscribed) return;

          // For the active speaker give HIGH quality, others LOW to save bandwidth
          if (activeIds.has(participant.identity)) {
            pub.setVideoQuality(VideoQuality.HIGH);
          } else {
            pub.setVideoQuality(VideoQuality.LOW);
          }
        });
      });
    };

    // Set initial quality to MEDIUM for all participants
    const setInitialQuality = () => {
      room.participants.forEach((participant) => {
        // Only process RemoteParticipants, skip LocalParticipant
        if (!(participant instanceof RemoteParticipant)) return;

        const trackPublications = (participant as any).trackPublications;
        if (!trackPublications) return;

        const publications = trackPublications instanceof Map
          ? Array.from(trackPublications.values())
          : Array.isArray(trackPublications)
          ? trackPublications
          : [];

        publications.forEach((pub: RemoteTrackPublication) => {
          if (pub.source === Track.Source.Camera && pub.isSubscribed) {
            pub.setVideoQuality(VideoQuality.MEDIUM);
          }
        });
      });
    };

    const handleActiveSpeakersChanged = () => {
      const activeSpeakers = room.activeSpeakers;
      adjustRemoteVideoQuality(activeSpeakers);
    };

    // Also handle when new participants join or tracks are published
    const handleTrackSubscribed = () => {
      // When a new track is subscribed, set initial quality
      setInitialQuality();
      // Then adjust based on active speakers
      const activeSpeakers = room.activeSpeakers;
      if (activeSpeakers.length > 0) {
        adjustRemoteVideoQuality(activeSpeakers);
      }
    };

    // Set initial quality on join
    setInitialQuality();

    // Listen for active speaker changes
    room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
    
    // Also listen for track subscriptions to apply quality to new participants
    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);

    // ============================================
    // 2. REMOVED: Camera Pausing on Tab Visibility
    // ============================================
    // ✅ CRITICAL FIX: Professional video meetings (like Zoom) do NOT pause cameras
    // when users switch tabs or windows. Desktop users should be able to have
    // multiple tabs/windows open without their camera being disabled.
    // 
    // REMOVED: handleVisibilityChange, handleBlur, handleFocus
    // Cameras will now stay ON regardless of tab/window focus state

    // ============================================
    // 3. Auto-disconnect on BeforeUnload
    // ============================================
    // Disconnect when user closes tab/window to avoid ghost participants
    const handleBeforeUnload = () => {
      // Best-effort sync disconnect – don't await
      if (room.state === 'connected') {
        room.disconnect();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // ============================================
    // 4. Auto-disconnect When Alone for >10 Minutes
    // ============================================
    // Avoid burning minutes when user stays alone in room doing nothing
    const checkIfAlone = () => {
      // Count remote participants only (excluding local)
      const remoteCount = Array.from(room.participants.values()).filter(
        (p) => p instanceof RemoteParticipant
      ).length;
      const participantCount = 1 + remoteCount; // local + remote

      if (participantCount <= 1) {
        // If alone for >10 minutes, disconnect to save cost
        if (!aloneTimerRef.current) {
          aloneTimerRef.current = window.setTimeout(() => {
            if (room.state === 'connected') {
              // Disconnect to save LiveKit participant minutes
              room.disconnect();
            }
          }, 10 * 60 * 1000); // 10 minutes
        }
      } else {
        // Not alone anymore – clear any scheduled disconnect
        if (aloneTimerRef.current) {
          clearTimeout(aloneTimerRef.current);
          aloneTimerRef.current = undefined;
        }
      }
    };

    const handleParticipantConnected = () => checkIfAlone();
    const handleParticipantDisconnected = () => checkIfAlone();

    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);

    // Run once on join
    checkIfAlone();

    // ============================================
    // Cleanup
    // ============================================
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      // ✅ REMOVED: visibility/blur/focus listeners - cameras stay on always
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (aloneTimerRef.current) {
        clearTimeout(aloneTimerRef.current);
        aloneTimerRef.current = undefined;
      }
    };
  }, [room]);
}

