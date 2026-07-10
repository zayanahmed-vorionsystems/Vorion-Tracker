'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useRouter } from "next/navigation";

// ---- Vorion Brand Palette (kept consistent with dashboard/sidebar) ----
const BRAND = {
  black: '#0A0E1A',
  blackSoft: '#10182B',
  white: '#F5F7FA',
  blue: '#1E5AE0',
  blueSoft: 'rgba(30,90,224,.16)',
  yellow: '#F5C400',
  yellowSoft: 'rgba(245,196,0,.12)',
  border: 'rgba(245,247,250,.08)',
  muted: 'rgba(245,247,250,.5)',
  mutedFaint: 'rgba(245,247,250,.3)',
  danger: '#FF5C7A',
};

const ROLES = ['super_admin','admin','qa_manager','team_lead','employee'];
// employee and team_lead get password + confirm password fields here — the
// backend emails them their exact name/password directly once created.
//
// super_admin, admin, and qa_manager also use the admin-provided password flow.
const PASSWORD_ROLES = ['super_admin','admin','qa_manager','team_lead','employee']; // sab roles admin-set password use karte hain// sab roles admin-set password use karte hain// no roles use admin-set password anymore — everyone gets an invite link
const ROLE_COLOR: Record<string,string> = {
  super_admin:'#B45CFF',admin:BRAND.blue,qa_manager:'#2DD4BF',team_lead:BRAND.yellow,employee:BRAND.mutedFaint
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: `
linear-gradient(180deg,${BRAND.black},${BRAND.blackSoft}),
radial-gradient(circle at top left,${BRAND.blueSoft} 0%,transparent 35%),
radial-gradient(circle at bottom right,${BRAND.yellowSoft} 0%,transparent 40%)
`,
    color: BRAND.white,
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    padding: '28px 32px',
  },
  heading: { fontSize: 22, fontWeight: 600, marginBottom: 4, color: BRAND.white },
  subtext: { fontSize: 13, color: BRAND.muted, marginTop: 4 },
  button:{
padding:'10px 18px',
borderRadius:14,
background:`linear-gradient(90deg,${BRAND.blue},#4C8CFF)`,
color:'#fff',
fontWeight:600,
border:'none',
cursor:'pointer',
transition:'all .25s ease',
boxShadow:`0 10px 25px ${BRAND.blueSoft}`,
},
  card:{
background:'rgba(16,24,43,.75)',
backdropFilter:'blur(20px)',
WebkitBackdropFilter:'blur(20px)',
border:`1px solid ${BRAND.border}`,
borderRadius:22,
padding:'28px',
boxShadow:'0 20px 50px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.05)',
},
  cardHeader: { fontSize: 14, fontWeight: 600, marginBottom: 16, color: BRAND.white },
  input:{
width:'100%',
boxSizing:'border-box',
padding:'12px 14px',
borderRadius:14,
border:`1px solid ${BRAND.border}`,
background:'rgba(245,247,250,.05)',
backdropFilter:'blur(10px)',
fontSize:14,
lineHeight:1.4,
color:BRAND.white,
outline:'none',
transition:'all .2s ease',
},
 select:{
appearance:'none',
WebkitAppearance:'none',
MozAppearance:'none',
paddingRight:'42px',
backgroundImage:`linear-gradient(45deg, transparent 50%, ${BRAND.white} 50%), linear-gradient(135deg, ${BRAND.white} 50%, transparent 50%)`,
backgroundPosition:'calc(100% - 20px) calc(50% - 3px), calc(100% - 14px) calc(50% - 3px)',
backgroundSize:'6px 6px, 6px 6px',
backgroundRepeat:'no-repeat',
cursor:'pointer',
 },
 formGrid:{
display:'grid',
gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',
gap:12,
marginBottom:12,
alignItems:'start',
 },
 field:{
minWidth:0,
 },
 tableCard:{
background:'rgba(16,24,43,.78)',
backdropFilter:'blur(20px)',
border:`1px solid ${BRAND.border}`,
borderRadius:22,
overflow:'hidden',
boxShadow:'0 20px 50px rgba(0,0,0,.35)',
},
  th: {
    padding: '10px 16px',
    textAlign: 'left',
    fontWeight: 600,
    color: BRAND.mutedFaint,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderBottom: `1px solid ${BRAND.border}`,
  },
  td: { padding:'10px 16px', color:BRAND.white, fontSize:13 },
  tdMuted: { padding:'10px 16px', color:BRAND.muted, fontSize:13 },
  emptyState: { padding:40, textAlign:'center', color:BRAND.mutedFaint, fontSize:13 },
};

