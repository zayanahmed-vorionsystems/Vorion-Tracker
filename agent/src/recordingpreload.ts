import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('recordingBridge', {
  onStart: (cb: (data: any) => void) => {
    ipcRenderer.on('recording:start', (_event, payload) => cb(payload));
  },
  onStop: (cb: () => void) => {
    ipcRenderer.on('recording:stop', () => cb());
  },
  sendReady: () => ipcRenderer.send('recording:ready'),
  log: (payload: Record<string, unknown>) => ipcRenderer.send('recording:log', payload),
  sendChunk: (meta: Record<string, unknown>, buffer: ArrayBuffer) => {
    ipcRenderer.send('recording:chunk-ready', meta, buffer);
  },
});