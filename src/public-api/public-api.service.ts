import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
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

  async getCustomerPortal(phone: string) {
    const normalized = phone.replace(/[\s-]/g, '').trim();
    const customer = await this.prisma.customer.findFirst({
      where: { OR: [{ phone: normalized }, { phone2: normalized }] },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer was not found.');
    }
    return this.getCustomerPortalByCustomerId(customer.id);
  }

  async getCustomerPortalByCustomerId(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        phone: true,
        displayName: true,
        address: true,
        deliveryAddresses: {
          orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
          select: {
            id: true,
            label: true,
            address: true,
            isDefault: true,
            updatedAt: true,
          },
        },
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
        addresses: customer.deliveryAddresses.map((address) => ({
          id: address.id,
          label: address.label,
          address: address.address,
          isDefault: address.isDefault,
          updatedAtIso: address.updatedAt.toISOString(),
        })),
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

  async updateCustomerProfileByCustomerId(
    customerId: string,
    dto: UpdateCustomerProfileDto,
  ) {
    const displayName = dto.displayName?.trim();
    const addresses = dto.addresses?.map((item, index) => ({
      id: item.id,
      label: item.label?.trim() || null,
      address: item.address.trim(),
      isDefault: item.isDefault === true || index === 0,
    })).filter((item) => item.address.length > 0);

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer was not found.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: {
          ...(displayName !== undefined ? { displayName: displayName || null } : {}),
          ...(addresses && addresses[0] ? { address: addresses[0].address } : {}),
        },
      });

      if (addresses) {
        await tx.customerDeliveryAddress.deleteMany({
          where: { customerId },
        });
        if (addresses.length > 0) {
          await tx.customerDeliveryAddress.createMany({
            data: addresses.map((item, index) => ({
              customerId,
              label: item.label,
              address: item.address,
              isDefault: index === 0 || item.isDefault,
            })),
          });
        }
      }
    });

    return this.getCustomerPortalByCustomerId(customerId);
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

  async registerEmployeePushToken(userId: string, token: string) {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new BadRequestException('Push token is required');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: trimmed },
      select: { id: true },
    });
    return {
      ok: true as const,
      registeredAt: new Date().toISOString(),
    };
  }

  async registerCustomerPushToken(phone: string, token: string) {
    const normalized = phone.replace(/[\s-]/g, '').trim();
    const trimmed = token.trim();
    if (!trimmed) {
      throw new BadRequestException('Push token is required');
    }

    const customer = await this.prisma.customer.findFirst({
      where: { OR: [{ phone: normalized }, { phone2: normalized }] },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer was not found.');
    }

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { expoPushToken: trimmed },
      select: { id: true },
    });

    return {
      ok: true as const,
      registeredAt: new Date().toISOString(),
    };
  }
}
