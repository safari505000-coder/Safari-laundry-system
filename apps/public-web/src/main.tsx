import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { companyBrand } from './brand';
import './styles.css';

const NAV_LINKS = [
  { href: '/about', label: 'عن المجموعة' },
  { href: '/individuals', label: 'الأفراد' },
  { href: '/companies', label: 'الشركات' },
  { href: '/corporate-government.html', label: 'الجهات والعقود' },
  { href: '/quality', label: 'الجودة' },
  { href: '/branches', label: 'الفروع' },
];

const HOME_CARDS = [
  {
    href: '/individuals',
    eyebrow: 'للأفراد',
    title: 'خدمات عناية يومية وقطع خاصة.',
    desc: 'ملابس يومية، تنظيف جاف، مفروشات، وقطع تحتاج معالجة أدق.',
  },
  {
    href: '/companies',
    eyebrow: 'للشركات',
    title: 'حلول للجهات التجارية.',
    desc: 'الفنادق، المطاعم، الشركات، العيادات، والجهات ذات الاحتياج المتكرر.',
  },
  {
    href: '/corporate-government.html',
    eyebrow: 'للجهات',
    title: 'ملف التأهيل والعقود.',
    desc: 'صفحة مؤسسية مخصصة للجهات الحكومية والشركات مع ملف شركة قابل للطباعة.',
  },
  {
    href: '/quality',
    eyebrow: 'الجودة',
    title: 'معايير تشغيل واضحة.',
    desc: 'فحص، معالجة مناسبة للقماش، تشطيب، ومتابعة تشغيلية.',
  },
  {
    href: '/branches',
    eyebrow: 'الفروع',
    title: 'حضور قريب داخل الكويت.',
    desc: 'فروع متعددة ورقم موحد للتواصل والاستفسارات الرسمية.',
  },
];

const INDIVIDUAL_SERVICES = [
  {
    title: 'العناية اليومية',
    desc: 'غسيل وكي للملابس اليومية والدشاديش والقمصان بروتين واضح وجودة ثابتة.',
  },
  {
    title: 'التنظيف الجاف',
    desc: 'عناية دقيقة للبدلات والفساتين والقطع الحساسة التي تحتاج معالجة خاصة.',
  },
  {
    title: 'المفروشات',
    desc: 'تنظيف للمفروشات والبطانيات والستائر والقطع المنزلية الثقيلة حسب نوع القماش.',
  },
  {
    title: 'القطع الخاصة',
    desc: 'فحص أكثر تحفظاً للقطع الثمينة أو التي تحتاج عناية منفصلة قبل المعالجة.',
  },
];

const COMPANY_SOLUTIONS = [
  {
    title: 'الفنادق والشقق الفندقية',
    desc: 'عناية دورية بالبياضات والمفروشات وملابس الضيوف وفق جدول تشغيلي واضح.',
  },
  {
    title: 'المطاعم والمقاهي',
    desc: 'تنظيف منظم للزي الموحد والمفارش وقطع التشغيل اليومية.',
  },
  {
    title: 'الشركات والجهات الرسمية',
    desc: 'خدمات للزي الموحد والملابس الرسمية مع تنسيق مباشر مع الإدارة أو قسم العمليات.',
  },
  {
    title: 'الصالونات والعيادات',
    desc: 'حلول عناية للمنسوجات المستخدمة يومياً مع تركيز على النظافة والاستمرارية.',
  },
];

const QUALITY_POINTS = [
  'فحص أولي للقطع قبل المعالجة.',
  'مواد تنظيف مناسبة لنوع القماش واللون.',
  'كي وتشطيب يحافظان على شكل القطعة.',
  'تشغيل موثق داخل نظام سفاري لضمان المتابعة.',
];

