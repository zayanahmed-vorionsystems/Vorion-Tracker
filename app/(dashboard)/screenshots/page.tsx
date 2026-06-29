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
        <h1 style={{ fontSize:20,fontWeight:500,flex:1 }}>Screenshots</h1>
        <select value={userId} onChange={e=>setUserId(e.target.value)}
          style={{ padding:'7px 10px',borderRadius:8,border:'0.5px solid #e2e8f0',fontSize:13,background:'#fff' }}>
          <option value="">All employees</option>
          {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)}
          style={{ padding:'7px 10px',borderRadius:8,border:'0.5px solid #e2e8f0',fontSize:13,background:'#fff' }}/>
      </div>

      {loading ? <div style={{ textAlign:'center',padding:60,color:'#94a3b8',fontSize:13 }}>Loading…</div> : error ? (
        <div style={{ textAlign:'center',padding:60,color:'#F87171',fontSize:13 }}>{error}</div>
      ) : (
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:10 }}>
          {shots.map(s=>(
            <div key={s.id} onClick={()=>setPreview(s.file_url)}
              style={{ background:'#fff',borderRadius:8,border:'0.5px solid #e2e8f0',overflow:'hidden',cursor:'pointer' }}>
              <div style={{ aspectRatio:'16/9',background:'#f1f5f9',overflow:'hidden' }}>
                <img src={s.file_url} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }}
                  onError={e=>(e.currentTarget.style.display='none')}/>
              </div>
              <div style={{ padding:'8px 10px' }}>
                <div style={{ fontSize:11,fontWeight:500,marginBottom:2 }}>{s.user_name}</div>
                <div style={{ fontSize:10,color:'#94a3b8',display:'flex',justifyContent:'space-between' }}>
                  <span>{s.active_app||'—'}</span>
                  <span>{new Date(s.captured_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                </div>
                <div style={{ marginTop:4,height:3,background:'#f1f5f9',borderRadius:2 }}>
                  <div style={{ height:'100%',borderRadius:2,width:`${s.activity_pct||0}%`,background:(s.activity_pct||0)<30?'#f59e0b':'#22c55e' }}/>
                </div>
              </div>
            </div>
          ))}
          {!shots.length&&<div style={{ gridColumn:'1/-1',textAlign:'center',padding:60,color:'#94a3b8',fontSize:13 }}>No screenshots for this date</div>}
        </div>
      )}

      {preview&&(
        <div onClick={()=>setPreview(null)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,cursor:'pointer' }}>
          <img src={preview} style={{ maxWidth:'92vw',maxHeight:'92vh',borderRadius:8 }}/>
        </div>
      )}
    </div>
  );
}