export default function UsersClient({ initialUsers }: { initialUsers: any[] }) {
  const { token } = useAuthStore();
  const [users,   setUsers]   = useState<any[]>(initialUsers || []);
  const [show,    setShow]    = useState(false);
  const [editing, setEditing] = useState<any|null>(null);
  // NOTE: default role changed from 'employee' to 'admin'
  const [form,    setForm]    = useState({ name:'',email:'',role:'admin',departmentId:'',password:'',confirmPassword:'' });
  const [error,   setError]   = useState('');
  const [saving,  setSaving]  = useState(false);

  const h = { Authorization:`Bearer ${token}` };
  const load = () => fetch('/api/users',{headers:h}).then(r=>r.json()).then(setUsers);
  const router = useRouter();
  const F = (k:string,v:string) => setForm(p=>({...p,[k]:v}));
  const requiresPassword = PASSWORD_ROLES.includes(form.role);

  async function save(e: React.FormEvent) {
  e.preventDefault();
  setSaving(true);
  setError('');
  try {
    if (!form.name || String(form.name).trim() === '') {
      setError('Full name is required');
      return;
    }

    if (!editing && requiresPassword) {
      if (!form.password || !form.confirmPassword) {
        setError('Password and confirm password are required');
        return;
      }
    }
    if (form.password || form.confirmPassword) {
  if (form.password !== form.confirmPassword) {
    setError('Passwords do not match');
    return;
  }
  if (form.password.length < 8) {
    setError('Password must be at least 8 characters');
    return;
  }
  const complexity = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=[\]{};':"\\|<>,./?`~])/;
  if (!complexity.test(form.password)) {
    setError('Password must include at least one lowercase, one uppercase, one digit, and one special character');
    return;
  }
}

    let body: any;
    if (editing) {
      body = {
        id: editing.id,
        name: form.name,
        email: form.email,
        role: form.role,
        departmentId: form.departmentId,
        ...(form.password ? { password: form.password } : {}),
      };
    } else {
  body = { name: form.name, email: form.email, role: form.role, departmentId: form.departmentId, password: form.password };
}
    console.log('[UsersClient] Sending user create/update', { body, method: editing ? 'PATCH' : 'POST' });
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
      console.error('[UsersClient] /api/users response error', res.status, data);
      setError(data.error || `Failed (status ${res.status})`);
      return;
    }

    console.log('[UsersClient] /api/users success', { status: res.status, data });

    if (!editing && data?.emailSent === false) {
      const message = `User created, but the verification email could not be sent. Please share the login details with ${form.email} manually.`;
      alert(message);
    }

    setShow(false);
    setEditing(null);
    // NOTE: default role changed from 'employee' to 'admin'
    setForm({ name: '', email: '', role: 'admin', departmentId: '', password: '', confirmPassword: '' });
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
background:'rgba(16,24,43,.75)',
border:`1px solid ${BRAND.border}`,
borderRadius:20,
padding:'20px',
backdropFilter:'blur(20px)',
boxShadow:'0 15px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.05)',
}}
>

