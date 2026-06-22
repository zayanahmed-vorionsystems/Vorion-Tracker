// agent/src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('agent', {
  login:         (email:string,pw:string) => ipcRenderer.invoke('login',email,pw),
  logout:        ()                       => ipcRenderer.invoke('logout'),
  getStatus:     ()                       => ipcRenderer.invoke('get-status'),
  manualShot:    ()                       => ipcRenderer.invoke('manual-shot'),
  stopTracking:  ()                       => ipcRenderer.invoke('stop-tracking'),
  startTracking: ()                       => ipcRenderer.invoke('start-tracking'),
  setInterval:   (m:number)              => ipcRenderer.invoke('set-interval',m),
  onScreenshot:  (cb:(d:any)=>void)      => { ipcRenderer.on('screenshot-taken',(_,d)=>cb(d)); },
  onIdle:        (cb:(d:any)=>void)      => { ipcRenderer.on('idle-status',(_,d)=>cb(d)); },
  onTracking:    (cb:(d:any)=>void)      => { ipcRenderer.on('tracking-status',(_,d)=>cb(d)); },
});
