
(() => {
  const globalScope = window as Window & typeof globalThis & {
    __worktrackCaptureRendererInitialized?: boolean;
    __worktrackCaptureRendererLiveWatch?: any;
  };

  if (globalScope.__worktrackCaptureRendererInitialized) {
    console.log('[AGENT] capture renderer already initialized');
    return;
  }

  globalScope.__worktrackCaptureRendererInitialized = true;
  console.log('[AGENT][5] capture-renderer loaded');

  const liveWatch = globalScope.__worktrackCaptureRendererLiveWatch || (window as any).liveWatch;
  if (!liveWatch) {
    console.error('[AGENT][ERR] liveWatch bridge missing');
    return;
  }

  if (typeof liveWatch.sendReady !== 'function') {
    console.error('[AGENT][ERR] liveWatch.sendReady is not available');
    return;
  }

  globalScope.__worktrackCaptureRendererLiveWatch = liveWatch;

  const pcs = new Map<string, RTCPeerConnection>();
  const streams = new Map<string, MediaStream>();

  function logErrorWithStack(message: string, error: unknown) {
    console.error(message);
    if (error instanceof Error) {
      console.error(error.stack || error.message || String(error));
    } else if (typeof error === 'object' && error !== null) {
      console.error(JSON.stringify(error, null, 2));
    } else {
      console.error(String(error));
    }
  }

  async function startCaptureForAdmin(sourceId: string, adminId: string, offer?: any) {
    console.log('[AGENT] starting capture for admin', { sourceId, adminId, hasOffer: Boolean(offer) });
    stopCaptureForAdmin(adminId);

    try {
      const constraints = {
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxFrameRate: 15,
          },
        },
      } as any;

      const screenStream = await (navigator.mediaDevices as any).getUserMedia(constraints);

      if (!screenStream) {
        throw new Error('Screen stream failed to initialize');
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun.relay.metered.ca:80' },
          { urls: 'turn:global.relay.metered.ca:80', username: '339635db329dc7164bf05f8f', credential: 'e9nkJFUYjEXW7lkq' },
          { urls: 'turn:global.relay.metered.ca:443', username: '339635db329dc7164bf05f8f', credential: 'e9nkJFUYjEXW7lkq' },
        ],
      });

      pc.onconnectionstatechange = () => {
        console.log('[AGENT] connectionState', { adminId, state: pc.connectionState });
      };
      pc.oniceconnectionstatechange = () => {
        console.log('[AGENT] iceConnectionState', { adminId, state: pc.iceConnectionState });
      };
      pc.onsignalingstatechange = () => {
        console.log('[AGENT] signalingState', { adminId, state: pc.signalingState });
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          liveWatch.sendIceCandidate(adminId, e.candidate.toJSON());
        }
      };

      screenStream.getTracks().forEach((track: MediaStreamTrack) => pc.addTrack(track, screenStream));
      pcs.set(adminId, pc);
      streams.set(adminId, screenStream);

      if (offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        liveWatch.sendAnswer(adminId, pc.localDescription!.toJSON());
      }
    } catch (err: any) {
      logErrorWithStack('[AGENT][ERR] WebRTC setup failed', err);
    }
  }

  function stopCaptureForAdmin(adminId?: string) {
    const targetAdmins = adminId ? [adminId] : Array.from(pcs.keys());
    targetAdmins.forEach((targetAdminId) => {
      const stream = streams.get(targetAdminId);
      stream?.getTracks().forEach((track) => track.stop());
      streams.delete(targetAdminId);
      pcs.get(targetAdminId)?.close();
      pcs.delete(targetAdminId);
    });
  }

  liveWatch.onStartCapture(({ sourceId, adminId, offer }: { sourceId: string; adminId: string; offer?: any }) => {
    startCaptureForAdmin(sourceId, adminId, offer).catch((err) => {
      logErrorWithStack('[AGENT][ERR] startCapture rejected', err);
    });
  });

  liveWatch.onStopCapture(({ adminId }: { adminId?: string } = {}) => stopCaptureForAdmin(adminId));

  liveWatch.onRemoteAnswer(async ({ adminId, sdp }: { adminId: string; sdp: any }) => {
    const pc = pcs.get(adminId);
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (err: any) {
        console.error('[AGENT][ERR] failed to apply remote answer', err?.stack || err);
      }
    }
  });

  liveWatch.onRemoteIceCandidate(({ adminId, candidate }: { adminId: string; candidate: any }) => {
    const pc = pcs.get(adminId);
    if (pc) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
        console.error('[AGENT][ERR] ICE candidate rejected', err?.stack || err);
      });
    }
  });

  console.log('[AGENT] capture renderer ready');
  try {
    liveWatch.sendReady();
    console.log('[AGENT] sendReady invoked');
  } catch (err) {
    console.error('[AGENT][ERR] failed to sendReady', err);
  }
})();