import type { ShiftType } from './roles';

export type TimeWindow = { startIso: string; endIso: string };

const PKT_TIME_ZONE = 'Asia/Karachi';

function addDays(date: string, days: number) {
  const base = new Date(`${date}T00:00:00+05:00`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function formatPartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const values: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }

  return values;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = formatPartsInTimeZone(date, timeZone);
  const utcEquivalent = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return utcEquivalent - date.getTime();
}

function zonedDateTimeToUtc(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second] = time.split(':').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const firstOffset = getTimeZoneOffsetMs(guess, timeZone);
  const firstPass = new Date(guess.getTime() - firstOffset);
  const secondOffset = getTimeZoneOffsetMs(firstPass, timeZone);

  if (secondOffset === firstOffset) return firstPass;
  return new Date(guess.getTime() - secondOffset);
}

function enumerateDates(start: string, end: string) {
  const dates: string[] = [];
  let current = start;

  while (current <= end) {
    dates.push(current);
    current = addDays(current, 1);
  }

  return dates;
}

function getHourInPkt(timestamp: string | Date) {
  const parts = formatPartsInTimeZone(new Date(timestamp), PKT_TIME_ZONE);
  return Number(parts.hour);
}

export function getClientShiftWindows(date: string, shiftType: ShiftType): TimeWindow[] {
  const nextDate = addDays(date, 1);
  const firstHalf = {
    startIso: `${date}T20:00:00+05:00`,
    endIso: `${nextDate}T00:00:00+05:00`,
  };
  const secondHalf = {
    startIso: `${nextDate}T01:00:00+05:00`,
    endIso: `${nextDate}T05:00:00+05:00`,
  };

  if (shiftType === 'first_half') return [firstHalf];
  if (shiftType === 'second_half') return [secondHalf];
  return [firstHalf, secondHalf];
}

export function getUtcRangeForLocalDate(date: string, timeZone: string) {
  const start = zonedDateTimeToUtc(date, '00:00:00', timeZone);
  const end = zonedDateTimeToUtc(addDays(date, 1), '00:00:00', timeZone);

  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export function isScreenshotWithinShiftInPkt(capturedAt: string, shiftType: ShiftType) {
  const hour = getHourInPkt(capturedAt);

  if (shiftType === 'first_half') return hour >= 20;
  if (shiftType === 'second_half') return hour >= 1 && hour < 5;
  return hour >= 20 || (hour >= 1 && hour < 5);
}

export function getShiftWindowsForUtcRange(rangeStart: Date, rangeEnd: Date, shiftType: ShiftType) {
  const pktStartDate = formatPartsInTimeZone(new Date(rangeStart.getTime() - 24 * 60 * 60 * 1000), PKT_TIME_ZONE);
  const pktEndDate = formatPartsInTimeZone(new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000), PKT_TIME_ZONE);
  const startDate = `${pktStartDate.year}-${pktStartDate.month}-${pktStartDate.day}`;
  const endDate = `${pktEndDate.year}-${pktEndDate.month}-${pktEndDate.day}`;

  return enumerateDates(startDate, endDate)
    .flatMap((date) => getClientShiftWindows(date, shiftType))
    .map((window) => ({
      start: new Date(window.startIso),
      end: new Date(window.endIso),
    }))
    .filter((window) => window.start < rangeEnd && window.end > rangeStart);
}
