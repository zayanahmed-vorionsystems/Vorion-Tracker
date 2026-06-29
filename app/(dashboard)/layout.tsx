'use client';
// app/(dashboard)/layout.tsx
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore, canMonitorAll, canManageUsers, type Role } from '@/store/auth';
import Image from 'next/image';
import vorionLogo from '@/assets/vorion-logo-light.png';
const ROLE_COLOR: Record<Role, string> = {
  super_admin: '#A78BFA', admin: '#818CF8', executive: '#60A5FA', qa_manager: '#34D399',
  team_lead: '#F8D000', employee: 'rgba(248,250,252,.5)',
};
const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super Admin', admin: 'Admin', executive: 'Executive', qa_manager: 'QA Manager',
  team_lead: 'Team Lead', employee: 'Employee',
};

const NavItem = ({ href, label, show = true }: { href: string; label: string; show?: boolean }) => {
  const path = usePathname();
  if (!show) return null;
  const active = path === href || path.startsWith(href + '/');
  return (
    <Link href={href} style={{
      display: 'block', padding: '7px 10px', borderRadius: 10, fontSize: 13, marginBottom: 2,
      background: active ? 'rgba(0,80,176,.35)' : 'transparent',
      color: active ? '#F8FAFC' : 'rgba(248,250,252,.5)',
      fontWeight: active ? 600 : 400,
      borderLeft: active ? '2px solid #F8D000' : '2px solid transparent',
      transition: 'all .15s',
      textDecoration: 'none',
    }}>
      {label}
    </Link>
  );
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const role = user?.role as Role;

  useEffect(() => { if (!user) router.push('/login'); }, [user]);
  if (!user) return null;

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      background: '#0B0F1A', color: '#F8FAFC',
    }}>
      {/* Sidebar */}
      <aside style={{
        width: 210, flexShrink: 0,
        background: 'rgba(11,15,26,.85)',
        borderRight: '1px solid rgba(248,250,252,.08)',
        backdropFilter: 'blur(12px)',
        display: 'flex', flexDirection: 'column',
        padding: '18px 12px',
      }}>
        {/* Logo */}
      <div
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    paddingLeft: 4,
  }}
>
  <Image
    src={vorionLogo}
    alt="Vorion Logo"
    width={50}
    height={50}
    style={{
      borderRadius: 8,
      objectFit: 'contain',
    }}
  />
  <span
    style={{
      fontSize: 16,
      fontWeight: 600,
      color: '#F8FAFC',
    }}
  >
    Vorion Tracker
  </span>
</div>

        {/* Role badge */}
        <div style={{
          fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
          background: 'rgba(248,250,252,.07)', color: ROLE_COLOR[role],
          marginBottom: 18, alignSelf: 'flex-start',
          border: `1px solid ${ROLE_COLOR[role]}30`,
          letterSpacing: '0.04em',
        }}>
          {ROLE_LABEL[role]}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(248,250,252,.3)', padding: '4px 10px 6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Monitor</div>
          <NavItem href="/dashboard"   label="Dashboard" />
          <NavItem href="/live-monitor"        label="Live Monitor"   show={canMonitorAll(role) || role === 'team_lead'} />
          <NavItem href="/screenshots" label="Screenshots" />
          <NavItem href="/timeline"    label="Timeline" />
          <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(248,250,252,.3)', padding: '14px 10px 6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Reports</div>
          <NavItem href="/reports"     label="Reports" />
          <NavItem href="/security"    label="Security Policies" show={canManageUsers(role)} />
          <NavItem href="/users"       label="User Management" show={canManageUsers(role)} />
          <NavItem href="/download"    label="Download Agent" />
        </nav>

        {/* User footer */}
        <div style={{ borderTop: '1px solid rgba(248,250,252,.08)', paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{user.name}</div>
          <div style={{ fontSize: 11, color: 'rgba(248,250,252,.35)', marginBottom: 10 }}>{user.email}</div>
          <button onClick={() => { logout(); router.push('/login'); }} style={{
            fontSize: 12, color: '#FF5C7A', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500,
          }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{
        flex: 1, overflow: 'auto', padding: 28,
        background: 'radial-gradient(1200px 600px at 20% 0%, rgba(0,80,176,.16), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(248,208,0,.08), transparent 55%), #0B0F1A',
      }}>
        {children}
      </main>
    </div>
  );
}