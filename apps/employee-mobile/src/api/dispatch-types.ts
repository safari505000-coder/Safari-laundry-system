/** Dispatch row — mirrors backend `DispatchRowDto` / web `DriverTask`. */

export type DriverDispatchSeverity =
  | 'ON_TIME'
  | 'LATE'
  | 'CRITICAL'
  | 'COMPLETED';

export type DriverDispatchStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type DriverDispatchTask = {
  id: string;
  status: DriverDispatchStatus;
  severity: DriverDispatchSeverity;
  elapsedMinutes: number;
  customerId: string;
  customerDisplay: string;
  customerPhone: string | null;
  customerAddress?: string | null;
  address?: string | null;
  driverId: string;
  driverName: string;
  instructionNote: string | null;
  createdAtIso: string;
  acknowledgedAtIso?: string | null;
  completedAtIso: string | null;
  completedByOrderId: string | null;
  slaTone?: 'NORMAL' | 'LATE' | 'BREACH';
};

export type DriverDispatchSnapshot = {
  generatedAtIso: string;
  rows: DriverDispatchTask[];
};
