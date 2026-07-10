import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireAuth, err, ok } from '@/lib/api';
import { assertSupabaseAdmin } from '@/lib/supabase';
import { hasSmtpConfig, sendScreenshotFlagReportEmail } from '@/lib/mailer';
import { ensureRoleFeatureSchema } from '@/lib/schema';
import {
  canCreateScreenshotFlags,
  canSendFlagReports,
  canViewFlags,
  normalizeRole,
} from '@/lib/roles';

function parseEmailList(value: FormDataEntryValue | null) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;
  const role = normalizeRole(user.role);
  if (!canViewFlags(role)) return err('Forbidden', 403);

  try {
    await ensureRoleFeatureSchema();
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId');
    const date = searchParams.get('date');

    const rows = await sql`
      SELECT
        sf.id,
        sf.comment,
        sf.pdf_url,
        sf.pdf_name,
        sf.email_to,
        sf.email_cc,
        sf.email_sent_at,
        sf.created_at,
        sf.updated_at,
        s.id AS screenshot_id,
        s.file_url AS screenshot_url,
        s.captured_at,
        employee.full_name AS employee_name,
        flagged_by.full_name AS flagged_by_name
      FROM screenshot_flags sf
      JOIN screenshots s ON s.id = sf.screenshot_id
      JOIN public.profiles employee ON employee.id = sf.employee_id
      JOIN public.profiles flagged_by ON flagged_by.id = sf.flagged_by
      ORDER BY sf.created_at DESC
    `;
    const filtered = (rows || []).filter((row: any) => {
      if (employeeId && String(row.employee_id || '') !== String(employeeId)) return false;
      if (date) {
        const rowDate = new Date(row.captured_at).toISOString().slice(0, 10);
        if (rowDate !== date) return false;
      }
      return true;
    });

    return ok(filtered);
  } catch (e: any) {
    console.error('GET /api/screenshot-flags error:', e?.message || e);
    return err(e?.message || 'Failed to load screenshot flags', 500);
  }
}

export async function POST(req: NextRequest) {
  const user = requireAuth(req);
  if ('status' in user) return user;
  const role = normalizeRole(user.role);
  if (!canCreateScreenshotFlags(role)) return err('Forbidden', 403);

  try {
    await ensureRoleFeatureSchema();
    const formData = await req.formData();
    const screenshotId = String(formData.get('screenshotId') || '').trim();
    const comment = String(formData.get('comment') || '').trim();
    const sendReport = String(formData.get('sendReport') || '').toLowerCase() === 'true';
    const to = parseEmailList(formData.get('to'));
    const cc = parseEmailList(formData.get('cc'));
    const pdf = formData.get('pdf');

    if (!screenshotId) return err('screenshotId is required', 400);
    if (!comment) return err('comment is required', 400);
    if (sendReport && !canSendFlagReports(role)) {
      return err('Only QA Managers can send report emails.', 403);
    }

    const screenshotRows = await sql`
      SELECT s.id, s.file_url, s.captured_at, s.employee_id, p.full_name AS employee_name
      FROM screenshots s
      JOIN public.profiles p ON p.id = s.employee_id
      WHERE s.id = ${screenshotId}
      LIMIT 1
    `;
    const screenshot = screenshotRows?.[0];
    if (!screenshot) return err('Screenshot not found', 404);

    let pdfUrl: string | null = null;
    let pdfName: string | null = null;
    let attachmentBuffer: Buffer | null = null;

    if (pdf && typeof pdf !== 'string') {
      if (pdf.type !== 'application/pdf') {
        return err('Only PDF uploads are allowed.', 400);
      }
      attachmentBuffer = Buffer.from(await pdf.arrayBuffer());
      pdfName = pdf.name || `flag-report-${Date.now()}.pdf`;
      const objectPath = `flag-reports/${user.sub}/${Date.now()}-${pdfName}`;
      const admin = assertSupabaseAdmin();
      const { error: uploadError } = await admin.storage
        .from('screenshots')
        .upload(objectPath, attachmentBuffer, { contentType: 'application/pdf', upsert: false });
      if (uploadError) {
        console.error('[screenshot-flags] pdf upload failed', uploadError);
        return err('Failed to upload PDF report.', 500);
      }
      pdfUrl = admin.storage.from('screenshots').getPublicUrl(objectPath).data?.publicUrl || null;
    }

    if (sendReport && to.length === 0) {
      return err('At least one "to" email is required to send a report.', 400);
    }

    let emailSent = false;
    let emailWarning: string | null = null;

    if (sendReport) {
      if (!hasSmtpConfig()) {
        emailWarning = 'SMTP is not configured, so the flag was saved without sending the email report.';
      } else {
        try {
          const subject = `Vorion Screenshot Flag Report - ${screenshot.employee_name}`;
          const html = `
            <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
              <h2>Screenshot Flag Report</h2>
              <p><strong>Employee:</strong> ${screenshot.employee_name}</p>
              <p><strong>Captured:</strong> ${new Date(screenshot.captured_at).toLocaleString()}</p>
              <p><strong>Flagged by:</strong> ${user.name}</p>
              <p><strong>Comment:</strong></p>
              <p>${comment.replace(/\n/g, '<br />')}</p>
              <p><a href="${screenshot.file_url}">Open screenshot</a></p>
            </div>
          `;
          const text =
            `Screenshot Flag Report\n\n` +
            `Employee: ${screenshot.employee_name}\n` +
            `Captured: ${new Date(screenshot.captured_at).toLocaleString()}\n` +
            `Flagged by: ${user.name}\n\n` +
            `Comment:\n${comment}\n\n` +
            `Screenshot: ${screenshot.file_url}`;

          await sendScreenshotFlagReportEmail({
            to,
            cc,
            subject,
            html,
            text,
            attachments: attachmentBuffer && pdfName
              ? [{ filename: pdfName, ...(pdfUrl ? { path: pdfUrl } : { content: attachmentBuffer }) }]
              : undefined,
          });
          emailSent = true;
        } catch (mailError: any) {
          console.error('[screenshot-flags] email send failed', mailError);
          emailWarning = mailError?.message || 'Flag saved, but the report email could not be sent.';
        }
      }
    }

    const [flag] = await sql`
      INSERT INTO screenshot_flags (
        screenshot_id,
        employee_id,
        flagged_by,
        comment,
        pdf_url,
        pdf_name,
        email_to,
        email_cc,
        email_sent_at
      )
      VALUES (
        ${screenshot.id},
        ${screenshot.employee_id},
        ${user.sub},
        ${comment},
        ${pdfUrl},
        ${pdfName},
        ${to},
        ${cc},
        ${emailSent ? new Date().toISOString() : null}
      )
      RETURNING id, created_at
    `;

    return ok({
      id: flag.id,
      created_at: flag.created_at,
      screenshot_id: screenshot.id,
      pdf_url: pdfUrl,
      email_sent: emailSent,
      warning: emailWarning,
    }, 201);
  } catch (e: any) {
    console.error('POST /api/screenshot-flags error:', e?.message || e);
    return err(e?.message || 'Failed to save screenshot flag', 500);
  }
}
