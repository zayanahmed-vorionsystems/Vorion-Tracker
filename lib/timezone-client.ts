'use client';

import { useEffect, useState } from 'react';

export type TimeZoneInfo = {
  abbreviation?: string | null;
  datetime?: string | null;
  timezone: string;
  utcOffset?: string | null;
  source: 'rapidapi' | 'browser-fallback' | 'browser';
};

const DEFAULT_TIME_ZONE = 'America/New_York';

let cachedTimeZoneInfo: TimeZoneInfo | null = null;
let inFlightRequest: Promise<TimeZoneInfo> | null = null;

function getBrowserTimeZone() {
  if (typeof window === 'undefined') return DEFAULT_TIME_ZONE;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
}

export function getCurrentDateInTimeZone(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function formatDateTimeInTimeZone(
  value: string | number | Date | null | undefined,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  }).format(new Date(value));
}

export function formatTimeInTimeZone(
  value: string | number | Date | null | undefined,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  }).format(new Date(value));
}

export function getTimeZoneDisplayName(info: TimeZoneInfo) {
  const parts = [info.timezone];
  if (info.abbreviation) parts.push(info.abbreviation);
  if (info.utcOffset) parts.push(`UTC${info.utcOffset}`);
  return parts.join(' · ');
}

async function loadTimeZoneInfo(): Promise<TimeZoneInfo> {
  if (cachedTimeZoneInfo) return cachedTimeZoneInfo;
  if (inFlightRequest) return inFlightRequest;

  inFlightRequest = fetch('/api/timezone', { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Timezone lookup failed with ${response.status}`);
      const data = await response.json();
      const payload: TimeZoneInfo = {
        abbreviation: data?.abbreviation || null,
        datetime: data?.datetime || null,
        timezone: data?.timezone || getBrowserTimeZone(),
        utcOffset: data?.utcOffset || data?.utc_offset || null,
        source: data?.source || 'rapidapi',
      };
      cachedTimeZoneInfo = payload;
      return payload;
    })
    .catch((error) => {
      console.error('[timezone] Falling back to browser timezone', error);
      const payload: TimeZoneInfo = {
        timezone: getBrowserTimeZone(),
        abbreviation: null,
        datetime: null,
        utcOffset: null,
        source: 'browser',
      };
      cachedTimeZoneInfo = payload;
      return payload;
    })
    .finally(() => {
      inFlightRequest = null;
    });

  return inFlightRequest;
}

export function useUserTimeZone() {
  const [info, setInfo] = useState<TimeZoneInfo>(() => cachedTimeZoneInfo || {
    timezone: getBrowserTimeZone(),
    abbreviation: null,
    datetime: null,
    utcOffset: null,
    source: 'browser',
  });

  useEffect(() => {
    let cancelled = false;
    void loadTimeZoneInfo().then((payload) => {
      if (!cancelled) setInfo(payload);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}
