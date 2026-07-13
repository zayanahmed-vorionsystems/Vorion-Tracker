export type PresenceStatus = 'working' | 'idle' | 'on_break' | 'checked_out' | 'offline';
export const LIVE_HEARTBEAT_STALE_SECONDS = 90;

export function normalizePresenceStatus(value?: string | null): PresenceStatus {
  const raw = String(value || '').trim().toLowerCase();

  if (raw === 'working' || raw === 'active') return 'working';
  if (raw === 'idle') return 'idle';
  if (raw === 'on_break' || raw === 'break') return 'on_break';
  if (raw === 'checked_out' || raw === 'checkout' || raw === 'check_out') return 'checked_out';
  if (raw === 'offline') return 'offline';

  return 'offline';
}
