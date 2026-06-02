-- PRODUCTION WORKER LAYER (Garment Lifecycle)
-- Additive only. Creates new enums + tables for the WORKER production
-- function. No existing table/column/type is altered or dropped, so
-- accounting, POS, invoice and payment logic are untouched.

-- CreateEnum
CREATE TYPE "GarmentStage" AS ENUM ('RECEIVED', 'SORTING', 'WASHING', 'DRYING', 'IRONING', 'PACKING', 'QC_CHECK', 'READY', 'DELIVERED', 'QUALITY_HOLD', 'REWORK', 'REPAIR', 'DAMAGED_REVIEW', 'LOST_REVIEW');

-- CreateEnum
CREATE TYPE "ProductionWorkType" AS ENUM ('WASHING_WORKER', 'DRYING_WORKER', 'IRONING_WORKER', 'PACKING_WORKER', 'QC_WORKER');

-- CreateEnum
CREATE TYPE "GarmentTaskStatus" AS ENUM ('WAITING_NEXT_STAGE', 'ACCEPTED_BY_WORKER', 'IN_PROGRESS', 'COMPLETED', 'QUALITY_HOLD');

-- CreateEnum
CREATE TYPE "StageHandoffStatus" AS ENUM ('WAITING_NEXT_STAGE', 'ACCEPTED_BY_NEXT_WORKER', 'DELAYED_HANDOFF', 'ESCALATED');

-- CreateEnum
CREATE TYPE "GarmentStageAction" AS ENUM ('ACCEPTED', 'STARTED', 'COMPLETED', 'HANDED_OFF', 'DELAYED', 'ISSUE_REPORTED', 'DECISION_MADE', 'REWORK_SENT', 'READY_MARKED');

-- CreateEnum
CREATE TYPE "GarmentIssueType" AS ENUM ('STAIN_REMAINING', 'BURN_MARK', 'TEAR', 'MISSING_BUTTON', 'COLOR_DAMAGE', 'WRONG_ITEM', 'MISSING_ITEM', 'BAD_SMELL', 'OTHER');

-- CreateEnum
CREATE TYPE "GarmentIssueStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'REWORKING', 'REPAIRED', 'DAMAGED', 'LOST', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProductionDecisionType" AS ENUM ('REWASH', 'REIRON', 'REPAIR', 'APPROVE_AS_READY', 'ESCALATE_TO_OWNER', 'MARK_DAMAGED', 'MARK_LOST');

