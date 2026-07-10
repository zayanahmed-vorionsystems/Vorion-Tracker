export type Role =
  | 'superadmin'
  | 'admin'
  | 'executive'
  | 'client'
  | 'qa_manager'
  | 'qa_lead'
  | 'qa'
  | 'employee';

export type ShiftType = 'first_half' | 'second_half' | 'full_time';

const ROLE_ALIASES: Record<string, Role> = {
  super_admin: 'superadmin',
  superadmin: 'superadmin',
  admin: 'admin',
  executive: 'executive',
  client: 'client',
  clients: 'client',
  qa_manager: 'qa_manager',
  qa_lead: 'qa_lead',
  qa: 'qa',
  team_lead: 'qa_lead',
  employee: 'employee',
};

export function normalizeRole(value: unknown): Role {
  const key = String(value || '').trim().toLowerCase();
  return ROLE_ALIASES[key] || 'employee';
}

export function normalizeShiftType(value: unknown): ShiftType {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'first_half' || key === 'second_half' || key === 'full_time') {
    return key;
  }
  return 'full_time';
}

export function roleLabel(role: Role) {
  return {
    superadmin: 'Super Admin',
    admin: 'Admin',
    executive: 'Executive',
    client: 'Client',
    qa_manager: 'QA Manager',
    qa_lead: 'QA Lead',
    qa: 'QA',
    employee: 'Employee',
  }[role];
}

export function canManageUsers(role: Role) {
  return role === 'superadmin' || role === 'admin';
}

export function canDeleteRecords(role: Role) {
  return role === 'superadmin';
}

export function canManageSecurity(role: Role) {
  return role === 'superadmin' || role === 'admin';
}

export function canMonitorAll(role: Role) {
  return ['superadmin', 'admin', 'executive', 'qa_manager', 'qa_lead', 'qa'].includes(role);
}

export function canAccessLiveMonitor(role: Role) {
  return canMonitorAll(role);
}

export function canSendAlerts(role: Role) {
  return ['superadmin', 'admin', 'qa_manager'].includes(role);
}

export function canCreateScreenshotFlags(role: Role) {
  return role === 'qa_manager' || role === 'qa_lead';
}

export function canSendFlagReports(role: Role) {
  return role === 'qa_manager';
}

export function canViewFlags(role: Role) {
  return role !== 'client' && role !== 'employee';
}

export function canAccessWebApp(role: Role) {
  return role !== 'employee';
}
