'use client';
// app/(dashboard)/live/page.tsx
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore, canSendAlerts } from '@/store/auth';
import { supabaseClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
interface Employee {
  id: string;
  name: string;
}

interface AgentCard {
  agentId: string;
  name: string;
  status: string;
  online: boolean;
  lastUrl?: string;
  activeApp?: string;
  activityPct?: number;
  lastSeen?: string;
}

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:4000';

/* ---------------------------------------------------------------------- */
/* Style tokens — matches app/(dashboard)/dashboard/page.tsx              */
/* ---------------------------------------------------------------------- */

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background:
      'radial-gradient(1200px 600px at 20% 0%, rgba(0,80,176,.22), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(248,208,0,.12), transparent 55%), #0B0F1A',
    color: '#F8FAFC',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    padding: '28px 32px',
  },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  heading: {
    fontSize: 22,
    fontWeight: 600,
    margin: 0,
    color: '#F8FAFC',
  },
  subtext: {
    fontSize: 13,
    color: 'rgba(248,250,252,.55)',
    marginTop: 4,
  },
  livePill: {
    fontSize: 12,
    color: '#4ADE80',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  onlinePill: {
    fontSize: 12,
    color: 'rgba(248,250,252,.6)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(248,250,252,.04)',
    border: '1px solid rgba(248,250,252,.08)',
    borderRadius: 999,
    padding: '5px 12px',
  },
  card: {
    border: '1px solid rgba(248,250,252,.10)',
    background: 'rgba(11,15,26,.72)',
    backdropFilter: 'blur(10px)',
    borderRadius: 16,
    boxShadow: '0 8px 24px rgba(0,0,0,.22)',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'rgba(248,250,252,.45)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(248,250,252,.12)',
    background: 'rgba(248,250,252,.05)',
    color: '#F8FAFC',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    colorScheme: 'dark',
  },
  emptyState: {
    padding: 32,
    textAlign: 'center',
    color: 'rgba(248,250,252,.3)',
    fontSize: 12,
  },
};

