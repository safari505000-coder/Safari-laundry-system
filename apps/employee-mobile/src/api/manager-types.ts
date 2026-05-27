export type DriverOversightShiftStatus = 'ON_SHIFT' | 'OFF';

export type DriverOversightCard = {
  driverId: string;
  fullName: string;
  username: string;
  phone: string | null;
  branch: { id: string; name: string } | null;
  shiftStatus: DriverOversightShiftStatus;
  shiftStartedAt: string | null;
  ordersTodayCount: number;
  pendingInvoicesCount: number;
  staleQuickCount: number;
  staleQuickKd: string;
  atRisk: boolean;
};

export type CashIntelTrafficLight = 'GREEN' | 'YELLOW' | 'RED';

export type CashIntelClassifiedDriverStatus =
  | 'NORMAL'
  | 'WARNING'
  | 'CRITICAL'
  | 'COMPLIANCE';

export type CashIntelDashboardDriver = {
  driverId: string;
  name: string;
  totalCash: string;
  status: CashIntelClassifiedDriverStatus;
  oldestAgeHours: number;
};

export type CashIntelDashboardResponse = {
  systemStatus: CashIntelTrafficLight;
  totalCash: string;
  summaryText: string;
  drivers: CashIntelDashboardDriver[];
  generatedAt: string;
  readOnly: true;
  advisoryOnly: true;
};

export type ManagerCashCustodyStatus =
  | 'PENDING_DEPOSIT'
  | 'AWAITING_VERIFICATION'
  | 'VERIFIED'
  | 'REJECTED';

export type ManagerCashCustodyRow = {
  id: string;
  managerId: string;
  managerName: string;
  driverId: string;
  driverName: string;
  amountKd: string;
  settledOrderCount: number;
  status: ManagerCashCustodyStatus;
  receivedFromDriverAt: string;
  ageHours: number;
  isOverdue: boolean;
  createdAt: string;
};

export type ManagerCashStatusDriverRow = {
  driverId: string;
  driverName: string;
  driverUsername: string;
  driverPhone: string | null;
  heldCashKd: string;
  pendingOrderCount: number;
  shiftStartedAt: string | null;
  ageHours: number | null;
  riskLevel: 'NORMAL' | 'WARNING' | 'CRITICAL';
};

export type ManagerCashStatusResponse = {
  source: 'api/manager/cash-status';
  managerId: string;
  managerName: string;
  pendingDepositKd: string;
  managerOwnPosKd: string;
  custodyBagsTotalKd: string;
  driversAwaitingHandoverKd: string;
  bagsCount: number;
  driversAtRiskCount: number;
  lastHandoverAt: string | null;
  drivers: ManagerCashStatusDriverRow[];
  generatedAt: string;
};
