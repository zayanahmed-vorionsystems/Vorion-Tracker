'use client';
// app/(dashboard)/reports/page.tsx
import { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAuthStore } from '@/store/auth';

function fmt(s:number){ return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`; }

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background:
      'radial-gradient(1200px 600px at 20% 0%, rgba(0,80,176,.22), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(248,208,0,.12), transparent 55%), #0B0F1A',
    color: '#F8FAFC',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    padding: '28px 32px',
  },
  heading: {
    fontSize: 22,
    fontWeight: 600,
    marginBottom: 24,
    color: '#F8FAFC',
  },
  card: {
    border: '1px solid rgba(248,250,252,.10)',
    background: 'rgba(11,15,26,.72)',
    backdropFilter: 'blur(10px)',
    borderRadius: 16,
    padding: '16px 18px',
    boxShadow: '0 8px 24px rgba(0,0,0,.22)',
  },
  cardHeader: {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 14,
    color: '#F8FAFC',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    marginBottom: 16,
  },
  tableCard: {
    border: '1px solid rgba(248,250,252,.10)',
    background: 'rgba(11,15,26,.72)',
    backdropFilter: 'blur(10px)',
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 16,
    boxShadow: '0 8px 24px rgba(0,0,0,.22)',
  },
  tableHeader: {
    padding: '14px 16px',
    borderBottom: '1px solid rgba(248,250,252,.08)',
    fontSize: 14,
    fontWeight: 600,
    color: '#F8FAFC',
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
    color: 'rgba(248,250,252,.45)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderBottom: '1px solid rgba(248,250,252,.08)',
  },
  td: {
    padding: '9px 16px',
    color: '#F8FAFC',
  },
};

export default function ReportsPage() {
  const { token } = useAuthStore();
  const [daily,  setDaily]  = useState<any[]>([]);
  const [weekly, setWeekly] = useState<any[]>([]);

  useEffect(() => {
    const date = new Date().toISOString().slice(0,10);
    fetch(`/api/reports?type=daily&date=${date}`,  { headers:{ Authorization:`Bearer ${token}` } })
      .then(r=>r.json()).then(d=>setDaily(d.rows||[]));
    fetch(`/api/reports?type=weekly`, { headers:{ Authorization:`Bearer ${token}` } })
      .then(r=>r.json()).then(d=>setWeekly(d||[]));
  },[token]);

  const chartDaily = daily
    .sort((a,b)=>(b.total_seconds||0)-(a.total_seconds||0))
    .slice(0,10)
    .map(r=>({ name: r.name.split(' ')[0], hours: +(r.total_seconds/3600).toFixed(1), activity: r.avg_activity_pct||0 }));

  const chartWeekly = weekly.map(w=>({
    day: new Date(w.day).toLocaleDateString('en',{weekday:'short'}),
    hours: +(w.total_seconds/3600).toFixed(1),
    users: w.active_users,
  }));

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Reports & Analytics</h1>

      <div style={styles.grid}>
        {/* Hours today bar chart */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>Hours worked today</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartDaily} margin={{ top:0,right:8,left:-20,bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(248,250,252,.08)"/>
              <XAxis dataKey="name" tick={{ fontSize:11, fill:'#F8FAFC' }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize:11, fill:'#F8FAFC' }} axisLine={false} tickLine={false}/>
              <Tooltip formatter={(v:any)=>`${v}h`} contentStyle={{ fontSize:12,borderRadius:8,background:'rgba(11,15,26,.9)',border:'1px solid rgba(248,250,252,.12)',color:'#F8FAFC' }}/>
              <Bar dataKey="hours" fill="#3B82F6" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Activity % bar chart */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>Activity level today (%)</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartDaily} margin={{ top:0,right:8,left:-20,bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(248,250,252,.08)"/>
              <XAxis dataKey="name" tick={{ fontSize:11, fill:'#F8FAFC' }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize:11, fill:'#F8FAFC' }} axisLine={false} tickLine={false} domain={[0,100]}/>
              <Tooltip formatter={(v:any)=>`${v}%`} contentStyle={{ fontSize:12,borderRadius:8,background:'rgba(11,15,26,.9)',border:'1px solid rgba(248,250,252,.12)',color:'#F8FAFC' }}/>
              <Bar dataKey="activity" fill="#22C55E" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weekly trend line chart */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>Weekly trend — hours logged per day</div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartWeekly} margin={{ top:0,right:8,left:-20,bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(248,250,252,.08)"/>
            <XAxis dataKey="day" tick={{ fontSize:11, fill:'#F8FAFC' }} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fontSize:11, fill:'#F8FAFC' }} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={{ fontSize:12,borderRadius:8,background:'rgba(11,15,26,.9)',border:'1px solid rgba(248,250,252,.12)',color:'#F8FAFC' }}/>
            <Line type="monotone" dataKey="hours" stroke="#3B82F6" strokeWidth={2} dot={{ fill:'#3B82F6',r:3 }}/>
            <Line type="monotone" dataKey="users" stroke="#A78BFA" strokeWidth={2} dot={{ fill:'#A78BFA',r:3 }}/>
          </LineChart>
        </ResponsiveContainer>
        <div style={{ display:'flex',gap:16,justifyContent:'center',marginTop:8 }}>
          <span style={{ fontSize:11,color:'rgba(248,250,252,.6)',display:'flex',alignItems:'center',gap:4 }}>
            <span style={{ width:12,height:2,background:'#3B82F6',display:'inline-block' }}/> Hours
          </span>
          <span style={{ fontSize:11,color:'rgba(248,250,252,.6)',display:'flex',alignItems:'center',gap:4 }}>
            <span style={{ width:12,height:2,background:'#A78BFA',display:'inline-block' }}/> Active users
          </span>
        </div>
      </div>
    </div>
  );
}   