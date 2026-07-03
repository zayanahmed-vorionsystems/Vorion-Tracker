'use client';
// app/(dashboard)/reports/page.tsx
import { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAuthStore } from '@/store/auth';
import Link from 'next/link';
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
    background: `
linear-gradient(180deg,#020617,#0F172A),
radial-gradient(circle at top left,#2563EB30 0%,transparent 35%),
radial-gradient(circle at bottom right,#9333EA20 0%,transparent 40%)
`,
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
  cardHeader:{
fontSize:15,
fontWeight:700,
marginBottom:20,
color:"#F8FAFC",
letterSpacing:'.02em',
},
  card:{
background:'rgba(20,25,40,.72)',
backdropFilter:'blur(20px)',
WebkitBackdropFilter:'blur(20px)',
border:'1px solid rgba(255,255,255,.08)',
borderRadius:22,
padding:'24px',
boxShadow:'0 20px 50px rgba(0,0,0,.35)',
transition:'all .25s ease',
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

const tooltipStyle={
background:'rgba(15,23,42,.95)',
border:'1px solid rgba(255,255,255,.08)',
borderRadius:14,
backdropFilter:'blur(12px)',
color:'#F8FAFC',
padding:'10px 14px',
boxShadow:'0 15px 35px rgba(0,0,0,.45)',
};
function SummaryCard({
title,
value,
}:{
title:string;
value:any;
}){

return(
<div
style={{
background:'rgba(20,25,40,.72)',
backdropFilter:'blur(20px)',
border:'1px solid rgba(255,255,255,.08)',
borderRadius:20,
padding:'20px',
boxShadow:'0 15px 35px rgba(0,0,0,.35)',
}}
>

<div
style={{
fontSize:12,
color:'#94A3B8',
textTransform:'uppercase',
}}
>
{title}
</div>

<div
style={{
marginTop:10,
fontSize:30,
fontWeight:800,
background:'linear-gradient(90deg,#3B82F6,#A78BFA)',
WebkitBackgroundClip:'text',
color:'transparent',
}}
>
{value}
</div>

</div>
)
}
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
  .sort((a, b) => (b.total_seconds || 0) - (a.total_seconds || 0))
  .slice(0, 10)
  .map(r => ({
    name: r.name.split(' ')[0],
    hours: +(r.total_seconds / 3600).toFixed(1),
    activity: Number(r.avg_activity_pct) || 0,
  }));
  const chartWeekly = weekly.map(w=>({
    day: new Date(w.day).toLocaleDateString('en',{weekday:'short'}),
    hours: +(w.total_seconds/3600).toFixed(1),
    users: w.active_users,
  }));
const avgActivity =
  chartDaily.length > 0
    ? Math.round(
        chartDaily.reduce(
          (sum, item) => sum + Number(item.activity || 0),
          0
        ) / chartDaily.length
      )
    : 0;
  const hasDaily = chartDaily.length > 0;
  const hasWeekly = chartWeekly.length > 0;

  return (
    <div style={styles.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1
style={{
    fontSize:34,
    fontWeight:800,
    margin:0,
    color:"#F8FAFC",
}}
>
📊 Reports & Analytics
</h1>
        <Link
href="/reports/security"
style={{
padding:'10px 18px',
borderRadius:14,
background:'rgba(255,255,255,.05)',
border:'1px solid rgba(255,255,255,.08)',
backdropFilter:'blur(12px)',
color:'#F8FAFC',
fontWeight:600,
fontSize:13,
textDecoration:'none',
transition:'all .2s ease',
}}
>
  Security Report
</Link>
      </div>
<div
style={{
display:'grid',
gridTemplateColumns:'repeat(4,1fr)',
gap:18,
marginBottom:22,
}}
>

<SummaryCard
title="Employees"
value={daily.length}
/>

<SummaryCard
title="Hours"
value={chartDaily.reduce((a,b)=>a+b.hours,0).toFixed(1)}
/>

<SummaryCard
title="Avg Activity"
value={`${avgActivity}%`}
/>

<SummaryCard
title="Weekly Days"
value={weekly.length}
/>

</div>
      <div style={styles.grid}>
        {/* Hours today bar chart */}
        <div
style={styles.card}
onMouseEnter={(e)=>{
e.currentTarget.style.transform='translateY(-6px)';
e.currentTarget.style.boxShadow='0 28px 60px rgba(0,0,0,.45)';
}}
onMouseLeave={(e)=>{
e.currentTarget.style.transform='translateY(0)';
e.currentTarget.style.boxShadow='0 20px 50px rgba(0,0,0,.35)';
}}
>
          <div style={styles.cardHeader}>Hours worked today</div>
          {hasDaily ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartDaily} margin={{ top:8, right:8, left:-20, bottom:0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="name" tick={axisTickStyle} axisLine={false} tickLine={false}/>
                <YAxis tick={axisTickStyle} axisLine={false} tickLine={false}/>
                <Tooltip formatter={(v:any)=>`${v}h`} contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,.04)' }}/>
                <Bar dataKey="hours" fill="url(#hoursGradient)" radius={[6,6,0,0]} maxBarSize={48}/>
              </BarChart>
              <defs>
<linearGradient id="hoursGradient" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stopColor="#3B82F6"/>
<stop offset="100%" stopColor="#06B6D4"/>
</linearGradient>
</defs>
            </ResponsiveContainer>
          ) : (
            <div style={styles.emptyState}>📊 No activity recorded yet today</div>
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
                <Bar dataKey="activity" fill="url(#activityGradient)" radius={[6,6,0,0]} maxBarSize={48}/>
              </BarChart>
              <defs>
<linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stopColor="#8B5CF6"/>
<stop offset="100%" stopColor="#EC4899"/>
</linearGradient>
</defs>
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
                <Line type="monotone" dataKey="hours" stroke={COLORS.blue} strokeWidth={4} dot={{
fill:COLORS.blue,
r:6,
stroke:"#fff",
strokeWidth:2
}} activeDot={{ r: 6 }}/>
                <Line type="monotone" dataKey="users" stroke={COLORS.purple} strokeWidth={4} dot={{
fill:COLORS.blue,
r:6,
stroke:"#fff",
strokeWidth:2
}} activeDot={{ r: 6 }}/>
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display:'flex',
gap:28,
marginTop:20,
justifyContent:'center', }}>
              <span style={{ fontSize:12, color: COLORS.textMuted, display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width:10, height:10, borderRadius:'50%', background: COLORS.blue, display:'inline-block' }}/> Hours
              </span>
              <span style={{ fontSize:12, color: COLORS.textMuted, display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width:10, height:10, borderRadius:'50%', background: COLORS.purple, display:'inline-block' }}/> Active users
              </span>
            </div>
          </>
        ) : (
          <div style={styles.emptyState}>📈 Weekly analytics will appear after data is collected. — check back after a few days of activity</div>
        )}
      </div>
    </div>
  );
}