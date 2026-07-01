'use server';
import { sql } from '@/lib/db';
import UsersClient from './UsersClient';
export const dynamic = 'force-dynamic';
export default async function Page() {
  // Server-side fetch from `public.profiles` for initial render.
  const rows = await sql`
    SELECT id, full_name AS name, email, role, department_id, created_at
    FROM public.profiles
    ORDER BY full_name
  `;

  return <UsersClient initialUsers={rows} />;
}
