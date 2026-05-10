/**
 * V22 Phase 5 — Operational primitives barrel.
 *
 * Single import surface for the small, additive UX building blocks
 * introduced in V22 Phase 5. Importers MUST go through this barrel
 * so internals can be reshuffled without touching downstream pages.
 */
export {
  StickyActionBar,
  type StickyActionBarProps,
  type StickyActionBarItem,
  type StickyActionBarTone,
} from './StickyActionBar';
export {
  SmartActionChip,
  type SmartActionChipProps,
  type SmartActionTone,
} from './SmartActionChip';
