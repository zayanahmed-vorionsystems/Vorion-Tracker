import { sql } from '@/lib/db';
import UsersClient from './UsersClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Page() {
  const rows = await sql`
    SELECT p.id, p.full_name AS name, p.email, p.role, p.department_id, p.shift_type, p.created_at, ca.client_id AS assigned_client_id
    FROM public.profiles p
    LEFT JOIN client_assignments ca ON ca.employee_id = p.id
    ORDER BY p.full_name
  `;

  return <UsersClient initialUsers={rows} />;
}
