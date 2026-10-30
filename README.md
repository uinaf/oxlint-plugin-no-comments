# @uinaf/oxlint-plugin-no-comments

An Oxlint rule that bans code comments. Names, types, and tests carry intent;
the commit message carries the why.

```ts
// Parse the id before saving.         ✗ uinaf/no-comments
const id = parse(raw);

// SAFETY: parse() checked the brand.  ✓ anti-slop requires it
const user = id as UserId;

/** Load a user by id. */              ✓ exported API docs
export function load(id: UserId) {}
```

## Install

```bash
pnpm add -D @uinaf/oxlint-plugin-no-comments
```

`.oxlintrc.json`:

```json
{
  "jsPlugins": ["@uinaf/oxlint-plugin-no-comments"],
  "rules": { "uinaf/no-comments": "error" }
}
```

Vite+ (`vite.config.ts`):

```ts
lint: {
  jsPlugins: [{ name: "uinaf", specifier: "@uinaf/oxlint-plugin-no-comments" }],
  rules: { "uinaf/no-comments": "error" },
}
```

## What stays

| Kind            | Allowed                                                                                                                                                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool directives | `eslint-disable*`, `eslint-enable*`, `oxlint-disable*`, `oxlint-enable*`, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `@ts-check`, `/// <reference …>`, `prettier-ignore`, `istanbul`/`c8`/`v8 ignore`, `node:coverage`, `@__PURE__`, `@__NO_SIDE_EFFECTS__`, `@vite-ignore`, `@vitest-environment` |
| License headers | `/*! … */`, `@license`, or `SPDX-*` before the first statement                                                                                                                                                                                                                                           |
| API docs        | The last JSDoc block before an exported declaration, or before a public member of an exported class, interface, type, or enum                                                                                                                                                                            |
| Lint-required   | `SAFETY:` comments that anti-slop's `require-safety-comment-for-type-assertion` accepts for a non-`const` type assertion                                                                                                                                                                                 |

Everything else is reported, including `TODO`, JSX comments, JSDoc on
internal code, and `SAFETY:` comments with no assertion to justify.

## Options

```json
["error", { "allow": ["^webpackChunkName:"], "safetyMarkers": ["SAFETY"] }]
```

- `allow`: regular expressions for extra directives. Each one is tested
  against the comment text with leading `*` and spaces removed.
- `safetyMarkers`: keep equal to anti-slop's `markers` option.
