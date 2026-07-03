import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('liveWatch', {
  onStartCapture: (cb: (data: { sourceId: string }) => void) =>
    ipcRenderer.on('start-capture', (_event, data) => cb(data)),

  onStopCapture: (cb: () => void) =>
    ipcRenderer.on('stop-capture', () => cb()),

  onRemoteAnswer: (cb: (data: { sdp: any }) => void) =>
    ipcRenderer.on('remote-answer', (_event, data) => cb(data)),

  onRemoteIceCandidate: (cb: (data: { candidate: any }) => void) =>
    ipcRenderer.on('remote-ice-candidate', (_event, data) => cb(data)),

  sendOffer: (sdp: any) =>
    ipcRenderer.send('live-watch:offer', { sdp }),

  sendIceCandidate: (candidate: any) =>
    ipcRenderer.send('live-watch:ice-candidate', { candidate }),
});