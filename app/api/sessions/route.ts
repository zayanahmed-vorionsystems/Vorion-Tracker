// app/api/sessions/route.ts
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireAuth, ok, err } from '@/lib/api';
import { emitSocketEvent } from '@/lib/socket';

function employeeStatusPayload(user: any, status: string, appName?: string | null) {
  const timestamp = new Date().toISOString();
  return {
    employeeId: user.sub,
    employeeName: user.name,
    status,
    currentApp: appName || null,
    lastActivity: timestamp,
    timestamp,
  };
}

export async function POST(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  const { action, sessionId, appName } = await req.json();
  // NOTE: "sessionId" here is actually the attendance.id, kept as the same
  // field name the client already sends to avoid changing the agent code.

  try {
    if (action === 'start') {
      const openRows = await sql`
        SELECT id, check_in
        FROM attendance
        WHERE employee_id = ${user.sub}
          AND check_out IS NULL
        ORDER BY check_in DESC
      `;

      for (const row of openRows || []) {
        await sql`
          UPDATE attendance
          SET check_out = NOW(),
              total_minutes = FLOOR(EXTRACT(EPOCH FROM (NOW() - ${row.check_in})) / 60)::int,
              status = 'checked_out'
          WHERE id = ${row.id}
        `;
      }

      const [attendance] = await sql`
        INSERT INTO attendance(employee_id, check_in, status, created_at)
        VALUES(${user.sub}, NOW(), 'working', NOW())
        RETURNING id, check_in
      `;

      await sql`
        INSERT INTO employee_status(employee_id, current_status, current_app, last_activity, updated_at)
        VALUES(${user.sub}, 'working', ${appName ?? null}, NOW(), NOW())
        ON CONFLICT (employee_id) DO UPDATE
        SET current_status = 'working', current_app = ${appName ?? null}, last_activity = NOW(), updated_at = NOW()
      `;

      await emitSocketEvent('employee-status', employeeStatusPayload(user, 'working', appName), { toAdmins: true });
      await emitSocketEvent('employee-work-started', employeeStatusPayload(user, 'working', appName), { toAdmins: true });
      // Return the attendance id under the key the agent expects: sessionId
      return ok({ sessionId: attendance.id }, 201);
    }

    if (action === 'start_break') {
      const [attendance] = await sql`
        SELECT id FROM attendance
        WHERE employee_id = ${user.sub}
          AND check_out IS NULL
        ORDER BY check_in DESC
        LIMIT 1
      `;

      if (!attendance) return err('No active attendance found', 400);

      const [brk] = await sql`
        INSERT INTO breaks(attendance_id, start_time)
        VALUES(${attendance.id}, NOW())
        RETURNING id
      `;

      await sql`
        UPDATE attendance
        SET status = 'on_break'
        WHERE id = ${attendance.id}
      `;

      await sql`
        INSERT INTO employee_status(employee_id, current_status, current_app, last_activity, updated_at)
        VALUES(${user.sub}, 'on_break', ${appName ?? null}, NOW(), NOW())
        ON CONFLICT (employee_id) DO UPDATE
        SET current_status = 'on_break', current_app = ${appName ?? null}, last_activity = NOW(), updated_at = NOW()
      `;

      await emitSocketEvent('employee-status', employeeStatusPayload(user, 'on_break', appName), { toAdmins: true });
      await emitSocketEvent('employee-break-started', employeeStatusPayload(user, 'on_break', appName), { toAdmins: true });
      return ok({ breakId: brk.id }, 201);
    }

    if (action === 'end_break') {
      const [breakRecord] = await sql`
        SELECT b.id, b.attendance_id, b.start_time FROM breaks b
        JOIN attendance a ON a.id = b.attendance_id
        WHERE a.employee_id = ${user.sub}
          AND b.end_time IS NULL
        ORDER BY b.start_time DESC
        LIMIT 1
      `;

      if (!breakRecord) return err('No active break found', 400);

      await sql`
        UPDATE breaks
        SET end_time = NOW(),
            duration_minutes = CEIL(EXTRACT(EPOCH FROM (NOW() - ${breakRecord.start_time})) / 60)::int
        WHERE id = ${breakRecord.id}
      `;

      await sql`
        UPDATE attendance
        SET status = 'working'
        WHERE id = ${breakRecord.attendance_id}
      `;

      await sql`
        INSERT INTO employee_status(employee_id, current_status, current_app, last_activity, updated_at)
        VALUES(${user.sub}, 'working', ${appName ?? null}, NOW(), NOW())
        ON CONFLICT (employee_id) DO UPDATE
        SET current_status = 'working', current_app = ${appName ?? null}, last_activity = NOW(), updated_at = NOW()
      `;

      await emitSocketEvent('employee-status', employeeStatusPayload(user, 'working', appName), { toAdmins: true });
      await emitSocketEvent('employee-break-ended', employeeStatusPayload(user, 'working', appName), { toAdmins: true });
      return ok({ ok: true });
    }

    if ((action === 'end' || action === 'checkout')) {
      // sessionId from the client is the attendance.id; fall back to the
      // most recent open attendance row if it wasn't provided.
      let attendance;
      if (sessionId) {
        [attendance] = await sql`
          SELECT id, check_in FROM attendance
          WHERE id = ${sessionId} AND employee_id = ${user.sub}
          LIMIT 1
        `;
      } else {
        [attendance] = await sql`
          SELECT id, check_in FROM attendance
          WHERE employee_id = ${user.sub} AND check_out IS NULL
          ORDER BY check_in DESC
          LIMIT 1
        `;
      }

      if (!attendance) return err('Attendance record not found', 404);

      const minutesResult = await sql`
        SELECT FLOOR(EXTRACT(EPOCH FROM (NOW() - ${attendance.check_in})) / 60)::int AS total_minutes
      `;
      const minutes = minutesResult?.[0]?.total_minutes ?? 0;

      await sql`
        UPDATE attendance
        SET check_out = NOW(), total_minutes = ${minutes}, status = 'checked_out'
        WHERE id = ${attendance.id}
      `;

      await sql`
        INSERT INTO employee_status(employee_id, current_status, current_app, last_activity, updated_at)
        VALUES(${user.sub}, 'checked_out', NULL, NOW(), NOW())
        ON CONFLICT (employee_id) DO UPDATE
        SET current_status = 'checked_out', current_app = NULL, last_activity = NOW(), updated_at = NOW()
      `;

      await emitSocketEvent('employee-status', employeeStatusPayload(user, 'checked_out', null), { toAdmins: true });
      await emitSocketEvent('employee-checked-out', employeeStatusPayload(user, 'checked_out', null), { toAdmins: true });
      return ok({ ok: true });
    }

    if (action === 'activity') {
      // No activity_events table exists; just bump employee_status's
      // last_activity / current_app so heartbeats still register.
      await sql`
        INSERT INTO employee_status(employee_id, current_status, current_app, last_activity, updated_at)
        VALUES(${user.sub}, 'working', ${appName ?? null}, NOW(), NOW())
        ON CONFLICT (employee_id) DO UPDATE
        SET current_app = ${appName ?? null}, last_activity = NOW(), updated_at = NOW()
      `;
      await emitSocketEvent('employee-activity-updated', employeeStatusPayload(user, 'working', appName), { toAdmins: true });
      return ok({ ok: true });
    }

    if (action === 'logout') {
      await sql`
        INSERT INTO employee_status(employee_id, current_status, current_app, last_activity, updated_at)
        VALUES(${user.sub}, 'offline', NULL, NOW(), NOW())
        ON CONFLICT (employee_id) DO UPDATE
        SET current_status = 'offline', current_app = NULL, last_activity = NOW(), updated_at = NOW()
      `;
      await emitSocketEvent('employee-status', employeeStatusPayload(user, 'offline', null), { toAdmins: true });
      await emitSocketEvent('employee-logged-out', employeeStatusPayload(user, 'offline', null), { toAdmins: true });
      return ok({ ok: true });
    }

    return err('Invalid action');
  } catch (e: any) {
  console.error('================ ERROR =================');
  console.error(e);
  console.error('MESSAGE:', e?.message);
  console.error('STACK:', e?.stack);
  console.error('========================================');

  return err(e?.message || 'Internal server error', 500);
}
}

export async function GET(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;
  const { role, sub } = user;
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

  try {
    let rows;
    if (role === 'employee') {
      rows = await sql`
        SELECT a.*, p.full_name AS user_name
        FROM attendance a
        JOIN public.profiles p ON p.id = a.employee_id
        WHERE a.employee_id = ${sub} AND DATE(a.check_in) = ${date}
        ORDER BY a.check_in DESC
      `;
    } else {
      rows = await sql`
        SELECT a.*, p.full_name AS user_name
        FROM attendance a
        JOIN public.profiles p ON p.id = a.employee_id
        WHERE DATE(a.check_in) = ${date}
        ORDER BY a.check_in DESC
        LIMIT 200
      `;
    }
    return ok(rows);
  } catch (e: any) {
    console.error('GET /api/sessions error:', e?.message || e);
    return err(e?.message || 'Internal server error', 500);
  }
}
