'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';

const ROLES = ['super_admin','admin','executive','qa_manager','team_lead','employee'];
const ROLE_COLOR: Record<string,string> = {
  super_admin:'#7c3aed',admin:'#818CF8',executive:'#0369a1',qa_manager:'#0f766e',team_lead:'#b45309',employee:'#374151'
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background:
      'radial-gradient(1200px 600px at 20% 0%, rgba(0,80,176,.22), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(248,208,0,.12), transparent 55%), #0B0F1A',
    color: '#F8FAFC',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    padding: '28px 32px',
  },
  heading: { fontSize: 22, fontWeight: 600, marginBottom: 4, color: '#F8FAFC' },
  subtext: { fontSize: 13, color: 'rgba(248,250,252,.55)', marginTop: 4 },
  button: { padding: '8px 16px', borderRadius: 8, background: '#1e293b', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  card: { border: '1px solid rgba(248,250,252,.10)', background: 'rgba(11,15,26,.72)', backdropFilter: 'blur(10px)', borderRadius: 16, padding: '20px', marginBottom: 20, boxShadow: '0 8px 24px rgba(0,0,0,.22)' },
  cardHeader: { fontSize: 14, fontWeight: 600, marginBottom: 16, color: '#F8FAFC' },
  input: { width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid rgba(248,250,252,.12)', fontSize:13, outline:'none', background:'rgb(255, 255, 255)', color:'#000000' },
  tableCard: { border: '1px solid rgba(248,250,252,.10)', background: 'rgba(11,15,26,.72)', backdropFilter: 'blur(10px)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,.22)' },
  th: { padding:'10px 16px', textAlign:'left', fontWeight:500, color:'rgba(248,250,252,.45)', fontSize:12, textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid rgba(248,250,252,.08)' },
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

  const F = (k:string,v:string) => setForm(p=>({...p,[k]:v}));

  async function save(e:React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
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
          <h1 style={styles.heading}>User Management</h1>
          <p style={styles.subtext}>{users.length} users total</p>
        </div>
        <button
          onClick={()=>{ setEditing(null); setForm({name:'',email:'',role:'employee',departmentId:'',password:'',confirmPassword:''}); setShow(true); }}
          style={styles.button}>
          + Add User
        </button>
      </div>

      {show && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>{editing?'Edit user':'New user'}</div>
          <form onSubmit={save}>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12 }}>
              <div>
                <label style={{ fontSize:11,fontWeight:500,display:'block',marginBottom:4 }}>Full name</label>
                <input style={styles.input} required value={form.name} onChange={e=>F('name',e.target.value)}/>
              </div>
              <div>
                <label style={{ fontSize:11,fontWeight:500,display:'block',marginBottom:4 }}>Email</label>
                <input style={styles.input} type="email" required value={form.email} onChange={e=>F('email',e.target.value)}/>
              </div>
              <div>
                <label style={{ fontSize:11,fontWeight:500,display:'block',marginBottom:4 }}>Role</label>
                <select style={styles.input} value={form.role} onChange={e=>F('role',e.target.value)}>
                  {ROLES.map(r=><option key={r} value={r}>{r.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11,fontWeight:500,display:'block',marginBottom:4 }}>Department ID</label>
                <input style={styles.input} value={form.departmentId} onChange={e=>F('departmentId',e.target.value)} placeholder="optional department id" />
              </div>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12 }}>
              <div>
                <label style={{ fontSize:11,fontWeight:500,display:'block',marginBottom:4 }}>
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
                <label style={{ fontSize:11,fontWeight:500,display:'block',marginBottom:4 }}>Confirm password</label>
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
            {error&&<div style={{ color:'#dc2626',fontSize:12,marginBottom:10 }}>{error}</div>}
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
              <tr key={u.id}>
                <td style={styles.td}>{u.name}</td>
                <td style={styles.td}>{u.email}</td>
                <td style={{ ...styles.td, color:ROLE_COLOR[u.role]||'#94a3b8', fontWeight:500 }}>{(u.role||'').replace(/_/g,' ')}</td>
                <td style={styles.td}>{u.department_id || '—'}</td>
                <td style={styles.td}>
                  <button onClick={()=>edit(u)} style={{ ...styles.button, padding:'6px 12px', fontSize:12 }}>Edit</button>
                  <button onClick={()=>removeUser(u)} style={{ ...styles.button, padding:'6px 12px', fontSize:12, background:'#dc2626', marginLeft:8 }}>
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