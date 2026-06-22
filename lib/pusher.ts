// lib/pusher.ts
import Pusher from 'pusher';
import PusherClient from 'pusher-js';

// Server-side Pusher (used in API routes)
export const pusherServer = new Pusher({
  appId:   process.env.PUSHER_APP_ID!,
  key:     process.env.PUSHER_KEY!,
  secret:  process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS:  true,
});

// Client-side Pusher singleton
let pusherClient: PusherClient | null = null;
export function getPusherClient(): PusherClient {
  if (!pusherClient) {
    pusherClient = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });
  }
  return pusherClient;
}

export const CHANNELS = {
  LIVE:       'worktrack-live',
  ALERTS:     'worktrack-alerts',
} as const;

export const EVENTS = {
  NEW_SCREENSHOT: 'new-screenshot',
  EMPLOYEE_STATUS:'employee-status',
  NEW_ALERT:      'new-alert',
} as const;
