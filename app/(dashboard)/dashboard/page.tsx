'use client';
// app/(dashboard)/dashboard/page.tsx
import { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '@/store/auth';
import { fmtCompact, fmtPrecise, timeAgo } from './timeUtils';

function fmt(secs: number) {
  if (!secs) return '0h 0m';
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

const SOCKET_SERVER_URL = (typeof window !== 'undefined' && window.location?.origin)
  ? `${window.location.protocol}//${window.location.hostname}:4000`
  : 'http://127.0.0.1:4000';

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: `
linear-gradient(180deg,#020617,#0F172A),
radial-gradient(circle at top left,#2563EB30 0%,transparent 35%),
radial-gradient(circle at bottom right,#9333EA20 0%,transparent 40%)
`,
    color: '#F8FAFC',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    padding: '28px 32px',
  },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  dateInput: {
    padding: '8px 12px',
    borderRadius: 12,
    border: '1px solid rgba(248,250,252,.12)',
    background: 'rgba(248,250,252,.06)',
    color: '#F8FAFC',
    fontSize: 13,
    outline: 'none',
    cursor: 'pointer',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 14,
    marginBottom: 24,
  },
  statCard: {
  background: 'rgba(20,25,40,.70)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 20,
  padding: 22,
  boxShadow:
    '0 15px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.05)',
  transition: 'all .25s ease',
  cursor: 'pointer',
},
  statLabel: {
    fontSize: 11,
    color: 'rgba(248,250,252,.5)',
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 700,
    lineHeight: 1,
  },
  statSub: {
    fontSize: 11,
    color: 'rgba(248,250,252,.35)',
    marginTop: 6,
  },
  tableCard: {
  background:'rgba(20,25,40,.72)',
  backdropFilter:'blur(20px)',
  border:'1px solid rgba(255,255,255,.08)',
  borderRadius:22,
  overflow:'hidden',
  boxShadow:'0 20px 50px rgba(0,0,0,.35)',
},
  tableHeader: {
    padding: '14px 18px',
    borderBottom: '1px solid rgba(248,250,252,.08)',
    fontSize: 14,
    fontWeight: 600,
    color: '#F8FAFC',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
  },
  thead: {
    background: 'rgba(248,250,252,.04)',
  },
  th: {
    padding: '10px 18px',
    textAlign: 'left' as const,
    fontWeight: 500,
    color: 'rgba(248,250,252,.45)',
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    borderBottom: '1px solid rgba(248,250,252,.08)',
  },
  td: {
    padding: '12px 18px',
    color: '#F8FAFC',
  },
  tdMuted: {
    padding: '12px 18px',
    color: 'rgba(248,250,252,.4)',
  },
  emptyState: {
    padding: 48,
    textAlign: 'center' as const,
    color: 'rgba(248,250,252,.3)',
    fontSize: 13,
  },
  loading: {
    padding: 48,
    textAlign: 'center' as const,
    color: 'rgba(248,250,252,.3)',
    fontSize: 13,
  },
};

