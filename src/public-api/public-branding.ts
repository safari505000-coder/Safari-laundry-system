import { APP_BRAND, BRAND_CUSTOMER_AR } from '../common/constants/branding';

export const PUBLIC_COMPANY_PHONE = '22200299';

export const PUBLIC_COMPANY_BRANCHES = [
  'سفاري الجهراء',
  'سفاري الرقعي',
  'سفاري صباح السالم',
  'سفاري الفروانية',
] as const;

export const PUBLIC_COMPANY_COLORS = {
  primaryBlue: '#2D5BEE',
  darkBlue: '#2448C8',
  cyan: '#5FE7F3',
  lightCyan: '#8EF5FF',
  grayBackground: '#EAEAEA',
  gradient: ['#2448C8', '#2D5BEE', '#5FE7F3'],
} as const;

export const PUBLIC_COMPANY_BRAND = {
  nameAr: BRAND_CUSTOMER_AR,
  nameEn: APP_BRAND,
  phone: PUBLIC_COMPANY_PHONE,
  branches: [...PUBLIC_COMPANY_BRANCHES],
  colors: PUBLIC_COMPANY_COLORS,
} as const;
