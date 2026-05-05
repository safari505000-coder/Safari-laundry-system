// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  // ─── SSoT GUARDRAIL — cash-monitor services ──────────────────────
  //
  // The single sanctioned source of per-driver cash is
  // `classified.drivers[].amount`, produced by `CashClassifierService`.
  // Every other layer (risk, monitor, exposure, explain, executive,
  // scope helpers, decision engine) MUST consume that value via the
  // helpers in `src/cash-monitor/driver-amount-map.ts`.
  //
  // This rule blocks the patterns we have personally watched introduce
  // drift more than once: re-summing per-driver totals with `parseFloat`,
  // accumulating amount strings into a local `+= amount`, or running a
  // `reduce(...amount...)` outside the SSoT helper. If you genuinely
  // need raw amount math (you almost never do), do it inside the
  // classifier OR add a new helper to `driver-amount-map.ts` and route
  // every consumer through it.
  //
  // The `files` glob is the *enforcement scope*, the `ignores` glob is
  // the *exemption list*: classifier (= the SSoT producer), the SSoT
  // helper itself, and the auditors whose entire job is to compare the
  // raw amounts each layer reports.
  {
    files: ['src/cash-monitor/**/*.ts'],
    ignores: [
      'src/cash-monitor/cash-classifier.service.ts',
      'src/cash-monitor/driver-amount-map.ts',
      'src/cash-monitor/integrity-audit.service.ts',
      'src/cash-monitor/driver-amount-audit.service.ts',
      'src/cash-monitor/system-verify.service.ts',
      'src/cash-monitor/dto/**',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // `parseFloat(<anything>.amount)` — re-parsing a raw KD
          // string outside the SSoT helper. Use
          // `getDriverAmountKd(amountMap, driverId)` instead.
          selector:
            "CallExpression[callee.name='parseFloat'] > MemberExpression.arguments[property.name='amount']",
          message:
            'SSoT VIOLATION: parseFloat(<x>.amount) is forbidden in cash-monitor services. Read per-driver cash via getDriverAmountKd(amountMap, driverId) — the only sanctioned source is classified.drivers[].amount.',
        },
        {
          // `Number(<anything>.amount)` — same drift surface as
          // `parseFloat`. The classifier emits fixed-4 KD strings;
          // every consumer must read them through the helper.
          selector:
            "CallExpression[callee.name='Number'] > MemberExpression.arguments[property.name='amount']",
          message:
            'SSoT VIOLATION: Number(<x>.amount) is forbidden in cash-monitor services. Use getDriverAmountKd(amountMap, driverId) instead.',
        },
        {
          // `<anything>.reduce((s, x) => s + parseFloat(x.amount), 0)` — the
          // classic re-aggregation pattern. We ban the inner expression so
          // the rule fires regardless of the reducer's exact shape.
          selector:
            "BinaryExpression[operator='+'] > CallExpression.right[callee.name='parseFloat'] > MemberExpression.arguments[property.name='amount']",
          message:
            'SSoT VIOLATION: re-aggregating amount strings (s + parseFloat(...amount)) is forbidden in cash-monitor services. Use sumClassifiedKd(classified) — the only sanctioned aggregator.',
        },
        {
          // `acc += parseFloat(<x>.amount)` — accumulator variant.
          selector:
            "AssignmentExpression[operator='+='] > CallExpression.right[callee.name='parseFloat'] > MemberExpression.arguments[property.name='amount']",
          message:
            'SSoT VIOLATION: `+= parseFloat(<x>.amount)` accumulates amounts outside the SSoT helper. Use sumClassifiedKd(classified) or getDriverAmountKd(amountMap, driverId).',
        },
      ],
    },
  },
);
