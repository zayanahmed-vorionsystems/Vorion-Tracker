// The payload has no policy data. Agents fetch their own effective policy after
// receiving it, so an employee cannot learn another employee's scoped rules.
const TOPIC = 'agent-policy-refresh';

export async function notifyPolicyChanged() {
  const baseUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!baseUrl || !serviceKey) {
    console.warn('Policy Realtime broadcast skipped: Supabase server credentials are not configured');
    return;
  }
  try {
    const response = await fetch(`${baseUrl}/realtime/v1/api/broadcast/${encodeURIComponent(TOPIC)}/events/policy-updated`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ updatedAt: new Date().toISOString() }),
    });
    if (!response.ok) console.warn('Policy Realtime broadcast failed', response.status, await response.text());
  } catch (error) {
    // Saving a policy must not fail just because the optional instant refresh is
    // temporarily unavailable; agents still have the periodic safety refresh.
    console.warn('Policy Realtime broadcast failed', error);
  }
}
