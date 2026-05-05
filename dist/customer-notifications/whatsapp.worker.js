"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var WhatsAppWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppWorker = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const bullmq_1 = require("bullmq");
const prisma_service_1 = require("../prisma/prisma.service");
const discord_alert_service_1 = require("../common/services/discord-alert.service");
const integration_circuit_breaker_service_1 = require("../common/services/integration-circuit-breaker.service");
const worker_dedup_service_1 = require("../common/services/worker-dedup.service");
const kuwait_customer_phone_1 = require("../common/validation/kuwait-customer-phone");
const trace_context_1 = require("../common/tracing/trace-context");
const customer_notifications_service_1 = require("./customer-notifications.service");
const whatsapp_queue_1 = require("./whatsapp.queue");
let WhatsAppWorker = WhatsAppWorker_1 = class WhatsAppWorker {
    prisma;
    customerNotifications;
    circuitBreaker;
    dedup;
    discordAlerts;
    logger = new common_1.Logger(WhatsAppWorker_1.name);
    worker = null;
    dlq = null;
    constructor(prisma, customerNotifications, circuitBreaker, dedup, discordAlerts) {
        this.prisma = prisma;
        this.customerNotifications = customerNotifications;
        this.circuitBreaker = circuitBreaker;
        this.dedup = dedup;
        this.discordAlerts = discordAlerts;
    }
    onModuleInit() {
        try {
            const connection = (0, whatsapp_queue_1.whatsappRedisConnection)();
            if (!connection) {
                return;
            }
            this.dlq = new bullmq_1.Queue(whatsapp_queue_1.WHATSAPP_DLQ_QUEUE, { connection });
            this.worker = new bullmq_1.Worker(whatsapp_queue_1.WHATSAPP_QUEUE, (job) => this.process(job), {
                connection,
                concurrency: 3,
                limiter: { max: 5, duration: 1_000 },
                settings: {
                    backoffStrategy: (_attemptsMade, _type, _err, job) => {
                        const attempts = job?.attemptsMade ?? 0;
                        return 1_000 * 2 ** attempts + Math.floor(Math.random() * 500);
                    },
                },
            });
            this.worker.on('completed', (job) => this.logger.log(`whatsapp_job_success event=${job.data.event}`));
            this.worker.on('failed', (job, error) => {
                if (!job || job.attemptsMade < whatsapp_queue_1.WHATSAPP_ATTEMPTS) {
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
                    ?.add('failed', {
                    ...job.data,
                    error: error?.message ?? 'unknown',
                    attempts: job.attemptsMade,
                    lastFailureAt: Date.now(),
                }, (0, whatsapp_queue_1.whatsappDlqOptions)(String(job.id ?? ''), job.data.payload?.orderId))
                    .catch(() => undefined);
            });
            this.worker.on('error', () => undefined);
        }
        catch {
            this.worker = null;
            this.dlq = null;
        }
    }
    onModuleDestroy() {
        void this.worker?.close().catch(() => undefined);
        void this.dlq?.close().catch(() => undefined);
        this.worker = null;
        this.dlq = null;
    }
    async process(job) {
        return (0, trace_context_1.runWithJobTraceAsync)(job.data.meta?.traceId, 'worker.whatsapp.process', async () => {
            if (job.data.event !== 'payment_confirmed') {
                return;
            }
            const jid = String(job.id);
            const orderId = job.data.payload.orderId;
            if (!(await this.dedup.claimWorkerSideEffect(whatsapp_queue_1.WHATSAPP_QUEUE, jid, {
                traceId: job.data.meta?.traceId,
                orderId,
            }))) {
                return;
            }
            try {
                const params = await this.buildPaymentConfirmedParams(job.data.payload.orderId, job.data.payload.scenario);
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
            }
            catch (error) {
                await this.dedup.releaseWorkerSideEffect(whatsapp_queue_1.WHATSAPP_QUEUE, jid);
                await this.circuitBreaker.recordFailure('whatsapp');
                this.logger.warn(`whatsapp_failed reason=${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        });
    }
    async waitForCircuitIntegration(name) {
        const st = await this.circuitBreaker.state(name);
        if (st.state === 'OPEN' && st.openedUntil > Date.now()) {
            const extra = Math.min(30_000, st.openedUntil - Date.now() + 2_000);
            if (extra > 0) {
                await this.delay(extra);
            }
        }
    }
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
    }
    async buildPaymentConfirmedParams(orderId, scenario) {
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
        const phone = (0, kuwait_customer_phone_1.resolveCustomerPhoneForNotify)(row.customer.phone, row.customer.phone2);
        if (!phone.trim()) {
            return null;
        }
        const orderLabel = row.serialNumber?.trim() || row.invoiceNumber?.trim();
        if (!orderLabel) {
            return null;
        }
        const base = (process.env.PUBLIC_WEB_APP_URL ?? '').replace(/\/$/, '').trim();
        const walletDebt = row.customer.wallet?.debt ?? new client_1.Prisma.Decimal(0);
        const walletBal = row.customer.wallet?.balance ?? new client_1.Prisma.Decimal(0);
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
            walletDebtKd: variant === 'standard' && walletDebt.gt(0) ? walletDebt.toFixed(3) : undefined,
            remainingSubscriptionBalanceKd: variant === 'subscription_wallet' ? walletBal.toFixed(3) : undefined,
            totalDebtKd: variant === 'debt_on_account' ? walletDebt.toFixed(3) : undefined,
        };
    }
    variantFor(method) {
        if (method === client_1.PosPaymentMethod.SUBSCRIPTION_WALLET) {
            return 'subscription_wallet';
        }
        if (method === client_1.PosPaymentMethod.DEBT_ON_ACCOUNT) {
            return 'debt_on_account';
        }
        return 'standard';
    }
    inferPaymentScenarioFromOrderAge(createdAt) {
        const ageMs = Date.now() - createdAt.getTime();
        return ageMs > 24 * 60 * 60 * 1_000 ? 'debt_receipt' : 'new_pos_order';
    }
};
exports.WhatsAppWorker = WhatsAppWorker;
exports.WhatsAppWorker = WhatsAppWorker = WhatsAppWorker_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        customer_notifications_service_1.CustomerNotificationsService,
        integration_circuit_breaker_service_1.IntegrationCircuitBreakerService,
        worker_dedup_service_1.WorkerDedupService,
        discord_alert_service_1.DiscordAlertService])
], WhatsAppWorker);
//# sourceMappingURL=whatsapp.worker.js.map