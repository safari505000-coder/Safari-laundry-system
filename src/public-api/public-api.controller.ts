import { Body, Controller, Get, Param, Patch, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole, WebsiteOrderRequestStatus } from '@prisma/client';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';
import { Public, Roles, NoOwnerBypass } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { CreateCustomerBalancePaymentLinkDto } from './dto/create-customer-balance-payment-link.dto';
import { CreateCustomerPaymentLinkDto } from './dto/create-customer-payment-link.dto';
import { RequestCustomerOtpDto } from './dto/request-customer-otp.dto';
import { VerifyCustomerOtpDto } from './dto/verify-customer-otp.dto';
import { CustomerPortalAuthService } from './customer-portal-auth.service';
import { RegisterCustomerPushTokenDto } from './dto/register-customer-push-token.dto';
import { RegisterEmployeePushTokenDto } from './dto/register-employee-push-token.dto';
import { UpdateWebsiteOrderRequestStatusDto } from './dto/website-order-request-status.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { PublicApiService } from './public-api.service';
import { WebsiteCustomerPaymentsService } from './website-customer-payments.service';
import { WebsiteOrderRequestsService } from './website-order-requests.service';

@ApiTags('public-api')
@Controller('public')
@UseGuards(JwtAuthGuard)
export class PublicApiController {
  constructor(
    private readonly publicApi: PublicApiService,
    private readonly websiteRequests: WebsiteOrderRequestsService,
    private readonly websitePayments: WebsiteCustomerPaymentsService,
    private readonly customerPortalAuth: CustomerPortalAuthService,
  ) {}

  @Public('Company website must list public services without a staff session.')
  @Get('catalog')
  @ApiOperation({ summary: 'Customer-facing service catalog and prices' })
  catalog() {
    return this.publicApi.getCatalog();
  }

  @Public('Visitors can submit pickup/order requests before an account exists.')
  @Post('orders/request')
  @Throttle({
    default: {
      ttl: 60_000,
      limit:
        Number.parseInt(process.env.PUBLIC_ORDER_REQUEST_THROTTLE_PER_MIN ?? '', 10) ||
        20,
    },
  })
  @ApiOperation({ summary: 'Receive a public website order request' })
  createOrderRequest(@Body() dto: CreatePublicOrderDto) {
    return this.publicApi.createPublicOrderRequest(dto);
  }

  @Public('Customers can track website order requests by phone until OTP auth ships.')
  @Get('orders/requests')
  @Throttle({
    default: {
      ttl: 60_000,
      limit:
        Number.parseInt(process.env.PUBLIC_PORTAL_LOOKUP_THROTTLE_PER_MIN ?? '', 10) ||
        10,
    },
  })
  @ApiOperation({ summary: 'List website order requests for a customer phone' })
  customerOrderRequests(@Query('phone') phone: string) {
    return this.websiteRequests.listByCustomerPhone(
      (phone ?? '').replace(/[\s-]/g, ''),
    );
  }

  @Public('Alias used by mobile clients to avoid route collisions with /public/orders/:id.')
  @Get('customer-order-requests')
  @Throttle({
    default: {
      ttl: 60_000,
      limit:
        Number.parseInt(process.env.PUBLIC_PORTAL_LOOKUP_THROTTLE_PER_MIN ?? '', 10) ||
        10,
    },
  })
  @ApiOperation({ summary: 'List website order requests for a customer phone' })
  customerOrderRequestsAlias(@Query('phone') phone: string) {
    return this.websiteRequests.listByCustomerPhone(
      (phone ?? '').replace(/[\s-]/g, ''),
    );
  }

  @Public('Customer portal OTP bootstrap endpoint.')
  @Post('customer-auth/request-otp')
  @Throttle({
    default: {
      ttl: 60_000,
      limit:
        Number.parseInt(process.env.PUBLIC_OTP_THROTTLE_PER_MIN ?? '', 10) || 5,
    },
  })
  @ApiOperation({ summary: 'Request customer portal OTP' })
  requestOtp(@Body() dto: RequestCustomerOtpDto) {
    return this.customerPortalAuth.requestOtp(dto.phone);
  }

  @Public('Customer portal OTP verification issues a short-lived CUSTOMER JWT.')
  @Post('customer-auth/verify-otp')
  @Throttle({
    default: {
      ttl: 60_000,
      limit:
        Number.parseInt(process.env.PUBLIC_OTP_THROTTLE_PER_MIN ?? '', 10) || 10,
    },
  })
  @ApiOperation({ summary: 'Verify customer portal OTP' })
  verifyOtp(@Body() dto: VerifyCustomerOtpDto) {
    return this.customerPortalAuth.verifyOtp(dto.phone, dto.code);
  }

  @Public('Temporary read-only customer portal preview (disabled in production by default).')
  @Get('customer-portal')
  @Throttle({
    default: {
      ttl: 60_000,
      limit:
        Number.parseInt(process.env.PUBLIC_PORTAL_LOOKUP_THROTTLE_PER_MIN ?? '', 10) ||
        10,
    },
  })
  @ApiOperation({ summary: 'Read-only customer portal preview by phone' })
  customerPortal(@Query('phone') phone: string) {
    if (!CustomerPortalAuthService.phonePreviewEnabled()) {
      throw new UnauthorizedException(
        'Phone preview is disabled — use OTP login and GET /public/customer-portal/me.',
      );
    }
    return this.publicApi.getCustomerPortal((phone ?? '').replace(/[\s-]/g, ''));
  }

