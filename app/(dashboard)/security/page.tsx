'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/auth';

interface AppItem { id: string; displayName: string; processName: string; reason: string | null; enabled: boolean; createdAt: string; }
interface WebsiteItem { id: string; domain: string; reason: string | null; enabled: boolean; createdAt: string; }
interface PolicyState { blockApps: boolean; blockWebsites: boolean; showWarning: boolean; killProcess: boolean; }

// ---- Vorion Brand Palette (kept consistent with dashboard/sidebar) ----
const BRAND = {
  black: '#0A0E1A',
  blackSoft: '#10182B',
  white: '#F5F7FA',
  blue: '#1E5AE0',
  blueSoft: 'rgba(30,90,224,.16)',
  yellow: '#F5C400',
  yellowSoft: 'rgba(245,196,0,.12)',
  border: 'rgba(245,247,250,.08)',
  muted: 'rgba(245,247,250,.5)',
  mutedFaint: 'rgba(245,247,250,.3)',
  danger: '#FF5C7A',
  success: '#4ADE80',
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: `
linear-gradient(180deg,${BRAND.black},${BRAND.blackSoft}),
radial-gradient(circle at top left,${BRAND.blueSoft} 0%,transparent 35%),
radial-gradient(circle at bottom right,${BRAND.yellowSoft} 0%,transparent 40%)
`,
    color: BRAND.white,
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    padding: '28px 32px',
  },
  card: {
border: `1px solid ${BRAND.border}`,
background: 'rgba(16,24,43,.75)',
backdropFilter: 'blur(20px)',
WebkitBackdropFilter: 'blur(20px)',
borderRadius: 20,
padding: '20px 22px',
boxShadow: '0 15px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.05)',
marginBottom: 18,
},
  header: { fontSize: 20, fontWeight: 700, marginBottom: 8, color: BRAND.white },
  sub: { fontSize: 13, color: BRAND.muted, marginBottom: 12 },
  row: { display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  input: {
width: '100%',
padding: '10px 12px',
borderRadius: 12,
border: `1px solid ${BRAND.border}`,
background: 'rgba(245,247,250,.05)',
backdropFilter: 'blur(10px)',
color: BRAND.white,
fontSize: 13,
outline: 'none',
},
  button: {
padding: '10px 16px',
borderRadius: 12,
border: 'none',
background: `linear-gradient(90deg,${BRAND.blue},#4C8CFF)`,
color: '#fff',
fontWeight: 700,
cursor: 'pointer',
boxShadow: `0 10px 25px ${BRAND.blueSoft}`,
transition: 'all .2s ease',
},
  secondary: {
padding: '9px 14px',
borderRadius: 10,
border: `1px solid ${BRAND.border}`,
background: 'rgba(245,247,250,.06)',
color: BRAND.white,
cursor: 'pointer',
transition: 'all .2s ease',
},
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${BRAND.border}` },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: { padding: '10px 12px', textAlign: 'left' as const, color: BRAND.mutedFaint, fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.06em', borderBottom: `1px solid ${BRAND.border}` },
  td: { padding: '10px 12px', borderBottom: `1px solid ${BRAND.border}`, color: BRAND.white },
  badge: { display: 'inline-block', padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 },
};

export default function SecurityPage() {
  const { token, user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'apps' | 'websites'>('apps');
  const [policy, setPolicy] = useState<PolicyState>({ blockApps: true, blockWebsites: true, showWarning: true, killProcess: true });
  const [apps, setApps] = useState<AppItem[]>([]);
  const [websites, setWebsites] = useState<WebsiteItem[]>([]);
  const [appForm, setAppForm] = useState({ displayName: '', processName: '', reason: '', enabled: true });
  const [siteForm, setSiteForm] = useState({ domain: '', reason: '', enabled: true });
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canManage = user?.role === 'super_admin';

  const loadData = async () => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const [policyRes, appsRes, sitesRes] = await Promise.all([
      fetch('/api/policies', { headers }),
      fetch('/api/blocked/apps', { headers }),
      fetch('/api/blocked/websites', { headers }),
    ]);
    if (policyRes.ok) setPolicy(await policyRes.json());
    if (appsRes.ok) setApps(await appsRes.json());
    if (sitesRes.ok) setWebsites(await sitesRes.json());
  };

  useEffect(() => { if (token) loadData(); }, [token]);

  const savePolicy = async () => {
    if (!token || !canManage) return;
    setSaving(true);
    const res = await fetch('/api/policies/1', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(policy) });
    setSaving(false);
    if (res.ok) await loadData();
  };

  const saveApp = async () => {
    if (!token || !canManage) return;
    const payload = { displayName: appForm.displayName, processName: appForm.processName, reason: appForm.reason, enabled: appForm.enabled };
    const res = editingAppId ? await fetch('/api/blocked/apps', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: editingAppId, ...payload }) }) : await fetch('/api/blocked/apps', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    if (res.ok) {
      setAppForm({ displayName: '', processName: '', reason: '', enabled: true });
      setEditingAppId(null);
      await loadData();
    }
  };

  const saveSite = async () => {
    if (!token || !canManage) return;
    const payload = { domain: siteForm.domain, reason: siteForm.reason, enabled: siteForm.enabled };
    const res = editingSiteId ? await fetch('/api/blocked/websites', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: editingSiteId, ...payload }) }) : await fetch('/api/blocked/websites', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    if (res.ok) {
      setSiteForm({ domain: '', reason: '', enabled: true });
      setEditingSiteId(null);
      await loadData();
    }
  };

  const toggleApp = async (item: AppItem) => {
    if (!token || !canManage) return;
    await fetch('/api/blocked/apps', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: item.id, enabled: !item.enabled }) });
    await loadData();
  };

  const toggleSite = async (item: WebsiteItem) => {
    if (!token || !canManage) return;
    await fetch('/api/blocked/websites', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: item.id, enabled: !item.enabled }) });
    await loadData();
  };

  const deleteApp = async (id: string) => {
    if (!token || !canManage) return;
    await fetch(`/api/blocked/apps?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    await loadData();
  };

  const deleteSite = async (id: string) => {
    if (!token || !canManage) return;
    await fetch(`/api/blocked/websites?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    await loadData();
  };

  const appRows = useMemo(() => apps, [apps]);
  const siteRows = useMemo(() => websites, [websites]);

  if (!canManage) return <div style={styles.page}><h1 style={styles.header}>Security Policies</h1><p style={styles.sub}>Only Super Admin can access this view.</p></div>;

  return (
    <div style={styles.page}>
      <h1 style={{ ...styles.header, fontSize: 30, fontWeight: 800 }}>🔒 Security Policies</h1>
      <p style={styles.sub}>Server-driven blocking rules for apps and websites.</p>

      <div style={styles.card}>
        <div style={styles.header}>Global Policy Switches</div>
        <div style={styles.toggleRow}><span>Enable Website Blocking</span><input type="checkbox" checked={policy.blockWebsites} onChange={e=>setPolicy({...policy, blockWebsites:e.target.checked})} /></div>
        <div style={styles.toggleRow}><span>Enable Application Blocking</span><input type="checkbox" checked={policy.blockApps} onChange={e=>setPolicy({...policy, blockApps:e.target.checked})} /></div>
        <div style={styles.toggleRow}><span>Show Warning Popup</span><input type="checkbox" checked={policy.showWarning} onChange={e=>setPolicy({...policy, showWarning:e.target.checked})} /></div>
        <div style={{ ...styles.toggleRow, borderBottom: 'none' }}><span>Kill Process Automatically</span><input type="checkbox" checked={policy.killProcess} onChange={e=>setPolicy({...policy, killProcess:e.target.checked})} /></div>
        <div style={{ marginTop: 12 }}><button style={styles.button} onClick={savePolicy} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button style={{ ...styles.secondary, background: activeTab === 'apps' ? BRAND.blueSoft : 'rgba(245,247,250,.06)', border: activeTab === 'apps' ? `1px solid ${BRAND.blue}40` : `1px solid ${BRAND.border}` }} onClick={() => setActiveTab('apps')}>Blocked Applications</button>
        <button style={{ ...styles.secondary, background: activeTab === 'websites' ? BRAND.yellowSoft : 'rgba(245,247,250,.06)', border: activeTab === 'websites' ? `1px solid ${BRAND.yellow}40` : `1px solid ${BRAND.border}` }} onClick={() => setActiveTab('websites')}>Blocked Websites</button>
      </div>

      {activeTab === 'apps' ? (
        <>
          <div style={styles.card}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: BRAND.white }}>{editingAppId ? 'Edit Application' : 'Add Application'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10 }}>
              <input placeholder="Display name" style={styles.input} value={appForm.displayName} onChange={e=>setAppForm({...appForm, displayName:e.target.value})} />
              <input placeholder="Process name" style={styles.input} value={appForm.processName} onChange={e=>setAppForm({...appForm, processName:e.target.value})} />
              <input placeholder="Reason" style={styles.input} value={appForm.reason} onChange={e=>setAppForm({...appForm, reason:e.target.value})} />
              <button style={styles.button} onClick={saveApp}>{editingAppId ? 'Update' : 'Add'}</button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, color: BRAND.muted, fontSize: 13 }}><input type="checkbox" checked={appForm.enabled} onChange={e=>setAppForm({...appForm, enabled:e.target.checked})} /> Enabled</label>
          </div>
          <div style={styles.card}>
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>Name</th><th style={styles.th}>Process</th><th style={styles.th}>Reason</th><th style={styles.th}>Enabled</th><th style={styles.th}>Actions</th></tr></thead>
              <tbody>{appRows.map(item => <tr key={item.id}><td style={styles.td}>{item.displayName}</td><td style={styles.td}>{item.processName}</td><td style={styles.td}>{item.reason || '—'}</td><td style={styles.td}><span style={{ ...styles.badge, background: item.enabled ? 'rgba(74,222,128,.15)' : 'rgba(245,247,250,.08)', color: item.enabled ? BRAND.success : BRAND.mutedFaint }}>{item.enabled ? 'Enabled' : 'Disabled'}</span></td><td style={styles.td}><button style={styles.secondary} onClick={() => { setEditingAppId(item.id); setAppForm({ displayName:item.displayName, processName:item.processName, reason:item.reason || '', enabled:item.enabled }); }}>Edit</button> <button style={styles.secondary} onClick={() => toggleApp(item)}>{item.enabled ? 'Disable' : 'Enable'}</button> <button style={{ ...styles.secondary, color: BRAND.danger, border: `1px solid ${BRAND.danger}30` }} onClick={() => deleteApp(item.id)}>Delete</button></td></tr>)}</tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div style={styles.card}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: BRAND.white }}>{editingSiteId ? 'Edit Website' : 'Add Website'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10 }}>
              <input placeholder="Domain" style={styles.input} value={siteForm.domain} onChange={e=>setSiteForm({...siteForm, domain:e.target.value})} />
              <input placeholder="Reason" style={styles.input} value={siteForm.reason} onChange={e=>setSiteForm({...siteForm, reason:e.target.value})} />
              <button style={styles.button} onClick={saveSite}>{editingSiteId ? 'Update' : 'Add'}</button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, color: BRAND.muted, fontSize: 13 }}><input type="checkbox" checked={siteForm.enabled} onChange={e=>setSiteForm({...siteForm, enabled:e.target.checked})} /> Enabled</label>
          </div>
          <div style={styles.card}>
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>Domain</th><th style={styles.th}>Reason</th><th style={styles.th}>Enabled</th><th style={styles.th}>Actions</th></tr></thead>
              <tbody>{siteRows.map(item => <tr key={item.id}><td style={styles.td}>{item.domain}</td><td style={styles.td}>{item.reason || '—'}</td><td style={styles.td}><span style={{ ...styles.badge, background: item.enabled ? 'rgba(74,222,128,.15)' : 'rgba(245,247,250,.08)', color: item.enabled ? BRAND.success : BRAND.mutedFaint }}>{item.enabled ? 'Enabled' : 'Disabled'}</span></td><td style={styles.td}><button style={styles.secondary} onClick={() => { setEditingSiteId(item.id); setSiteForm({ domain:item.domain, reason:item.reason || '', enabled:item.enabled }); }}>Edit</button> <button style={styles.secondary} onClick={() => toggleSite(item)}>{item.enabled ? 'Disable' : 'Enable'}</button> <button style={{ ...styles.secondary, color: BRAND.danger, border: `1px solid ${BRAND.danger}30` }} onClick={() => deleteSite(item.id)}>Delete</button></td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}