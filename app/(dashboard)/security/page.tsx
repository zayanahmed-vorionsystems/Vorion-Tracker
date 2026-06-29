'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/auth';

interface AppItem { id: string; displayName: string; processName: string; reason: string | null; enabled: boolean; createdAt: string; }
interface WebsiteItem { id: string; domain: string; reason: string | null; enabled: boolean; createdAt: string; }
interface PolicyState { blockApps: boolean; blockWebsites: boolean; showWarning: boolean; killProcess: boolean; }

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'radial-gradient(1200px 600px at 20% 0%, rgba(0,80,176,.18), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(248,208,0,.10), transparent 55%), #0B0F1A', color: '#F8FAFC', fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif', padding: '28px 32px' },
  card: { border: '1px solid rgba(248,250,252,.10)', background: 'rgba(11,15,26,.72)', backdropFilter: 'blur(10px)', borderRadius: 16, padding: '18px 20px', boxShadow: '0 8px 24px rgba(0,0,0,.22)', marginBottom: 16 },
  header: { fontSize: 20, fontWeight: 700, marginBottom: 8 },
  sub: { fontSize: 13, color: 'rgba(248,250,252,.45)', marginBottom: 12 },
  row: { display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  input: { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid rgba(248,250,252,.12)', background: 'rgba(248,250,252,.05)', color: '#F8FAFC', fontSize: 13 },
  button: { padding: '9px 14px', borderRadius: 10, border: '1px solid rgba(248,208,0,.35)', background: 'linear-gradient(180deg, rgba(248,208,0,.5), rgba(248,208,0,.3))', color: '#0B0F1A', fontWeight: 700, cursor: 'pointer' },
  secondary: { padding: '9px 14px', borderRadius: 10, border: '1px solid rgba(248,250,252,.10)', background: 'rgba(248,250,252,.06)', color: '#F8FAFC', cursor: 'pointer' },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(248,250,252,.08)' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: { padding: '10px 12px', textAlign: 'left' as const, color: 'rgba(248,250,252,.45)', fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.06em', borderBottom: '1px solid rgba(248,250,252,.08)' },
  td: { padding: '10px 12px', borderBottom: '1px solid rgba(248,250,252,.06)' },
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
      <h1 style={styles.header}>Security Policies</h1>
      <p style={styles.sub}>Server-driven blocking rules for apps and websites.</p>

      <div style={styles.card}>
        <div style={styles.header}>Global Policy Switches</div>
        <div style={styles.toggleRow}><span>Enable Website Blocking</span><input type="checkbox" checked={policy.blockWebsites} onChange={e=>setPolicy({...policy, blockWebsites:e.target.checked})} /></div>
        <div style={styles.toggleRow}><span>Enable Application Blocking</span><input type="checkbox" checked={policy.blockApps} onChange={e=>setPolicy({...policy, blockApps:e.target.checked})} /></div>
        <div style={styles.toggleRow}><span>Show Warning Popup</span><input type="checkbox" checked={policy.showWarning} onChange={e=>setPolicy({...policy, showWarning:e.target.checked})} /></div>
        <div style={styles.toggleRow}><span>Kill Process Automatically</span><input type="checkbox" checked={policy.killProcess} onChange={e=>setPolicy({...policy, killProcess:e.target.checked})} /></div>
        <div style={{ marginTop: 12 }}><button style={styles.button} onClick={savePolicy} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button style={{ ...styles.secondary, background: activeTab === 'apps' ? 'rgba(248,208,0,.2)' : 'rgba(248,250,252,.06)' }} onClick={() => setActiveTab('apps')}>Blocked Applications</button>
        <button style={{ ...styles.secondary, background: activeTab === 'websites' ? 'rgba(248,208,0,.2)' : 'rgba(248,250,252,.06)' }} onClick={() => setActiveTab('websites')}>Blocked Websites</button>
      </div>

      {activeTab === 'apps' ? (
        <>
          <div style={styles.card}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{editingAppId ? 'Edit Application' : 'Add Application'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10 }}>
              <input placeholder="Display name" style={styles.input} value={appForm.displayName} onChange={e=>setAppForm({...appForm, displayName:e.target.value})} />
              <input placeholder="Process name" style={styles.input} value={appForm.processName} onChange={e=>setAppForm({...appForm, processName:e.target.value})} />
              <input placeholder="Reason" style={styles.input} value={appForm.reason} onChange={e=>setAppForm({...appForm, reason:e.target.value})} />
              <button style={styles.button} onClick={saveApp}>{editingAppId ? 'Update' : 'Add'}</button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}><input type="checkbox" checked={appForm.enabled} onChange={e=>setAppForm({...appForm, enabled:e.target.checked})} /> Enabled</label>
          </div>
          <div style={styles.card}>
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>Name</th><th style={styles.th}>Process</th><th style={styles.th}>Reason</th><th style={styles.th}>Enabled</th><th style={styles.th}>Actions</th></tr></thead>
              <tbody>{appRows.map(item => <tr key={item.id}><td style={styles.td}>{item.displayName}</td><td style={styles.td}>{item.processName}</td><td style={styles.td}>{item.reason || '—'}</td><td style={styles.td}><span style={{ ...styles.badge, background: item.enabled ? 'rgba(34,197,94,.15)' : 'rgba(248,250,252,.08)', color: item.enabled ? '#4ADE80' : 'rgba(248,250,252,.35)' }}>{item.enabled ? 'Enabled' : 'Disabled'}</span></td><td style={styles.td}><button style={styles.secondary} onClick={() => { setEditingAppId(item.id); setAppForm({ displayName:item.displayName, processName:item.processName, reason:item.reason || '', enabled:item.enabled }); }}>Edit</button> <button style={styles.secondary} onClick={() => toggleApp(item)}>{item.enabled ? 'Disable' : 'Enable'}</button> <button style={styles.secondary} onClick={() => deleteApp(item.id)}>Delete</button></td></tr>)}</tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div style={styles.card}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{editingSiteId ? 'Edit Website' : 'Add Website'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10 }}>
              <input placeholder="Domain" style={styles.input} value={siteForm.domain} onChange={e=>setSiteForm({...siteForm, domain:e.target.value})} />
              <input placeholder="Reason" style={styles.input} value={siteForm.reason} onChange={e=>setSiteForm({...siteForm, reason:e.target.value})} />
              <button style={styles.button} onClick={saveSite}>{editingSiteId ? 'Update' : 'Add'}</button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}><input type="checkbox" checked={siteForm.enabled} onChange={e=>setSiteForm({...siteForm, enabled:e.target.checked})} /> Enabled</label>
          </div>
          <div style={styles.card}>
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>Domain</th><th style={styles.th}>Reason</th><th style={styles.th}>Enabled</th><th style={styles.th}>Actions</th></tr></thead>
              <tbody>{siteRows.map(item => <tr key={item.id}><td style={styles.td}>{item.domain}</td><td style={styles.td}>{item.reason || '—'}</td><td style={styles.td}><span style={{ ...styles.badge, background: item.enabled ? 'rgba(34,197,94,.15)' : 'rgba(248,250,252,.08)', color: item.enabled ? '#4ADE80' : 'rgba(248,250,252,.35)' }}>{item.enabled ? 'Enabled' : 'Disabled'}</span></td><td style={styles.td}><button style={styles.secondary} onClick={() => { setEditingSiteId(item.id); setSiteForm({ domain:item.domain, reason:item.reason || '', enabled:item.enabled }); }}>Edit</button> <button style={styles.secondary} onClick={() => toggleSite(item)}>{item.enabled ? 'Disable' : 'Enable'}</button> <button style={styles.secondary} onClick={() => deleteSite(item.id)}>Delete</button></td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
