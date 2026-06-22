'use client';
// app/(auth)/login/page.tsx
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export default function LoginPage() {
  const [email,    setEmail]    = useState('admin@company.com');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const { setAuth } = useAuthStore();
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const res  = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || `Login failed (HTTP ${res.status})`); return; }
      setAuth(data.token, data.user);
      router.push('/dashboard');
    } catch (err) { setError(`Network error — is the server running? (${err})`); }
    finally  { setLoading(false); }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      background: 'radial-gradient(1200px 600px at 20% 0%, rgba(0,80,176,.22), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(248,208,0,.12), transparent 55%), #0B0F1A',
      color: '#F8FAFC',
    }}>
      <div style={{
        background: 'rgba(11,15,26,.82)', border: '1px solid rgba(248,250,252,.10)',
        backdropFilter: 'blur(16px)', borderRadius: 20,
        padding: '40px 36px', width: 380,
        boxShadow: '0 24px 60px rgba(0,0,0,.4)',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg,#0050B0,#F8D000)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800, color: '#fff',
          }}>V</div>
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>Vorion Tracker</span>
        </div>
        <p style={{ color: 'rgba(248,250,252,.45)', fontSize: 13, marginBottom: 30 }}>Sign in to your workspace</p>

        <form onSubmit={handleLogin}>
          <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5, color: 'rgba(248,250,252,.6)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Email</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoFocus style={{
            width: '100%', padding: '10px 12px', borderRadius: 12,
            border: '1px solid rgba(248,250,252,.12)', background: 'rgba(248,250,252,.05)',
            color: '#F8FAFC', fontSize: 13, marginBottom: 14, outline: 'none',
            boxSizing: 'border-box',
          }}/>

          <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5, color: 'rgba(248,250,252,.6)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Password</label>
          <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={{
            width: '100%', padding: '10px 12px', borderRadius: 12,
            border: '1px solid rgba(248,250,252,.12)', background: 'rgba(248,250,252,.05)',
            color: '#F8FAFC', fontSize: 13, marginBottom: 18, outline: 'none',
            boxSizing: 'border-box',
          }}/>

          {error && (
            <div style={{ fontSize: 12, color: '#FF5C7A', background: 'rgba(255,92,122,.08)', border: '1px solid rgba(255,92,122,.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '11px', borderRadius: 12,
            background: loading ? 'rgba(248,250,252,.1)' : 'linear-gradient(180deg, rgba(0,80,176,.7), rgba(0,80,176,.5))',
            border: '1px solid rgba(0,80,176,.6)',
            color: '#F8FAFC', fontWeight: 700, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
            boxSizing: 'border-box',
          }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ fontSize: 11, color: 'rgba(248,250,252,.2)', textAlign: 'center', marginTop: 22 }}>
          Default: admin@company.com / admin123
        </p>
      </div>
    </div>
  );
}