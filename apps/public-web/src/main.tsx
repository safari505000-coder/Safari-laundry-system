import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { createOrderRequest, createCustomerPaymentLink, createCustomerBalancePaymentLink, getCatalog, getCustomerPortal } from './api';
import { companyBrand } from './brand';
import type { CustomerPortalOrder, PublicServiceItem } from '../../../packages/shared-api/src';
import './styles.css';

type Lang = 'ar' | 'en';

const NAV_LINKS: Array<{ href: string; ar: string; en: string }> = [
  { href: '#story', ar: 'القصة', en: 'Story' },
  { href: '#services', ar: 'الخدمات', en: 'Services' },
  { href: '#flow', ar: 'كيف نعمل', en: 'How It Works' },
  { href: '#prices', ar: 'الأسعار', en: 'Prices' },
  { href: '#branches', ar: 'الفروع', en: 'Branches' },
  { href: '#order', ar: 'طلب خدمة', en: 'Order' },
  { href: '#faq', ar: 'الأسئلة', en: 'FAQ' },
];

const BRANCHES: Array<{ name: string; area: string; mapsQuery: string }> = [
  { name: 'سفاري الجهراء', area: 'الجهراء', mapsQuery: 'Safari Laundry Jahra Kuwait' },
  { name: 'سفاري الرقعي', area: 'الرقعي', mapsQuery: 'Safari Laundry Rai Kuwait' },
  { name: 'سفاري صباح السالم', area: 'صباح السالم', mapsQuery: 'Safari Laundry Sabah Al Salem Kuwait' },
  { name: 'سفاري الفروانية', area: 'الفروانية', mapsQuery: 'Safari Laundry Farwaniya Kuwait' },
];

const SERVICES: Array<{ key: string; ar: string; en: string; desc: string }> = [
  {
    key: 'dry-clean',
    ar: 'تنظيف جاف',
    en: 'Dry Clean',
    desc: 'عناية احترافية للملابس الرسمية، البدلات، الفساتين، والقطع الحساسة بمواد آمنة على القماش.',
  },
  {
    key: 'steam',
    ar: 'كي بالبخار',
    en: 'Steam Press',
    desc: 'كي بالبخار للدشاديش، القمصان، والملابس اليومية بحرفية وانضباط في التسليم.',
  },
  {
    key: 'mattresses',
    ar: 'مفروشات وأقمشة ثقيلة',
    en: 'Mattresses & Heavy Fabrics',
    desc: 'تنظيف الستائر، البطانيات، والمفروشات المنزلية الكبيرة بمعدات متخصصة.',
  },
  {
    key: 'pickup',
    ar: 'استلام وتوصيل',
    en: 'Pickup & Delivery',
    desc: 'مندوب سفاري يصل إلى عنوانك، يستلم القطع، ويعيدها جاهزة في الوقت المتفق عليه.',
  },
];

const FLOW_STEPS: Array<{ no: string; title: string; desc: string }> = [
  {
    no: '01',
    title: 'حدد طلبك',
    desc: 'اختر نوع الخدمة والسرعة والفرع الأقرب من نموذج الطلب.',
  },
  {
    no: '02',
    title: 'نتواصل ونستلم',
    desc: 'يتواصل معك فريق سفاري لتأكيد التفاصيل، ثم يستلم المندوب القطع.',
  },
  {
    no: '03',
    title: 'تسليم في الموعد',
    desc: 'نتم العناية بالقطع، ويتم التسليم في الوقت المتفق عليه.',
  },
];

const PILLARS: Array<{ title: string; desc: string }> = [
  {
    title: 'إرث ممتد منذ 1992',
    desc: 'أربعة وثلاثون عاماً من الخدمة في السوق الكويتي مع جيلين من العملاء.',
  },
  {
    title: 'تقنية إيطالية للكي',
    desc: 'مكاوي بخار وأنظمة تنظيف جاف بمعايير عالمية لجودة ثابتة.',
  },
  {
    title: 'حماية الأنسجة',
    desc: 'مواد تنظيف معتمدة تحافظ على الألوان وعمر القماش لفترة أطول.',
  },
  {
    title: 'أسطول مدروس',
    desc: 'مركبات مجهزة لحفظ الملابس أثناء النقل بين العنوان والفرع.',
  },
];

const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  {
    q: 'وش الخدمات اللي تقدمونها؟',
    a: 'تنظيف جاف، كي بالبخار، عناية بالمفروشات والقطع الثقيلة، إضافة لخدمة استلام وتسليم بمندوب سفاري.',
  },
  {
    q: 'وش هي ساعات العمل؟',
    a: 'الفروع تعمل من الساعة 8:00 صباحاً حتى 11:00 مساءً يومياً.',
  },
  {
    q: 'كيف أطلب خدمة الاستلام والتسليم؟',
    a: 'استخدم نموذج «طلب خدمة» في الصفحة، اختر مندوب، الفرع الأقرب، والوقت المفضل، وسيتم التواصل لتأكيد التفاصيل.',
  },
  {
    q: 'متى أستلم ملابسي؟',
    a: 'يعتمد على نوع القطع والسرعة. الخدمة العادية تأخذ وقتها المعتاد، والمستعجلة تحصل على أولوية في التنفيذ.',
  },
  {
    q: 'وش طرق الدفع المتاحة؟',
    a: 'الدفع يتم عند الاستلام أو عبر القنوات المعتمدة من الفرع. يتم تأكيد قيمة الفاتورة بعد جرد القطع فعلياً.',
  },
];

const RECEIPT_TERMS = [
  'يرجى مراجعة الفاتورة خلال 24 ساعة من الاستلام.',
  'المصبغة غير مسؤولة عن المقتنيات الشخصية المتروكة داخل الملابس.',
  'لا تلتزم الشركة بتخزين الطلبات بعد مرور 30 يوماً من تاريخ الفاتورة.',
  'تعويض القطع التالفة يخضع لسياسة الشركة وبحد أقصى 25% مع إبراز الفاتورة الأصلية.',
];

