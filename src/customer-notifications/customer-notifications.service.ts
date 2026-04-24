import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  BRAND_CUSTOMER_AR,
  BRAND_SYSTEM_AR,
} from '../common/constants/branding';
import { parseKuwaitMobile965 } from '../common/validation/kuwait-customer-phone';

export type InvoiceIssuedNotifyParams = {
  customerPhone: string;
  orderId: string;
  invoiceLabel: string;
  amountKd: string;
  /** Payment link when checkout used PAYMENT_LINK. */
  paymentUrl?: string;
  /**
   * V19.25 — Public `/public/invoice/:token` (7-day JWT). Customer opens and
   * saves PDF; sent automatically after branch/driver POS checkout when
   * `PUBLIC_WEB_APP_URL` is set.
   */
  invoiceShareUrl?: string;
  /** Multi-invoice bundle: one message, several receipt links. */
  invoiceShareItems?: Array<{ label: string; url: string }>;
};

export type InvoiceEditedIssuerNotifyParams = {
  /** Staff phone (as stored; same webhook as customer, different template). */
  toPhone: string;
  orderId: string;
  invoiceLabel: string;
  newAmountKd: string;
  editorLabel: string;
  /** Public receipt URL for updated totals/lines. */
  invoiceShareUrl?: string;
};

/**
 * V7.1 — Gender-neutral Arabic template for the auto-notification fired
 * when a POS checkout issues an invoice. The customer's display name is
 * not in scope at call time (only their phone), so this opens with a
 * neutral warm greeting and addresses them using professional plural
 * Arabic (ملابسكم / بخدمتكم / ثقتكم).
 */
function buildInvoiceIssuedMessage(params: {
  invoiceLabel: string;
  amountKd: string;
  paymentUrl?: string;
  invoiceShareUrl?: string;
  invoiceShareItems?: Array<{ label: string; url: string }>;
  /** Legacy fallback when no public invoice URL (no PUBLIC_WEB_APP_URL). */
  detailsLink?: string;
}): string {
  const lines: string[] = [];
  lines.push('حياك الله! 🌿');
  lines.push('');
  lines.push(`نسعد بخدمتكم في ${BRAND_CUSTOMER_AR}.`);
  lines.push('');
  lines.push(`🏷️ رقم الفاتورة: ${params.invoiceLabel}`);
  // *...* for bold-style emphasis in the message text.
  lines.push(`💰 *الإجمالي: ${params.amountKd} د.ك*`);
  lines.push('');
  lines.push(
    'ملابسكم في أيدٍ أمينة، وسنعتني بها بأفضل صورة — شكراً لثقتكم بنا.',
  );

  if (params.paymentUrl) {
    lines.push('');
    lines.push(
      '📱 رابط الدفع + نسخة الفاتورة تُرسل لجوالكم (SMS) — للدفع من هنا:',
    );
    lines.push('🔒 رابط UPayments:');
    lines.push(params.paymentUrl);
  }

  if (params.invoiceShareItems && params.invoiceShareItems.length > 0) {
    lines.push('');
    lines.push('📄 نسخة الفاتورة (عرض / حفظ PDF):');
    for (const it of params.invoiceShareItems) {
      lines.push(`• ${it.label}: ${it.url}`);
    }
  } else if (params.invoiceShareUrl) {
    lines.push('');
    lines.push('📄 نسخة الفاتورة — افتح الرابط لعرضها أو حفظها PDF:');
    lines.push(params.invoiceShareUrl);
  } else if (params.detailsLink) {
    lines.push('');
    lines.push('🔗 لمراجعة تفاصيل الطلب:');
    lines.push(params.detailsLink);
  }

  lines.push('');
  lines.push(`فريق ${BRAND_SYSTEM_AR} 🇰🇼`);
  return lines.join('\n');
}

