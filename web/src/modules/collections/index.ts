/**
 * V20.6 — Phase 7 collections module barrel.
 *
 * Public surface for `modules/collections`. Importers MUST go
 * through this file — never reach into nested folders directly.
 */

export {
  CollectionsOperationsWorkspace,
  type CollectionsOperationsWorkspaceProps,
  type CollectionsWorkspaceCallbacks,
} from './pages/CollectionsOperationsWorkspace';
// V20.7 — Phase 5 split-view shell
export {
  CollectionsWorkspaceShell,
  type CollectionsWorkspaceShellProps,
} from './pages/CollectionsWorkspaceShell';
export {
  CollectionsQueuePanel,
  type CollectionsQueuePanelProps,
  type QueueCustomer,
} from './components/CollectionsQueuePanel';
export {
  CollectionsQuickActionsPanel,
  type CollectionsQuickActionsPanelProps,
  type QuickShortcut,
} from './components/CollectionsQuickActionsPanel';
export {
  CollectionsActionBar,
  type ActionItem,
  type CollectionsActionBarProps,
} from './components/CollectionsActionBar';
export {
  CollectionsKpiStrip,
  type CollectionsKpiStripProps,
} from './components/CollectionsKpiStrip';
export {
  CollectionsWorkspaceHero,
  type CollectionsWorkspaceHeroProps,
  type CollectionsHeroData,
} from './components/CollectionsWorkspaceHero';
export {
  CollectionsTimelinePanel,
  type CollectionsTimelinePanelProps,
} from './components/CollectionsTimelinePanel';
export {
  useCollectorShortcuts,
  type ShortcutMap,
} from './hooks/use-collector-shortcuts';
export type {
  WorkspacePromise,
  WorkspaceNote,
  WorkspaceTimelineRow,
} from './types/workspace';
// V20.9 — Phase 3 Smart Action Engine + Assistant Panel
export {
  recommendActions,
  paymentProbabilityTier,
  type SmartAction,
  type SmartActionId,
  type SmartActionInput,
} from './workflow/smart-action-engine';
export {
  CollectionsAssistantPanel,
  type CollectionsAssistantPanelProps,
} from './components/CollectionsAssistantPanel';
