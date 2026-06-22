'use client';
// app/(dashboard)/dashboard/page.tsx
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';

function fmt(secs: number) {
  if (!secs) return '0h 0m';
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

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
    border: '1px solid rgba(248,250,252,.10)',
    background: 'rgba(11,15,26,.72)',
    backdropFilter: 'blur(10px)',
    borderRadius: 16,
    padding: '16px 18px',
    boxShadow: '0 8px 24px rgba(0,0,0,.22)',
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
    border: '1px solid rgba(248,250,252,.10)',
    background: 'rgba(11,15,26,.72)',
    backdropFilter: 'blur(10px)',
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(0,0,0,.22)',
  },
  tableHeader: {
    padding: '14px 18px',
    borderBottom: '1px solid rgba(248,250,252,.08)',
    fontSize: 14,
    fontWeight: 600,
    color: '#F8FAFC',
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
  const [rows,    setRows]    = useState<any[]>([]);
  const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/reports?type=daily&date=${date}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { setRows(d.rows || []); setLoading(false); });
  }, [date, token]);

  const active   = rows.filter(r => r.total_seconds > 0).length;
  const totHrs   = rows.reduce((a, r) => a + (r.total_seconds || 0), 0);
  const totShots = rows.reduce((a, r) => a + (r.screenshot_count || 0), 0);
  const avgAct   = rows.length
    ? Math.round(rows.reduce((a, r) => a + (r.avg_activity_pct || 0), 0) / rows.length)
    : 0;

  const statCards = [
    { label: 'Active Today',    value: active,          color: '#22C55E', sub: `of ${rows.length} employees` },
    { label: 'Total Hours',     value: fmt(totHrs),     color: '#3B82F6', sub: 'logged today' },
    { label: 'Screenshots',     value: totShots,        color: '#A78BFA', sub: 'taken today' },
    { label: 'Avg Activity',    value: `${avgAct}%`,    color: avgAct < 40 ? '#F8D000' : '#22C55E', sub: 'keyboard + mouse' },
  ];

  return (
    <div style={styles.page}>
      {/* Top row */}
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.heading}>Dashboard</h1>
          <p style={styles.subtext}>Welcome back, {user?.name}</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={styles.dateInput}
        />
      </div>

      {/* Stat cards */}
      <div style={styles.statsGrid}>
        {statCards.map(c => (
          <div key={c.label} style={styles.statCard}>
            <div style={styles.statLabel}>{c.label}</div>
            <div style={{ ...styles.statValue, color: c.color }}>{c.value}</div>
            <div style={styles.statSub}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div style={styles.tableCard}>
        <div style={styles.tableHeader}>
          Employee Summary — {date}
        </div>

        {loading ? (
          <div style={styles.loading}>Loading…</div>
        ) : (
          <table style={styles.table}>
            <thead style={styles.thead}>
              <tr>
                {['Employee', 'Hours', 'Screenshots', 'Activity', 'Last Active'].map(h => (
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
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,250,252,.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Name */}
                  <td style={{ ...styles.td, fontWeight: 600 }}>{r.name}</td>

                  {/* Hours */}
                  <td style={r.total_seconds ? styles.td : styles.tdMuted}>
                    {fmt(r.total_seconds)}
                  </td>

                  {/* Screenshots */}
                  <td style={styles.td}>{r.screenshot_count || 0}</td>

                  {/* Activity bar */}
                  <td style={styles.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        flex: 1,
                        height: 4,
                        background: 'rgba(248,250,252,.1)',
                        borderRadius: 2,
                        maxWidth: 80,
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          borderRadius: 2,
                          width: `${r.avg_activity_pct || 0}%`,
                          background: (r.avg_activity_pct || 0) < 30 ? '#F8D000' : '#22C55E',
                          transition: 'width .4s ease',
                        }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'rgba(248,250,252,.5)', minWidth: 28 }}>
                        {r.avg_activity_pct || 0}%
                      </span>
                    </div>
                  </td>

                  {/* Last active */}
                  <td style={styles.tdMuted}>
                    {r.last_active
                      ? new Date(r.last_active).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </td>
                </tr>
              ))}

              {!rows.length && (
                <tr>
                  <td colSpan={5} style={styles.emptyState}>
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