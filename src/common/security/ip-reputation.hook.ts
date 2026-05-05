function parseBlocklist(raw: string | undefined): Set<string> {
  const s = new Set<string>();
  if (!raw?.trim()) {
    return s;
  }
  for (const part of raw.split(/[,\s]+/)) {
    const t = part.trim();
    if (t) {
      s.add(t);
    }
  }
  return s;
}

const BLOCKLIST = parseBlocklist(process.env.IP_REPUTATION_BLOCKLIST);

/** CSV of exact IPs (v4/v6) to reject at edge. */
export function hasBlockedClientIp(
  expressIp: string | undefined,
  remote: string | undefined,
): string | null {
  if (process.env.IP_REPUTATION_ENABLED !== 'true' || BLOCKLIST.size === 0) {
    return null;
  }
  const candidates = [expressIp, remote].filter(Boolean) as string[];
  for (const c of candidates) {
    if (BLOCKLIST.has(c)) {
      return 'blocklist_match';
    }
  }
  return null;
}