export default function DashboardPage() {
  const { token, user } = useAuthStore();
  const [rows,       setRows]       = useState<any[]>([]);
  const [date,       setDate]       = useState(new Date().toISOString().slice(0, 10));
  const [loading,    setLoading]    = useState(true);
  const [precise,    setPrecise]    = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem('timePrecise');
      if (v) setPrecise(v === '1');
    } catch {}
  }, []);

  const normalizeStatus = useCallback((value?: string | null) => {
    const raw = String(value || '').toLowerCase();
    if (raw === 'active' || raw === 'working') return 'working';
    if (raw === 'break' || raw === 'on_break') return 'on_break';
    if (raw === 'checked_out' || raw === 'checkout' || raw === 'check_out') return 'checked_out';
    if (raw === 'offline' || raw === 'idle') return 'offline';
    return raw || 'offline';
  }, []);

  const updateRowFromSocket = useCallback((payload: any) => {
    const employeeId = payload?.employeeId || payload?.userId;
    if (!employeeId) return;

    const nextStatus = normalizeStatus(payload?.status);
    setRows(prev => prev.map((row) => {
      if (String(row.id) !== String(employeeId)) return row;
      return {
        ...row,
        current_status: nextStatus,
        last_active: payload?.lastActivity || payload?.timestamp || row.last_active,
        current_app: payload?.currentApp ?? row.current_app,
      };
    }));
  }, [normalizeStatus]);

  // ── Fetch logic extracted into a stable callback ──────────────────────
  const fetchData = useCallback(() => {
    if (!token) return;
    fetch(`/api/reports?type=daily&date=${date}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async r => {
        if (!r.ok) {
          const text = await r.text();
          console.error(`/api/reports failed ${r.status}`, text);
          return { rows: [] };
        }
        return r.json();
      })
      .then(d => {
        const normalized = (Array.isArray(d?.rows) ? d.rows : []).map((r: any) => ({
          ...r,
          total_seconds:    Number(r.total_seconds)    || 0,
          screenshot_count: Number(r.screenshot_count) || 0,
          avg_activity_pct: r.avg_activity_pct == null ? null : Number(r.avg_activity_pct),
          session_count:    Number(r.session_count)    || 0,
        }));
        setRows(normalized);
        setLoading(false);
        setLastSynced(new Date());
      })
      .catch(e => {
        console.error('Dashboard fetch error:', e);
        setRows([]);
        setLoading(false);
      });
  }, [date, token]);

  // Initial fetch whenever date or token changes
  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // ── Auto-refresh every 60 seconds for active sessions ─────────────────
  useEffect(() => {
    const id = setInterval(fetchData, 60_000);
    return () => clearInterval(id);
  }, [fetchData]);

  // ── Live status updates from the socket server ────────────────────────
  useEffect(() => {
    if (!token || !user?.id) return;

    const socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      socket.emit('register', { role: user?.role || 'admin', employeeId: user?.id || null, token });
    });

    socket.on('employee-status', updateRowFromSocket);

    return () => {
      try {
        socket.disconnect();
      } catch {}
    };
  }, [token, user?.id, user?.role, updateRowFromSocket]);

  // ── Derived stats ─────────────────────────────────────────────────────
  const active   = rows.filter(r => r.current_status === 'working' || r.current_status === 'on_break').length;
  const totHrs   = rows.reduce((a, r) => a + r.total_seconds, 0);
  const totShots = rows.reduce((a, r) => a + r.screenshot_count, 0);
  const activityValues = rows
    .map(r => r.avg_activity_pct)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const avgAct = activityValues.length
    ? Math.round(activityValues.reduce((a, v) => a + v, 0) / activityValues.length)
    : null;

  const statusLabels: Record<string, string> = {
    working:      'Working',
    on_break:     'On Break',
    checked_out:  'Checked Out',
    offline:      'Offline',
  };

  const statusColors: Record<string, string> = {
    working:     '#22C55E',
    on_break:    '#F59E0B',
    checked_out: '#60A5FA',
    offline:     '#94A3B8',
  };

  const statCards = [
    { label: 'Active Today',  value: active,                                                               color: '#22C55E',  sub: `of ${rows.length} employees` },
    { label: 'Total Hours',   value: precise ? fmtPrecise(totHrs) : fmtCompact(totHrs),                   color: '#3B82F6',  sub: 'logged today' },
    { label: 'Screenshots',   value: totShots,                                                             color: '#A78BFA',  sub: 'taken today' },
    { label: 'Avg Activity',  value: avgAct == null ? '--' : `${avgAct}%`,                                 color: avgAct == null ? '#94A3B8' : (avgAct < 40 ? '#F8D000' : '#22C55E'), sub: 'keyboard + mouse' },
  ];

  return (
    <div style={styles.page}>
      {/* Top row */}
      <div style={styles.topRow}>
        <div>
          <h1
style={{
fontSize:34,
fontWeight:800,
margin:0,
}}
>
Here's what's happening today., {user?.name}
</h1>
          <p style={styles.subtext}>Welcome back, {user?.name}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={styles.dateInput}
          />
          <button
            onClick={() => {
              setPrecise(p => {
                const v = !p;
                try { localStorage.setItem('timePrecise', v ? '1' : '0'); } catch {}
                return v;
              });
            }}
            title="Toggle compact / precise time format"
            style={{
              padding: '8px 10px',
              borderRadius: 10,
              border: '1px solid rgba(248,250,252,.08)',
              background: 'transparent',
              color: '#F8FAFC',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {precise ? 'Precise' : 'Compact'}
          </button>
          {/* Manual refresh button */}
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            title="Refresh now"
            style={{
              padding: '8px 10px',
              borderRadius: 10,
              border: '1px solid rgba(248,250,252,.08)',
              background: 'transparent',
              color: '#F8FAFC',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            ↻
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div style={styles.statsGrid}>
        {statCards.map(c => (
          <div
    key={c.label}
    style={styles.statCard}
    onMouseEnter={(e)=>{
        e.currentTarget.style.transform='translateY(-6px)';
        e.currentTarget.style.boxShadow='0 25px 50px rgba(0,0,0,.45)';
    }}
    onMouseLeave={(e)=>{
        e.currentTarget.style.transform='translateY(0)';
        e.currentTarget.style.boxShadow='0 15px 40px rgba(0,0,0,.35)';
    }}
>
            <div style={styles.statLabel}>{c.label}</div>
            <div
style={{
    fontSize:34,
    fontWeight:800,
    background:`linear-gradient(90deg,${c.color},#A78BFA)`,
    WebkitBackgroundClip:'text',
    color:'transparent'
}}
>{c.value}</div>
            <div style={styles.statSub}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div style={styles.tableCard}>
        <div style={styles.tableHeader}>
          <span>Employee Summary — {date}</span>
          {lastSynced && (
            <span style={{ fontSize: 11, color: 'rgba(248,250,252,.3)', fontWeight: 400 }}>
              Last synced: {lastSynced.toLocaleTimeString()} · auto-refreshes every 60s
            </span>
          )}
        </div>

        {loading ? (
          <div style={styles.loading}>Loading…</div>
        ) : (
          <table style={styles.table}>
            <thead style={styles.thead}>
              <tr>
                {['Employee', 'Status', 'Hours', 'Screenshots', 'Activity', 'Last Active'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  style={{
                    borderBottom: i < rows.length - 1
                      ? '1px solid rgba(248,250,252,.06)'
                      : 'none',
                    transition: 'background .15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Name */}
                  <td style={{ ...styles.td, fontWeight: 600 }}>{r.name}</td>

                  {/* Status */}
                  <td style={styles.td}>
                    <span
style={{
display:'inline-flex',
alignItems:'center',
gap:8,
padding:'6px 14px',
borderRadius:999,
fontWeight:600,
background:'rgba(255,255,255,.06)',
border:`1px solid ${statusColors[r.current_status]}30`,
color:statusColors[r.current_status],
}}
>
                      {statusLabels[r.current_status] || 'Offline'}
                    </span>
                  </td>

                  {/* Hours */}
                  <td style={r.total_seconds ? styles.td : styles.tdMuted}>
                    {precise ? fmtPrecise(r.total_seconds) : fmtCompact(r.total_seconds)}
                  </td>

                  {/* Screenshots */}
                  <td style={styles.td}>{r.screenshot_count}</td>

                  {/* Activity bar */}
                  <td style={styles.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        flex: 1,
                        height:8,
                        borderRadius:999,
                        background: 'rgba(248,250,252,.1)',
                        maxWidth: 80,
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          borderRadius: 2,
                          width: `${r.avg_activity_pct == null ? 0 : r.avg_activity_pct}%`,
                          background:
r.avg_activity_pct < 30
? 'linear-gradient(90deg,#F59E0B,#FBBF24)'
: 'linear-gradient(90deg,#22C55E,#06B6D4)'
                        }} />
                      </div>
                      <span
                        title={r.avg_activity_pct == null ? 'No activity data' : `${r.avg_activity_pct}%`}
                        style={{ fontSize: 11, color: 'rgba(248,250,252,.5)', minWidth: 36 }}
                      >
                        {r.avg_activity_pct == null ? '—' : `${r.avg_activity_pct.toFixed(1)}%`}
                      </span>
                    </div>
                  </td>

                  {/* Last active */}
                  <td style={styles.tdMuted} title={r.last_active ? timeAgo(r.last_active) : ''}>
                    {r.last_active
                      ? new Date(r.last_active).toLocaleString(undefined, {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit', second: '2-digit',
                        })
                      : '—'}
                  </td>
                </tr>
              ))}

              {!rows.length && (
                <tr>
                  <td colSpan={6} style={styles.emptyState}>
                    No data for this date
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}