<div
style={{
fontSize:12,
color:BRAND.muted,
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
background:`linear-gradient(90deg,${BRAND.blue},${BRAND.yellow})`,
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

  async function resendViaNewEndpoint(type: 'invite' | 'verification', u:any) {
    setSaving(true);
    try {
      const res = await fetch('/api/supabase/resend-invite', {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: u.email, type }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || `Failed to resend ${type}`);
        return;
      }
      const data = await res.json();
      alert(`${type === 'invite' ? 'Invitation' : 'Verification'} email sent`);
      console.log('[UsersClient] resend response', data);
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(u:any) {
    if (!confirm(`Send password reset to ${u.email}?`)) return;
    setSaving(true);
    try {
      const res = await fetch('/api/users/reset-password', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email }) });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to send reset'); return; }
      alert('Password reset link sent');
    } finally { setSaving(false); }
  }

  async function toggleDisable(u:any) {
    const disable = !u.status || u.status === 'Active';
    if (!confirm(`${disable ? 'Disable' : 'Enable'} user ${u.name}?`)) return;
    setSaving(true);
    try {
      const res = await fetch('/api/users/toggle-status', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: u.id, disable }) });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to toggle'); return; }
      load();
    } finally { setSaving(false); }
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
color:BRAND.white,
}}
>
👥 User Management
</h1>
          <p
