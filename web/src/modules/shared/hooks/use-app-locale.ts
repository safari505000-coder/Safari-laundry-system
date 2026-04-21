/**
 * V19.9.4 — Locale policy for numbers and dates.
 *
 * Product decision (per owner request): ALL numeric and date output
 * across every role must render with Latin (0-9) digits and an
 * English date format, independent of the UI language choice (the
 * translated strings / labels stay Arabic when Arabic is selected,
 * but numeric tokens inside them are always `en-GB`). `en-GB` is
 * picked over `en-US` because it yields DD/MM/YYYY which matches
 * the Kuwaiti reading convention and it still produces pure Latin
 * digits.
 *
 * If a future change needs Arabic-Indic digits, flip this single
 * constant and every page that routes through the hook + the
 * `formatKwdLabel` helper will follow suit.
 */
export const APP_LOCALE = 'en-GB';

export function useAppLocale(): string {
  return APP_LOCALE;
}
