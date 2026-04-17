import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { MessageCircle, Users, Wallet } from 'lucide-react';
import { RequireRoles } from '@/modules/shared/components/require-roles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';

function WhatsappToolsContent() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-2 py-4 sm:px-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('whatsappTools.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('whatsappTools.subtitle')}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <Users className="mb-2 h-8 w-8 text-primary" aria-hidden />
            <CardTitle>{t('whatsappTools.customersCardTitle')}</CardTitle>
            <CardDescription>{t('whatsappTools.customersCardBody')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              to="/customers"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <MessageCircle className="me-2 h-4 w-4" aria-hidden />
              {t('whatsappTools.openCustomers')}
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Wallet className="mb-2 h-8 w-8 text-primary" aria-hidden />
            <CardTitle>{t('whatsappTools.debtCardTitle')}</CardTitle>
            <CardDescription>{t('whatsappTools.debtCardBody')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              to="/collections"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
            >
              <MessageCircle className="me-2 h-4 w-4" aria-hidden />
              {t('whatsappTools.openCollections')}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function WhatsappToolsPage() {
  return (
    <RequireRoles roles={['CALL_CENTER']}>
      <WhatsappToolsContent />
    </RequireRoles>
  );
}