function buildInvoiceEditedIssuerMessage(params: {
  invoiceLabel: string;
  newAmountKd: string;
  editorLabel: string;
  invoiceShareUrl?: string;
}): string {
  const lines: string[] = [];
  lines.push('تنبيه — تعديل فاتورة');
  lines.push('');
  lines.push(
    `فاتورتك *${params.invoiceLabel}* تم تعديلها من الكول سنتر (${params.editorLabel}).`,
  );
  lines.push(`الإجمالي بعد التعديل: *${params.newAmountKd} د.ك*`);
  if (params.invoiceShareUrl) {
    lines.push('');
    lines.push('📄 نسخة محدثة — طباعة/عرض:');
    lines.push(params.invoiceShareUrl);
  } else {
    lines.push('');
    lines.push('افتح تطبيق السفاري — الفواتير — لإعادة الطباعة بأرقام محدثة.');
  }
  lines.push('');
  lines.push(`فريق ${BRAND_SYSTEM_AR} 🇰🇼`);
  return lines.join('\n');
}

@Injectable()
export class CustomerNotificationsService implements OnModuleInit {
  private readonly logger = new Logger(CustomerNotificationsService.name);

  onModuleInit(): void {
    const k = process.env.INFOBIP_API_KEY?.trim();
    const b = process.env.INFOBIP_BASE_URL?.trim();
    const f = process.env.INFOBIP_SMS_FROM?.trim();
    const infobipOk = Boolean(k && b && f);
    const infobipPartial = Boolean((k || b || f) && !infobipOk);
    if (infobipOk) {
      this.logger.log('Customer notify: Infobip SMS is configured.');
    } else if (infobipPartial) {
      this.logger.warn(
        'Customer notify: Infobip incomplete — set INFOBIP_BASE_URL, INFOBIP_API_KEY, and INFOBIP_SMS_FROM together to send SMS.',
      );
    }
    const hasHook = Boolean(process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim());
    if (hasHook) {
      this.logger.log('Customer notify: CUSTOMER_NOTIFY_WEBHOOK_URL is set.');
    }
    if (!infobipOk && !hasHook) {
      this.logger.warn(
        'Customer notify: no Infobip SMS and no CUSTOMER_NOTIFY_WEBHOOK_URL — invoice text only hits logs.',
      );
    }
  }

  /**
   * Fire-and-forget SMS + optional webhook — never blocks POS.
   */
  notifyInvoiceIssued(params: InvoiceIssuedNotifyParams): void {
    setImmediate(() => {
      void this.deliver(params).catch((e) =>
        this.logger.warn(`Invoice notify failed: ${e}`),
      );
    });
  }

  /**
   * Same as `notifyInvoiceIssued` but awaited — used after **ONLINE** POS
   * checkout so the payment link + receipt text reach the webhook before
   * the HTTP response returns to the client.
   */
  async deliverInvoiceIssuedNow(
    params: InvoiceIssuedNotifyParams,
  ): Promise<void> {
    await this.deliver(params);
  }

  /**
   * After CC supervisor (or owner) same-day edit — nudge the driver/manager
   * who issued the POS so they can re-print the public receipt.
   */
  notifyInvoiceEditedForIssuer(params: InvoiceEditedIssuerNotifyParams): void {
    setImmediate(() => {
      void this.deliverIssuerEdit(params).catch((e) =>
        this.logger.warn(`Invoice issuer notify failed: ${e}`),
      );
    });
  }

