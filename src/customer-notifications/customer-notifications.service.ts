import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BRAND_CUSTOMER_AR } from '../common/constants/branding';
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

function publicWebAppBaseTrimmed(): string {
  return (process.env.PUBLIC_WEB_APP_URL ?? '').replace(/\/$/, '').trim();
}

/**
 * Same shape as payment-thank-you: `/r/:orderId` on the public web app.
 */
function buildPublicCustomerRatingUrl(orderId: string): string | undefined {
  const base = publicWebAppBaseTrimmed();
  const id = orderId?.trim();
  if (!base || !id) {
    return undefined;
  }
  return `${base}/r/${encodeURIComponent(id)}`;
}

function appendRatingSectionToLines(lines: string[], ratingUrl?: string): void {
  const u = ratingUrl?.trim();
  if (!u) {
    return;
  }
  lines.push('');
  lines.push('⭐ نسعد بتقييمك:');
  lines.push(u);
}

/** Append rating block when missing (e.g. CC-built payment text). */
function appendRatingToCustomerMessageBody(
  body: string,
  orderId: string,
): string {
  const ratingUrl = buildPublicCustomerRatingUrl(orderId);
  if (!ratingUrl) {
    return body;
  }
  const trimmed = body.trimEnd();
  if (trimmed.includes(ratingUrl)) {
    return body;
  }
  return `${trimmed}\n\n⭐ نسعد بتقييمك:\n${ratingUrl}`;
}

function isMoatmtInvoiceMediaEnabled(): boolean {
  const v = process.env.MOATMT_USE_INVOICE_MEDIA?.trim().toLowerCase() ?? '';
  return v === 'true' || v === '1';
}

/**
 * V19.27.4 — When media is off (`MOATMT_USE_INVOICE_MEDIA=0` / unset) and
 * `MOATMT_INVOICE_MINIMAL_TEXT` is not forced to 0, send a short text (invoice
 * #, total, payment link only). If media is on, the long template remains the
 * default text body (media is a separate request).
 */
