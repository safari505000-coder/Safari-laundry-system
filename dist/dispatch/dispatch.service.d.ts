import { EventEmitter2 } from "@nestjs/event-emitter";
import { Dispatch, DispatchStatus } from "@prisma/client";
import { Subject } from "rxjs";
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { DispatchStreamEventPayload, OrderCreatedEventPayload } from './dispatch.events';
import { DispatchRowDto, DispatchSeverity, DispatchSnapshotDto } from './dto/dispatch-row.dto';
export declare class DispatchService {
    private readonly prisma;
    private readonly auditLogs;
    private readonly events;
    private readonly logger;
    private readonly driverStreams;
    constructor(prisma: PrismaService, auditLogs: AuditLogsService, events: EventEmitter2);
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
    pickAlternateDriver(excludeDriverId: string): Promise<{
        id: string;
    } | null>;
    findEscalationCandidates(minAgeMinutes: number, limit?: number): Promise<Array<Pick<Dispatch, 'id' | 'customerId' | 'driverId' | 'instructionNote'>>>;
    createSuccessor(input: {
        parent: Pick<Dispatch, 'id' | 'customerId' | 'driverId' | 'instructionNote'>;
        newDriverId: string;
        instructionNote: string | null;
        actorUserId: string | null;
    }): Promise<Dispatch>;
    runEscalationOnce(input: {
        minAgeMinutes: number;
        limit?: number;
    }): Promise<{
        inspected: number;
        escalated: number;
        skipped: number;
    }>;
    reassign(input: {
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
    subscribeDriverStream(driverId: string): Subject<DispatchStreamEventPayload>;
    unsubscribeDriverStream(driverId: string, subject: Subject<unknown>): void;
    private broadcastToDriver;
    private toRowDto;
}
export declare function computeElapsedMinutes(start: Date, end: Date): number;
export declare function severityFor(status: DispatchStatus, elapsedMinutes: number): DispatchSeverity;
export type { Dispatch };
