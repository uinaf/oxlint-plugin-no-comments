import { RuleTester } from "oxlint/plugins-dev";
import { parseSync } from "vite-plus";
import { describe, expect, it } from "vite-plus/test";

import { noCommentsRule } from "../src/rules/no-comments.ts";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "tsx" } } });
const comment = { messageId: "comment" };

tester.run("uinaf/no-comments tool directives", noCommentsRule, {
  valid: [
    "// eslint-disable-next-line no-console -- the CLI prints\nconsole.log(1);",
    "/* eslint-disable no-console */\nconsole.log(1);\n/* eslint-enable no-console */",
    "const a = 1; // eslint-disable-line no-unused-vars",
    "// oxlint-disable-next-line no-console\nconsole.log(1);",
    "/* oxlint-disable */\nconsole.log(1);\n/* oxlint-enable */",
    "// @ts-expect-error untyped global\nwindow.x = 1;",
    "// @ts-ignore\nwindow.x = 1;",
    "// @ts-nocheck\nexport {};",
    '/// <reference types="vite/client" />\nexport {};',
    "// prettier-ignore\nconst matrix = [1,0, 0,1];",
    "/* istanbul ignore next */\nfunction f() {}",
    "/* c8 ignore start */\nf();\n/* c8 ignore stop */",
    "/* v8 ignore next */\nf();",
    "/* node:coverage ignore next */\nf();",
    "const a = /* @__PURE__ */ make();",
    "const a = /*#__PURE__*/ make();",
    "const make = /* @__NO_SIDE_EFFECTS__ */ () => 1;",
    "await import(/* @vite-ignore */ path);",
    "// @vitest-environment node\nexport {};",
    "/** @vitest-environment node */\nexport {};",
    "/**\n * @vitest-environment node\n */\nexport {};",
    "/*\n * istanbul ignore next\n */\nfunction f() {}",
    "/* eslint-disable\n  no-console,\n  no-alert\n*/\nconsole.log(1);",
    "#!/usr/bin/env node\nconsole.log(1);",
  ],
  invalid: [
    { code: "// eslint disables are fine here\nf();", output: "f();", errors: [comment] },
    { code: "// see eslint-disable-next-line below\nf();", output: "f();", errors: [comment] },
    { code: "// @ts-expect-errors are banned\nf();", output: "f();", errors: [comment] },
    { code: "// prettier-ignored on purpose\nf();", output: "f();", errors: [comment] },
    { code: "// istanbul is a city\nf();", output: "f();", errors: [comment] },
    { code: "// <reference> notes\nf();", output: "f();", errors: [comment] },
    {
      code: "const a = /* @__PURE__ call */ make();",
      output: "const a = make();",
      errors: [comment],
    },
    { code: "// @vitest-environment-ish\nf();", output: "f();", errors: [comment] },
    {
      code: "/**\n * Prose first.\n * @vitest-environment node\n */\nf();",
      output: "f();",
      errors: [comment],
    },
  ],
});

tester.run("uinaf/no-comments license headers", noCommentsRule, {
  valid: [
    "/*! (c) uinaf, MIT */\nexport const a = 1;",
    "/**\n * @license MIT\n */\nimport x from 'x';",
    "// SPDX-License-Identifier: MIT\n// SPDX-FileCopyrightText: uinaf\nexport {};",
    "#!/usr/bin/env node\n/*! (c) uinaf */\nconsole.log(1);",
  ],
  invalid: [
    {
      code: "export const a = 1;\n/*! late banner */",
      output: "export const a = 1;\n",
      errors: [{ ...comment, line: 2 }],
    },
    {
      code: "import x from 'x';\n// SPDX-License-Identifier: MIT",
      output: "import x from 'x';\n",
      errors: [comment],
    },
    { code: "// Copyright uinaf\nexport {};", output: "export {};", errors: [comment] },
    { code: "/* MIT licensed */\nexport {};", output: "export {};", errors: [comment] },
  ],
});