const FAQ_ITEMS = [
  {
    q: 'هل الموقع واجهة تعريفية؟',
    a: 'نعم. هذا الموقع واجهة رسمية للتعريف بالمجموعة وخدماتها للأفراد والشركات، وليس بوابة تشغيلية.',
  },
  {
    q: 'هل تقدمون خدمات للشركات؟',
    a: 'نعم. تخدم مجموعة مصابغ سفاري السريعة الأفراد والجهات التجارية مثل الفنادق، المطاعم، الشركات، والعيادات حسب احتياج كل جهة.',
  },
  {
    q: 'كيف أتواصل مع المجموعة؟',
    a: `يمكن التواصل عبر الرقم الموحد ${companyBrand.phone} أو زيارة أحد الفروع الموضحة في الموقع.`,
  },
];

type LegalPageId = 'privacy' | 'terms';
type OfficialPageId = 'home' | 'about' | 'individuals' | 'companies' | 'quality' | 'branches';

const LEGAL_PAGES: Record<
  LegalPageId,
  { title: string; intro: string; sections: Array<{ title: string; items: string[] }> }
> = {
  privacy: {
    title: 'سياسة الخصوصية',
    intro:
      'نحن في مجموعة مصابغ سفاري السريعة نلتزم بحماية خصوصية بياناتكم وأمنها داخل التطبيق والموقع في دولة الكويت.',
    sections: [
      {
        title: 'البيانات التي نجمعها',
        items: [
          'الاسم ورقم الهاتف للتواصل مع العميل عند الحاجة.',
          'بيانات التواصل الأساسية عند استخدام القنوات الرسمية للمجموعة.',
        ],
      },
      {
        title: 'مشاركة البيانات',
        items: [
          'قد يتم مشاركة رقم الهاتف مع مزودي الرسائل عند الحاجة للتواصل التشغيلي أو الإشعارات الرسمية.',
          'لا يتم بيع بيانات العملاء أو مشاركتها لأغراض تسويقية خارجية دون أساس نظامي أو موافقة مناسبة.',
        ],
      },
      {
        title: 'حذف البيانات',
        items: ['يحق للعميل طلب حذف حسابه وبياناته عبر التواصل مع خدمة العملاء.'],
      },
    ],
  },
  terms: {
    title: 'الشروط والأحكام التشغيلية',
    intro:
      'تحدد هذه الاتفاقية المسؤوليات بين المجموعة والعميل وفق أعراف سوق غسيل الملابس وقوانين التجارة في دولة الكويت.',
    sections: [
      {
        title: 'فحص الملابس والقطع الثمينة',
        items: [
          'يجب إبلاغ خدمة العملاء بوجود أي قطع ثمينة أو تتطلب عناية خاصة قبل معالجة القطعة.',
        ],
      },
      {
        title: 'سياسة التلف أو الفقدان',
        items: [
          'في حال تعرض أي قطعة للتلف أو الفقدان بسبب خطأ من المصبغة، يتم التعويض بناءً على تقدير الإدارة وبحد أقصى يعادل 10 أضعاف رسوم غسيل القطعة المتضررة أو حسب القوانين المعمول بها.',
        ],
      },
      {
        title: 'تأخر استلام الملابس',
        items: [
          'المجموعة غير مسؤولة عن القطع الجاهزة التي يتأخر العميل في تسلمها لمدة تتجاوز 30 يوماً من تاريخ إشعار الجاهزية.',
        ],
      },
    ],
  },
};

const LEGAL_LINKS = [
  { href: '/privacy', label: 'سياسة الخصوصية' },
  { href: '/terms', label: 'الشروط والأحكام' },
];

function whatsappLink() {
  return `https://wa.me/965${companyBrand.phone}?text=${encodeURIComponent(
    'مرحباً مجموعة مصابغ سفاري، أود الاستفسار عن خدماتكم.',
  )}`;
}

function mapsLink(query: string) {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
}

function App() {
  const legalPage = getLegalPageFromPath();
  const page = getOfficialPageFromPath();

  useEffect(() => {
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
  }, []);

  if (legalPage) {
    return <LegalPage page={legalPage} />;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a]">
      <SiteHeader />
      {page === 'home' ? <HomePage /> : <OfficialPage page={page} />}
      <SiteFooter />
      <FloatingWhatsApp />
    </div>
  );
}

