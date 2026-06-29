'use client';
// app/(dashboard)/download/page.tsx
import { useState } from 'react';
import { useAuthStore } from '@/store/auth';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.vercel.app';
const agentDownloadUrls = {
  win: process.env.NEXT_PUBLIC_AGENT_WIN_URL,
  mac: process.env.NEXT_PUBLIC_AGENT_MAC_URL,
  linux: process.env.NEXT_PUBLIC_AGENT_LINUX_URL,
};

const platforms = [
  {
    id: 'windows', icon: '🪟', name: 'Windows',
    sub: 'Windows 10 / 11 · 64-bit', badge: '.exe installer', badgeColor: '#60A5FA',
    url: agentDownloadUrls.win,
    steps: [
      'Download the installer below',
      'Run VorionTracker-Agent-Setup.exe',
      'Click "More info" → "Run anyway" if Windows Defender prompts',
      'Sign in with your company email & password',
      'The agent starts automatically and sits in your system tray (bottom-right taskbar)',
      'It will auto-start every time Windows boots',
    ],
    script: agentDownloadUrls.win
      ? `# PowerShell one-liner — paste in PowerShell as Administrator:\n$url = "${agentDownloadUrls.win}"\n$out = "$env:TEMP\\VorionTracker-Setup.exe"\nInvoke-WebRequest -Uri $url -OutFile $out\nStart-Process $out`
      : '# Agent download URL is not configured. Please set NEXT_PUBLIC_AGENT_WIN_URL.',
  },
  {
    id: 'mac', icon: '🍎', name: 'macOS',
    sub: 'macOS 12 Monterey and later · Intel & Apple Silicon', badge: '.dmg installer', badgeColor: '#A78BFA',
    url: agentDownloadUrls.mac,
    steps: [
      'Download the .dmg file below',
      'Open it and drag Vorion Tracker Agent to your Applications folder',
      'Open Vorion Tracker Agent from Applications',
      'macOS will ask for Screen Recording permission — grant it in System Preferences',
      'Sign in with your company email & password',
      'The agent icon appears in your menu bar (top-right)',
      'Go to System Settings → General → Login Items → add Vorion Tracker Agent to auto-start',
    ],
    script: agentDownloadUrls.mac
      ? `# Terminal one-liner:\ncurl -L "${agentDownloadUrls.mac}" -o /tmp/VorionTracker-Agent.dmg\nopen /tmp/VorionTracker-Agent.dmg`
      : '# Agent download URL is not configured. Please set NEXT_PUBLIC_AGENT_MAC_URL.',
  },
  {
    id: 'linux', icon: '🐧', name: 'Linux',
    sub: 'Ubuntu 20.04+ · Debian · Fedora', badge: '.tar.gz', badgeColor: '#34D399',
    url: agentDownloadUrls.linux,
    steps: [
      'Run the one-liner install script below in your terminal',
      'The agent installs to /opt/vorion-tracker-agent/',
      'Sign in when the window appears',
      'A system tray icon will appear',
      'Auto-start is configured via a systemd user service',
    ],
    script: agentDownloadUrls.linux
      ? `# Terminal one-liner:\ncurl -L "${agentDownloadUrls.linux}" -o /tmp/VorionTracker-Agent.tar.gz\n# Extract and install the agent manually using tar commands or your distro package workflow.`
      : '# Agent download URL is not configured. Please set NEXT_PUBLIC_AGENT_LINUX_URL.',
  },
];

// Shared style tokens
const card: React.CSSProperties = {
  border: '1px solid rgba(248,250,252,.10)',
  background: 'rgba(11,15,26,.72)',
  backdropFilter: 'blur(10px)',
  borderRadius: 16,
  overflow: 'hidden',
  boxShadow: '0 8px 24px rgba(0,0,0,.22)',
};

export default function DownloadPage() {
  const { token } = useAuthStore();
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id); setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: '#F8FAFC' }}>Download Vorion Agent</h1>
        <p style={{ fontSize: 13, color: 'rgba(248,250,252,.45)', margin: 0, maxWidth: 560 }}>
          Install the agent on every employee's computer. It runs silently in the background, captures screenshots, tracks active apps, and syncs everything to your dashboard.
        </p>
      </div>

      

      {/* Platform cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {platforms.map(p => (
          <div key={p.id} style={card}>
            {/* Card header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '16px 20px', borderBottom: '1px solid rgba(248,250,252,.07)',
            }}>
              <span style={{ fontSize: 24 }}>{p.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#F8FAFC' }}>{p.name}</span>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                    background: p.badgeColor + '18', color: p.badgeColor,
                    border: `1px solid ${p.badgeColor}30`,
                  }}>{p.badge}</span>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(248,250,252,.4)', marginTop: 2 }}>{p.sub}</div>
              </div>
              {p.url ? (
                <a href={p.url} target="_blank" rel="noopener noreferrer" style={{
                  padding: '9px 20px', borderRadius: 12,
                  background: 'linear-gradient(180deg, rgba(0,80,176,.55), rgba(0,80,176,.35))',
                  border: '1px solid rgba(0,80,176,.55)',
                  color: '#F8FAFC', fontSize: 13, fontWeight: 600, textDecoration: 'none',
                  display: 'inline-block', whiteSpace: 'nowrap',
                }}>
                  ⬇ Download
                </a>
              ) : (
                <span style={{
                  padding: '9px 20px', borderRadius: 12,
                  background: 'rgba(248,250,252,.08)',
                  border: '1px solid rgba(248,250,252,.12)',
                  color: 'rgba(248,250,252,.45)', fontSize: 13, fontWeight: 600,
                  display: 'inline-block', whiteSpace: 'nowrap',
                }}>
                  Download unavailable
                </span>
              )}
            </div>

            {/* Steps + Script */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              <div style={{ padding: '16px 20px', borderRight: '1px solid rgba(248,250,252,.06)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(248,250,252,.4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Installation steps
                </div>
                <ol style={{ paddingLeft: 16, margin: 0 }}>
                  {p.steps.map((s, i) => (
                    <li key={i} style={{ fontSize: 12, color: 'rgba(248,250,252,.6)', marginBottom: 7, lineHeight: 1.6 }}>{s}</li>
                  ))}
                </ol>
              </div>

              <div style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(248,250,252,.4)', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <span>Silent install script</span>
                  <button onClick={() => copy(p.script, p.id)} style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 8,
                    border: '1px solid rgba(248,250,252,.12)',
                    background: copied === p.id ? 'rgba(34,197,94,.1)' : 'rgba(248,250,252,.04)',
                    color: copied === p.id ? '#4ADE80' : 'rgba(248,250,252,.5)',
                    cursor: 'pointer', fontWeight: 600,
                  }}>
                    {copied === p.id ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <pre style={{
                  margin: 0, padding: '12px 14px',
                  background: 'rgba(0,0,0,.4)', color: '#94A3B8',
                  border: '1px solid rgba(248,250,252,.06)',
                  borderRadius: 10, fontSize: 11, overflow: 'auto',
                  lineHeight: 1.7, whiteSpace: 'pre-wrap',
                }}>
                  <code>{p.script}</code>
                </pre>
                <p style={{ fontSize: 11, color: 'rgba(248,250,252,.25)', marginTop: 8 }}>
                  IT teams can push this via GPO (Windows) or Ansible/MDM (Mac/Linux).
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}