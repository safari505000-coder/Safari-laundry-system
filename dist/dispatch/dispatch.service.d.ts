import { EventEmitter2 } from "@nestjs/event-emitter";
import { Dispatch, DispatchStatus } from "@prisma/client";
import { Subject } from "rxjs";
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { DispatchMetricsService } from './dispatch-metrics.service';
import { DriverDispatchSseEnvelope, OrderCreatedEventPayload } from './dispatch.events';
import { DispatchRowDto, DispatchSeverity, DispatchSlaTone, DispatchSnapshotDto } from './dto/dispatch-row.dto';
import { DispatchMonitorSnapshotDto } from './dto/dispatch-monitor.dto';
export declare class DispatchService {
    private readonly prisma;
    private readonly auditLogs;
    private readonly events;
    private readonly metrics;
    private readonly logger;
    private readonly driverStreams;
    constructor(prisma: PrismaService, auditLogs: AuditLogsService, events: EventEmitter2, metrics: DispatchMetricsService);
    private kuwaitCalendarDayBoundsUtc;
    private static readonly CC_CREATOR_ROLES;
    private static readonly CC_DASHBOARD_MAX_ASSIGNMENT_AGE_MS;
    private ccTrackedDispatchWhere;
    private driverQueueDispatchWhere;
    private isCallCenterCreatorRole;
    private finalizeCcDispatchRows;
    create(input: {
        customerId: string;
        driverId: string;
        instructionNote: string | null;
        actorUserId: string | null;
        actorRole: string | null;
    }): Promise<DispatchRowDto>;
    handleOrderCreated(payload: OrderCreatedEventPayload): Promise<void>;
    listActive(input?: {
        limit?: number;
    }): Promise<DispatchSnapshotDto>;
    listForDriver(driverId: string): Promise<DispatchSnapshotDto>;
    acknowledge(input: {
        dispatchId: string;
        driverId: string;
    }): Promise<DispatchRowDto>;
    listAvailableDrivers(): Promise<Array<{
        id: string;
        name: string;
        isActive: boolean;
        activeLoad: number;
    }>>;
    runSlaMonitorOnce(input: {
        limit?: number;
    }): Promise<{
        inspected: number;
        firstAlerts: number;
        escalations: number;
        breaches: number;
    }>;
    monitorForCallCenter(): Promise<DispatchMonitorSnapshotDto>;
    reassign(_input: {
        dispatchId: string;
        newDriverId: string;
        reason: string | null;
        actorUserId: string | null;
        actorRole: string | null;
    }): Promise<Dispatch>;
    findReconciliationCandidates(limit?: number): Promise<Array<{
        id: string;
        customerId: string;
        orderId: string;
    }>>;
    reconcileOne(input: {
        dispatchId: string;
        orderId: string;
        customerId: string;
    }): Promise<{
        closed: boolean;
    }>;
    runReconciliationOnce(input?: {
        limit?: number;
    }): Promise<{
        inspected: number;
        closed: number;
    }>;
    subscribeDriverStream(driverId: string): Subject<DriverDispatchSseEnvelope>;
    unsubscribeDriverStream(driverId: string, subject: Subject<DriverDispatchSseEnvelope>): void;
    private broadcastDriverEnvelope;
    private rowToStreamPayload;
    private toRowDto;
}
export declare function computeElapsedMinutes(start: Date, end: Date): number;
export declare function severityFor(status: DispatchStatus, elapsedMinutes: number): DispatchSeverity;
export declare function slaToneDispatch(d: Dispatch, elapsedMinutesSinceCreated: number): DispatchSlaTone;
export type { Dispatch };
