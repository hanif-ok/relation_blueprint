import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// ESLint 10 only supports flat config (eslintrc is removed). This replaces the
// .eslintrc.cjs named in the plan — see SUMMARY deviations.

/**
 * rb-e2e/no-async-wait-predicate (quick-260903-f5x) — ban `page.waitForFunction(async …)`.
 *
 * WHY. Playwright does NOT await the promise a `waitForFunction` predicate returns. It tests the
 * returned value for TRUTHINESS, and a `Promise` is always truthy — so an async predicate makes the
 * wait resolve on its very first poll no matter what the predicate would have evaluated to. Every
 * such call site is a no-op that always passes, silently disarming the assertion.
 *
 * PROVEN, not theorised (D77-DEF-1). During quick-260903-d77, with the marquee coordinate
 * conversion deliberately bypassed, a `page.evaluate` read showed the band had caught only one of
 * two rects — survivors `["shape-a"]` — while the sibling
 * `waitForFunction(async … => m.shapes.length === 0)` over that exact state still went GREEN.
 * quick-260903-f5x re-armed 12 such sites across 6 specs; one had been hiding a real product
 * defect and another a real test bug, both invisible for as long as the wait was vacuous.
 *
 * WHY AN AST RULE RATHER THAN A GREP. The predicate sits on the line AFTER `.waitForFunction(`
 * opens in every multi-line call, so a line-oriented grep either misses all of them or miscounts
 * unrelated sites — which is exactly what happened: the first census reported "~28 across 11
 * specs" when the true figure was 12 across 6. Reading the call expression's first argument cannot
 * make that mistake.
 *
 * NOT REPORTED: a NON-async predicate returning a plain boolean is correct and idiomatic. 121 of
 * the suite's 133 call sites are exactly that (the `() => !!window.__rb` bridge barrier, and
 * synchronous Konva/Cytoscape scene-graph reads). This rule leaves every one of them alone.
 */
const rbE2ePlugin = {
  rules: {
    'no-async-wait-predicate': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Disallow an async predicate in page.waitForFunction — it is never awaited, so the wait always passes.',
        },
        schema: [],
        messages: {
          asyncPredicate:
            'page.waitForFunction() does not await its predicate — an async one returns a Promise, which is always truthy, so this wait passes unconditionally (D77-DEF-1). Use `await expect.poll(() => page.evaluate(async …), { timeout }).toEqual(…)`, or `await expect(async () => { … }).toPass({ timeout })` when a numeric tolerance is involved.',
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            const callee = node.callee;
            if (callee.type !== 'MemberExpression') return;
            const prop = callee.property;
            const name = prop.type === 'Identifier' ? prop.name : undefined;
            if (name !== 'waitForFunction') return;
            const first = node.arguments[0];
            if (!first) return;
            if (
              (first.type === 'ArrowFunctionExpression' || first.type === 'FunctionExpression') &&
              first.async === true
            ) {
              context.report({ node: first, messageId: 'asyncPredicate' });
            }
          },
        };
      },
    },
  },
};

export default tseslint.config(
  { ignores: ['dist', 'playwright-report', 'test-results', 'coverage', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  // The vacuous-wait guard. Scoped to the e2e specs, which are the only place `waitForFunction`
  // is called. `npm run lint` is `eslint .` and e2e/ is not ignored, so this cannot be forgotten.
  {
    files: ['e2e/**/*.ts'],
    plugins: { 'rb-e2e': rbE2ePlugin },
    rules: { 'rb-e2e/no-async-wait-predicate': 'error' },
  },
);
