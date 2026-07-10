'use client';

import { useEffect, useMemo, useState } from 'react';
import { getRoleLabel, useAuthStore } from '@/store/auth';
import { normalizeRole } from '@/lib/roles';

const BRAND = {
  black: '#0A0E1A',
  blackSoft: '#10182B',
  white: '#F5F7FA',
  blue: '#1E5AE0',
  blueSoft: 'rgba(30,90,224,.16)',
  yellow: '#F5C400',
  border: 'rgba(245,247,250,.08)',
  muted: 'rgba(245,247,250,.5)',
  danger: '#FF5C7A',
};

const ROLES = ['superadmin', 'admin', 'executive', 'client', 'qa_manager', 'qa_lead', 'qa', 'employee'];

const ROLE_COLOR: Record<string, string> = {
  superadmin: '#B45CFF',
  admin: BRAND.blue,
  executive: '#E879F9',
  client: '#F97316',
  qa_manager: '#2DD4BF',
  qa_lead: BRAND.yellow,
  qa: '#60A5FA',
  employee: 'rgba(245,247,250,.55)',
};

const baseInput: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  borderRadius: 14,
  border: `1px solid ${BRAND.border}`,
  background: 'rgba(245,247,250,.05)',
  color: BRAND.white,
};

interface DepartmentItem {
  id: string;
  name: string;
  description: string | null;
}

