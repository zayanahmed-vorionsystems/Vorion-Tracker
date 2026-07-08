// agent/src/main.ts  — Electron main process
import * as dotenv from 'dotenv';
import path from 'path';
// Load agent .env as early as possible so service keys are available
dotenv.config({ path: path.join(__dirname, '..', '.env') });
console.log('[AGENT] env load check', {
  SUPABASE_URL: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
  SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
});
import { app } from 'electron';
import {
   BrowserWindow, Tray, Menu, nativeImage,
  ipcMain, powerMonitor, desktopCapturer, screen, shell, dialog
} from 'electron';
dotenv.config({ path: path.join(__dirname, '..', '.env') });
import fs     from 'fs';
import os     from 'os';
import https  from 'https';
import http   from 'http';
// FIX: teardownLiveWatch must be imported from './live-watch' — the real
// implementation there calls supabaseClient.removeChannel(liveChannel).
// A local no-op function with the same name used to be declared further
// down in this file, which shadowed this import and meant the real channel
// was never torn down on stopTracking()/logout, leaving an orphaned,
// still-subscribed channel behind every time.
import { setupLiveWatch, teardownLiveWatch } from './live-watch';
import type { IncomingMessage } from 'http';
import { syncProxyBlock, removeProxyBlock } from './websiteBlock';

// ─── Config ────────────────────────────────────────────────────────────────
const isDev      = !app.isPackaged;
const SERVER_URL = process.env.WORKTRACK_SERVER || process.env.NEXT_PUBLIC_APP_URL || (isDev ? 'http://127.0.0.1:3000' : 'https://vorion-tracker-rosy.vercel.app/');

// ─── Persistent store ──────────────────────────────────────────────────────
const DATA_DIR   = app.getPath('userData');
const STORE_PATH = path.join(DATA_DIR, 'worktrack-store.json');

function readStore(): Record<string,any> {
  try { return JSON.parse(fs.readFileSync(STORE_PATH,'utf8')); } catch { return {}; }
}
function writeStore(data: Record<string,any>) {
  fs.mkdirSync(DATA_DIR,{recursive:true});
  fs.writeFileSync(STORE_PATH, JSON.stringify(data,null,2));
}
function get(key:string)        { return readStore()[key]; }
function set(key:string,val:any){ writeStore({...readStore(),[key]:val}); }

function getEmployeeIdFromUser(user: any): string {
  const candidate = user?.id || user?.employeeId || user?.employee_id || user?.userId || user?.employee?.id || user?.employee?.employeeId || user?.employee?.employee_id || '';
  return String(candidate || '').trim();
}

function persistSessionIdentity(nextToken?: string, nextUserName?: string, nextEmployeeId?: string) {
  if (typeof nextToken === 'string') {
    token = nextToken;
    set('token', token);
  }
  if (typeof nextUserName === 'string') {
    userName = nextUserName;
    set('userName', userName);
  }
  if (typeof nextEmployeeId === 'string') {
    employeeId = nextEmployeeId;
    set('employeeId', employeeId);
  }
}

// ─── State ─────────────────────────────────────────────────────────────────
let tray:        Tray|null          = null;
let mainWindow:  BrowserWindow|null = null;
let token:       string             = get('token') || '';
let userName:    string             = get('userName') || '';
let employeeId:  string             = get('employeeId') || '';
let sessionId:   string             = '';
let agentId:     string             = get('agentId') || `agent-${Math.random().toString(36).slice(2,10)}`;
let status:      'offline'|'active'|'break'|'idle' = 'offline';
let tracking     = false;
let ssInterval:         NodeJS.Timeout|null = null;
let idleInterval:       NodeJS.Timeout|null = null;
let heartbeatInterval:  NodeJS.Timeout|null = null;
let policyInterval:     NodeJS.Timeout|null = null;
let scanInterval:       NodeJS.Timeout|null = null;
let policySyncInterval: NodeJS.Timeout|null = null;
let captureIntervalSec = parseInt(get('captureIntervalSec')||'2');
let lastActiveApp    = 'Unknown';
let lastActivityPct  = 100;
let cachedPolicy:         any   = null;
let cachedBlockedApps:    any[] = [];
let cachedBlockedWebsites:any[] = [];
let policySyncInFlight = false;
// tracks which blocked domains we've already reported recently, to avoid spamming events
const recentlyReportedDomains = new Map<string, number>();
set('agentId', agentId);

