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
var SystemGuardianService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemGuardianService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const bullmq_1 = require("bullmq");
const discord_alert_queue_1 = require("../common/services/discord-alert.queue");
const whatsapp_queue_1 = require("../customer-notifications/whatsapp.queue");
const cash_monitor_service_1 = require("../cash-monitor/cash-monitor.service");
const cash_risk_service_1 = require("../cash-monitor/cash-risk.service");
const cash_executive_service_1 = require("../cash-monitor/cash-executive.service");
const integrity_audit_service_1 = require("../cash-monitor/integrity-audit.service");
const system_verify_service_1 = require("../cash-monitor/system-verify.service");
const owner_alert_notifier_service_1 = require("./owner-alert-notifier.service");
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_API_LATENCY_WARN_MS = 4_000;
const QUEUE_STUCK_AGE_MS = 5 * 60 * 1000;
const HISTORY_LIMIT = 20;
const DEDUP_WINDOW_MS = 10 * 60 * 1000;
const WARNING_REPEAT_THRESHOLD = 2;
const WARNING_ESCALATION_OCCURRENCES = 5;
const SEVERITY_RANK = {
    INFO: 0,
    WARNING: 1,
    CRITICAL: 2,
};
function intervalMs() {
    const raw = Number.parseInt(process.env.SYSTEM_GUARDIAN_INTERVAL_MS ?? '', 10);
    return Number.isFinite(raw) && raw >= 30_000 ? raw : DEFAULT_INTERVAL_MS;
}
function isEnabled() {
    return process.env.SYSTEM_GUARDIAN_ENABLED !== '0';
}
function apiLatencyWarnMs() {
    const raw = Number.parseInt(process.env.SYSTEM_GUARDIAN_API_LATENCY_WARN_MS ?? '', 10);
    return Number.isFinite(raw) && raw >= 250
        ? raw
        : DEFAULT_API_LATENCY_WARN_MS;
}
let SystemGuardianService = SystemGuardianService_1 = class SystemGuardianService {
    monitor;
    risk;
    executive;
    integrity;
    verify;
    notifier;
    logger = new common_1.Logger(SystemGuardianService_1.name);
    inProgress = false;
    lastResult = null;
    history = [];
    stableState = new Map();
    seenInPreviousSweep = new Set();
    constructor(monitor, risk, executive, integrity, verify, notifier) {
        this.monitor = monitor;
        this.risk = risk;
        this.executive = executive;
        this.integrity = integrity;
        this.verify = verify;
        this.notifier = notifier;
    }
    async onModuleInit() {
        if (!isEnabled()) {
            this.logger.warn('System Guardian disabled (SYSTEM_GUARDIAN_ENABLED=0)');
            return;
        }
        const owner = await this.notifier.ownerPhoneMasked();
        const recipient = owner.masked
            ? `${owner.masked}(${owner.source})`
            : 'unset';
        this.logger.log(`System Guardian armed: every ${Math.round(intervalMs() / 1000)}s · WhatsApp provider=${this.notifier.isProviderConfigured() ? 'ready' : 'log-only'} · owner=${recipient}`);
    }
    async scheduledSweep() {
        if (!isEnabled())
            return;
        if (this.inProgress) {
            this.logger.debug('Guardian sweep skipped — previous sweep still running');
            return;
        }
        try {
            await this.sweep();
        }
        catch (e) {
            this.logger.error(`Guardian sweep failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    async runOnce() {
        return this.sweep();
    }
    async status() {
        const last = this.lastResult ?? this.emptyOk('Guardian has not run yet');
        const owner = await this.notifier.ownerPhoneMasked();
        return {
            ...last,
            history: [...this.history].reverse(),
            whatsAppConfigured: this.notifier.isProviderConfigured(),
            ownerPhoneMasked: owner.masked,
            ownerPhoneSource: owner.source,
        };
    }
    async sweep() {
        if (this.inProgress) {
            return this.lastResult ?? this.emptyOk('Guardian sweep in progress');
        }
        this.inProgress = true;
        const startedAt = Date.now();
        const issuesAccumulator = [];
        const health = {
            classified: null,
            risk: null,
            executive: null,
            classifiedLatencyMs: null,
            riskLatencyMs: null,
            executiveLatencyMs: null,
        };
        try {
            const integrity = await this.runIntegrityCheck();
            issuesAccumulator.push(...integrity);
            const regression = await this.runRegressionGuard();
            issuesAccumulator.push(...regression);
            const api = await this.runApiHealth(health);
            issuesAccumulator.push(...api);
            const queues = await this.runQueueHealth();
            issuesAccumulator.push(...queues);
            const seenThisSweep = new Set();
            const finalIssues = this.applyDedupAndEscalation(issuesAccumulator, seenThisSweep);
            const severity = this.aggregateSeverity(finalIssues);
            const status = finalIssues.length === 0 ? 'OK' : 'ISSUES_FOUND';
            const shipQueue = finalIssues.filter((i) => this.shouldShip(i));
            let sent = false;
            let whatsAppError = null;
            if (shipQueue.length > 0) {
                const message = this.formatMessage(severity, shipQueue, health);
                const r = await this.notifier.send(message);
                sent = r.delivered;
                whatsAppError = r.error;
                const now = Date.now();
                for (const issue of shipQueue) {
                    const st = this.stableState.get(issue.id);
                    if (st)
                        st.lastSentAt = now;
                }
            }
            this.seenInPreviousSweep.clear();
            seenThisSweep.forEach((k) => this.seenInPreviousSweep.add(k));
            this.gcStableState();
            const result = {
                status,
                severity,
                issues: finalIssues,
                health,
                sentToWhatsApp: sent,
                whatsAppError,
                timestamp: new Date(startedAt).toISOString(),
                durationMs: Date.now() - startedAt,
                readOnly: true,
            };
            this.lastResult = result;
            this.history.push({
                timestamp: result.timestamp,
                status,
                severity,
                issuesCount: finalIssues.length,
                sentToWhatsApp: sent,
                whatsAppError,
            });
            while (this.history.length > HISTORY_LIMIT)
                this.history.shift();
            return result;
        }
        finally {
            this.inProgress = false;
        }
    }
    async runIntegrityCheck() {
        try {
            const r = await this.integrity.run();
            const out = [];
            for (const issue of r.criticalIssues) {
                out.push(this.buildFromIntegrity(issue, 'CRITICAL'));
            }
            for (const issue of r.warnings) {
                out.push(this.buildFromIntegrity(issue, 'WARNING'));
            }
            return out;
        }
        catch (e) {
            return [
                this.unstableIssue('CASH_INTEGRITY', 'CRITICAL', `Cash integrity audit failed to run: ${e instanceof Error ? e.message : String(e)}`),
            ];
        }
    }
    buildFromIntegrity(issue, severity) {
        const check = this.mapIntegrityType(issue.type);
        const id = stableKey(check, severity, issue.driverId, issue.type);
        return {
            id,
            severity,
            check,
            message: issue.message,
            driverId: issue.driverId,
            driverName: issue.driverName,
            expected: issue.expected,
            found: issue.found,
            delta: issue.delta,
            context: {
                sourceA: issue.sourceA,
                sourceB: issue.sourceB ?? '',
                type: issue.type,
            },
            firstSeenAt: '',
            lastSeenAt: '',
            occurrences: 1,
        };
    }
    mapIntegrityType(type) {
        switch (type) {
            case 'STATUS_DRIFT':
            case 'CRITICAL_COUNT_MISMATCH':
            case 'WARNING_COUNT_MISMATCH':
            case 'TOPRISK_INCONSISTENCY':
            case 'TOPRISK_DRIVER_NOT_IN_CLASSIFIED':
                return 'CASH_INTEGRITY';
            case 'AMOUNT_FLOOR_VIOLATION':
            case 'AGE_GATE_VIOLATION':
                return 'CASH_INTEGRITY';
            case 'DRIVER_AMOUNT_MISMATCH':
            case 'DRIVER_LAYER_MISMATCH':
                return 'DRIVER_CONSISTENCY';
            case 'TOTAL_CASH_DRIFT':
                return 'FLOW_CHAIN';
            case 'ALERT_WITHOUT_DRIVER':
                return 'UI_CONSISTENCY';
            default:
                return 'CASH_INTEGRITY';
        }
    }
    async runRegressionGuard() {
        try {
            const r = await this.verify.run();
            if (r.status === 'PASS')
                return [];
            const out = [];
            for (const c of r.checks) {
                if (c.ok)
                    continue;
                out.push(this.regressionIssue(c));
            }
            for (const m of r.mismatches) {
                const id = stableKey('REGRESSION_GUARD', 'CRITICAL', null, `mm:${m.slice(0, 60)}`);
                out.push({
                    id,
                    severity: 'CRITICAL',
                    check: 'REGRESSION_GUARD',
                    message: `Regression guard mismatch: ${m}`,
                    driverId: null,
                    driverName: null,
                    expected: null,
                    found: null,
                    delta: null,
                    context: null,
                    firstSeenAt: '',
                    lastSeenAt: '',
                    occurrences: 1,
                });
            }
            return out;
        }
        catch (e) {
            return [
                this.unstableIssue('REGRESSION_GUARD', 'CRITICAL', `Regression guard failed to run: ${e instanceof Error ? e.message : String(e)}`),
            ];
        }
    }
    regressionIssue(c) {
        const id = stableKey('REGRESSION_GUARD', 'CRITICAL', null, c.scenario);
        return {
            id,
            severity: 'CRITICAL',
            check: 'REGRESSION_GUARD',
            message: `Scenario "${c.scenario}" failed: expected systemStatus=${c.expected}, got classified=${c.classified} risk=${c.risk} executive=${c.executive}.`,
            driverId: null,
            driverName: null,
            expected: c.expected,
            found: `classified=${c.classified} risk=${c.risk} executive=${c.executive}`,
            delta: null,
            context: {
                scenario: c.scenario,
                financialAlerts: String(c.financialAlerts),
                complianceAlerts: String(c.complianceAlerts),
            },
            firstSeenAt: '',
            lastSeenAt: '',
            occurrences: 1,
        };
    }
    async runApiHealth(snapshot) {
        const out = [];
        const threshold = apiLatencyWarnMs();
        await timeOf(() => this.monitor.getLive());
        const classified = await timeOf(() => this.monitor.getClassified());
        snapshot.classified = classified.value?.systemStatus ?? null;
        snapshot.classifiedLatencyMs = classified.ms;
        if (!classified.ok) {
            out.push(this.unstableIssue('API_HEALTH', 'CRITICAL', `Classifier call failed: ${classified.error ?? 'unknown'}`));
        }
        else if (classified.ms > threshold) {
            out.push(this.latencyIssue('classified', classified.ms, threshold));
        }
        const risk = await timeOf(() => this.risk.computeRisk());
        snapshot.risk = risk.value?.systemStatus ?? null;
        snapshot.riskLatencyMs = risk.ms;
        if (!risk.ok) {
            out.push(this.unstableIssue('API_HEALTH', 'CRITICAL', `Risk call failed: ${risk.error ?? 'unknown'}`));
        }
        else if (risk.ms > threshold) {
            out.push(this.latencyIssue('risk', risk.ms, threshold));
        }
        const exec = await timeOf(() => this.executive.getExecutiveView());
        snapshot.executive = exec.value?.systemStatus ?? null;
        snapshot.executiveLatencyMs = exec.ms;
        if (!exec.ok) {
            out.push(this.unstableIssue('API_HEALTH', 'CRITICAL', `Executive call failed: ${exec.error ?? 'unknown'}`));
        }
        else if (exec.ms > threshold) {
            out.push(this.latencyIssue('executive', exec.ms, threshold));
        }
        return out;
    }
    latencyIssue(layer, ms, threshold) {
        const id = stableKey('API_HEALTH', 'WARNING', null, `latency:${layer}`);
        return {
            id,
            severity: 'WARNING',
            check: 'API_HEALTH',
            message: `${layer} layer responded in ${ms}ms (> ${threshold}ms threshold).`,
            driverId: null,
            driverName: null,
            expected: `<= ${threshold}ms`,
            found: `${ms}ms`,
            delta: String(ms - threshold),
            context: { layer },
            firstSeenAt: '',
            lastSeenAt: '',
            occurrences: 1,
        };
    }
    async runQueueHealth() {
        const connection = (0, discord_alert_queue_1.discordRedisConnection)();
        if (!connection) {
            return [];
        }
        const out = [];
        const targets = [
            { name: discord_alert_queue_1.DISCORD_ALERT_QUEUE, label: 'discord' },
            { name: whatsapp_queue_1.WHATSAPP_QUEUE, label: 'whatsapp' },
        ];
        const now = Date.now();
        for (const t of targets) {
            let queue = null;
            try {
                queue = new bullmq_1.Queue(t.name, { connection });
                const active = await queue.getJobs(['active'], 0, 50);
                let stuck = 0;
                let oldestAgeMs = 0;
                for (const job of active) {
                    const startedAt = job.processedOn ?? job.timestamp;
                    if (typeof startedAt !== 'number')
                        continue;
                    const age = now - startedAt;
                    if (age > QUEUE_STUCK_AGE_MS) {
                        stuck += 1;
                        if (age > oldestAgeMs)
                            oldestAgeMs = age;
                    }
                }
                if (stuck > 0) {
                    const id = stableKey('QUEUE_HEALTH', 'WARNING', null, `stuck:${t.label}`);
                    out.push({
                        id,
                        severity: 'WARNING',
                        check: 'QUEUE_HEALTH',
                        message: `Queue "${t.label}" has ${stuck} active job(s) stuck > 5min (oldest ${Math.round(oldestAgeMs / 1000)}s).`,
                        driverId: null,
                        driverName: null,
                        expected: '0 stuck active jobs',
                        found: String(stuck),
                        delta: String(stuck),
                        context: {
                            queue: t.label,
                            oldestAgeSeconds: String(Math.round(oldestAgeMs / 1000)),
                        },
                        firstSeenAt: '',
                        lastSeenAt: '',
                        occurrences: 1,
                    });
                }
                const failed = await queue.getJobCounts('failed');
                const failedCount = failed?.failed ?? 0;
                if (failedCount > 50) {
                    const id = stableKey('QUEUE_HEALTH', 'WARNING', null, `failed:${t.label}`);
                    out.push({
                        id,
                        severity: 'WARNING',
                        check: 'QUEUE_HEALTH',
                        message: `Queue "${t.label}" has ${failedCount} failed jobs — possible retry explosion.`,
                        driverId: null,
                        driverName: null,
                        expected: '<= 50 failed jobs',
                        found: String(failedCount),
                        delta: String(failedCount - 50),
                        context: { queue: t.label },
                        firstSeenAt: '',
                        lastSeenAt: '',
                        occurrences: 1,
                    });
                }
            }
            catch (e) {
                out.push(this.unstableIssue('QUEUE_HEALTH', 'WARNING', `Queue scan failed for "${t.label}": ${e instanceof Error ? e.message : String(e)}`));
            }
            finally {
                try {
                    await queue?.close();
                }
                catch {
                }
            }
        }
        return out;
    }
    unstableIssue(check, severity, message) {
        return {
            id: stableKey(check, severity, null, message.slice(0, 60)),
            severity,
            check,
            message,
            driverId: null,
            driverName: null,
            expected: null,
            found: null,
            delta: null,
            context: null,
            firstSeenAt: '',
            lastSeenAt: '',
            occurrences: 1,
        };
    }
    applyDedupAndEscalation(raw, seenThisSweep) {
        const now = Date.now();
        const final = [];
        for (const issue of raw) {
            seenThisSweep.add(issue.id);
            const existing = this.stableState.get(issue.id);
            let occurrences = 1;
            let firstSeen = now;
            let consecutive = 1;
            if (existing) {
                occurrences = existing.occurrences + 1;
                firstSeen = existing.firstSeenAt;
                consecutive = this.seenInPreviousSweep.has(issue.id)
                    ? existing.consecutiveSweeps + 1
                    : 1;
            }
            const next = {
                firstSeenAt: firstSeen,
                lastSeenAt: now,
                occurrences,
                consecutiveSweeps: consecutive,
                lastSentAt: existing?.lastSentAt ?? null,
            };
            this.stableState.set(issue.id, next);
            let effectiveSeverity = issue.severity;
            if (effectiveSeverity === 'WARNING' &&
                occurrences >= WARNING_ESCALATION_OCCURRENCES) {
                effectiveSeverity = 'CRITICAL';
            }
            final.push({
                ...issue,
                severity: effectiveSeverity,
                firstSeenAt: new Date(firstSeen).toISOString(),
                lastSeenAt: new Date(now).toISOString(),
                occurrences,
            });
        }
        return final;
    }
    aggregateSeverity(issues) {
        let max = 'INFO';
        for (const i of issues) {
            if (SEVERITY_RANK[i.severity] > SEVERITY_RANK[max])
                max = i.severity;
        }
        return max;
    }
    shouldShip(issue) {
        const st = this.stableState.get(issue.id);
        if (!st)
            return false;
        const now = Date.now();
        if (st.lastSentAt && now - st.lastSentAt < DEDUP_WINDOW_MS) {
            return false;
        }
        if (issue.severity === 'CRITICAL')
            return true;
        if (issue.severity === 'WARNING') {
            return st.consecutiveSweeps >= WARNING_REPEAT_THRESHOLD;
        }
        return false;
    }
    gcStableState() {
        const now = Date.now();
        for (const [k, v] of this.stableState) {
            if (now - v.lastSeenAt > DEDUP_WINDOW_MS * 3) {
                this.stableState.delete(k);
            }
        }
    }
    formatMessage(severity, issues, health) {
        const lines = [];
        lines.push('🚨 SYSTEM ALERT');
        lines.push('');
        lines.push(`Status: ${severity}`);
        lines.push('');
        lines.push('Summary:');
        for (const i of issues.slice(0, 5)) {
            lines.push(`- [${i.check}] ${i.message}`);
        }
        if (issues.length > 5) {
            lines.push(`- … and ${issues.length - 5} more issue(s)`);
        }
        lines.push('');
        lines.push('System:');
        lines.push(`classified: ${health.classified ?? '?'}`);
        lines.push(`risk: ${health.risk ?? '?'}`);
        lines.push(`executive: ${health.executive ?? '?'}`);
        lines.push('');
        lines.push('Detected Issues:');
        issues.slice(0, 8).forEach((i, idx) => {
            lines.push(`${idx + 1}) ${i.message}`);
        });
        if (issues.length > 8) {
            lines.push(`… +${issues.length - 8} more`);
        }
        lines.push('');
        lines.push('Action Required:');
        lines.push(this.recommendAction(severity, issues));
        lines.push('');
        lines.push(`Time: ${new Date().toISOString()}`);
        return lines.join('\n');
    }
    recommendAction(severity, issues) {
        if (severity === 'CRITICAL') {
            const r = issues.find((i) => i.check === 'REGRESSION_GUARD');
            if (r)
                return 'Regression detected — block deploys and inspect classifier/risk/executive logic.';
            const cash = issues.find((i) => i.check === 'DRIVER_CONSISTENCY' || i.check === 'FLOW_CHAIN');
            if (cash)
                return 'Cash mismatch detected — check driver handover and branch custody before reconciling.';
            const integrity = issues.find((i) => i.check === 'CASH_INTEGRITY');
            if (integrity)
                return 'Cross-layer status drift — investigate which layer disagrees with /classified.';
            return 'Investigate the listed issues immediately.';
        }
        if (severity === 'WARNING') {
            return 'Review the listed warnings; if they persist they will escalate automatically.';
        }
        return 'No immediate action required.';
    }
    emptyOk(reason) {
        return {
            status: 'OK',
            severity: 'INFO',
            issues: [],
            health: {
                classified: null,
                risk: null,
                executive: null,
                classifiedLatencyMs: null,
                riskLatencyMs: null,
                executiveLatencyMs: null,
            },
            sentToWhatsApp: false,
            whatsAppError: null,
            timestamp: new Date().toISOString(),
            durationMs: 0,
            readOnly: true,
        };
    }
};
exports.SystemGuardianService = SystemGuardianService;
__decorate([
    (0, schedule_1.Interval)('system-guardian-sweep', DEFAULT_INTERVAL_MS),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SystemGuardianService.prototype, "scheduledSweep", null);
exports.SystemGuardianService = SystemGuardianService = SystemGuardianService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cash_monitor_service_1.CashMonitorService,
        cash_risk_service_1.CashRiskService,
        cash_executive_service_1.CashExecutiveService,
        integrity_audit_service_1.IntegrityAuditService,
        system_verify_service_1.SystemVerifyService,
        owner_alert_notifier_service_1.OwnerAlertNotifierService])
], SystemGuardianService);
function stableKey(check, severity, driverId, discriminator) {
    return `${check}|${severity}|${driverId ?? ''}|${discriminator}`;
}
async function timeOf(fn) {
    const start = Date.now();
    try {
        const value = await fn();
        return { ok: true, ms: Date.now() - start, value, error: null };
    }
    catch (e) {
        return {
            ok: false,
            ms: Date.now() - start,
            value: null,
            error: e instanceof Error ? e.message : String(e),
        };
    }
}
//# sourceMappingURL=system-guardian.service.js.map