function getLegalPageFromPath(): LegalPageId | null {
  const key = window.location.pathname.replace(/^\/+|\/+$/g, '');
  return key === 'privacy' || key === 'terms' ? key : null;
}

function getOfficialPageFromPath(): OfficialPageId {
  const key = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (
    key === 'about' ||
    key === 'individuals' ||
    key === 'companies' ||
    key === 'quality' ||
    key === 'branches'
  ) {
    return key;
  }
  return 'home';
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-900/10 bg-[#f8fafc]/90 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-5 md:px-12">
        <a href="/" className="flex items-center gap-3" aria-label={companyBrand.nameAr}>
          <img
            src={companyBrand.logoPath}
            alt={`شعار ${companyBrand.nameAr}`}
            className="h-10 w-24 object-contain"
          />
        </a>
        <nav className="hidden items-center gap-7 text-sm font-bold text-slate-500 lg:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-[#0284c7]">
              {link.label}
            </a>
          ))}
        </nav>
        <a
          href={`tel:${companyBrand.phone}`}
          className="rounded-full bg-[#0f172a] px-5 py-3 text-sm font-black text-white transition hover:bg-[#0284c7]"
        >
          {companyBrand.phone}
        </a>
      </div>
    </header>
  );
}

function HeroBlock() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 luxury-orb" aria-hidden="true" />
      <div className="relative mx-auto grid min-h-[760px] max-w-7xl grid-cols-1 items-center gap-16 px-6 py-24 md:px-12 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="max-w-4xl">
          <Eyebrow>Safari United · Since 1992</Eyebrow>
          <h1 className="mt-10 max-w-4xl font-display text-6xl font-black leading-[0.95] tracking-[-0.055em] text-[#0f172a] md:text-8xl">
            منظومة عناية مؤسسية للأفراد والشركات والجهات.
          </h1>
          <p className="mt-9 max-w-2xl text-xl font-medium leading-10 text-slate-600 md:text-2xl">
            مجموعة سفاري المتحدة للتجارة العامة وذراعها التشغيلي مجموعة مصابغ
            سفاري السريعة. حضور كويتي منذ 1992، وخدمات عناية بالملابس
            والمفروشات بهوية مؤسسية نظيفة وتقنية.
          </p>
          <div className="mt-12 flex flex-wrap items-center gap-4">
            <a className="luxury-button luxury-button-dark" href="/individuals">
              خدمات الأفراد
            </a>
            <a className="luxury-button luxury-button-ghost" href="/companies">
              حلول الشركات
            </a>
            <a className="luxury-button luxury-button-ghost" href="/corporate-government.html">
              ملف الجهات والعقود
            </a>
          </div>
        </div>
        <div className="relative min-h-[560px]">
          <div className="absolute inset-0 rounded-[3.5rem] border border-white/70 bg-white/45 shadow-[0_40px_120px_rgb(15_23_42/0.14)] backdrop-blur-2xl" />
          <div className="absolute inset-8 rounded-[2.75rem] bg-[linear-gradient(145deg,#ffffff_0%,#f8fafc_48%,#e0f2fe_100%)] p-10">
            <div className="flex h-full flex-col justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.36em] text-[#0284c7]">
                  Safari Since 1992
                </p>
                <p className="mt-6 max-w-xs text-4xl font-black leading-tight tracking-tight">
                  اسم كويتي في عناية الملابس والمفروشات.
                </p>
              </div>
              <HeroGarmentScene />
              <div className="grid grid-cols-2 gap-3">
                <GlassStat value="1992" label="سنة التأسيس" />
                <GlassStat value="4" label="فروع في الكويت" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomePage() {
  return (
    <>
      <HeroBlock />
      <section className="section-shell border-y border-black/5 bg-white">
        <SectionIntro
          eyebrow="الموقع الرسمي"
          title="صفحة رئيسية مختصرة، والتفاصيل في صفحات مستقلة."
          desc="تم ترتيب المحتوى ليبقى الموقع هادئاً: تعريف سريع، ثم انتقال واضح إلى خدمات الأفراد، حلول الشركات، الجودة، والفروع."
        />
        <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-2">
          {HOME_CARDS.map((card) => (
            <a key={card.href} href={card.href} className="minimal-card group">
              <Eyebrow>{card.eyebrow}</Eyebrow>
              <h3 className="mt-8 text-3xl font-black leading-tight tracking-tight">
                {card.title}
              </h3>
              <p className="mt-5 max-w-xl text-lg font-medium leading-8 text-stone-600">
                {card.desc}
              </p>
              <span className="mt-10 text-sm font-black text-[#0284c7] transition group-hover:text-[#0f172a]">
                عرض الصفحة
              </span>
            </a>
          ))}
        </div>
      </section>
      <FAQSection />
      <FinalCTA />
    </>
  );
}

