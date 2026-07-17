export {};
declare global {
  interface Window {
    recordingBridge: {
      onStart: (cb: (data: {
        sourceId: string;
        employeeId: string;
        sessionId: string;
        authToken: string;
        serverUrl: string;
        chunkSeconds: number;
      }) => void) => void;
      onStop: (cb: () => void) => void;
      sendReady: () => void;
      log: (payload: Record<string, unknown>) => void;
      sendChunk: (meta: Record<string, unknown>, buffer: ArrayBuffer) => void;
    };
  }
}