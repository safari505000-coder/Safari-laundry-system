import { type ReactElement, useMemo } from 'react';
import { CollectionsActionBar, type ActionItem } from '../components/CollectionsActionBar';
import {
  CollectionsWorkspaceHero,
  type CollectionsHeroData,
} from '../components/CollectionsWorkspaceHero';
import { CollectionsTimelinePanel } from '../components/CollectionsTimelinePanel';
import { CollectionsKpiStrip } from '../components/CollectionsKpiStrip';
import { useCollectorShortcuts } from '../hooks/use-collector-shortcuts';
import type { WorkspaceTimelineRow, WorkspaceNote } from '../types/workspace';
import type { ObservabilityOverview } from '@/modules/finance';

/**
 * V20.6 — Phase 7 Collections Operations Workspace.
 *
 * Single-screen page that combines:
 *   • Hero — DebtCard + signal strip (aging / risk / fraud / promise)
 *   • KPI strip — system-wide observability snapshot
 *   • Timeline — virtualized customer history
 *   • Notes panel — collector free-form notes (read-only here; the
 *     dedicated mutation modal lives outside)
 *   • Sticky action bar — Alt+P, Alt+M, Alt+E shortcuts wired
 *
 * The page is **presentational**: it accepts pre-loaded data via
 * props and emits intent through callbacks. The route shell (also
 * in this module) is responsible for wiring data + auth + dispatch.
 * This separation keeps the workspace fully testable in isolation
 * with zero network mocking.
 */

export type CollectionsWorkspaceCallbacks = {
  onRecordPayment: () => void;
  onSchedulePromise: () => void;
  onEscalate: () => void;
  onAddNote: () => void;
  onOpenObservability?: () => void;
  onOpenFraud?: () => void;
};

export type CollectionsOperationsWorkspaceProps = {
  hero: CollectionsHeroData;
  timeline: ReadonlyArray<WorkspaceTimelineRow>;
  timelineLoading?: boolean;
  notes: ReadonlyArray<WorkspaceNote>;
  observability?: ObservabilityOverview | null;
  observabilityLoading?: boolean;
  observabilityError?: string | null;
  callbacks: CollectionsWorkspaceCallbacks;
  locale?: 'en' | 'ar';
  className?: string;
};

export function CollectionsOperationsWorkspace(
  props: CollectionsOperationsWorkspaceProps,
): ReactElement {
  const isAr = (props.locale ?? 'ar') === 'ar';

  // Stable identity so the shortcut hook does not re-bind on every render
  const shortcutMap = useMemo(
    () => ({
      'Alt+P': props.callbacks.onRecordPayment,
      'Alt+M': props.callbacks.onSchedulePromise,
      'Alt+E': props.callbacks.onEscalate,
      'Alt+N': props.callbacks.onAddNote,
    }),
    [
      props.callbacks.onRecordPayment,
      props.callbacks.onSchedulePromise,
      props.callbacks.onEscalate,
      props.callbacks.onAddNote,
    ],
  );

  useCollectorShortcuts(shortcutMap);

  const actions: ActionItem[] = [
    {
      id: 'pay',
      label: isAr ? 'تسجيل دفعة' : 'Record payment',
      shortcutLabel: 'Alt+P',
      tone: 'success',
      onClick: props.callbacks.onRecordPayment,
    },
    {
      id: 'promise',
      label: isAr ? 'وعد بالسداد' : 'Schedule promise',
      shortcutLabel: 'Alt+M',
      tone: 'primary',
      onClick: props.callbacks.onSchedulePromise,
    },
    {
      id: 'escalate',
      label: isAr ? 'تصعيد' : 'Escalate',
      shortcutLabel: 'Alt+E',
      tone: 'warn',
      onClick: props.callbacks.onEscalate,
    },
    {
      id: 'note',
      label: isAr ? 'ملاحظة' : 'Add note',
      shortcutLabel: 'Alt+N',
      tone: 'ghost',
      onClick: props.callbacks.onAddNote,
    },
  ];

  return (
    <main
      className={`flex min-h-screen flex-col gap-3 p-3 lg:p-4 ${props.className ?? ''}`}
      dir={isAr ? 'rtl' : 'ltr'}
      aria-label="Collections Operations Workspace"
    >
      <CollectionsKpiStrip
        overview={props.observability}
        loading={props.observabilityLoading}
        error={props.observabilityError}
        onOpenObservability={props.callbacks.onOpenObservability}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-3">
          <CollectionsWorkspaceHero
            data={props.hero}
            onOpenFraud={props.callbacks.onOpenFraud}
            locale={props.locale}
          />
          <NotesPanel notes={props.notes} locale={props.locale} />
        </div>
        <CollectionsTimelinePanel
          rows={props.timeline}
          loading={props.timelineLoading}
          locale={props.locale}
        />
      </div>

      <div className="sticky bottom-2 z-10">
        <CollectionsActionBar actions={actions} />
      </div>
    </main>
  );
}

function NotesPanel({
  notes,
  locale = 'ar',
}: {
  notes: ReadonlyArray<WorkspaceNote>;
  locale?: 'en' | 'ar';
}): ReactElement {
  return (
    <section
      aria-label="Collector notes"
      className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <header className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {locale === 'ar' ? 'الملاحظات' : 'Notes'}
        </h3>
        <span className="text-[0.65rem] uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {notes.length}
        </span>
      </header>
      {notes.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
          {locale === 'ar' ? 'لا توجد ملاحظات' : 'No notes yet'}
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.slice(0, 8).map((n) => (
            <li
              key={n.id}
              className="rounded-md bg-slate-50 p-2 text-xs dark:bg-slate-800/40"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {n.authorName}
                </span>
                <time className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                  {new Date(n.createdAt).toLocaleString(
                    locale === 'ar' ? 'ar' : 'en',
                  )}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                {n.bodyMd}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
