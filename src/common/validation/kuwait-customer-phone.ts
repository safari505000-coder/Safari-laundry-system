import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Kuwait mobile: 8-digit local part must start with 5, 6, or 9.
 * Optional country prefix +965 / 965; spaces/hyphens stripped before check.
 */
export const KUWAIT_CUSTOMER_PHONE_PATTERN = /^(\+?965)?[569]\d{7}$/;

/**
 * Digits for Moatmt / WhatsApp: Kuwait mobile as 965 + 8 digits (5/6/9…).
 * Returns compact digits string starting with 965, or null.
 */
export function kuwaitPhoneDigitsForMoatmt(phone: string): string | null {
  const d = phone.replace(/[\s\-+]/g, '');
  if (d.length === 8 && /^[569]\d{7}$/.test(d)) {
    return `965${d}`;
  }
  if (d.length === 11 && d.startsWith('965') && /^965[569]\d{7}$/.test(d)) {
    return d;
  }
  if (d.length === 12 && d.startsWith('00965') && /^00965[569]\d{7}$/.test(d)) {
    return d.slice(2);
  }
  if (d.length > 0 && d.startsWith('965') && d.length >= 11) {
    return d;
  }
  return null;
}

/**
 * Prefer the first field that is a valid Kuwait mobile (e.g. `phone` vs
 * `phone2` on Customer). Stops a landline/foreign primary `phone` from
 * blocking Moatmt when `phone2` is the real WhatsApp number.
 */
export function pickFirstKuwaitMobileForWhatsApp(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const c of candidates) {
    const t = c?.trim();
    if (t && kuwaitPhoneDigitsForMoatmt(t)) {
      return t;
    }
  }
  return null;
}

/**
 * For UPayments + customer notify: a valid Kuwait mobile if any candidate
 * parses; otherwise the first non-empty (legacy) so we do not change DB-only
 * behaviour when all values are non-standard.
 */
export function resolveCustomerPhoneForNotify(
  ...candidates: Array<string | null | undefined>
): string {
  const picked = pickFirstKuwaitMobileForWhatsApp(...candidates);
  if (picked) {
    return picked;
  }
  for (const c of candidates) {
    const t = c?.trim();
    if (t) {
      return t;
    }
  }
  return '';
}

export function IsKuwaitCustomerPhone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isKuwaitCustomerPhone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          const compact = value.replace(/[\s-]/g, '');
          return KUWAIT_CUSTOMER_PHONE_PATTERN.test(compact);
        },
        defaultMessage() {
          return (
            'customerPhone must be a valid Kuwait mobile: optional +965/965, ' +
            'then 8 digits starting with 5, 6, or 9 (e.g. +96551234567 or 51234567)'
          );
        },
      },
    });
  };
}
