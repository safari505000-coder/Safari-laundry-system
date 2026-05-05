import axios from 'axios';
import { bullmqStableJobIdFromPayload } from '../queue/bullmq-job-id.util';
import { DiscordAlertService } from './discord-alert.service';
import { DiscordAlertWorker } from './discord-alert.worker';

jest.mock('axios', () => ({
  post: jest.fn(),
}));

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    count: jest.fn().mockResolvedValue(0),
    add: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

const bullmq = jest.requireMock('bullmq') as {
  Queue: jest.Mock;
  Worker: jest.Mock;
};
const mockedAxios = axios as jest.Mocked<typeof axios>;
const circuitBreaker = {
  beforeRequest: jest.fn().mockResolvedValue('CLOSED'),
  recordSuccess: jest.fn().mockResolvedValue(undefined),
  recordFailure: jest.fn().mockResolvedValue('CLOSED'),
  state: jest.fn().mockResolvedValue({
    state: 'CLOSED',
    failures: 0,
    total: 0,
    windowStartedAt: 0,
    openedUntil: 0,
    openedAt: 0,
  }),
};

const dedup = {
  claimWorkerSideEffect: jest.fn().mockResolvedValue(true),
  releaseWorkerSideEffect: jest.fn().mockResolvedValue(undefined),
};

const discordAlerts = {
  enqueue: jest.fn(),
};

function workerDeps() {
  return [circuitBreaker, dedup, discordAlerts] as const;
}

const WEBHOOK_URL = 'https://discord.test/webhook';
const REDIS_URL = 'redis://localhost:6379/0';

describe('DiscordAlertService BullMQ producer', () => {
  let originalWebhook: string | undefined;
  let originalRedisUrl: string | undefined;

  beforeEach(() => {
    originalWebhook = process.env.DISCORD_WEBHOOK_URL;
    originalRedisUrl = process.env.REDIS_URL;
    process.env.DISCORD_WEBHOOK_URL = WEBHOOK_URL;
    process.env.REDIS_URL = REDIS_URL;
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-01T10:00:00.000Z'));
    bullmq.Queue.mockClear();
    bullmq.Worker.mockClear();
    circuitBreaker.beforeRequest.mockResolvedValue('CLOSED');
    circuitBreaker.recordSuccess.mockResolvedValue(undefined);
    circuitBreaker.recordFailure.mockResolvedValue('CLOSED');
    circuitBreaker.state.mockResolvedValue({
      state: 'CLOSED',
      failures: 0,
      total: 0,
      windowStartedAt: 0,
      openedUntil: 0,
      openedAt: 0,
    });
    dedup.claimWorkerSideEffect.mockResolvedValue(true);
    dedup.releaseWorkerSideEffect.mockResolvedValue(undefined);
    mockedAxios.post.mockReset();
    mockedAxios.post.mockResolvedValue({ status: 204 });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalWebhook === undefined) {
      delete process.env.DISCORD_WEBHOOK_URL;
    } else {
      process.env.DISCORD_WEBHOOK_URL = originalWebhook;
    }
    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalRedisUrl;
    }
  });

  it('enqueue is fire-and-forget and uses BullMQ retry options', async () => {
    const service = new DiscordAlertService();
    service.onModuleInit();
    const queue = bullmq.Queue.mock.results[0].value;
    queue.add.mockReturnValueOnce(new Promise(() => undefined));

    const result = service.enqueue('finalize_success', {
      orderId: 'order-1',
      trackId: 'track-1',
      version: 'payments-fix-v1.0.0',
    });

    expect(result).toBeUndefined();
    await Promise.resolve();
    expect(queue.add).toHaveBeenCalledWith(
      'alert',
      expect.objectContaining({
        event: 'finalize_success',
        payload: expect.objectContaining({
          orderId: 'order-1',
          timestamp: Date.now(),
        }),
      }),
      expect.objectContaining({
        priority: 5,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        jobId: bullmqStableJobIdFromPayload('finalize_success', {
          orderId: 'order-1',
          trackId: 'track-1',
          version: 'payments-fix-v1.0.0',
          traceId: undefined,
        }),
        removeOnComplete: false,
        removeOnFail: false,
      }),
    );
  });

  it('adds critical jobs with high priority', async () => {
    const service = new DiscordAlertService();
    service.onModuleInit();
    const queue = bullmq.Queue.mock.results[0].value;

    service.enqueue('captured_payment_not_finalized', { orderId: 'order-1' });
    await Promise.resolve();

    expect(queue.add).toHaveBeenCalledWith(
      'alert',
      expect.objectContaining({
        event: 'captured_payment_not_finalized',
      }),
      expect.objectContaining({
        priority: 1,
      }),
    );
  });

  it('swallows enqueue errors and never throws', async () => {
    const service = new DiscordAlertService();
    service.onModuleInit();
    const queue = bullmq.Queue.mock.results[0].value;
    queue.add.mockImplementationOnce(() => {
      throw new Error('redis down');
    });

    expect(() => service.enqueue('finalize_failed', {})).not.toThrow();
    await Promise.resolve();
  });
});

