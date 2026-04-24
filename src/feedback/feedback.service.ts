import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';

/**
 * V19.22 — Customer feedback service.
 *
 * Two surfaces:
 *   1. Public (no auth): the customer scans the QR on the printed
 *      invoice, lands on `/r/:orderId`, and leaves a 1..5 star
 *      rating + optional note. `publicGetOrder` streams a trimmed
 *      payload (no phone, no address, no ledger) for the public
 *      page, and `submitFeedback` upserts the rating.
 *   2. Authenticated (Owner / GM / Call-Center + CC Supervisor):
 *      `listFeedback` returns paged ratings with the originating
 *      invoice's summary, and `acknowledge` marks a row as seen.
 *
 * Privacy model:
 *   - The public endpoint discloses invoice number + total + date
 *     + driver first name. Everything the customer already has on
 *     their paper receipt. No phone, no address, no status.
 *   - Client IP is stored verbatim server-side but is masked to a
 *     `/16` in admin responses (e.g. 41.234.*.*) so the dashboard
 *     gives abuse signal without exposing subscriber IPs.
 */
@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  /* ------------------------------ PUBLIC ------------------------------ */

  async publicGetOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        serialNumber: true,
        invoiceNumber: true,
        totalPrice: true,
        createdAt: true,
        status: true,
        driver: { select: { fullName: true } },
        customer: { select: { displayName: true } },
        feedback: {
          select: {
            rating: true,
            note: true,
            submittedAt: true,
          },
        },
      },
    });
    if (!order) {
      // Uniform 404 — never leak "exists but cancelled" vs "unknown".
      throw new NotFoundException('INVOICE_NOT_FOUND');
    }

    // Trim the driver's full name to the first token so the public
    // page can greet the customer with a friendly "سلّمك فلان" without
    // exposing the full surname on a link anyone with the QR can open.
    const driverFirst =
      order.driver?.fullName?.split(/\s+/u).filter(Boolean)[0] ?? null;
    const customerFirst =
      order.customer.displayName?.split(/\s+/u).filter(Boolean)[0] ?? null;

    return {
      orderId: order.id,
      serialNumber: order.serialNumber,
      invoiceNumber: order.invoiceNumber,
      totalKd: order.totalPrice.toString(),
      createdAt: order.createdAt.toISOString(),
      driverFirstName: driverFirst,
      customerFirstName: customerFirst,
      alreadyRated: order.feedback
        ? {
            rating: order.feedback.rating,
            note: order.feedback.note,
            submittedAt: order.feedback.submittedAt.toISOString(),
          }
        : null,
    };
  }

  async submitFeedback(
    orderId: string,
    dto: SubmitFeedbackDto,
    clientIp: string | null,
  ) {
    const exists = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('INVOICE_NOT_FOUND');
    }
    // Validator already bounded rating 1..5, but double-check defensively.
    if (dto.rating < 1 || dto.rating > 5) {
      throw new BadRequestException('RATING_OUT_OF_RANGE');
    }

    const note = dto.note?.trim() ? dto.note.trim() : null;

    const row = await this.prisma.orderFeedback.upsert({
      where: { orderId },
      create: {
        orderId,
        rating: dto.rating,
        note,
        submittedFrom: clientIp,
      },
      update: {
        rating: dto.rating,
        note,
        submittedFrom: clientIp,
        // Re-open as "unacknowledged" when the customer edits the rating,
        // so a post-complaint update re-surfaces on the Owner/GM dashboard.
        acknowledgedAt: null,
        acknowledgedBy: null,
      },
      select: {
        rating: true,
        note: true,
        submittedAt: true,
        updatedAt: true,
      },
    });

    return {
      ok: true,
      rating: row.rating,
      note: row.note,
      at: row.updatedAt.toISOString(),
    };
  }

  /* --------------------------- AUTHENTICATED -------------------------- */

  async listFeedback(opts: {
    onlyUnread?: boolean;
    minRating?: number;
    maxRating?: number;
    take?: number;
    skip?: number;
  }) {
    const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
    const skip = Math.max(opts.skip ?? 0, 0);

    const where: Record<string, unknown> = {};
    if (opts.onlyUnread) where.acknowledgedAt = null;
    if (opts.minRating != null || opts.maxRating != null) {
      where.rating = {
        ...(opts.minRating != null ? { gte: opts.minRating } : {}),
        ...(opts.maxRating != null ? { lte: opts.maxRating } : {}),
      };
    }

    const [rows, total, unread, avgAgg] = await Promise.all([
      this.prisma.orderFeedback.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          rating: true,
          note: true,
          submittedAt: true,
          submittedFrom: true,
          acknowledgedAt: true,
          acknowledgedBy: true,
          order: {
            select: {
              id: true,
              serialNumber: true,
              invoiceNumber: true,
              totalPrice: true,
              createdAt: true,
              status: true,
              driver: {
                select: { id: true, fullName: true, username: true },
              },
              customer: {
                select: { id: true, displayName: true, phone: true },
              },
            },
          },
        },
      }),
      this.prisma.orderFeedback.count({ where }),
      this.prisma.orderFeedback.count({ where: { acknowledgedAt: null } }),
      this.prisma.orderFeedback.aggregate({
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

    return {
      total,
      unread,
      avgRating: avgAgg._avg.rating ?? 0,
      ratedCount: avgAgg._count.rating ?? 0,
      rows: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        note: r.note,
        submittedAt: r.submittedAt.toISOString(),
        ipMasked: maskIp(r.submittedFrom),
        acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
        order: {
          id: r.order.id,
          serialNumber: r.order.serialNumber,
          invoiceNumber: r.order.invoiceNumber,
          totalKd: r.order.totalPrice.toString(),
          createdAt: r.order.createdAt.toISOString(),
          status: r.order.status,
          driver: r.order.driver
            ? {
                id: r.order.driver.id,
                fullName: r.order.driver.fullName,
                username: r.order.driver.username,
              }
            : null,
          customer: {
            id: r.order.customer.id,
            displayName: r.order.customer.displayName,
            phone: r.order.customer.phone,
          },
        },
      })),
    };
  }

  async acknowledge(id: string, userId: string) {
    const existing = await this.prisma.orderFeedback.findUnique({
      where: { id },
      select: { id: true, acknowledgedAt: true },
    });
    if (!existing) throw new NotFoundException('FEEDBACK_NOT_FOUND');
    if (existing.acknowledgedAt) {
      return { ok: true, alreadyAcknowledged: true };
    }
    await this.prisma.orderFeedback.update({
      where: { id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedBy: userId,
      },
    });
    return { ok: true, alreadyAcknowledged: false };
  }
}

/**
 * Mask an IP to `/16` for IPv4 (a.b.*.*) or `/32` for IPv6 (prefix only).
 * Keeps enough signal to cluster repeat offenders without leaking the
 * full subscriber address to the dashboard.
 */
function maskIp(raw: string | null): string | null {
  if (!raw) return null;
  const ip = raw.trim();
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return `${parts.slice(0, 2).join(':')}:*`;
  }
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.*.*`;
}
