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