function OfficialPage({ page }: { page: OfficialPageId }) {
  if (page === 'about') {
    return (
      <>
        <PageHero
          eyebrow="عن المجموعة"
          title="هوية تشغيلية هادئة، بخبرة ممتدة في السوق الكويتي."
          desc="تعرف على مجموعة مصابغ سفاري السريعة كاسم كويتي في عناية الملابس والمفروشات للأفراد والجهات التجارية."
        />
        <AboutSection />
        <QualitySection compact />
        <FinalCTA />
      </>
    );
  }
  if (page === 'individuals') {
    return (
      <>
        <PageHero
          eyebrow="للأفراد"
          title="خدمات عناية يومية وقطع خاصة، بتفاصيل واضحة."
          desc="صفحة مخصصة لخدمات الأفراد والعائلة، بدون مزجها مع تفاصيل الشركات أو السياسات."
        />
        <IndividualsSection />
        <QualitySection compact />
        <FinalCTA />
      </>
    );
  }
  if (page === 'companies') {
    return (
      <>
        <PageHero
          eyebrow="للشركات"
          title="حلول عناية للجهات التي تحتاج انتظاماً يومياً."
          desc="صفحة مستقلة للجهات التجارية والفنادق والمطاعم والشركات والعيادات."
          inverted
        />
        <CompaniesSection />
        <FinalCTA />
      </>
    );
  }
  if (page === 'quality') {
    return (
      <>
        <PageHero
          eyebrow="الجودة"
          title="تفاصيل صغيرة تصنع ثقة طويلة."
          desc="معايير مختصرة توضح طريقة التفكير في الفحص، المعالجة، التشطيب، والمتابعة."
        />
        <QualitySection />
        <FinalCTA />
      </>
    );
  }
  return (
    <>
      <PageHero
        eyebrow="الفروع"
        title="حضور قريب في أكثر من منطقة."
        desc={`صفحة الفروع والتواصل الرسمي. الرقم الموحد ${companyBrand.phone}.`}
      />
      <BranchesSection />
      <FinalCTA />
    </>
  );
}

function PageHero({
  eyebrow,
  title,
  desc,
  inverted = false,
}: {
  eyebrow: string;
  title: string;
  desc: string;
  inverted?: boolean;
}) {
  return (
    <section className={inverted ? 'safari-night text-white' : 'relative overflow-hidden'}>
      {!inverted ? <div className="absolute inset-0 luxury-orb" aria-hidden="true" /> : null}
      <div className="relative mx-auto max-w-7xl px-6 py-24 md:px-12 md:py-32">
        <SectionIntro eyebrow={eyebrow} title={title} desc={desc} inverted={inverted} />
      </div>
    </section>
  );
}

