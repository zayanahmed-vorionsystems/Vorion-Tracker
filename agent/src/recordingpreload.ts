import { contextBridge, ipcRenderer } from 'electron';

// ... existing LiveWatchStartPayload type + livePublisher block same rehne do ...
chunkRecorder = new ChunkRecorder(stream, config.sessionId, config.employeeId);
contextBridge.exposeInMainWorld('recordingBridge', {
  sendChunk: (payload: {
    sessionId: string;
    chunkIndex: number;
    startTime: string;
    endTime: string;
    mimeType: string;
    buffer: ArrayBuffer;
  }) => {
    ipcRenderer.send('recording:chunk-ready',
      {
        employeeId: payload.employeeId, // main process ke pass already sessionId->employeeId mapping honi chahiye
        sessionId: payload.sessionId,
        startedAt: payload.startTime,
        endedAt: payload.endTime,
        durationSeconds: Math.max(1, Math.round((Date.parse(payload.endTime) - Date.parse(payload.startTime)) / 1000)),
        mimeType: payload.mimeType,
      },
      payload.buffer
    );
  },
  setSession: (creds: { serverUrl: string; authToken: string; employeeId: string }) => {
    ipcRenderer.send('recording:set-session', creds);
  },
});