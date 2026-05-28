export const companyBrand = {
  nameAr: 'مجموعة مصابغ سفاري السريعة',
  nameEn: 'Safari Express Laundries Group',
  phone: '22200299',
  logoPath: '/logo.png',
  branches: [
    'سفاري الجهراء',
    'سفاري الرقعي',
    'سفاري صباح السالم',
    'سفاري الفروانية',
  ],
  colors: {
    primaryBlue: '#2D5BEE',
    darkBlue: '#2448C8',
    cyan: '#5FE7F3',
    lightCyan: '#8EF5FF',
    grayBackground: '#EAEAEA',
    gradient: 'linear-gradient(135deg, #2448C8 0%, #2D5BEE 52%, #5FE7F3 100%)',
  },
  /** Staff ERP login — www subdomain in production. */
  staffPortalUrl:
    import.meta.env.VITE_STAFF_ERP_URL?.trim() ||
    'https://www.safariomni.com/login',
} as const;
