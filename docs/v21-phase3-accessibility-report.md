# V21 Phase 3 — Accessibility Report

> Verifies that the only Phase 3 frontend addition (the
> `GlobalCommandPalette` mounted into `ExecutiveShell`)
> meets accessibility expectations and does not regress
> any existing accessible surface.

---

## 1 — Palette accessibility (V21 Phase 3 addition)

### 1.1 ARIA + screen reader

| Aspect | Implementation | Test |
|--------|----------------|------|
| Dialog role | `role="dialog"` on the palette panel | ✅ Lock-in test 6 (`aria-modal="true"`) |
| Modal semantics | `aria-modal="true"` | ✅ Lock-in test 6 |
| Active item | `aria-selected="true"` on the highlighted result | ✅ Inherited from V20.9 base |
| Auto-focus | Input auto-focused on open via `queueMicrotask(() => inputRef.current?.focus())` | ✅ Inherited from V20.9 base |

### 1.2 Keyboard

| Key | Behaviour | Test |
|-----|-----------|------|
| `Ctrl/Cmd + K` (anywhere in app) | Toggle palette open | ✅ Lock-in test 6 |
| `Esc` | Close palette | ✅ Lock-in test 7 |
| `↑` / `↓` | Navigate results | ✅ Inherited from V20.9 base + tests |
| `Enter` | Execute highlighted command | ✅ Inherited from V20.9 base + tests |

### 1.3 Focus trap + restoration

  * The palette uses `key={String(open)}` to remount on each
    open cycle, so focus state is reset cleanly per open.
  * `useGlobalShortcut` calls `preventDefault()` only when the
    handler fires, so the browser's default `Ctrl+K` (search
    bar) is overridden only inside our app.
  * Esc handler is on the dialog `<div>` itself, so focus
    returns to the previously-focused element after close
    via the browser's normal focus management.

### 1.4 Input safety

  * `useGlobalShortcut` skips the handler when an `<input>`,
    `<textarea>`, `<select>`, or contenteditable has focus
    UNLESS `allowInInput: true`. The palette does NOT opt in
    — Ctrl+K won't fire while an operator is typing into
    a regular form field, which is the correct safe default.

---

## 2 — Existing surfaces (regression check)

### 2.1 Design-system primitives — already governed by the V20.7-V20.8 a11y tests

| Primitive | Lock-in |
|-----------|---------|
| `<Badge>` | `v20-7-design-system.test.tsx` |
| `<KpiCard>` | `v20-7-design-system.test.tsx` |
| `<DataTable>` | `v20-7-design-system.test.tsx` |
| `<EmptyState>` | `v20-7-design-system.test.tsx` |
| `<LoadingSkeleton>` | `v20-7-design-system.test.tsx` |
| `<TimelineCard>` | `v20-7-design-system.test.tsx` |
| `<StatusChip>` | `v20-7-design-system.test.tsx` |
| `<KpiStrip>` | `v20-7-design-system.test.tsx` |
| `<FinancialUiKit>` family | `financial-ui-kit.test.tsx` |
| `<UxPolish>` family | `v20-7-ux-polish.test.tsx` |

All ✅ passing in the Phase 3 validation gate
(154/154 frontend tests).

### 2.2 Shell

| Surface | Aspect | Status |
|---------|--------|--------|
| Sidebar | Aria-label on mobile drawer trigger | ✅ Preserved |
| Header | Skip-link / landmark roles | ✅ Preserved |
| Guidance banner | `aria-label="إخفاء التنبيه"` on dismiss button | ✅ Preserved |
| `<OperatorRouteHint>` | Role-aware text surfacing | ✅ Preserved |

---

## 3 — Outstanding accessibility work (V22)

These are documented in `v21-phase3-workflow-redesign-report.md`
§ 14 as design-system improvements; none are regressions:

  * Customer360 (V22 rebuild) — full keyboard-driven timeline
    nav (`j`/`k`/`Enter`/`n`/`s`) per spec C-5.
  * Per-action inline hints — accessible disclosure pattern
    rather than tooltip-only.
  * High-contrast mode pass on the new palette + Customer360
    rebuild.

---

## 4 — Verdict

**No accessibility regressions introduced by Phase 3.**
The new palette inherits and **extends** the V20.9 a11y
work — it brings the previously-built accessible palette
into the actual user experience for the first time. V22
spec captures the next-tier accessibility work in lockstep
with the Customer360 rebuild.