// ─── Live streaming state (WebRTC) ──────────────────────────────────────────
let streamWindow: BrowserWindow | null = null;
const activeWatchers = new Set<string>();

// ─── Single instance lock ───────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => mainWindow?.show());

// ─── Auto-start with OS ────────────────────────────────────────────────────
app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });

// ─── HTTP helper ────────────────────────────────────────────────────────────
class HttpError extends Error {
  status: number;
  constructor(message:string, status:number) { super(message); this.status = status; }
}

function apiRequest(method:string, path:string, body?:any, isFormData=false): Promise<any> {
  return new Promise((resolve,reject) => {
    const url  = new URL(path, SERVER_URL);
    const mod  = url.protocol==='https:'?https:http;
    const data = body && !isFormData ? Buffer.from(JSON.stringify(body)) : body;
    const headers: Record<string,string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body && !isFormData) { headers['Content-Type']='application/json'; headers['Content-Length']=String(data.length); }
    if (isFormData && body?.getHeaders) Object.assign(headers, body.getHeaders());
    const req = (mod as any).request({ hostname:url.hostname, port:url.port||undefined, path:url.pathname+url.search, method, headers }, (res: IncomingMessage) => {
      let raw = '';
      res.on('data', (chunk: Buffer) => raw += chunk);
      res.on('end', () => {
        const status = res.statusCode || 0;
        if (!raw) {
          if (status >= 200 && status < 300) return resolve({});
          return reject(new Error(`Request failed ${status}`));
        }
        try {
          const parsed = JSON.parse(raw);
          if (status >= 200 && status < 300) return resolve(parsed);
          return reject(new HttpError(parsed?.error || `Request failed ${status}`, status));
        } catch {
          if (status >= 200 && status < 300) return resolve(raw);
          return reject(new HttpError(`Request failed ${status}: ${raw}`, status));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function apiFormRequest(path:string, form:any) {
  const url = new URL(path, SERVER_URL);
  const headers: Record<string,string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res  = await fetch(url.toString(), { method:'POST', headers, body: form });
  const body = await res.text();
  if (!body) { if (res.ok) return {}; throw new Error(`Request failed ${res.status}`); }
  const parsed = JSON.parse(body);
  if (!res.ok) throw new Error(parsed?.error || `Request failed ${res.status}`);
  return parsed;
}

async function sessionAction(action:string, payload: Record<string, any> = {}) {
  if (!token) throw new Error('Not authenticated');
  return apiRequest('POST', '/api/sessions', { action, ...payload });
}

async function startSession() {
  if (!token || sessionId) return;
  try {
    const response = await sessionAction('start');
    sessionId = response.sessionId || sessionId;
  } catch (err:any) {
    console.error('Failed to start session:', err?.message || err);
  }
}

async function endSession() {
  if (!token) return;
  try {
    const payload = sessionId ? { sessionId } : {};
    await sessionAction('checkout', payload);
  } catch (err:any) {
    console.error('Failed to end session:', err?.message || err);
  } finally {
    sessionId = '';
  }
}

async function uploadScreenshot(pngBuf: Buffer, activeApp:string, actPct:number, capturedAt:string) {
  if (!token) return;
  try {
    const form = new FormData();
    const file = new File([new Uint8Array(pngBuf)], `screenshot-${Date.now()}.png`, { type: 'image/png' });
    form.append('screenshot', file);
    form.append('activeApp', activeApp);
    form.append('activityPct', String(actPct));
    form.append('capturedAt', capturedAt);
    if (sessionId) form.append('sessionId', sessionId);
    await apiFormRequest('/api/screenshots', form);
  } catch (err:any) {
    console.error('Failed to upload screenshot:', err?.message || err);
  }
}

// ─── Alerts ────────────────────────────────────────────────────────────────
function getStoredAlerts(): any[] { return get('alerts') || []; }
function setStoredAlerts(alerts: any[]) { set('alerts', alerts); }

function normalizeAlertRecord(raw: any) {
  return {
    id: String(raw?.id || raw?.alert_id || ''),
    title: String(raw?.title ?? raw?.message ?? 'Untitled alert'),
    description: String(raw?.description ?? raw?.message ?? ''),
    severity: String(raw?.severity ?? 'medium'),
    sentAt: raw?.sent_at || raw?.created_at || new Date().toISOString(),
    isRead: Boolean(raw?.is_read ?? raw?.isRead),
    alertType: raw?.alert_type || raw?.alertType || null,
    metadata: raw?.metadata || raw?.meta || null,
    fromUserId: raw?.from_user_id || raw?.fromUserId || null,
  };
}

function mergeAlerts(localAlerts:any[], serverAlerts:any[]) {
  const map = new Map<string, any>();
  serverAlerts.forEach((item:any) => { const n = normalizeAlertRecord(item); map.set(n.id, n); });
  localAlerts.forEach((item:any) => {
    if (!item?.id) return;
    const existing = map.get(item.id);
    if (existing) { existing.isRead = existing.isRead || Boolean(item.isRead); }
    else { map.set(item.id, { ...normalizeAlertRecord(item) }); }
  });
  return Array.from(map.values()).sort((a,b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
}

async function syncAlertsWithServer() {
  if (!token) return getStoredAlerts();
  try {
    const serverAlerts = await apiRequest('GET', '/api/alerts');
    const merged = mergeAlerts(getStoredAlerts(), serverAlerts || []);
    setStoredAlerts(merged);
    return merged;
  } catch (err:any) {
    console.error('Alert sync failed:', err?.message || err);
    return getStoredAlerts();
  }
}

async function persistAlert(raw: any) {
  const alert = normalizeAlertRecord(raw);
  const alerts = getStoredAlerts();
  const exists = alerts.find((item:any) => item.id === alert.id);
  let nextAlerts = exists
    ? alerts.map((item:any) => item.id === alert.id ? { ...item, ...alert } : item)
    : [alert, ...alerts];
  nextAlerts = nextAlerts.sort((a:any,b:any) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
  setStoredAlerts(nextAlerts);
  return alert;
}

async function markAlertRead(id:string) {
  const existingAlerts = getStoredAlerts();
  const updatedAlerts  = existingAlerts.map((alert:any) => alert.id === id ? { ...alert, isRead:true } : alert);
  setStoredAlerts(updatedAlerts);
  if (!token) return updatedAlerts.find((alert:any) => alert.id === id) || null;
  try {
    const updated    = await apiRequest('PATCH', `/api/alerts/${id}/read`);
    const normalized = normalizeAlertRecord(updated);
    const finalAlerts = updatedAlerts.map((alert:any) => alert.id === id ? { ...alert, ...normalized, isRead:true } : alert);
    setStoredAlerts(finalAlerts);
    return finalAlerts.find((alert:any) => alert.id === id) || null;
  } catch (err:any) {
    console.error('Failed to sync read alert state:', err?.message || err);
    return updatedAlerts.find((alert:any) => alert.id === id) || null;
  }
}

// ─── Policy sync ────────────────────────────────────────────────────────────
async function syncPolicies() {
  if (!token) return;
  if (policySyncInFlight) return;
  policySyncInFlight = true;
  try {
    const [policyResponse, blockedAppsResponse, blockedWebsitesResponse] = await Promise.all([
      apiRequest('GET', '/api/security/policies'),
      apiRequest('GET', '/api/blocked/apps'),
      apiRequest('GET', '/api/blocked/websites'),
    ]);

    const nextPolicy          = policyResponse ?? null;
    const nextBlockedApps     = Array.isArray(blockedAppsResponse)     ? blockedAppsResponse     : [];
    const nextBlockedWebsites = Array.isArray(blockedWebsitesResponse) ? blockedWebsitesResponse : [];

    const changed =
      JSON.stringify(cachedPolicy)          !== JSON.stringify(nextPolicy) ||
      JSON.stringify(cachedBlockedApps)     !== JSON.stringify(nextBlockedApps) ||
      JSON.stringify(cachedBlockedWebsites) !== JSON.stringify(nextBlockedWebsites);

    // ✅ Pehle update karo, phir proxy sync karo (naye data ke sath)
    cachedPolicy          = nextPolicy;
    cachedBlockedApps     = nextBlockedApps;
    cachedBlockedWebsites = nextBlockedWebsites;

    console.log('[SECURITY] Policies downloaded');
    console.log('[SECURITY] Blocked apps:', cachedBlockedApps.length);
    console.log('[SECURITY] Blocked websites:', cachedBlockedWebsites.length);
    console.log(changed ? 'Policy sync succeeded and updated in-memory policy data' : 'Policy sync succeeded');

    // ✅ Sirf ek baar, naye cache ke sath
    await syncProxyBlock(cachedPolicy, cachedBlockedWebsites);
  } catch (err:any) {
    console.error('[SECURITY] Policy sync failed:', err?.message || err);
  } finally {
    policySyncInFlight = false;
  }
}

async function enforcePolicies() {
  if (!token) return;
  try { await syncPolicies(); }
  catch (err:any) { console.error('[SECURITY] enforcePolicies error:', err?.message || err); }
}

// ─── Security event reporting ───────────────────────────────────────────────
async function submitSecurityEvent(eventType:string, value:string, actionTaken:string) {
  if (!token) return;
  const payload = { employeeId: employeeId || undefined, computerName: os.hostname(), eventType, value, actionTaken };
  let lastError: any;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await apiRequest('POST', '/api/security/events', payload);
      console.log('Security event reported', { eventType, value, actionTaken, attempt });
      return;
    } catch (err:any) {
      lastError = err;
      const s = typeof err?.status === 'number' ? err.status : 0;
      const shouldRetry = s === 0 || (s >= 500 && s < 600);
      if (!shouldRetry || attempt === 3) {
        console.error('Failed to submit security event:', err?.message || err);
        return;
      }
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  if (lastError) console.error('Security event submission failed:', lastError?.message || lastError);
}

function normalizeProcessName(name:string) {
  return (name || '').trim().toLowerCase().replace(/\.exe$/i, '');
}

// ─── Website scan (detection + reporting only — PAC proxy does the actual blocking) ──
async function scanBlockedWebsites() {
  if (!token || !cachedPolicy || !cachedPolicy.blockWebsites || !cachedBlockedWebsites.length) return;
  try {
    const { default: activeWin } = await import('active-win');
    const win       = await activeWin();
    const ownerName = (win?.owner?.name || '').toLowerCase();
    const title     = win?.title || '';
    console.log('[SECURITY] [DEBUG] owner.name=', JSON.stringify(win?.owner?.name), 'title=', JSON.stringify(title));

    const isBrowser = ['chrome', 'msedge', 'edge', 'firefox', 'brave'].some((b) => ownerName.includes(b));
    if (!isBrowser || !title) { console.log('[SECURITY] [DEBUG] Not recognized as browser, skipping'); return; }

    console.log('[SECURITY] Active browser window title:', title);

    const blockedDomains = cachedBlockedWebsites
      .filter((item: any) => item?.enabled)
      .map((item: any) => (item.domain || '').toLowerCase().replace(/^www\./, ''))
      .filter(Boolean);

    if (!blockedDomains.length) return;

    const lowerTitle = title.toLowerCase();
    const matchedDomain = blockedDomains.find((domain: string) => {
      const brand = domain.split('.')[0];
      return lowerTitle.includes(domain) || (brand.length > 2 && lowerTitle.includes(brand));
    });

    if (!matchedDomain) { console.log('[SECURITY] No violations found'); return; }

    console.log('[SECURITY] 🚨 Blocked website attempt detected:', matchedDomain, '(title:', title, ')');

    // Report once per domain per 5-minute window — avoid spamming
    const now           = Date.now();
    const lastReportedAt = recentlyReportedDomains.get(matchedDomain) || 0;
    if (now - lastReportedAt > 5 * 60 * 1000) {
      recentlyReportedDomains.set(matchedDomain, now);
      await submitSecurityEvent('blocked_website', matchedDomain, 'proxy_blocked');
    }
  } catch (err: any) {
    console.error('[SECURITY] Blocked website scan error:', err?.message || err);
  }
}

// ─── App scan ───────────────────────────────────────────────────────────────
async function scanBlockedApps() {
  if (!token || !cachedPolicy || !cachedBlockedApps.length) return;
  try {
    const { exec } = await import('child_process');
    const output = await new Promise<string>((resolve, reject) => {
      exec('wmic process get Name /FORMAT:CSV', { maxBuffer: 1024 * 1024 * 10 },
        (error, stdout) => error ? reject(error) : resolve(stdout));
    });
    const runningProcesses = output.split(/\r?\n/).map((l:string) => l.trim()).filter(Boolean)
      .map((l:string) => { const parts = l.split(','); return parts[parts.length - 1]?.trim() || ''; })
      .filter((n:string) => n && n !== 'Name');

    const blockedNames = cachedBlockedApps
      .filter((item: any) => item?.enabled)
      .map((item: any) => normalizeProcessName(item.processName || ''))
      .filter(Boolean);

    console.log(`[SECURITY] Running processes count: ${runningProcesses.length}`);
    console.log(`[SECURITY] Blocked process names: ${blockedNames.join(', ')}`);
    if (!blockedNames.length) return;

    let violationFound = false;
    for (const processName of runningProcesses) {
      const np = normalizeProcessName(processName);
      if (!np || !blockedNames.includes(np)) continue;
      violationFound = true;
      console.log(`[SECURITY] 🚨 Found blocked process: ${processName}`);
      if (cachedPolicy.showWarning) {
        dialog.showMessageBoxSync({ type:'warning', title:'Blocked Application', message:`"${processName}" is blocked by your organization and will be closed.` });
      }
      if (cachedPolicy.killProcess) {
        await new Promise<void>((resolve) => { exec(`taskkill /F /IM "${processName}"`, () => resolve()); });
        console.log(`[SECURITY] ✅ Process terminated: ${processName}`);
      }
      await submitSecurityEvent('blocked_app', np, cachedPolicy.killProcess ? 'terminated' : 'warning_shown');
    }
    if (!violationFound) console.log('[SECURITY] No violations found');
  } catch (err: any) {
    console.error('[SECURITY] Blocked app scan error:', err?.message || err);
  }
}

// ─── Live streaming (WebRTC) ────────────────────────────────────────────────
// A hidden BrowserWindow does the actual screen capture + RTCPeerConnection
// work, because RTCPeerConnection / getUserMedia only exist in a renderer
// (Chromium) context, not in this Node.js main process.

function ensureStreamWindow(): BrowserWindow {
  if (streamWindow && !streamWindow.isDestroyed()) return streamWindow;

  streamWindow = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    webPreferences: {
      preload: path.join(__dirname, 'streamPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const streamHtml = isDev
    ? path.join(__dirname, '../assets/stream/stream.html')
    : path.join(process.resourcesPath, 'assets', 'stream', 'stream.html');

  streamWindow.loadFile(streamHtml).catch((err) => console.error('Failed to load stream window:', err));
  streamWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('Stream window renderer crashed:', details);
    streamWindow = null;
  });

  return streamWindow;
}

async function handleWatchRequest(watcherId: string) {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
    if (!sources.length) { console.error('No screen sources available for streaming'); return; }
    const sourceId = sources[0].id;

    const win = ensureStreamWindow();
    activeWatchers.add(watcherId);

    const send = () => win.webContents.send('stream:start', { watcherId, sourceId });
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send);
    else send();
  } catch (err: any) {
    console.error('Failed to start stream for watcher', watcherId, err?.message || err);
  }
}

function handleStopWatching(watcherId: string) {
  activeWatchers.delete(watcherId);
  streamWindow?.webContents.send('stream:stop', { watcherId });

  if (activeWatchers.size === 0 && streamWindow && !streamWindow.isDestroyed()) {
    // No one is watching anymore — close the hidden capture window to free resources.
    streamWindow.close();
    streamWindow = null;
  }
}

function closeAllStreams() {
  activeWatchers.forEach((watcherId) => streamWindow?.webContents.send('stream:stop', { watcherId }));
  activeWatchers.clear();
  if (streamWindow && !streamWindow.isDestroyed()) streamWindow.close();
  streamWindow = null;
}

// ─────────────────────────────────────────────────────────────────────────
// FIX: previously `liveWatchStarted = true` was set unconditionally, before
// checking whether `employeeId` was actually populated yet. Because
// employeeId is restored asynchronously (via the GET /api/auth call in
// app.whenReady()), it's very possible for startTracking() -> initializeSocket()
// to run once with employeeId still '' — the `if (employeeId)` guard would
// skip setupLiveWatch(), but the flag was already latched to `true`, so
// every subsequent call became a permanent no-op. The live-watch channel
// then never got created for the rest of that process's life, even after
// employeeId became available moments later.
//
// Now we only latch `liveWatchStarted` once we've actually called
// setupLiveWatch() with a real employeeId, so a call made too early can be
// safely retried later (e.g. once boot-time identity restore finishes, or
// the next time startTracking() runs).
// ─────────────────────────────────────────────────────────────────────────
let liveWatchStarted = false;

async function initializeSocket() {
  if (liveWatchStarted) return;
  if (!employeeId) {
    console.warn('[AGENT] initializeSocket called before employeeId was available — will retry once identity is known');
    return;
  }
  liveWatchStarted = true;
  console.log('[AGENT] setupLiveWatch called from main.ts', { employeeId });
  setupLiveWatch(employeeId);
}

console.log('WorkTrack agent using SERVER_URL=', SERVER_URL);

function broadcastStatus(extra: Record<string, any> = {}) {
  const payload = { agentId, employeeId, userName, status, sessionId, activeApp: lastActiveApp, activityPct: lastActivityPct, heartbeat: new Date().toISOString(), capturedAt: new Date().toISOString(), ...extra };
  mainWindow?.webContents.send('status-changed', payload);
}

async function sendHeartbeat() {
  if (!token) return;
  try {
    await apiRequest('POST', '/api/heartbeat', { currentApp: lastActiveApp, activityPct: lastActivityPct, status, timestamp: new Date().toISOString() });
  } catch (err:any) { console.error('Heartbeat failed:', err?.message || err); }
}

function getScreenshotTargetSize() {
  // Always capture screenshots at the fixed resolution requested by the user.
  return { width: 1280, height: 720 };
}

async function captureAndUpload() {
  if (!tracking) return;
  try {
    const { width, height } = getScreenshotTargetSize();
    const sources = await desktopCapturer.getSources({ types:['screen'], thumbnailSize:{ width, height } });
    if (!sources.length) return;
    const resizedThumbnail = sources[0].thumbnail.resize({ width, height });
    const pngBuf = resizedThumbnail.toPNG();
    const screenshotBase64 = pngBuf.toString('base64');
    const capturedAt       = new Date().toISOString();
    let activeApp = 'Unknown';
    try { const { default: activeWin } = await import('active-win'); const w = await activeWin(); activeApp = w?.owner?.name || w?.title?.split(' — ')[0] || 'Unknown'; } catch {}
    const idleSec = powerMonitor.getSystemIdleTime();
    const actPct  = Math.max(0, Math.min(100, Math.round(100 - (idleSec / 60) * 100)));
    lastActiveApp   = activeApp;
    lastActivityPct = actPct;
    mainWindow?.webContents.send('screenshot-taken', { time:new Date().toLocaleTimeString(), app:activeApp, pct:actPct });
    broadcastStatus({ screenshotBase64, activeApp, activityPct: actPct, capturedAt });
    await uploadScreenshot(pngBuf, activeApp, actPct, capturedAt);
  } catch(e) { console.error('Capture error:',e); }
}

// ─── Session management ─────────────────────────────────────────────────────
async function startTracking() {
  if (tracking) return;

  tracking = true;
  status = 'active';

  void initializeSocket();
  void startSession();

  ssInterval        = setInterval(captureAndUpload, captureIntervalSec * 1000);
  idleInterval      = setInterval(watchIdle, 2000);
  heartbeatInterval = setInterval(() => sendHeartbeat(), 30000);
  policyInterval    = setInterval(() => { void enforcePolicies(); }, 5000);
  scanInterval      = setInterval(() => { void scanBlockedApps(); void scanBlockedWebsites(); }, 2000);
  policySyncInterval = setInterval(() => { void syncPolicies(); }, 30000);

  void captureAndUpload();
  void sendHeartbeat();
  void syncPolicies();
  void scanBlockedApps();
  void scanBlockedWebsites();

  updateTray();
  mainWindow?.webContents.send('tracking-status',{ tracking:true, sessionId });
  broadcastStatus();
}

async function stopTracking() {
  if (!tracking) return;

  tracking = false;
  status = 'offline';

  void endSession();

  if (ssInterval) clearInterval(ssInterval);
  if (idleInterval) clearInterval(idleInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (policyInterval) clearInterval(policyInterval);
  if (scanInterval) clearInterval(scanInterval);
  if (policySyncInterval) clearInterval(policySyncInterval);

  teardownLiveWatch();
  closeAllStreams();

  updateTray();

  mainWindow?.webContents.send('tracking-status', {
      tracking:false
  });

  broadcastStatus();
}


async function watchIdle() {
  const idleSec = powerMonitor.getSystemIdleTime();
  const isIdle  = idleSec > 60;
  mainWindow?.webContents.send('idle-status',{ isIdle, idleSec });
  if (isIdle && status === 'active')  { status = 'idle';   broadcastStatus(); }
  if (!isIdle && status === 'idle')   { status = 'active'; broadcastStatus(); }
}

// ─── Tray ───────────────────────────────────────────────────────────────────
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: tracking ? `● Tracking — ${userName}` : '○ Not tracking', enabled:false },
    { type:'separator' },
    { label: tracking ? 'Stop tracking' : 'Start tracking', click:()=> tracking?stopTracking():startTracking() },
    { label: 'Open window', click:()=>mainWindow?.show() },
    { label: 'Open dashboard in browser', click:()=>shell.openExternal(SERVER_URL) },
    { type:'separator' },
    { label: 'Quit', click:()=>{ stopTracking(); app.exit(0); } },
  ]));
  tray.setToolTip(tracking?`WorkTrack — tracking ${userName}`:'WorkTrack — not tracking');
}

// ─── Window ─────────────────────────────────────────────────────────────────
async function createWindow() {
  mainWindow = new BrowserWindow({
    width:560, height:760, resizable:true,
    title:'Vorian Tracker Agent',
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false },
    show: true,
  });

  mainWindow.webContents.on('did-fail-load', (_, code, desc, url) => {
    console.log('LOAD FAILED:', code, desc, url);
  });
  mainWindow.webContents.on('render-process-gone', (_, details) => {
    console.log('RENDERER CRASHED:', details);
  });

  const indexPath = path.join(__dirname, 'renderer', 'index.html');
  const hasBuiltRenderer = fs.existsSync(indexPath);

  if (isDev) {
    try {
      await mainWindow.loadURL('http://localhost:5174');
      console.log('[AGENT] loaded renderer from Vite dev server');
    } catch (err) {
      console.warn('[AGENT] Vite dev server unavailable, falling back to built renderer', err);
      if (!hasBuiltRenderer) {
        console.error('[AGENT] built renderer not found', { indexPath });
        return;
      }
      console.log('[AGENT] loading renderer from built bundle', { indexPath });
      await mainWindow.loadFile(indexPath);
    }
  } else {
    console.log('Loading index from:', indexPath, '| exists:', hasBuiltRenderer);
    if (!hasBuiltRenderer) {
      console.error('[AGENT] built renderer not found', { indexPath });
      return;
    }
    await mainWindow.loadFile(indexPath);
  }

  mainWindow.on('close',(e)=>{ e.preventDefault(); mainWindow?.hide(); });
}

// ─── IPC ────────────────────────────────────────────────────────────────────
ipcMain.handle('login', async (_e, email:string, password:string) => {
  try {
    const res = await apiRequest('POST','/api/auth',{ email, password });
    if (!res?.token) throw new Error(res?.error || 'Login failed');

    const nextEmployeeId = getEmployeeIdFromUser(res?.user || res?.profile || null);
    const nextUserName = res?.user?.name || res?.user?.full_name || res?.user?.fullName || '';

    persistSessionIdentity(res.token, nextUserName, nextEmployeeId);

    if (!employeeId) {
      console.warn('[AUTH] Login response did not contain an employeeId', { responseKeys: Object.keys(res || {}) });
    }

    if (employeeId) {
      setupLiveWatch(employeeId);
      liveWatchStarted = true; // keep initializeSocket()'s latch in sync with this direct call
    }
    status = 'offline';
    mainWindow?.webContents.send('status-changed', { status, userName, employeeId });
    return { ok:true, user:res.user };
  } catch (error:any) {
    console.error('Login failed:', error);
    return { ok:false, error: error?.message || 'Login failed' };
  }
});
ipcMain.handle('logout', async () => {
  if (token) {
    try { await endSession(); await sessionAction('logout'); }
    catch (err:any) { console.error('Logout action failed:', err?.message || err); }
  }
  await stopTracking();
  token=''; userName=''; employeeId='';
  set('token',''); set('userName',''); set('employeeId','');
  status='offline';
  liveWatchStarted = false;     // safety net
  mainWindow?.webContents.send('status-changed',{ status:'offline' });
  mainWindow?.show();
  return { ok:true };
});
ipcMain.handle('get-status',       () => ({ tracking, status, sessionId, userName, captureIntervalSec, idleSec: powerMonitor.getSystemIdleTime(), startedAt: status !== 'offline' ? Date.now() : null }));
ipcMain.handle('get-alerts',       async () => getStoredAlerts());
ipcMain.handle('sync-alerts',      async () => syncAlertsWithServer());
ipcMain.handle('mark-alert-read',  async (_e, id:string) => markAlertRead(id));
ipcMain.handle('store-alert',      async (_e, alert:any) => { const saved = await persistAlert(alert); mainWindow?.webContents.send('new-alert', saved); return saved; });
ipcMain.handle('manual-shot',      () => captureAndUpload());
ipcMain.handle('stop-tracking',    () => stopTracking());
ipcMain.handle('start-tracking',   () => { status = 'active'; return startTracking(); });
ipcMain.handle('start-work',       async () => { status = 'active'; await startTracking(); return { ok: true }; });
ipcMain.handle('start-break',      async () => {
  status = 'break';
  if (ssInterval)        clearInterval(ssInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  await sessionAction('start_break', { sessionId });
  broadcastStatus();
  return { ok: true };
});
ipcMain.handle('end-break', async () => {
  status = 'active';
  await sessionAction('end_break', { sessionId });
  ssInterval        = setInterval(captureAndUpload, captureIntervalSec * 1000);
  heartbeatInterval = setInterval(() => sendHeartbeat(), 30000);
  broadcastStatus();
  return { ok: true };
});
ipcMain.handle('checkout', async () => { await endSession(); await stopTracking(); });
app.commandLine.appendSwitch('disable-features', 'DesktopCaptureUseDxgi');
// ─── Boot ────────────────────────────────────────────────────────────────────
app.whenReady().then(async ()=>{
  await createWindow();
  const iconPath = path.join(
    isDev ? path.join(__dirname,'../assets') : process.resourcesPath,
    process.platform==='win32'?'icon.ico':process.platform==='darwin'?'icon.icns':'icon.png'
  );
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(process.platform==='darwin' ? icon.resize({width:18,height:18}) : icon);
  tray.on('double-click',()=>mainWindow?.show());
  updateTray();
  mainWindow?.show();
  if (token) {
    try {
      const nextEmployeeId = getEmployeeIdFromUser(get('user') || null);
      const nextUserName = get('userName') || '';
      persistSessionIdentity(token, nextUserName, nextEmployeeId);
      console.log('[AUTH] restored session identity from local store', { employeeId, userName, hasToken: Boolean(token) });
      status = 'offline';
      mainWindow?.webContents.send('status-changed', { status, userName, employeeId });
      void initializeSocket();
    } catch {
      console.log('Stored token invalid/expired — clearing, user must log in again');
      token=''; userName=''; employeeId='';
      set('token',''); set('userName',''); set('employeeId','');
      status = 'offline';
      mainWindow?.webContents.send('status-changed', { status:'offline' });
    }

    void (async () => {
      try {
        const authRes = await apiRequest('GET', '/api/auth');
        const nextEmployeeId = getEmployeeIdFromUser(authRes?.user || authRes?.profile || null);
        const nextUserName = authRes?.user?.name || authRes?.user?.full_name || authRes?.user?.fullName || '';
        persistSessionIdentity(token, nextUserName, nextEmployeeId);
        console.log('[AUTH] refreshed session identity', { employeeId, userName, hasToken: Boolean(token) });
        mainWindow?.webContents.send('status-changed', { status, userName, employeeId });
        void initializeSocket();
      } catch {
        console.log('[AUTH] background auth refresh failed — keeping cached identity');
      }
    })();
  }
});

app.on('window-all-closed',()=>{ /* keep alive in tray */ });
app.on('before-quit',()=>{ tracking && stopTracking(); closeAllStreams(); removeProxyBlock(); });