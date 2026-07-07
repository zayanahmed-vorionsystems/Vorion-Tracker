import { contextBridge, ipcRenderer } from 'electron';

console.log('[AGENT][4] preload loaded');

contextBridge.exposeInMainWorld('liveWatch', {
  onStartCapture: (cb: (data: { sourceId: string; adminId: string; offer?: any; requestId?: string }) => void) =>
    ipcRenderer.on('start-capture', (_event, data) => cb(data)),

  onStopCapture: (cb: (data?: { adminId?: string }) => void) =>
    ipcRenderer.on('stop-capture', (_event, data) => cb(data)),

  onRemoteAnswer: (cb: (data: { adminId: string; sdp: any; requestId?: string }) => void) =>
    ipcRenderer.on('remote-answer', (_event, data) => cb(data)),

  onRemoteIceCandidate: (cb: (data: { adminId: string; candidate: any; requestId?: string }) => void) =>
    ipcRenderer.on('remote-ice-candidate', (_event, data) => cb(data)),

  sendOffer: (adminId: string, sdp: any) =>
    ipcRenderer.send('live-watch:offer', { adminId, sdp }),

  sendAnswer: (adminId: string, sdp: any, requestId?: string) =>
    ipcRenderer.send('live-watch:answer', { adminId, sdp, requestId }),

  sendIceCandidate: (adminId: string, candidate: any, requestId?: string) =>
    ipcRenderer.send('live-watch:ice-candidate', { adminId, candidate, requestId }),

  sendReady: () =>
    ipcRenderer.send('live-watch:ready'),
});