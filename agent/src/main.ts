// agent/src/main.ts  — Electron main process
import {
  app, BrowserWindow, Tray, Menu, nativeImage,
  ipcMain, powerMonitor, desktopCapturer, screen, shell
} from 'electron';
import path   from 'path';
import fs     from 'fs';
import https  from 'https';
import http   from 'http';

// ─── Config ────────────────────────────────────────────────────────────────
const isDev      = !app.isPackaged;

function parseServerUrlArg(): string | undefined {
  const arg = process.argv.find(a => /^(--server-url=|\/SERVERURL=)/i.test(a));
  if (arg) {
    const [, value] = arg.split(/=(.+)/);
    return value?.trim();
  }

  const index = process.argv.findIndex(a => /^--server-url$/i.test(a) || /^\/SERVERURL$/i.test(a));
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1].trim();
  }

  return undefined;
}

const SERVER_URL = parseServerUrlArg() || process.env.WORKTRACK_SERVER || (isDev ? 'http://localhost:3000' : 'https://your-app.vercel.app');

// ─── Persistent store ──────────────────────────────────────────────────────
// Using a simple JSON file instead of electron-store for broader compat
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

// ─── State ─────────────────────────────────────────────────────────────────
let tray:        Tray|null         = null;
let mainWindow:  BrowserWindow|null = null;
let token:       string            = get('token') || '';
let userName:    string            = get('userName') || '';
let sessionId:   string            = '';
let tracking     = false;
let ssInterval:  NodeJS.Timeout|null = null;
let idleInterval: NodeJS.Timeout|null = null;
let intervalMin  = parseInt(get('intervalMin')||'5');

// ─── Single instance lock ───────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => mainWindow?.show());

// ─── Auto-start with OS ────────────────────────────────────────────────────
app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });

