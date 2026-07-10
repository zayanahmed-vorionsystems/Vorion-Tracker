'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { normalizeRole } from '@/lib/roles';

function fmt(secs: number) {
  if (!secs) return '-';
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

const COLORS = {
  textMuted: '#9AA3B2',
  textFaint: 'rgba(248,250,252,.35)',
};

const LEGEND = [
  { color: '#3B82F6', label: 'Work' },
  { color: '#A78BFA', label: 'Meeting' },
  { color: '#F59E0B', label: 'Idle' },
  { color: '#475569', label: 'Break' },
];

const HOURS = ['9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm'];
const DAY_S = 9 * 3600;

export default function TimelinePage() {
  const { token, user } = useAuthStore();
  const role = normalizeRole(user?.role);
  const isClient = role === 'client';
  const clientTimeZone = typeof window === 'undefined'
    ? 'America/New_York'
    : Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  const [rows, setRows] = useState<any[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ type: 'daily', date });
    if (isClient) params.set('tz', clientTimeZone);
    fetch(`/api/reports?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        setRows(Array.isArray(d?.rows) ? d.rows : []);
        setLoading(false);
      })
      .catch(() => {
        setRows([]);
        setLoading(false);
      });
  }, [clientTimeZone, date, isClient, token]);

  function pct(seconds: number) {
    return Math.min(100, (seconds / DAY_S) * 100);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <h1
          style={{
            fontSize: 34,
            fontWeight: 800,
            margin: 0,
            color: '#F8FAFC',
          }}
        >
          {isClient ? 'Assigned VA Timeline' : 'Employee Timeline'}
        </h1>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14 }}>
            {LEGEND.map((legend) => (
              <span
                key={legend.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,.04)',
                  border: '1px solid rgba(255,255,255,.05)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#CBD5E1',
                }}
              >
                <span style={{ width: 10, height: 10, background: legend.color, borderRadius: 3, display: 'inline-block' }} />
                {legend.label}
              </span>
            ))}
          </div>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            style={{
              padding: '10px 14px',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,.08)',
              background: 'rgba(255,255,255,.05)',
              backdropFilter: 'blur(10px)',
              color: '#F8FAFC',
              fontSize: 13,
              transition: 'all .2s ease',
              outline: 'none',
            }}
          />
        </div>
      </div>

      <div
        style={{
          background: 'rgba(20,25,40,.72)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,.08)',
          borderRadius: 22,
          padding: '28px',
          boxShadow: '0 20px 50px rgba(0,0,0,.35)',
        }}
      >
        <div style={{ display: 'flex', paddingLeft: 128, marginBottom: 14 }}>
          {HOURS.map((hour) => (
            <div
              key={hour}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'rgba(255,255,255,.45)',
                letterSpacing: '.05em',
                textTransform: 'uppercase',
                textAlign: 'center',
              }}
            >
              {hour}
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>Loading...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>No data for this date</div>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                marginBottom: 14,
                padding: '10px 12px',
                borderRadius: 14,
                transition: 'all .25s ease',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'rgba(255,255,255,.04)';
                event.currentTarget.style.transform = 'translateX(6px)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'transparent';
                event.currentTarget.style.transform = 'translateX(0)';
              }}
            >
              <div
                style={{
                  width: 150,
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#F8FAFC',
                  textAlign: 'right',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {row.name}
              </div>
              <div
                style={{
                  position: 'relative',
                  flex: 1,
                  height: 32,
                  background: 'rgba(255,255,255,.06)',
                  borderRadius: 999,
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,.05)',
                }}
              >
                {row.total_seconds > 0 ? (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      height: '100%',
                      width: `${pct(row.total_seconds)}%`,
                      background: 'linear-gradient(90deg,#2563EB,#06B6D4,#22C55E)',
                      boxShadow: '0 0 20px rgba(37,99,235,.45)',
                      borderRadius: 6,
                    }}
                  />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: 10, fontSize: 12, color: COLORS.textFaint }}>
                    No activity
                  </div>
                )}
              </div>
              <div
                style={{
                  width: 70,
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: 'right',
                  color: '#CBD5E1',
                }}
              >
                {fmt(row.total_seconds)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
