import { sql } from './db';

export interface PolicySettings {
  blockWebsites: boolean;
  blockApps: boolean;
  showWarning: boolean;
  killProcess: boolean;
  updatedAt: string | null;
}

export interface BlockedAppRecord {
  id: string;
  displayName: string;
  processName: string;
  reason: string | null;
  enabled: boolean;
  createdAt: string;
}

export interface BlockedWebsiteRecord {
  id: string;
  domain: string;
  reason: string | null;
  enabled: boolean;
  createdAt: string;
}

export interface SecurityEventRecord {
  id: string;
  employeeId: string | null;
  computerName: string | null;
  eventType: string;
  value: string | null;
  actionTaken: string | null;
  createdAt: string;
  employeeName?: string | null;
}

export async function ensureSecuritySchema(): Promise<void> {
  // Database schema is managed externally. Only ensure default policy row exists.
  await sql`
    INSERT INTO policy_settings (id, block_websites, block_apps, show_warning, kill_process, updated_at)
    SELECT 1, true, true, true, true, NOW()
    WHERE NOT EXISTS (SELECT 1 FROM policy_settings WHERE id = 1)
  `;
}

export async function getPolicySettings(): Promise<PolicySettings> {
  await ensureSecuritySchema();
  const rows = await sql`
    SELECT block_websites, block_apps, show_warning, kill_process, updated_at
    FROM policy_settings
    WHERE id = 1
    LIMIT 1
  `;
  const row = rows?.[0];
  return {
    blockWebsites: Boolean(row?.block_websites ?? true),
    blockApps: Boolean(row?.block_apps ?? true),
    showWarning: Boolean(row?.show_warning ?? true),
    killProcess: Boolean(row?.kill_process ?? true),
    updatedAt: row?.updated_at ?? null,
  };
}

export async function updatePolicySettings(input: Partial<PolicySettings>): Promise<PolicySettings> {
  await ensureSecuritySchema();
  const current = await getPolicySettings();
  const next = {
    blockWebsites: input.blockWebsites ?? current.blockWebsites,
    blockApps: input.blockApps ?? current.blockApps,
    showWarning: input.showWarning ?? current.showWarning,
    killProcess: input.killProcess ?? current.killProcess,
  };

  await sql`
    INSERT INTO policy_settings (id, block_websites, block_apps, show_warning, kill_process, updated_at)
    VALUES (1, ${next.blockWebsites}, ${next.blockApps}, ${next.showWarning}, ${next.killProcess}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      block_websites = EXCLUDED.block_websites,
      block_apps = EXCLUDED.block_apps,
      show_warning = EXCLUDED.show_warning,
      kill_process = EXCLUDED.kill_process,
      updated_at = NOW()
  `;

  return { ...next, updatedAt: new Date().toISOString() };
}

export async function listBlockedApps(includeDisabled = false): Promise<BlockedAppRecord[]> {
  await ensureSecuritySchema();
  const rows = await sql`
    SELECT id, display_name, process_name, reason, enabled, created_at
    FROM blocked_applications
    ORDER BY display_name ASC
  `;
  const items = (rows || []).map((row: any) => ({
    id: row.id,
    displayName: row.display_name,
    processName: row.process_name,
    reason: row.reason,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
  }));
  return includeDisabled ? items : items.filter((item: BlockedAppRecord) => item.enabled);
}

export async function createBlockedApp(input: { displayName: string; processName: string; reason?: string | null; enabled?: boolean }): Promise<BlockedAppRecord> {
  await ensureSecuritySchema();
  const rows = await sql`
    INSERT INTO blocked_applications (display_name, process_name, reason, enabled)
    VALUES (${input.displayName}, ${input.processName}, ${input.reason || null}, ${input.enabled ?? true})
    RETURNING id, display_name, process_name, reason, enabled, created_at
  `;
  const row = rows?.[0];
  return {
    id: row.id,
    displayName: row.display_name,
    processName: row.process_name,
    reason: row.reason,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
  };
}

export async function updateBlockedApp(id: string, input: Partial<{ displayName: string; processName: string; reason: string | null; enabled: boolean }>): Promise<BlockedAppRecord | null> {
  await ensureSecuritySchema();
  const rows = await sql`
    UPDATE blocked_applications
    SET
      display_name = COALESCE(${input.displayName ?? null}, display_name),
      process_name = COALESCE(${input.processName ?? null}, process_name),
      reason = COALESCE(${input.reason ?? null}, reason),
      enabled = COALESCE(${input.enabled ?? null}, enabled)
    WHERE id = ${id}
    RETURNING id, display_name, process_name, reason, enabled, created_at
  `;
  const row = rows?.[0];
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    processName: row.process_name,
    reason: row.reason,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
  };
}

