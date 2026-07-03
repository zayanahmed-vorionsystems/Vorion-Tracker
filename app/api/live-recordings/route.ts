import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const employeeId = String(formData.get('employeeId') || '');
    const adminId = String(formData.get('adminId') || '');
    const startTime = String(formData.get('startTime') || new Date().toISOString());
    const endTime = String(formData.get('endTime') || new Date().toISOString());
    const duration = Number(formData.get('duration') || 0);
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Recording file is required.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileName = `live-${employeeId || 'unknown'}-${Date.now()}.webm`;

    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin.storage
        .from('live-recordings')
        .upload(fileName, buffer, {
          contentType: file.type || 'video/webm',
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('[live-recordings] Supabase upload failed', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const { data: signedData } = await supabaseAdmin.storage
        .from('live-recordings')
        .createSignedUrl(data?.path || fileName, 60 * 60 * 24 * 7);

      return NextResponse.json({
        ok: true,
        employeeId,
        adminId,
        startTime,
        endTime,
        duration,
        fileUrl: signedData?.signedUrl || null,
      });
    }

    return NextResponse.json({
      ok: true,
      employeeId,
      adminId,
      startTime,
      endTime,
      duration,
      fileUrl: `data:${file.type || 'video/webm'};base64,${buffer.toString('base64')}`,
    });
  } catch (error: any) {
    console.error('[live-recordings] failed', error?.stack || error);
    return NextResponse.json({ error: error?.message || 'Recording upload failed' }, { status: 500 });
  }
}
