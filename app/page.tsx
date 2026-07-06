'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export default function Root() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    let hasStoredSession = false;

    try {
      const raw = window.sessionStorage.getItem('worktrack-auth');
      if (raw) {
        const parsed = JSON.parse(raw);
        hasStoredSession = Boolean(parsed?.state?.token || parsed?.state?.user);
      }
    } catch {}

    router.replace(user || hasStoredSession ? '/dashboard' : '/login');
  }, [router, user]);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#0B0F1A',
        color: '#F8FAFC',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      }}
    >
      <p style={{ opacity: 0.72, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 12 }}>
        Loading workspace...
      </p>
    </main>
  );
}
