import { ValidationOptions } from 'class-validator';
export declare const KUWAIT_CUSTOMER_PHONE_PATTERN: RegExp;
export declare function kuwaitPhoneDigitsForMoatmt(phone: string): string | null;
export declare function pickFirstKuwaitMobileForWhatsApp(...candidates: Array<string | null | undefined>): string | null;
export declare function resolveCustomerPhoneForNotify(...candidates: Array<string | null | undefined>): string;
export declare function IsKuwaitCustomerPhone(validationOptions?: ValidationOptions): (object: object, propertyName: string) => void;
