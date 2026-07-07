import { BrowserWindow, ipcMain, desktopCapturer, screen } from 'electron';
import fs from 'fs';
import ws from 'ws';
import path from 'path';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';

let captureWindow: BrowserWindow | null = null;
let listenersBound = false;
let windowReadyPromise: Promise<void> | null = null;
let captureWindowReady = false;
let liveChannel: RealtimeChannel | null = null;
let liveChannelEmployeeId: string | null = null;
let activeAdminIds = new Set<string>();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
console.log('[AGENT] Supabase URL being used:', SUPABASE_URL);

// ─────────────────────────────────────────────────────────────────────────
// IMPORTANT: The agent is a trusted Node.js process (not a browser client),
// so it should authenticate with the service_role key rather than the anon
// key. With the anon key, auth.uid() is always null on this connection, so
// any RLS policy that checks auth.uid() will always block the agent's
// SELECT/INSERT — even though nothing throws a visible error.
//
// Add SUPABASE_SERVICE_ROLE_KEY to agent/.env (Supabase Dashboard ->
// Settings -> API -> service_role key). NEVER put this key in the admin
// dashboard / browser code — only here, in the Node process.
// ─────────────────────────────────────────────────────────────────────────
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[AGENT][WARN] SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon key. ' +
    'If your Realtime RLS policies check auth.uid(), the agent will silently fail to receive/send signals.');
}

const supabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY,
  {
    auth: { persistSession: false, storage: undefined },
    realtime: {
      transport: ws as any,
    },
  }
);

function logErrorWithStack(message: string, error: unknown) {
  console.error(message);
  if (error instanceof Error) {
    console.error(error.stack || error.message || String(error));
  } else if (typeof error === 'object' && error !== null) {
    console.error(JSON.stringify(error, null, 2));
  } else {
    console.error(String(error));
  }
}

function getOrCreateCaptureWindow(): { win: BrowserWindow; ready: Promise<void> } {
  if (captureWindow && !captureWindow.isDestroyed() && windowReadyPromise) {
    return { win: captureWindow, ready: windowReadyPromise };
  }

  const candidateHtmlPaths = [
    path.join(__dirname, 'capture.html'),
    path.join(__dirname, '..', 'src', 'capture.html'),
    path.join(__dirname, '..', 'capture.html'),
    path.join(process.resourcesPath || __dirname, 'app.asar', 'dist', 'capture.html'),
    path.join(process.resourcesPath || __dirname, 'app.asar', 'src', 'capture.html'),
    path.join(process.resourcesPath || __dirname, 'app.asar.unpacked', 'src', 'capture.html'),
  ].filter((candidate, index, list) => list.indexOf(candidate) === index);
  const captureHtmlPath = candidateHtmlPaths.find((candidate) => fs.existsSync(candidate));
  
  if (!captureHtmlPath) {
    console.error('[live-watch] capture.html not found. Tried paths:', candidateHtmlPaths);
  }

  const preloadPath = path.join(__dirname, 'capture-preload.js');
  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  captureWindow = win;
  captureWindowReady = false;

  win.once('ready-to-show', () => {
    console.log('[live-watch] capture window ready-to-show');
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return;
    if (errorCode === -3) return; // -3 is ERR_ABORTED, which is expected on navigation
    console.error('[live-watch] capture window failed to load', {
      captureHtmlPath,
      errorCode,
      errorDescription,
      validatedURL,
      __dirname,
      resourcesPath: process.resourcesPath,
    });
  });

  win.on('closed', () => {
    if (captureWindow === win) {
      captureWindow = null;
      windowReadyPromise = null;
      captureWindowReady = false;
    }
  });

  const ready = new Promise<void>((resolve) => {
    win.webContents.once('did-finish-load', () => {
      captureWindowReady = true;
      resolve();
    });
  });
  windowReadyPromise = ready;
  captureWindowReady = false;
  
  if (!captureHtmlPath) {
    logErrorWithStack('[AGENT][ERR] Cannot load capture window - HTML path not found', new Error('Capture HTML path resolution failed'));
    return { win, ready };
  }
  
  win.loadFile(captureHtmlPath).catch((err) => {
    if (win.isDestroyed()) {
      return;
    }
    logErrorWithStack('[AGENT][ERR] Failed to load capture window file', err);
  });

  return { win, ready };
}

