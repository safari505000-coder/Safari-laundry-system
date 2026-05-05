import type { Customer360InternalDto, Customer360SanitizedDto, Customer360StatementDto } from './customer-360.types';
export declare function applyCustomerFriendlyPhrases(text: string): string;
export declare function buildCustomerFriendlySummary(statement: Customer360StatementDto): string;
export declare function sanitizeCustomerView(data: Customer360InternalDto): Customer360SanitizedDto;
