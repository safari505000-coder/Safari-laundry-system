/**
 * V20.9 — Phase 4 Command Palette type surface.
 *
 * Extracted from the component file so `rank-commands.ts` and the
 * component can share types without violating the
 * `react-refresh/only-export-components` rule.
 */
export type PaletteCommand = {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: ReadonlyArray<string>;
  group?: string;
  shortcut?: string;
  hideFromDefault?: boolean;
  critical?: boolean;
  run: (ctx: { query: string }) => void | Promise<void>;
};