export default function LiveMonitorPage() {
  const { token, user } = useAuthStore();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [securityEvents, setSecurityEvents] = useState<any[]>([]);
  const [alertMsg, setAlertMsg] = useState('');
  const [alertTo, setAlertTo] = useState('');
  const [sending, setSending] = useState(false);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) {
          console.error('/api/users failed', r.status, await r.text());
          return;
        }
        const users = await r.json();
        setEmployees(users.filter((u: any) => u.role === 'employee').map((u: any) => ({ id: u.id, name: u.name })));
      } catch (e) {
        console.error('Failed to load users', e);
      }
    })();
  }, [token]);

  useEffect(() => {
    const runtimeUrl = (typeof window !== 'undefined')
      ? (process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:4000`)
      : SOCKET_SERVER_URL;
    const socket = io(runtimeUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    socket.emit('register', { role: user?.role || 'admin', employeeId: user?.id || null });
    socket.on('connect', () => {
      console.log('Dashboard socket connected', socket.id, 'to', runtimeUrl);
      socket.emit('register', { role: user?.role || 'admin', employeeId: user?.id || null });
    });
    socket.on('connect_error', (err: any) => console.error('Socket connect_error', err));
    socket.on('error', (err: any) => console.error('Socket error', err));
    socket.on('reconnect_attempt', (n: number) => console.log('Socket reconnect attempt', n));
    socket.on('reconnect_failed', () => console.warn('Socket reconnect failed'));
    socket.on('employee-status', (data: any) => {
      setAgents(prev => {
        const updated = {
          agentId: data.agentId,
          name: data.userName || data.agentId,
          status: data.status || 'offline',
          online: data.status !== 'offline',
          activeApp: data.activeApp,
          activityPct: data.activityPct,
          lastUrl: data.screenshotBase64 ? `data:image/png;base64,${data.screenshotBase64}` : prev.find(item => item.agentId === data.agentId)?.lastUrl,
          lastSeen: data.heartbeat || data.capturedAt || prev.find(item => item.agentId === data.agentId)?.lastSeen,
        };
        const exists = prev.some(item => item.agentId === data.agentId);
        return exists ? prev.map(item => item.agentId === data.agentId ? updated : item) : [updated, ...prev];
      });
    });
    socket.on('security-event', (data: any) => {
      setSecurityEvents(prev => [data, ...prev].slice(0, 8));
    });
    socket.on('new-alert', (data: any) => {
      console.log('Dashboard received new alert', data);
    });
    socket.on('new-screenshot', (data: any) => {
      console.log('Dashboard received screenshot', data);
    });

    return () => { try { socket.disconnect(); } catch (e) {} };
  }, [user?.id, user?.role]);

  useEffect(() => {
    const channel = supabaseClient
      .channel('employee-status-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_status' }, (payload) => {
        const record = (payload as any).new ?? (payload as any).record;
        if (!record) return;
        setAgents(prev => {
          const updated = {
            agentId: record.employee_id,
            name: record.employee_id,
            status: record.current_status || 'offline',
            online: record.current_status !== 'offline',
            activeApp: record.current_app ?? undefined,
            activityPct: undefined,
            lastUrl: prev.find(item => item.agentId === record.employee_id)?.lastUrl,
            lastSeen: record.last_activity,
          };
          const exists = prev.some(item => item.agentId === record.employee_id);
          return exists ? prev.map(item => item.agentId === record.employee_id ? { ...item, ...updated } : item) : [updated, ...prev];
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'screenshots' }, (payload) => {
        const record = (payload as any).new ?? (payload as any).record;
        if (!record) return;
        setAgents(prev => prev.map(item => {
          if (item.agentId !== record.user_id) return item;
          return {
            ...item,
            lastUrl: record.file_url,
            lastSeen: record.captured_at,
          };
        }));
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, []);

  async function sendAlert() {
    if (!alertTo || !alertMsg) {
      alert('Select an employee and enter a message.');
      return;
    }

    const payload = {
      employee_id: alertTo,
      alert_type: 'live_alert',
      title: 'Live monitor alert',
      description: alertMsg,
      severity: 'medium',
      metadata: {},
    };

    setSending(true);

    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(JSON.stringify(data));
        return;
      }

      alert('Alert sent successfully!');
      setAlertMsg('');
    } catch (err) {
      console.error(err);
      alert('Request failed');
    } finally {
      setSending(false);
    }
  }

  const role = user?.role as any;
  const onlineCount = agents.filter(a => a.online).length;

  return (
    <div style={styles.page}>
      {/* Top row */}
      <div style={styles.topRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.back()}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              border: '1px solid rgba(248,208,0,.35)',
              background: 'linear-gradient(180deg, rgba(248,208,0,.5), rgba(248,208,0,.3))',
              color: '#0B0F1A',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ← Back
          </button>
          <div>
            <h1 style={styles.heading}>Live Monitor</h1>
            <p style={styles.subtext}>Real-time employee agent status updates</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={styles.onlinePill}>
            <strong style={{ color: '#4ADE80' }}>{onlineCount}</strong> online
          </span>
          <span style={styles.livePill}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', display: 'inline-block', boxShadow: '0 0 6px #22C55E' }}/>
            Live via Socket.IO
          </span>
        </div>
      </div>

      {/* Alert panel */}
      {canSendAlerts(role) && (
        <div style={{
          ...styles.card, padding: '14px 16px', marginBottom: 20,
          display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap',
        }}>
          <div style={{ flex: '1 1 180px' }}>
            <label style={{ ...styles.sectionLabel, display: 'block', marginBottom: 6 }}>Send alert to</label>
            <select value={alertTo} onChange={e => setAlertTo(e.target.value)} style={{ ...styles.input, cursor: 'pointer' }}>
              <option value="" style={{ background: '#0B0F1A', color: '#F8FAFC' }}>Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id} style={{ background: '#0B0F1A', color: '#F8FAFC' }}>{e.name}</option>)}
            </select>
          </div>
          <div style={{ flex: '2 1 240px' }}>
            <label style={{ ...styles.sectionLabel, display: 'block', marginBottom: 6 }}>Message</label>
            <input value={alertMsg} onChange={e => setAlertMsg(e.target.value)}
              placeholder="e.g. Please focus on your current task" style={styles.input}/>
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

      {/* Security events */}
      <div style={{ ...styles.card, padding: '14px 16px', marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#F8FAFC' }}>Security Events</div>
        {securityEvents.length === 0 ? (
          <div style={{ fontSize: 12, color: 'rgba(248,250,252,.35)' }}>No blocked app or website events yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {securityEvents.map((event, i) => (
              <div key={event.id ?? i} style={{ border: '1px solid rgba(248,250,252,.08)', borderRadius: 10, padding: '8px 10px', background: 'rgba(248,250,252,.04)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#F8FAFC' }}>{event.employeeName || event.employeeId || 'Employee'}</div>
                <div style={{ fontSize: 11, color: 'rgba(248,250,252,.35)', marginTop: 2 }}>{new Date(event.createdAt).toLocaleString()}</div>
                <div style={{ fontSize: 12, marginTop: 4, color: 'rgba(248,250,252,.7)' }}>{event.eventType}: {event.value}</div>
                <div style={{ fontSize: 11, color: '#F8D000', marginTop: 3 }}>Action: {event.actionTaken || 'Logged'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agent grid */}
      {agents.length === 0 ? (
        <div style={{ ...styles.card, ...styles.emptyState }}>
          No agents connected yet — cards will appear here once an employee's agent comes online.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
          {agents.map(agent => (
            <div key={agent.agentId} style={{
              border: `1px solid ${agent.online ? 'rgba(34,197,94,.3)' : 'rgba(248,250,252,.08)'}`,
              background: 'rgba(11,15,26,.72)', backdropFilter: 'blur(10px)',
              borderRadius: 14, overflow: 'hidden',
              boxShadow: agent.online ? '0 0 18px rgba(34,197,94,.08)' : '0 8px 20px rgba(0,0,0,.2)',
              transition: 'box-shadow .3s',
            }}>
              {/* Screenshot area */}
              <div style={{ aspectRatio: '16/9', background: 'rgba(248,250,252,.03)', position: 'relative', overflow: 'hidden' }}>
                {agent.lastUrl ? (
                  <img src={agent.lastUrl} alt="screen" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(248,250,252,.2)', fontSize: 12 }}>
                    {agent.online ? 'Waiting for screen data…' : 'Offline'}
                  </div>
                )}
                {agent.online && (
                  <div style={{
                    position: 'absolute', top: 8, left: 8, display: 'flex', alignItems: 'center', gap: 4,
                    background: 'rgba(0,0,0,.6)', borderRadius: 999, padding: '3px 8px', fontSize: 10, color: '#fff',
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', display: 'inline-block', boxShadow: '0 0 4px #ef4444' }}/>
                    Live
                  </div>
                )}
              </div>

              {/* Card footer */}
              <div style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#F8FAFC' }}>{agent.name}</span>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 999, fontWeight: 600,
                    background: agent.online ? 'rgba(34,197,94,.1)' : 'rgba(248,250,252,.05)',
                    color: agent.online ? '#4ADE80' : 'rgba(248,250,252,.3)',
                    border: `1px solid ${agent.online ? 'rgba(34,197,94,.2)' : 'rgba(248,250,252,.08)'}`,
                  }}>
                    {agent.status}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(248,250,252,.35)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.activeApp || '—'}</span>
                  <span>{agent.activityPct != null ? `${agent.activityPct}% active` : ''}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}