'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useRouter } from "next/navigation";


const ROLES = ['super_admin','admin','executive','qa_manager','team_lead','employee'];
const ROLE_COLOR: Record<string,string> = {
  super_admin:'#7c3aed',admin:'#818CF8',executive:'#0369a1',qa_manager:'#0f766e',team_lead:'#b45309',employee:'#374151'
};

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
  heading: { fontSize: 22, fontWeight: 600, marginBottom: 4, color: '#F8FAFC' },
  subtext: { fontSize: 13, color: 'rgba(248,250,252,.55)', marginTop: 4 },
  button:{
padding:'10px 18px',
borderRadius:14,
background:'linear-gradient(90deg,#2563EB,#3B82F6)',
color:'#fff',
fontWeight:600,
border:'none',
cursor:'pointer',
transition:'all .25s ease',
boxShadow:'0 10px 25px rgba(37,99,235,.35)',
},
  card:{
background:'rgba(20,25,40,.72)',
backdropFilter:'blur(20px)',
WebkitBackdropFilter:'blur(20px)',
border:'1px solid rgba(255,255,255,.08)',
borderRadius:22,
padding:'28px',
boxShadow:'0 20px 50px rgba(0,0,0,.35)',
},
  cardHeader: { fontSize: 14, fontWeight: 600, marginBottom: 16, color: '#F8FAFC' },
  input:{
width:'100%',
padding:'12px 14px',
borderRadius:14,
border:'1px solid rgba(255,255,255,.08)',
background:'rgba(255,255,255,.05)',
backdropFilter:'blur(10px)',
fontSize:14,
color:'#F8FAFC',
outline:'none',
transition:'all .2s ease',
},
 tableCard:{
background:'rgba(20,25,40,.72)',
backdropFilter:'blur(20px)',
border:'1px solid rgba(255,255,255,.08)',
borderRadius:22,
overflow:'hidden',
boxShadow:'0 20px 50px rgba(0,0,0,.35)',
},
  th: {
    padding: '10px 16px',
    textAlign: 'left',
    fontWeight: 600,
    color: 'rgba(248,250,252,.45)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderBottom: '1px solid rgba(248,250,252,.08)',
  },
  td: { padding:'10px 16px', color:'#F8FAFC', fontSize:13 },
  tdMuted: { padding:'10px 16px', color:'rgba(248,250,252,.5)', fontSize:13 },
  emptyState: { padding:40, textAlign:'center', color:'rgba(248,250,252,.3)', fontSize:13 },
};

