import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PosPaymentMethod, Prisma } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordAlertService } from '../common/services/discord-alert.service';
import { IntegrationCircuitBreakerService } from '../common/services/integration-circuit-breaker.service';
import { WorkerDedupService } from '../common/services/worker-dedup.service';
import { resolveCustomerPhoneForNotify } from '../common/validation/kuwait-customer-phone';
import { runWithJobTraceAsync } from '../common/tracing/trace-context';
import {
  CustomerNotificationsService,
  PaymentConfirmedCustomerScenario,
  PaymentConfirmedVariant,
} from './customer-notifications.service';
import {
  WHATSAPP_ATTEMPTS,
  WHATSAPP_DLQ_QUEUE,
  WHATSAPP_QUEUE,
  WhatsAppJob,
  whatsappDlqOptions,
  whatsappRedisConnection,
} from './whatsapp.queue';

@Injectable()
export class WhatsAppWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppWorker.name);
  private worker: Worker<WhatsAppJob> | null = null;
  private dlq: Queue<
    WhatsAppJob & { error?: string; attempts?: number; lastFailureAt?: number }
  > | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly customerNotifications: CustomerNotificationsService,
    private readonly circuitBreaker: IntegrationCircuitBreakerService,
    private readonly dedup: WorkerDedupService,
    private readonly discordAlerts: DiscordAlertService,
  ) {}

  onModuleInit(): void {
    try {
      const connection = whatsappRedisConnection();
      if (!connection) {
        return;
      }
      this.dlq = new Queue<
        WhatsAppJob & { error?: string; attempts?: number; lastFailureAt?: number }
      >(
        WHATSAPP_DLQ_QUEUE,
        { connection },
      );
      this.worker = new Worker<WhatsAppJob>(
        WHATSAPP_QUEUE,
        (job) => this.process(job),
        {
          connection,
          concurrency: 3,
          limiter: { max: 5, duration: 1_000 },
          settings: {
            backoffStrategy: (_attemptsMade, _type, _err, job) => {
              const attempts = job?.attemptsMade ?? 0;
              return 1_000 * 2 ** attempts + Math.floor(Math.random() * 500);
            },
          },
        },
      );
      this.worker.on('completed', (job) =>
        this.logger.log(`whatsapp_job_success event=${job.data.event}`),
      );
      this.worker.on('failed', (job, error) => {
        if (!job || job.attemptsMade < WHATSAPP_ATTEMPTS) {
          return;
        }
        this.discordAlerts.enqueue('ops_retry_exhausted', {
          queue: 'whatsapp',
          jobId: String(job.id),
          sourceEvent: job.data.event,
          orderId: job.data.payload?.orderId,
          traceId: job.data.meta?.traceId,
          error: error?.message ?? 'unknown',
          timestamp: Date.now(),
        });
        this.logger.error('alert_permanent_failure queue=whatsapp');
        void this.dlq
          ?.add(
            'failed',
            {
              ...job.data,
              error: error?.message ?? 'unknown',
              attempts: job.attemptsMade,
              lastFailureAt: Date.now(),
            },
            whatsappDlqOptions(String(job.id ?? ''), job.data.payload?.orderId),
          )
          .catch(() => undefined);
      });
      this.worker.on('error', () => undefined);
    } catch {
      this.worker = null;
      this.dlq = null;
    }
  }

  onModuleDestroy(): void {
    void this.worker?.close().catch(() => undefined);
    void this.dlq?.close().catch(() => undefined);
    this.worker = null;
    this.dlq = null;
  }

  private async process(job: Job<WhatsAppJob>): Promise<void> {
    return runWithJobTraceAsync(job.data.meta?.traceId, 'worker.whatsapp.process', async () => {
      if (job.data.event !== 'payment_confirmed') {
        return;
      }
      const jid = String(job.id);
      const orderId = job.data.payload.orderId;
      if (
        !(await this.dedup.claimWorkerSideEffect(WHATSAPP_QUEUE, jid, {
          traceId: job.data.meta?.traceId,
          orderId,
        }))
      ) {
        return;
      }
      try {
        const params = await this.buildPaymentConfirmedParams(
          job.data.payload.orderId,
          job.data.payload.scenario,
        );
        if (!params) {
          return;
        }
        await this.waitForCircuitIntegration('whatsapp');
        const circuitState = await this.circuitBreaker.beforeRequest('whatsapp');
        if (circuitState === 'OPEN') {
          throw new Error('whatsapp_circuit_open');
        }
        await this.customerNotifications.deliverPaymentConfirmedQueued(params);
        await this.circuitBreaker.recordSuccess('whatsapp');
      } catch (error) {
        await this.dedup.releaseWorkerSideEffect(WHATSAPP_QUEUE, jid);
        await this.circuitBreaker.recordFailure('whatsapp');
        this.logger.warn(
          `whatsapp_failed reason=${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    });
  }

  private async waitForCircuitIntegration(name: 'whatsapp'): Promise<void> {
    const st = await this.circuitBreaker.state(name);
    if (st.state === 'OPEN' && st.openedUntil > Date.now()) {
      const extra = Math.min(30_000, st.openedUntil - Date.now() + 2_000);
      if (extra > 0) {
        await this.delay(extra);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  }

  private async buildPaymentConfirmedParams(
    orderId: string,
    scenario?: PaymentConfirmedCustomerScenario,
  ) {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        createdAt: true,
        serialNumber: true,
        invoiceNumber: true,
        totalPrice: true,
        posHostedPaymentUrl: true,
        posPaymentMethod: true,
        customer: {
          select: {
            phone: true,
            phone2: true,
            wallet: { select: { debt: true, balance: true } },
          },
        },
      },
    });
    if (!row) {
      return null;
    }
    const phone = resolveCustomerPhoneForNotify(
      row.customer.phone,
      row.customer.phone2,
    );
    if (!phone.trim()) {
      return null;
    }
    const orderLabel = row.serialNumber?.trim() || row.invoiceNumber?.trim();
    if (!orderLabel) {
      return null;
    }
    const base = (process.env.PUBLIC_WEB_APP_URL ?? '').replace(/\/$/, '').trim();
    const walletDebt = row.customer.wallet?.debt ?? new Prisma.Decimal(0);
    const walletBal = row.customer.wallet?.balance ?? new Prisma.Decimal(0);
    const variant = this.variantFor(row.posPaymentMethod);

    return {
      customerPhone: phone,
      orderId: row.id,
      amountKd: row.totalPrice.toFixed(3),
      orderLabel,
      paymentUrl: row.posHostedPaymentUrl?.trim() || undefined,
      ratingUrl: base ? `${base}/r/${encodeURIComponent(row.id)}` : undefined,
      customerScenario: scenario ?? this.inferPaymentScenarioFromOrderAge(row.createdAt),
      variant,
      walletDebtKd:
        variant === 'standard' && walletDebt.gt(0) ? walletDebt.toFixed(3) : undefined,
      remainingSubscriptionBalanceKd:
        variant === 'subscription_wallet' ? walletBal.toFixed(3) : undefined,
      totalDebtKd: variant === 'debt_on_account' ? walletDebt.toFixed(3) : undefined,
    };
  }

  private variantFor(method: PosPaymentMethod | null): PaymentConfirmedVariant {
    if (method === PosPaymentMethod.SUBSCRIPTION_WALLET) {
      return 'subscription_wallet';
    }
    if (method === PosPaymentMethod.DEBT_ON_ACCOUNT) {
      return 'debt_on_account';
    }
    return 'standard';
  }

  private inferPaymentScenarioFromOrderAge(
    createdAt: Date,
  ): PaymentConfirmedCustomerScenario {
    const ageMs = Date.now() - createdAt.getTime();
    return ageMs > 24 * 60 * 60 * 1_000 ? 'debt_receipt' : 'new_pos_order';
  }
}
