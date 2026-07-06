export {};
declare global {
  interface Window {
    liveWatch: {
      onStartCapture: (cb: (data: { sourceId: string }) => void) => void;
      onStopCapture: (cb: () => void) => void;
      onRemoteAnswer: (cb: (data: { sdp: any }) => void) => void;
      onRemoteIceCandidate: (cb: (data: { candidate: any }) => void) => void;
      sendOffer: (sdp: any) => void;
      sendIceCandidate: (candidate: any) => void;
      sendReady: () => void;
    };
  }
}

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

  globalScope.__worktrackCaptureRendererLiveWatch = liveWatch;

  let pc: RTCPeerConnection | null = null;
  let stream: MediaStream | null = null;

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

  async function startCapture(sourceId: string) {
    console.log('[AGENT] stream-request received', { sourceId });
    console.log('[AGENT] starting capture', { sourceId });
    stopCapture();

    try {
      console.log('[AGENT] before getUserMedia');
      stream = await (navigator.mediaDevices as any).getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxFrameRate: 15,
          },
        },
      });

      if (!stream) {
        throw new Error('Screen stream failed to initialize');
      }

      console.log('[AGENT] getUserMedia success', { videoTracks: stream.getVideoTracks().length, audioTracks: stream.getAudioTracks().length });
      console.log('[AGENT] after getUserMedia');

      pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      console.log('[AGENT] RTCPeerConnection created');
      console.log('[AGENT] after RTCPeerConnection creation');

      pc.onconnectionstatechange = () => {
        console.log('[AGENT] connectionState', pc?.connectionState);
      };
      pc.oniceconnectionstatechange = () => {
        console.log('[AGENT] iceConnectionState', pc?.iceConnectionState);
      };
      pc.onsignalingstatechange = () => {
        console.log('[AGENT] signalingState', pc?.signalingState);
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          console.log('[AGENT] ICE candidate gathered');
          console.log('[AGENT] sending ice-candidate to main process');
          liveWatch.sendIceCandidate(e.candidate.toJSON());
        }
      };

      const activeStream = stream;
      if (!activeStream) throw new Error('Screen stream failed to initialize');
      activeStream.getTracks().forEach((track) => pc!.addTrack(track, activeStream));
      console.log('[AGENT] tracks added');

      console.log('[AGENT] before createOffer');
      const offer = await pc.createOffer();
      console.log('[AGENT] offer created');
      console.log('[AGENT] after createOffer');
      console.log('[AGENT] before setLocalDescription');
      await pc.setLocalDescription(offer);
      console.log('[AGENT] local description set');
      console.log('[AGENT] after setLocalDescription');
      console.log('[AGENT] before sendOffer');
      liveWatch.sendOffer(pc.localDescription);
      console.log('[AGENT] after sendOffer');
    } catch (err: any) {
      logErrorWithStack('[AGENT][ERR] WebRTC setup failed', err);
    }
  }

  function stopCapture() {
    console.log('[AGENT] stopping capture');
    stream?.getTracks().forEach((t) => t.stop());
    pc?.close();
    pc = null;
    stream = null;
  }

  liveWatch.onStartCapture(({ sourceId }: { sourceId: string }) => {
    console.log('[AGENT] stream-request received', { sourceId });
    startCapture(sourceId).catch((err) => {
      logErrorWithStack('[AGENT][ERR] startCapture rejected', err);
    });
  });

  liveWatch.onStopCapture(() => stopCapture());

  liveWatch.onRemoteAnswer(async ({ sdp }: { sdp: any }) => {
    console.log('[AGENT] remote-answer received', { hasSdp: Boolean(sdp) });
    if (pc) {
      try {
        console.log('[AGENT] before setRemoteDescription');
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        console.log('[AGENT] remote answer applied');
        console.log('[AGENT] after setRemoteDescription');
      } catch (err: any) {
        console.error('[AGENT][ERR] failed to apply remote answer');
        console.error(err?.stack || err);
      }
    }
  });

  liveWatch.onRemoteIceCandidate(({ candidate }: { candidate: any }) => {
    console.log('[AGENT] remote ice candidate received', { hasCandidate: Boolean(candidate) });
    if (pc) {
      console.log('[AGENT] before addIceCandidate');
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
        console.log('[AGENT] after addIceCandidate');
        console.error('[AGENT][ERR] ICE candidate rejected');
        console.error(err?.stack || err);
      });
    }
  });

  console.log('[AGENT] capture renderer ready');
  liveWatch.sendReady();
})();
