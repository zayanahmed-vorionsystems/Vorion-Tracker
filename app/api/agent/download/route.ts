import { NextRequest, NextResponse } from 'next/server';

const downloadUrls: Record<string, string | undefined> = {
  win: process.env.NEXT_PUBLIC_AGENT_WIN_URL,
  mac: process.env.NEXT_PUBLIC_AGENT_MAC_URL,
  linux: process.env.NEXT_PUBLIC_AGENT_LINUX_URL,
};

const fileNames: Record<string, string> = {
  win: 'VorionTracker-Agent-Setup.exe',
  mac: 'VorionTracker-Agent.dmg',
  linux: 'vorion-tracker-agent.tar.gz',
};

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get('platform')?.toLowerCase();
  if (!platform) {
    return NextResponse.json({ error: 'Missing platform query param' }, { status: 400 });
  }

  const downloadUrl = downloadUrls[platform];
  if (!downloadUrl) {
    return NextResponse.json(
      { error: `Download URL not configured for platform '${platform}'` },
      { status: 404 }
    );
  }

  const upstream = await fetch(downloadUrl);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Failed to fetch agent asset: ${upstream.status} ${upstream.statusText}` },
      { status: 502 }
    );
  }

  const headers = new Headers(upstream.headers);
  headers.set('Content-Disposition', `attachment; filename=${fileNames[platform]}`);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