describe('DiscordAlertWorker BullMQ processor', () => {
  beforeEach(() => {
    process.env.DISCORD_WEBHOOK_URL = WEBHOOK_URL;
    process.env.REDIS_URL = REDIS_URL;
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-01T10:00:00.000Z'));
    bullmq.Queue.mockClear();
    bullmq.Worker.mockClear();
    circuitBreaker.beforeRequest.mockResolvedValue('CLOSED');
    circuitBreaker.recordSuccess.mockResolvedValue(undefined);
    circuitBreaker.recordFailure.mockResolvedValue('CLOSED');
    circuitBreaker.state.mockResolvedValue({
      state: 'CLOSED',
      failures: 0,
      total: 0,
      windowStartedAt: 0,
      openedUntil: 0,
      openedAt: 0,
    });
    dedup.claimWorkerSideEffect.mockResolvedValue(true);
    dedup.releaseWorkerSideEffect.mockResolvedValue(undefined);
    mockedAxios.post.mockReset();
    mockedAxios.post.mockResolvedValue({ status: 204 });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('configures worker concurrency and global limiter', () => {
    const worker = new DiscordAlertWorker(...workerDeps() as unknown as [any, any, any]);
    worker.onModuleInit();

    expect(bullmq.Worker).toHaveBeenCalledWith(
      'discord-alerts',
      expect.any(Function),
      expect.objectContaining({
        concurrency: 5,
        limiter: { max: 5, duration: 1_000 },
      }),
    );
  });

  it('sends critical jobs immediately without batching', async () => {
    const worker = new DiscordAlertWorker(...workerDeps() as unknown as [any, any, any]);
    worker.onModuleInit();
    const processor = bullmq.Worker.mock.calls[0][1] as (job: unknown) => Promise<void>;

    await processor({
      id: 'crit-1',
      data: {
        event: 'captured_payment_not_finalized',
        payload: { orderId: 'order-1', timestamp: Date.now() },
      },
    });

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      WEBHOOK_URL,
      expect.objectContaining({
        content: '🚨 Payment Alerts Batch',
        embeds: [expect.objectContaining({ title: 'captured_payment_not_finalized' })],
      }),
      expect.objectContaining({ timeout: 3_000 }),
    );
  });

  it('batches normal jobs and flushes on timer', async () => {
    const worker = new DiscordAlertWorker(...workerDeps() as unknown as [any, any, any]);
    worker.onModuleInit();
    const processor = bullmq.Worker.mock.calls[0][1] as (job: unknown) => Promise<void>;

    const p1 = processor({
      id: 'j1',
      data: { event: 'finalize_success', payload: { orderId: '1', timestamp: Date.now() } },
    });
    const p2 = processor({
      id: 'j2',
      data: { event: 'finalize_failed', payload: { orderId: '2', timestamp: Date.now() } },
    });

    expect(mockedAxios.post).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1_000);
    await jest.runAllTimersAsync();
    await Promise.all([p1, p2]);

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [, body] = mockedAxios.post.mock.calls[0];
    expect(body.embeds).toHaveLength(2);
  });

  it('does not retry on Discord 4xx responses', async () => {
    mockedAxios.post.mockResolvedValue({ status: 400 });
    const worker = new DiscordAlertWorker(...workerDeps() as unknown as [any, any, any]);
    worker.onModuleInit();
    const processor = bullmq.Worker.mock.calls[0][1] as (job: unknown) => Promise<void>;

    await processor({
      id: 'crit-1',
      data: {
        event: 'captured_payment_not_finalized',
        payload: { orderId: 'order-1', timestamp: Date.now() },
      },
    });

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('throws retryable failures for Discord 5xx so BullMQ keeps failed jobs', async () => {
    mockedAxios.post.mockResolvedValue({ status: 500 });
    const worker = new DiscordAlertWorker(...workerDeps() as unknown as [any, any, any]);
    worker.onModuleInit();
    const processor = bullmq.Worker.mock.calls[0][1] as (job: unknown) => Promise<void>;

    await expect(
      processor({
        id: 'crit-5xx',
        data: {
          event: 'captured_payment_not_finalized',
          payload: { orderId: 'order-1', timestamp: Date.now() },
        },
      }),
    ).rejects.toThrow('discord_5xx');
  });
});
