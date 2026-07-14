// agent/src/websiteBlock.ts
import fs   from 'fs';
import path from 'path';
import os   from 'os';
import http from 'http';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { app } from 'electron';

const PAC_DIR  = path.join(app.getPath('userData'), 'proxy');
const PAC_PATH = path.join(PAC_DIR, 'worktrack-block.pac');
const DEAD_PORT = 9;

let lastProxyDomainsKey = '';
let pacServer: http.Server | null = null;
let currentPacContent  = '';
let proxyAppliedOnce   = false; // track if we've already killed Chrome once this session
let pacPort = 0;

function normalizeDomain(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#:]/, 1)[0]
    .replace(/^\.+|\.+$/g, '');
}

// ─── PAC content ─────────────────────────────────────────────────────────────
function buildPacContent(domains: string[]): string {
  const domainList = JSON.stringify(domains);
  return `function FindProxyForURL(url, host) {
  var blocked = ${domainList};
  host = host.toLowerCase().replace(/^www\\./, '');
  if (isPlainHostName(host)) return "DIRECT";
  if (dnsDomainIs(host, "localhost")) return "DIRECT";
  if (shExpMatch(host, "127.*")) return "DIRECT";
  if (shExpMatch(host, "10.*")) return "DIRECT";
  if (shExpMatch(host, "192.168.*")) return "DIRECT";
  if (shExpMatch(host, "172.16.*")) return "DIRECT";
  if (shExpMatch(host, "172.17.*")) return "DIRECT";
  if (shExpMatch(host, "172.18.*")) return "DIRECT";
  if (shExpMatch(host, "172.19.*")) return "DIRECT";
  if (shExpMatch(host, "172.2?.*")) return "DIRECT";
  if (shExpMatch(host, "172.30.*")) return "DIRECT";
  if (shExpMatch(host, "172.31.*")) return "DIRECT";
  for (var i = 0; i < blocked.length; i++) {
    if (host === blocked[i] || host.indexOf('.' + blocked[i]) !== -1) {
      return "PROXY 127.0.0.1:${DEAD_PORT}";
    }
  }
  return "DIRECT";
}`;
}

// ─── Local HTTP server (Chrome only trusts http:// PAC, not file:///) ────────
function startPacServer(pacContent: string): Promise<boolean> {
  return new Promise((resolve) => {
    currentPacContent = pacContent;
    if (pacServer) { resolve(true); return; }

    const nextServer = http.createServer((req, res) => {
      if (req.url !== '/proxy.pac') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type'  : 'application/x-ns-proxy-autoconfig',
        'Cache-Control' : 'no-cache, no-store',
      });
      res.end(currentPacContent);
    });

    nextServer.listen(0, '127.0.0.1', () => {
      const address = nextServer.address();
      pacPort = typeof address === 'object' && address ? address.port : 0;
      pacServer = nextServer;
      console.log(`[SECURITY] PAC server listening on http://127.0.0.1:${pacPort}/proxy.pac`);
      resolve(Boolean(pacPort));
    });

    nextServer.on('error', (err: any) => {
      console.warn('[SECURITY] PAC server error:', err?.message);
      nextServer.close();
      resolve(false);
    });
  });
}

function stopPacServer() {
  pacServer?.close();
  pacServer = null;
  pacPort = 0;
}