export default function UsersClient({ initialUsers }: { initialUsers: any[] }) {
  const { token } = useAuthStore();
  const [users,   setUsers]   = useState<any[]>(initialUsers || []);
  const [show,    setShow]    = useState(false);
  const [editing, setEditing] = useState<any|null>(null);
  const [form,    setForm]    = useState({ name:'',email:'',role:'employee',departmentId:'',password:'',confirmPassword:'' });
  const [error,   setError]   = useState('');
  const [saving,  setSaving]  = useState(false);

  const h = { Authorization:`Bearer ${token}` };
  const load = () => fetch('/api/users',{headers:h}).then(r=>r.json()).then(setUsers);
const router = useRouter();
  const F = (k:string,v:string) => setForm(p=>({...p,[k]:v}));

  async function save(e: React.FormEvent) {
  e.preventDefault();
  setSaving(true);
  setError('');
  try {
    if (form.password || form.confirmPassword) {
      if (form.password !== form.confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (form.password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
    }

    const body = editing
      ? {
          id: editing.id,
          name: form.name,
          email: form.email,
          role: form.role,
          departmentId: form.departmentId,
          ...(form.password ? { password: form.password } : {}),
        }
      : form;

    const res = await fetch('/api/users', {
      method: editing ? 'PATCH' : 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    let data: any = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      setError(data.error || `Failed (status ${res.status})`);
      return;
    }

    setShow(false);
    setEditing(null);
    setForm({ name: '', email: '', role: 'employee', departmentId: '', password: '', confirmPassword: '' });
    load();
  } finally {
    setSaving(false);
  }
}

  function edit(u:any) {
    setEditing(u);
    setForm({
      name: u.name,
      email: u.email,
      role: u.role,
      departmentId: u.department_id || '',
      password: '',
      confirmPassword: '',
    });
    setShow(true);
  }
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
border:'1px solid rgba(255,255,255,.08)',
borderRadius:20,
padding:'20px',
backdropFilter:'blur(20px)',
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
background:'linear-gradient(90deg,#3B82F6,#8B5CF6)',
WebkitBackgroundClip:'text',
color:'transparent',
}}
>
{value}
</div>

</div>

)

}
  async function removeUser(u:any) {
    if (!confirm(`Delete user ${u.name}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'DELETE',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to delete user');
        return;
      }
      load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.page}>
      
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
        <div>
         <h1
style={{
fontSize:34,
fontWeight:800,
margin:0,
color:"#F8FAFC",
}}
>
👥 User Management
</h1>
          <p
style={{
fontSize:14,
color:"#94A3B8",
marginTop:6,
}}
>
Manage users, roles and permissions
</p>
        </div>
        <button
          onClick={()=>{ setEditing(null); setForm({name:'',email:'',role:'employee',departmentId:'',password:'',confirmPassword:''}); setShow(true); }}
          style={styles.button}>
          + Add User
        </button>
      </div>
<div
style={{
display:'grid',
gridTemplateColumns:'repeat(3,1fr)',
gap:18,
marginBottom:24,
}}
>

<SummaryCard
title="Users"
value={users.length}
/>

<SummaryCard
title="Roles"
value={new Set(users.map(u=>u.role)).size}
/>

<SummaryCard
title="Admins"
value={users.filter(u=>u.role==='admin').length}
/>

</div>
      {show && (
        
        <div style={styles.card}>
          <div style={{ marginBottom: 16 }}>
  <button
    style={{
      ...styles.button,
      marginRight: 10,
    }}
    onClick={() => router.back()}
  >
    ← Back
  </button>
</div>
          <div style={styles.cardHeader}>{editing?'Edit user':'New user'}</div>
          
          <form onSubmit={save}>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12 }}>
              <div>
                <label style={{ fontSize:11,
fontWeight:700,
letterSpacing:'.08em',
color:'rgba(255,255,255,.55)',
textTransform:"uppercase",display:'block',marginBottom:4 }}>Full name</label>
                <input style={styles.input} required value={form.name} onChange={e=>F('name',e.target.value)}/>
              </div>
              <div>
                <label style={{ fontSize:11,
fontWeight:700,
letterSpacing:'.08em',
color:'rgba(255,255,255,.55)',
textTransform:"uppercase",display:'block',marginBottom:4 }}>Email</label>
                <input style={styles.input} type="email" required value={form.email} onChange={e=>F('email',e.target.value)}/>
              </div>
              <div>
                <label style={{ fontSize:11,
fontWeight:700,
letterSpacing:'.08em',
color:'rgba(255,255,255,.55)',
textTransform:"uppercase",display:'block',marginBottom:4 }}>Role</label>
                <select style={styles.input} value={form.role} onChange={e=>F('role',e.target.value)}>
                  {ROLES.map(r=><option key={r} value={r}>{r.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12 }}>
              <div>
                <label style={{ fontSize:11,
fontWeight:700,
letterSpacing:'.08em',
color:'rgba(255,255,255,.55)',
textTransform:"uppercase",display:'block',marginBottom:4 }}>
                  {editing ? 'New password (leave blank to keep)' : 'Password'}
                </label>
                <input
                  style={styles.input}
                  type="password"
                  value={form.password}
                  onChange={e=>F('password',e.target.value)}
                  minLength={editing ? undefined : 8}
                  placeholder={editing ? 'Optional password reset' : 'At least 8 characters'}
                  autoComplete={editing ? 'new-password' : 'new-password'}
                />
              </div>
              <div>
                <label style={{ fontSize:11,
fontWeight:700,
letterSpacing:'.08em',
color:'rgba(255,255,255,.55)',
textTransform:"uppercase",display:'block',marginBottom:4 }}>Confirm password</label>
                <input
                  style={styles.input}
                  type="password"
                  value={form.confirmPassword}
                  onChange={e=>F('confirmPassword',e.target.value)}
                  placeholder={editing ? 'Repeat new password' : 'Repeat password'}
                  autoComplete={editing ? 'new-password' : 'new-password'}
                />
              </div>
            </div>
            {error&&<div style={{ padding:'12px',
borderRadius:12,
background:'rgba(220,38,38,.12)',
border:'1px solid rgba(220,38,38,.25)',
color:'#FCA5A5',
fontWeight:500,fontSize:11,
letterSpacing:'.08em',
marginBottom:10 }}>{error}</div>}
            <div style={{ display:'flex',gap:8 }}>
              <button type="submit" disabled={saving} style={styles.button}>
                {saving?'Saving…':editing?'Save changes':'Create user'}
              </button>
              <button type="button" onClick={()=>setShow(false)}
                style={{ padding:'7px 16px',borderRadius:8,border:'1px solid rgba(248,250,252,.12)',fontSize:13,cursor:'pointer',background:'transparent',color:'#F8FAFC' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={styles.tableCard}>
        <table style={{ width:'100%',borderCollapse:'collapse' }}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Role</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u=>(
              <tr
key={u.id}
style={{
transition:'all .25s ease',
}}
onMouseEnter={(e)=>{
e.currentTarget.style.background='rgba(255,255,255,.04)';
}}
onMouseLeave={(e)=>{
e.currentTarget.style.background='transparent';
}}
>
                <td style={styles.td}>{u.name}</td>
                <td style={styles.td}>{u.email}</td>
                <td style={styles.td}>
<span
style={{
display:'inline-flex',
alignItems:'center',
padding:'6px 14px',
borderRadius:999,
background:'rgba(255,255,255,.05)',
border:`1px solid ${ROLE_COLOR[u.role]}30`,
color:ROLE_COLOR[u.role],
fontWeight:600,
fontSize:12,
}}
>
{(u.role||'').replace(/_/g,' ')}
</span>
</td>
                <td style={styles.td}>{u.department_id || '—'}</td>
                <td style={styles.td}>
                  <button onClick={()=>edit(u)} style={{ ...styles.button, padding:'6px 12px', fontSize:12 }}>Edit</button>
                  <button onClick={()=>removeUser(u)} style={{ ...styles.button, padding:'6px 12px', fontSize:11,
fontWeight:700,
letterSpacing:'.08em',
color:'rgba(255,255,255,.55)', background:'linear-gradient(90deg,#DC2626,#EF4444)', marginLeft:8 }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {users.length===0 && (
              <tr>
                <td colSpan={5} style={styles.emptyState}>No users found. Start by adding a new user.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}