function HeroGarmentScene() {
  return (
    <div className="relative mx-auto h-56 w-full max-w-sm" aria-hidden="true">
      <div className="absolute left-10 top-6 h-36 w-28 rotate-[-7deg] rounded-[2rem] border border-white/80 bg-white/55 shadow-2xl" />
      <div className="absolute left-28 top-0 h-44 w-32 rotate-[5deg] rounded-[2rem] border border-white/90 bg-white/75 shadow-2xl">
        <div className="mx-auto mt-8 h-9 w-14 rounded-b-full border-b-2 border-stone-300" />
        <div className="mx-auto mt-7 h-20 w-20 rounded-2xl bg-[#edf6fb]" />
      </div>
      <div className="absolute bottom-5 right-6 h-28 w-40 rounded-[2rem] border border-[#38bdf8]/60 bg-[#38bdf8]/20 shadow-xl">
        <div className="mx-auto mt-7 h-3 w-24 rounded-full bg-white/80" />
        <div className="mx-auto mt-4 h-3 w-16 rounded-full bg-white/60" />
      </div>
    </div>
  );
}

function GlassStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/70 bg-white/55 p-5 backdrop-blur">
      <span className="block text-3xl font-black tracking-tight text-[#0f172a]">{value}</span>
      <span className="mt-2 block text-sm font-bold text-stone-500">{label}</span>
    </div>
  );
}

function AboutSection() {
  return (
    <section id="about" className="section-shell border-y border-black/5 bg-white">
      <div className="grid grid-cols-1 gap-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
        <SectionIntro
          eyebrow="عن المجموعة"
          title="هوية تشغيلية هادئة، بخبرة ممتدة في السوق الكويتي."
        />
        <p className="max-w-3xl text-xl font-medium leading-10 text-stone-600">
          تقدم مجموعة مصابغ سفاري السريعة خدمات العناية بالملابس والمفروشات
          عبر فروعها في الكويت، مع تركيز على الجودة، الالتزام، والتعامل المنظم
          مع احتياجات الأفراد والجهات التجارية.
        </p>
      </div>
    </section>
  );
}

