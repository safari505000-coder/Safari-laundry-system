/**
 * V23.1 Phase 7 — Collections Workflow module barrel.
 *
 * Public surface for the visibility-only operational workflow layer
 * powering the Collections cockpit. Importers MUST go through this
 * file — never reach into nested files directly.
 */

export type {
  CreateWorkflowItemInput,
  WorkflowEvent,
  WorkflowItem,
  WorkflowKind,
  WorkflowPriority,
  WorkflowQueueSnapshot,
  WorkflowStatus,
} from './types';

export {
  claimWorkflowItem,
  createWorkflowItem,
  getWorkflowItem,
  getWorkflowQueueSnapshot,
  listWorkflowItems,
  transitionWorkflowItem,
} from './collections-workflow-api';
export type { ListWorkflowItemsQuery } from './collections-workflow-api';

export { useCollectionsWorkflow } from './use-collections-workflow';
export type {
  UseCollectionsWorkflowOptions,
  UseCollectionsWorkflowResult,
} from './use-collections-workflow';

export { WorkflowItemCard } from './WorkflowItemCard';
export type { WorkflowItemCardProps } from './WorkflowItemCard';

export { WorkflowLanes } from './WorkflowLanes';
export type { WorkflowLaneActions, WorkflowLanesProps } from './WorkflowLanes';

export { WorkflowQuickAddModal } from './WorkflowQuickAddModal';
export type { WorkflowQuickAddModalProps } from './WorkflowQuickAddModal';
