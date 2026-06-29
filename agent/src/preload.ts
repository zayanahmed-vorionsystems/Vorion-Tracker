// agent/src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('agent', {
  login:         (email:string,pw:string) => ipcRenderer.invoke('login',email,pw),
  logout:        ()                       => ipcRenderer.invoke('logout'),
  getStatus:     ()                       => ipcRenderer.invoke('get-status'),
  getAlerts:     ()                       => ipcRenderer.invoke('get-alerts'),
  syncAlerts:    ()                       => ipcRenderer.invoke('sync-alerts'),
  markAlertRead: (id:string)             => ipcRenderer.invoke('mark-alert-read', id),
  storeAlert:    (alert:any)             => ipcRenderer.invoke('store-alert', alert),
  manualShot:    ()                       => ipcRenderer.invoke('manual-shot'),
  stopTracking:  ()                       => ipcRenderer.invoke('stop-tracking'),
  startTracking: ()                       => ipcRenderer.invoke('start-tracking'),
  startWork:     ()                       => ipcRenderer.invoke('start-work'),
  startBreak:    ()                       => ipcRenderer.invoke('start-break'),
  endBreak:      ()                       => ipcRenderer.invoke('end-break'),
  checkout:      ()                       => ipcRenderer.invoke('checkout'),
  onStatus:      (cb:(d:any)=>void)      => { ipcRenderer.on('status-changed',(_,d)=>cb(d)); },
  onIdle:        (cb:(d:any)=>void)      => { ipcRenderer.on('idle-status',(_,d)=>cb(d)); },
  onAlert:       (cb:(d:any)=>void)      => { ipcRenderer.on('new-alert',(_,d)=>cb(d)); },
});
