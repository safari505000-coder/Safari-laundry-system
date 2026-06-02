import { apiJson } from '@/lib/api';

export type GarmentStage =
  | 'RECEIVED'
  | 'SORTING'
  | 'WASHING'
  | 'DRYING'
  | 'IRONING'
  | 'PACKING'
  | 'QC_CHECK'
  | 'READY'
  | 'DELIVERED'
  | 'QUALITY_HOLD'
  | 'REWORK'
  | 'REPAIR'
  | 'DAMAGED_REVIEW'
  | 'LOST_REVIEW';

export type GarmentTaskStatus =
  | 'WAITING_NEXT_STAGE'
  | 'ACCEPTED_BY_WORKER'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'QUALITY_HOLD';

export type StageHandoffStatus =
  | 'WAITING_NEXT_STAGE'
  | 'ACCEPTED_BY_NEXT_WORKER'
  | 'DELAYED_HANDOFF'
  | 'ESCALATED';

export type GarmentIssueType =
  | 'STAIN_REMAINING'
  | 'BURN_MARK'
  | 'TEAR'
  | 'MISSING_BUTTON'
  | 'COLOR_DAMAGE'
  | 'WRONG_ITEM'
  | 'MISSING_ITEM'
  | 'BAD_SMELL'
  | 'OTHER';

export type ProductionDecisionType =
  | 'REWASH'
  | 'REIRON'
  | 'REPAIR'
  | 'APPROVE_AS_READY'
  | 'ESCALATE_TO_OWNER'
  | 'MARK_DAMAGED'
  | 'MARK_LOST';

export type ProductionTask = {
  garmentId: string;
  orderId: string;
  branchId: string;
  label: string | null;
  stage: GarmentStage;
  taskStatus: GarmentTaskStatus;
  handoffStatus: StageHandoffStatus;
  serviceType: 'NORMAL' | 'EXPRESS';
  pieceCount: number;
  expectedReadyAt: string | null;
  isLate: boolean;
  delayMinutes: number;
  hasOpenIssue: boolean;
  internalNote: string | null;
  acceptedByUserId: string | null;
  assignedWorkerId: string | null;
};

export type ProductionBoard = {
  scope: string;
  countsByStage: Record<string, number>;
  delayedGarments: number;
  waitingBetweenStages: number;
  openIssues: number;
  activeWorkers: number;
  delayedList: ProductionTask[];
};

export type GarmentIssue = {
  id: string;
  garmentId: string;
  orderId: string;
  branchId: string;
  stage: GarmentStage;
  issueType: GarmentIssueType;
  status: string;
  notes: string | null;
  createdAt: string;
  garment?: { label: string | null; currentStage: GarmentStage; serviceType: string };
};

export type GarmentTimelineEvent = {
  fromStage: GarmentStage | null;
  toStage: GarmentStage;
  action: string;
  actorUserId: string | null;
  notes: string | null;
  at: string;
};

export type GarmentTimeline = {
  garment: ProductionTask;
  timeline: GarmentTimelineEvent[];
  issues: GarmentIssue[];
};

export type WorkerLogs = {
  workerId: string;
  totalTasks: number;
  issuesReported: number;
  avgDurationMinutes: number;
  logs: Array<{
    stage: GarmentStage;
    action: string;
    startedAt: string | null;
    completedAt: string | null;
    durationMinutes: number | null;
    issueReported: boolean;
    at: string;
  }>;
};

export type OwnerDashboard = {
  branches: Record<
    string,
    { total: number; delayed: number; ready: number; damaged: number; lost: number }
  >;
  bottlenecks: Array<{ stage: string; waiting: number }>;
  delayedHandoffs: number;
  issueRates: Array<{ issueType: string; count: number }>;
  lostCount: number;
  damagedCount: number;
};

export function getProductionBoard(token: string) {
  return apiJson<ProductionBoard>('/api/production/board', { token });
}

export function listProductionIssues(token: string) {
  return apiJson<GarmentIssue[]>('/api/production/issues', { token });
}

export function getGarmentTimeline(token: string, garmentId: string) {
  return apiJson<GarmentTimeline>(
    `/api/production/garments/${garmentId}/timeline`,
    { token },
  );
}

export function getWorkerLogs(token: string, workerId: string) {
  return apiJson<WorkerLogs>(`/api/production/workers/${workerId}/logs`, {
    token,
  });
}

export function getOwnerDashboard(token: string) {
  return apiJson<OwnerDashboard>('/api/production/owner/dashboard', { token });
}

export function decideIssue(
  token: string,
  issueId: string,
  body: {
    decision: ProductionDecisionType;
    notes?: string;
    customerContactRequired?: boolean;
    compensationRequired?: boolean;
  },
) {
  return apiJson<GarmentTimeline>(`/api/production/issues/${issueId}/decision`, {
    token,
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function reassignTask(
  token: string,
  garmentId: string,
  workerId: string | null,
) {
  return apiJson<ProductionTask>(`/api/production/tasks/${garmentId}/reassign`, {
    token,
    method: 'POST',
    body: JSON.stringify({ workerId }),
  });
}

export function intakeGarments(
  token: string,
  body: { orderId: string; count?: number },
) {
  return apiJson<{ created: number; garmentIds: string[] }>(
    '/api/production/garments',
    { token, method: 'POST', body: JSON.stringify(body) },
  );
}

// Worker surface (works for WORKER; OWNER for support/preview).
export function listWorkerTasks(token: string) {
  return apiJson<ProductionTask[]>('/api/worker/tasks', { token });
}

export function workerAccept(token: string, garmentId: string) {
  return apiJson<ProductionTask>(`/api/worker/tasks/${garmentId}/accept`, {
    token,
    method: 'POST',
  });
}

export function workerStart(token: string, garmentId: string) {
  return apiJson<ProductionTask>(`/api/worker/tasks/${garmentId}/start`, {
    token,
    method: 'POST',
  });
}

export function workerComplete(token: string, garmentId: string) {
  return apiJson<ProductionTask>(`/api/worker/tasks/${garmentId}/complete`, {
    token,
    method: 'POST',
  });
}

export function workerReportIssue(
  token: string,
  garmentId: string,
  body: { issueType: GarmentIssueType; notes?: string },
) {
  return apiJson<ProductionTask>(`/api/worker/tasks/${garmentId}/report-issue`, {
    token,
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export const STAGE_LABELS_AR: Record<GarmentStage, string> = {
  RECEIVED: 'استلام',
  SORTING: 'فرز',
  WASHING: 'غسيل',
  DRYING: 'تجفيف',
  IRONING: 'كي',
  PACKING: 'تغليف',
  QC_CHECK: 'فحص الجودة',
  READY: 'جاهز',
  DELIVERED: 'تم التسليم',
  QUALITY_HOLD: 'موقوف للجودة',
  REWORK: 'إعادة عمل',
  REPAIR: 'إصلاح',
  DAMAGED_REVIEW: 'مراجعة تلف',
  LOST_REVIEW: 'مراجعة فقد',
};

export const ISSUE_LABELS_AR: Record<GarmentIssueType, string> = {
  STAIN_REMAINING: 'بقعة متبقية',
  BURN_MARK: 'أثر حرق',
  TEAR: 'تمزق',
  MISSING_BUTTON: 'زر مفقود',
  COLOR_DAMAGE: 'تلف لون',
  WRONG_ITEM: 'قطعة خاطئة',
  MISSING_ITEM: 'قطعة مفقودة',
  BAD_SMELL: 'رائحة كريهة',
  OTHER: 'أخرى',
};
