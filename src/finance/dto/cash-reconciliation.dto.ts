import { ApiProperty } from '@nestjs/swagger';
import {
  DriverCashTraceKpisDto,
  DriverCashTraceQueryDto,
} from './driver-cash-trace.dto';

/**
 * V19.31 — One-screen reconciliation: event-based (window) vs state-based (open balances).
 */
/**
 * معايير استعلام تسوية النقدية — يرث من استعلام تتبع نقد السائق
 * Cash reconciliation query DTO extending DriverCashTraceQueryDto with same date/driver scope.
 * @since V19.31
 */
export class CashReconciliationQueryDto extends DriverCashTraceQueryDto {}

/**
 * لقطة تسوية النقدية — تجمع الأحداث المبنية على الوقت مع الأرصدة اللحظية
 * Cash reconciliation snapshot combining event-based in-window aggregates with state-based open balances.
 * @since V19.31
 */
export type CashReconciliationSnapshotDto = {
  range: { from: string; to: string };
  notes: string[];
  eventBasedInRange: {
    /** Σ CASH COMPLETED orders with completedAt in [from, to]. */
    collectedKd: string;
    /** Σ custody bags with receivedFromDriverAt in [from, to]. */
    handedToManagerKd: string;
    collectedOrderCount: number;
    handedBagCount: number;
  };
  stateBasedNow: {
    /** Current field cash: PAID_TO_DRIVER CASH orders (not window-scoped). */
    pendingWithDriversKd: string;
    /**
     * Open manager liability per product spec: PENDING_DEPOSIT + REJECTED only.
     * (AWAITING_VERIFICATION is tracked separately — slip uploaded, not yet verified.)
     */
    pendingWithManagersDepositOrRejectedKd: string;
    pendingWithManagersDepositOrRejectedBagCount: number;
    awaitingVerificationKd: string;
    awaitingVerificationBagCount: number;
  };
  /** KPI rollups for the selected window (same semantics as driver cash trace). */
  driverCashTraceKpis: DriverCashTraceKpisDto;
};
