"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiagnosticsEngineService = void 0;
const common_1 = require("@nestjs/common");
const CRITICAL_DELTA_KD = 5;
let DiagnosticsEngineService = class DiagnosticsEngineService {
    compose(input) {
        const items = [];
        if (input.guardian) {
            for (const g of input.guardian.issues) {
                items.push(this.fromGuardianIssue(g, input.guardian));
            }
        }
        if (input.integrity) {
            for (const i of input.integrity.criticalIssues)
                items.push(this.fromIntegrityIssue(i));
            for (const i of input.integrity.warnings)
                items.push(this.fromIntegrityIssue(i));
        }
        if (input.drivers) {
            for (const m of input.drivers.mismatches)
                items.push(this.fromDriverAmount(m));
        }
        items.sort((a, b) => {
            const sevDelta = sevRank(b.severity) - sevRank(a.severity);
            if (sevDelta !== 0)
                return sevDelta;
            const srcDelta = sourceRank(a.source) - sourceRank(b.source);
            if (srcDelta !== 0)
                return srcDelta;
            return a.id.localeCompare(b.id);
        });
        const critical = items.filter((i) => i.severity === 'CRITICAL').length;
        const uniqueRootCauses = new Set(items.map((i) => i.rootCause)).size;
        return {
            items,
            summary: {
                total: items.length,
                critical,
                warning: items.length - critical,
                uniqueRootCauses,
            },
            generatedAt: new Date().toISOString(),
            readOnly: true,
        };
    }
    fromGuardianIssue(g, parent) {
        const values = layerSnapshotFromHealth(parent);
        const delta = numericDelta(values);
        const rootCause = this.guardianRootCause(g);
        const severity = this.severityFor({
            rootCause,
            delta,
            anyRedStatus: hasRedStatus(values),
            severityHint: g.severity,
        });
        const issueType = `${g.check}:${g.severity}`;
        const explanationAr = this.explanationFor(rootCause, {
            driverName: g.driverName,
            issueMessage: g.message,
        });
        const action = this.actionFor(rootCause);
        const timestamp = g.lastSeenAt || new Date().toISOString();
        return finalize({
            id: `guardian:${g.id}`,
            source: 'GUARDIAN',
            issueType,
            driverId: g.driverId,
            driverName: g.driverName,
            severity,
            values,
            delta,
            rootCause,
            explanationAr,
            action,
            timestamp,
        });
    }
    fromIntegrityIssue(i) {
        const values = {
            classified: pickIfLayer(i.sourceA, i.sourceB, 'classified', i.expected, i.found),
            risk: pickIfLayer(i.sourceA, i.sourceB, 'risk', i.expected, i.found),
            executive: pickIfLayer(i.sourceA, i.sourceB, 'executive', i.expected, i.found),
            live: pickIfLayer(i.sourceA, i.sourceB, 'live', i.expected, i.found),
            operational: pickIfLayer(i.sourceA, i.sourceB, 'operational', i.expected, i.found),
        };
        const delta = i.delta ?? '';
        const rootCause = this.integrityRootCause(i);
        const severity = this.severityFor({
            rootCause,
            delta,
            anyRedStatus: Object.values(values).some((v) => typeof v === 'string' && v.toUpperCase() === 'RED'),
            severityHint: i.severity,
        });
        const issueType = i.type;
        const explanationAr = this.explanationFor(rootCause, {
            driverName: i.driverName,
            issueMessage: i.message,
        });
        const action = this.actionFor(rootCause);
        return finalize({
            id: `integrity:${i.type}:${i.driverId ?? ''}:${(i.message ?? '').slice(0, 40)}`,
            source: 'INTEGRITY_AUDIT',
            issueType,
            driverId: i.driverId,
            driverName: i.driverName,
            severity,
            values,
            delta,
            rootCause,
            explanationAr,
            action,
            timestamp: new Date().toISOString(),
        });
    }
    fromDriverAmount(m) {
        const values = {
            classified: m.amounts.classified,
            risk: m.amounts.risk,
            executive: m.amounts.executive,
            live: m.amounts.live,
            operational: m.amounts.operational,
        };
        const delta = m.difference;
        const rootCause = this.driverAmountRootCause(m.rootCause);
        const severity = this.severityFor({
            rootCause,
            delta,
            anyRedStatus: false,
            severityHint: m.severity,
        });
        const issueType = `DRIVER_AMOUNT_MISMATCH:${m.rootCause}`;
        const explanationAr = this.explanationFor(rootCause, {
            driverName: m.driverName,
            issueMessage: m.reasons.join(' · ') || 'تباين في القيمة بين الطبقات.',
        });
        const action = this.actionFor(rootCause);
        return finalize({
            id: `driver-amount:${m.driverId}`,
            source: 'DRIVER_AMOUNT_AUDIT',
            issueType,
            driverId: m.driverId,
            driverName: m.driverName,
            severity,
            values,
            delta,
            rootCause,
            explanationAr,
            action,
            timestamp: new Date().toISOString(),
        });
    }
    guardianRootCause(g) {
        if (g.check === 'API_HEALTH')
            return 'CACHE_STALE';
        if (g.check === 'QUEUE_HEALTH')
            return 'CACHE_STALE';
        if (g.check === 'REGRESSION_GUARD')
            return 'CLASSIFICATION_MISMATCH';
        if (g.check === 'FLOW_CHAIN')
            return 'AGGREGATION_BUG';
        if (g.check === 'DRIVER_CONSISTENCY')
            return 'CLASSIFICATION_MISMATCH';
        if (g.check === 'UI_CONSISTENCY')
            return 'MAPPING_ERROR';
        const type = g.context?.['type'];
        if (type === 'AMOUNT_FLOOR_VIOLATION')
            return 'AMOUNT_FLOOR_VIOLATION';
        if (type === 'AGE_GATE_VIOLATION')
            return 'AGE_GATE_VIOLATION';
        if (type === 'TOTAL_CASH_DRIFT')
            return 'AGGREGATION_BUG';
        if (type === 'TOPRISK_DRIVER_NOT_IN_CLASSIFIED' ||
            type === 'ALERT_WITHOUT_DRIVER') {
            return 'MAPPING_ERROR';
        }
        return 'CLASSIFICATION_MISMATCH';
    }
    integrityRootCause(i) {
        switch (i.type) {
            case 'AMOUNT_FLOOR_VIOLATION':
                return 'AMOUNT_FLOOR_VIOLATION';
            case 'AGE_GATE_VIOLATION':
                return 'AGE_GATE_VIOLATION';
            case 'TOTAL_CASH_DRIFT':
                return 'AGGREGATION_BUG';
            case 'TOPRISK_DRIVER_NOT_IN_CLASSIFIED':
            case 'ALERT_WITHOUT_DRIVER':
            case 'DRIVER_LAYER_MISMATCH':
                return 'MAPPING_ERROR';
            case 'STATUS_DRIFT':
            case 'CRITICAL_COUNT_MISMATCH':
            case 'WARNING_COUNT_MISMATCH':
            case 'TOPRISK_INCONSISTENCY':
            case 'DRIVER_AMOUNT_MISMATCH':
            default:
                return 'CLASSIFICATION_MISMATCH';
        }
    }
    driverAmountRootCause(r) {
        switch (r) {
            case 'SNAPSHOT_DRIFT':
                return 'SNAPSHOT_DRIFT';
            case 'PARTIAL_DATA_OR_STALE_CACHE':
                return 'CACHE_STALE';
            case 'CLASSIFICATION_DRIFT':
            case 'FILTERING_BUG':
            case 'EXECUTIVE_PROJECTION_BUG':
            case 'MIXED_DRIFT':
            default:
                return 'CLASSIFICATION_MISMATCH';
        }
    }
    severityFor(input) {
        if (input.anyRedStatus)
            return 'CRITICAL';
        const deltaNum = Number.parseFloat(input.delta || '');
        if (Number.isFinite(deltaNum) && deltaNum > CRITICAL_DELTA_KD) {
            return 'CRITICAL';
        }
        if (input.rootCause === 'AMOUNT_FLOOR_VIOLATION' ||
            input.rootCause === 'AGE_GATE_VIOLATION' ||
            input.rootCause === 'AGGREGATION_BUG') {
            return 'CRITICAL';
        }
        if (input.severityHint === 'CRITICAL')
            return 'CRITICAL';
        return 'WARNING';
    }
    explanationFor(cause, ctx) {
        const prefix = ctx.driverName
            ? `السائق "${ctx.driverName}": `
            : '';
        switch (cause) {
            case 'SNAPSHOT_DRIFT':
                return (`${prefix}الطبقات تقرأ نسخاً مختلفة من البيانات. غالباً المشكلة توقيت — ` +
                    `إحدى الطبقات استلمت لقطة جديدة قبل الأخرى. ينتظر دورة جديدة أو يُعاد تحديث المراقب.`);
            case 'CLASSIFICATION_MISMATCH':
                return (`${prefix}منطق التصنيف لا يتطابق بين الطبقات. ` +
                    `طبقة /classified تعطي نتيجة، وطبقة أخرى (/risk أو /executive) تعطي نتيجة مختلفة. ` +
                    `يلزم مراجعة الكود حتى تستهلك الطبقات نفس مصدر الحقيقة.`);
            case 'CACHE_STALE':
                return (`${prefix}إحدى الطبقات تعرض بيانات قديمة من المخزن المؤقت. ` +
                    `الأرقام الفعلية موجودة في طبقة أخرى لكن الطبقة المعروضة لم تتحدث بعد.`);
            case 'MAPPING_ERROR':
                return (`${prefix}السائق أو الفلوس غير مرتبطة بشكل صحيح بين الطبقات. ` +
                    `يوجد رقم سائق (driverId) ظاهر في طبقة وغير ظاهر في طبقة أخرى، أو تنبيه بدون رقم سائق.`);
            case 'AGGREGATION_BUG':
                return (`${prefix}مجموع الأرقام لا يطابق مجموع التدفقات الفعلية. ` +
                    `أحد الطبقات تجمع الأرقام بشكل خاطئ أو تستخدم مرشحاً مختلفاً عن باقي الطبقات.`);
            case 'AMOUNT_FLOOR_VIOLATION':
                return (`${prefix}صدر تنبيه مالي لمبلغ أقل من 5 د.ك — وهذا مخالف لقاعدة الحد الأدنى. ` +
                    `أي مبلغ أقل من 5 د.ك يجب ألا يُحسب كمخاطر مالية.`);
            case 'AGE_GATE_VIOLATION':
                return (`${prefix}صدر تنبيه عن نقد عمره أقل من 24 ساعة — وهذا داخل فترة السماح. ` +
                    `النقد الجديد يجب ألا يُصنّف كمخاطر مالية قبل مرور 24 ساعة.`);
            case 'UNKNOWN':
            default:
                return (`${prefix}تعارض غير معروف بين الطبقات. ` +
                    `${ctx.issueMessage ?? 'رسالة المصدر غير متوفرة'}. يحتاج فحصاً يدوياً.`);
        }
    }
    actionFor(cause) {
        switch (cause) {
            case 'SNAPSHOT_DRIFT':
                return 'refresh snapshot — انتظر دورة المراقب التالية (≤ 60 ثانية) أو شغّل GET /api/cash-intelligence/live ليُعاد بناء اللقطة.';
            case 'CLASSIFICATION_MISMATCH':
                return 'escalate to engineering — مراجعة كود التصنيف ليستهلك /classified كمصدر وحيد للحقيقة.';
            case 'CACHE_STALE':
                return 'restart monitor — أوقف وشغّل خدمة cash-monitor، ثم استعرض /classified للتأكد من التحديث.';
            case 'MAPPING_ERROR':
                return 'investigate driver mapping — راجع driverId في التدفقات (flows) وتأكد أن كل تنبيه مربوط بسائق صحيح.';
            case 'AGGREGATION_BUG':
                return 'escalate to engineering — مجموع الطبقة لا يطابق مجموع التدفقات؛ يحتاج تصحيح في طبقة الـ aggregation.';
            case 'AMOUNT_FLOOR_VIOLATION':
                return 'escalate to engineering — التصنيف يخالف قاعدة الحد الأدنى (5 د.ك). يجب تصحيح المرشح فوراً.';
            case 'AGE_GATE_VIOLATION':
                return 'escalate to engineering — التصنيف يخالف فترة السماح (24 ساعة). يجب تصحيح المرشح فوراً.';
            case 'UNKNOWN':
            default:
                return 'escalate to engineering — تعارض غير مصنف، يحتاج تحقيقاً يدوياً قبل الاعتماد على لوحة المعلومات.';
        }
    }
};
exports.DiagnosticsEngineService = DiagnosticsEngineService;
exports.DiagnosticsEngineService = DiagnosticsEngineService = __decorate([
    (0, common_1.Injectable)()
], DiagnosticsEngineService);
function finalize(args) {
    const formatted = renderArabicBlock(args);
    return { ...args, formatted };
}
function renderArabicBlock(args) {
    const lines = [];
    lines.push('🚨 SYSTEM ALERT');
    lines.push('');
    lines.push('المشكلة:');
    lines.push(args.issueType);
    lines.push('');
    lines.push('السائق:');
    lines.push(args.driverName?.trim() || 'N/A');
    lines.push('');
    lines.push('الحالة:');
    lines.push(args.severity);
    lines.push('');
    lines.push('التفاصيل:');
    lines.push(`- classified: ${formatLayer(args.values.classified)}`);
    lines.push(`- risk: ${formatLayer(args.values.risk)}`);
    lines.push(`- executive: ${formatLayer(args.values.executive)}`);
    if (args.values.live !== null) {
        lines.push(`- live: ${formatLayer(args.values.live)}`);
    }
    if (args.values.operational !== null) {
        lines.push(`- operational: ${formatLayer(args.values.operational)}`);
    }
    lines.push('');
    lines.push('الفرق:');
    lines.push(args.delta ? `${args.delta} KD` : '—');
    lines.push('');
    lines.push('السبب المتوقع:');
    lines.push(args.rootCause);
    lines.push('');
    lines.push('التوضيح:');
    lines.push(args.explanationAr);
    lines.push('');
    lines.push('الإجراء:');
    lines.push(args.action);
    lines.push('');
    lines.push('الوقت:');
    lines.push(args.timestamp);
    return lines.join('\n');
}
function formatLayer(v) {
    if (v === null || v === undefined)
        return '—';
    return v;
}
function sevRank(s) {
    return s === 'CRITICAL' ? 1 : 0;
}
function sourceRank(s) {
    if (s === 'GUARDIAN')
        return 0;
    if (s === 'INTEGRITY_AUDIT')
        return 1;
    return 2;
}
function numericDelta(values) {
    const nums = [];
    for (const v of [
        values.classified,
        values.risk,
        values.executive,
        values.live,
        values.operational,
    ]) {
        if (v === null || v === undefined)
            continue;
        const n = Number.parseFloat(v);
        if (Number.isFinite(n))
            nums.push(n);
    }
    if (nums.length < 2)
        return '';
    const max = Math.max(...nums);
    const min = Math.min(...nums);
    const d = max - min;
    if (d <= 0)
        return '';
    return d.toFixed(4);
}
function hasRedStatus(values) {
    return Object.values(values).some((v) => typeof v === 'string' && v.toUpperCase() === 'RED');
}
function layerSnapshotFromHealth(parent) {
    return {
        classified: parent.health?.classified ?? null,
        risk: parent.health?.risk ?? null,
        executive: parent.health?.executive ?? null,
        live: null,
        operational: null,
    };
}
function pickIfLayer(sourceA, sourceB, layer, expected, found) {
    const layerToken = `/${layer}`;
    const a = (sourceA ?? '').toLowerCase();
    const b = (sourceB ?? '').toLowerCase();
    if (a.includes(layerToken))
        return expected;
    if (b.includes(layerToken))
        return found;
    return null;
}
//# sourceMappingURL=diagnostics-engine.service.js.map