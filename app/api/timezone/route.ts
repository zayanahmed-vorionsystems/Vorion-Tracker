import { NextRequest } from 'next/server';
import { ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type TimeZonePayload = {
  abbreviation?: string | null;
  datetime?: string | null;
  timezone: string;
  utcOffset?: string | null;
  source: 'rapidapi' | 'browser-fallback';
};

function getClientIp(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const realIp = req.headers.get('x-real-ip') || '';
  const candidate = forwarded.split(',')[0]?.trim() || realIp.trim();
  if (!candidate) return null;
  return candidate.replace(/^::ffff:/, '');
}

function parsePlainTextPayload(raw: string): Partial<TimeZonePayload> | null {
  const timezone = raw.match(/^timezone:\s*(.+)$/im)?.[1]?.trim();
  if (!timezone) return null;

  return {
    timezone,
    abbreviation: raw.match(/^abbreviation:\s*(.+)$/im)?.[1]?.trim() || null,
    datetime: raw.match(/^datetime:\s*(.+)$/im)?.[1]?.trim() || null,
    utcOffset: raw.match(/^utc_offset:\s*(.+)$/im)?.[1]?.trim() || null,
  };
}

async function fetchRapidApiTimeZone(req: NextRequest): Promise<TimeZonePayload | null> {
  const apiKey = process.env.RAPIDAPI_WORLD_TIME_KEY;
  if (!apiKey) return null;

  const host = process.env.RAPIDAPI_WORLD_TIME_HOST || 'world-time-api3.p.rapidapi.com';
  const ip = getClientIp(req);
  const endpoints = ip
    ? [`https://${host}/ip/${encodeURIComponent(ip)}`, `https://${host}/ip/${encodeURIComponent(ip)}.txt`]
    : [`https://${host}/ip`, `https://${host}/ip.txt`];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          'x-rapidapi-host': host,
          'x-rapidapi-key': apiKey,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });

      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (data?.timezone) {
          return {
            abbreviation: data.abbreviation || null,
            datetime: data.datetime || null,
            timezone: data.timezone,
            utcOffset: data.utc_offset || null,
            source: 'rapidapi',
          };
        }
      } else {
        const text = await response.text();
        const parsed = parsePlainTextPayload(text);
        if (parsed?.timezone) {
          return {
            abbreviation: parsed.abbreviation || null,
            datetime: parsed.datetime || null,
            timezone: parsed.timezone,
            utcOffset: parsed.utcOffset || null,
            source: 'rapidapi',
          };
        }
      }
    } catch (error) {
      console.error('[timezone] RapidAPI lookup failed', { endpoint, error });
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  const rapidApiPayload = await fetchRapidApiTimeZone(req);
  if (rapidApiPayload) return ok(rapidApiPayload);

  return ok({
    timezone: 'America/New_York',
    abbreviation: null,
    datetime: null,
    utcOffset: null,
    source: 'browser-fallback',
  });
}
