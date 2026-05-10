/**
 * V20.6 — Phase 6B Financial UI Kit barrel.
 *
 * Single import surface for every primitive a financial workflow
 * needs to display canonical numbers consistently. Always import
 * from this barrel — never reach into component files directly,
 * so a future re-export reshuffle stays internal.
 */
export { AgingBadge, type AgingBadgeProps, type AgingBucket } from './AgingBadge';
export { RiskBadge, type RiskBadgeProps, type RiskLevel } from './RiskBadge';
export { FraudBadge, type FraudBadgeProps, type FraudSeverity } from './FraudBadge';
export {
  CollectionsStageBadge,
  type CollectionsStageBadgeProps,
  type CollectionsStage,
} from './CollectionsStageBadge';
export {
  PromiseStatusBadge,
  type PromiseStatusBadgeProps,
  type PromiseStatus,
} from './PromiseStatusBadge';
export { DebtCard, type DebtCardProps } from './DebtCard';
export { TimelineCard, type TimelineCardProps, type TimelineKind } from './TimelineCard';
export {
  ReconciliationStatus,
  type ReconciliationStatusProps,
  type ReconciliationOverallStatus,
} from './ReconciliationStatus';
export { MoneyFlowCard, type MoneyFlowCardProps } from './MoneyFlowCard';
export {
  FinancialHealthIndicator,
  type FinancialHealthIndicatorProps,
} from './FinancialHealthIndicator';
export { WindowedList, type WindowedListProps } from './WindowedList';

// V20.7 — Phase 3 additions
export {
  PaymentStatusChip,
  type PaymentStatus,
  type PaymentStatusChipProps,
} from './PaymentStatusChip';
export { BranchBadge, type BranchBadgeProps } from './BranchBadge';
export { KPIWidget, type KPIWidgetProps, type KPITone } from './KPIWidget';
export {
  FinancialStatCard,
  type FinancialStatCardProps,
} from './FinancialStatCard';
export { RiskIndicator, type RiskIndicatorProps } from './RiskIndicator';
export {
  CustomerFinancialHeader,
  type CustomerFinancialHeaderProps,
} from './CustomerFinancialHeader';
export {
  OutstandingTable,
  type OutstandingTableProps,
  type OutstandingRow,
} from './OutstandingTable';
export {
  FinancialTimeline,
  type FinancialTimelineProps,
  type FinancialTimelineRow,
} from './FinancialTimeline';
export {
  JournalEntryCard,
  type JournalEntryCardProps,
} from './JournalEntryCard';
export {
  SkeletonLine,
  SkeletonCircle,
  SkeletonDebtCard,
  SkeletonRow,
  SkeletonTable,
} from './Skeleton';
export {
  EmptyState,
  type EmptyStateProps,
  type EmptyStateTone,
} from './EmptyState';
export {
  FinancialErrorBoundary,
  type FinancialErrorBoundaryProps,
} from './FinancialErrorBoundary';

// V20.7 — Phase 8 UX polish primitives
export {
  BulkActionBar,
  type BulkActionBarProps,
  type BulkAction,
} from './BulkActionBar';
export {
  KeyboardShortcutHelp,
  type KeyboardShortcutHelpProps,
  type ShortcutHelpEntry,
} from './KeyboardShortcutHelp';

// V20.8.1 — Phase 7 explicit financial breakdown surface
export {
  Customer360FinancialBreakdown,
  type Customer360FinancialBreakdownProps,
} from './Customer360FinancialBreakdown';
