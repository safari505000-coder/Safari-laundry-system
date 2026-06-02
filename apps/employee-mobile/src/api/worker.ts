import { apiJson } from './client';

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

export type WorkerTask = {
  garmentId: string;
  orderId: string;
  branchId: string;
  label: string | null;
  stage: GarmentStage;
  taskStatus: GarmentTaskStatus;
  serviceType: 'NORMAL' | 'EXPRESS';
  pieceCount: number;
  expectedReadyAt: string | null;
  isLate: boolean;
  delayMinutes: number;
  hasOpenIssue: boolean;
  internalNote: string | null;
};

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

export const ISSUE_OPTIONS: Array<{ value: GarmentIssueType; label: string }> = [
  { value: 'STAIN_REMAINING', label: 'بقعة متبقية' },
  { value: 'BURN_MARK', label: 'أثر حرق' },
  { value: 'TEAR', label: 'تمزق' },
  { value: 'MISSING_BUTTON', label: 'زر مفقود' },
  { value: 'COLOR_DAMAGE', label: 'تلف لون' },
  { value: 'WRONG_ITEM', label: 'قطعة خاطئة' },
  { value: 'MISSING_ITEM', label: 'قطعة مفقودة' },
  { value: 'BAD_SMELL', label: 'رائحة كريهة' },
  { value: 'OTHER', label: 'أخرى' },
];

export function fetchWorkerTasks(token: string): Promise<WorkerTask[]> {
  return apiJson<WorkerTask[]>('/worker/tasks', { token });
}

export function acceptWorkerTask(token: string, garmentId: string): Promise<WorkerTask> {
  return apiJson<WorkerTask>(`/worker/tasks/${garmentId}/accept`, {
    method: 'POST',
    token,
  });
}

export function startWorkerTask(token: string, garmentId: string): Promise<WorkerTask> {
  return apiJson<WorkerTask>(`/worker/tasks/${garmentId}/start`, {
    method: 'POST',
    token,
  });
}

export function completeWorkerTask(token: string, garmentId: string): Promise<WorkerTask> {
  return apiJson<WorkerTask>(`/worker/tasks/${garmentId}/complete`, {
    method: 'POST',
    token,
  });
}

export function reportWorkerIssue(
  token: string,
  garmentId: string,
  body: { issueType: GarmentIssueType; notes?: string },
): Promise<WorkerTask> {
  return apiJson<WorkerTask>(`/worker/tasks/${garmentId}/report-issue`, {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export function addWorkerNote(
  token: string,
  garmentId: string,
  note: string,
): Promise<WorkerTask> {
  return apiJson<WorkerTask>(`/worker/tasks/${garmentId}/note`, {
    method: 'POST',
    token,
    body: JSON.stringify({ note }),
  });
}