function IndividualsSection() {
  return (
    <section id="individuals" className="section-shell bg-[#f8fafc]">
      <SectionIntro
        eyebrow="للأفراد"
        title="عناية يومية وقطع خاصة، بتفاصيل واضحة."
        desc="خدمات مصممة للعائلة والعميل اليومي، من الملابس الأساسية إلى القطع التي تحتاج عناية أكثر دقة."
      />
      <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-2">
        {INDIVIDUAL_SERVICES.map((service) => (
          <article key={service.title} className="minimal-card">
            <h3 className="text-3xl font-black tracking-tight">{service.title}</h3>
            <p className="mt-5 max-w-xl text-lg font-medium leading-8 text-stone-600">
              {service.desc}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CompaniesSection() {
  return (
    <section id="companies" className="section-shell safari-night text-white">
      <SectionIntro
        eyebrow="للشركات"
        title="حلول عناية للجهات التي تحتاج انتظاماً يومياً."
        desc="تتعامل سفاري مع احتياجات الشركات والجهات التجارية بروح تشغيلية: وضوح في الخدمة، متابعة، وجدولة تناسب طبيعة كل نشاط."
        inverted
      />
      <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-2">
        {COMPANY_SOLUTIONS.map((solution) => (
          <article
            key={solution.title}
            className="rounded-[2rem] border border-white/15 bg-white/10 p-8"
          >
            <h3 className="text-2xl font-black tracking-tight">{solution.title}</h3>
            <p className="mt-4 text-base font-medium leading-8 text-white/72">{solution.desc}</p>
          </article>
        ))}
      </div>
      <div className="mt-10">
        <a
          href="/corporate-government.html"
          className="luxury-button bg-white text-[#0f172a] hover:bg-[#38bdf8]"
        >
          فتح صفحة الجهات والعقود
        </a>
      </div>
    </section>
  );
}

function QualitySection({ compact = false }: { compact?: boolean }) {
  return (
    <section id="quality" className="section-shell border-y border-black/5 bg-white">
      <div className="grid grid-cols-1 gap-14 lg:grid-cols-[0.8fr_1.2fr]">
        {compact ? (
          <SectionIntro
            eyebrow="معايير مختصرة"
            title="طريقة عناية واضحة."
            desc="الفكرة واحدة: فحص مناسب، معالجة محترمة للقماش، وتشطيب مرتب."
          />
        ) : (
          <SectionIntro
            eyebrow="الجودة"
            title="تفاصيل صغيرة تصنع ثقة طويلة."
            desc="الهدف ليس كثرة الوعود، بل تشغيل ثابت يحافظ على القطعة ويجعل الخدمة قابلة للمتابعة."
          />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {QUALITY_POINTS.map((point, index) => (
            <article key={point} className="minimal-card">
              <span className="font-display text-5xl font-black tracking-[-0.08em] text-[#0284c7]/20">
                {String(index + 1).padStart(2, '0')}
              </span>
              <p className="mt-10 text-2xl font-black leading-tight tracking-tight">{point}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function BranchesSection() {
  return (
    <section id="branches" className="section-shell bg-[#f8fafc]">
      <SectionIntro
        eyebrow="الفروع"
        title="حضور قريب في أكثر من منطقة."
        desc={`للاستفسارات العامة وخدمات الأفراد والشركات، تواصل مع الرقم الموحد ${companyBrand.phone}.`}
      />
      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-4">
        {companyBrand.branches.map((branch) => (
          <a
            key={branch}
            href={mapsLink(`${branch} Kuwait`)}
            target="_blank"
            rel="noreferrer"
            className="rounded-[1.75rem] border border-slate-900/10 bg-white p-6 transition hover:-translate-y-1 hover:border-[#0284c7]/30"
          >
            <span className="block text-lg font-black">{branch}</span>
            <span className="mt-3 block text-sm font-bold text-[#0284c7]">فتح في الخرائط</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="section-shell border-y border-black/5 bg-white">
      <SectionIntro eyebrow="الأسئلة الشائعة" title="معلومات رسمية مختصرة." />
      <div className="mt-12 divide-y divide-slate-900/5 rounded-[2rem] border border-slate-900/10 bg-[#f8fafc]">
        {FAQ_ITEMS.map((item, index) => {
          const isOpen = open === index;
          return (
            <button
              key={item.q}
              type="button"
              onClick={() => setOpen(isOpen ? null : index)}
              className="block w-full px-6 py-6 text-right"
            >
              <div className="flex items-start justify-between gap-6">
                <span className="text-xl font-black tracking-tight">{item.q}</span>
                <span className="text-3xl font-light text-[#0284c7]">{isOpen ? '-' : '+'}</span>
              </div>
              {isOpen ? (
                <p className="mt-4 max-w-3xl text-base font-medium leading-8 text-stone-600">
                  {item.a}
                </p>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="section-shell safari-night text-white">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.36em] text-[#38bdf8]">
            Safari United General Trading Group
          </p>
          <h2 className="mt-5 max-w-3xl font-display text-5xl font-black leading-tight tracking-[-0.045em] md:text-7xl">
            للتواصل الرسمي والاستفسارات.
          </h2>
          <p className="mt-6 max-w-2xl text-lg font-medium leading-9 text-white/70">
            نستقبل استفسارات الأفراد والشركات عبر الرقم الموحد أو الواتساب.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href={`tel:${companyBrand.phone}`} className="luxury-button bg-white text-[#0f172a] hover:bg-[#38bdf8]">
            اتصال
          </a>
          <a href="/corporate-government.html" className="luxury-button border border-white/20 text-white hover:bg-white/10">
            صفحة الجهات
          </a>
          <a href={whatsappLink()} className="luxury-button border border-white/20 text-white hover:bg-white/10">
            واتساب
          </a>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-[#f8fafc]">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-16 md:grid-cols-3 md:px-12">
        <div>
          <img
            src={companyBrand.logoPath}
            alt={`شعار ${companyBrand.nameAr}`}
            className="h-10 w-24 object-contain"
          />
          <p className="mt-5 max-w-sm text-sm font-medium leading-7 text-stone-600">
            {companyBrand.nameAr}. موقع تعريفي رسمي لخدمات العناية بالملابس
            والمفروشات للأفراد والشركات في الكويت.
          </p>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#0284c7]">
            السياسات
          </p>
          <div className="mt-4 flex flex-col gap-3 text-sm font-bold text-stone-600">
            {LEGAL_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="transition hover:text-[#0284c7]">
                {link.label}
              </a>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#0284c7]">
            تواصل
          </p>
          <a
            href={`tel:${companyBrand.phone}`}
            className="mt-4 block text-4xl font-black tracking-tight text-[#0f172a] transition hover:text-[#0284c7]"
          >
            {companyBrand.phone}
          </a>
          <p className="mt-3 text-sm font-medium text-stone-500">يومياً 8:00 ص - 11:00 م</p>
        </div>
      </div>
      <div className="border-t border-black/5">
        <p className="mx-auto max-w-7xl px-6 py-5 text-xs font-bold text-stone-500 md:px-12">
          © {new Date().getFullYear()} {companyBrand.nameAr}
        </p>
      </div>
    </footer>
  );
}

function LegalPage({ page }: { page: LegalPageId }) {
  const content = LEGAL_PAGES[page];
  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a]">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-24 md:px-12 md:py-32">
        <a href="/" className="text-sm font-black text-[#0284c7]">
          العودة للرئيسية
        </a>
        <h1 className="mt-10 font-display text-5xl font-black tracking-[-0.045em] md:text-7xl">
          {content.title}
        </h1>
        <p className="mt-8 max-w-3xl text-xl font-medium leading-10 text-stone-600">
          {content.intro}
        </p>
        <div className="mt-16 space-y-5">
          {content.sections.map((section) => (
            <section key={section.title} className="minimal-card">
              <h2 className="text-2xl font-black tracking-tight">{section.title}</h2>
              <ul className="mt-5 space-y-3 text-base font-medium leading-8 text-stone-600">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function SectionIntro({
  eyebrow,
  title,
  desc,
  inverted = false,
}: {
  eyebrow: string;
  title: string;
  desc?: string;
  inverted?: boolean;
}) {
  return (
    <div>
      <Eyebrow inverted={inverted}>{eyebrow}</Eyebrow>
      <h2
        className={[
          'mt-7 max-w-4xl font-display text-5xl font-black leading-tight tracking-[-0.045em] md:text-7xl',
          inverted ? 'text-white' : 'text-[#0f172a]',
        ].join(' ')}
      >
        {title}
      </h2>
      {desc ? (
        <p
          className={[
            'mt-6 max-w-2xl text-lg font-medium leading-9',
            inverted ? 'text-white/70' : 'text-slate-600',
          ].join(' ')}
        >
          {desc}
        </p>
      ) : null}
    </div>
  );
}

function Eyebrow({ children, inverted = false }: { children: ReactNode; inverted?: boolean }) {
  return (
    <span
      className={[
        'inline-flex rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.32em]',
        inverted ? 'bg-white/10 text-[#38bdf8]' : 'bg-[#e0f2fe] text-[#0284c7]',
      ].join(' ')}
    >
      {children}
    </span>
  );
}

function FloatingWhatsApp() {
  return (
    <a
      href={whatsappLink()}
      target="_blank"
      rel="noreferrer"
      aria-label="WhatsApp"
      className="fixed bottom-6 left-6 z-50 rounded-full bg-[#0f172a] px-5 py-3 text-sm font-black text-white shadow-2xl transition hover:bg-[#0284c7]"
    >
      WhatsApp
    </a>
  );
}

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root.');
}

createRoot(app).render(<App />);
