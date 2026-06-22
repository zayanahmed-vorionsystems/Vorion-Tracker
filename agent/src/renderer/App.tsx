'use client';
// agent/src/renderer/App.tsx
import React, { useEffect, useState } from 'react';

declare const window: any;

export default function App() {
  const [screen,   setScreen]   = useState<'login'|'tracker'>('login');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loggingIn,setLoggingIn]= useState(false);
  const [tracking, setTracking] = useState(false);
  const [idle,     setIdle]     = useState(false);
  const [userName, setUserName] = useState('');
  const [recent,   setRecent]   = useState<{time:string;app:string;pct:number}[]>([]);
  const [interval, setIntervalM]= useState(5);
  const [elapsed,  setElapsed]  = useState('00:00:00');
  const [startedAt,setStartedAt]= useState<number|null>(null);

  // Timer
  useEffect(()=>{
    const t = setInterval(()=>{
      if (startedAt) {
        const d=Math.floor((Date.now()-startedAt)/1000);
        setElapsed(`${String(Math.floor(d/3600)).padStart(2,'0')}:${String(Math.floor((d%3600)/60)).padStart(2,'0')}:${String(d%60).padStart(2,'0')}`);
      }
    },1000);
    return ()=>clearInterval(t);
  },[startedAt]);

  // IPC listeners + check saved status
  useEffect(()=>{
    window.agent?.onScreenshot((d:any)=>setRecent(p=>[d,...p].slice(0,8)));
    window.agent?.onIdle((d:any)=>setIdle(d.isIdle));
    window.agent?.onTracking((d:any)=>{ setTracking(d.tracking); if(d.tracking) setStartedAt(Date.now()); else {setStartedAt(null);setElapsed('00:00:00');} });
    window.agent?.getStatus().then((s:any)=>{
      if(s?.tracking){ setTracking(true); setUserName(s.userName||''); setScreen('tracker'); setStartedAt(Date.now()); }
      if(s?.intervalMin) setIntervalM(s.intervalMin);
    });
  },[]);

  async function login(e:React.FormEvent) {
    e.preventDefault(); setLoggingIn(true); setError('');
    try {
      const res = await window.agent?.login(email, password);
      if (res?.ok) {
        setUserName(res.user.name);
        setScreen('tracker');
        setTracking(true);
        setStartedAt(Date.now());
      } else {
        setError(res?.error || 'Login failed');
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoggingIn(false);
    }
  }

  const s: React.CSSProperties = { fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' };

  if (screen==='login') return (
    <div style={{ ...s,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f8fafc' }}>
      <div style={{ background:'#fff',borderRadius:12,border:'0.5px solid #e2e8f0',padding:'32px 28px',width:300 }}>
        <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:6 }}>
          <div style={{ width:8,height:8,borderRadius:'50%',background:'#22c55e' }}/>
          <span style={{ fontWeight:500,fontSize:15 }}>WorkTrack Agent</span>
        </div>
        <p style={{ fontSize:12,color:'#64748b',margin:'0 0 20px' }}>Sign in to start tracking your time</p>
        <form onSubmit={login}>
          <label style={{ fontSize:11,fontWeight:500,display:'block',marginBottom:4 }}>Work email</label>
          <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoFocus
            style={{ width:'100%',padding:'8px 10px',borderRadius:8,border:'0.5px solid #d1d5db',fontSize:13,marginBottom:12,outline:'none',boxSizing:'border-box' }}/>
          <label style={{ fontSize:11,fontWeight:500,display:'block',marginBottom:4 }}>Password</label>
          <input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"
            style={{ width:'100%',padding:'8px 10px',borderRadius:8,border:'0.5px solid #d1d5db',fontSize:13,marginBottom:16,outline:'none',boxSizing:'border-box' }}/>
          {error&&<div style={{ fontSize:12,color:'#dc2626',background:'#fef2f2',borderRadius:6,padding:'6px 10px',marginBottom:12 }}>{error}</div>}
          <button type="submit" disabled={loggingIn}
            style={{ width:'100%',padding:'9px',borderRadius:8,background:loggingIn?'#94a3b8':'#1e293b',color:'#fff',border:'none',fontWeight:500,fontSize:13,cursor:loggingIn?'not-allowed':'pointer' }}>
            {loggingIn?'Signing in…':'Sign in & start tracking'}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div style={{ ...s,background:'#f8fafc',minHeight:'100vh',padding:18 }}>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14 }}>
        <div style={{ display:'flex',alignItems:'center',gap:7 }}>
          <div style={{ width:8,height:8,borderRadius:'50%',background:tracking?'#22c55e':'#94a3b8',boxShadow:tracking?'0 0 0 3px rgba(34,197,94,0.2)':'none' }}/>
          <span style={{ fontWeight:500,fontSize:14 }}>WorkTrack</span>
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          {idle&&<span style={{ fontSize:10,padding:'2px 7px',borderRadius:99,background:'rgba(245,158,11,0.1)',color:'#d97706',fontWeight:500 }}>Idle</span>}
          <span style={{ fontSize:11,color:'#94a3b8' }}>{userName}</span>
        </div>
      </div>

      {/* Timer */}
      <div style={{ background:'#fff',borderRadius:10,border:'0.5px solid #e2e8f0',padding:'14px 16px',marginBottom:10 }}>
        <div style={{ fontSize:11,color:'#94a3b8',marginBottom:3 }}>Session time</div>
        <div style={{ fontSize:28,fontWeight:500,letterSpacing:'0.02em',color:tracking?'#1e293b':'#94a3b8',fontVariantNumeric:'tabular-nums' }}>{elapsed}</div>
        <span style={{ fontSize:10,padding:'2px 8px',borderRadius:99,fontWeight:500,marginTop:6,display:'inline-block',
          background:tracking?'rgba(34,197,94,0.1)':'#f1f5f9',color:tracking?'#16a34a':'#64748b' }}>
          {tracking?'● Tracking':'○ Paused'}
        </span>
      </div>

      {/* Controls */}
      <div style={{ display:'flex',gap:8,marginBottom:10 }}>
        <button onClick={()=>tracking?window.agent?.stopTracking():window.agent?.startTracking()}
          style={{ flex:1,padding:'8px',borderRadius:8,fontWeight:500,fontSize:12,cursor:'pointer',
            background:tracking?'#fff':'#1e293b',color:tracking?'#ef4444':'#fff',border:tracking?'0.5px solid #fca5a5':'none' }}>
          {tracking?'Pause':'Resume'}
        </button>
        <button onClick={()=>window.agent?.manualShot()}
          style={{ padding:'8px 12px',borderRadius:8,border:'0.5px solid #e2e8f0',background:'#fff',fontSize:12,cursor:'pointer' }}>
          📸 Now
        </button>
        <button onClick={()=>{ window.agent?.logout(); setScreen('login'); setTracking(false); setElapsed('00:00:00'); }}
          style={{ padding:'8px 10px',borderRadius:8,border:'0.5px solid #fca5a5',background:'#fff',fontSize:11,cursor:'pointer',color:'#ef4444' }}>
          Sign out
        </button>
      </div>

      {/* Interval */}
      <div style={{ background:'#fff',borderRadius:10,border:'0.5px solid #e2e8f0',padding:'10px 14px',marginBottom:10 }}>
        <div style={{ fontSize:11,fontWeight:500,marginBottom:7,color:'#374151' }}>Screenshot every</div>
        <div style={{ display:'flex',gap:6 }}>
          {[1,3,5,10].map(m=>(
            <button key={m} onClick={()=>{ setIntervalM(m); window.agent?.setInterval(m); }}
              style={{ padding:'4px 10px',borderRadius:6,fontSize:11,cursor:'pointer',fontWeight:interval===m?500:400,
                background:interval===m?'#1e293b':'#fff',color:interval===m?'#fff':'#374151',border:interval===m?'none':'0.5px solid #e2e8f0' }}>
              {m}m
            </button>
          ))}
        </div>
      </div>

      {/* Recent */}
      <div style={{ background:'#fff',borderRadius:10,border:'0.5px solid #e2e8f0',padding:'10px 14px' }}>
        <div style={{ fontSize:11,fontWeight:500,marginBottom:7,color:'#374151' }}>Recent captures</div>
        {recent.length===0
          ? <div style={{ fontSize:11,color:'#94a3b8' }}>No screenshots yet this session</div>
          : recent.map((r,i)=>(
            <div key={i} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0',borderBottom:i<recent.length-1?'0.5px solid #f1f5f9':'none' }}>
              <span style={{ fontSize:11,color:'#374151' }}>{r.app}</span>
              <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                <div style={{ width:36,height:3,background:'#f1f5f9',borderRadius:2 }}>
                  <div style={{ height:'100%',borderRadius:2,width:`${r.pct}%`,background:r.pct<30?'#f59e0b':'#22c55e' }}/>
                </div>
                <span style={{ fontSize:10,color:'#94a3b8' }}>{r.time}</span>
              </div>
            </div>
          ))
        }
      </div>
      <p style={{ fontSize:10,color:'#cbd5e1',textAlign:'center',marginTop:10 }}>Minimise to keep running in system tray</p>
    </div>
  );
}
