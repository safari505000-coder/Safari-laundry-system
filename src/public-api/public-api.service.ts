import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CashStatus,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { InvoicePaymentStatusService } from '../finance/invoice-payment-status.service';
import { DebtVisibilityService } from '../finance/debt-visibility/debt-visibility.service';
import { PrismaService } from '../prisma/prisma.service';
import { listPayableOrdersForCustomer } from './customer-portal-payable.util';
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
    private readonly debtVisibility: DebtVisibilityService,
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
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer was not found.');
    }

    const visibleDebt = await this.debtVisibility.getCustomerVisibleDebt(
      customer.id,
    );
    const payableOrders = await listPayableOrdersForCustomer(
      this.prisma,
      this.invoicePaymentStatus,
      customer.id,
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
        walletDebtKd: visibleDebt.remainingDebtKd,
        subscriptionPlanName: customer.wallet?.subscriptionPlanName ?? null,
        subscriptionExpiresAtIso:
          customer.wallet?.subscriptionExpiresAt?.toISOString() ?? null,
      },
      recentOrders: payableOrders,
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
