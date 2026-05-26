/** Input slice for building a driver instruction note from a website order row. */
export type WebsiteOrderDispatchNoteInput = {
  notes: string | null;
  requestedItems: unknown;
};

const WEBSITE_ORDER_NOTE_KEYS = [
  'طريقة الخدمة',
  'السرعة',
  'الفرع الأقرب',
  'الوقت المفضل',
  'Preferred time',
] as const;

/** Structured website-order notes the public form stores as `key: value` lines. */
export function parseWebsiteOrderNotes(notes: string | null | undefined): {
  fields: Record<string, string>;
  extra: string[];
} {
  const fields: Record<string, string> = {};
  const extra: string[] = [];
  if (!notes?.trim()) return { fields, extra };

  for (const line of notes.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    if (colon > 0) {
      const key = trimmed.slice(0, colon).trim();
      const value = trimmed.slice(colon + 1).trim();
      if (
        (WEBSITE_ORDER_NOTE_KEYS as readonly string[]).includes(key) &&
        value
      ) {
        fields[key] = value;
        continue;
      }
    }
    extra.push(trimmed);
  }

  return { fields, extra };
}

/** Formats `datetime-local` / ISO values for Arabic driver notes. */
export function formatWebsiteOrderTime(raw: string): string {
  const trimmed = raw.trim();
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }
  try {
    return parsed.toLocaleString('ar-KW', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return trimmed;
  }
}

/**
 * Driver note prefill for website-order → dispatch handoff.
 * Only preferred time (+ freeform extras + requested items) — customer
 * identity and branch metadata stay on the dispatch customer record.
 */
export function buildWebsiteOrderDispatchNote(
  row: WebsiteOrderDispatchNoteInput,
): string {
  const parsed = parseWebsiteOrderNotes(row.notes);
  const lines: string[] = [];

  const preferredTime =
    parsed.fields['الوقت المفضل'] ?? parsed.fields['Preferred time'];
  if (preferredTime) {
    lines.push(`الوقت المفضل: ${formatWebsiteOrderTime(preferredTime)}`);
  }

  if (parsed.extra.length > 0) {
    lines.push('', ...parsed.extra);
  }

  if (Array.isArray(row.requestedItems) && row.requestedItems.length > 0) {
    lines.push('', 'الأصناف المطلوبة:');
    for (const item of row.requestedItems) {
      if (
        item != null &&
        typeof item === 'object' &&
        'label' in item &&
        typeof (item as { label: unknown }).label === 'string'
      ) {
        const typed = item as { label: string; quantity?: number };
        lines.push(
          `• ${typed.label}${typed.quantity != null ? ` × ${typed.quantity}` : ''}`,
        );
      }
    }
  }

  return lines.join('\n').slice(0, 500);
}