export default function UsersClient({ initialUsers }: { initialUsers: any[] }) {
  const { token, user } = useAuthStore();
  const [users, setUsers] = useState(initialUsers || []);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'employee',
    departmentId: '',
    password: '',
    confirmPassword: '',
    shiftType: 'full_time',
    clientId: '',
  });

  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const actorRole = normalizeRole(user?.role);
  const canDelete = actorRole === 'superadmin';
  const clients = useMemo(() => users.filter((entry) => normalizeRole(entry.role) === 'client'), [users]);

  const loadUsers = async () => {
    if (!headers) return;
    const res = await fetch('/api/users', { headers });
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
  };

  const loadDepartments = async () => {
    if (!headers) return;
    const res = await fetch('/api/departments', { headers });
    const data = await res.json();
    setDepartments(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    if (token) {
      void loadUsers();
      void loadDepartments();
    }
  }, [token]);

  const setField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setEditing(null);
    setForm({
      name: '',
      email: '',
      role: 'employee',
      departmentId: '',
      password: '',
      confirmPassword: '',
      shiftType: 'full_time',
      clientId: '',
    });
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (!form.name.trim()) return setError('Full name is required');
      if (form.role === 'employee' && !form.departmentId) return setError('Department is required for employee accounts');
      if (form.role === 'employee' && !departments.length) return setError('Create a department first, then assign the employee to it');
      if (!editing && (!form.password || !form.confirmPassword)) return setError('Password and confirm password are required');
      if ((form.password || form.confirmPassword) && form.password !== form.confirmPassword) return setError('Passwords do not match');

      const body: any = {
        ...(editing ? { id: editing.id } : {}),
        name: form.name,
        email: form.email,
        role: form.role,
        departmentId: form.departmentId,
        shiftType: form.shiftType,
        clientId: form.role === 'employee' ? form.clientId : '',
      };
      if (form.password) body.password = form.password;

      const res = await fetch('/api/users', {
        method: editing ? 'PATCH' : 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || 'Failed to save user');

      setShow(false);
      resetForm();
      await loadUsers();
    } finally {
      setSaving(false);
    }
  }

  async function removeUser(entry: any) {
    if (!confirm(`Delete user ${entry.name}?`)) return;
    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || 'Failed to delete user');
      await loadUsers();
    } finally {
      setSaving(false);
    }
  }

  function startEdit(entry: any) {
    setEditing(entry);
    setForm({
      name: entry.name || '',
      email: entry.email || '',
      role: normalizeRole(entry.role),
      departmentId: entry.department_id || '',
      password: '',
      confirmPassword: '',
      shiftType: entry.shift_type || 'full_time',
      clientId: entry.assigned_client_id || '',
    });
    setShow(true);
  }

  return (
    <div style={{ color: BRAND.white }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 800, margin: 0 }}>User Management</h1>
          <p style={{ color: BRAND.muted, marginTop: 6 }}>Manage users, employee departments, shifts, and client assignments.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShow(true); }}
          style={{ padding: '10px 18px', borderRadius: 14, border: 'none', background: `linear-gradient(90deg,${BRAND.blue},#4C8CFF)`, color: '#fff', fontWeight: 700, cursor: 'pointer' }}
        >
          Add User
        </button>
      </div>

      {show && (
        <div style={{ marginBottom: 20, background: 'rgba(16,24,43,.78)', border: `1px solid ${BRAND.border}`, borderRadius: 22, padding: 24 }}>
          <form onSubmit={save}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <input style={baseInput} value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="Full name" />
              <input style={baseInput} type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="Email" />
              <select style={baseInput} value={form.role} onChange={(e) => setField('role', e.target.value)}>
                {ROLES.map((role) => (
                  <option key={role} value={role} style={{ background: BRAND.blackSoft }}>
                    {getRoleLabel(role as any)}
                  </option>
                ))}
              </select>
              {form.role === 'employee' && (
                <>
                  <select style={baseInput} value={form.departmentId} onChange={(e) => setField('departmentId', e.target.value)}>
                    <option value="" style={{ background: BRAND.blackSoft }}>Select employee department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id} style={{ background: BRAND.blackSoft }}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                  <select style={baseInput} value={form.shiftType} onChange={(e) => setField('shiftType', e.target.value)}>
                    <option value="first_half" style={{ background: BRAND.blackSoft }}>First Half</option>
                    <option value="second_half" style={{ background: BRAND.blackSoft }}>Second Half</option>
                    <option value="full_time" style={{ background: BRAND.blackSoft }}>Full Time</option>
                  </select>
                  <select style={baseInput} value={form.clientId} onChange={(e) => setField('clientId', e.target.value)}>
                    <option value="" style={{ background: BRAND.blackSoft }}>No assigned client</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id} style={{ background: BRAND.blackSoft }}>{client.name}</option>
                    ))}
                  </select>
                </>
              )}
              {form.role !== 'employee' && (
                <select style={baseInput} value={form.departmentId} onChange={(e) => setField('departmentId', e.target.value)}>
                  <option value="" style={{ background: BRAND.blackSoft }}>No department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id} style={{ background: BRAND.blackSoft }}>
                      {department.name}
                    </option>
                  ))}
                </select>
              )}
              <input style={baseInput} type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} placeholder={editing ? 'New password (optional)' : 'Password'} />
              <input style={baseInput} type="password" value={form.confirmPassword} onChange={(e) => setField('confirmPassword', e.target.value)} placeholder="Confirm password" />
            </div>

            {error && (
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,92,122,.1)', color: BRAND.danger }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button type="submit" disabled={saving} style={{ padding: '10px 18px', borderRadius: 14, border: 'none', background: BRAND.blue, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Saving...' : editing ? 'Save changes' : 'Create user'}
              </button>
              <button type="button" onClick={() => setShow(false)} style={{ padding: '10px 18px', borderRadius: 14, border: `1px solid ${BRAND.border}`, background: 'transparent', color: BRAND.white }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ background: 'rgba(16,24,43,.78)', border: `1px solid ${BRAND.border}`, borderRadius: 22, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Name', 'Email', 'Role', 'Department', 'Shift', 'Client', 'Status', 'Actions'].map((heading) => (
                <th key={heading} style={{ textAlign: 'left', padding: '12px 16px', color: BRAND.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${BRAND.border}` }}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((entry) => {
              const entryRole = normalizeRole(entry.role);
              const clientName = clients.find((client) => client.id === entry.assigned_client_id)?.name || '-';
              const departmentName = departments.find((department) => department.id === entry.department_id)?.name || entry.department_name || '-';
              return (
                <tr key={entry.id} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                  <td style={{ padding: '12px 16px' }}>{entry.name}</td>
                  <td style={{ padding: '12px 16px' }}>{entry.email}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      display: 'inline-flex',
                      padding: '6px 12px',
                      borderRadius: 999,
                      border: `1px solid ${ROLE_COLOR[entryRole]}40`,
                      color: ROLE_COLOR[entryRole],
                      background: 'rgba(245,247,250,.05)',
                    }}>
                      {getRoleLabel(entryRole)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>{departmentName}</td>
                  <td style={{ padding: '12px 16px' }}>{entryRole === 'employee' ? (entry.shift_type || 'full_time').replace(/_/g, ' ') : '-'}</td>
                  <td style={{ padding: '12px 16px' }}>{entryRole === 'employee' ? clientName : '-'}</td>
                  <td style={{ padding: '12px 16px' }}>{entry.status || 'Unknown'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <button onClick={() => startEdit(entry)} style={{ padding: '8px 10px', borderRadius: 10, border: 'none', background: BRAND.blue, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                      Edit
                    </button>
                    {canDelete && (
                      <button onClick={() => removeUser(entry)} style={{ marginLeft: 8, padding: '8px 10px', borderRadius: 10, border: 'none', background: BRAND.danger, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
