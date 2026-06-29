const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL || process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://127.0.0.1:4000';

export function getSocketServerUrl() {
  return SOCKET_SERVER_URL;
}

export async function emitSocketEvent(event: string, payload: any, options: { toEmployeeId?: string | null; toAdmins?: boolean } = {}) {
  const baseUrl = (SOCKET_SERVER_URL || '').replace(/\/$/, '');
  if (!baseUrl) return;

  try {
    const res = await fetch(`${baseUrl}/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, payload, ...options }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('Socket emit failed', res.status, text);
    }
  } catch (error) {
    console.warn('Socket emit failed', error);
  }
}