export async function deleteBlockedApp(id: string): Promise<boolean> {
  await ensureSecuritySchema();
  const rows = await sql`
    DELETE FROM blocked_applications WHERE id = ${id} RETURNING id
  `;
  return Boolean(rows?.[0]);
}

export async function listBlockedWebsites(includeDisabled = false): Promise<BlockedWebsiteRecord[]> {
  await ensureSecuritySchema();
  const rows = await sql`
    SELECT id, domain, reason, enabled, created_at
    FROM blocked_websites
    ORDER BY domain ASC
  `;
  const items = (rows || []).map((row: any) => ({
    id: row.id,
    domain: row.domain,
    reason: row.reason,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
  }));
  return includeDisabled ? items : items.filter((item: BlockedWebsiteRecord) => item.enabled);
}

export async function createBlockedWebsite(input: { domain: string; reason?: string | null; enabled?: boolean }): Promise<BlockedWebsiteRecord> {
  await ensureSecuritySchema();
  const rows = await sql`
    INSERT INTO blocked_websites (domain, reason, enabled)
    VALUES (${input.domain}, ${input.reason || null}, ${input.enabled ?? true})
    RETURNING id, domain, reason, enabled, created_at
  `;
  const row = rows?.[0];
  return {
    id: row.id,
    domain: row.domain,
    reason: row.reason,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
  };
}

export async function updateBlockedWebsite(id: string, input: Partial<{ domain: string; reason: string | null; enabled: boolean }>): Promise<BlockedWebsiteRecord | null> {
  await ensureSecuritySchema();
  const rows = await sql`
    UPDATE blocked_websites
    SET
      domain = COALESCE(${input.domain ?? null}, domain),
      reason = COALESCE(${input.reason ?? null}, reason),
      enabled = COALESCE(${input.enabled ?? null}, enabled)
    WHERE id = ${id}
    RETURNING id, domain, reason, enabled, created_at
  `;
  const row = rows?.[0];
  if (!row) return null;
  return {
    id: row.id,
    domain: row.domain,
    reason: row.reason,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
  };
}

export async function deleteBlockedWebsite(id: string): Promise<boolean> {
  await ensureSecuritySchema();
  const rows = await sql`
    DELETE FROM blocked_websites WHERE id = ${id} RETURNING id
  `;
  return Boolean(rows?.[0]);
}

export async function createSecurityEvent(input: { employeeId: string | null; computerName: string | null; eventType: string; value: string | null; actionTaken: string | null }): Promise<SecurityEventRecord> {
  await ensureSecuritySchema();
  const rows = await sql`
    INSERT INTO security_events (employee_id, computer_name, type, target, action, details)
    VALUES (${input.employeeId}, ${input.computerName}, ${input.eventType}, ${input.value}, ${input.actionTaken}, ${null})
    RETURNING id, employee_id, computer_name, type, target, action, details, created_at
  `;
  const row = rows?.[0];
  return {
    id: row.id,
    employeeId: row.employee_id,
    computerName: row.computer_name,
    eventType: row.type,
    value: row.target,
    actionTaken: row.action,
    createdAt: row.created_at,
  };
}

export async function listSecurityEvents(options: { employeeId?: string | null; date?: string | null; eventType?: string | null; limit?: number | null; viewAs?: string | null }): Promise<SecurityEventRecord[]> {
  await ensureSecuritySchema();
  const limit = options.limit ? Math.min(Number(options.limit), 100) : 20;
  const rows = await sql`
    SELECT
      se.id,
      se.employee_id,
      se.computer_name,
      se.type,
      se.target,
      se.action,
      se.created_at,
      p.full_name AS employee_name
    FROM security_events se
    LEFT JOIN public.profiles p ON p.id = se.employee_id
    ORDER BY se.created_at DESC
    LIMIT ${limit}
  `;

  const filtered = (rows || []).filter((row: any) => {
    if (options.viewAs === 'employee' && options.employeeId && row.employee_id !== options.employeeId) return false;
    if (options.employeeId && row.employee_id !== options.employeeId) return false;
    if (options.eventType && row.type !== options.eventType) return false;
    if (options.date && new Date(row.created_at).toISOString().slice(0, 10) !== options.date) return false;
    return true;
  });

  return filtered.map((row: any) => ({
    id: row.id,
    employeeId: row.employee_id,
    computerName: row.computer_name,
    eventType: row.type,
    value: row.target,
    actionTaken: row.action,
    createdAt: row.created_at,
    employeeName: row.employee_name,
  }));
}

