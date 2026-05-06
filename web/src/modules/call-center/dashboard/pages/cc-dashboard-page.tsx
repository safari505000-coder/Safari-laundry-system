import { useTranslation } from 'react-i18next';
import { Headphones, Search, ShieldCheck, Truck } from 'lucide-react';
import { CustomerSearch } from '../components/customer-search';
import { DispatchMonitorPanel } from '../components/dispatch-monitor-panel';

const FEATURE_BULLETS: {
  id: string;
  icon: typeof Search;
  titleKey: string;
  titleDefault: string;
  descKey: string;
  descDefault: string;
}[] = [
  {
    id: 'search',
    icon: Search,
    titleKey: 'callCenterDashboard.intro.featureSearchTitle',
    titleDefault: 'بحث ذكي بالعميل',
    descKey: 'callCenterDashboard.intro.featureSearchDesc',
    descDefault:
      'ابحث برقم الهاتف، الاسم، أو معرف العميل مباشرةً. النتائج تظهر فور التوقّف عن الكتابة.',
  },
  {
    id: 'dispatch',
    icon: Truck,
    titleKey: 'callCenterDashboard.intro.featureDispatchTitle',
    titleDefault: 'إسناد لحظي للسائقين',
    descKey: 'callCenterDashboard.intro.featureDispatchDesc',
    descDefault:
      'أصدر مهمة جديدة للسائق المناسب وراقب حالة كل مهمة (في الوقت / متأخّرة / حرجة) بالتحديث التلقائي.',
  },
  {
    id: 'risk',
    icon: ShieldCheck,
    titleKey: 'callCenterDashboard.intro.featureRiskTitle',
    titleDefault: 'تقييم المخاطر قبل الإصدار',
    descKey: 'callCenterDashboard.intro.featureRiskDesc',
    descDefault:
      'مؤشّر مخاطرة، إشارات تشغيلية (تعرّض نقدي / إعادات إسناد / تأخّر)، ولافتة تحذير عند السلوك غير الاعتيادي.',
  },
];

export function CcDashboardPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 lg:py-16">
      <header className="space-y-3 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Headphones className="size-6" aria-hidden />
        </div>
        <h1 className="font-heading text-3xl font-semibold">
          {t('callCenterDashboard.intro.title', {
            defaultValue: 'لوحة مركز الاتصال',
          })}
        </h1>
        <p className="mx-auto max-w-xl text-sm text-muted-foreground">
          {t('callCenterDashboard.intro.subtitle', {
            defaultValue:
              'ابدأ بالبحث عن العميل لفتح ملفه الكامل (٣٦٠) وإسناد المهمات وإدارة الحظر — كل شيء من نقطة دخول واحدة.',
          })}
        </p>
      </header>

      <CustomerSearch autoFocus />

      <DispatchMonitorPanel />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {FEATURE_BULLETS.map(({ id, icon: Icon, titleKey, titleDefault, descKey, descDefault }) => (
          <div
            key={id}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <Icon className="size-5 text-primary" aria-hidden />
            <h2 className="mt-2 text-sm font-medium">
              {t(titleKey, { defaultValue: titleDefault })}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t(descKey, { defaultValue: descDefault })}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
