import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'node:stream';
import { PrismaService } from '../prisma/prisma.service';
import { buildPublicInvoicePdfUrl } from './invoice-pdf.util';
import { orderDetailSelect } from './order-selects';
import type { OrderDetail } from './order-types';
import { normalizePublicInvoiceTokenParam } from './public-invoice-token.util';

@Injectable()
export class OrderPublicInvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * V19.25 — Mint public share + optional PDF for Moatmt. V19.27.1 — If
   * `PUBLIC_WEB_APP_URL` is missing but `PUBLIC_API_URL` (or payment callback
   * base) is set, we still mint JWT so `invoicePdfUrl` can be sent; web receipt
   * link is omitted in that case.
   */
  async resolveInvoiceShareForNotify(
    orderId: string,
  ): Promise<{ shareUrl?: string; pdfUrl?: string } | undefined> {
    const webBase = process.env.PUBLIC_WEB_APP_URL?.trim().replace(/\/$/, '');
    const apiBase = (
      process.env.PUBLIC_API_URL?.trim() ||
      process.env.PAYMENTS_CALLBACK_PUBLIC_URL?.trim() ||
      ''
    ).replace(/\/$/, '');
    if (!webBase && !apiBase) {
      return undefined;
    }
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!row) {
      return undefined;
    }
    const mintBase = webBase || apiBase;
    const minted = await this.mintInvoiceShareLink(orderId, mintBase);
    return {
      shareUrl: webBase ? minted.shareUrl : undefined,
      pdfUrl: minted.pdfUrl,
    };
  }

  /**
   * V19.24 — Mint a 7-day signed URL for the same POS receipt HTML the
   * staff print view uses. Customer opens `/public/invoice/:token` from
   * WhatsApp and saves as PDF locally (wa.me cannot attach binary PDFs).
   */
  async mintInvoiceShareLink(
    orderId: string,
    publicBaseUrl: string,
  ): Promise<{
    token: string;
    shareUrl: string;
    pdfUrl?: string;
    expiresAtIso: string;
  }> {
    const exists = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Order not found');
    }
    const token = await this.jwt.signAsync(
      { purpose: 'INVOICE_SHARE' as const, orderId },
      { expiresIn: '7d' },
    );
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const base = publicBaseUrl.replace(/\/$/, '');
    return {
      token,
      shareUrl: `${base}/public/invoice/${encodeURIComponent(token)}`,
      pdfUrl: buildPublicInvoicePdfUrl(token),
      expiresAtIso: expiresAt.toISOString(),
    };
  }

  /**
   * V19.27 — Stream a simple A4 PDF (English labels; numbers match order totals).
   * Moatmt and other clients fetch this URL as `application/pdf` without SPA auth.
   */
  async getPublicInvoicePdfStream(token: string): Promise<{
    stream: PassThrough;
    filename: string;
  }> {
    const normalized = normalizePublicInvoiceTokenParam(token);
    const order = await this.getOrderForPublicInvoiceToken(normalized);
    const inv =
      order.invoiceNumber?.trim() ||
      order.serialNumber?.trim() ||
      order.id.slice(0, 8);
    const safe = inv.replace(/[^\w\u0600-\u06FF-]+/g, '_');
    const filename = `invoice-${safe}.pdf`;
    const stream = new PassThrough();
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: { Title: `Invoice ${inv}` },
    });
    doc.on('error', (err) => stream.destroy(err));
    doc.pipe(stream);
    doc.fillColor('#0f766e').fontSize(16).text('Safari Omni — Invoice', {
      align: 'center',
    });
    doc.moveDown(0.4);
    doc.fillColor('#0f172a').fontSize(10).text(`Serial: ${inv}`);
    doc.text(
      `Date: ${order.createdAt.toLocaleString('en-GB', { timeZone: 'Asia/Kuwait' })}`,
    );
    // V1.7.3 — The raw UUID was leaking to customer-facing PDFs (see
    // Owner directive). The serial above is sufficient; the Prisma id
    // stays server-side. If an operator needs it they can pull it from
    // the back-office, never from a customer receipt.
    doc.text(`Total: ${order.totalPrice.toFixed(3)} KWD`);
    if (order.customer?.phone) {
      doc.text(`Phone: ${order.customer.phone}`);
    }
    if (order.driver?.fullName) {
      doc.text(`Driver: ${order.driver.fullName}`);
    }
    // V1.7.3 — Paid-online stamp mirrors the React thermal template so
    // that the Moatmt WhatsApp-attached copy (and any direct `/pdf?token=`
    // fetch) also reflects the real settlement state.
    if (order.cashStatus === 'PAID_ONLINE') {
      doc.moveDown(0.3);
      doc
        .fillColor('#065f46')
        .fontSize(11)
        .text('PAID ONLINE  /  تم الدفع أونلاين', { align: 'center' });
      doc.fillColor('#0f172a');
    // allow-legacy-debt-reader (public invoice PDF stamp mirrors legacy receipt state only; not a collections/debt openness query)
    } else if (order.cashStatus === 'UNPAID' && order.status !== 'CANCELED') {
      doc.moveDown(0.3);
      doc
        .fillColor('#92400e')
        .fontSize(10)
        .text('UNPAID / الفاتورة لم تُسدَّد بعد', { align: 'center' });
      doc.fillColor('#0f172a');
    }
    doc.moveDown(0.4);
    doc
      .fillColor('#0f172a')
      .fontSize(9)
      .text('Line items', { underline: true });
    const lines = [...order.lineItems].sort((a, b) => a.id.localeCompare(b.id));
    for (const li of lines) {
      const unit = Number(li.unitPrice);
      const qty = Number(li.quantity);
      const sub = (unit * qty).toFixed(3);
      const label = (li.label ?? 'Item').replace(/\s+/g, ' ');
      doc.text(
        `• ${label}  x${String(qty)}  @${unit.toFixed(3)} KWD  =  ${sub} KWD`,
        { width: 515 },
      );
    }
    doc.end();
    return { stream, filename };
  }

  /**
   * يفك رمز مشاركة الفاتورة العامة ويعيد بيانات الفاتورة إذا كان التوقيع والغرض صالحين.
   * Verifies a public invoice share token and returns order details when the signature and purpose are valid.
   * @param token - رمز المشاركة الموقع / Signed public invoice token
   * @returns تفاصيل الفاتورة العامة / Public invoice order details
   */
  async getOrderForPublicInvoiceToken(token: string): Promise<OrderDetail> {
    const normalized = normalizePublicInvoiceTokenParam(token);
    let payload: { purpose?: string; orderId?: string };
    try {
      payload = await this.jwt.verifyAsync(normalized);
    } catch (e: unknown) {
      const name =
        e && typeof e === 'object' && 'name' in e ?
          String((e as { name: string }).name)
        : '';
      if (name === 'TokenExpiredError') {
        throw new NotFoundException('رابط الفاتورة منتهي الصلاحية');
      }
      if (name === 'JsonWebTokenError' || name === 'NotBeforeError') {
        throw new NotFoundException(
          'رابط الفاتورة غير صالح — انسخ التوكن كاملاً، أو راجع تطابق JWT_SECRET بين البيئات',
        );
      }
      throw new NotFoundException(
        'رابط الفاتورة غير صالح أو منتهي الصلاحية',
      );
    }
    if (payload.purpose !== 'INVOICE_SHARE' || !payload.orderId) {
      throw new NotFoundException('رابط الفاتورة غير صالح');
    }
    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      select: orderDetailSelect,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }
}
