'use client';
// app/(dashboard)/live/page.tsx
import { useEffect, useState } from 'react';
import { useAuthStore, canSendAlerts } from '@/store/auth';
import { getPusherClient, CHANNELS, EVENTS } from '@/lib/pusher';

interface EmpCard {
  id: string; name: string; online: boolean;
  lastUrl?: string; activeApp?: string; activityPct?: number; lastSeen?: string;
}

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 10,
  border: '1px solid rgba(248,250,252,.12)',
  background: 'rgba(248,250,252,.05)',
  color: '#F8FAFC', fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
};

export default function LiveMonitorPage() {
  const { token, user } = useAuthStore();
  const [employees, setEmployees] = useState<EmpCard[]>([]);
  const [alertMsg,  setAlertMsg]  = useState('');
  const [alertTo,   setAlertTo]   = useState('');
  const [sending,   setSending]   = useState(false);

  useEffect(() => {
    fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(users => setEmployees(
        users.filter((u: any) => u.role === 'employee').map((u: any) => ({ id: u.id, name: u.name, online: false }))
      ));
  }, [token]);

  useEffect(() => {
    const pusher  = getPusherClient();
    const channel = pusher.subscribe(CHANNELS.LIVE);
    channel.bind(EVENTS.NEW_SCREENSHOT, (data: any) => {
      setEmployees(prev => prev.map(e => e.id === data.userId ? {
        ...e, online: true, lastUrl: data.fileUrl, activeApp: data.activeApp,
        activityPct: data.activityPct, lastSeen: data.capturedAt,
      } : e));
    });
    channel.bind(EVENTS.EMPLOYEE_STATUS, (data: any) => {
      setEmployees(prev => prev.map(e => e.id === data.userId ? { ...e, online: data.status === 'online' } : e));
    });
    return () => { pusher.unsubscribe(CHANNELS.LIVE); };
  }, []);

  async function sendAlert() {
    if (!alertTo || !alertMsg) return;
    setSending(true);
    await fetch('/api/alerts', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ toUserId: alertTo, message: alertMsg }),
    });
    setAlertMsg(''); setSending(false);
  }

  const role = user?.role as any;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: '#F8FAFC' }}>Live Monitor</h1>
          <p style={{ fontSize: 13, color: 'rgba(248,250,252,.4)', margin: 0 }}>Updates in real-time as employees work</p>
        </div>
        <span style={{ fontSize: 12, color: '#4ADE80', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', display: 'inline-block', boxShadow: '0 0 6px #22C55E' }}/>
          Live via Pusher
        </span>
      </div>

      {/* Alert panel */}
      {canSendAlerts(role) && (
        <div style={{
          border: '1px solid rgba(248,250,252,.10)', background: 'rgba(11,15,26,.72)',
          backdropFilter: 'blur(10px)', borderRadius: 14, padding: '14px 16px',
          marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-end',
          boxShadow: '0 8px 24px rgba(0,0,0,.2)',
        }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, fontWeight: 600, display: 'block', marginBottom: 5, color: 'rgba(248,250,252,.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Send alert to</label>
            <select value={alertTo} onChange={e => setAlertTo(e.target.value)} style={{ ...inp }}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div style={{ flex: 2 }}>
            <label style={{ fontSize: 10, fontWeight: 600, display: 'block', marginBottom: 5, color: 'rgba(248,250,252,.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Message</label>
            <input value={alertMsg} onChange={e => setAlertMsg(e.target.value)}
              placeholder="e.g. Please focus on your current task" style={inp}/>
          </div>
          <button onClick={sendAlert} disabled={sending || !alertTo || !alertMsg} style={{
            padding: '9px 18px', borderRadius: 10,
            background: 'linear-gradient(180deg, rgba(248,208,0,.5), rgba(248,208,0,.3))',
            border: '1px solid rgba(248,208,0,.5)', color: '#0B0F1A',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            opacity: sending || !alertTo || !alertMsg ? 0.5 : 1,
          }}>
            {sending ? 'Sending…' : 'Send Alert'}
          </button>
        </div>
      )}

      {/* Employee grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
        {employees.map(emp => (
          <div key={emp.id} style={{
            border: `1px solid ${emp.online ? 'rgba(34,197,94,.3)' : 'rgba(248,250,252,.08)'}`,
            background: 'rgba(11,15,26,.72)', backdropFilter: 'blur(10px)',
            borderRadius: 14, overflow: 'hidden',
            boxShadow: emp.online ? '0 0 18px rgba(34,197,94,.08)' : '0 8px 20px rgba(0,0,0,.2)',
            transition: 'box-shadow .3s',
          }}>
            {/* Screenshot area */}
            <div style={{ aspectRatio: '16/9', background: 'rgba(248,250,252,.03)', position: 'relative', overflow: 'hidden' }}>
              {emp.lastUrl ? (
                <img src={emp.lastUrl} alt="screen" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(248,250,252,.2)', fontSize: 12 }}>
                  {emp.online ? 'Waiting for screenshot…' : 'Offline'}
                </div>
              )}
              {emp.online && (
                <div style={{
                  position: 'absolute', top: 8, left: 8, display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(0,0,0,.6)', borderRadius: 99, padding: '3px 8px', fontSize: 10, color: '#fff',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', display: 'inline-block', boxShadow: '0 0 4px #ef4444' }}/>
                  Live
                </div>
              )}
            </div>

            {/* Card footer */}
            <div style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#F8FAFC' }}>{emp.name}</span>
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                  background: emp.online ? 'rgba(34,197,94,.1)' : 'rgba(248,250,252,.05)',
                  color: emp.online ? '#4ADE80' : 'rgba(248,250,252,.3)',
                  border: `1px solid ${emp.online ? 'rgba(34,197,94,.2)' : 'rgba(248,250,252,.08)'}`,
                }}>
                  {emp.online ? 'Online' : 'Offline'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(248,250,252,.35)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{emp.activeApp || '—'}</span>
                <span>{emp.activityPct != null ? `${emp.activityPct}% active` : ''}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}