import { contextBridge, ipcRenderer } from 'electron';

type LiveWatchStartPayload = {
  employeeId: string;
  sessionId: string;
  authToken: string;
  serverUrl: string;
  sourceId: string;
};

type ChunkPayload = {
  sessionId: string;
  employeeId: string;
  chunkIndex: number;
  startTime: string;
  endTime: string;
  mimeType: string;
  buffer: ArrayBuffer;
};

contextBridge.exposeInMainWorld('livePublisher', {
  /**
   * Registers a callback that fires when the main process sends
   * 'livekit:start' with the config the renderer needs to connect + publish.
   */
  onStart: (callback: (payload: LiveWatchStartPayload) => void) => {
    ipcRenderer.on('livekit:start', (_event, payload: LiveWatchStartPayload) => {
      callback(payload);
    });
  },

  /**
   * Registers a callback that fires when the main process sends 'livekit:stop'.
   */
  onStop: (callback: () => void) => {
    ipcRenderer.on('livekit:stop', () => {
      callback();
    });
  },

  /**
   * Tells the main process this renderer has finished loading and is ready
   * to receive a 'livekit:start' event. main.ts's waitForCaptureWindow()
   * blocks until this fires (or times out after 8s).
   */
  sendReady: () => {
    ipcRenderer.send('livekit:ready');
  },

  /**
   * Forwards a structured log payload to the main process console/log file,
   * so renderer-side LiveKit state changes show up in agent-debug.log.
   */
  log: (payload: unknown) => {
    ipcRenderer.send('livekit:log', payload);
  },
});

contextBridge.exposeInMainWorld('recordingBridge', {
  /**
   * Sends one finished chunk (raw bytes + metadata) from the capture
   * renderer's ChunkRecorder up to the main process, where it's written to
   * disk and queued for upload by recordingmanager.ts's existing
   * 'recording:chunk-ready' handler.
   */
  sendChunk: (payload: ChunkPayload) => {
    ipcRenderer.send(
      'recording:chunk-ready',
      {
        employeeId: payload.employeeId,
        sessionId: payload.sessionId,
        startedAt: payload.startTime,
        endedAt: payload.endTime,
        durationSeconds: Math.max(
          1,
          Math.round((Date.parse(payload.endTime) - Date.parse(payload.startTime)) / 1000),
        ),
        mimeType: payload.mimeType,
      },
      payload.buffer,
    );
  },

  /**
   * Reserved for cases where session credentials need to be (re)pushed to
   * an already-running recording pipeline without a full restart.
   */
  setSession: (creds: { serverUrl: string; authToken: string; employeeId: string }) => {
    ipcRenderer.send('recording:set-session', creds);
  },
});