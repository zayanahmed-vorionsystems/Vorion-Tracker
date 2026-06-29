'use client';
import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

declare const window: any;

type AgentStatus = 'active' | 'break' | 'idle' | 'offline';

type AlertRecord = {
  id: string;
  title: string;
  description: string;
  severity: string;
  sentAt: string;
  isRead: boolean;
};

const SOCKET_SERVER_URL = (typeof window !== 'undefined' && window.location?.origin)
  ? `${window.location.protocol}//${window.location.hostname}:4000`
  : 'http://127.0.0.1:4000';

const LABELS: Record<AgentStatus, string> = {
  active: 'Active',
  break: 'Break',
  idle: 'Idle',
  offline: 'Offline',
};

export default function App() {
  const [status, setStatus] = useState<AgentStatus>('offline');
  const [elapsed, setElapsed] = useState('00:00:00');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [idle, setIdle] = useState(false);
  const [heartbeat, setHeartbeat] = useState('');
  const [userName, setUserName] = useState('');
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [loggedEmail, setLoggedEmail] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);

  const unreadCount = alerts.filter((alert) => !alert.isRead).length;

  const normalizeAlert = (raw: any): AlertRecord => ({
    id: String(raw?.id ?? raw?.alert_id ?? `${Date.now()}-${Math.random()}`),
    title: String(raw?.title ?? raw?.description ?? 'New alert'),
    description: String(raw?.description ?? raw?.title ?? ''),
    severity: String(raw?.severity ?? 'medium'),
    sentAt: raw?.sentAt || raw?.created_at || new Date().toISOString(),
    isRead: Boolean(raw?.isRead ?? raw?.is_read ?? false),
  });

  const showNotification = (alert: AlertRecord) => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(alert.title, { body: alert.description, silent: false });
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          new Notification(alert.title, { body: alert.description, silent: false });
        }
      });
    }
  };

  const refreshAlerts = async () => {
    try {
      const stored = await window.agent?.getAlerts();
      setAlerts(stored?.map(normalizeAlert) ?? []);
      const synced = await window.agent?.syncAlerts();
      setAlerts(synced?.map(normalizeAlert) ?? stored?.map(normalizeAlert) ?? []);
    } catch (error) {
      console.error('Failed to refresh alerts', error);
    }
  };

  const markAlertRead = async (id: string) => {
    try {
      const updated = await window.agent?.markAlertRead(id);
      if (updated) {
        setAlerts((prev) => prev.map((alert) => alert.id === id ? normalizeAlert(updated) : alert));
      }
    } catch (error) {
      console.error('Failed to mark alert read', error);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      if (!startedAt) return;
      const d = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(`${String(Math.floor(d / 3600)).padStart(2, '0')}:${String(Math.floor((d % 3600) / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    window.agent?.onStatus((data:any) => {
      if (data?.status) {
        setStatus(data.status);
        if (data.status === 'active' || data.status === 'break') {
          setIdle(false);
          setStartedAt((prev) => prev ?? Date.now());
        }
        if (data.status === 'idle') {
          setIdle(true);
        }
        if (data.status === 'offline') {
          setIdle(false);
          setStartedAt(null);
          setElapsed('00:00:00');
        }
      }
      if (data?.heartbeat) {
        setHeartbeat(new Date(data.heartbeat).toLocaleTimeString());
      }
      if (data?.userName) {
        setUserName(data.userName);
        setLoggedIn(true);
      }
    });

    window.agent?.getStatus().then((s:any) => {
      if (s?.userName) {
        setUserName(s.userName);
        setLoggedIn(true);
      }
      if (s?.status) {
        setStatus(s.status);
        if (s.status === 'active' || s.status === 'break') {
          setStartedAt(s.startedAt || Date.now());
        }
        if (s.status === 'idle') setIdle(true);
      }
      if (s?.heartbeat) setHeartbeat(new Date(s.heartbeat).toLocaleTimeString());
    });

    refreshAlerts();

    window.agent?.onAlert((raw:any) => {
      const alert = normalizeAlert(raw);
      setAlerts((prev) => {
        const exists = prev.some((item) => item.id === alert.id);
        const next = exists ? prev.map((item) => item.id === alert.id ? alert : item) : [alert, ...prev];
        return next.slice(0, 20);
      });
      showNotification(alert);
    });
  }, []);

  useEffect(() => {
    const socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('register', { role: 'employee', employeeId: employeeId || null });
    });
    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('connect_error', (err:any) => console.error('Socket alert error', err));
    socket.on('new-alert', async (payload:any) => {
      const alert = normalizeAlert(payload);
      await window.agent?.storeAlert(alert);
    });

    return () => {
      try {
        socket.disconnect();
      } catch (err) {
        console.warn('Failed to clean up socket alerts', err);
      }
    };
  }, [employeeId]);

  return (
    <div style={{ fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', minHeight:'100vh', background:'#f8fafc', padding:20 }}>
      <div style={{ maxWidth:420, margin:'0 auto', background:'#fff', borderRadius:24, padding:28, boxShadow:'0 24px 80px rgba(15,23,42,.08)' }}>
        <h1 style={{ margin:0, fontSize:26, fontWeight:700, color:'#0f172a' }}>WorkTrack</h1>
        <p style={{ margin:'10px 0 22px', color:'#64748b', lineHeight:1.6 }}>Employee mode: work status, timer, break controls and checkout. Tracking runs silently in background.</p>

        {loggedIn ? (
          <>
            <div style={{ marginBottom:20, padding:20, borderRadius:20, background:'#f8fafc', border:'1px solid #e2e8f0' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.08em' }}>Status</div>
                  <div style={{ fontSize:22, fontWeight:700, color:'#0f172a' }}>{LABELS[status]}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:11, color:'#64748b' }}>Heartbeat</div>
                  <div style={{ fontSize:14, fontWeight:600, color:'#0f172a' }}>{heartbeat || '--:--:--'}</div>
                </div>
              </div>
              <div style={{ display:'grid', gap:10, marginTop:10 }}>
                <div style={{ padding:'14px 16px', borderRadius:16, background:'#fff', border:'1px solid #e2e8f0' }}>
                  <div style={{ fontSize:11, color:'#64748b', marginBottom:6 }}>Session timer</div>
                  <div style={{ fontSize:28, fontWeight:700, color:'#0f172a' }}>{elapsed}</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ padding:'8px 12px', borderRadius:999, background: idle ? '#fef3c7' : '#d1fae5', color: idle ? '#b45309' : '#166534', fontSize:12, fontWeight:700 }}>{idle ? 'Idle' : 'Active'}</span>
                  <span style={{ padding:'8px 12px', borderRadius:999, background:'#e2e8f0', color:'#475569', fontSize:12 }}>Tracking background tasks</span>
                </div>
              </div>
            </div>

            <div style={{ marginBottom:16, padding:'14px 16px', borderRadius:16, background:'#fff', border:'1px solid #e2e8f0' }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'center', marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>{userName || 'Employee'}</div>
                  <div style={{ fontSize:12, color:'#64748b' }}>{loggedEmail || 'Signed in user'}</div>
                </div>
                <button onClick={() => setAlertsOpen((prev) => !prev)} style={{ border:'1px solid #cbd5e1', borderRadius:999, background:'#f8fafc', color:'#0f172a', padding:'8px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                  Messages {unreadCount > 0 ? `(${unreadCount})` : ''}
                </button>
              </div>
              {alertsOpen && (
                <div style={{ marginTop:12, display:'grid', gap:8 }}>
                  {alerts.length === 0 ? (
                    <div style={{ fontSize:12, color:'#64748b' }}>No messages yet.</div>
                  ) : alerts.map((alert) => (
                    <button key={alert.id} onClick={() => markAlertRead(alert.id)} style={{ textAlign:'left', border:'1px solid #e2e8f0', borderRadius:12, padding:10, background: alert.isRead ? '#fff' : '#fef3c7', cursor:'pointer' }}>
                      <div style={{ fontSize:12, fontWeight:700, color:'#0f172a' }}>{alert.title}</div>
                      <div style={{ fontSize:11, color:'#64748b', marginTop:4 }}>{alert.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display:'grid', gap:12 }}>
              <button onClick={() => window.agent?.startWork()} style={{ width:'100%', padding:16, borderRadius:16, border:'none', background:'#0f172a', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer' }}>Start Work</button>
              <button onClick={() => window.agent?.startBreak()} style={{ width:'100%', padding:16, borderRadius:16, border:'1px solid #cbd5e1', background:'#fff', color:'#0f172a', fontSize:15, fontWeight:700, cursor:'pointer' }}>Start Break</button>
              <button onClick={() => window.agent?.endBreak()} style={{ width:'100%', padding:16, borderRadius:16, border:'1px solid #cbd5e1', background:'#fff', color:'#0f172a', fontSize:15, fontWeight:700, cursor:'pointer' }}>End Break</button>
              <button onClick={() => window.agent?.checkout()} style={{ width:'100%', padding:16, borderRadius:16, border:'none', background:'#ef4444', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer' }}>Check Out</button>
              <button onClick={async () => {
                await window.agent?.logout();
                setLoggedIn(false);
                setUserName('');
                setLoggedEmail('');
                setStatus('offline');
                setElapsed('00:00:00');
              }} style={{ width:'100%', padding:16, borderRadius:16, border:'1px solid #cbd5e1', background:'#fff', color:'#0f172a', fontSize:15, fontWeight:700, cursor:'pointer' }}>Logout</button>
            </div>

            <p style={{ marginTop:22, fontSize:12, color:'#64748b', lineHeight:1.75 }}>Signed in as {userName}. Screenshots every 2 seconds, active app tracking, heartbeat, and agent status are emitted to the admin dashboard in real time.</p>
          </>
        ) : (
          <div style={{ display:'grid', gap:12 }}>
            <div style={{ padding:'20px', borderRadius:20, background:'#f8fafc', border:'1px solid #e2e8f0' }}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:12, color:'#0f172a' }}>Employee sign in</div>
              <label style={{ display:'block', marginBottom:10, color:'#475569' }}>
                Email
                <input value={email} onChange={e => setEmail(e.target.value)} style={{ width:'100%', marginTop:8, padding:'12px', borderRadius:12, border:'1px solid #cbd5e1' }} />
              </label>
              <label style={{ display:'block', marginBottom:10, color:'#475569' }}>
                Password
                <input type='password' value={password} onChange={e => setPassword(e.target.value)} style={{ width:'100%', marginTop:8, padding:'12px', borderRadius:12, border:'1px solid #cbd5e1' }} />
              </label>
              {loginError && <div style={{ color:'#b91c1c', marginBottom:10 }}>{loginError}</div>}
              <button onClick={async () => {
                setLoginError('');
                const result = await window.agent?.login(email, password);
                if (result?.ok) {
                  setUserName(result.user?.name || 'Employee');
                  setLoggedIn(true);
                  setStatus('active');
                  setStartedAt(Date.now());
                } else {
                  setLoginError(result?.error || 'Login failed');
                }
              }} style={{ width:'100%', padding:16, borderRadius:16, border:'none', background:'#0f172a', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer' }}>Sign in</button>
            </div>
          </div>
        )}

        <p style={{ marginTop:22, fontSize:12, color:'#64748b', lineHeight:1.75 }}>Screenshots every 2 seconds, app tracking, website tracking, heartbeat, and monitoring run silently in the background. The admin dashboard receives real-time status updates.</p>
      </div>
    </div>
  );
}
