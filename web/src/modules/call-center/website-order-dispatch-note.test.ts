import { describe, expect, test } from 'vitest';
import {
  buildWebsiteOrderDispatchNote,
  formatWebsiteOrderTime,
  parseWebsiteOrderNotes,
} from './website-order-dispatch-note';

describe('parseWebsiteOrderNotes', () => {
  test('extracts structured public-web fields and ignores them from extra', () => {
    const notes = [
      'طريقة الخدمة: مندوب',
      'السرعة: مستعجل',
      'الفرع الأقرب: سفاري الرقعي',
      'الوقت المفضل: 2024-05-21T20:06',
    ].join('\n');

    const parsed = parseWebsiteOrderNotes(notes);

    expect(parsed.fields['طريقة الخدمة']).toBe('مندوب');
    expect(parsed.fields['السرعة']).toBe('مستعجل');
    expect(parsed.fields['الفرع الأقرب']).toBe('سفاري الرقعي');
    expect(parsed.fields['الوقت المفضل']).toBe('2024-05-21T20:06');
    expect(parsed.extra).toEqual([]);
  });

  test('keeps unknown freeform lines in extra', () => {
    const parsed = parseWebsiteOrderNotes('الوقت المفضل: 2024-05-21T20:06\nاتصل قبل الوصول');
    expect(parsed.fields['الوقت المفضل']).toBe('2024-05-21T20:06');
    expect(parsed.extra).toEqual(['اتصل قبل الوصول']);
  });
});

describe('formatWebsiteOrderTime', () => {
  test('formats datetime-local without throwing (no mixed Intl styles)', () => {
    const out = formatWebsiteOrderTime('2024-05-21T20:06');
    expect(out).toMatch(/٢٠٢٤|2024/);
    expect(out).toContain('٠٨:٠٦');
  });

  test('returns raw string when value is not parseable', () => {
    expect(formatWebsiteOrderTime('غداً بعد العصر')).toBe('غداً بعد العصر');
  });
});

describe('buildWebsiteOrderDispatchNote', () => {
  test('includes only preferred time — not order ref, customer, address, branch, or speed', () => {
    const note = buildWebsiteOrderDispatchNote({
      notes: [
        'طريقة الخدمة: مندوب',
        'السرعة: مستعجل',
        'الفرع الأقرب: سفاري الرقعي',
        'الوقت المفضل: 2024-05-21T20:06',
      ].join('\n'),
      requestedItems: null,
    });

    expect(note).toMatch(/^الوقت المفضل:/);
    expect(note).not.toContain('W-');
    expect(note).not.toContain('91111855');
    expect(note).not.toContain('الرقعي');
    expect(note).not.toContain('طريقة الخدمة');
    expect(note).not.toContain('السرعة');
    expect(note).not.toContain('الفرع الأقرب');
  });

  test('appends requested items when present', () => {
    const note = buildWebsiteOrderDispatchNote({
      notes: 'الوقت المفضل: 2024-05-21T20:06',
      requestedItems: [{ label: 'دشداشة', quantity: 2 }],
    });

    expect(note).toContain('الأصناف المطلوبة');
    expect(note).toContain('دشداشة × 2');
  });

  test('caps output at 500 characters', () => {
    const note = buildWebsiteOrderDispatchNote({
      notes: `الوقت المفضل: 2024-05-21T20:06\n${'x'.repeat(600)}`,
      requestedItems: null,
    });
    expect(note.length).toBeLessThanOrEqual(500);
  });
});
