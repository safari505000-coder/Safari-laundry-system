import { JobsOptions } from 'bullmq';
import { discordRedisConnection } from '../common/services/discord-alert.queue';

export const OWNER_DASHBOARD_QUEUE = 'owner-dashboard';
export const REFRESH_OWNER_DASHBOARD_JOB = 'refresh-owner-dashboard';
const OWNER_DASHBOARD_CACHE_VERSION = 'v1';
export const OWNER_DASHBOARD_CACHE_KEY = `owner_dashboard:${OWNER_DASHBOARD_CACHE_VERSION}`;
export const OWNER_DASHBOARD_STALE_CACHE_KEY = `${OWNER_DASHBOARD_CACHE_KEY}:stale`;
export const OWNER_DASHBOARD_REFRESH_MS = 10_000;
export const OWNER_DASHBOARD_CACHE_TTL_SEC = 30;
export const OWNER_DASHBOARD_STALE_CACHE_TTL_SEC = 300;
export const OWNER_DASHBOARD_JOB_ID = REFRESH_OWNER_DASHBOARD_JOB;

export const ownerDashboardRedisConnection = discordRedisConnection;

export function ownerDashboardRefreshJobOptions(): JobsOptions {
  return {
    jobId: OWNER_DASHBOARD_JOB_ID,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1_000,
    },
    repeat: {
      every: OWNER_DASHBOARD_REFRESH_MS,
      immediately: true,
    },
    removeOnComplete: false,
    removeOnFail: false,
  };
}
