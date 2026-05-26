import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole, WebsiteOrderRequestStatus } from '@prisma/client';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';
import { Public, Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { RequestCustomerOtpDto } from './dto/request-customer-otp.dto';
import { UpdateWebsiteOrderRequestStatusDto } from './dto/website-order-request-status.dto';
import { PublicApiService } from './public-api.service';
import { WebsiteOrderRequestsService } from './website-order-requests.service';

@ApiTags('public-api')
@Controller('public')
@UseGuards(JwtAuthGuard)
export class PublicApiController {
  constructor(
    private readonly publicApi: PublicApiService,
    private readonly websiteRequests: WebsiteOrderRequestsService,
  ) {}

  @Public('Company website must list public services without a staff session.')
  @Get('catalog')
  @ApiOperation({ summary: 'Customer-facing service catalog and prices' })
  catalog() {
    return this.publicApi.getCatalog();
  }

  @Public('Visitors can submit pickup/order requests before an account exists.')
  @Post('orders/request')
  @ApiOperation({ summary: 'Receive a public website order request' })
  createOrderRequest(@Body() dto: CreatePublicOrderDto) {
    return this.publicApi.createPublicOrderRequest(dto);
  }

  @Public('Customer portal OTP bootstrap endpoint.')
  @Post('customer-auth/request-otp')
  @ApiOperation({ summary: 'Request customer portal OTP' })
  requestOtp(@Body() dto: RequestCustomerOtpDto) {
    return this.publicApi.requestCustomerOtp(dto.phone);
  }

  @Public('Temporary read-only customer portal preview until OTP provider is enabled.')
  @Get('customer-portal')
  @ApiOperation({ summary: 'Read-only customer portal preview by phone' })
  customerPortal(@Query('phone') phone: string) {
    return this.publicApi.getCustomerPortal((phone ?? '').replace(/[\s-]/g, ''));
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

  @Get('call-center/website-order-requests')
  @UseGuards(RolesGuard)
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
