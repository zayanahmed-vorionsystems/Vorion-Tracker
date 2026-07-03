'use client';
// lib/useWatchLive.ts
// Admin-side WebRTC logic for the "Watch Live" feature.
// Import into live/page.tsx and pass it your existing socket instance.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

export function useWatchLive(socket: Socket | null) {
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsConnecting(false);
    setActiveEmployeeId(null);
  }, []);

  const stopWatching = useCallback(() => {
    if (activeEmployeeId) socket?.emit('watch-stop', { employeeId: activeEmployeeId });
    cleanup();
  }, [socket, activeEmployeeId, cleanup]);

  const startWatching = useCallback(
    (employeeId: string) => {
      if (!socket) return;

      // if already watching someone else, stop that first
      if (activeEmployeeId && activeEmployeeId !== employeeId) {
        socket.emit('watch-stop', { employeeId: activeEmployeeId });
        cleanup();
      }

      setIsConnecting(true);
      setActiveEmployeeId(employeeId);

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;

      pc.ontrack = (e) => {
        if (videoRef.current) {
          videoRef.current.srcObject = e.streams[0];
          setIsConnecting(false);
        }
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit('webrtc-ice-candidate', {
            employeeId,
            candidate: e.candidate.toJSON(),
            from: 'admin',
          });
        }
      };

      socket.emit('watch-request', { employeeId });
    },
    [socket, activeEmployeeId, cleanup]
  );

  useEffect(() => {
    if (!socket) return;

    const onOffer = async ({ employeeId, sdp }: { employeeId: string; sdp: any }) => {
      const pc = pcRef.current;
      if (!pc || employeeId !== activeEmployeeId) return;
      await pc.setRemoteDescription(sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { employeeId, sdp: pc.localDescription });
    };

    const onIce = async ({ candidate, from }: { candidate: any; from: string }) => {
      if (from !== 'agent') return;
      try {
        await pcRef.current?.addIceCandidate(candidate);
      } catch {
        // ignore late/duplicate candidates
      }
    };

    socket.on('webrtc-offer', onOffer);
    socket.on('webrtc-ice-candidate', onIce);

    return () => {
      socket.off('webrtc-offer', onOffer);
      socket.off('webrtc-ice-candidate', onIce);
    };
  }, [socket, activeEmployeeId]);

  // stop watching if the component using this hook unmounts
  useEffect(() => () => cleanup(), [cleanup]);

  return { videoRef, activeEmployeeId, isConnecting, startWatching, stopWatching };
}