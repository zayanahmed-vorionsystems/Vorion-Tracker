'use client';
// app/(dashboard)/timeline/page.tsx
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';

function fmt(secs: number) {
  if (!secs) return '—';
  return `${Math.floor(secs/3600)}h ${Math.floor((secs%3600)/60)}m`;
}

const COLORS = {
  card: '#12172A',
  cardBorder: 'rgba(255,255,255,.08)',
  text: '#F8FAFC',
  textMuted: '#9AA3B2',
  textFaint: 'rgba(248,250,252,.35)',
  track: 'rgba(255,255,255,.06)',
  inputBg: 'rgba(255,255,255,.05)',
};

const LEGEND = [
  { color:'#3B82F6', label:'Work' },
  { color:'#A78BFA', label:'Meeting' },
  { color:'#F59E0B', label:'Idle' },
  { color:'#475569', label:'Break' },
];
const HOURS = ['9am','10am','11am','12pm','1pm','2pm','3pm','4pm','5pm','6pm'];
const DAY_S = 9 * 3600;

export default function TimelinePage() {
  const { token } = useAuthStore();
  const [rows,    setRows]    = useState<any[]>([]);
  const [date,    setDate]    = useState(new Date().toISOString().slice(0,10));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/reports?type=daily&date=${date}`, { headers:{ Authorization:`Bearer ${token}` } })
      .then(r=>r.json())
      .then(d=>{ setRows(Array.isArray(d?.rows) ? d.rows : []); setLoading(false); })
      .catch(()=>{ setRows([]); setLoading(false); });
  }, [date, token]);

  function pct(s: number) { return Math.min(100,(s/DAY_S)*100); }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24, flexWrap:'wrap', gap:14 }}>
        <h1 style={{ fontSize:24, fontWeight:700, color: COLORS.text, letterSpacing:'-0.01em', margin:0 }}>Timeline</h1>
        <div style={{ display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ display:'flex', gap:14 }}>
            {LEGEND.map(l=>(
              <span key={l.label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color: COLORS.textMuted, fontWeight:500 }}>
                <span style={{ width:10, height:10, background:l.color, borderRadius:3, display:'inline-block' }}/>
                {l.label}
              </span>
            ))}
          </div>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{
              padding:'8px 12px', borderRadius:10,
              border:`1px solid ${COLORS.cardBorder}`,
              fontSize:13, background: COLORS.inputBg,
              color: COLORS.text, colorScheme: 'dark',
              outline:'none',
            }}/>
        </div>
      </div>

      <div style={{
        background: COLORS.card,
        border:`1px solid ${COLORS.cardBorder}`,
        borderRadius:18, padding:'22px 24px',
        boxShadow:'0 10px 30px rgba(0,0,0,.35)',
      }}>
        {/* Hour axis */}
        <div style={{ display:'flex', paddingLeft:128, marginBottom:14 }}>
          {HOURS.map(h=>(
            <div key={h} style={{ flex:1, fontSize:11, color: COLORS.textFaint, textAlign:'center', fontWeight:500 }}>{h}</div>
          ))}
        </div>

        {loading ? (
          <div style={{ padding:48, textAlign:'center', color: COLORS.textMuted, fontSize:13 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color: COLORS.textMuted, fontSize:13 }}>No data for this date</div>
        ) : (
          rows.map(r=>(
            <div key={r.id} style={{ display:'flex', alignItems:'center', gap:14, marginBottom:12 }}>
              <div style={{
                width:118, fontSize:13, fontWeight:500, textAlign:'right', color: COLORS.text,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flexShrink:0,
              }}>
                {r.name}
              </div>
              <div style={{ flex:1, height:26, background: COLORS.track, borderRadius:6, position:'relative', overflow:'hidden' }}>
                {r.total_seconds > 0 ? (
                  <div style={{
                    position:'absolute', top:0, left:0, height:'100%',
                    width:`${pct(r.total_seconds)}%`,
                    background: 'linear-gradient(90deg, #3B82F6, #60A5FA)',
                    borderRadius:6,
                  }}/>
                ) : (
                  <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', paddingLeft:10, fontSize:12, color: COLORS.textFaint }}>
                    No activity
                  </div>
                )}
              </div>
              <div style={{ width:52, fontSize:12, color: COLORS.textMuted, flexShrink:0, fontWeight:500 }}>
                {fmt(r.total_seconds)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}