  private async deliver(params: InvoiceIssuedNotifyParams): Promise<void> {
    const base =
      (process.env.PUBLIC_WEB_APP_URL ?? '').replace(/\/$/, '') || '';
    const hasPublicShare =
      Boolean(params.invoiceShareUrl) ||
      (params.invoiceShareItems && params.invoiceShareItems.length > 0);
    const detailsLink =
      hasPublicShare || !base ?
        undefined
      : `${base}/orders?highlight=${encodeURIComponent(params.orderId)}`;

    const message = buildInvoiceIssuedMessage({
      invoiceLabel: params.invoiceLabel,
      amountKd: params.amountKd,
      paymentUrl: params.paymentUrl,
      invoiceShareUrl: params.invoiceShareUrl,
      invoiceShareItems: params.invoiceShareItems,
      detailsLink,
    });

    if (this.isInfobipConfigured()) {
      await this.trySendInfobipSms(params.customerPhone, message);
    }

    const webhook = process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim();
    if (webhook) {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: params.customerPhone,
          message,
          orderId: params.orderId,
          template: 'invoice_issued',
          invoiceShareUrl: params.invoiceShareUrl ?? null,
          invoiceShareItems: params.invoiceShareItems ?? null,
        }),
      });
      if (!res.ok) {
        this.logger.warn(
          `CUSTOMER_NOTIFY_WEBHOOK_URL returned ${res.status}`,
        );
      }
      return;
    }

    if (!this.isInfobipConfigured()) {
      this.logger.log(
        `[notify] ${params.customerPhone}: ${message.slice(0, 120)}… (set Infobip or CUSTOMER_NOTIFY_WEBHOOK_URL to send)`,
      );
    }
  }

  private async deliverIssuerEdit(
    params: InvoiceEditedIssuerNotifyParams,
  ): Promise<void> {
    const message = buildInvoiceEditedIssuerMessage({
      invoiceLabel: params.invoiceLabel,
      newAmountKd: params.newAmountKd,
      editorLabel: params.editorLabel,
      invoiceShareUrl: params.invoiceShareUrl,
    });

    if (this.isInfobipConfigured()) {
      await this.trySendInfobipSms(params.toPhone, message);
    }

    const staffWebhook = process.env.STAFF_INVOICE_NOTIFY_WEBHOOK_URL?.trim();
    const customerWebhook = process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim();
    const webhook = staffWebhook || customerWebhook;
    if (webhook) {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: params.toPhone,
          message,
          orderId: params.orderId,
          template: 'invoice_edited_issuer',
          invoiceShareUrl: params.invoiceShareUrl ?? null,
        }),
      });
      if (!res.ok) {
        this.logger.warn(
          `${staffWebhook ? 'STAFF_INVOICE_NOTIFY_WEBHOOK_URL' : 'CUSTOMER_NOTIFY_WEBHOOK_URL'} returned ${res.status}`,
        );
      }
      return;
    }

    if (!this.isInfobipConfigured()) {
      this.logger.log(
        `[notify issuer] ${params.toPhone}: ${message.slice(0, 120)}… (set Infobip or STAFF_/CUSTOMER_ webhook)`,
      );
    }
  }

  /** Infobip: base URL, API key, and registered sender (alphanumeric or numeric on your account). */
  private isInfobipConfigured(): boolean {
    return (
      Boolean(process.env.INFOBIP_API_KEY?.trim()) &&
      Boolean(process.env.INFOBIP_BASE_URL?.trim()) &&
      Boolean(process.env.INFOBIP_SMS_FROM?.trim())
    );
  }

  /**
   * Infobip SMS — POST /sms/2/text/advanced, `Authorization: App <api key>`.
   * `to` is international format without + (e.g. 965XXXXXXXX for Kuwait).
   */
  private async trySendInfobipSms(
    rawPhone: string,
    text: string,
  ): Promise<boolean> {
    const apiKey = process.env.INFOBIP_API_KEY?.trim();
    const base = process.env.INFOBIP_BASE_URL?.trim();
    const from = process.env.INFOBIP_SMS_FROM?.trim();
    if (!apiKey || !base || !from) {
      return false;
    }
    const to = parseKuwaitMobile965(rawPhone);
    if (!to) {
      this.logger.warn(
        `Infobip SMS skipped: invalid Kuwait mobile (…${rawPhone.slice(-4)})`,
      );
      return false;
    }
    const url = `${base.replace(/\/$/, '')}/sms/2/text/advanced`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `App ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              from,
              destinations: [{ to }],
              text,
            },
          ],
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        this.logger.warn(
          `Infobip SMS ${res.status}: ${errText.slice(0, 400)}`,
        );
        return false;
      }
      this.logger.log(`Infobip SMS queued for …${rawPhone.slice(-4)}`);
      return true;
    } catch (e) {
      this.logger.warn(`Infobip SMS request failed: ${e}`);
      return false;
    }
  }
}
