import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PromiseToPayStatus, SafariRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type JwtUser,
} from '../../auth/decorators/current-user.decorator';
import { PromisesToPayService } from './promises.service';

const COLLECTOR_ROLES = new Set<string>([
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
  SafariRole.CALL_CENTER,
  SafariRole.CALL_CENTER_SUPERVISOR,
]);

const READ_ROLES = new Set<string>([
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
  SafariRole.CALL_CENTER,
  SafariRole.CALL_CENTER_SUPERVISOR,
]);

type CreatePromiseBody = {
  customerId: string;
  invoiceId?: string | null;
  promisedAmount: string | number;
  promisedDate: string;
  notes?: string | null;
  idempotencyKey?: string | null;
};

type ResolveBody = { notes?: string | null };

@Controller('collections/promises')
@UseGuards(JwtAuthGuard)
export class PromisesToPayController {
  constructor(private readonly svc: PromisesToPayService) {}

  /**
   * GET /api/collections/promises?customerId=&status=&collectorId=
   * Lists promises filtered by any combination of the three fields.
   * Restricted to the same collector roles that can create promises
   * + the supervisory roles.
   */
  @Get()
  async list(
    @CurrentUser() user: JwtUser,
    @Query('customerId') customerId?: string,
    @Query('collectorId') collectorId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertRead(user);
    return this.svc.list({
      customerId: customerId?.trim() || undefined,
      collectorId: collectorId?.trim() || undefined,
      status: this.parseStatus(status),
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * POST /api/collections/promises
   * body: { customerId, invoiceId?, promisedAmount, promisedDate, notes?, idempotencyKey? }
   */
  @Post()
  async create(
    @CurrentUser() user: JwtUser,
    @Body() body: CreatePromiseBody,
  ) {
    this.assertCollector(user);
    if (!body || !body.customerId) {
      throw new BadRequestException('customerId is required');
    }
    const promisedDate = new Date(body.promisedDate);
    if (Number.isNaN(promisedDate.getTime())) {
      throw new BadRequestException('promisedDate must be ISO-8601');
    }
    return this.svc.create({
      customerId: body.customerId,
      invoiceId: body.invoiceId ?? null,
      promisedAmount: body.promisedAmount,
      promisedDate,
      collectorId: user.userId,
      notes: body.notes ?? null,
      idempotencyKey: body.idempotencyKey ?? null,
    });
  }

  @Post(':id/kept')
  async kept(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ResolveBody,
  ) {
    this.assertCollector(user);
    return this.svc.markKept({
      promiseId: id,
      actorId: user.userId,
      notes: body?.notes ?? null,
    });
  }

  @Post(':id/cancelled')
  async cancelled(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ResolveBody,
  ) {
    this.assertCollector(user);
    return this.svc.markCancelled({
      promiseId: id,
      actorId: user.userId,
      notes: body?.notes ?? null,
    });
  }

  private parseStatus(raw?: string): PromiseToPayStatus | undefined {
    if (!raw) return undefined;
    const upper = raw.trim().toUpperCase();
    if (
      upper === PromiseToPayStatus.ACTIVE ||
      upper === PromiseToPayStatus.KEPT ||
      upper === PromiseToPayStatus.BROKEN ||
      upper === PromiseToPayStatus.CANCELLED
    ) {
      return upper as PromiseToPayStatus;
    }
    throw new BadRequestException(`Unknown status: ${raw}`);
  }

  private assertCollector(user: JwtUser): void {
    const role = (user.role ?? '').trim().toUpperCase();
    if (!COLLECTOR_ROLES.has(role)) {
      throw new ForbiddenException(
        'Only collectors can create / resolve Promises-to-Pay',
      );
    }
  }

  private assertRead(user: JwtUser): void {
    const role = (user.role ?? '').trim().toUpperCase();
    if (!READ_ROLES.has(role)) {
      throw new ForbiddenException('Promises listing not permitted for this role');
    }
  }
}
