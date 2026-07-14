// agent/src/main.ts  — Electron main process
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
// Main-process deps must stay above bootstrap code so CommonJS emits them before use.
import { app } from 'electron';
import {
   BrowserWindow, Tray, Menu, nativeImage,
  ipcMain, powerMonitor, desktopCapturer, screen, shell, dialog, safeStorage
} from 'electron';
import os from 'os';
import https from 'https';
import http from 'http';
import { EMBEDDED_ENV } from './embedded-config';

function getAncestorEnvCandidates(baseDir: string) {
  if (!baseDir) return [];

  const candidates: string[] = [];
  let currentDir = path.resolve(baseDir);

  for (let depth = 0; depth < 4; depth += 1) {
    candidates.push(path.join(currentDir, '.env.local'));
    candidates.push(path.join(currentDir, '.env'));

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return candidates;
}

function loadAgentEnv() {
  // Packaged builds carry generated embedded configuration. Loading .env files
  // from the launch directory lets an unrelated local file redirect credentials.
  if (app.isPackaged) return;

  const portableExecutableDir = process.env.PORTABLE_EXECUTABLE_DIR || '';
  const executableDir = process.execPath ? path.dirname(process.execPath) : '';
  const cwd = process.cwd();
  const candidatePaths = [
    ...getAncestorEnvCandidates(portableExecutableDir),
    ...getAncestorEnvCandidates(executableDir),
    ...getAncestorEnvCandidates(cwd),
    path.resolve(__dirname, '..', '.env.local'),
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '..', '..', '.env.local'),
    path.resolve(__dirname, '..', '..', '.env'),
  ].filter((candidatePath, index, allPaths) => Boolean(candidatePath) && allPaths.indexOf(candidatePath) === index);

  for (const candidatePath of candidatePaths) {
    if (!fs.existsSync(candidatePath)) continue;
    dotenv.config({ path: candidatePath });
  }
}

function normalizeServerUrl(rawValue?: string | null) {
  const trimmedValue = String(rawValue || '').trim();
  if (!trimmedValue) return '';

  const withProtocol = /^[a-z]+:\/\//i.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`;

  try {
    const normalizedUrl = new URL(withProtocol);
    normalizedUrl.pathname = normalizedUrl.pathname === '/' ? '/' : `${normalizedUrl.pathname.replace(/\/+$/, '')}/`;
    return normalizedUrl.toString();
  } catch {
    return '';
  }
}

function isLocalServerUrl(rawValue?: string | null) {
  const normalizedValue = normalizeServerUrl(rawValue);
  if (!normalizedValue) return false;

  try {
    const { hostname } = new URL(normalizedValue);
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
  } catch {
    return false;
  }
}

