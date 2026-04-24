import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  BRAND_CUSTOMER_AR,
  BRAND_SYSTEM_AR,
} from '../common/constants/branding';
import { parseKuwaitMobile965 } from '../common/validation/kuwait-customer-phone';

const MOATMT_LOG_MAX_BODY = 3000;
const MOATMT_LOG_MAX_MESSAGE = 400;

function mask965ForLog(digits: string): string {
  if (!digits || digits.length < 4) {
    return '(empty)';
  }
  if (digits.length <= 7) {
    return `${digits.slice(0, 2)}****`;
  }
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

function maskIdForLog(s: string): string {
  if (!s) {
    return '(empty)';
  }
  if (s.length <= 6) {
    return '****';
  }
  return `${s.slice(0, 2)}…${s.slice(-3)}(len${s.length})`;
}

function formatPhoneHintForLog(raw: string): string {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!t) {
    return '(empty)';
  }
  return `len=${t.length} last4=…${t.replace(/\D/g, '').slice(-4) || '????'}`;
}

function truncateForMoatmtLog(s: string, max = MOATMT_LOG_MAX_BODY): string {
  const t = s.trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max)}…(truncated ${t.length}→${max})`;
}

/**
 * Moatmt env value must be the token only. Users sometimes paste `TOKEN=abc` from docs.
 */
function normalizeMoatmtAccessToken(raw: string | undefined): string {
  const t = (raw ?? '').trim();
  if (!t) {
    return '';
  }
  return t.replace(/^TOKEN\s*=\s*/i, '').trim();
}

/**
 * Log-safe copy of the JSON body: never print full `access_token` or full `instance_id`.
 */
function redactMoatmtPayloadForLog(
  body: Record<string, string>,
): string {
  const o: Record<string, string> = { ...body };
  if (o.access_token) {
    const x = o.access_token;
    o.access_token =
      x.length <= 8 ? '***' : `${x.slice(0, 4)}…${x.slice(-2)}(len${x.length})`;
  }
  if (o.instance_id) {
    o.instance_id = maskIdForLog(o.instance_id);
  }
  if (o.message && o.message.length > MOATMT_LOG_MAX_MESSAGE) {
    o.message = `${o.message.slice(0, MOATMT_LOG_MAX_MESSAGE)}…(len${o.message.length})`;
  }
  if (o.media_url && o.media_url.length > 120) {
    o.media_url = `${o.media_url.slice(0, 100)}…(len${o.media_url.length})`;
  }
  return JSON.stringify(o);
}

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
  /** One-time: Moatmt env not set. */
  private static moatmtCredsMissingLogged = false;
  private static moatmtShortTokenWarned = false;

  onModuleInit(): void {
    const accessToken = normalizeMoatmtAccessToken(process.env.MOATMT_ACCESS_TOKEN);
    const instanceId = process.env.MOATMT_INSTANCE_ID?.trim() ?? '';
    const hasMoatmt = Boolean(accessToken) && Boolean(instanceId);
    const hasHook = Boolean(process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim());
    if (hasMoatmt) {
      const base = (
        process.env.MOATMT_API_BASE_URL?.trim() || 'https://moatmt.sa/api'
      ).replace(/\/$/, '');
      const media =
        process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === 'true' ||
        process.env.MOATMT_USE_INVOICE_MEDIA?.trim() === '1';
      this.logger.log(
        `Customer notify: Moatmt enabled → POST ${base}/send | instance_id=${maskIdForLog(instanceId)} (len ${instanceId.length}) | access_token set (len ${accessToken.length}) | mode: ${
          media ? 'text+media when share URL is present' : 'text only'
        }; on failure: CUSTOMER_NOTIFY_WEBHOOK_URL if set.`,
      );
      if (accessToken.length < 24) {
        this.logger.warn(
          `Moatmt: MOATMT_ACCESS_TOKEN is only ${accessToken.length} chars — the panel usually issues a *long* token. ` +
            'If the API says "Access token is required", paste the full API token from moatmt.sa (not a short instance/session id).',
        );
      }
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

    this.logger.warn(
      `Invoice WhatsApp not sent to customer (check MOATMT_* and CUSTOMER_NOTIFY_WEBHOOK_URL on the server). ` +
        `phone=${formatPhoneHintForLog(params.customerPhone)} orderId=${params.orderId} text_preview=${message.slice(0, 120)}…`,
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

    this.logger.warn(
      `Issuer WhatsApp not delivered: phone=${formatPhoneHintForLog(params.toPhone)} orderId=${params.orderId} (set MOATMT_* or STAFF_INVOICE_NOTIFY_WEBHOOK_URL / CUSTOMER_NOTIFY_WEBHOOK_URL). preview=${message.slice(0, 100)}…`,
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
   * `number` as string, e.g. `"965XXXXXXXX"`. Optional `media` first; on failure
   * we **fall back to text** (share URLs are often HTML, not a fetchable file).
   */
  private async trySendMoatmt(
    rawPhone: string,
    textMessage: string,
    media: { mediaUrl: string; filename: string; caption: string } | null,
  ): Promise<boolean> {
    const accessToken = normalizeMoatmtAccessToken(process.env.MOATMT_ACCESS_TOKEN);
    const instanceId = process.env.MOATMT_INSTANCE_ID?.trim();
    if (!accessToken || !instanceId) {
      if (!CustomerNotificationsService.moatmtCredsMissingLogged) {
        CustomerNotificationsService.moatmtCredsMissingLogged = true;
        this.logger.warn(
          'Moatmt: MOATMT_INSTANCE_ID and/or MOATMT_ACCESS_TOKEN is empty — no WhatsApp API calls (set both in host env, redeploy).',
        );
      }
      return false;
    }
    if (
      accessToken.length < 24 &&
      !CustomerNotificationsService.moatmtShortTokenWarned
    ) {
      CustomerNotificationsService.moatmtShortTokenWarned = true;
      this.logger.warn(
        `Moatmt: access token length is ${accessToken.length} (expected a long value from the Moatmt dashboard). API may return "Access token is required".`,
      );
    }
    const digits = parseKuwaitMobile965(rawPhone);
    if (!digits) {
      this.logger.warn(
        `Moatmt send skipped: invalid Kuwait mobile. raw=${formatPhoneHintForLog(rawPhone)}. ` +
          'Expected: 8 digits (5/6/9…), or +965/965/00965 + 8 digits. Example: 51234567 or 96551234567.',
      );
      return false;
    }
    const base = (
      process.env.MOATMT_API_BASE_URL?.trim() || 'https://moatmt.sa/api'
    ).replace(/\/$/, '');
    const url = `${base}/send`;

    if (media) {
      const mediaBody = {
        number: digits,
        type: 'media' as const,
        message: media.caption,
        media_url: media.mediaUrl,
        filename: media.filename,
        instance_id: instanceId,
        access_token: accessToken,
      };
      if (await this.moatmpPostOne(url, mediaBody, 'media')) {
        return true;
      }
      this.logger.warn(
        'Moatmt: media send failed; falling back to type=text (full invoice message).',
      );
    }

    const textBody = {
      number: digits,
      type: 'text' as const,
      message: textMessage,
      instance_id: instanceId,
      access_token: accessToken,
    };
    return this.moatmpPostOne(url, textBody, 'text');
  }

  private async moatmpPostOne(
    url: string,
    body: Record<string, string>,
    kind: 'text' | 'media',
  ): Promise<boolean> {
    const to965 = body.number;
    this.logger.log(
      `[Moatmt] request → ${kind} | url=${url} | to=${mask965ForLog(String(to965))} | ` +
        `body=${redactMoatmtPayloadForLog(body)}`,
    );
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Some Moatmt deployments read auth from Authorization; body is kept for compatibility.
          Authorization: `Bearer ${body.access_token}`,
        },
        body: JSON.stringify(body),
      });
      const responseText = await res.text();
      const snippet = truncateForMoatmtLog(responseText, 3000);
      this.logger.log(
        `[Moatmt] response ← http ${res.status} [${kind}] | to=${mask965ForLog(String(to965))} | ` +
          `raw=${snippet}`,
      );
      if (!res.ok) {
        this.logger.warn(
          `[Moatmt] HTTP error [${kind}]: status=${res.status} body_start=${responseText.slice(0, 500)}`,
        );
        return false;
      }
      if (this.moatmpResponseLooksLikeError(responseText)) {
        this.logger.warn(
          `[Moatmt] success:false or error in JSON [${kind}]: body_start=${responseText.slice(0, 800)}`,
        );
        return false;
      }
      this.logger.log(
        `[Moatmt] send accepted [${kind}] to=${mask965ForLog(String(to965))} (see response raw above).`,
      );
      return true;
    } catch (e) {
      this.logger.warn(
        `[Moatmt] network/exception [${kind}] to=${mask965ForLog(String(to965))}: ${e}`,
      );
      return false;
    }
  }

  /**
   * Some providers return HTTP 200 with { error } or success: false in JSON.
   */
  private moatmpResponseLooksLikeError(responseText: string): boolean {
    const t = responseText.trim();
    if (!t) {
      return false;
    }
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      if (j.error != null) {
        return true;
      }
      if (j.success === false) {
        return true;
      }
      if (typeof j.status === 'string' && /fail|error/i.test(j.status)) {
        return true;
      }
    } catch {
      /* not JSON or partial */
    }
    const lower = t.toLowerCase();
    return /"error"\s*:|success\s*:\s*false|فشل|invalid/i.test(lower);
  }
}