// ─── HTTP helper (avoids axios dep in main process) ────────────────────────
function apiRequest(method:string, path:string, body?:any, isFormData=false): Promise<any> {
  return new Promise((resolve,reject) => {
    const url  = new URL(path, SERVER_URL);
    const mod  = url.protocol==='https:'?https:http;
    const data = body && !isFormData ? Buffer.from(JSON.stringify(body)) : body;

    const headers: Record<string,string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body && !isFormData) { headers['Content-Type']='application/json'; headers['Content-Length']=String(data.length); }
    if (isFormData && body?.getHeaders) Object.assign(headers, body.getHeaders());

    const req = mod.request({ hostname:url.hostname, port:url.port||undefined, path:url.pathname+url.search, method, headers }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        const status = res.statusCode || 0;
        if (!raw) {
          if (status >= 200 && status < 300) return resolve({});
          return reject(new Error(`Request failed ${status}`));
        }
        try {
          const parsed = JSON.parse(raw);
          if (status >= 200 && status < 300) return resolve(parsed);
          return reject(new Error(parsed?.error || `Request failed ${status}`));
        } catch {
          if (status >= 200 && status < 300) return resolve(raw);
          return reject(new Error(`Request failed ${status}: ${raw}`));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ─── Screenshot capture ────────────────────────────────────────────────────
async function captureAndUpload() {
  if (!token || !tracking) return;
  try {
    const display = screen.getPrimaryDisplay();
    const sources = await desktopCapturer.getSources({
      types:['screen'],
      thumbnailSize:{ width:display.workAreaSize.width, height:display.workAreaSize.height }
    });
    if (!sources.length) return;

    const pngBuf  = sources[0].thumbnail.toPNG();
    const tmpPath = path.join(app.getPath('temp'),`wt_${Date.now()}.png`);
    fs.writeFileSync(tmpPath, pngBuf);

    // Active window name
    let activeApp = 'Unknown';
    try {
      const { default: activeWin } = await import('active-win');
      const w = await activeWin();
      activeApp = w?.owner?.name || w?.title?.split(' — ')[0] || 'Unknown';
    } catch {}

    // Activity % from idle time
    const idleSec = powerMonitor.getSystemIdleTime();
    const actPct  = Math.max(0, Math.min(100, Math.round(100-(idleSec/60)*100)));

    // Multipart upload via Node http
    const boundary = `----WorkTrackBoundary${Date.now()}`;
    const fileContent = fs.readFileSync(tmpPath);
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="screenshot"; filename="screenshot.png"\r\nContent-Type: image/png\r\n\r\n`
      ),
      fileContent,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="activeApp"\r\n\r\n${activeApp}`),
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="activityPct"\r\n\r\n${actPct}`),
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="sessionId"\r\n\r\n${sessionId}`),
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="capturedAt"\r\n\r\n${new Date().toISOString()}`),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const url = new URL('/api/screenshots', SERVER_URL);
    const mod = url.protocol==='https:'?https:http;
    const req = mod.request({
      hostname:url.hostname, port:url.port||undefined, path:url.pathname, method:'POST',
      headers:{ Authorization:`Bearer ${token}`,'Content-Type':`multipart/form-data; boundary=${boundary}`,'Content-Length':body.length }
    });
    req.write(body); req.end();

    fs.unlinkSync(tmpPath);
    mainWindow?.webContents.send('screenshot-taken',{ time:new Date().toLocaleTimeString(),app:activeApp,pct:actPct });
  } catch(e){ console.error('Screenshot error:',e); }
}

// ─── Session management ────────────────────────────────────────────────────
async function startTracking() {
  if (tracking || !token) return;
  tracking = true;
  try {
    const res = await apiRequest('POST','/api/sessions',{ action:'start' });
    sessionId = res.sessionId || '';
  } catch {}
  ssInterval   = setInterval(captureAndUpload, intervalMin*60*1000);
  idleInterval = setInterval(watchIdle, 30_000);
  captureAndUpload();
  updateTray();
  mainWindow?.webContents.send('tracking-status',{ tracking:true, sessionId });
}

async function stopTracking() {
  if (!tracking) return;
  tracking = false;
  if (ssInterval)   clearInterval(ssInterval);
  if (idleInterval) clearInterval(idleInterval);
  if (sessionId && token) {
    try { await apiRequest('POST','/api/sessions',{ action:'end', sessionId }); } catch {}
  }
  sessionId = '';
  updateTray();
  mainWindow?.webContents.send('tracking-status',{ tracking:false });
}

async function watchIdle() {
  const idleSec = powerMonitor.getSystemIdleTime();
  const isIdle  = idleSec > 5*60;
  mainWindow?.webContents.send('idle-status',{ isIdle, idleSec });
  if (isIdle && sessionId) {
    try { await apiRequest('POST','/api/sessions',{ action:'activity', type:'idle_start', sessionId }); } catch {}
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
    { label: 'Quit', click:()=>{ stopTracking(); app.exit(0); } },
  ]));
  tray.setToolTip(tracking?`WorkTrack — tracking ${userName}`:'WorkTrack — not tracking');
}

// ─── Window ────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:380, height:560, resizable:false,
    title:'WorkTrack Agent',
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false },
    show: !token, // show only if not logged in
  });

  if (isDev) mainWindow.loadURL('http://localhost:5174');
  else       mainWindow.loadFile(path.join(__dirname,'../renderer/index.html'));

  mainWindow.on('close',(e)=>{ e.preventDefault(); mainWindow?.hide(); });
}

// ─── IPC ───────────────────────────────────────────────────────────────────
ipcMain.handle('login', async (_e, email:string, password:string) => {
  try {
    const res = await apiRequest('POST','/api/auth',{ email, password });
    if (!res?.token) throw new Error(res?.error || 'Login failed');
    token    = res.token;
    userName = res.user?.name || '';
    set('token', token);
    set('userName', userName);
    await startTracking();
    return { ok:true, user:res.user };
  } catch (error:any) {
    console.error('Login failed:', error);
    return { ok:false, error: error?.message || 'Login failed' };
  }
});

ipcMain.handle('logout', async () => {
  await stopTracking();
  token=''; userName=''; set('token',''); set('userName','');
  mainWindow?.show();
  return { ok:true };
});

ipcMain.handle('get-status',   () => ({ tracking,sessionId,userName,intervalMin,idleSec:powerMonitor.getSystemIdleTime() }));
ipcMain.handle('manual-shot',  () => captureAndUpload());
ipcMain.handle('stop-tracking',() => stopTracking());
ipcMain.handle('start-tracking',()=> startTracking());
ipcMain.handle('set-interval', (_e,min:number)=>{ intervalMin=min; set('intervalMin',String(min));
  if(ssInterval){ clearInterval(ssInterval); ssInterval=setInterval(captureAndUpload,min*60*1000); }
});

// ─── Boot ───────────────────────────────────────────────────────────────────
app.whenReady().then(()=>{
  createWindow();

  // Tray
  const iconPath = path.join(
    isDev ? path.join(__dirname,'../assets') : process.resourcesPath,
    process.platform==='win32'?'icon.ico':process.platform==='darwin'?'icon.icns':'icon.png'
  );
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(process.platform==='darwin' ? icon.resize({width:18,height:18}) : icon);
  tray.on('double-click',()=>mainWindow?.show());
  updateTray();

  // If already logged in, start tracking
  if (token) startTracking();
  else mainWindow?.show();
});

app.on('window-all-closed',()=>{ /* keep alive in tray */ });
app.on('before-quit',()=>{ tracking && stopTracking(); });
