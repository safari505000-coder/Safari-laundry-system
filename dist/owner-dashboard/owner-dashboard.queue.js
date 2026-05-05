"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ownerDashboardRedisConnection = exports.OWNER_DASHBOARD_JOB_ID = exports.OWNER_DASHBOARD_STALE_CACHE_TTL_SEC = exports.OWNER_DASHBOARD_CACHE_TTL_SEC = exports.OWNER_DASHBOARD_REFRESH_MS = exports.OWNER_DASHBOARD_STALE_CACHE_KEY = exports.OWNER_DASHBOARD_CACHE_KEY = exports.OWNER_DASHBOARD_CACHE_VERSION = exports.REFRESH_OWNER_DASHBOARD_JOB = exports.OWNER_DASHBOARD_QUEUE = void 0;
exports.ownerDashboardRefreshJobOptions = ownerDashboardRefreshJobOptions;
const discord_alert_queue_1 = require("../common/services/discord-alert.queue");
exports.OWNER_DASHBOARD_QUEUE = 'owner-dashboard';
exports.REFRESH_OWNER_DASHBOARD_JOB = 'refresh-owner-dashboard';
exports.OWNER_DASHBOARD_CACHE_VERSION = 'v1';
exports.OWNER_DASHBOARD_CACHE_KEY = `owner_dashboard:${exports.OWNER_DASHBOARD_CACHE_VERSION}`;
exports.OWNER_DASHBOARD_STALE_CACHE_KEY = `${exports.OWNER_DASHBOARD_CACHE_KEY}:stale`;
exports.OWNER_DASHBOARD_REFRESH_MS = 10_000;
exports.OWNER_DASHBOARD_CACHE_TTL_SEC = 30;
exports.OWNER_DASHBOARD_STALE_CACHE_TTL_SEC = 300;
exports.OWNER_DASHBOARD_JOB_ID = exports.REFRESH_OWNER_DASHBOARD_JOB;
exports.ownerDashboardRedisConnection = discord_alert_queue_1.discordRedisConnection;
function ownerDashboardRefreshJobOptions() {
    return {
        jobId: exports.OWNER_DASHBOARD_JOB_ID,
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1_000,
        },
        repeat: {
            every: exports.OWNER_DASHBOARD_REFRESH_MS,
            immediately: true,
        },
        removeOnComplete: false,
        removeOnFail: false,
    };
}
//# sourceMappingURL=owner-dashboard.queue.js.map