function setupFileLogging() {
  try {
    const portableExecutableDir = process.env.PORTABLE_EXECUTABLE_DIR || '';
    const executableDir = process.execPath ? path.dirname(process.execPath) : '';
    const cwd = process.cwd();
    const logDir = portableExecutableDir || executableDir || cwd;
    if (!logDir) return;

    const logPath = path.join(logDir, 'agent-debug.log');
    const append = (level: 'LOG' | 'WARN' | 'ERROR', args: unknown[]) => {
      try {
        const line = `[${new Date().toISOString()}] [${level}] ${args.map((arg) => {
          if (arg instanceof Error) return arg.stack || arg.message;
          if (typeof arg === 'string') return arg;
          try { return JSON.stringify(arg); } catch { return String(arg); }
        }).join(' ')}\n`;
        fs.appendFileSync(logPath, line, 'utf8');
      } catch {
        // Keep normal console behavior if file logging fails.
      }
    };

    const originalLog = console.log.bind(console);
    const originalWarn = console.warn.bind(console);
    const originalError = console.error.bind(console);

    console.log = (...args: unknown[]) => {
      append('LOG', args);
      originalLog(...args);
    };
    console.warn = (...args: unknown[]) => {
      append('WARN', args);
      originalWarn(...args);
    };
    console.error = (...args: unknown[]) => {
      append('ERROR', args);
      originalError(...args);
    };

    console.log('[AGENT] file logging enabled', { logPath });
  } catch {
    // Ignore logging bootstrap failures.
  }
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.stack || error.message;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

loadAgentEnv();
setupFileLogging();
process.on('uncaughtException', (error) => {
  console.error('[AGENT] uncaughtException', formatError(error));
});
process.on('unhandledRejection', (reason) => {
  console.error('[AGENT] unhandledRejection', formatError(reason));
});
console.log('[AGENT] env load check', {
  SERVER_URL: Boolean(process.env.WORKTRACK_SERVER || process.env.NEXT_PUBLIC_APP_URL || EMBEDDED_ENV.WORKTRACK_SERVER || EMBEDDED_ENV.NEXT_PUBLIC_APP_URL),
  LIVEKIT_URL: Boolean(process.env.LIVEKIT_URL || EMBEDDED_ENV.LIVEKIT_URL),
});
// FIX: teardownLiveWatch must be imported from './live-watch' — the real
// A local no-op function with the same name used to be declared further
// down in this file, which shadowed this import and meant the real channel
// was never torn down on stopTracking()/logout, leaving an orphaned,
// still-subscribed channel behind every time.
import { setupLiveWatch, teardownLiveWatch } from './live-watch';
import type { IncomingMessage } from 'http';
import { syncProxyBlock, removeProxyBlock } from './websiteBlock';

// ─── Config ────────────────────────────────────────────────────────────────
const isDev = !app.isPackaged;
const configuredServerUrl = process.env.WORKTRACK_SERVER || process.env.NEXT_PUBLIC_APP_URL || EMBEDDED_ENV.WORKTRACK_SERVER || EMBEDDED_ENV.NEXT_PUBLIC_APP_URL || '';
const fallbackServerUrl = isDev ? 'http://127.0.0.1:3000/' : 'https://tracker.vorionsystems.com/';
const SERVER_URL = (() => {
  const normalizedConfiguredUrl = normalizeServerUrl(configuredServerUrl);

  if (!normalizedConfiguredUrl) return fallbackServerUrl;
  if (!isDev && isLocalServerUrl(normalizedConfiguredUrl)) return 'https://tracker.vorionsystems.com/';
  if (!isDev && new URL(normalizedConfiguredUrl).protocol !== 'https:') {
    console.warn('[AGENT] refusing non-HTTPS server URL in packaged build');
    return 'https://tracker.vorionsystems.com/';
  }

  return normalizedConfiguredUrl;
})();

// ─── Persistent store ──────────────────────────────────────────────────────
const DATA_DIR   = app.getPath('userData');
const STORE_PATH = path.join(DATA_DIR, 'worktrack-store.json');

function readStore(): Record<string,any> {
  try { return JSON.parse(fs.readFileSync(STORE_PATH,'utf8')); } catch { return {}; }
}
function writeStore(data: Record<string,any>) {
  fs.mkdirSync(DATA_DIR,{recursive:true});
  fs.writeFileSync(STORE_PATH, JSON.stringify(data,null,2), { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(STORE_PATH, 0o600); } catch {}
}
function get(key:string)        { return readStore()[key]; }
function set(key:string,val:any){ writeStore({...readStore(),[key]:val}); }
function remove(key:string) {
  const data = readStore();
  delete data[key];
  writeStore(data);
}

function storeAuthToken(nextToken: string) {
  token = nextToken;
  if (!nextToken) {
    remove('token');
    remove('tokenEncrypted');
    return;
  }

  if (safeStorage.isEncryptionAvailable()) {
    set('tokenEncrypted', safeStorage.encryptString(nextToken).toString('base64'));
    remove('token');
    return;
  }

  // Preserve compatibility on Linux desktops without a secret service while
  // restricting the fallback file to the current OS user.
  console.warn('[AUTH] OS credential encryption unavailable; using a user-only token file');
  set('token', nextToken);
  remove('tokenEncrypted');
}

function loadStoredAuthToken() {
  const encrypted = get('tokenEncrypted');
  if (typeof encrypted === 'string' && encrypted) {
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch (error) {
      console.warn('[AUTH] encrypted token could not be decrypted; clearing it', formatError(error));
      remove('tokenEncrypted');
    }
  }

  const legacyToken = get('token');
  if (typeof legacyToken !== 'string' || !legacyToken) return '';
  storeAuthToken(legacyToken);
  return legacyToken;
}

function getEmployeeIdFromUser(user: any): string {
  const candidate = user?.id || user?.employeeId || user?.employee_id || user?.userId || user?.employee?.id || user?.employee?.employeeId || user?.employee?.employee_id || '';
  return String(candidate || '').trim();
}

function persistSessionIdentity(nextToken?: string, nextUserName?: string, nextEmployeeId?: string) {
  if (typeof nextToken === 'string') {
    storeAuthToken(nextToken);
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
let token:       string             = '';
let userName:    string             = get('userName') || '';
let employeeId:  string             = get('employeeId') || '';
let sessionId:   string             = '';
let agentId:     string             = get('agentId') || `agent-${Math.random().toString(36).slice(2,10)}`;
let status:      'offline'|'active'|'break'|'idle' = 'offline';
let tracking     = false;
let isQuitting   = false;
let allowImmediateQuit = false;
let quitInFlight: Promise<void> | null = null;
let ssInterval:         NodeJS.Timeout|null = null;
let idleInterval:       NodeJS.Timeout|null = null;
let heartbeatInterval:  NodeJS.Timeout|null = null;
let policyInterval:     NodeJS.Timeout|null = null;
let scanInterval:       NodeJS.Timeout|null = null;
let policySyncInterval: NodeJS.Timeout|null = null;
let captureIntervalSec = parseInt(get('captureIntervalSec')||'5');
let lastActiveApp    = 'Unknown';
let lastActivityPct  = 100;
let cachedPolicy:         any   = null;
let cachedBlockedApps:    any[] = [];
let cachedBlockedWebsites:any[] = [];
let policySyncInFlight = false;
// tracks which blocked domains we've already reported recently, to avoid spamming events
const recentlyReportedDomains = new Map<string, number>();
// tracks recently handled blocked processes, so repeated scans don't reopen the same warning dialog
const recentlyHandledProcesses = new Map<string, number>();
set('agentId', agentId);

function clearTimer(timer: NodeJS.Timeout | null) {
  if (timer) clearInterval(timer);
  return null;
}

async function requestGracefulQuit() {
  if (quitInFlight) return quitInFlight;

  quitInFlight = (async () => {
    isQuitting = true;

    try {
      if (tracking) {
        await stopTracking();
      } else {
        await teardownLiveWatch();
      }
    } catch (error) {
      console.error('[QUIT] graceful shutdown failed:', error);
    } finally {
      removeProxyBlock();
      tray?.destroy();
      tray = null;
      allowImmediateQuit = true;
      quitInFlight = null;
      app.quit();
    }
  })();

  return quitInFlight;
}

// ─── Live streaming state (WebRTC) ──────────────────────────────────────────

// ─── Single instance lock ───────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => mainWindow?.show());

// ─── Auto-start with OS ────────────────────────────────────────────────────
app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('no-pings');

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
    req.setTimeout(15000, () => {
      req.destroy(new Error('Request timed out'));
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
    await ensureLiveWatchRunning();
  } catch (err:any) {
    console.error('Failed to start session:', err?.message || err);
  }
}

async function ensureLiveWatchRunning() {
  if (!tracking || !token || !employeeId || !sessionId) return;

  try {
    await setupLiveWatch({
      employeeId,
      sessionId,
      authToken: token,
      serverUrl: SERVER_URL,
    });
  } catch (err:any) {
    console.error('Failed to start live watch:', err?.message || err);
  }
}

async function endSession() {
  if (!token) return;
  const sessionIdToClose = sessionId;
  try {
    const payload = sessionIdToClose ? { sessionId: sessionIdToClose } : {};
    await sessionAction('checkout', payload);
  } catch (err:any) {
    console.error('Failed to end session:', err?.message || err);
  } finally {
    await teardownLiveWatch({
      authToken: token,
      serverUrl: SERVER_URL,
      sessionId: sessionIdToClose,
      stopRoom: true,
    });
    sessionId = '';
  }
}

async function getActiveWindowSnapshot() {
  try {
    const activeWinModule = require('active-win');
    return await activeWinModule.default();
  } catch (err:any) {
    console.warn('[AGENT] active-win unavailable, foreground app detection disabled', err?.message || err);
    return null;
  }
}

async function getActiveAppName() {
  const activeWindow = await getActiveWindowSnapshot();
  return activeWindow?.owner?.name || activeWindow?.title?.split(' - ')[0] || 'Unknown';
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
    const win = await getActiveWindowSnapshot();
    if (!win) return;
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
    const { execFile } = await import('child_process');
    const output = await new Promise<string>((resolve, reject) => {
      execFile('wmic', ['process', 'get', 'Name', '/FORMAT:CSV'], { maxBuffer: 1024 * 1024 * 10 },
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

    const runningNormalized = new Set(
      runningProcesses
        .map((processName) => normalizeProcessName(processName))
        .filter(Boolean),
    );

    for (const processName of Array.from(recentlyHandledProcesses.keys())) {
      if (!runningNormalized.has(processName)) {
        recentlyHandledProcesses.delete(processName);
      }
    }

    let violationFound = false;
    for (const processName of runningProcesses) {
      const np = normalizeProcessName(processName);
      if (!np || !blockedNames.includes(np)) continue;
      const now = Date.now();
      if (recentlyHandledProcesses.has(np)) continue;

      violationFound = true;
      recentlyHandledProcesses.set(np, now);
      console.log(`[SECURITY] 🚨 Found blocked process: ${processName}`);
      if (cachedPolicy.showWarning) {
        dialog.showMessageBoxSync({
          type:'warning',
          title:'Blocked Application',
          message:`"${processName}" is blocked and was closed by Vorion Tracker.`,
        });
      }
      if (cachedPolicy.killProcess) {
        await new Promise<void>((resolve) => {
          execFile('taskkill', ['/F', '/IM', processName], () => resolve());
        });
        console.log(`[SECURITY] ✅ Process termination requested: ${processName}`);
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

console.log('WorkTrack agent using SERVER_URL=', SERVER_URL);
if (!isDev && configuredServerUrl && isLocalServerUrl(configuredServerUrl)) {
  console.warn('[AGENT] ignoring local-only server URL in packaged build', {
    configuredServerUrl,
    effectiveServerUrl: SERVER_URL,
  });
}

function broadcastStatus(extra: Record<string, any> = {}) {
  const payload = { agentId, employeeId, userName, status, sessionId, activeApp: lastActiveApp, activityPct: lastActivityPct, heartbeat: new Date().toISOString(), capturedAt: new Date().toISOString(), ...extra };
  mainWindow?.webContents.send('status-changed', payload);
}

async function sendHeartbeat() {
  if (!token) return;
  try {
    await apiRequest('POST', '/api/heartbeat', { currentApp: lastActiveApp, activityPct: lastActivityPct, status, timestamp: new Date().toISOString() });
    void ensureLiveWatchRunning();
  } catch (err:any) { console.error('Heartbeat failed:', err?.message || err); }
}

function getFriendlyRequestError(err: any) {
  const message = err?.message || String(err || 'Unknown error');
  if (!/ECONNREFUSED/i.test(message)) return message;

  if (isLocalServerUrl(SERVER_URL)) {
    return `Agent is configured to use ${SERVER_URL}. Update WORKTRACK_SERVER or NEXT_PUBLIC_APP_URL to your deployed domain and rebuild the agent.`;
  }

  return `Unable to reach ${SERVER_URL}. Confirm the deployed domain is online and accessible from this device.`;
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
    const activeApp = await getActiveAppName();
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

  await startSession();
  await ensureLiveWatchRunning();

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

  await endSession();

  ssInterval = clearTimer(ssInterval);
  idleInterval = clearTimer(idleInterval);
  heartbeatInterval = clearTimer(heartbeatInterval);
  policyInterval = clearTimer(policyInterval);
  scanInterval = clearTimer(scanInterval);
  policySyncInterval = clearTimer(policySyncInterval);

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
  if (isIdle && status === 'active')  {
    status = 'idle';
    broadcastStatus();
    void sendHeartbeat();
  }
  if (!isIdle && status === 'idle')   {
    status = 'active';
    broadcastStatus();
    void sendHeartbeat();
  }
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
    { label: 'Quit', click:()=>{ void requestGracefulQuit(); } },
  ]));
  tray.setToolTip(tracking?`Vorion Tracker — tracking ${userName}`:'Vorion Tracker — not tracking');
}

// ─── Window ─────────────────────────────────────────────────────────────────
async function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  const indexPath = path.join(__dirname, 'renderer', 'index.html');
  const iconPath = path.join(__dirname, 'renderer', 'logo.png');
  const hasPreload = fs.existsSync(preloadPath);
  const hasBuiltRenderer = fs.existsSync(indexPath);
  const hasIcon = fs.existsSync(iconPath);

  console.log('[AGENT] createWindow paths', {
    __dirname,
    preloadPath,
    hasPreload,
    indexPath,
    hasBuiltRenderer,
    iconPath,
    hasIcon,
  });

  mainWindow = new BrowserWindow({
    width:560, height:760, resizable:true,
    title:'Vorion Tracker',
    icon: hasIcon ? iconPath : undefined,
    autoHideMenuBar: true,
    backgroundColor: '#020304',
    webPreferences:{
      preload:preloadPath,
      contextIsolation:true,
      nodeIntegration:false,
      sandbox:true,
      spellcheck:false,
    },
    show: false,
  });

  mainWindow.webContents.on('did-fail-load', (_, code, desc, url) => {
    console.log('LOAD FAILED:', code, desc, url);
  });
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[AGENT] renderer finished load');
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log('[AGENT][renderer console]', { level, message, line, sourceId });
  });
  mainWindow.webContents.on('render-process-gone', (_, details) => {
    console.log('RENDERER CRASHED:', details);
  });
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (targetUrl !== mainWindow?.webContents.getURL()) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

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
      await mainWindow.loadURL(`data:text/html,${encodeURIComponent(`
        <html><body style="font-family:Segoe UI,sans-serif;padding:24px;background:#111827;color:#f8fafc">
          <h2>Vorion Tracker failed to start</h2>
          <p>Built renderer not found.</p>
          <pre>${indexPath}</pre>
        </body></html>
      `)}`);
      return;
    }
    try {
      await mainWindow.loadFile(indexPath);
    } catch (error) {
      console.error('[AGENT] failed to load built renderer', formatError(error));
      await mainWindow.loadURL(`data:text/html,${encodeURIComponent(`
        <html><body style="font-family:Segoe UI,sans-serif;padding:24px;background:#111827;color:#f8fafc">
          <h2>Vorion Tracker failed to load UI</h2>
          <p>${String(formatError(error)).replace(/[<>&]/g, '')}</p>
          <pre>${indexPath}</pre>
          <pre>${preloadPath}</pre>
        </body></html>
      `)}`);
    }
  }

  mainWindow.on('close', (event) => {
    if (isQuitting) return;

    if (tracking) {
      event.preventDefault();
      mainWindow?.hide();
      return;
    }

    isQuitting = true;
    tray?.destroy();
    tray = null;
  });
}

// ─── IPC ────────────────────────────────────────────────────────────────────
function assertMainRenderer(event: Electron.IpcMainInvokeEvent) {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
    throw new Error('Untrusted IPC sender');
  }
}

ipcMain.handle('login', async (event, email:string, password:string) => {
  assertMainRenderer(event);
  try {
    const res = await apiRequest('POST','/api/auth',{ email, password, context: 'agent' });
    if (!res?.token) throw new Error(res?.error || 'Login failed');

    const nextEmployeeId = getEmployeeIdFromUser(res?.user || res?.profile || null);
    const nextUserName = res?.user?.name || res?.user?.full_name || res?.user?.fullName || '';

    persistSessionIdentity(res.token, nextUserName, nextEmployeeId);

    if (!employeeId) {
      console.warn('[AUTH] Login response did not contain an employeeId', { responseKeys: Object.keys(res || {}) });
    }

    status = 'offline';
    mainWindow?.webContents.send('status-changed', { status, userName, employeeId });
    return { ok:true, user:res.user };
  } catch (error:any) {
    console.error('Login failed:', error);
    return { ok:false, error: getFriendlyRequestError(error) };
  }
});
ipcMain.handle('logout', async (event) => {
  assertMainRenderer(event);
  await stopTracking();

  if (token) {
    void sessionAction('logout').catch((err:any) => {
      console.error('Logout action failed:', err?.message || err);
    });
  }

  storeAuthToken(''); userName=''; employeeId='';
  set('userName',''); set('employeeId','');
  status='offline';
  mainWindow?.webContents.send('status-changed',{ status:'offline' });
  mainWindow?.show();
  return { ok:true };
});
ipcMain.handle('get-status',       (event) => { assertMainRenderer(event); return { tracking, status, sessionId, userName, captureIntervalSec, idleSec: powerMonitor.getSystemIdleTime(), startedAt: status !== 'offline' ? Date.now() : null }; });
ipcMain.handle('get-alerts',       async (event) => { assertMainRenderer(event); return getStoredAlerts(); });
ipcMain.handle('sync-alerts',      async (event) => { assertMainRenderer(event); return syncAlertsWithServer(); });
ipcMain.handle('mark-alert-read',  async (event, id:string) => { assertMainRenderer(event); return markAlertRead(id); });
ipcMain.handle('store-alert',      async (event, alert:any) => { assertMainRenderer(event); const saved = await persistAlert(alert); mainWindow?.webContents.send('new-alert', saved); return saved; });
ipcMain.handle('manual-shot',      (event) => { assertMainRenderer(event); return captureAndUpload(); });
ipcMain.handle('stop-tracking',    (event) => { assertMainRenderer(event); return stopTracking(); });
ipcMain.handle('start-tracking',   (event) => { assertMainRenderer(event); status = 'active'; return startTracking(); });
ipcMain.handle('start-work',       async (event) => { assertMainRenderer(event); status = 'active'; await startTracking(); return { ok: true }; });
ipcMain.handle('start-break',      async (event) => {
  assertMainRenderer(event);
  status = 'break';
  ssInterval = clearTimer(ssInterval);
  heartbeatInterval = clearTimer(heartbeatInterval);
  await sessionAction('start_break', { sessionId });
  broadcastStatus();
  return { ok: true };
});
ipcMain.handle('end-break', async (event) => {
  assertMainRenderer(event);
  status = 'active';
  await sessionAction('end_break', { sessionId });
  ssInterval = clearTimer(ssInterval);
  heartbeatInterval = clearTimer(heartbeatInterval);
  ssInterval        = setInterval(captureAndUpload, captureIntervalSec * 1000);
  heartbeatInterval = setInterval(() => sendHeartbeat(), 30000);
  broadcastStatus();
  return { ok: true };
});
ipcMain.handle('checkout', async (event) => {
  assertMainRenderer(event);
  if (tracking) {
    await stopTracking();
    return { ok: true };
  }

  void endSession();
  return { ok: true };
});
app.commandLine.appendSwitch('disable-features', 'DesktopCaptureUseDxgi,SpareRendererForSitePerProcess,CalculateNativeWinOcclusion');
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
  status = 'offline';
  const storedToken = loadStoredAuthToken();
  const storedUserName = get('userName') || '';
  const storedEmployeeId = get('employeeId') || '';
  if (storedToken) {
    try {
      persistSessionIdentity(storedToken, storedUserName, storedEmployeeId);
      console.log('[AUTH] restored session identity from local store', { employeeId, userName, hasToken: Boolean(token) });
      status = 'offline';
      mainWindow?.webContents.send('status-changed', { status, userName, employeeId });
    } catch {
      console.log('Stored token invalid/expired — clearing, user must log in again');
      storeAuthToken(''); userName=''; employeeId='';
      set('userName',''); set('employeeId','');
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
      } catch {
        console.log('[AUTH] background auth refresh failed — keeping cached identity');
      }
    })();
  } else {
    mainWindow?.webContents.send('status-changed', { status: 'offline' });
  }
});

app.on('window-all-closed', () => {
  if (tracking) return;
  isQuitting = true;
  app.quit();
});
app.on('before-quit', (event) => {
  if (allowImmediateQuit) {
    isQuitting = true;
    return;
  }

  event.preventDefault();
  void requestGracefulQuit();
});