style={{
fontSize:14,
color:BRAND.muted,
marginTop:6,
}}
>
Manage users, roles and permissions
</p>
        </div>
        <button
          onClick={()=>{ setEditing(null); setForm({name:'',email:'',role:'admin',departmentId:'',password:'',confirmPassword:''}); setShow(true); }}
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
            <div style={styles.formGrid}>
              <div style={styles.field}>
                <label style={{ fontSize:11,
fontWeight:700,
letterSpacing:'.08em',
color:BRAND.muted,
textTransform:"uppercase",display:'block',marginBottom:4 }}>Full name</label>
                <input style={styles.input} required value={form.name} onChange={e=>F('name',e.target.value)}/>
              </div>
              <div style={styles.field}>
                <label style={{ fontSize:11,
fontWeight:700,
letterSpacing:'.08em',
color:BRAND.muted,
textTransform:"uppercase",display:'block',marginBottom:4 }}>Email</label>
                <input style={styles.input} type="email" required value={form.email} onChange={e=>F('email',e.target.value)}/>
              </div>
              <div style={styles.field}>
                <label style={{ fontSize:11,
fontWeight:700,
letterSpacing:'.08em',
color:BRAND.muted,
textTransform:"uppercase",display:'block',marginBottom:4 }}>Role</label>
                <select style={{ ...styles.input, ...styles.select }} value={form.role} onChange={e=>F('role',e.target.value)}>
                  {ROLES.map(r=><option key={r} value={r} style={{ background: BRAND.blackSoft, color: BRAND.white }}>{r.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              
            </div>
            {/* Password + Confirm Password fields:
                Shown whenever the selected role is NOT an invite-based role
                (employee, team_lead, qa_manager), OR when editing an existing
                user (optional password reset). These roles get their password
                emailed to them directly by the backend once created. */}
            {(requiresPassword || editing) && (
              <div style={styles.formGrid}>
                <div style={styles.field}>
                  <label style={{ fontSize:11,
fontWeight:700,
letterSpacing:'.08em',
color:BRAND.muted,
textTransform:"uppercase",display:'block',marginBottom:4 }}>
                    {editing ? 'New password (leave blank to keep)' : 'Password'}
                  </label>
                  <input
                    style={styles.input}
                    type="password"
                    value={form.password}
                    onChange={e=>F('password',e.target.value)}
                    minLength={editing ? undefined : 8}
                    required={!editing && requiresPassword}
                    placeholder={editing ? 'Optional password reset' : 'At least 8 characters'}
                    autoComplete={editing ? 'new-password' : 'new-password'}
                  />
                </div>
                <div style={styles.field}>
                  <label style={{ fontSize:11,
fontWeight:700,
letterSpacing:'.08em',
color:BRAND.muted,
textTransform:"uppercase",display:'block',marginBottom:4 }}>Confirm password</label>
                  <input
                    style={styles.input}
                    type="password"
                    value={form.confirmPassword}
                    onChange={e=>F('confirmPassword',e.target.value)}
                    required={!editing && requiresPassword}
                    placeholder={editing ? 'Repeat new password' : 'Repeat password'}
                    autoComplete={editing ? 'new-password' : 'new-password'}
                  />
                </div>
              </div>
            )}
            {!editing && (
             <div style={{ padding:'12px', borderRadius:12, background:'rgba(30,90,224,.08)', border:`1px solid ${BRAND.blueSoft}`, color:BRAND.blue, fontSize:12, marginBottom:10 }}>
    An email with the login credentials will be sent to the user.
  </div>
            )}
            {error&&<div style={{ padding:'12px',
borderRadius:12,
background:'rgba(255,92,122,.12)',
border:`1px solid ${BRAND.danger}40`,
color:BRAND.danger,
fontWeight:500,fontSize:11,
letterSpacing:'.08em',
marginBottom:10 }}>{error}</div>}
            <div style={{ display:'flex',gap:8 }}>
              <button type="submit" disabled={saving} style={styles.button}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create user'}
              </button>
              <button type="button" onClick={()=>setShow(false)}
                style={{ padding:'7px 16px',borderRadius:8,border:`1px solid ${BRAND.border}`,fontSize:13,cursor:'pointer',background:'transparent',color:BRAND.white }}>
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
e.currentTarget.style.background='rgba(245,247,250,.04)';
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
background:'rgba(245,247,250,.05)',
border:`1px solid ${ROLE_COLOR[u.role]}30`,
color:ROLE_COLOR[u.role],
fontWeight:600,
fontSize:12,
}}
>
{(u.role||'').replace(/_/g,' ')}
</span>
</td>
                <td style={styles.td}>
                  <span style={{ display:'inline-flex',alignItems:'center',padding:'6px 12px',borderRadius:999,background:u.status==='Active' ? 'rgba(45,212,191,.08)' : u.status==='Invited' ? 'rgba(30,90,224,.08)' : 'rgba(245,196,0,.08)', color: u.status==='Active' ? '#2DD4BF' : u.status==='Invited' ? BRAND.blue : BRAND.yellow, fontWeight:700, fontSize:12 }}>{u.status || 'Unknown'}</span>
                </td>
                <td style={styles.td}>
                  <button onClick={()=>edit(u)} style={{ ...styles.button, padding:'6px 12px', fontSize:12 }}>Edit</button>
                  <button onClick={()=>removeUser(u)} style={{ ...styles.button, padding:'6px 12px', fontSize:11,
fontWeight:700,
letterSpacing:'.08em',
color:'#fff', background:`linear-gradient(90deg,${BRAND.danger},#FF7A93)`, boxShadow:'0 10px 25px rgba(255,92,122,.25)', marginLeft:8 }}>
                    Delete
                  </button>
                  {u.status==='Pending Verification' && (
                    <button onClick={()=>resendViaNewEndpoint('verification', u)} style={{ marginLeft:8, padding:'6px 10px', borderRadius:10, border:`1px solid ${BRAND.border}`, background:'transparent', color:BRAND.white }}>Resend verification</button>
                  )}
                  {u.status==='Invited' && (
                    <button onClick={()=>resendViaNewEndpoint('invite', u)} style={{ marginLeft:8, padding:'6px 10px', borderRadius:10, border:`1px solid ${BRAND.border}`, background:'transparent', color:BRAND.white }}>Resend invite</button>
                  )}
                  <button onClick={()=>resetPassword(u)} style={{ marginLeft:8, padding:'6px 10px', borderRadius:10, border:`1px solid ${BRAND.border}`, background:'transparent', color:BRAND.white }}>Reset password</button>
                  <button onClick={()=>toggleDisable(u)} style={{ marginLeft:8, padding:'6px 10px', borderRadius:10, border:`1px solid ${BRAND.border}`, background:'transparent', color:BRAND.white }}>{u.status==='Active' ? 'Disable' : 'Enable'}</button>
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
