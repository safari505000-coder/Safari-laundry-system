import { GarmentStage, ProductionWorkType, ServiceType } from '@prisma/client';

/**
 * Normal forward production pipeline. Exception stages (QUALITY_HOLD,
 * REWORK, REPAIR, DAMAGED_REVIEW, LOST_REVIEW) are entered only through
 * the issue / decision workflow, never by the linear worker `complete`
 * path, so they are intentionally absent from this map.
 */
const FORWARD_PIPELINE: GarmentStage[] = [
  GarmentStage.RECEIVED,
  GarmentStage.SORTING,
  GarmentStage.WASHING,
  GarmentStage.DRYING,
  GarmentStage.IRONING,
  GarmentStage.PACKING,
  GarmentStage.QC_CHECK,
  GarmentStage.READY,
];

/** Stages a worker can actively process (RECEIVED..QC_CHECK). */
export const WORKABLE_STAGES: GarmentStage[] = [
  GarmentStage.RECEIVED,
  GarmentStage.SORTING,
  GarmentStage.WASHING,
  GarmentStage.DRYING,
  GarmentStage.IRONING,
  GarmentStage.PACKING,
  GarmentStage.QC_CHECK,
];

/** Terminal / manager-only exception stages a worker must NOT act on. */
export const EXCEPTION_STAGES: GarmentStage[] = [
  GarmentStage.QUALITY_HOLD,
  GarmentStage.REWORK,
  GarmentStage.REPAIR,
  GarmentStage.DAMAGED_REVIEW,
  GarmentStage.LOST_REVIEW,
];

/** Returns the next normal stage after `stage`, or null if terminal. */
export function nextStage(stage: GarmentStage): GarmentStage | null {
  const idx = FORWARD_PIPELINE.indexOf(stage);
  if (idx < 0 || idx >= FORWARD_PIPELINE.length - 1) {
    return null;
  }
  return FORWARD_PIPELINE[idx + 1];
}

/** Worker specialisation that owns a given stage (null = general/sorter). */
export function workTypeForStage(
  stage: GarmentStage,
): ProductionWorkType | null {
  switch (stage) {
    case GarmentStage.WASHING:
      return ProductionWorkType.WASHING_WORKER;
    case GarmentStage.DRYING:
      return ProductionWorkType.DRYING_WORKER;
    case GarmentStage.IRONING:
      return ProductionWorkType.IRONING_WORKER;
    case GarmentStage.PACKING:
      return ProductionWorkType.PACKING_WORKER;
    case GarmentStage.QC_CHECK:
      return ProductionWorkType.QC_WORKER;
    default:
      return null;
  }
}

export function isWorkableStage(stage: GarmentStage): boolean {
  return WORKABLE_STAGES.includes(stage);
}

/**
 * Handoff-accept SLA (minutes): how long the next stage may sit in
 * WAITING_NEXT_STAGE before it is flagged DELAYED_HANDOFF. EXPRESS work
 * gets a tighter window.
 */
export function handoffSlaMinutes(serviceType: ServiceType): number {
  return serviceType === ServiceType.EXPRESS ? 15 : 30;
}

/** Whole-garment turnaround SLA (minutes) used for `expectedReadyAt`. */
export function readySlaMinutes(serviceType: ServiceType): number {
  return serviceType === ServiceType.EXPRESS ? 4 * 60 : 48 * 60;
}
