// agent/src/capture-renderer.ts
// Runs inside the hidden capture BrowserWindow (via capture.html).
// Grabs the screen using the sourceId handed to it by main.ts,
// creates the RTCPeerConnection, and streams to the admin.

declare global {
  interface Window {
    liveWatch: {
      onStartCapture: (cb: (data: { sourceId: string }) => void) => void;
      onStopCapture: (cb: () => void) => void;
      onRemoteAnswer: (cb: (data: { sdp: any }) => void) => void;
      onRemoteIceCandidate: (cb: (data: { candidate: any }) => void) => void;
      sendOffer: (sdp: any) => void;
      sendIceCandidate: (candidate: any) => void;
    };
  }
}

let pc: RTCPeerConnection | null = null;
let stream: MediaStream | null = null;

async function startCapture(sourceId: string) {
  console.log('[CAPTURE] start-capture received', { sourceId });
  stopCapture();

  try {
    console.log('[CAPTURE] requesting getUserMedia');
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

    console.log('[CAPTURE] getUserMedia success', { videoTracks: stream.getVideoTracks().length, audioTracks: stream.getAudioTracks().length });

    pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    console.log('[CAPTURE] peer created');

    pc.onconnectionstatechange = () => {
      console.log('[CAPTURE] connectionState', pc?.connectionState);
    };
    pc.oniceconnectionstatechange = () => {
      console.log('[CAPTURE] iceConnectionState', pc?.iceConnectionState);
    };
    pc.onsignalingstatechange = () => {
      console.log('[CAPTURE] signalingState', pc?.signalingState);
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        console.log('[CAPTURE] ICE candidate gathered');
        window.liveWatch.sendIceCandidate(e.candidate.toJSON());
      }
    };

    const activeStream = stream;
    if (!activeStream) throw new Error('Screen stream failed to initialize');
    activeStream.getTracks().forEach((track) => pc!.addTrack(track, activeStream));
    console.log('[CAPTURE] tracks added');

    console.log('[CAPTURE] creating offer');
    const offer = await pc.createOffer();
    console.log('[CAPTURE] offer created');
    await pc.setLocalDescription(offer);
    console.log('[CAPTURE] local description set');
    console.log('[CAPTURE] sending offer to main process');
    window.liveWatch.sendOffer(pc.localDescription);
    console.log('[CAPTURE] offer sent to main process');
  } catch (err: any) {
    console.error('[CAPTURE] WebRTC setup failed');
    console.error(err?.stack || err);
  }
}

function stopCapture() {
  console.log('[CAPTURE] stopping capture');
  stream?.getTracks().forEach((t) => t.stop());
  pc?.close();
  pc = null;
  stream = null;
}

window.liveWatch.onStartCapture(({ sourceId }) => {
  startCapture(sourceId).catch((err) => {
    console.error('[CAPTURE] startCapture rejected');
    console.error(err?.stack || err);
  });
});

window.liveWatch.onStopCapture(() => stopCapture());

window.liveWatch.onRemoteAnswer(async ({ sdp }) => {
  console.log('[CAPTURE] answer received', { hasSdp: Boolean(sdp) });
  if (pc) {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log('[CAPTURE] remote description applied');
    } catch (err: any) {
      console.error('[CAPTURE] failed to apply remote answer');
      console.error(err?.stack || err);
    }
  }
});

window.liveWatch.onRemoteIceCandidate(({ candidate }) => {
  console.log('[CAPTURE] ICE candidate received', { hasCandidate: Boolean(candidate) });
  pc?.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
    console.error('[CAPTURE] ICE candidate rejected');
    console.error(err?.stack || err);
  });
});

export {};