// ─── Registry (HKCU — no admin needed) ───────────────────────────────────────
function applyProxyRegistry(enable: boolean): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve();
    if (enable && !pacPort) return resolve();
    const pacUrl = `http://127.0.0.1:${pacPort}/proxy.pac`;

    const lines = enable
      ? [
          `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" -Name AutoConfigURL -Value "${pacUrl}"`,
          `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" -Name ProxyEnable   -Value 0`,
        ]
      : [
          `Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" -Name AutoConfigURL -ErrorAction SilentlyContinue`,
          `Set-ItemProperty    -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" -Name ProxyEnable   -Value 0`,
        ];

    const refresh = `
Add-Type @"
using System;using System.Runtime.InteropServices;
public class WI { [DllImport("wininet.dll")] public static extern bool InternetSetOption(IntPtr h,int o,IntPtr b,int l); }
"@
[WI]::InternetSetOption([IntPtr]::Zero,39,[IntPtr]::Zero,0)|Out-Null
[WI]::InternetSetOption([IntPtr]::Zero,37,[IntPtr]::Zero,0)|Out-Null`;

    const script = [...lines, refresh].join('\n');
    const tmp = path.join(os.tmpdir(), `wt-proxy-${crypto.randomUUID()}.ps1`);
    fs.writeFileSync(tmp, script, { encoding: 'utf8', mode: 0o600, flag: 'wx' });

    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmp], (err: any) => {
      try { fs.unlinkSync(tmp); } catch {}
      if (err) console.error('[SECURITY] Registry error:', err?.message || err);
      else     console.log(`[SECURITY] Proxy registry ${enable ? 'set → ' + pacUrl : 'cleared'}`);
      resolve();
    });
  });
}

// ─── Kill Chrome once so it restarts and picks up new proxy settings ──────────
// Chrome caches proxy settings at startup — existing windows won't see changes
// until Chrome is fully restarted. We kill it once per agent session right after
// first applying the PAC; after that Chrome stays open normally.
function killChromeOnce(): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve();
    if (process.env.WORKTRACK_ENABLE_CHROME_RESTART !== 'true') {
      console.log('[SECURITY] Skipping automatic Chrome restart; proxy rules will fully apply on the next browser restart');
      return resolve();
    }
    if (proxyAppliedOnce) return resolve(); // only do this once per session
    proxyAppliedOnce = true;

    execFile('taskkill', ['/F', '/IM', 'chrome.exe'], (err: any) => {
      if (err) {
        // Chrome may not be running — that's fine
        console.log('[SECURITY] Chrome was not running (or already closed), proxy will apply on next launch');
      } else {
        console.log('[SECURITY] Chrome restarted to apply proxy settings — blocked sites will now be unreachable');
      }
      resolve();
    });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function syncProxyBlock(cachedPolicy: any, cachedBlockedWebsites: any[]) {
  if (!cachedPolicy || !cachedPolicy.blockWebsites) {
    await removeProxyBlock();
    return;
  }

  const domains = cachedBlockedWebsites
    .filter((item: any) => item?.enabled)
    .map((item: any) => normalizeDomain(item.domain))
    .filter(Boolean);

  const uniqueDomains = [...new Set(domains)];
  const domainsKey = JSON.stringify(uniqueDomains.slice().sort());
  if (domainsKey === lastProxyDomainsKey) return; // nothing changed

  if (!uniqueDomains.length) { await removeProxyBlock(); return; }

  const pacContent = buildPacContent(uniqueDomains);
  try { fs.mkdirSync(PAC_DIR, { recursive: true }); fs.writeFileSync(PAC_PATH, pacContent, 'utf8'); } catch {}

  const serverStarted = await startPacServer(pacContent);
  if (!serverStarted) {
    console.error('[SECURITY] Website block was not applied because the PAC server could not start');
    return;
  }
  await applyProxyRegistry(true);
  // Only mark success after both the PAC server and registry update have run,
  // so a later policy sync retries a transient setup failure.
  lastProxyDomainsKey = domainsKey;
  await killChromeOnce(); // <- one-time restart so Chrome picks up PAC
  console.log('[SECURITY] Website block active — domains:', domains.join(', '));
}

export async function removeProxyBlock() {
  if (!lastProxyDomainsKey || lastProxyDomainsKey === '[]') return;
  lastProxyDomainsKey = '[]';
  proxyAppliedOnce    = false;
  await applyProxyRegistry(false);
  stopPacServer();
  console.log('[SECURITY] Website block removed');
}
