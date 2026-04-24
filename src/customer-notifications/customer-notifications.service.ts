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

@Injectable()
export class CustomerNotificationsService implements OnModuleInit {
  private readonly logger = new Logger(CustomerNotificationsService.name);

  onModuleInit(): void {
    const hasMoatmt =
      Boolean(process.env.MOATMT_ACCESS_TOKEN?.trim()) &&
      Boolean(process.env.MOATMT_INSTANCE_ID?.trim());
    const hasHook = Boolean(process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim());
    if (hasMoatmt) {
      const media =
        process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === 'true' ||
        process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === '1';
      this.logger.log(
        `Customer notify: Moatmt /send enabled (mode: ${
          media ? 'text+media when share URL is present' : 'text'
        }; webhook on failure if CUSTOMER_NOTIFY_WEBHOOK_URL is set).`,
      );
    } else if (hasHook) {
      this.logger.log('Customer notify: CUSTOMER_NOTIFY_WEBHOOK_URL is set.');
    } else {
      this.logger.warn(
        'Customer notify: no MOATMT_INSTANCE_ID+MOATMT_ACCESS_TOKEN and no CUSTOMER_NOTIFY_WEBHOOK_URL — invoice text only hits logs.',
      );
    }
  }

  /**
   * Fire-and-forget Moatmt + optional webhook — never blocks POS.
   */
  notifyInvoiceIssued(params: InvoiceIssuedNotifyParams): void {
    setImmediate(() => {
      void this.deliver(params).catch((e) =>
        this.logger.warn(`Invoice notify failed: ${e}`),
      );
    });
  }

  /**
   * Awaited after **ONLINE** POS so payment link + text reach Moatmt/webhook
   * before the HTTP response returns.
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

    if (
      await this.trySendMoatmt(
        params.customerPhone,
        message,
        this.buildMoatmtInvoiceMediaPayload(params),
      )
    ) {
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
      `[notify] ${params.customerPhone}: ${message.slice(0, 120)}… (set MOATMT_* or CUSTOMER_NOTIFY_WEBHOOK_URL)`,
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

    if (
      await this.trySendMoatmt(
        params.toPhone,
        message,
        this.buildMoatmtIssuerEditMediaPayload(params),
      )
    ) {
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
      `[notify issuer] ${params.toPhone}: ${message.slice(0, 120)}… (set MOATMT_* or STAFF_/CUSTOMER_ webhook)`,
    );
  }

  /**
   * When `MOATMT_USE_INVOICE_MEDIA` is set and a public invoice URL exists,
   * use `type: "media"` (Moatmp must fetch a direct file URL; a SPA page may not work).
   */
  private buildMoatmtInvoiceMediaPayload(
    params: InvoiceIssuedNotifyParams,
  ): { mediaUrl: string; filename: string; caption: string } | null {
    const on =
      process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === 'true' ||
      process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === '1';
    if (!on) {
      return null;
    }
    const mediaUrl =
      params.invoiceShareUrl?.trim() ||
      params.invoiceShareItems?.[0]?.url?.trim() ||
      null;
    if (!mediaUrl) {
      return null;
    }
    const shortId = params.orderId.replace(/-/g, '').slice(0, 8);
    const filename =
      process.env.MOATMT_INVOICE_MEDIA_FILENAME?.trim() ||
      `invoice_${shortId}.png`;
    return {
      mediaUrl,
      filename,
      caption: this.buildMoatmtMediaCaptionForInvoice({
        paymentUrl: params.paymentUrl,
      }),
    };
  }

  private buildMoatmtIssuerEditMediaPayload(
    params: InvoiceEditedIssuerNotifyParams,
  ): { mediaUrl: string; filename: string; caption: string } | null {
    const on =
      process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === 'true' ||
      process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === '1';
    if (!on || !params.invoiceShareUrl?.trim()) {
      return null;
    }
    const shortId = params.orderId.replace(/-/g, '').slice(0, 8);
    const filename =
      process.env.MOATMT_INVOICE_MEDIA_FILENAME?.trim() ||
      `invoice_${shortId}.png`;
    const caption =
      process.env.MOATMT_EDIT_MEDIA_CAPTION?.trim() ||
      process.env.MOATMT_MEDIA_CAPTION?.trim() ||
      'فاتورتك مرفقة 👇';
    return {
      mediaUrl: params.invoiceShareUrl,
      filename,
      caption,
    };
  }

  private buildMoatmtMediaCaptionForInvoice(params: {
    paymentUrl?: string;
  }): string {
    let c = process.env.MOATMT_MEDIA_CAPTION?.trim() || 'فاتورتك مرفقة 👇';
    if (params.paymentUrl) {
      c += `\n\n🔒 ${params.paymentUrl}`;
    }
    return c;
  }

  /**
   * Moatmt POST /api/send — `MOATMT_ACCESS_TOKEN` + `MOATMT_INSTANCE_ID` set.
   * `number` as string, e.g. `"965XXXXXXXX"`. `media` → type `media` + `media_url` + `filename`.
   */
  private async trySendMoatmt(
    rawPhone: string,
    textMessage: string,
    media: { mediaUrl: string; filename: string; caption: string } | null,
  ): Promise<boolean> {
    const accessToken = process.env.MOATMT_ACCESS_TOKEN?.trim();
    const instanceId = process.env.MOATMT_INSTANCE_ID?.trim();
    if (!accessToken || !instanceId) {
      return false;
    }
    const digits = parseKuwaitMobile965(rawPhone);
    if (!digits) {
      this.logger.warn(
        `Moatmt send skipped: invalid Kuwait mobile (…${rawPhone.slice(-4)})`,
      );
      return false;
    }
    const base = (
      process.env.MOATMT_API_BASE_URL?.trim() || 'https://moatmt.sa/api'
    ).replace(/\/$/, '');
    const url = `${base}/send`;
    const body = media
      ? {
          number: digits,
          type: 'media' as const,
          message: media.caption,
          media_url: media.mediaUrl,
          filename: media.filename,
          instance_id: instanceId,
          access_token: accessToken,
        }
      : {
          number: digits,
          type: 'text' as const,
          message: textMessage,
          instance_id: instanceId,
          access_token: accessToken,
        };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        this.logger.warn(
          `Moatmt POST /send ${res.status}: ${errText.slice(0, 200)}`,
        );
        return false;
      }
      this.logger.log(
        `Moatmt sent (${body.type}) to …${rawPhone.slice(-4)}`,
      );
      return true;
    } catch (e) {
      this.logger.warn(`Moatmt request failed: ${e}`);
      return false;
    }
  }
}