function useInvoiceIssuedMessageMinimalText(): boolean {
  const o = process.env.MOATMT_INVOICE_MINIMAL_TEXT?.trim().toLowerCase() ?? '';
  if (o === '0' || o === 'false' || o === 'no' || o === 'off') {
    return false;
  }
  if (o === '1' || o === 'true' || o === 'yes' || o === 'on') {
    return true;
  }
  return !isMoatmtInvoiceMediaEnabled();
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
 * Moatmt: `access_token` + `instance_id` + `number` in the POST URL (query) and in the JSON
 * body. Field name for the phone in JSON must be `number` only (965XXXXXXXX, no +).
 */
function moatmtUrlWithAuthQuery(
  pathUrl: string,
  accessToken: string,
  instanceId: string,
  e164NoPlus: string,
): string {
  const u = new URL(pathUrl);
  u.searchParams.set('access_token', accessToken);
  u.searchParams.set('instance_id', instanceId);
  u.searchParams.set('number', e164NoPlus);
  return u.toString();
}

/** At least the destination in the query (e.g. when auth params are only in the body). */
function moatmtUrlWithNumberQuery(pathUrl: string, e164NoPlus: string): string {
  const u = new URL(pathUrl);
  u.searchParams.set('number', e164NoPlus);
  return u.toString();
}

function redactMoatmtUrlForLog(u: string): string {
  try {
    const url = new URL(u);
    if (url.searchParams.has('access_token')) {
      url.searchParams.set('access_token', '***');
    }
    if (url.searchParams.has('instance_id')) {
      const id = url.searchParams.get('instance_id') ?? '';
      url.searchParams.set(
        'instance_id',
        id.length <= 6 ? '***' : `${id.slice(0, 2)}…${id.slice(-2)}(len${id.length})`,
      );
    }
    if (url.searchParams.has('number')) {
      const n = url.searchParams.get('number') ?? '';
      url.searchParams.set('number', mask965ForLog(n));
    }
    return url.toString();
  } catch {
    return u;
  }
}

/**
 * Log-safe copy of the JSON body: never print full `access_token` or full `instance_id`.
 */

function redactMoatmtPayloadForLog(
  body: Record<string, string>,
): string {
  const o: Record<string, string> = { ...body };
  if (o.number) {
    o.number = mask965ForLog(o.number);
  }
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
  /**
   * V19.27 — `GET {PUBLIC_API_URL}/api/public/invoice/pdf/:token` — binary PDF
   * for Moatmt `type: media` (direct fetch). Requires `PUBLIC_API_URL` or
   * `PAYMENTS_CALLBACK_PUBLIC_URL`.
   */
  invoicePdfUrl?: string;
  /** Multi-invoice bundle: one message, several receipt links. */
  invoiceShareItems?: Array<{ label: string; url: string }>;
  /**
   * V19.27.5 — Pre-formatted "الأصناف" block for POS WhatsApp; when set, default
   * message is the classic text (greeting + items + total + payment) with **no**
   * public share/PDF lines and **no** media file from this payload.
   */
  lineItemsSummary?: string;
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
  /** V19.27 — direct PDF for Moatmt media. */
  invoicePdfUrl?: string;
};

/**
 * After the customer’s payment is fully settled (gateway link or call-center
 * "تم الدفع") — short thank-you + public `/r/:orderId` rating page.
 */
export type PaymentConfirmedNotifyParams = {
  customerPhone: string;
  orderId: string;
  orderLabel: string;
  amountKd: string;
  /** Host UPayments / hosted checkout URL stored on the order when a link was used. */
  paymentUrl?: string;
  /** `${PUBLIC_WEB_APP_URL}/r/:orderId` when `PUBLIC_WEB_APP_URL` is set. */
  ratingUrl?: string;
  /**
   * Outstanding wallet debt after this settlement (3dp KWD), if any — shown
   * so the customer sees remaining receivables on their account.
   */
  walletDebtKd?: string;
};

/**
 * After the driver marks the delivered order COMPLETED and cash/KNET was
 * still UNPAID — separate from gateway `payment_confirmed` / link flows.
 */
export type DriverCollectionConfirmedNotifyParams = {
  customerPhone: string;
  orderId: string;
  /** Invoice total, 3dp KWD string (e.g. "12.500"). */
  amountKd: string;
  /** e.g. "الكاش" | "الكي نت" */
  paymentMethodLabelAr: string;
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
  ratingUrl?: string;
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

  appendRatingSectionToLines(lines, params.ratingUrl);
  lines.push('');
  lines.push(`فريق ${BRAND_CUSTOMER_AR} 🇰🇼`);
  return lines.join('\n');
}

/** V19.27.4 — Text-only mode: invoice #, 3dp total KWD, optional UPayments link. */
function buildInvoiceIssuedMessageMinimal(params: {
  invoiceLabel: string;
  amountKd: string;
  paymentUrl?: string;
  ratingUrl?: string;
}): string {
  const lines: string[] = [];
  lines.push(`🏷️ رقم الفاتورة: ${params.invoiceLabel}`);
  lines.push(`💰 الإجمالي: ${params.amountKd} د.ك`);
  if (params.paymentUrl) {
    lines.push('');
    lines.push('🔒 رابط الدفع:');
    lines.push(params.paymentUrl);
  }
  appendRatingSectionToLines(lines, params.ratingUrl);
  return lines.join('\n');
}

/**
 * V19.27.5 — Like the earlier full WhatsApp: greeting + فاتورة + أصناف + إجمالي +
 * دفع. No /public/invoice link and no media attachment from server (those fields
 * are omitted in `deliver` params from POS).
 */
function buildInvoiceIssuedMessageWithLineItemsNoFile(params: {
  invoiceLabel: string;
  amountKd: string;
  lineItemsBlock: string;
  paymentUrl?: string;
  ratingUrl?: string;
}): string {
  const lines: string[] = [];
  lines.push('حياك الله! 🌿');
  lines.push('');
  lines.push(`نسعد بخدمتكم في ${BRAND_CUSTOMER_AR}.`);
  lines.push('');
  lines.push(`🏷️ رقم الفاتورة: ${params.invoiceLabel}`);
  lines.push(`💰 *الإجمالي: ${params.amountKd} د.ك*`);
  if (params.lineItemsBlock.trim().length > 0) {
    lines.push('');
    lines.push('🧺 الأصناف:');
    lines.push(params.lineItemsBlock);
  }
  lines.push('');
  lines.push(
    'ملابسكم في أيدٍ أمينة، وسنعتني بها بأفضل صورة — شكراً لثقتكم بنا.',
  );
  if (params.paymentUrl) {
    lines.push('');
    lines.push('🔒 رابط الدفع:');
    lines.push(params.paymentUrl);
  }
  appendRatingSectionToLines(lines, params.ratingUrl);
  lines.push('');
  lines.push(`فريق ${BRAND_CUSTOMER_AR} 🇰🇼`);
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
  lines.push(`فريق ${BRAND_CUSTOMER_AR} 🇰🇼`);
  return lines.join('\n');
}

function buildDriverCollectionConfirmedMessage(params: {
  amountKd: string;
  paymentMethodLabelAr: string;
  ratingUrl?: string;
}): string {
  const lines: string[] = [];
  lines.push('عميلنا العزيز،');
  lines.push('');
  lines.push(
    `نود إبلاغكم بأنه تم استلام مبلغ ${params.amountKd} د.ك من قبل السائق، وذلك عبر (${params.paymentMethodLabelAr}).`,
  );
  lines.push('');
  lines.push(
    'يرجى تأكيد صحة هذه المعلومة لضمان الشفافية ومتابعة أداء السائق.',
  );
  lines.push('');
  lines.push('شاكرين تعاونكم معنا');
  appendRatingSectionToLines(lines, params.ratingUrl);
  lines.push('');
  lines.push(`فريق ${BRAND_CUSTOMER_AR} 🇰🇼`);
  return lines.join('\n');
}

function buildPaymentConfirmedMessage(params: {
  amountKd: string;
  orderLabel: string;
  paymentUrl?: string;
  ratingUrl?: string;
  /** 3dp KWD; line omitted when absent or non-positive. */
  walletDebtKd?: string;
}): string {
  const lines: string[] = [];
  lines.push('تم تأكيد الدفع بنجاح ✅');
  lines.push('');
  lines.push('شكراً لك، تم استلام المبلغ.');
  lines.push('');
  lines.push(`📋 رقم الطلب: *${params.orderLabel}*`);
  lines.push(`💰 المبلغ الإجمالي: *${params.amountKd} د.ك*`);
  lines.push('');
  lines.push('ملابسك الآن نظيفة، معطرة، وجاهزة.');
  lines.push('');
  lines.push('يرجى تأكيد صحة البيانات لضمان دقة المتابعة.');
  const debt = Number.parseFloat(params.walletDebtKd ?? '');
  if (Number.isFinite(debt) && debt > 0) {
    lines.push('');
    lines.push(`📌 المديونية الحالية على حسابكم: *${params.walletDebtKd} د.ك*`);
  }
  lines.push('');
  lines.push(`${BRAND_CUSTOMER_AR} — جودة نهتم بها.`);
  if (params.paymentUrl) {
    lines.push('');
    lines.push('🔒 رابط الدفع:');
    lines.push(params.paymentUrl);
  }
  if (params.ratingUrl) {
    lines.push('');
    lines.push('⭐ نسعد بتقييمك:');
    lines.push(params.ratingUrl);
  }
  lines.push('');
  lines.push(`فريق ${BRAND_CUSTOMER_AR} 🇰🇼`);
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
      const media = isMoatmtInvoiceMediaEnabled();
      const minimal = useInvoiceIssuedMessageMinimalText();
      this.logger.log(
        `Customer notify: Moatmt enabled → POST ${base}/send | instance_id=${maskIdForLog(instanceId)} (len ${instanceId.length}) | access_token set (len ${accessToken.length}) | media: ${
          media ? 'on (PDF when URL present)' : 'off (type:text only)'
        } | invoice text: ${
          minimal ? 'minimal (رقم+إجمالي+رابط دفع)' : 'full / أصناف+دفع (POS: بلا مرفق ملف من السيرفر)'
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

  /**
   * After hosted-link payment or call-center payment confirmation.
   * Fire-and-forget — same delivery path as invoice text (Moatmt → webhook → log).
   */
  notifyPaymentConfirmed(params: PaymentConfirmedNotifyParams): void {
    setImmediate(() => {
      void this.deliverPaymentConfirmed(params).catch((e) =>
        this.logger.warn(`Payment confirmed notify failed: ${e}`),
      );
    });
  }

  /**
   * Driver closed the order as COMPLETED with cash or handheld KNET still
   * marked UNPAID — does not run for ONLINE / PAYMENT_LINK / gateway paths.
   */
  notifyDriverCollectionConfirmed(
    params: DriverCollectionConfirmedNotifyParams,
  ): void {
    setImmediate(() => {
      void this.deliverDriverCollectionConfirmed(params).catch((e) =>
        this.logger.warn(`Driver collection confirmed notify failed: ${e}`),
      );
    });
  }

  /**
   * Call Center collections — full Arabic payment-link text. Awaited so the
   * API can fall back to `wa.me` when Moatmt + webhook are absent.
   */
  async deliverCollectionsPaymentLinkNow(params: {
    customerPhone: string;
    orderId: string;
    message: string;
  }): Promise<boolean> {
    const messageOut = appendRatingToCustomerMessageBody(
      params.message,
      params.orderId,
    );
    const ratingUrl = buildPublicCustomerRatingUrl(params.orderId);
    if (await this.trySendMoatmt(params.customerPhone, messageOut, null)) {
      return true;
    }
    const webhook = process.env.CUSTOMER_NOTIFY_WEBHOOK_URL?.trim();
    if (webhook) {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: params.customerPhone,
          message: messageOut,
          orderId: params.orderId,
          template: 'collections_payment_link',
          ratingUrl: ratingUrl ?? null,
        }),
      });
      if (!res.ok) {
        this.logger.warn(
          `CUSTOMER_NOTIFY_WEBHOOK_URL returned ${res.status} (collections_payment_link)`,
        );
        return false;
      }
      return true;
    }
    this.logger.warn(
      `Collections payment-link WhatsApp not sent (check MOATMT_* and CUSTOMER_NOTIFY_WEBHOOK_URL). ` +
        `phone=${formatPhoneHintForLog(params.customerPhone)} orderId=${params.orderId}`,
    );
    return false;
  }

  private async deliver(params: InvoiceIssuedNotifyParams): Promise<void> {
    const base =
      (process.env.PUBLIC_WEB_APP_URL ?? '').replace(/\/$/, '') || '';
    const ratingUrl = buildPublicCustomerRatingUrl(params.orderId);
    const hasPublicShare =
      Boolean(params.invoiceShareUrl) ||
      (params.invoiceShareItems && params.invoiceShareItems.length > 0);
    const detailsLink =
      hasPublicShare || !base ?
        undefined
      : `${base}/orders?highlight=${encodeURIComponent(params.orderId)}`;

    const hasItemsBlock = Boolean(params.lineItemsSummary?.trim());
    const message = hasItemsBlock ?
        buildInvoiceIssuedMessageWithLineItemsNoFile({
          invoiceLabel: params.invoiceLabel,
          amountKd: params.amountKd,
          lineItemsBlock: params.lineItemsSummary!.trim(),
          paymentUrl: params.paymentUrl,
          ratingUrl,
        })
      : useInvoiceIssuedMessageMinimalText() ?
        buildInvoiceIssuedMessageMinimal({
          invoiceLabel: params.invoiceLabel,
          amountKd: params.amountKd,
          paymentUrl: params.paymentUrl,
          ratingUrl,
        })
      : buildInvoiceIssuedMessage({
          invoiceLabel: params.invoiceLabel,
          amountKd: params.amountKd,
          paymentUrl: params.paymentUrl,
          invoiceShareUrl: params.invoiceShareUrl,
          invoiceShareItems: params.invoiceShareItems,
          detailsLink,
          ratingUrl,
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
          invoicePdfUrl: params.invoicePdfUrl ?? null,
          ratingUrl: ratingUrl ?? null,
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

  private async deliverPaymentConfirmed(
    params: PaymentConfirmedNotifyParams,
  ): Promise<void> {
    const message = buildPaymentConfirmedMessage({
      amountKd: params.amountKd,
      orderLabel: params.orderLabel,
      paymentUrl: params.paymentUrl,
      ratingUrl: params.ratingUrl,
      walletDebtKd: params.walletDebtKd,
    });
    if (
      await this.trySendMoatmt(
        params.customerPhone,
        message,
        null,
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
          template: 'payment_confirmed',
          paymentUrl: params.paymentUrl ?? null,
          ratingUrl: params.ratingUrl ?? null,
          walletDebtKd: params.walletDebtKd ?? null,
        }),
      });
      if (!res.ok) {
        this.logger.warn(
          `CUSTOMER_NOTIFY_WEBHOOK_URL returned ${res.status} (payment_confirmed)`,
        );
      }
      return;
    }
    this.logger.warn(
      `Payment-confirmed WhatsApp not sent (check MOATMT_* and CUSTOMER_NOTIFY_WEBHOOK_URL). ` +
        `phone=${formatPhoneHintForLog(params.customerPhone)} orderId=${params.orderId} preview=${message.slice(0, 100)}…`,
    );
  }

  private async deliverDriverCollectionConfirmed(
    params: DriverCollectionConfirmedNotifyParams,
  ): Promise<void> {
    const ratingUrl = buildPublicCustomerRatingUrl(params.orderId);
    const message = buildDriverCollectionConfirmedMessage({
      amountKd: params.amountKd,
      paymentMethodLabelAr: params.paymentMethodLabelAr,
      ratingUrl,
    });
    if (await this.trySendMoatmt(params.customerPhone, message, null)) {
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
          template: 'driver_collection_confirmed',
          amountKd: params.amountKd,
          paymentMethodLabelAr: params.paymentMethodLabelAr,
          ratingUrl: ratingUrl ?? null,
        }),
      });
      if (!res.ok) {
        this.logger.warn(
          `CUSTOMER_NOTIFY_WEBHOOK_URL returned ${res.status} (driver_collection_confirmed)`,
        );
      }
      return;
    }
    this.logger.warn(
      `Driver-collection WhatsApp not sent (check MOATMT_* and CUSTOMER_NOTIFY_WEBHOOK_URL). ` +
        `phone=${formatPhoneHintForLog(params.customerPhone)} orderId=${params.orderId} preview=${message.slice(0, 100)}…`,
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
    if (!isMoatmtInvoiceMediaEnabled()) {
      return null;
    }
    const mediaUrl =
      params.invoicePdfUrl?.trim() ||
      params.invoiceShareUrl?.trim() ||
      params.invoiceShareItems?.[0]?.url?.trim() ||
      null;
    if (!mediaUrl) {
      return null;
    }
    const shortId = params.orderId.replace(/-/g, '').slice(0, 8);
    const isPdf = Boolean(params.invoicePdfUrl?.trim());
    const filename =
      process.env.MOATMT_INVOICE_MEDIA_FILENAME?.trim() ||
      (isPdf || /\.pdf($|[?#])/i.test(mediaUrl) ?
        `invoice_${shortId}.pdf`
      : `invoice_${shortId}.png`);
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
    const mediaUrl = params.invoicePdfUrl?.trim() || params.invoiceShareUrl?.trim() || '';
    if (!isMoatmtInvoiceMediaEnabled() || !mediaUrl) {
      return null;
    }
    const shortId = params.orderId.replace(/-/g, '').slice(0, 8);
    const isPdf = Boolean(params.invoicePdfUrl?.trim());
    const filename =
      process.env.MOATMT_INVOICE_MEDIA_FILENAME?.trim() ||
      (isPdf || /\.pdf($|[?#])/i.test(mediaUrl) ?
        `invoice_${shortId}.pdf`
      : `invoice_${shortId}.png`);
    const caption =
      process.env.MOATMT_EDIT_MEDIA_CAPTION?.trim() ||
      process.env.MOATMT_MEDIA_CAPTION?.trim() ||
      'فاتورتك مرفقة 👇';
    return {
      mediaUrl,
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
    const omitQuery =
      process.env.MOATMT_OMIT_QUERY_AUTH?.trim() === '1' ||
      process.env.MOATMT_OMIT_QUERY_AUTH?.trim() === 'true';
    const finalUrl = omitQuery
      ? moatmtUrlWithNumberQuery(url, body.number)
      : moatmtUrlWithAuthQuery(
          url,
          body.access_token,
          body.instance_id,
          body.number,
        );
    this.logger.log(
      `[Moatmt] request → ${kind} | url=${redactMoatmtUrlForLog(finalUrl)} | to=${mask965ForLog(String(to965))} | ` +
        `body=${redactMoatmtPayloadForLog(body)}`,
    );
    type MoatmtResult = Awaited<
      ReturnType<CustomerNotificationsService['moatmpFetch']>
    >;
    const attempts: Array<{
      label: string;
      run: () => Promise<MoatmtResult>;
    }> = [
      {
        // Moatmt: snake_case in JSON, Content-Type application/json, token in body + often in query.
        label: 'json (query+body, Content-Type only)',
        run: () =>
          this.moatmpFetch(finalUrl, body, { encoding: 'json-moatmt' }),
      },
      {
        label: 'json (query+body) + Authorization: Bearer',
        run: () => this.moatmpFetch(finalUrl, body, { encoding: 'json' }),
      },
    ];
    if (process.env.MOATMT_FORCE_FORM?.trim() === '1') {
      attempts.length = 0;
      attempts.push({
        label: 'form (MOATMT_FORCE_FORM=1)',
        run: () => this.moatmpFetch(finalUrl, body, { encoding: 'form' }),
      });
    } else {
      attempts.push(
        {
          label: 'form-urlencoded (query+body)',
          run: () => this.moatmpFetch(finalUrl, body, { encoding: 'form' }),
        },
        {
          label: 'form-urlencoded+Bearer',
          run: () => this.moatmpFetch(finalUrl, body, { encoding: 'form-bearer' }),
        },
        {
          label: 'json body + number in query only (no token in URL)',
          run: () =>
            this.moatmpFetch(
              moatmtUrlWithNumberQuery(url, body.number),
              body,
              { encoding: 'json-moatmt' },
            ),
        },
      );
    }
    for (let i = 0; i < attempts.length; i++) {
      const step = attempts[i]!;
      const r = await step.run();
      this.logger.log(
        `[Moatmt] try "${step.label}" → http ${r.status} | to=${mask965ForLog(String(to965))} | raw=${truncateForMoatmtLog(r.text, 2000)}`,
      );
      if (r.exn) {
        this.logger.warn(
          `[Moatmt] [${step.label}] ${r.exn}`,
        );
        continue;
      }
      if (!r.ok) {
        this.logger.warn(
          `[Moatmt] HTTP [${step.label}]: status=${r.status} body_start=${r.text.slice(0, 500)}`,
        );
        if (r.status >= 500) {
          return false;
        }
        continue;
      }
      if (this.moatmpResponseLooksLikeError(r.text)) {
        // Only try form / other encodings when the gateway ignored auth (common: JSON not parsed by PHP).
        if (
          this.moatmpLooksLikeMissingTokenError(r.text) &&
          i < attempts.length - 1
        ) {
          this.logger.warn(
            `[Moatmt] auth/body not accepted on [${step.label}] — trying next encoding…`,
          );
          continue;
        }
        this.logger.warn(
          `[Moatmt] error in body [${step.label}]: ${r.text.slice(0, 800)}`,
        );
        return false;
      }
      this.logger.log(
        `[Moatmt] send ok [${step.label}] to=${mask965ForLog(String(to965))}`,
      );
      return true;
    }
    return false;
  }

  private moatmpLooksLikeMissingTokenError(responseText: string): boolean {
    return /access token is required|token is required|invalid\s+access/i.test(
      responseText,
    );
  }

  private async moatmpFetch(
    url: string,
    body: Record<string, string>,
    opts: {
      encoding: 'json' | 'form' | 'form-bearer' | 'json-moatmt';
    },
  ): Promise<{ ok: boolean; status: number; text: string; exn?: string }> {
    const accessToken = body.access_token ?? '';
    let headers: Record<string, string> = {};
    let reqBody: string;
    if (opts.encoding === 'json-moatmt') {
      // Moatmt: only this header for JSON; keys in body are snake_case (access_token, instance_id, …).
      headers = { 'Content-Type': 'application/json' };
      reqBody = JSON.stringify(body);
    } else if (opts.encoding === 'json') {
      headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      };
      reqBody = JSON.stringify(body);
    } else if (opts.encoding === 'form') {
      headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        p.set(k, v);
      }
      reqBody = p.toString();
    } else {
      headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${accessToken}`,
      };
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        p.set(k, v);
      }
      reqBody = p.toString();
    }
    try {
      const res = await fetch(url, { method: 'POST', headers, body: reqBody });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text };
    } catch (e) {
      return {
        ok: false,
        status: 0,
        text: '',
        exn: String(e),
      };
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