-- CreateTable
CREATE TABLE "Garment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "orderLineItemId" UUID,
    "branchId" UUID NOT NULL,
    "label" TEXT,
    "serviceType" "ServiceType" NOT NULL DEFAULT 'NORMAL',
    "currentStage" "GarmentStage" NOT NULL DEFAULT 'RECEIVED',
    "taskStatus" "GarmentTaskStatus" NOT NULL DEFAULT 'WAITING_NEXT_STAGE',
    "handoffStatus" "StageHandoffStatus" NOT NULL DEFAULT 'WAITING_NEXT_STAGE',
    "assignedWorkerId" UUID,
    "acceptedByUserId" UUID,
    "acceptedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "handoffFromStage" "GarmentStage",
    "waitingSince" TIMESTAMP(3),
    "expectedAcceptBy" TIMESTAMP(3),
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "expectedReadyAt" TIMESTAMP(3),
    "hasOpenIssue" BOOLEAN NOT NULL DEFAULT false,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Garment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GarmentStageEvent" (
    "id" UUID NOT NULL,
    "garmentId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "fromStage" "GarmentStage",
    "toStage" "GarmentStage" NOT NULL,
    "actorUserId" UUID,
    "action" "GarmentStageAction" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GarmentStageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerProductionLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "stage" "GarmentStage" NOT NULL,
    "garmentId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "action" "GarmentStageAction" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "issueReported" BOOLEAN NOT NULL DEFAULT false,
    "issueAttributedToUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerProductionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GarmentIssue" (
    "id" UUID NOT NULL,
    "garmentId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "reportedByUserId" UUID,
    "stage" "GarmentStage" NOT NULL,
    "previousStage" "GarmentStage",
    "previousActorUserId" UUID,
    "issueType" "GarmentIssueType" NOT NULL,
    "status" "GarmentIssueStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "GarmentIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionDecision" (
    "id" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "garmentId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "decidedByUserId" UUID,
    "decision" "ProductionDecisionType" NOT NULL,
    "notes" TEXT,
    "nextStage" "GarmentStage",
    "customerContactRequired" BOOLEAN NOT NULL DEFAULT false,
    "compensationRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Garment_orderId_idx" ON "Garment"("orderId");
CREATE INDEX "Garment_branchId_idx" ON "Garment"("branchId");
CREATE INDEX "Garment_branchId_currentStage_idx" ON "Garment"("branchId", "currentStage");
CREATE INDEX "Garment_assignedWorkerId_idx" ON "Garment"("assignedWorkerId");
CREATE INDEX "Garment_taskStatus_idx" ON "Garment"("taskStatus");
CREATE INDEX "Garment_handoffStatus_idx" ON "Garment"("handoffStatus");
CREATE INDEX "Garment_hasOpenIssue_idx" ON "Garment"("hasOpenIssue");

-- CreateIndex
CREATE INDEX "GarmentStageEvent_garmentId_createdAt_idx" ON "GarmentStageEvent"("garmentId", "createdAt");
CREATE INDEX "GarmentStageEvent_orderId_idx" ON "GarmentStageEvent"("orderId");
CREATE INDEX "GarmentStageEvent_branchId_createdAt_idx" ON "GarmentStageEvent"("branchId", "createdAt");
CREATE INDEX "GarmentStageEvent_actorUserId_idx" ON "GarmentStageEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "WorkerProductionLog_userId_createdAt_idx" ON "WorkerProductionLog"("userId", "createdAt");
CREATE INDEX "WorkerProductionLog_branchId_stage_idx" ON "WorkerProductionLog"("branchId", "stage");
CREATE INDEX "WorkerProductionLog_garmentId_idx" ON "WorkerProductionLog"("garmentId");
CREATE INDEX "WorkerProductionLog_orderId_idx" ON "WorkerProductionLog"("orderId");

-- CreateIndex
CREATE INDEX "GarmentIssue_garmentId_idx" ON "GarmentIssue"("garmentId");
CREATE INDEX "GarmentIssue_orderId_idx" ON "GarmentIssue"("orderId");
CREATE INDEX "GarmentIssue_branchId_status_idx" ON "GarmentIssue"("branchId", "status");
CREATE INDEX "GarmentIssue_status_idx" ON "GarmentIssue"("status");

-- CreateIndex
CREATE INDEX "ProductionDecision_issueId_idx" ON "ProductionDecision"("issueId");
CREATE INDEX "ProductionDecision_garmentId_idx" ON "ProductionDecision"("garmentId");
CREATE INDEX "ProductionDecision_orderId_idx" ON "ProductionDecision"("orderId");
CREATE INDEX "ProductionDecision_decidedByUserId_idx" ON "ProductionDecision"("decidedByUserId");

-- AddForeignKey
ALTER TABLE "GarmentStageEvent" ADD CONSTRAINT "GarmentStageEvent_garmentId_fkey" FOREIGN KEY ("garmentId") REFERENCES "Garment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerProductionLog" ADD CONSTRAINT "WorkerProductionLog_garmentId_fkey" FOREIGN KEY ("garmentId") REFERENCES "Garment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarmentIssue" ADD CONSTRAINT "GarmentIssue_garmentId_fkey" FOREIGN KEY ("garmentId") REFERENCES "Garment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionDecision" ADD CONSTRAINT "ProductionDecision_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "GarmentIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
