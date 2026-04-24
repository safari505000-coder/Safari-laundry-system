import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  BRAND_CUSTOMER_AR,
  BRAND_SYSTEM_AR,
} from '../common/constants/branding';

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
  // WhatsApp bold uses *...* — keeping the total visually anchored.
  lines.push(`💰 *الإجمالي: ${params.amountKd} د.ك*`);
  lines.push('');
  lines.push(
    'ملابسكم في أيدٍ أمينة، وسنعتني بها بأفضل صورة — شكراً لثقتكم بنا.',
  );

  if (params.paymentUrl) {
    lines.push('');
    lines.push(
      '📱 رابط الدفع + نسخة الفاتورة تُرسل لجوالكم (واتساب) — للدفع من هنا:',
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

/** Digits only for API `number` (Moatmt expects Kuwait mobile as 965 + 8 digits). */
function kuwaitPhoneDigitsForWhatsApp(phone: string): string | null {
  const d = phone.replace(/[\s\-+]/g, '');
  if (d.length === 8 && /^[569]\d{7}$/.test(d)) {
    return `965${d}`;
  }
  if (d.length === 11 && d.startsWith('965') && /^965[569]\d{7}$/.test(d)) {
    return d;
  }
  if (d.length === 12 && d.startsWith('00965') && /^00965[569]\d{7}$/.test(d)) {
    return d.slice(2);
  }
  if (d.length > 0 && d.startsWith('965') && d.length >= 11) {
    return d;
  }
  return null;
}

@Injectable()
export class CustomerNotificationsService implements OnModuleInit {
  private readonly logger = new Logger(CustomerNotificationsService.name);

  onModuleInit(): void {
    const hasMoatmt =
      Boolean(process.env.MOATMT_ACCESS_TOKEN?.trim()) &&
      Boolean(process.env.MOATMT_INSTANCE_ID?.trim());
    const hasHook = Boolean(process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim());
    if (hasMoatmt) {
      this.logger.log(
        'Customer notify: Moatmt /send enabled (and webhook fallback if Moatmt fails and CUSTOMER_NOTIFY_WEBHOOK_URL is set).',
      );
    } else if (hasHook) {
      this.logger.log('Customer notify: CUSTOMER_NOTIFY_WEBHOOK_URL is set.');
    } else {
      this.logger.warn(
        'Customer notify: no MOATMT_INSTANCE_ID+MOATMT_ACCESS_TOKEN and no CUSTOMER_NOTIFY_WEBHOOK_URL — invoice WhatsApp only logs, nothing is sent.',
      );
    }
  }

  /**
   * Fire-and-forget SMS/WhatsApp hook — never blocks POS.
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
   * checkout so the payment link + receipt text hit Moatmt/webhook before
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

    if (await this.trySendMoatmt(params.customerPhone, message)) {
      return;
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

    this.logger.log(
      `[notify] ${params.customerPhone}: ${message.slice(0, 120)}… (set MOATMT_* or CUSTOMER_NOTIFY_WEBHOOK_URL to send)`,
    );
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

    if (await this.trySendMoatmt(params.toPhone, message)) {
      return;
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

    this.logger.log(
      `[notify issuer] ${params.toPhone}: ${message.slice(0, 120)}… (set MOATMT_* or STAFF/ CUSTOMER webhooks)`,
    );
  }

  /**
   * Moatmt (moatmt.sa) POST /api/send — used when `MOATMT_ACCESS_TOKEN` +
   * `MOATMT_INSTANCE_ID` are set. Returns true if the request succeeded.
   * Doc: `type: text`, body includes `number` (Kuwait 965…), `message`.
   */
  private async trySendMoatmt(
    rawPhone: string,
    message: string,
  ): Promise<boolean> {
    const accessToken = process.env.MOATMT_ACCESS_TOKEN?.trim();
    const instanceId = process.env.MOATMT_INSTANCE_ID?.trim();
    if (!accessToken || !instanceId) {
      return false;
    }
    const number = kuwaitPhoneDigitsForWhatsApp(rawPhone);
    if (!number) {
      this.logger.warn(
        `Moatmt send skipped: could not parse Kuwait mobile from value ending …${rawPhone.slice(-4)}`,
      );
      return false;
    }
    const base = (
      process.env.MOATMT_API_BASE_URL?.trim() || 'https://moatmt.sa/api'
    ).replace(/\/$/, '');
    const url = `${base}/send`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number,
          type: 'text',
          message,
          instance_id: instanceId,
          access_token: accessToken,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        this.logger.warn(
          `Moatmt POST /send ${res.status}: ${errText.slice(0, 200)}`,
        );
        return false;
      }
      this.logger.log(`Moatmt WhatsApp sent to …${rawPhone.slice(-4)}`);
      return true;
    } catch (e) {
      this.logger.warn(`Moatmt request failed: ${e}`);
      return false;
    }
  }
}
