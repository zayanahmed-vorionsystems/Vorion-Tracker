import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireAuth, ok, err } from '@/lib/api';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = requireAuth(req);
  if ('status' in user) return user;

  try {
    const columns = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'alerts'`;
    const names = new Set(columns.map((row: any) => row.column_name));
    const hasModernSchema = names.has('employee_id') && names.has('alert_type') && names.has('title') && names.has('description');

    let updated: any[];

    if (hasModernSchema) {
      updated = await sql`
        UPDATE alerts
        SET is_read = true
        WHERE id = ${params.id} AND employee_id = ${user.sub}
        RETURNING id, employee_id, alert_type, title, description, severity, status, metadata, is_read, created_at, sent_at
      `;
    } else {
      updated = await sql`
        UPDATE alerts
        SET is_read = true
        WHERE id = ${params.id} AND to_user_id = ${user.sub}
        RETURNING id, from_user_id, to_user_id, message, is_read, sent_at, created_at
      `;
    }

    if (!updated.length) return err('Alert not found', 404);
    return ok(updated[0]);
  } catch (error: any) {
    console.error('PATCH /api/alerts/[id] error:', error?.message || error);
    return err(error?.message || 'Failed to update alert', 500);
  }
}
