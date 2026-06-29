// lib/pusher.ts
// Compatibility stub retained for any legacy imports. Real-time delivery now runs through Socket.IO.
export const CHANNELS = {
  LIVE: 'worktrack-live',
  ALERTS: 'worktrack-alerts',
} as const;

export const EVENTS = {
  NEW_SCREENSHOT: 'new-screenshot',
  EMPLOYEE_STATUS: 'employee-status',
  EMPLOYEE_WORK_STARTED: 'employee-work-started',
  EMPLOYEE_BREAK_STARTED: 'employee-break-started',
  EMPLOYEE_BREAK_ENDED: 'employee-break-ended',
  EMPLOYEE_CHECKED_OUT: 'employee-checked-out',
  EMPLOYEE_LOGGED_OUT: 'employee-logged-out',
  EMPLOYEE_OFFLINE: 'employee-offline',
  EMPLOYEE_ACTIVITY_UPDATED: 'employee-activity-updated',
  NEW_ALERT: 'new-alert',
} as const;
