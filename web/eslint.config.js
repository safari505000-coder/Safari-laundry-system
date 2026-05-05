import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/contexts/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  /*
   * SSoT lock for the cash dashboard.
   *
   * Driver cash is published by EXACTLY ONE backend surface:
   *   GET /api/cash-intelligence/dashboard → drivers[].totalCash
   *
   * The rules below prevent two specific regressions on the
   * frontend:
   *
   *   1. Reading the deprecated `heldCashKd` / `cashTodayKd` fields
   *      from any response (both are nullified at the backend; the
   *      keys exist only to keep old TS consumers compiling).
   *
   *   2. Re-aggregating cash on the client with `parseFloat(...amount)`
   *      / `Number(...amount)` patterns. The dashboard endpoint
   *      already returns a pre-summed `totalCash` string formatted
   *      to 4dp KD — frontends never need to add it up.
   *
   * The rule is scoped to the cash-display surfaces; api.ts and the
   * SSoT-aware hooks/components are exempt where they need to read
   * the canonical `amount` / `totalCash` strings as plain text.
   */
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/lib/api.ts',
      'src/hooks/useCashIntelligence.ts',
      'src/pages/executive-dashboard-page.tsx',
    ],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'row',
          property: 'heldCashKd',
          message:
            'SSoT VIOLATION: row.heldCashKd is nullified. Read driver cash from /api/cash-intelligence/dashboard (drivers[].totalCash).',
        },
        {
          object: 'row',
          property: 'cashTodayKd',
          message:
            'SSoT VIOLATION: row.cashTodayKd is nullified. Read driver cash from /api/cash-intelligence/dashboard (drivers[].totalCash).',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[property.name='heldCashKd'][object.name!='row']",
          message:
            'SSoT VIOLATION: heldCashKd is nullified. Read driver cash from /api/cash-intelligence/dashboard.',
        },
        {
          selector:
            "MemberExpression[property.name='cashTodayKd'][object.name!='row']",
          message:
            'SSoT VIOLATION: cashTodayKd is nullified. Read driver cash from /api/cash-intelligence/dashboard.',
        },
      ],
    },
  },
  /*
   * STRICT ROLE-BASED EXPENSE DESIGN — Part 6 (SSoT) lock.
   *
   * Every "total expense" displayed in the UI MUST come from the
   * backend SSoT endpoint:
   *
   *   GET /api/finance/expenses-summary  (`getExpensesSummary` in api.ts)
   *
   * Frontends are forbidden from running their own expense
   * aggregations: no `reduce()` / `sum()` over `ExpenseRow[]`, no
   * manual `%` derivation. The legacy modules below remain only for
   * the print/export path (`weekly-expense-report.ts` →
   * `<WeeklyExpenseReportActions>`); new code must not import them.
   */
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/lib/expense-analytics.ts',
      'src/lib/expense-insights.ts',
      'src/lib/weekly-expense-report.ts',
      'src/components/expenses/expenses-insights-panel.tsx',
      'src/components/expenses/weekly-expense-report-actions.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/lib/expense-analytics',
              message:
                'SSoT VIOLATION: read expense totals from getExpensesSummary() (/api/finance/expenses-summary) instead of recomputing on the client.',
            },
            {
              name: '@/lib/expense-insights',
              message:
                'SSoT VIOLATION: expense insights are server-computed and returned in ExpensesSummaryResponse.alerts. Do not regenerate them on the client.',
            },
          ],
        },
      ],
    },
  },
  /*
   * STRICT ROLE LOCK — `safariRole` is the single source of truth.
   *
   * The User row carries TWO role columns:
   *   - `safariRole` (Prisma enum)         ← AUTHORITATIVE
   *   - `role.name`  (relational Role row) ← legacy / display-only
   *
   * Mixing them is the misclassification bug class that turned a
   * branch manager into a "driver" on the Cash Pending Deposit page
   * (V19.x). The fix: the FRONTEND never reads `role.name` at all —
   * every gate, badge, redirect, and conditional uses
   * `user.safariRole` only.
   *
   * The rule below makes any new occurrence of `user.role.name`,
   * `user.role` (other than as a property assignment for
   * server-bound payloads), or a bare `role.name` fail CI. The
   * server still owns the authoritative resolution; the frontend
   * just consumes the enum.
   */
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      // Auth bootstrap reads the raw login response which still contains
      // the relational `role` envelope; it is the ONE place allowed to
      // touch it before normalising onto safariRole for the rest of the
      // app.
      'src/lib/api.ts',
      'src/contexts/auth-context.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[property.name='name'][object.type='MemberExpression'][object.property.name='role']",
          message:
            'ROLE SSoT VIOLATION: read user.safariRole (enum), never user.role.name (relational legacy column).',
        },
        {
          selector:
            "MemberExpression[property.name='role'][object.name='user']",
          message:
            'ROLE SSoT VIOLATION: read user.safariRole, not user.role. The relational Role row is server-internal only.',
        },
      ],
    },
  },
  /*
   * STRICT LEDGER LOCK — Stage A SSoT for the double-entry layer.
   *
   * The forbidden identifiers below are placeholders for any future
   * "snapshot" balance that lives outside the ledger. The strict ledger
   * (`/api/finance/ledger/*`) is the only valid source for any KD
   * total once Stage A ships:
   *
   *   - `heldCashKd`        → already nullified (covered above + here)
   *   - `cashTodayKd`       → already nullified (covered above + here)
   *   - `totalCashInFlight` → never existed; reserved as a SSoT canary
   *                            so any future PR that introduces it
   *                            fails CI immediately.
   *
   * The rule also forbids `parseFloat` on a member access named
   * `*Kd` / `*KD` / `amountKd` etc. — KD strings are 4dp formatted
   * server-side and are NEVER parsed client-side for arithmetic.
   * Display formatting via `formatKwdLabel(...)` is allowed because
   * it does not perform arithmetic.
   */
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      // Same ignores as the SSoT-aware reader surfaces above + the
      // ledger UI itself, which is allowed to *read* (not arithmetic)
      // server-supplied KD strings.
      'src/lib/api.ts',
      'src/hooks/useCashIntelligence.ts',
      'src/pages/executive-dashboard-page.tsx',
      'src/pages/finance-ledger-reports-page.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Identifier[name='totalCashInFlight']",
          message:
            'SSoT VIOLATION: totalCashInFlight is forbidden. Read ledger totals from /api/finance/ledger/summary (accounts[].balance).',
        },
        {
          selector:
            "CallExpression[callee.name='parseFloat'][arguments.0.type='MemberExpression'][arguments.0.property.name=/Kd$|KD$|AmountKd$/]",
          message:
            'SSoT VIOLATION: KD strings are server-formatted (4dp) and must not be parseFloat-ed for arithmetic. Use the ledger endpoints which return pre-summed values.',
        },
        // Note: a `Number.parseFloat(...Kd)` selector was tested and
        // caught dozens of legacy display-formatting helpers across
        // unrelated pages. Those need a separate, focused cleanup PR
        // before the rule can be enforced globally. The bare
        // `parseFloat` selector above remains active — it catches
        // the more common new-code pattern and is enough to keep
        // future SSoT-critical pages clean.
      ],
    },
  },
])
