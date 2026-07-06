import { NextRequest } from 'next/server';
import { requireAuth, ok, err } from '@/lib/api';
import { createSecurityEvent, listSecurityEvents } from '@/lib/security';
import { emitSocketEvent } from '@/lib/socket';

export async function GET(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get('limit');
    const isEmployee = user.role === 'employee';
    const isTeamLead = user.role === 'team_lead';
    const events = await listSecurityEvents({
      employeeId: isEmployee ? user.sub : (searchParams.get('employeeId') || undefined),
      date: searchParams.get('date') || undefined,
      eventType: searchParams.get('eventType') || undefined,
      limit: limitParam ? Number(limitParam) : undefined,
      viewAs: isEmployee ? 'employee' : undefined,
      departmentId: isTeamLead ? user.teamId : undefined,
    });
    return ok(events);
  } catch (e: any) {
    console.error('GET /api/security-events error:', e?.message || e);
    return err('Internal server error', 500);
  }
}

export async function POST(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  try {
    const body = await req.json();
    const targetEmployeeId =
      ['super_admin', 'admin', 'qa_manager', 'team_lead'].includes(user.role)
        ? body?.employee_id || body?.employeeId || user.sub || null
        : user.sub || null;
    const event = await createSecurityEvent({
      employeeId: targetEmployeeId,
      computerName: body?.computer_name || body?.computerName || null,
      eventType: String(body?.event_type || body?.eventType || '').trim(),
      value: body?.value ? String(body.value) : null,
      actionTaken: body?.action_taken || body?.actionTaken || null,
    });

    try {
      await emitSocketEvent('security-event', {
        id: event.id,
        employeeId: event.employeeId,
        employeeName: null,
        computerName: event.computerName,
        eventType: event.eventType,
        value: event.value,
        actionTaken: event.actionTaken,
        createdAt: event.createdAt,
      }, { toAdmins: true });
    } catch (socketError) {
      console.warn('Socket security-event notification failed', socketError);
    }

    return ok(event, 201);
  } catch (e: any) {
    console.error('POST /api/security-events error:', e?.message || e);
    return err(e?.message || 'Internal server error', 500);
  }
}