tester.run("uinaf/no-comments JSDoc on exported API", noCommentsRule, {
  valid: [
    "/** Parse a user id. */\nexport function parse(value: string): string { return value; }",
    "/** Shared limit. */\nexport const limit = 1;",
    "/** Default plugin. */\nexport default {};",
    "/** Build a client. */\nfunction build() {}\nexport { build };",
    "/** Shared client. */\nconst client = {};\nexport default client;",
    "/** Options. */\nexport interface Options { /** Timeout in milliseconds. */ timeout: number }",
    "export type Options = { /** Retries before giving up. */ retries: number };",
    "export interface Callable { /** Call. */ (): void; /** Construct. */ new (): Callable; /** Index. */ [key: string]: unknown }",
    "export class Client { /** Send a request. */ send(): void {} /** Base URL. */ url = ''; /** Shared. */ protected base = '' }",
    "export abstract class Base { /** Run. */ abstract run(): void }",
    "export enum Mode { /** Read only. */ Read, Write }",
    "export namespace Api { /** Version. */ export const version = 1; }",
    "export type Handler = (options: { /** Abort signal. */ signal: AbortSignal }) => void;",
    "// eslint-disable-next-line no-var\n/** Legacy flag. */\nexport var legacy = true;",
    "/** Public value. */\nconst { value, list: [first = 1] } = source;\nexport { value };",
    "/** Rest. */\nconst [, ...rest] = source;\nexport { rest };",
    "export namespace Api { export interface Shape { /** Visible. */ field: string } }",
    "/** Public client. */\nclass Client { /** Send. */ send(): void {} }\nexport = Client;",
    "export declare namespace Api { /** Options. */ interface Options { /** Public value. */ value: string } }",
    "declare namespace Outer { namespace Inner { interface Shape { /** Field. */ field: string } } }\nexport { Outer };",
    {
      code: "export namespace Api { /** Options. */ interface Options { /** Public value. */ value: string } }",
      filename: "api.d.ts",
    },
    "export class Client { constructor(/** Base URL. */ public url: string, /** Retries. */ readonly retries: number) {} }",
    {
      code: "/** Options. */\ninterface Options { /** Field. */ field: string }",
      filename: "api.d.ts",
    },
    { code: "/** Run. */\ndeclare function run(): void;", filename: "api.d.mts" },
    "namespace A.B { /** Version. */ export const version = 1; }\nexport { A };",
    "declare module 'x' { /** Run. */ export function run(): void; }",
    "declare module 'x' { /** Options. */ interface Options {} }",
    "declare global { interface Window { /** App. */ app: string } }\nexport {};",
  ],
  invalid: [
    {
      code: "/** Parse a user id. */\nfunction parse() {}",
      output: "function parse() {}",
      errors: [comment],
    },
    {
      code: "export function f() {\n  /** Inner. */\n  const a = 1;\n}",
      output: "export function f() {\n  const a = 1;\n}",
      errors: [comment],
    },
    {
      code: "/** Stray. */\n/** Doc. */\nexport const a = 1;",
      output: "/** Doc. */\nexport const a = 1;",
      errors: [{ ...comment, line: 1 }],
    },
    {
      code: "/* Not JSDoc. */\nexport const a = 1;",
      output: "export const a = 1;",
      errors: [comment],
    },
    { code: "// Line doc.\nexport const a = 1;", output: "export const a = 1;", errors: [comment] },
    {
      code: "export class Client { /** Hidden. */ private secret = ''; /** Hidden. */ #token = '' }",
      output: "export class Client { private secret = ''; #token = '' }",
      errors: [comment, comment],
    },
    {
      code: "class Internal { /** Run. */ run() {} }",
      output: "class Internal { run() {} }",
      errors: [comment],
    },
    {
      code: "export namespace Api { /** Hidden. */ interface Internal { /** Hidden. */ secret: string } }",
      output: "export namespace Api { interface Internal { secret: string } }",
      errors: [comment, comment],
    },
    {
      code: "/** Internal. */\nclass Client {}\nexport = other;",
      output: "class Client {}\nexport = other;",
      errors: [comment],
    },
    {
      code: "export class Client { constructor(/** Hidden. */ private token: string) {} }",
      output: "export class Client { constructor( private token: string) {} }",
      errors: [comment],
    },
    {
      code: "export class A { private options: { /** Secret. */ secret: string } = { secret: '' } }",
      output: "export class A { private options: { secret: string } = { secret: '' } }",
      errors: [comment],
    },
    {
      code: "export class A { #options: { /** Secret. */ secret: string } = { secret: '' } }",
      output: "export class A { #options: { secret: string } = { secret: '' } }",
      errors: [comment],
    },
    {
      code: "export const api = { /** Fetch. */ fetch() {} };",
      output: "export const api = { fetch() {} };",
      errors: [comment],
    },
    {
      code: "export function make() {\n  return class { /** Inner. */ run() {} };\n}",
      output: "export function make() {\n  return class { run() {} };\n}",
      errors: [comment],
    },
    {
      code: "export const make = () => class { /** Inner. */ run() {} };",
      output: "export const make = () => class { run() {} };",
      errors: [comment],
    },
    {
      code: "/** Re-export. */\nexport { a } from './a';",
      output: "export { a } from './a';",
      errors: [comment],
    },
    {
      code: "/** Doc. */\nconst a = 1;\nexport { b };",
      output: "const a = 1;\nexport { b };",
      errors: [comment],
    },
    {
      code: "namespace Internal { /** Doc. */ export function f() {} }",
      output: "namespace Internal { export function f() {} }",
      errors: [comment],
    },
    {
      code: "/** Hidden. */\ninterface Options {}\nexport {};",
      output: "interface Options {}\nexport {};",
      filename: "api.d.ts",
      errors: [comment],
    },
    {
      code: "export declare namespace Api { /** Hidden. */ interface Options {} export {}; }",
      output: "export declare namespace Api { interface Options {} export {}; }",
      errors: [comment],
    },
    {
      code: "/** Hidden. */\ninterface Options {}",
      output: "interface Options {}",
      filename: "api.ts",
      errors: [comment],
    },
  ],
});