const T = {
  ar: {
    eyebrow1992: 'تأسست عام 1992',
    heroTitle: 'عناية كويتية بالملابس والمفروشات منذ أربعة وثلاثين عاماً.',
    heroLead:
      'مجموعة مصابغ سفاري السريعة. خبرة طويلة في الغسيل الجاف والكي بالبخار، تقدّم بعقلية حديثة عبر استلام وتسليم لكل مناطق الكويت.',
    orderNow: 'اطلب خدمة الآن',
    call: 'اتصل',
    stat1: 'سنة التأسيس',
    stat2: 'عاماً من الخبرة',
    stat3: 'فروع في الكويت',
    storyEyebrow: 'القصة',
    storyTitle: 'ليست مجرد مصبغة. وجهة العناية اليومية.',
    storyP1:
      'بدأت سفاري عام 1992 برؤية واضحة: تقديم عناية رصينة بالملابس والمفروشات بمواصفات لا تتنازل عن الجودة. على مدار أربعة وثلاثين عاماً توسّعت الفروع، تطوّرت الأدوات، وبقي المعيار واحداً.',
    storyP2:
      'اليوم نجمع بين تكنولوجيا الكي بالبخار، التنظيف الجاف، ومنظومة تعقيم صديقة للأنسجة. مع شبكة فروع تغطي الجهراء، الرقعي، صباح السالم، والفروانية، ورقم موحد يربطك بأقرب فرع.',
    servicesEyebrow: 'الخدمات',
    servicesTitle: 'كل ما تحتاجه لعناية يومية بملابسك.',
    flowEyebrow: 'كيف نعمل',
    flowTitle: 'ثلاث خطوات بسيطة من الطلب إلى التسليم.',
    pillarsEyebrow: 'لماذا سفاري',
    pillarsTitle: 'ركائز نبني عليها كل خدمة.',
    pricesEyebrow: 'الأسعار',
    pricesTitle: 'قائمة شفافة. أسعار مباشرة من النظام.',
    pricesSearch: 'ابحث عن خدمة...',
    pricesAll: 'الكل',
    pricesEmpty: 'لا توجد نتائج مطابقة.',
    pricesError: 'تعذر تحميل الأسعار حالياً.',
    pricesNormal: 'عادي',
    pricesExpress: 'مستعجل',
    branchesEyebrow: 'الفروع · الكول سنتر',
    branchesTitle: 'رقم موحد. أربعة فروع.',
    branchesNote: 'اتصل برقم سفاري الموحد وسيتم توجيهك للفرع الأنسب لمنطقتك.',
    branchesMap: 'فتح في الخرائط ←',
    orderEyebrow: 'طلب خدمة',
    orderTitle: 'نموذج سريع. بدون تعقيد.',
    orderNote:
      'اختر طريقة الخدمة والسرعة، أدخل بياناتك، وسيتواصل معك الفريق لتأكيد التفاصيل قبل تنفيذ الطلب.',
    fieldMethod: 'طريقة الخدمة',
    fieldSpeed: 'السرعة',
    fieldData: 'بياناتك',
    courier: 'مندوب',
    courierSub: 'نستلم من العنوان',
    branchMode: 'فرع',
    branchModeSub: 'تسليم في الفرع',
    normal: 'عادي',
    normalSub: 'الجدول المعتاد',
    express: 'مستعجل',
    expressSub: 'أولوية في التنفيذ',
    phone: 'رقم الهاتف',
    address: 'العنوان',
    branchPick: 'الفرع الأقرب (اختياري)',
    preferredTime: 'الوقت المفضل',
    send: 'إرسال الطلب',
    sending: 'جاري الإرسال...',
    sendOk: 'تم استلام طلبك. رقم الطلب: ',
    sendError: 'تعذر إرسال الطلب. تحقق من البيانات.',
    trackEyebrow: 'تتبع طلب',
    trackTitle: 'ابحث بحسابك برقم الهاتف.',
    trackPlaceholder: 'مثال: 50000000',
    trackBtn: 'عرض الحساب',
    trackSearching: 'جاري البحث...',
    trackOk: 'تم العثور على الحساب.',
    trackError: 'لم يتم العثور على عميل بهذا الرقم.',
    summaryCustomer: 'العميل',
    summaryDebt: 'الدين الحالي',
    summaryWallet: 'رصيد الاشتراك',
    trackInvoices: 'الفواتير الأخيرة',
    trackInvoiceRef: 'المرجع',
    trackInvoiceAmount: 'المتبقي',
    trackInvoiceStatus: 'الحالة',
    trackPayNow: 'ادفع الآن',
    trackPaying: 'جاري التحويل للدفع...',
    trackPayError: 'تعذر إنشاء رابط الدفع.',
    trackNoInvoices: 'لا توجد فواتير معلّقة حالياً.',
    trackDebtOnly:
      'يوجد رصيد مستحق على حسابك. يمكنك الدفع مباشرة أو الاتصال على 22200299.',
    trackPayBalance: 'ادفع الرصيد المستحق',
    trackPayAll: 'ادفع الكل',
    trackPayAllHint:
      'رابط دفع واحد يغطي إجمالي رصيدك ({{amount}} {{currency}}) — بدون الحاجة لدفع كل فاتورة على حدة.',
    trackPayPerInvoice: 'أو ادفع فاتورة محددة:',
    trackPaid: 'مدفوعة',
    trackPartial: 'مدفوعة جزئياً',
    trackUnpaid: 'غير مدفوعة',
    faqEyebrow: 'الأسئلة الشائعة',
    faqTitle: 'إجابات سريعة قبل ما تطلب.',
    hoursLabel: 'ساعات العمل',
    hoursValue: 'يومياً 8:00 ص – 11:00 م',
    followLabel: 'تابعنا',
    currency: 'د.ك',
  },
  en: {
    eyebrow1992: 'Established in 1992',
    heroTitle: 'Kuwaiti garment care, refined for thirty four years.',
    heroLead:
      'Safari Express Laundries Group. Decades of dry cleaning and steam press experience, delivered with a modern pickup & drop service across Kuwait.',
    orderNow: 'Order a Service',
    call: 'Call',
    stat1: 'Founded',
    stat2: 'Years of Service',
    stat3: 'Branches in Kuwait',
    storyEyebrow: 'Story',
    storyTitle: 'Not just a laundry. A daily care destination.',
    storyP1:
      'Safari was founded in 1992 with one principle: rigorous garment and fabric care, with no compromise on quality. Branches grew, tools evolved, the standard stayed the same.',
    storyP2:
      'Today we combine steam press technology, dry cleaning, and a fabric-friendly sanitation system, across four branches: Jahra, Rai, Sabah Al Salem, and Farwaniya, served by one unified number.',
    servicesEyebrow: 'Services',
    servicesTitle: 'Everything you need for daily garment care.',
    flowEyebrow: 'How It Works',
    flowTitle: 'Three simple steps from order to delivery.',
    pillarsEyebrow: 'Why Safari',
    pillarsTitle: 'Pillars behind every service.',
    pricesEyebrow: 'Prices',
    pricesTitle: 'Transparent list. Direct from our system.',
    pricesSearch: 'Search a service...',
    pricesAll: 'All',
    pricesEmpty: 'No results found.',
    pricesError: 'Failed to load prices right now.',
    pricesNormal: 'Standard',
    pricesExpress: 'Express',
    branchesEyebrow: 'Branches · Call Center',
    branchesTitle: 'One number. Four branches.',
    branchesNote: 'Call our unified number and we route you to the closest branch.',
    branchesMap: 'Open in Maps →',
    orderEyebrow: 'Order',
    orderTitle: 'A quick form. No fuss.',
    orderNote:
      'Pick a service mode and speed, enter your contact, and the team will confirm details before execution.',
    fieldMethod: 'Service mode',
    fieldSpeed: 'Speed',
    fieldData: 'Your details',
    courier: 'Courier',
    courierSub: 'We collect from your address',
    branchMode: 'In-branch',
    branchModeSub: 'Drop at the branch',
    normal: 'Standard',
    normalSub: 'Regular schedule',
    express: 'Express',
    expressSub: 'Higher priority',
    phone: 'Phone number',
    address: 'Address',
    branchPick: 'Nearest branch (optional)',
    preferredTime: 'Preferred time',
    send: 'Send Order',
    sending: 'Sending...',
    sendOk: 'Order received. Request ID: ',
    sendError: 'Could not send order. Please check the data.',
    trackEyebrow: 'Track',
    trackTitle: 'Look up your account by phone.',
    trackPlaceholder: 'e.g. 50000000',
    trackBtn: 'View Account',
    trackSearching: 'Searching...',
    trackOk: 'Account found.',
    trackError: 'No customer found for this phone.',
    summaryCustomer: 'Customer',
    summaryDebt: 'Current Balance',
    summaryWallet: 'Subscription Wallet',
    trackInvoices: 'Recent invoices',
    trackInvoiceRef: 'Reference',
    trackInvoiceAmount: 'Remaining',
    trackInvoiceStatus: 'Status',
    trackPayNow: 'Pay now',
    trackPaying: 'Redirecting to payment…',
    trackPayError: 'Could not create payment link.',
    trackNoInvoices: 'No outstanding invoices right now.',
    trackDebtOnly:
      'Your account has an outstanding balance. Pay online now or call 22200299.',
    trackPayBalance: 'Pay outstanding balance',
    trackPayAll: 'Pay all',
    trackPayAllHint:
      'One secure link for your full balance ({{amount}} {{currency}}) — no need to pay each invoice separately.',
    trackPayPerInvoice: 'Or pay a specific invoice:',
    trackPaid: 'Paid',
    trackPartial: 'Partially paid',
    trackUnpaid: 'Unpaid',
    faqEyebrow: 'FAQ',
    faqTitle: 'Quick answers before you order.',
    hoursLabel: 'Working Hours',
    hoursValue: 'Daily 8:00 AM – 11:00 PM',
    followLabel: 'Follow',
    currency: 'KWD',
  },
} as const;

