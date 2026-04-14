import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Kuwait mobile: 8-digit local part must start with 5, 6, or 9.
 * Optional country prefix +965 / 965; spaces/hyphens stripped before check.
 */
export const KUWAIT_CUSTOMER_PHONE_PATTERN = /^(\+?965)?[569]\d{7}$/;

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