tester.run("uinaf/no-comments SAFETY justifications", noCommentsRule, {
  valid: [
    "// SAFETY: The parser established the UserId invariant.\nconst id = value as UserId;",
    "const id = /* SAFETY: Validation established it. */ value as UserId;",
    "const id = parse(\n  // SAFETY: Checked above.\n  value as UserId,\n);",
    "// SAFETY: Checked above.\nexport const id = value as UserId;",
    "function f() {\n  // SAFETY: Checked above.\n  return value as UserId;\n}",
    {
      code: "// INVARIANT: Checked above.\nconst id = value as UserId;",
      options: [{ safetyMarkers: ["INVARIANT"] }],
    },
  ],
  invalid: [
    {
      code: "// SAFETY: Nothing is asserted.\nconst id = value;",
      output: "const id = value;",
      errors: [comment],
    },
    {
      code: "const id = value as UserId; // SAFETY: Too late.",
      output: "const id = value as UserId;",
      errors: [comment],
    },
    {
      code: "// SAFETY:\nconst id = value as UserId;",
      output: "const id = value as UserId;",
      errors: [comment],
    },
    {
      code: "// SAFETY: Const needs none.\nconst a = [1] as const;",
      output: "const a = [1] as const;",
      errors: [comment],
    },
    {
      code: "// SAFETY: Wrong marker.\nconst id = value as UserId;",
      output: "const id = value as UserId;",
      options: [{ safetyMarkers: ["INVARIANT"] }],
      errors: [comment],
    },
  ],
});

tester.run("uinaf/no-comments allow option", noCommentsRule, {
  valid: [
    {
      code: 'await import(/* webpackChunkName: "page" */ "./page");',
      options: [{ allow: ["^webpackChunkName:"] }],
    },
  ],
  invalid: [
    {
      code: 'await import(/* webpackMode: "lazy" */ "./page");',
      output: 'await import( "./page");',
      options: [{ allow: ["^webpackChunkName:"] }],
      errors: [comment],
    },
  ],
});

tester.run("uinaf/no-comments prose", noCommentsRule, {
  valid: ["const count = 1;"],
  invalid: [
    {
      code: "// increment the counter\ncount++;",
      output: "count++;",
      errors: [{ ...comment, line: 1, column: 0 }],
    },
    {
      code: "count++; // increment",
      output: "count++;",
      errors: [{ ...comment, line: 1, column: 9 }],
    },
    { code: "/* block */\ncount++;", output: "count++;", errors: [comment] },
    { code: "// TODO: remove\ncount++;", output: "count++;", errors: [comment] },
    {
      code: "const view = <div>{/* explain */}</div>;",
      output: "const view = <div></div>;",
      errors: [comment],
    },
    {
      code: "function f() {\n  // explain\n  return 1;\n}",
      output: "function f() {\n  return 1;\n}",
      errors: [{ ...comment, line: 2 }],
    },
  ],
});

