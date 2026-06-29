'use client';
// app/(dashboard)/reports/page.tsx
import { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAuthStore } from '@/store/auth';

function fmt(s:number){ return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`; }

const COLORS = {
  bg: '#0B0F1A',
  card: '#12172A',
  cardBorder: 'rgba(255,255,255,.08)',
  text: '#F8FAFC',
  textMuted: '#9AA3B2',
  textFaint: 'rgba(248,250,252,.35)',
  grid: 'rgba(255,255,255,.08)',
  blue: '#3B82F6',
  blueLight: '#60A5FA',
  purple: '#A78BFA',
  tooltipBg: '#1F2937',
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background:
      'radial-gradient(1200px 600px at 20% 0%, rgba(0,80,176,.18), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(248,208,0,.10), transparent 55%), ' + COLORS.bg,
    color: COLORS.text,
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    padding: '28px 32px',
  },
  heading: {
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 24,
    color: COLORS.text,
    letterSpacing: '-0.01em',
  },
  cardHeader: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 18,
    color: COLORS.text,
    letterSpacing: '0.01em',
  },
  card: {
    border: `1px solid ${COLORS.cardBorder}`,
    background: COLORS.card,
    borderRadius: 18,
    padding: '20px 22px',
    boxShadow: '0 10px 30px rgba(0,0,0,.35)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    marginBottom: 16,
  },
  tableCard: {
    border: `1px solid ${COLORS.cardBorder}`,
    background: COLORS.card,
    backdropFilter: 'blur(10px)',
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 16,
    boxShadow: '0 8px 24px rgba(0,0,0,.22)',
  },
  tableHeader: {
    padding: '14px 16px',
    borderBottom: `1px solid ${COLORS.cardBorder}`,
    fontSize: 14,
    fontWeight: 600,
    color: COLORS.text,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    padding: '9px 16px',
    textAlign: 'left',
    fontWeight: 500,
    color: COLORS.textFaint,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderBottom: `1px solid ${COLORS.cardBorder}`,
  },
  td: {
    padding: '9px 16px',
    color: COLORS.text,
  },
  emptyState: {
    height: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: COLORS.textMuted,
    fontSize: 13,
  },
};

const axisTickStyle = { fontSize: 12, fill: COLORS.textMuted, fontWeight: 500 };

const tooltipStyle = {
  background: COLORS.tooltipBg,
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: 10,
  color: COLORS.text,
  fontSize: 12,
  padding: '8px 12px',
  boxShadow: '0 8px 20px rgba(0,0,0,.4)',
};

export default function ReportsPage() {
  const { token } = useAuthStore();
  const [daily,  setDaily]  = useState<any[]>([]);
  const [weekly, setWeekly] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return; // wait for the real token instead of firing with null/undefined

    const date = new Date().toISOString().slice(0, 10);

    fetch(`/api/reports?type=daily&date=${date}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setDaily(Array.isArray(d?.rows) ? d.rows : []))
      .catch(() => setDaily([]));

    fetch(`/api/reports?type=weekly`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setWeekly(Array.isArray(d) ? d : []))
      .catch(() => setWeekly([]));
  }, [token]);

  const chartDaily = daily
    .sort((a,b)=>(b.total_seconds||0)-(a.total_seconds||0))
    .slice(0,10)
    .map(r=>({ name: r.name.split(' ')[0], hours: +(r.total_seconds/3600).toFixed(1), activity: r.avg_activity_pct||0 }));

  const chartWeekly = weekly.map(w=>({
    day: new Date(w.day).toLocaleDateString('en',{weekday:'short'}),
    hours: +(w.total_seconds/3600).toFixed(1),
    users: w.active_users,
  }));

  const hasDaily = chartDaily.length > 0;
  const hasWeekly = chartWeekly.length > 0;

  return (
    <div style={styles.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={styles.heading}>Reports &amp; Analytics</h1>
        <a href="/reports/security" style={{ color: '#F8D000', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Security Report</a>
      </div>

      <div style={styles.grid}>
        {/* Hours today bar chart */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>Hours worked today</div>
          {hasDaily ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartDaily} margin={{ top:8, right:8, left:-20, bottom:0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="name" tick={axisTickStyle} axisLine={false} tickLine={false}/>
                <YAxis tick={axisTickStyle} axisLine={false} tickLine={false}/>
                <Tooltip formatter={(v:any)=>`${v}h`} contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,.04)' }}/>
                <Bar dataKey="hours" fill={COLORS.blue} radius={[6,6,0,0]} maxBarSize={48}/>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={styles.emptyState}>No activity recorded yet today</div>
          )}
        </div>

        {/* Activity % bar chart */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>Activity level today (%)</div>
          {hasDaily ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartDaily} margin={{ top:8, right:8, left:-20, bottom:0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="name" tick={axisTickStyle} axisLine={false} tickLine={false}/>
                <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} domain={[0,100]}/>
                <Tooltip formatter={(v:any)=>`${v}%`} contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,.04)' }}/>
                <Bar dataKey="activity" fill={COLORS.blueLight} radius={[6,6,0,0]} maxBarSize={48}/>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={styles.emptyState}>No activity recorded yet today</div>
          )}
        </div>
      </div>

      {/* Weekly trend line chart */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>Weekly trend — hours logged per day</div>
        {hasWeekly ? (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartWeekly} margin={{ top:8, right:8, left:-20, bottom:0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="day" tick={axisTickStyle} axisLine={false} tickLine={false}/>
                <YAxis tick={axisTickStyle} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(255,255,255,.15)' }}/>
                <Line type="monotone" dataKey="hours" stroke={COLORS.blue} strokeWidth={2.5} dot={{ fill: COLORS.blue, r: 4 }} activeDot={{ r: 6 }}/>
                <Line type="monotone" dataKey="users" stroke={COLORS.purple} strokeWidth={2.5} dot={{ fill: COLORS.purple, r: 4 }} activeDot={{ r: 6 }}/>
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display:'flex', gap:20, justifyContent:'center', marginTop:14 }}>
              <span style={{ fontSize:12, color: COLORS.textMuted, display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width:10, height:10, borderRadius:'50%', background: COLORS.blue, display:'inline-block' }}/> Hours
              </span>
              <span style={{ fontSize:12, color: COLORS.textMuted, display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width:10, height:10, borderRadius:'50%', background: COLORS.purple, display:'inline-block' }}/> Active users
              </span>
            </div>
          </>
        ) : (
          <div style={styles.emptyState}>No weekly data yet — check back after a few days of activity</div>
        )}
      </div>
    </div>
  );
}