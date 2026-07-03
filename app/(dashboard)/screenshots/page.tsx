'use client';
// app/(dashboard)/screenshots/page.tsx
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';

export default function ScreenshotsPage() {
  const { token } = useAuthStore();
  const [shots,   setShots]   = useState<any[]>([]);
  const [users,   setUsers]   = useState<any[]>([]);
  const [date,    setDate]    = useState(new Date().toISOString().slice(0,10));
  const [userId,  setUserId]  = useState('');
  const [preview, setPreview] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    fetch('/api/users',{headers:{Authorization:`Bearer ${token}`}})
      .then(r=>r.json()).then(d=>setUsers(d.filter((u:any)=>u.role==='employee')));
  },[token]);

  useEffect(()=>{
    const loadScreenshots = async () => {
      setLoading(true);
      setError('');
      if (!token) {
        setError('Not authenticated. Please sign in.');
        setShots([]);
        setLoading(false);
        return;
      }
      const p = new URLSearchParams({ date, limit: '80' });
      if (userId) p.set('userId', userId);
      try {
        const r = await fetch(`/api/screenshots?${p.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
        const text = await r.text();
        if (!r.ok) {
          console.error('/api/screenshots failed', r.status, text);
          setError(text || 'Failed to load screenshots');
          setShots([]);
          return;
        }
        setShots(JSON.parse(text || '[]'));
      } catch (err) {
        console.error('Failed to load screenshots', err);
        setError('Failed to load screenshots');
        setShots([]);
      } finally {
        setLoading(false);
      }
    };
    loadScreenshots();
  }, [date, userId, token]);

  return (
    <div>
      <div style={{ display:'flex',gap:10,alignItems:'center',marginBottom:20,flexWrap:'wrap' }}>
        <h1
style={{
    fontSize:34,
    fontWeight:800,
    color:"#F8FAFC",
    margin:0,
    flex:1,
}}
>
🖼️ Screenshots
</h1>
        <select value={userId} onChange={e=>setUserId(e.target.value)}
          style={{ padding:'12px 14px',
borderRadius:14,
border:'1px solid rgba(255,255,255,.08)',
background:'rgba(255,255,255,.05)',
backdropFilter:'blur(12px)',
color:'#F8FAFC',
fontSize:13,
outline:'none',
transition:'all .2s ease', }}>
          <option value="">All employees</option>
          {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)}
          style={{ padding:'7px 10px',borderRadius:8,border:'0.5px solid #e2e8f0',fontSize:13,background:'#fff' }}/>
      </div>

      {loading ? <div style={{ textAlign:'center',padding:60,color:'#94a3b8',fontSize:13 }}>📷 Loading screenshots...</div> : error ? (
        <div style={{ textAlign:'center',padding:'16px',
borderRadius:14,
background:'rgba(239,68,68,.12)',
border:'1px solid rgba(239,68,68,.25)',
color:'#FCA5A5',
fontWeight:600,fontSize:13 }}>{error}</div>
      ) : (
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',
gap:20, }}>
          {shots.map(s=>(
            <div
key={s.id}
onClick={()=>setPreview(s.file_url)}
onMouseEnter={(e)=>{
e.currentTarget.style.transform='translateY(-6px)';
e.currentTarget.style.boxShadow='0 25px 55px rgba(0,0,0,.45)';
}}
onMouseLeave={(e)=>{
e.currentTarget.style.transform='translateY(0)';
e.currentTarget.style.boxShadow='0 15px 35px rgba(0,0,0,.35)';
}}
             style={{
background:'rgba(20,25,40,.72)',
backdropFilter:'blur(20px)',
border:'1px solid rgba(255,255,255,.08)',
borderRadius:18,
overflow:'hidden',
cursor:'pointer',
transition:'all .25s ease',
boxShadow:'0 15px 35px rgba(0,0,0,.35)',
}}>
              <div style={{ aspectRatio:'16/9',background:'#020617',overflow:'hidden' }}>
                <img src={s.file_url} alt="" style={{ width:'100%',height:'100%',objectFit:'cover',
transition:'transform .3s ease', }}onMouseEnter={(e)=>{
e.currentTarget.style.transform='scale(1.05)';
}}

onMouseLeave={(e)=>{
e.currentTarget.style.transform='scale(1)';
}}
                  onError={e=>(e.currentTarget.style.display='none')}/>
              </div>
              <div style={{ padding:'8px 10px' }}>
                <div style={{ fontSize:14,
fontWeight:700,
color:'#F8FAFC',marginBottom:2 }}>{s.user_name}</div>
                <div style={{ fontSize:10,color:'#94a3b8',display:'flex',justifyContent:'space-between' }}>
                  <span>{s.active_app||'—'}</span>
                  <span>{new Date(s.captured_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                </div>
                <div style={{ marginTop:4,height:3,background:'#020617',borderRadius:2 }}>
                  <div style={{ height:'100%',borderRadius:2,width:`${s.activity_pct||0}%`,background:
(s.activity_pct||0)<30
?'linear-gradient(90deg,#F59E0B,#FB923C)'
:'linear-gradient(90deg,#22C55E,#06B6D4)', }}/>
                </div>
              </div>
            </div>
          ))}
          {!shots.length&&<div style={{ gridColumn:'1/-1',textAlign:'center',padding:60,color:'#94a3b8',fontSize:13 }}>🖼️ No screenshots found for the selected date.</div>}
        </div>
      )}

      {preview&&(
        <div onClick={()=>setPreview(null)} style={{ position:'fixed',inset:0,background:'rgba(2,6,23,.92)',
backdropFilter:'blur(12px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,cursor:'pointer' }}>
          <img src={preview} style={{ maxWidth:'92vw',maxHeight:'92vh',borderRadius:20,
boxShadow:'0 25px 60px rgba(0,0,0,.5)', }}/>
        </div>
      )}
    </div>
  );
}
