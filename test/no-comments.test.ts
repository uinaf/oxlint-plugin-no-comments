import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vite-plus/test";

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
    "#!/usr/bin/env node\nconsole.log(1);",
  ],
  invalid: [
    { code: "// eslint disables are fine here\nf();", errors: [comment] },
    { code: "// see eslint-disable-next-line below\nf();", errors: [comment] },
    { code: "// @ts-expect-errors are banned\nf();", errors: [comment] },
    { code: "// prettier-ignored on purpose\nf();", errors: [comment] },
    { code: "// istanbul is a city\nf();", errors: [comment] },
    { code: "// <reference> notes\nf();", errors: [comment] },
    { code: "const a = /* @__PURE__ call */ make();", errors: [comment] },
    { code: "// @vitest-environment-ish\nf();", errors: [comment] },
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
    { code: "export const a = 1;\n/*! late banner */", errors: [{ ...comment, line: 2 }] },
    { code: "import x from 'x';\n// SPDX-License-Identifier: MIT", errors: [comment] },
    { code: "// Copyright uinaf\nexport {};", errors: [comment] },
    { code: "/* MIT licensed */\nexport {};", errors: [comment] },
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
  ],
  invalid: [
    { code: "/** Parse a user id. */\nfunction parse() {}", errors: [comment] },
    { code: "export function f() {\n  /** Inner. */\n  const a = 1;\n}", errors: [comment] },
    {
      code: "/** Stray. */\n/** Doc. */\nexport const a = 1;",
      errors: [{ ...comment, line: 1 }],
    },
    { code: "/* Not JSDoc. */\nexport const a = 1;", errors: [comment] },
    { code: "// Line doc.\nexport const a = 1;", errors: [comment] },
    {
      code: "export class Client { /** Hidden. */ private secret = ''; /** Hidden. */ #token = '' }",
      errors: [comment, comment],
    },
    { code: "class Internal { /** Run. */ run() {} }", errors: [comment] },
    {
      code: "export namespace Api { /** Hidden. */ interface Internal { /** Hidden. */ secret: string } }",
      errors: [comment, comment],
    },
    { code: "/** Internal. */\nclass Client {}\nexport = other;", errors: [comment] },
    {
      code: "export class Client { constructor(/** Hidden. */ private token: string) {} }",
      errors: [comment],
    },
    {
      code: "export class A { private options: { /** Secret. */ secret: string } = { secret: '' } }",
      errors: [comment],
    },
    {
      code: "export class A { #options: { /** Secret. */ secret: string } = { secret: '' } }",
      errors: [comment],
    },
    { code: "export const api = { /** Fetch. */ fetch() {} };", errors: [comment] },
    {
      code: "export function make() {\n  return class { /** Inner. */ run() {} };\n}",
      errors: [comment],
    },
    { code: "export const make = () => class { /** Inner. */ run() {} };", errors: [comment] },
    { code: "/** Re-export. */\nexport { a } from './a';", errors: [comment] },
    { code: "/** Doc. */\nconst a = 1;\nexport { b };", errors: [comment] },
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
    { code: "// SAFETY: Nothing is asserted.\nconst id = value;", errors: [comment] },
    { code: "const id = value as UserId; // SAFETY: Too late.", errors: [comment] },
    { code: "// SAFETY:\nconst id = value as UserId;", errors: [comment] },
    { code: "// SAFETY: Const needs none.\nconst a = [1] as const;", errors: [comment] },
    {
      code: "// SAFETY: Wrong marker.\nconst id = value as UserId;",
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
      options: [{ allow: ["^webpackChunkName:"] }],
      errors: [comment],
    },
  ],
});

tester.run("uinaf/no-comments prose", noCommentsRule, {
  valid: ["const count = 1;"],
  invalid: [
    { code: "// increment the counter\ncount++;", errors: [{ ...comment, line: 1, column: 0 }] },
    { code: "count++; // increment", errors: [{ ...comment, line: 1, column: 9 }] },
    { code: "/* block */\ncount++;", errors: [comment] },
    { code: "// TODO: remove\ncount++;", errors: [comment] },
    { code: "const view = <div>{/* explain */}</div>;", errors: [comment] },
    { code: "function f() {\n  // explain\n  return 1;\n}", errors: [{ ...comment, line: 2 }] },
  ],
});