  @Get('customer-portal/me')
  @UseGuards(RolesGuard)
  @Roles(SafariRole.CUSTOMER)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Authenticated customer portal for OTP session' })
  customerPortalMe(@CurrentUser() user: JwtUser) {
    const customerId = user.linkedCustomerId?.trim();
    if (!customerId || user.role !== SafariRole.CUSTOMER) {
      throw new UnauthorizedException('Customer session is required.');
    }
    return this.publicApi.getCustomerPortalByCustomerId(customerId);
  }

  @Patch('customer/profile')
  @UseGuards(RolesGuard)
  @Roles(SafariRole.CUSTOMER)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update authenticated customer profile and addresses' })
  updateCustomerProfile(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateCustomerProfileDto,
  ) {
    const customerId = user.linkedCustomerId?.trim();
    if (!customerId || user.role !== SafariRole.CUSTOMER) {
      throw new UnauthorizedException('Customer session is required.');
    }
    return this.publicApi.updateCustomerProfileByCustomerId(customerId, dto);
  }

  @Public('Customer initiates hosted payment for an owned unpaid invoice.')
  @Post('customer-portal/payment-link')
  @Throttle({
    default: {
      ttl: 60_000,
      limit:
        Number.parseInt(process.env.PUBLIC_PAYMENT_THROTTLE_PER_MIN ?? '', 10) ||
        30,
    },
  })
  @ApiOperation({ summary: 'Create UPayments link for customer-owned invoice' })
  createCustomerPaymentLink(@Body() dto: CreateCustomerPaymentLinkDto) {
    return this.websitePayments.createPaymentLinkFromWebsite(
      dto.customerPhone,
      dto.orderId,
    );
  }

  @Public('Customer initiates hosted payment for their oldest open invoice.')
  @Post('customer-portal/pay-balance')
  @Throttle({
    default: {
      ttl: 60_000,
      limit:
        Number.parseInt(process.env.PUBLIC_PAYMENT_THROTTLE_PER_MIN ?? '', 10) ||
        30,
    },
  })
  @ApiOperation({ summary: 'Create UPayments link for customer open balance' })
  createCustomerBalancePaymentLink(
    @Body() dto: CreateCustomerBalancePaymentLinkDto,
  ) {
    return this.websitePayments.createPaymentLinkForCustomerBalance(
      dto.customerPhone,
    );
  }

  @Get('employee/tasks')
  @UseGuards(RolesGuard)
  @Roles(
    SafariRole.DRIVER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.MANAGER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.OWNER,
  )
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Mobile employee task feed' })
  employeeTasks(@CurrentUser() user: JwtUser) {
    return this.publicApi.getEmployeeTasks(user.userId, user.role as SafariRole);
  }

  @Post('employee/push-token')
  @UseGuards(RolesGuard)
  @Roles(
    SafariRole.DRIVER,
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.MANAGER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.OWNER,
  )
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Register Expo push token for staff mobile' })
  registerEmployeePushToken(
    @CurrentUser() user: JwtUser,
    @Body() dto: RegisterEmployeePushTokenDto,
  ) {
    return this.publicApi.registerEmployeePushToken(user.userId, dto.token);
  }

  @Public('Customer mobile push registration until OTP session is enforced.')
  @Post('customer/push-token')
  @Throttle({
    default: {
      ttl: 60_000,
      limit:
        Number.parseInt(process.env.PUBLIC_PORTAL_LOOKUP_THROTTLE_PER_MIN ?? '', 10) ||
        10,
    },
  })
  @ApiOperation({ summary: 'Register Expo push token for customer mobile' })
  registerCustomerPushToken(@Body() dto: RegisterCustomerPushTokenDto) {
    return this.publicApi.registerCustomerPushToken(
      dto.customerPhone,
      dto.token,
    );
  }

  @Get('call-center/website-order-requests')
  @UseGuards(RolesGuard)
  @NoOwnerBypass()
  @Roles(SafariRole.CALL_CENTER, SafariRole.CALL_CENTER_SUPERVISOR)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Call-center website order intake queue' })
  websiteOrderRequests(@Query('status') status?: string) {
    return this.websiteRequests.listForCallCenter(
      status && status in WebsiteOrderRequestStatus
        ? WebsiteOrderRequestStatus[status as keyof typeof WebsiteOrderRequestStatus]
        : undefined,
    );
  }

  @Post('call-center/website-order-requests/:id/status')
  @UseGuards(RolesGuard)
  @NoOwnerBypass()
  @Roles(SafariRole.CALL_CENTER, SafariRole.CALL_CENTER_SUPERVISOR)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update website order request review status' })
  updateWebsiteOrderRequestStatus(
    @Param('id') id: string,
    @Body() dto: UpdateWebsiteOrderRequestStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.websiteRequests.updateStatus(id, dto.status, user.userId);
  }

  @Get('call-center/website-payments')
  @UseGuards(RolesGuard)
  @NoOwnerBypass()
  @Roles(SafariRole.CALL_CENTER, SafariRole.CALL_CENTER_SUPERVISOR)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Website-initiated customer payment queue' })
  websiteCustomerPayments(@Query('status') status?: string) {
    const filter =
      status === 'PAID' || status === 'ALL' ? status : ('PENDING' as const);
    return this.websitePayments.listForCallCenter(filter);
  }

  @Post('payments/:orderId/intent')
  @UseGuards(RolesGuard)
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.MANAGER,
    SafariRole.GENERAL_MANAGER,
    SafariRole.OWNER,
  )
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Payment intent placeholder for public/mobile channels',
    description:
      'No frontend money calculation is performed here. Final payment creation must call the existing finance/payment flow.',
  })
  paymentIntent(@Param('orderId') orderId: string) {
    return this.publicApi.paymentUnavailable(orderId);
  }
}
