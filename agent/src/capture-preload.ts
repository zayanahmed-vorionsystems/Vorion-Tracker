import { contextBridge, ipcRenderer } from 'electron';

type LiveWatchStartPayload = {
  employeeId: string;
  sessionId: string;
  authToken: string;
  serverUrl: string;
  sourceId: string;
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