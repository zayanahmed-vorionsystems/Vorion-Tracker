const SUSPICIOUS_VALUE_PATTERNS = [
  /(?:^|[\s"'`;&|])start-sleep(?:[\s"'`;&|]|$)/i,
  /(?:^|[\s"'`;&|])timeout\s+\/t(?:[\s"'`;&|]|$)/i,
  /(?:^|[\s"'`;&|])powershell(?:[\s"'`;&|]|$)/i,
  /(?:^|[\s"'`;&|])cmd(?:\.exe)?(?:[\s"'`;&|]|$)/i,
  /(?:^|[\s"'`;&|])\/bin\/(?:sh|bash)(?:[\s"'`;&|]|$)/i,
  /\$\(/,
  /`/,
  /&&/,
  /\|\|/,
  /[;&|]\s*(?:sleep|ping|curl|wget|nc|netcat|python|perl|ruby|php|node)\b/i,
];

export function hasSuspiciousQueryPayload(url: URL): boolean {
  for (const rawValue of Array.from(url.searchParams.values())) {
    const value = rawValue.trim();
    if (!value) continue;

    for (const pattern of SUSPICIOUS_VALUE_PATTERNS) {
      if (pattern.test(value)) return true;
    }
  }

  return false;
}

export function clampLimit(input: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(String(input ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}
