'use client';
// app/(dashboard)/timeline/page.tsx
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';

function fmt(secs: number) {
  if (!secs) return '—';
  return `${Math.floor(secs/3600)}h ${Math.floor((secs%3600)/60)}m`;
}

const LEGEND = [
  { color:'#3b82f6', label:'Work' },
  { color:'#a855f7', label:'Meeting' },
  { color:'#f59e0b', label:'Idle' },
  { color:'#e2e8f0', label:'Break' },
];
const HOURS = ['9am','10am','11am','12pm','1pm','2pm','3pm','4pm','5pm','6pm'];
const DAY_S = 9 * 3600;

export default function TimelinePage() {
  const { token } = useAuthStore();
  const [rows,    setRows]    = useState<any[]>([]);
  const [date,    setDate]    = useState(new Date().toISOString().slice(0,10));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/reports?type=daily&date=${date}`, { headers:{ Authorization:`Bearer ${token}` } })
      .then(r=>r.json()).then(d=>{ setRows(d.rows||[]); setLoading(false); });
  }, [date, token]);

  function pct(s: number) { return Math.min(100,(s/DAY_S)*100); }

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
        <h1 style={{ fontSize:20,fontWeight:500 }}>Timeline</h1>
        <div style={{ display:'flex',gap:12,alignItems:'center' }}>
          <div style={{ display:'flex',gap:10 }}>
            {LEGEND.map(l=>(
              <span key={l.label} style={{ display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#64748b' }}>
                <span style={{ width:10,height:10,background:l.color,borderRadius:2,display:'inline-block' }}/>
                {l.label}
              </span>
            ))}
          </div>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{ padding:'7px 10px',borderRadius:8,border:'0.5px solid #e2e8f0',fontSize:13,background:'#fff' }}/>
        </div>
      </div>

      <div style={{ background:'#fff',border:'0.5px solid #e2e8f0',borderRadius:10,padding:'16px 20px' }}>
        {/* Hour axis */}
        <div style={{ display:'flex',paddingLeft:120,marginBottom:8 }}>
          {HOURS.map(h=>(
            <div key={h} style={{ flex:1,fontSize:10,color:'#94a3b8',textAlign:'center' }}>{h}</div>
          ))}
        </div>

        {loading ? <div style={{ padding:40,textAlign:'center',color:'#94a3b8',fontSize:13 }}>Loading…</div> : (
          rows.map(r=>(
            <div key={r.id} style={{ display:'flex',alignItems:'center',gap:10,marginBottom:10 }}>
              <div style={{ width:110,fontSize:12,textAlign:'right',color:'#64748b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flexShrink:0 }}>
                {r.name}
              </div>
              <div style={{ flex:1,height:24,background:'#f1f5f9',borderRadius:4,position:'relative',overflow:'hidden' }}>
                {r.total_seconds>0 && (
                  <div style={{ position:'absolute',top:0,left:0,height:'100%',width:`${pct(r.total_seconds)}%`,background:'#3b82f6',borderRadius:4,opacity:0.85 }}/>
                )}
                {r.total_seconds===0 && (
                  <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',paddingLeft:8,fontSize:11,color:'#94a3b8' }}>No activity</div>
                )}
              </div>
              <div style={{ width:48,fontSize:11,color:'#64748b',flexShrink:0 }}>{fmt(r.total_seconds)}</div>
            </div>
          ))
        )}
        {!loading && rows.length===0 && (
          <div style={{ padding:40,textAlign:'center',color:'#94a3b8',fontSize:13 }}>No data for this date</div>
        )}
      </div>
    </div>
  );
}
