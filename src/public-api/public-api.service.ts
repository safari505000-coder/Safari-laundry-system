import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, SafariRole } from '@prisma/client';
import { InvoicePaymentStatusService } from '../finance/invoice-payment-status.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { PUBLIC_COMPANY_BRAND } from './public-branding';
import { WebsiteOrderRequestsService } from './website-order-requests.service';

function kd(value: Prisma.Decimal | null | undefined): string | null {
  return value == null ? null : value.toFixed(4);
}

@Injectable()
export class PublicApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly websiteRequests: WebsiteOrderRequestsService,
    private readonly invoicePaymentStatus: InvoicePaymentStatusService,
  ) {}

  async getCatalog() {
    const services = await this.prisma.laundryPriceListItem.findMany({
      where: { isActive: true },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      include: { category: { select: { nameAr: true } } },
    });

    return {
      brand: PUBLIC_COMPANY_BRAND,
      services: services.map((item) => ({
        id: item.id,
        code: item.code,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        category: item.category?.nameAr ?? null,
        priceNormalKd: item.priceNormal.toFixed(4),
        priceExpressKd: item.priceUrgent.toFixed(4),
        pricePressOnlyKd: kd(item.pricePressOnly),
        manualEntry: item.manualEntry,
      })),
    };
  }

  async createPublicOrderRequest(dto: CreatePublicOrderDto) {
    const request = await this.websiteRequests.createFromPublicRequest(dto);

    return {
      requestId: request.publicReference,
      requestReference: request.publicReference,
      status: 'RECEIVED' as const,
      message:
        'تم استلام طلبك في مركز الاتصال. سيتواصل معك فريق سفاري لتأكيد الأصناف والوقت قبل إصدار الفاتورة.',
    };
  }

  async requestCustomerOtp(phone: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { OR: [{ phone }, { phone2: phone }] },
      select: { id: true },
    });
    return {
      status: 'OTP_PENDING' as const,
      customerExists: Boolean(customer),
      message:
        'تم تسجيل طلب الدخول. يتم تفعيل مزود OTP في مرحلة الإشعارات قبل الإطلاق.',
    };
  }

  async getCustomerPortal(phone: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { OR: [{ phone }, { phone2: phone }] },
      select: {
        id: true,
        phone: true,
        displayName: true,
        address: true,
        wallet: {
          select: {
            balance: true,
            debt: true,
            subscriptionPlanName: true,
            subscriptionExpiresAt: true,
          },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            status: true,
            cashStatus: true,
            posPaymentMethod: true,
            invoiceNumber: true,
            serialNumber: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer was not found.');
    }

    const paymentRows = await Promise.all(
      customer.orders.map((row) =>
        this.invoicePaymentStatus.derivePaymentStatus(row.id),
      ),
    );
    const paymentByOrderId = new Map(
      paymentRows.map((row) => [row.orderId, row]),
    );

    return {
      customer: {
        id: customer.id,
        phone: customer.phone,
        displayName: customer.displayName,
        address: customer.address,
      },
      financials: {
        walletBalanceKd: customer.wallet?.balance.toFixed(4) ?? '0.0000',
        walletDebtKd: customer.wallet?.debt.toFixed(4) ?? '0.0000',
        subscriptionPlanName: customer.wallet?.subscriptionPlanName ?? null,
        subscriptionExpiresAtIso:
          customer.wallet?.subscriptionExpiresAt?.toISOString() ?? null,
      },
      recentOrders: customer.orders.map((order) => {
        const payment = paymentByOrderId.get(order.id)!;
        return {
          id: order.id,
          status: order.status,
          cashStatus: order.cashStatus,
          posPaymentMethod: order.posPaymentMethod,
          totalAmountKd: payment.totalAmountKd,
          paidAmountKd: payment.paidAmountKd,
          remainingAmountKd: payment.remainingAmountKd,
          paymentStatus: payment.status,
          invoiceNumber: order.invoiceNumber,
          serialNumber: order.serialNumber,
          createdAtIso: order.createdAt.toISOString(),
          completedAtIso: order.completedAt?.toISOString() ?? null,
        };
      }),
    };
  }

  async getEmployeeTasks(userId: string, role: SafariRole) {
    const where =
      role === SafariRole.DRIVER
        ? { driverId: userId, status: { not: OrderStatus.COMPLETED } }
        : { status: { not: OrderStatus.COMPLETED } };

    const tasks = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        status: true,
        totalPrice: true,
        posPaymentMethod: true,
        createdAt: true,
        customer: {
          select: {
            displayName: true,
            phone: true,
            address: true,
          },
        },
      },
    });

    return {
      role:
        role === SafariRole.DRIVER
          ? ('DRIVER' as const)
          : role === SafariRole.CALL_CENTER
            ? ('CALL_CENTER' as const)
            : ('MANAGER' as const),
      tasks: tasks.map((task) => ({
        id: task.id,
        status: task.status,
        customerName: task.customer.displayName ?? task.customer.phone,
        customerPhone: task.customer.phone,
        address: task.customer.address,
        totalPriceKd: task.totalPrice.toFixed(4),
        paymentMethod: task.posPaymentMethod,
        createdAtIso: task.createdAt.toISOString(),
      })),
    };
  }

  paymentUnavailable(orderId: string) {
    return {
      orderId,
      paymentUrl: null,
      status: 'UNAVAILABLE' as const,
      message:
        'إنشاء رابط الدفع العام يحتاج ربط بوابة الدفع النهائية. لا يتم احتساب أي مبلغ في الواجهة.',
    };
  }
}