const fixes = [
  { code: "const/*x*/c = a +/*x*/+b;", output: "const c = a + +b;", errors: 2 },
  {
    code: "function f() {\n  return /*\n  */ value;\n}",
    output: "function f() {\n  return\n value;\n}",
    errors: 1,
  },
  {
    code: "function f() {\n  return /*\r*/ value;\n}",
    output: "function f() {\n  return\n value;\n}",
    errors: 1,
  },
  {
    code: "function f() {\n  return /*\u2028*/ value;\n}",
    output: "function f() {\n  return\n value;\n}",
    errors: 1,
  },
  {
    code: "function f() {\n  return /*\u2029*/ value;\n}",
    output: "function f() {\n  return\n value;\n}",
    errors: 1,
  },
  { code: "f(); /* a */ /* b */\ng();", output: "f();\ng();", errors: 2 },
  { code: "/* a */ /* b */ f();", output: "f();", errors: 2 },
  { code: "// a\n// b\nf();", output: "f();", errors: 2 },
  { code: "x = 1; // a\n// b\nf();", output: "x = 1;\nf();", errors: 2 },
  { code: "f(a, // a\n/* b */ b);", output: "f(a,\n b);", errors: 2 },
  { code: "// a\r\nf();", output: "f();", errors: 1 },
  { code: "#!/usr/bin/env node\n// banner\nf();", output: "#!/usr/bin/env node\nf();", errors: 1 },
  {
    code: "const v = (\n  <div>\n    <b />\n    {/* a */}\n  </div>\n);",
    output: "const v = (\n  <div>\n    <b />\n  </div>\n);",
    errors: 1,
  },
  {
    code: "const v = (\n  <div>\n    text\n    {/* a */}\n  </div>\n);",
    output: "const v = (\n  <div>\n    text\n  </div>\n);",
    errors: 1,
  },
  { code: "const v = <p>a {/* x */}</p>;", output: "const v = <p>a </p>;", errors: 1 },
  { code: "const v = <div>{/* a */ /* b */}</div>;", output: "const v = <div></div>;", errors: 2 },
  {
    code: "const v = <div>{/* a */ /* @vite-ignore */}</div>;",
    output: "const v = <div>{ /* @vite-ignore */}</div>;",
    errors: 1,
  },
];

tester.run("uinaf/no-comments autofix", noCommentsRule, {
  valid: [],
  invalid: [
    ...fixes.map(({ code, output, errors }) => ({
      code,
      output,
      errors: Array.from({ length: errors }, () => comment),
    })),
    { code: "const v = <p>a {/* x */} b</p>;", output: null, errors: [comment] },
    {
      code: "const v = (\n  <p>\n    a\n    {/* x */}\n    b\n  </p>\n);",
      output: null,
      errors: [comment],
    },
  ],
});

function jsxText(value: string): string {
  const lines = value.split(/\r\n|[\n\r]/u);
  return lines
    .map((line, index) => {
      const start = index > 0 ? line.trimStart() : line;
      return index < lines.length - 1 ? start.trimEnd() : start;
    })
    .filter((line) => line.length > 0)
    .join(" ");
}

function rendersNothing(value: unknown): boolean {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  if (value.type === "JSXText") return "value" in value && value.value === "";
  return (
    value.type === "JSXExpressionContainer" &&
    "expression" in value &&
    typeof value.expression === "object" &&
    value.expression !== null &&
    "type" in value.expression &&
    value.expression.type === "JSXEmptyExpression"
  );
}

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape).filter((item) => !rendersNothing(item));
  if (typeof value !== "object" || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (["start", "end", "range", "loc", "raw"].includes(key)) continue;
    result[key] = shape(child);
  }
  if (result.type === "JSXText" && typeof result.value === "string") {
    result.value = jsxText(result.value);
  }
  return result;
}

function program(code: string): unknown {
  const result = parseSync("fixture.tsx", code);
  expect(result.errors).toEqual([]);
  return shape(result.program);
}

describe("uinaf/no-comments autofix keeps the program", () => {
  it.each(fixes)("$code", ({ code, output }) => {
    expect(program(output)).toEqual(program(code));
  });
});