const SECTION_PADDING = 'px-6 py-16 md:px-12 md:py-20';

function whatsappLink() {
  return `https://wa.me/965${companyBrand.phone}?text=${encodeURIComponent('مرحباً مجموعة مصابغ سفاري، أود طلب خدمة.')}`;
}

function mapsLink(query: string) {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
}

function App() {
  const [lang, setLang] = useState<Lang>('ar');
  const t = T[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  return (
    <div className="min-h-screen bg-white text-black">
      <SiteHeader lang={lang} setLang={setLang} t={t} />
      <HeroBlock t={t} />
      <StorySection t={t} />
      <ServicesSection t={t} lang={lang} />
      <FlowSection t={t} />
      <PillarsSection t={t} />
      <PricesSection t={t} />
      <BranchesSection t={t} />
      <OrderSection t={t} />
      <TrackSection t={t} />
      <FAQSection t={t} />
      <FinalCTA t={t} />
      <SiteFooter t={t} />
      <FloatingWhatsApp />
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-[#5FE7F3]/20 px-3 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-[#003B95]">
      {children}
    </span>
  );
}

function Divider() {
  return <hr className="my-8 border-0 border-t border-neutral-100" />;
}

type SentenceTone = 'lavender' | 'blue' | 'white';

const SENTENCE_TONE: Record<SentenceTone, string> = {
  lavender: 'border-[#DDD6FE]/80 bg-[#EDE9FE]/35 text-gray-700',
  blue: 'border-white/20 bg-white/10 text-white/90',
  white: 'border-[#EDE9FE]/70 bg-white/55 text-gray-700',
};

function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/(?<=[.!?؟])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}

function SentenceBlock({
  children,
  tone = 'lavender',
}: {
  children: ReactNode;
  tone?: SentenceTone;
}) {
  return (
    <p
      className={`rounded-xl border px-4 py-3 text-sm font-bold leading-relaxed ${SENTENCE_TONE[tone]}`}
    >
      {children}
    </p>
  );
}

function Sentences({
  text,
  tone = 'lavender',
}: {
  text: string;
  tone?: SentenceTone;
}) {
  return (
    <div className="space-y-3">
      {splitSentences(text).map((sentence, index) => (
        <SentenceBlock key={`${index}-${sentence.slice(0, 24)}`} tone={tone}>
          {sentence}
        </SentenceBlock>
      ))}
    </div>
  );
}

type TitleLevel = 'h1' | 'h2' | 'h3';
type TitleTone = 'hero' | 'section' | 'card' | 'invert';

const TITLE_TONE: Record<TitleTone, string> = {
  hero: 'title-hero font-display',
  section: 'title-section font-display',
  card: 'title-card',
  invert: 'title-invert',
};

const TITLE_SIZE: Record<TitleLevel, string> = {
  h1: 'text-4xl leading-[1.04] sm:text-5xl md:text-6xl lg:text-7xl',
  h2: 'text-3xl leading-tight md:text-5xl',
  h3: 'text-xl leading-tight md:text-2xl',
};

function TitleBlock({
  as: Tag = 'h2',
  tone = 'section',
  className = '',
  children,
}: {
  as?: TitleLevel;
  tone?: TitleTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={[
        'block w-fit max-w-full rounded-2xl px-5 py-4 font-black tracking-tight',
        TITLE_TONE[tone],
        TITLE_SIZE[Tag],
        className,
      ].join(' ')}
    >
      {children}
    </Tag>
  );
}

function SiteHeader({
  lang,
  setLang,
  t: _t,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (typeof T)[Lang];
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-5 md:px-12">
        <a href="#" className="flex items-center">
          <img
            src={companyBrand.logoPath}
            alt={`شعار ${companyBrand.nameAr}`}
            className="h-10 w-24 object-contain"
          />
        </a>
        <nav className="hidden items-center gap-8 text-sm font-bold text-gray-600 lg:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-[#003B95]">
              {lang === 'ar' ? link.ar : link.en}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <a
            href={`tel:${companyBrand.phone}`}
            className="hidden text-sm font-black tracking-tight text-black transition-colors hover:text-[#003B95] sm:inline"
          >
            {companyBrand.phone}
          </a>
          <button
            type="button"
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            className="rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-gray-600 transition-colors hover:border-[#5FE7F3] hover:bg-[#5FE7F3]/20 hover:text-black"
          >
            {lang === 'ar' ? 'EN' : 'AR'}
          </button>
        </div>
      </div>
    </header>
  );
}

function HeroBlock({ t }: { t: (typeof T)[Lang] }) {
  return (
    <section className="blue-wash editorial-grid border-b border-neutral-100">
      <div className="mx-auto max-w-7xl px-6 py-10 md:px-12 md:py-16">
        <div className="grid min-h-[520px] grid-cols-1 overflow-hidden rounded-[1.5rem] border border-neutral-100 bg-white lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="flex flex-col justify-center p-6 md:p-10 lg:p-14">
            <Eyebrow>{t.eyebrow1992}</Eyebrow>
            <Divider />
            <TitleBlock as="h1" tone="hero" className="max-w-3xl">
              {t.heroTitle}
            </TitleBlock>
            <div className="mt-7 max-w-2xl">
              <Sentences text={t.heroLead} />
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-6 text-sm font-bold">
              <a
                href="#order"
                className="rounded-xl bg-[#003B95] px-6 py-4 font-black tracking-wide text-white transition-all hover:bg-[#002E73]"
              >
                {t.orderNow}
              </a>
              <a
                href={`tel:${companyBrand.phone}`}
                className="text-gray-600 underline-offset-4 transition-colors hover:text-[#003B95] hover:underline"
              >
                {t.call} {companyBrand.phone} ←
              </a>
            </div>
          </div>

          <aside className="safari-panel relative flex min-h-[420px] flex-col justify-between gap-8 p-6 text-white md:p-9 lg:p-10">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#5FE7F3]">
                Safari Since
              </p>
              <p className="mt-4 text-[4.75rem] font-black leading-none tracking-tighter md:text-[6.5rem]">
                1992
              </p>
              <div className="mt-4 max-w-xs">
                <SentenceBlock tone="blue">
                  تجربة عناية يومية واضحة وسريعة، بهوية سفاري الكويتية.
                </SentenceBlock>
              </div>
            </div>
            <HeroGarmentScene />
            <div className="grid grid-cols-1 gap-3">
              <StatCard value="34" label={t.stat2} />
              <StatCard value="4" label={t.stat3} />
              <StatCard value={companyBrand.phone} label={t.call} />
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function HeroGarmentScene() {
  return (
    <div className="relative mx-auto h-44 w-full max-w-sm" aria-hidden="true">
      <div className="absolute left-4 top-4 h-28 w-24 rotate-[-7deg] rounded-2xl border border-white/25 bg-white/15 backdrop-blur" />
      <div className="absolute left-20 top-0 h-36 w-28 rotate-[5deg] rounded-2xl border border-white/30 bg-white/20 backdrop-blur">
        <div className="mx-auto mt-5 h-8 w-12 rounded-b-full border-b-2 border-white/50" />
        <div className="mx-auto mt-5 h-16 w-16 rounded-xl bg-white/15" />
      </div>
      <div className="absolute right-6 top-10 h-24 w-32 rounded-2xl border border-[#5FE7F3]/60 bg-[#5FE7F3]/20">
        <div className="mx-auto mt-5 h-3 w-20 rounded-full bg-white/45" />
        <div className="mx-auto mt-4 h-3 w-14 rounded-full bg-white/30" />
      </div>
      <div className="absolute bottom-0 right-20 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-black text-white/80">
        Pickup Ready
      </div>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
      <span className="block text-3xl font-black tracking-tight text-white md:text-4xl">
        {value}
      </span>
      <span className="mt-2 block text-sm font-bold text-white/75">{label}</span>
    </div>
  );
}

function StorySection({ t }: { t: (typeof T)[Lang] }) {
  return (
    <section id="story" className="border-b border-neutral-100 bg-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-3">
        <div className={`border-neutral-100 lg:col-span-1 lg:border-l ${SECTION_PADDING}`}>
          <Eyebrow>{t.storyEyebrow}</Eyebrow>
          <Divider />
          <TitleBlock as="h2" tone="section">
            {t.storyTitle}
          </TitleBlock>
        </div>
        <div className={`space-y-4 text-sm md:text-base lg:col-span-2 ${SECTION_PADDING}`}>
          <Sentences text={t.storyP1} />
          <Sentences text={t.storyP2} />
        </div>
      </div>
    </section>
  );
}

function ServicesSection({ t, lang }: { t: (typeof T)[Lang]; lang: Lang }) {
  return (
    <section id="services" className="lavender-wash border-b border-neutral-100">
      <div className={`mx-auto max-w-7xl ${SECTION_PADDING}`}>
        <Eyebrow>{t.servicesEyebrow}</Eyebrow>
        <Divider />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <TitleBlock as="h2" tone="section" className="max-w-3xl">
            {t.servicesTitle}
          </TitleBlock>
          <div className="max-w-xl">
            <Sentences text="خدمات مصممة لروتين يومي سريع، وقطع خاصة تحتاج عناية أدق. عرض واضح ومباشر بهوية سفاري." />
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <ServiceFeatureCard
            title="Daily Care"
            subtitle="العناية اليومية"
            services={SERVICES.slice(0, 2)}
            lang={lang}
            tone="light"
          />
          <ServiceFeatureCard
            title="Specialized Care"
            subtitle="العناية المتخصصة"
            services={SERVICES.slice(2)}
            lang={lang}
            tone="blue"
          />
        </div>
      </div>
    </section>
  );
}

function ServiceFeatureCard({
  title,
  subtitle,
  services,
  lang,
  tone,
}: {
  title: string;
  subtitle: string;
  services: typeof SERVICES;
  lang: Lang;
  tone: 'light' | 'blue';
}) {
  const isBlue = tone === 'blue';
  return (
    <article
      className={[
        'min-h-[360px] rounded-[1.5rem] border p-6 transition-all md:p-8',
        isBlue
          ? 'safari-panel border-transparent text-white'
          : 'soft-panel border-[#C4B5FD] text-black',
      ].join(' ')}
    >
      <p
        className={[
          'text-xs font-black uppercase tracking-[0.28em]',
          isBlue ? 'text-[#5FE7F3]' : 'text-[#003B95]',
        ].join(' ')}
      >
        {subtitle}
      </p>
      <TitleBlock
        as="h3"
        tone={isBlue ? 'invert' : 'card'}
        className="mt-4 text-4xl leading-none md:text-6xl"
      >
        {title}
      </TitleBlock>
      <div className="mt-8 space-y-4">
        {services.map((service, index) => (
          <div
            key={service.key}
            className={[
              'rounded-2xl border p-4',
              isBlue ? 'border-white/20 bg-white/10' : 'lavender-card border-[#C4B5FD]',
            ].join(' ')}
          >
            <span
              className={[
                'text-xs font-black tracking-[0.18em]',
                isBlue ? 'text-white/70' : 'text-[#003B95]',
              ].join(' ')}
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <TitleBlock as="h3" tone={isBlue ? 'invert' : 'card'} className="mt-2 text-xl md:text-2xl">
              {lang === 'ar' ? service.ar : service.en}
            </TitleBlock>
            <div className="mt-2">
              <SentenceBlock tone={isBlue ? 'blue' : 'lavender'}>{service.desc}</SentenceBlock>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function FlowSection({ t }: { t: (typeof T)[Lang] }) {
  return (
    <section id="flow" className="border-b border-neutral-100 bg-[#F3EEFF]">
      <div className={`mx-auto max-w-7xl ${SECTION_PADDING}`}>
        <Eyebrow>{t.flowEyebrow}</Eyebrow>
        <Divider />
        <TitleBlock as="h2" tone="section" className="max-w-3xl">
          {t.flowTitle}
        </TitleBlock>
        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
          {FLOW_STEPS.map((step) => (
            <article
              key={step.no}
              className="lavender-card rounded-xl border p-6 transition-all hover:border-[#A78BFA] hover:bg-[#EDE9FE]"
            >
              <span className="text-5xl font-black tracking-tight text-[#003B95]">
                {step.no}
              </span>
              <TitleBlock as="h3" tone="card" className="mt-6 text-2xl">
                {step.title}
              </TitleBlock>
              <div className="mt-3">
                <SentenceBlock>{step.desc}</SentenceBlock>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PillarsSection({ t }: { t: (typeof T)[Lang] }) {
  return (
    <section className="editorial-grid border-b border-neutral-100 bg-[#F3EEFF]">
      <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-3">
        <div className={`border-neutral-100 lg:col-span-1 lg:border-l ${SECTION_PADDING}`}>
          <Eyebrow>{t.pillarsEyebrow}</Eyebrow>
          <Divider />
          <TitleBlock as="h2" tone="section">
            {t.pillarsTitle}
          </TitleBlock>
        </div>
        <div className={`grid grid-cols-1 gap-8 sm:grid-cols-2 lg:col-span-2 ${SECTION_PADDING}`}>
          {PILLARS.map((p) => (
            <article
              key={p.title}
              className="lavender-card-alt rounded-xl border p-6 transition-all hover:border-[#A78BFA]"
            >
              <TitleBlock as="h3" tone="card">
                {p.title}
              </TitleBlock>
              <div className="mt-3">
                <SentenceBlock>{p.desc}</SentenceBlock>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricesSection({ t }: { t: (typeof T)[Lang] }) {
  const [services, setServices] = useState<PublicServiceItem[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getCatalog()
      .then((catalog) => {
        setServices(catalog.services);
        setFailed(false);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(services.map((s) => s.category ?? 'خدمات'))).sort(),
    [services],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services.filter((s) => {
      const matchesQuery =
        q.length === 0 ||
        s.nameAr.toLowerCase().includes(q) ||
        (s.nameEn?.toLowerCase().includes(q) ?? false) ||
        s.code.toLowerCase().includes(q);
      const matchesCategory = category.length === 0 || (s.category ?? 'خدمات') === category;
      return matchesQuery && matchesCategory;
    });
  }, [category, query, services]);

  return (
    <section id="prices" className="soft-panel border-b border-neutral-100">
      <div className={`mx-auto max-w-7xl ${SECTION_PADDING}`}>
        <Eyebrow>{t.pricesEyebrow}</Eyebrow>
        <Divider />
        <TitleBlock as="h2" tone="section" className="max-w-3xl">
          {t.pricesTitle}
        </TitleBlock>

        <div className="lavender-card mt-10 rounded-[2rem] border border-[#C4B5FD] p-5 md:p-6">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.pricesSearch}
            className="w-full rounded-xl border border-neutral-200 bg-white p-4 text-base font-bold text-black outline-none transition-colors placeholder:font-medium placeholder:text-gray-600 focus:border-black focus:ring-0"
          />
          <div className="scrollbar-none mt-4 flex gap-2 overflow-x-auto pb-1">
            <CategoryChip active={category === ''} onClick={() => setCategory('')}>
              {t.pricesAll}
            </CategoryChip>
            {categories.slice(0, 8).map((cat) => (
              <CategoryChip
                key={cat}
                active={category === cat}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </CategoryChip>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 text-xs font-black uppercase tracking-[0.18em] text-gray-600">
          <span>{loading ? 'جاري تحميل الأسعار' : `${filtered.length} خدمة ظاهرة`}</span>
          <span className="hidden text-[#003B95] sm:inline">Live ERP Catalog</span>
        </div>

        {loading ? (
          <div className="lavender-card mt-8 overflow-hidden rounded-[2rem] border border-[#C4B5FD]">
            {Array.from({ length: 5 }, (_, index) => (
              <div
                key={index}
                className="grid grid-cols-1 gap-5 border-b border-neutral-100 p-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] md:p-6"
              >
                <div>
                  <div className="h-6 w-24 rounded-full bg-neutral-100" />
                  <div className="mt-4 h-6 w-52 rounded-full bg-neutral-100" />
                  <div className="mt-3 h-4 w-36 rounded-full bg-neutral-100" />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:min-w-72">
                  <div className="h-16 rounded-xl bg-neutral-100" />
                  <div className="h-16 rounded-xl bg-neutral-100" />
                </div>
              </div>
            ))}
          </div>
        ) : failed ? (
          <div className="lavender-card mt-8 rounded-[2rem] border border-[#C4B5FD] p-8">
            <SentenceBlock>{t.pricesError}</SentenceBlock>
          </div>
        ) : filtered.length === 0 ? (
          <div className="lavender-card mt-8 rounded-[2rem] border border-[#C4B5FD] p-8">
            <SentenceBlock>{t.pricesEmpty}</SentenceBlock>
          </div>
        ) : (
          <div className="lavender-card mt-8 overflow-hidden rounded-[2rem] border border-[#C4B5FD]">
            {filtered.map((service) => (
              <PriceRow key={service.id} service={service} t={t} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'shrink-0 rounded-xl border px-4 py-2 text-sm font-black transition-all',
        active
          ? 'border-[#003B95] bg-[#003B95] text-white'
          : 'border-[#DDD6FE] bg-[#F3EEFF] text-gray-600 hover:border-[#A78BFA] hover:bg-[#EDE9FE] hover:text-black',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function PriceRow({
  service,
  t,
}: {
  service: PublicServiceItem;
  t: (typeof T)[Lang];
}) {
  return (
    <article className="grid grid-cols-1 gap-5 border-b border-[#DDD6FE] p-5 transition-all last:border-b-0 hover:bg-[#EDE9FE]/80 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:p-6">
      <div>
        <span className="inline-flex rounded-full bg-[#5FE7F3]/20 px-3 py-1 text-[11px] font-black tracking-[0.18em] text-[#003B95]">
          {service.category ?? 'خدمات'}
        </span>
        <TitleBlock as="h3" tone="card" className="mt-3 text-xl">
          {service.nameAr}
        </TitleBlock>
        {service.nameEn ? (
          <div className="mt-1">
            <SentenceBlock tone="white">{service.nameEn}</SentenceBlock>
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:min-w-72">
        <PriceLine label={t.pricesNormal} value={service.priceNormalKd} currency={t.currency} />
        <PriceLine label={t.pricesExpress} value={service.priceExpressKd} currency={t.currency} />
      </div>
    </article>
  );
}

function PriceLine({
  label,
  value,
  currency,
}: {
  label: string;
  value: string;
  currency: string;
}) {
  return (
    <div className="rounded-xl border border-[#DDD6FE] bg-[#F3EEFF] p-3">
      <span className="block text-xs font-bold text-gray-600">{label}</span>
      <span className="mt-1 flex items-baseline gap-1.5 font-black text-black">
        {Number(value).toFixed(3)}
        <span className="text-xs font-bold text-gray-600">{currency}</span>
      </span>
    </div>
  );
}

function BranchesSection({ t }: { t: (typeof T)[Lang] }) {
  return (
    <section id="branches" className="border-b border-neutral-100 bg-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-3">
        <div className={`border-neutral-100 lg:col-span-1 lg:border-l ${SECTION_PADDING}`}>
          <Eyebrow>{t.branchesEyebrow}</Eyebrow>
          <Divider />
          <TitleBlock as="h2" tone="section">
            {t.branchesTitle}
          </TitleBlock>
          <div className="mt-6 max-w-md">
            <Sentences text={t.branchesNote} />
          </div>
          <a
            href={`tel:${companyBrand.phone}`}
            className="mt-10 block text-5xl font-black tracking-tight text-[#003B95] md:text-6xl"
          >
            {companyBrand.phone}
          </a>
          <div className="mt-4">
            <SentenceBlock>{t.hoursValue}</SentenceBlock>
          </div>
        </div>

        <div className={`grid grid-cols-1 gap-8 sm:grid-cols-2 lg:col-span-2 ${SECTION_PADDING}`}>
          {BRANCHES.map((branch, index) => (
            <BranchCell key={branch.name} branch={branch} index={index} t={t} />
          ))}
        </div>
      </div>
    </section>
  );
}

function BranchCell({
  branch,
  index,
  t,
}: {
  branch: { name: string; area: string; mapsQuery: string };
  index: number;
  t: (typeof T)[Lang];
}) {
  return (
    <div className="lavender-card rounded-xl border p-6 transition-all hover:border-[#A78BFA] hover:bg-[#EDE9FE]">
      <Eyebrow>فرع {String(index + 1).padStart(2, '0')}</Eyebrow>
      <TitleBlock as="h3" tone="card" className="mt-4 text-2xl md:text-3xl">
        {branch.name}
      </TitleBlock>
      <div className="mt-3">
        <SentenceBlock>{branch.area}</SentenceBlock>
      </div>
      <a
        href={mapsLink(branch.mapsQuery)}
        target="_blank"
        rel="noreferrer"
        className="mt-6 inline-block text-sm font-black text-[#003B95] underline-offset-4 transition-colors hover:text-black hover:underline"
      >
        {t.branchesMap}
      </a>
    </div>
  );
}

type ServiceMode = 'مندوب' | 'فرع';
type SpeedMode = 'NORMAL' | 'EXPRESS';

function OrderSection({ t }: { t: (typeof T)[Lang] }) {
  const [serviceMode, setServiceMode] = useState<ServiceMode>('مندوب');
  const [speedMode, setSpeedMode] = useState<SpeedMode>('NORMAL');
  const [status, setStatus] = useState<{ tone: 'idle' | 'ok' | 'error'; text: string }>({
    tone: 'idle',
    text: '',
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const phone = String(form.get('customerPhone') ?? '').trim();
    const address = String(form.get('customerAddress') ?? '').trim();
    const branch = String(form.get('branch') ?? '').trim();
    const preferredTime = String(form.get('preferredTime') ?? '').trim();

    setStatus({ tone: 'idle', text: t.sending });
    void createOrderRequest({
      customerPhone: phone,
      customerAddress: address,
      serviceType: speedMode,
      notes: [
        `طريقة الخدمة: ${serviceMode}`,
        speedMode === 'EXPRESS' ? 'السرعة: مستعجل' : 'السرعة: عادي',
        branch ? `الفرع الأقرب: ${branch}` : '',
        preferredTime ? `الوقت المفضل: ${preferredTime}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    })
      .then((res) =>
        setStatus({
          tone: 'ok',
          text: `${t.sendOk}${res.requestReference ?? res.requestId}`,
        }),
      )
      .catch(() => setStatus({ tone: 'error', text: t.sendError }));
  }

  return (
    <section id="order" className="blue-wash editorial-grid border-b border-neutral-100">
      <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-3">
        <div className={`border-neutral-100 bg-white/70 lg:col-span-1 lg:border-l ${SECTION_PADDING}`}>
          <Eyebrow>{t.orderEyebrow}</Eyebrow>
          <Divider />
          <TitleBlock as="h2" tone="section">
            {t.orderTitle}
          </TitleBlock>
          <div className="mt-6 max-w-md">
            <Sentences text={t.orderNote} />
          </div>
        </div>

        <form onSubmit={submit} className={`bg-white/85 lg:col-span-2 ${SECTION_PADDING}`}>
          <div className="lavender-card rounded-[2rem] border border-[#C4B5FD] p-5 md:p-8">
            <div className="space-y-8">
              <FieldGroup label={t.fieldMethod}>
                <ChoiceRow>
                  <Choice
                    active={serviceMode === 'مندوب'}
                    onClick={() => setServiceMode('مندوب')}
                    title={t.courier}
                    subtitle={t.courierSub}
                  />
                  <Choice
                    active={serviceMode === 'فرع'}
                    onClick={() => setServiceMode('فرع')}
                    title={t.branchMode}
                    subtitle={t.branchModeSub}
                  />
                </ChoiceRow>
              </FieldGroup>

              <FieldGroup label={t.fieldSpeed}>
                <ChoiceRow>
                  <Choice
                    active={speedMode === 'NORMAL'}
                    onClick={() => setSpeedMode('NORMAL')}
                    title={t.normal}
                    subtitle={t.normalSub}
                  />
                  <Choice
                    active={speedMode === 'EXPRESS'}
                    onClick={() => setSpeedMode('EXPRESS')}
                    title={t.express}
                    subtitle={t.expressSub}
                  />
                </ChoiceRow>
              </FieldGroup>

              <FieldGroup label={t.fieldData}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FlatInput name="customerPhone" placeholder={t.phone} required />
                  <FlatInput name="customerAddress" placeholder={t.address} />
                  <FlatSelect name="branch" defaultValue="">
                    <option value="">{t.branchPick}</option>
                    {companyBrand.branches.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </FlatSelect>
                  <FlatInput
                    name="preferredTime"
                    type="datetime-local"
                    aria-label={t.preferredTime}
                  />
                </div>
              </FieldGroup>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-6 border-t border-neutral-100 pt-6">
              <button
                type="submit"
                className="w-full rounded-xl bg-[#003B95] px-8 py-4 text-sm font-black tracking-wide text-white transition-all hover:bg-[#002E73] sm:w-auto"
              >
                {t.send}
              </button>
              <StatusLine status={status} />
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}

function TrackSection({ t }: { t: (typeof T)[Lang] }) {
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<{ tone: 'idle' | 'ok' | 'error'; text: string }>({
    tone: 'idle',
    text: '',
  });
  const [summary, setSummary] = useState<{
    name: string;
    debtKd: string;
    walletKd: string;
  } | null>(null);
  const [orders, setOrders] = useState<CustomerPortalOrder[]>([]);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ tone: 'idle', text: t.trackSearching });
    setSummary(null);
    setOrders([]);
    void getCustomerPortal(phone)
      .then((portal) => {
        setStatus({ tone: 'ok', text: t.trackOk });
        setSummary({
          name: portal.customer.displayName ?? portal.customer.phone,
          debtKd: Number(portal.financials.walletDebtKd).toFixed(3),
          walletKd: Number(portal.financials.walletBalanceKd).toFixed(3),
        });
        setOrders(portal.recentOrders);
      })
      .catch(() => setStatus({ tone: 'error', text: t.trackError }));
  }

  function payOrder(order: CustomerPortalOrder) {
    if (payingOrderId) return;
    setPayingOrderId(order.id);
    setStatus({ tone: 'idle', text: t.trackPaying });
    void createCustomerPaymentLink({ customerPhone: phone, orderId: order.id })
      .then((intent) => {
        if (intent.paymentUrl) {
          window.location.href = intent.paymentUrl;
          return;
        }
        setStatus({ tone: 'error', text: intent.message || t.trackPayError });
        setPayingOrderId(null);
      })
      .catch((error: unknown) => {
        setStatus({
          tone: 'error',
          text: error instanceof Error ? error.message : t.trackPayError,
        });
        setPayingOrderId(null);
      });
  }

  function payBalance() {
    if (payingOrderId) return;
    setPayingOrderId('balance');
    setStatus({ tone: 'idle', text: t.trackPaying });
    void createCustomerBalancePaymentLink(phone)
      .then((intent) => {
        if (intent.paymentUrl) {
          window.location.href = intent.paymentUrl;
          return;
        }
        setStatus({ tone: 'error', text: intent.message || t.trackPayError });
        setPayingOrderId(null);
      })
      .catch((error: unknown) => {
        setStatus({
          tone: 'error',
          text: error instanceof Error ? error.message : t.trackPayError,
        });
        setPayingOrderId(null);
      });
  }

  const payableOrders = orders.filter(
    (order) => Number(order.remainingAmountKd) > 0.001,
  );

  return (
    <section id="track" className="border-b border-neutral-100 bg-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-3">
        <div className={`border-neutral-100 lg:col-span-1 lg:border-l ${SECTION_PADDING}`}>
          <Eyebrow>{t.trackEyebrow}</Eyebrow>
          <Divider />
          <TitleBlock as="h2" tone="section">
            {t.trackTitle}
          </TitleBlock>
        </div>
        <form onSubmit={submit} className={`space-y-8 lg:col-span-2 ${SECTION_PADDING}`}>
          <FieldGroup label={t.phone}>
            <FlatInput
              name="phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={t.trackPlaceholder}
              required
            />
          </FieldGroup>

          <div className="flex flex-wrap items-center gap-6">
            <button
              type="submit"
              className="rounded-xl bg-[#003B95] px-8 py-4 text-sm font-black tracking-wide text-white transition-all hover:bg-[#002E73]"
            >
              {t.trackBtn}
            </button>
            <StatusLine status={status} />
          </div>

          {summary ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <SummaryCell label={t.summaryCustomer} value={summary.name} />
                <SummaryCell label={t.summaryDebt} value={summary.debtKd} unit={t.currency} />
                <SummaryCell label={t.summaryWallet} value={summary.walletKd} unit={t.currency} />
              </div>

              <div className="rounded-2xl border border-neutral-100 bg-neutral-50/80 p-5">
                <p className="mb-4 text-sm font-black text-[#003B95]">{t.trackInvoices}</p>

                {Number(summary.debtKd) > 0.001 ? (
                  <div className="mb-5 space-y-3 rounded-xl border-2 border-[#003B95]/25 bg-white p-4">
                    <p className="text-sm leading-relaxed text-gray-600">
                      {t.trackPayAllHint
                        .replace('{{amount}}', summary.debtKd)
                        .replace('{{currency}}', t.currency)}
                    </p>
                    <button
                      type="button"
                      onClick={payBalance}
                      disabled={payingOrderId != null}
                      className="w-full rounded-xl bg-[#003B95] px-6 py-3.5 text-sm font-black text-white transition hover:bg-[#002E73] disabled:opacity-60 sm:w-auto"
                    >
                      {payingOrderId === 'balance'
                        ? t.trackPaying
                        : `${t.trackPayAll} (${summary.debtKd} ${t.currency})`}
                    </button>
                  </div>
                ) : null}

                {payableOrders.length === 0 ? (
                  <p className="text-sm text-gray-600">
                    {Number(summary.debtKd) > 0.001
                      ? t.trackDebtOnly
                      : t.trackNoInvoices}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {payableOrders.length > 0 && Number(summary.debtKd) > 0.001 ? (
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                        {t.trackPayPerInvoice}
                      </p>
                    ) : null}
                    {payableOrders.map((order) => (
                      <div
                        key={order.id}
                        className="flex flex-col gap-3 rounded-xl border border-neutral-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1 text-sm">
                          <p className="font-bold text-neutral-900">
                            {order.invoiceNumber ?? order.serialNumber ?? order.id.slice(0, 8)}
                          </p>
                          <p className="text-gray-600">
                            {t.trackInvoiceAmount}:{' '}
                            <span className="font-semibold text-[#003B95]">
                              {Number(order.remainingAmountKd).toFixed(3)} {t.currency}
                            </span>
                          </p>
                          <p className="text-xs text-gray-500">
                            {t.trackInvoiceStatus}:{' '}
                            {order.paymentStatus === 'PAID'
                              ? t.trackPaid
                              : order.paymentStatus === 'PARTIALLY_PAID'
                                ? t.trackPartial
                                : t.trackUnpaid}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => payOrder(order)}
                          disabled={payingOrderId === order.id}
                          className="rounded-xl bg-[#003B95] px-6 py-3 text-sm font-black text-white transition hover:bg-[#002E73] disabled:opacity-60"
                        >
                          {payingOrderId === order.id ? t.trackPaying : t.trackPayNow}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
}

function StatusLine({
  status,
}: {
  status: { tone: 'idle' | 'ok' | 'error'; text: string };
}) {
  if (!status.text) return null;
  return (
    <SentenceBlock tone="white">
      <span
        className={
          status.tone === 'error'
            ? 'text-red-600'
            : status.tone === 'ok'
              ? 'text-[#003B95]'
              : 'text-gray-600'
        }
      >
        {status.text}
      </span>
    </SentenceBlock>
  );
}

function SummaryCell({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="lavender-card-alt rounded-xl border border-[#C4B5FD] p-5">
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-2 flex items-baseline gap-1.5 text-xl font-black tracking-tight text-black">
        {value}
        {unit ? (
          <span className="text-xs font-bold text-gray-600">{unit}</span>
        ) : null}
      </p>
    </div>
  );
}

function FAQSection({ t }: { t: (typeof T)[Lang] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="editorial-grid border-b border-neutral-100 bg-[#FBFBFB]">
      <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-3">
        <div className={`border-neutral-100 lg:col-span-1 lg:border-l ${SECTION_PADDING}`}>
          <Eyebrow>{t.faqEyebrow}</Eyebrow>
          <Divider />
          <TitleBlock as="h2" tone="section">
            {t.faqTitle}
          </TitleBlock>
        </div>
        <div className={`divide-y divide-neutral-100 lg:col-span-2 ${SECTION_PADDING}`}>
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = open === index;
            return (
              <button
                key={item.q}
                type="button"
                onClick={() => setOpen(isOpen ? null : index)}
                className="block w-full py-6 text-right transition-colors hover:text-[#003B95]"
              >
                <div className="flex items-start justify-between gap-6">
                  <TitleBlock as="h3" tone="card" className="text-lg md:text-xl">
                    {item.q}
                  </TitleBlock>
                  <span className="text-2xl font-black text-[#003B95]">
                    {isOpen ? '−' : '+'}
                  </span>
                </div>
                {isOpen ? (
                  <div className="mt-3 text-right">
                    <Sentences text={item.a} />
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCTA({ t }: { t: (typeof T)[Lang] }) {
  return (
    <section className="safari-panel">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-6 py-14 text-white md:px-12 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#5FE7F3]">
            Safari Express
          </p>
          <TitleBlock as="h2" tone="invert" className="mt-4 text-4xl md:text-6xl">
            جاهز نعتني بقطعك اليوم؟
          </TitleBlock>
          <div className="mt-4 max-w-2xl">
            <Sentences
              tone="blue"
              text="اختر طلب خدمة سريع أو تواصل مباشرة مع الكول سنتر، وسيتولى فريق سفاري تأكيد التفاصيل."
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href="#order"
            className="rounded-xl bg-white px-6 py-4 text-sm font-black text-[#003B95] transition-all hover:bg-[#5FE7F3]"
          >
            {t.orderNow}
          </a>
          <a
            href={`tel:${companyBrand.phone}`}
            className="rounded-xl border border-white/25 px-6 py-4 text-sm font-black text-white transition-all hover:border-[#5FE7F3] hover:bg-white/10"
          >
            {companyBrand.phone}
          </a>
        </div>
      </div>
    </section>
  );
}

function SiteFooter({ t }: { t: (typeof T)[Lang] }) {
  return (
    <footer className="bg-[#F3EEFF]">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-16 md:grid-cols-3 md:px-12">
        <div>
          <img
            src={companyBrand.logoPath}
            alt={`شعار ${companyBrand.nameAr}`}
            className="h-10 w-24 object-contain"
          />
          <div className="mt-5">
            <SentenceBlock>{companyBrand.nameAr}</SentenceBlock>
          </div>
          <div className="mt-2">
            <SentenceBlock>{companyBrand.branches.join(' · ')}</SentenceBlock>
          </div>
        </div>
        <div>
          <Eyebrow>{t.hoursLabel}</Eyebrow>
          <div className="mt-3">
            <SentenceBlock>{t.hoursValue}</SentenceBlock>
          </div>
          <a
            href={`tel:${companyBrand.phone}`}
            className="mt-4 block text-3xl font-black tracking-tight text-[#003B95] transition-colors hover:text-black"
          >
            {companyBrand.phone}
          </a>
        </div>
        <div>
          <Eyebrow>{t.followLabel}</Eyebrow>
          <ul className="mt-3 space-y-2 text-sm font-bold text-gray-600">
            <li>
              <a
                href="https://www.instagram.com/"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-[#003B95]"
              >
                Instagram
              </a>
            </li>
            <li>
              <a
                href="https://x.com/"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-[#003B95]"
              >
                X (Twitter)
              </a>
            </li>
            <li>
              <a
                href="https://www.snapchat.com/"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-[#003B95]"
              >
                Snapchat
              </a>
            </li>
            <li>
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-[#003B95]"
              >
                WhatsApp
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-neutral-100">
        <div className="mx-auto max-w-7xl px-6 py-8 md:px-12">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#003B95]">
            الشروط والأحكام
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 text-xs leading-relaxed text-gray-600 md:grid-cols-2">
            {RECEIPT_TERMS.map((term) => (
              <SentenceBlock key={term}>{term}</SentenceBlock>
            ))}
          </div>
          <SentenceBlock>
            للاستفسار أو الدعم يرجى التواصل مع الكول سنتر على{' '}
            <a
              href={`tel:${companyBrand.phone}`}
              className="font-black text-[#003B95] underline-offset-4 hover:underline"
            >
              {companyBrand.phone}
            </a>
          </SentenceBlock>
        </div>
      </div>
      <div className="border-t border-neutral-100">
        <p className="mx-auto max-w-7xl px-6 py-5 text-xs font-bold text-gray-600 md:px-12">
          © {new Date().getFullYear()} {companyBrand.nameAr}
        </p>
      </div>
    </footer>
  );
}

function FloatingWhatsApp() {
  return (
    <a
      href={whatsappLink()}
      target="_blank"
      rel="noreferrer"
      aria-label="WhatsApp"
      className="fixed bottom-6 left-6 z-50 inline-flex items-center gap-2 rounded-xl bg-[#003B95] px-5 py-3 text-sm font-black tracking-wide text-white transition-all hover:bg-[#002E73]"
    >
      WhatsApp
    </a>
  );
}

function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ChoiceRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

function Choice({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex flex-col items-start gap-1 rounded-xl border p-5 text-right transition-all',
        active
          ? 'border-[#003B95] bg-[#003B95]/5 text-black'
          : 'border-neutral-200 bg-white text-black hover:border-[#5FE7F3] hover:bg-[#5FE7F3]/20',
      ].join(' ')}
    >
      <span className="text-base font-black tracking-tight">{title}</span>
      <span className="text-xs font-bold text-gray-600">{subtitle}</span>
    </button>
  );
}

type FlatInputProps = React.InputHTMLAttributes<HTMLInputElement>;
function FlatInput({ className, ...props }: FlatInputProps) {
  return (
    <input
      {...props}
      className={[
        'w-full rounded-xl border border-neutral-200 bg-white p-4 text-base font-bold text-black outline-none transition-colors',
        'placeholder:font-medium placeholder:text-gray-600 focus:border-black focus:ring-0',
        className ?? '',
      ].join(' ')}
    />
  );
}

type FlatSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;
function FlatSelect({ className, children, ...props }: FlatSelectProps) {
  return (
    <select
      {...props}
      className={[
        'w-full rounded-xl border border-neutral-200 bg-white p-4 text-base font-bold text-black outline-none transition-colors focus:border-black focus:ring-0',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </select>
  );
}

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root.');
}

createRoot(app).render(<App />);
