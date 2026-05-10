import type { PaletteCommand } from './command-types';

/**
 * V20.9 — Phase 4 pure ranking helper for the Command Palette.
 *
 * Extracted from `CommandPalette.tsx` so the component file
 * exports ONLY a component (react-refresh rule). Logic is
 * unchanged and 100% covered by the V20.9 palette tests.
 */
export function rankCommands(
  commands: ReadonlyArray<PaletteCommand>,
  query: string,
  defaultIds?: ReadonlyArray<string>,
): PaletteCommand[] {
  const q = query.trim().toLowerCase();
  if (q === '') {
    if (defaultIds && defaultIds.length > 0) {
      const map = new Map(commands.map((c) => [c.id, c]));
      const acc: PaletteCommand[] = [];
      for (const id of defaultIds) {
        const c = map.get(id);
        if (c) acc.push(c);
      }
      for (const c of commands) {
        if (defaultIds.includes(c.id)) continue;
        if (c.hideFromDefault) continue;
        acc.push(c);
      }
      return acc;
    }
    return commands.filter((c) => !c.hideFromDefault);
  }
  const scored: { cmd: PaletteCommand; score: number }[] = [];
  for (const cmd of commands) {
    const haystack = [cmd.title, cmd.subtitle ?? '', ...(cmd.keywords ?? [])]
      .join(' ')
      .toLowerCase();
    const idx = haystack.indexOf(q);
    if (idx === -1) continue;
    const titleHit = cmd.title.toLowerCase().includes(q) ? 100 : 0;
    scored.push({ cmd, score: 1000 - idx + titleHit });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.cmd.title.localeCompare(b.cmd.title);
  });
  return scored.map((s) => s.cmd);
}
