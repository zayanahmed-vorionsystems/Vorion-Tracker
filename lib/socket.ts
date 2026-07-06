const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL || process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://127.0.0.1:4000';
const SOCKET_SERVER_SECRET = process.env.SOCKET_SERVER_SECRET || process.env.JWT_SECRET || '';

export function getSocketServerUrl() {
  return SOCKET_SERVER_URL;
}

export async function emitSocketEvent(event: string, payload: any, options: { toEmployeeId?: string | null; toAdmins?: boolean } = {}) {
  const baseUrl = (SOCKET_SERVER_URL || '').replace(/\/$/, '');
  if (!baseUrl) return;

  try {
    const res = await fetch(`${baseUrl}/emit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Socket-Secret': SOCKET_SERVER_SECRET,
      },
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
