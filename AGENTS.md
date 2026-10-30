# AGENTS.md

`@uinaf/oxlint-plugin-no-comments`: one Oxlint rule, `uinaf/no-comments`,
published to npm and loaded by consumers through `jsPlugins`. The
[README](README.md) is the rule's contract.

## Invariants

- The allowed comments match the comment rule in uinaf/ffss
  [`rules/implementation.md`](https://github.com/uinaf/ffss/blob/main/rules/implementation.md).
  Change both together.
- `SAFETY:` ownership mirrors anti-slop's
  `require-safety-comment-for-type-assertion`: a comment this rule rejects
  must be one that rule would not accept.
- The package has no runtime `dependencies`. `vp pack` bundles
  `@oxlint/plugins` into `dist/index.js`; `test/consumer.test.ts` loads that
  file through the package's own `exports`.
- `test/fixtures/` holds comments on purpose. Keep Oxfmt, Oxlint, and Vitest
  off it.
- The repo lints itself with `./src/index.ts`, so its own source follows the
  rule.
- Every push to `main` publishes to npm through
  [`release.yml`](.github/workflows/release.yml). Commit prefixes decide the
  version.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm exec vp config --no-agent   # git hooks
pnpm exec vp run verify          # format, lint, typecheck, pack, test
```

Oxlint's `RuleTester` reports 0-based columns.