async function sendStartCapture(win: BrowserWindow, adminId: string, offer?: any) {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1280, height: 720 },
  });

  if (!sources || !sources.length) {
    logErrorWithStack('[AGENT][ERR] no desktop sources available', new Error('No desktop sources available'));
    return;
  }

  // Try to pick the user's primary display where possible. DesktopCapturerSource
  // implementations vary between platforms, so we attempt several heuristics
  // (display_id, id suffix, and name containing 'entire') and fall back to
  // the first returned source.
  let chosen = sources[0];
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const primaryId = String(primaryDisplay.id);
    const match = sources.find((s) => {
      const sid = (s as any).display_id ?? (s as any).displayId ?? '';
      if (sid && String(sid) === primaryId) return true;
      if (typeof s.id === 'string' && s.id.endsWith(primaryId)) return true;
      if (/entire/i.test(s.name)) return true;
      return false;
    });
    if (match) chosen = match;
  } catch (e) {
    // If screen APIs aren't available in some contexts, just use the first.
  }

  if (win.isDestroyed()) return;

  const start = Date.now();
  while (!captureWindowReady) {
    if (Date.now() - start > 10000) {
      console.error('[MAIN] capture window did not report ready before start-capture');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log('[AGENT] sending start-capture to hidden capture window', { adminId, sourceId: chosen.id, hasOffer: Boolean(offer) });
  win.webContents.send('start-capture', { sourceId: chosen.id, adminId, offer });
}

function getChannelName(employeeId: string) {
  return `live-${employeeId}`;
}

function ensureChannel(employeeId: string) {
  if (liveChannel && liveChannelEmployeeId === employeeId) {
    return liveChannel;
  }

  liveChannel?.unsubscribe();

  // NOTE: `private: true` and `broadcast.ack: true` MUST match the admin
  // dashboard's channel config exactly, otherwise the two sides won't be
  // able to see each other's broadcasts even though they share a topic name.
  const channel = supabaseClient.channel(getChannelName(employeeId), {
    config: {
      broadcast: { self: false, ack: true },
      presence: { key: employeeId },
      private: true,
    },
  });

  channel.on('broadcast', { event: 'offer' }, ({ payload }: { payload: any }) => {
    console.log('[AGENT] Offer broadcast event fired, payload:', JSON.stringify(payload));
    const adminId = String(payload?.adminId || '');
    if (!adminId || payload?.from !== 'admin') {
      console.warn('[AGENT] Offer payload rejected — adminId or from mismatch', payload);
      return;
    }
    console.log('[AGENT] Offer accepted from admin:', adminId);
    activeAdminIds.add(adminId);
    void (async () => {
      try {
        const { win, ready } = getOrCreateCaptureWindow();
        await ready;
        await sendStartCapture(win, adminId, payload?.sdp);
      } catch (error: any) {
        logErrorWithStack('[AGENT][ERR] unable to start screen capture for stream request', error);
      }
    })();
  });

  channel.on('broadcast', { event: 'answer' }, ({ payload }: { payload: any }) => {
    if (payload?.from !== 'admin') return;
    console.log('[AGENT] Answer relay received for adminId:', payload?.adminId);
    captureWindow?.webContents.send('remote-answer', { adminId: payload.adminId, sdp: payload.sdp });
  });

  channel.on('broadcast', { event: 'ice-candidate' }, ({ payload }: { payload: any }) => {
    if (payload?.from !== 'admin') return;
    captureWindow?.webContents.send('remote-ice-candidate', { adminId: payload.adminId, candidate: payload.candidate });
  });

  channel.on('broadcast', { event: 'stop-stream' }, ({ payload }: { payload: any }) => {
    const adminId = String(payload?.adminId || '');
    if (!adminId) return;
    activeAdminIds.delete(adminId);
    if (captureWindow && !captureWindow.isDestroyed()) {
      captureWindow.webContents.send('stop-capture', { adminId });
    }
    if (!activeAdminIds.size) {
      captureWindow?.webContents.send('stop-capture', { adminId: '__all__' });
    }
  });

  channel.subscribe((status, err) => {
    console.log('[AGENT] Realtime channel status:', status, err ? `error: ${err.message || err}` : '');
    if (status === 'SUBSCRIBED') {
      channel.track({ online: true, employeeId, updatedAt: Date.now() });
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.error('[AGENT][ERR] Channel subscribe failed — this is very likely an RLS policy blocking ' +
        'this connection. Check that SUPABASE_SERVICE_ROLE_KEY is set, or that auth.uid() based policies ' +
        'allow this connection.');
    }
  });

  liveChannel = channel;
  liveChannelEmployeeId = employeeId;
  return channel;
}

export function setupLiveWatch(employeeId: string) {
  const channel = ensureChannel(employeeId);

  if (!listenersBound) {
    listenersBound = true;

    ipcMain.on('live-watch:ready', () => {
      captureWindowReady = true;
    });

    ipcMain.on('live-watch:answer', async (_event, { adminId, sdp }) => {
      const result = await channel.send({
        type: 'broadcast',
        event: 'answer',
        payload: { employeeId, adminId, from: 'agent', sdp },
      });
      console.log('[AGENT] send answer result:', result);
      if (result !== 'ok') {
        console.error('[AGENT][ERR] Failed to send answer back to admin:', result);
      }
    });

    ipcMain.on('live-watch:ice-candidate', async (_event, { adminId, candidate }) => {
      const result = await channel.send({
        type: 'broadcast',
        event: 'ice-candidate',
        payload: { employeeId, adminId, from: 'agent', candidate },
      });
      if (result !== 'ok') {
        console.error('[AGENT][ERR] Failed to send ICE candidate to admin:', result);
      }
    });
  }
}

export function teardownLiveWatch() {
  activeAdminIds.clear();
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.webContents.send('stop-capture', { adminId: '__all__' });
    captureWindow.close();
  }
  captureWindow = null;
  windowReadyPromise = null;
  captureWindowReady = false;
  liveChannel?.unsubscribe();
  liveChannel = null;
  liveChannelEmployeeId = null;
}