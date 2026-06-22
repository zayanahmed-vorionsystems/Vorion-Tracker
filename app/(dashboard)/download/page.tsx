'use client';
// app/(dashboard)/download/page.tsx
import { useState } from 'react';
import { useAuthStore } from '@/store/auth';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.vercel.app';
const defaultAgentDownloadUrl = (platform: string) => `/api/agent/download?platform=${platform}`;

const platforms = [
  {
    id: 'windows', icon: '🪟', name: 'Windows',
    sub: 'Windows 10 / 11 · 64-bit', badge: '.exe installer', badgeColor: '#60A5FA',
    url: process.env.NEXT_PUBLIC_AGENT_WIN_URL || defaultAgentDownloadUrl('win'),
    steps: [
      'Download the installer below',
      'Run VorionTracker-Agent-Setup.exe',
      'Click "More info" → "Run anyway" if Windows Defender prompts',
      'Sign in with your company email & password',
      'The agent starts automatically and sits in your system tray (bottom-right taskbar)',
      'It will auto-start every time Windows boots',
    ],
    script: `# PowerShell one-liner — paste in PowerShell as Administrator:\n$url = "${APP_URL}/api/agent/download?platform=win"\n$out = "$env:TEMP\\VorionTracker-Setup.exe"\nInvoke-WebRequest -Uri $url -OutFile $out\nStart-Process $out`,
  },
  {
    id: 'mac', icon: '🍎', name: 'macOS',
    sub: 'macOS 12 Monterey and later · Intel & Apple Silicon', badge: '.dmg installer', badgeColor: '#A78BFA',
    url: process.env.NEXT_PUBLIC_AGENT_MAC_URL || defaultAgentDownloadUrl('mac'),
    steps: [
      'Download the .dmg file below',
      'Open it and drag Vorion Tracker Agent to your Applications folder',
      'Open Vorion Tracker Agent from Applications',
      'macOS will ask for Screen Recording permission — grant it in System Preferences',
      'Sign in with your company email & password',
      'The agent icon appears in your menu bar (top-right)',
      'Go to System Settings → General → Login Items → add Vorion Tracker Agent to auto-start',
    ],
    script: `# Terminal one-liner:\ncurl -L "${APP_URL}/api/agent/download?platform=mac" -o /tmp/VorionTracker-Agent.dmg\nopen /tmp/VorionTracker-Agent.dmg`,
  },
  {
    id: 'linux', icon: '🐧', name: 'Linux',
    sub: 'Ubuntu 20.04+ · Debian · Fedora', badge: '.tar.gz', badgeColor: '#34D399',
    url: process.env.NEXT_PUBLIC_AGENT_LINUX_URL || defaultAgentDownloadUrl('linux'),
    steps: [
      'Run the one-liner install script below in your terminal',
      'The agent installs to /opt/vorion-tracker-agent/',
      'Sign in when the window appears',
      'A system tray icon will appear',
      'Auto-start is configured via a systemd user service',
    ],
    script: `# Terminal one-liner:\ncurl -fsSL ${APP_URL}/api/agent/install.sh | bash`,
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

      {/* Server URL notice */}
      <div style={{
        ...card, padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 14, alignItems: 'flex-start',
        borderColor: 'rgba(34,197,94,.2)', background: 'rgba(34,197,94,.05)',
      }}>
        <span style={{ fontSize: 18 }}>✅</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#4ADE80', marginBottom: 5 }}>
            Agent will connect to your Vercel deployment
          </div>
          <code style={{ fontSize: 12, background: 'rgba(34,197,94,.1)', padding: '2px 8px', borderRadius: 6, color: '#86EFAC' }}>
            {APP_URL}
          </code>
          <div style={{ fontSize: 11, color: 'rgba(74,222,128,.6)', marginTop: 6 }}>
            Agents are pre-configured with this URL — employees just sign in with their company email.
          </div>
        </div>
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
              <a href={p.url} download style={{
                padding: '9px 20px', borderRadius: 12,
                background: 'linear-gradient(180deg, rgba(0,80,176,.55), rgba(0,80,176,.35))',
                border: '1px solid rgba(0,80,176,.55)',
                color: '#F8FAFC', fontSize: 13, fontWeight: 600, textDecoration: 'none',
                display: 'inline-block', whiteSpace: 'nowrap',
              }}>
                ⬇ Download
              </a>
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

      {/* Bulk deploy notice */}
      <div style={{
        ...card, padding: '14px 18px', marginTop: 18,
        borderColor: 'rgba(248,208,0,.2)', background: 'rgba(248,208,0,.04)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#F8D000', marginBottom: 6 }}>💡 Deploying to many computers at once?</div>
        <p style={{ fontSize: 12, color: 'rgba(248,250,252,.5)', margin: 0, lineHeight: 1.7 }}>
          <strong style={{ color: 'rgba(248,250,252,.7)' }}>Windows:</strong> Use Group Policy (GPO) to push the .exe silently with <code style={{ background: 'rgba(248,208,0,.1)', padding: '1px 5px', borderRadius: 4, color: '#F8D000' }}>VorionTracker-Setup.exe /S</code><br/>
          <strong style={{ color: 'rgba(248,250,252,.7)' }}>Mac:</strong> Use Jamf, Mosyle, or Kandji MDM to deploy the .pkg version<br/>
          <strong style={{ color: 'rgba(248,250,252,.7)' }}>Linux:</strong> Use Ansible, Chef, or Puppet to run the install script across all machines<br/>
          <strong style={{ color: 'rgba(248,250,252,.7)' }}>All platforms:</strong> The agent uses the API key embedded at build time — no extra configuration needed by employees
        </p>
      </div>
    </div>
  );
}