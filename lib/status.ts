export type PresenceStatus = 'working' | 'on_break' | 'checked_out' | 'offline';

export function normalizePresenceStatus(value?: string | null): PresenceStatus {
  const raw = String(value || '').trim().toLowerCase();

  if (raw === 'working' || raw === 'active') return 'working';
  if (raw === 'on_break' || raw === 'break') return 'on_break';
  if (raw === 'checked_out' || raw === 'checkout' || raw === 'check_out') return 'checked_out';
  if (raw === 'idle' || raw === 'offline') return 'offline';

  return 'offline';
}
