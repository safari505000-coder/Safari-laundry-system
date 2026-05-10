import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import type {
  WorkflowEvent,
  WorkflowItem,
  WorkflowKind,
  WorkflowPriority,
  WorkflowStatus,
} from '../collections-workflow.types';

const WORKFLOW_KINDS = ['CALLBACK', 'PROMISE', 'ESCALATION'] as const;
const WORKFLOW_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'BROKEN',
  'CANCELLED',
] as const;
const WORKFLOW_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

export class CreateWorkflowItemDto {
  @ApiProperty({ enum: WORKFLOW_KINDS })
  @IsString()
  @IsIn(WORKFLOW_KINDS as unknown as string[])
  kind!: WorkflowKind;

  @ApiProperty({ description: 'Customer the workflow item is attached to.' })
  @IsString()
  @MinLength(1)
  customerId!: string;

  @ApiPropertyOptional({ description: 'Snapshot of the customer name for display only.' })
  @IsOptional()
  @IsString()
  customerNameSnapshot?: string;

  @ApiPropertyOptional({ description: 'Optional invoice/order scope.' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp when the item is due.' })
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @ApiPropertyOptional({
    description:
      'Promise amount snapshot (display-only, never used in math). Format: "12.500".',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/)
  amountKdSnapshot?: string;

  @ApiPropertyOptional({ enum: WORKFLOW_PRIORITIES, default: 'NORMAL' })
  @IsOptional()
  @IsIn(WORKFLOW_PRIORITIES as unknown as string[])
  priority?: WorkflowPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Branch scope for the cockpit filter.' })
  @IsOptional()
  @IsString()
  branchId?: string;
}

export class TransitionWorkflowItemDto {
  @ApiProperty({ enum: WORKFLOW_STATUSES })
  @IsString()
  @IsIn(WORKFLOW_STATUSES as unknown as string[])
  nextStatus!: WorkflowStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ClaimWorkflowItemDto {
  @ApiPropertyOptional({ description: 'Set true to release ownership.' })
  @IsOptional()
  release?: boolean;
}

export class WorkflowItemQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: WORKFLOW_KINDS })
  @IsOptional()
  @IsIn(WORKFLOW_KINDS as unknown as string[])
  kind?: WorkflowKind;

  @ApiPropertyOptional({ enum: WORKFLOW_STATUSES })
  @IsOptional()
  @IsIn(WORKFLOW_STATUSES as unknown as string[])
  status?: WorkflowStatus;

  @ApiPropertyOptional({ description: 'Filter to items scheduled before this ISO timestamp.' })
  @IsOptional()
  @IsISO8601()
  scheduledBeforeIso?: string;

  @ApiPropertyOptional({ description: 'Filter to items scheduled after this ISO timestamp.' })
  @IsOptional()
  @IsISO8601()
  scheduledAfterIso?: string;
}

// Response shapes are intentionally re-exported as-is so the
// controller's response types stay aligned with the canonical
// WorkflowItem shape the service produces.
export type WorkflowItemResponse = WorkflowItem;
export type WorkflowEventResponse = WorkflowEvent;

export class WorkflowQueueSnapshotResponseDto {
  @ApiProperty({ type: 'array' })
  callbacks!: WorkflowItem[];

  @ApiProperty({ type: 'array' })
  promises!: WorkflowItem[];

  @ApiProperty({ type: 'array' })
  escalations!: WorkflowItem[];

  @ApiProperty()
  computedAt!: string;
}

// Force the DTO classes that need transformation to be used at runtime.
void Type;
