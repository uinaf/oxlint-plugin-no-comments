import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

type Comment = ESTree.Comment;
type Node = ESTree.Node;
type TypeAssertion = ESTree.TSAsExpression | ESTree.TSTypeAssertion;
type JSXExpressionContainer = ESTree.JSXExpressionContainer;

interface Edit {
  start: number;
  end: number;
  text: string;
}

interface Matchers {
  allow: readonly RegExp[];
  safety: RegExp;
}

const DEFAULT_SAFETY_MARKERS = ["SAFETY"] as const;

const directivePatterns = [
  /^(?:eslint|oxlint)-(?:disable|enable)(?:-next-line|-line)?(?:\s|$)/u,
  /^@ts-(?:expect-error|ignore|nocheck|check)(?![\w-])/u,
  /^\/\s*<(?:reference|amd-module|amd-dependency)\s/u,
  /^prettier-ignore(?:\s|$)/u,
  /^(?:istanbul|c8|v8)\s+ignore(?:\s|$)/u,
  /^node:coverage\s+(?:ignore|disable|enable)(?:\s|$)/u,
  /^[#@]__(?:PURE|NO_SIDE_EFFECTS)__$/u,
  /^@vite-ignore$/u,
  /^@vitest-environment\s/u,
];

const licensePattern = /@license(?![\w-])|SPDX-(?:License-Identifier|FileCopyrightText):/u;

const declarationKinds = new Set([
  "ClassDeclaration",
  "FunctionDeclaration",
  "TSDeclareFunction",
  "TSEnumDeclaration",
  "TSInterfaceDeclaration",
  "TSModuleDeclaration",
  "TSTypeAliasDeclaration",
  "VariableDeclaration",
]);

const scopeBoundaryKinds = new Set(["BlockStatement", "StaticBlock"]);

const declarationFilePattern = /\.d\.[cm]?ts$/u;

const commentOwnerKinds = new Set([
  "ExpressionStatement",
  "PropertyDefinition",
  "ReturnStatement",
  "ThrowStatement",
  "VariableDeclaration",
]);

function stringList(configured: unknown): string[] {
  if (!Array.isArray(configured)) return [];
  return configured.flatMap((item) =>
    typeof item === "string" && item.trim().length > 0 ? [item.trim()] : [],
  );
}

function safetyPattern(markers: readonly string[]): RegExp {
  const alternation = markers
    .map((marker) => marker.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
    .join("|");
  return new RegExp(String.raw`(?:^|[^\p{L}\p{N}_])(?:${alternation})\s*:\s*\S`, "u");
}

function buildMatchers(option: unknown): Matchers {
  const isObject = typeof option === "object" && option !== null;
  const allow = isObject && "allow" in option ? stringList(option.allow) : [];
  const markers = isObject && "safetyMarkers" in option ? stringList(option.safetyMarkers) : [];
  return {
    allow: allow.map((source) => new RegExp(source, "u")),
    safety: safetyPattern(markers.length > 0 ? markers : DEFAULT_SAFETY_MARKERS),
  };
}

function commentText(comment: Comment): string {
  if (comment.type !== "Block") return comment.value.trim();
  return comment.value
    .split("\n")
    .map((line) => line.replace(/^\s*\**\s*/u, ""))
    .join("\n")
    .trim();
}

function isJSDoc(comment: Comment): boolean {
  return comment.type === "Block" && comment.value.startsWith("*");
}

function isLicenseHeader(comment: Comment, headerEnd: number): boolean {
  if (comment.end > headerEnd) return false;
  return (
    (comment.type === "Block" && comment.value.startsWith("!")) ||
    licensePattern.test(comment.value)
  );
}

function isConstAssertion(node: TypeAssertion): boolean {
  return (
    node.typeAnnotation.type === "TSTypeReference" &&
    node.typeAnnotation.typeName.type === "Identifier" &&
    node.typeAnnotation.typeName.name === "const"
  );
}

function isPrivateMember(node: Node): boolean {
  if ("accessibility" in node && node.accessibility === "private") return true;
  return "key" in node && node.key.type === "PrivateIdentifier";
}

function boundNames(pattern: Node): string[] {
  switch (pattern.type) {
    case "Identifier":
      return [pattern.name];
    case "ObjectPattern":
      return pattern.properties.flatMap((property) =>
        boundNames(property.type === "RestElement" ? property.argument : property.value),
      );
    case "ArrayPattern":
      return pattern.elements.flatMap((element) => (element === null ? [] : boundNames(element)));
    case "AssignmentPattern":
      return boundNames(pattern.left);
    case "RestElement":
      return boundNames(pattern.argument);
    default:
      return [];
  }
}

function declaredNames(node: Node): string[] {
  if (node.type === "VariableDeclaration") {
    return node.declarations.flatMap((declarator) => boundNames(declarator.id));
  }
  if (!("id" in node) || node.id === null) return [];
  let id: Node = node.id;
  while (id.type === "TSQualifiedName") id = id.left;
  return id.type === "Identifier" ? [id.name] : [];
}

function localExportNames(statements: readonly Node[]): Set<string> {
  const names = new Set<string>();
  for (const statement of statements) {
    if (statement.type === "ExportNamedDeclaration" && statement.source === null) {
      for (const specifier of statement.specifiers) {
        if (specifier.local.type === "Identifier") names.add(specifier.local.name);
      }
    }
    const target =
      statement.type === "ExportDefaultDeclaration"
        ? statement.declaration
        : statement.type === "TSExportAssignment"
          ? statement.expression
          : null;
    const root = target === null ? null : rootIdentifier(target);
    if (root !== null) names.add(root);
  }
  return names;
}

function rootIdentifier(node: Node): string | null {
  let current = node;
  while (current.type === "MemberExpression" || current.type === "TSQualifiedName") {
    current = current.type === "MemberExpression" ? current.object : current.left;
  }
  return current.type === "Identifier" ? current.name : null;
}

function hasExportDeclarations(statements: readonly Node[]): boolean {
  return statements.some(
    (statement) =>
      (statement.type === "ExportNamedDeclaration" && statement.declaration === null) ||
      statement.type === "ExportAllDeclaration" ||
      statement.type === "TSExportAssignment" ||
      (statement.type === "ExportDefaultDeclaration" &&
        !declarationKinds.has(statement.declaration.type)),
  );
}

function collectApi(
  statements: readonly Node[],
  visible: boolean,
  ambient: boolean,
  api: Set<Node>,
): void {
  const listed = localExportNames(statements);
  const exportContext = ambient && !hasExportDeclarations(statements);
  for (const statement of statements) {
    let declaration: Node | null = null;
    let exported = false;
    if (statement.type === "ExportNamedDeclaration") {
      declaration = statement.declaration;
      exported = declaration !== null;
    } else if (
      statement.type === "ExportDefaultDeclaration" ||
      statement.type === "TSExportAssignment"
    ) {
      exported = true;
    } else if (declarationKinds.has(statement.type)) {
      declaration = statement;
      exported = exportContext || declaredNames(statement).some((name) => listed.has(name));
    }
    if (visible && exported) api.add(statement);
    if (declaration?.type !== "TSModuleDeclaration" || declaration.body?.type !== "TSModuleBlock") {
      continue;
    }
    const external = declaration.global || declaration.id.type === "Literal";
    collectApi(
      declaration.body.body,
      external || (visible && exported),
      ambient || declaration.declare,
      api,
    );
  }
}

function lastJSDocBefore(sourceCode: SourceCode, node: Node): Comment | undefined {
  return sourceCode.getCommentsBefore(node).findLast(isJSDoc);
}

function isPublicApi(member: Node, api: ReadonlySet<Node>): boolean {
  if (isPrivateMember(member)) return false;
  let previous = member;
  let current = member.parent;
  while (current !== null) {
    if (api.has(current)) return true;
    if (scopeBoundaryKinds.has(current.type) || isPrivateMember(current)) return false;
    if (current.type === "TSModuleBlock") return false;
    if (current.type === "ArrowFunctionExpression" && current.body === previous) return false;
    previous = current;
    current = current.parent;
  }
  return false;
}

function safetyCommentsFor(
  sourceCode: SourceCode,
  assertion: TypeAssertion,
  pattern: RegExp,
): Comment[] {
  const found: Comment[] = [];
  const collect = (owner: Node) => {
    for (const comment of sourceCode.getCommentsBefore(owner)) {
      if (comment.end <= assertion.start && pattern.test(comment.value)) found.push(comment);
    }
  };
  let current: Node = assertion;
  while (true) {
    collect(current);
    if (commentOwnerKinds.has(current.type)) {
      const exportDeclaration = current.parent;
      if (
        exportDeclaration?.type === "ExportNamedDeclaration" &&
        exportDeclaration.declaration === current
      ) {
        collect(exportDeclaration);
      }
      return found;
    }
    if (current.parent === null || current.parent.type === "Program") return found;
    current = current.parent;
  }
}

const lineBreakPattern = /[\n\r\u2028\u2029]/u;
const blankPattern = /^\s*$/u;
const isLineBreak = (char: string | undefined) => char !== undefined && lineBreakPattern.test(char);

function lineStart(text: string, position: number): number {
  let start = position;
  while (start > 0 && !isLineBreak(text[start - 1])) start--;
  return start;
}

function lineEnd(text: string, position: number): number {
  let end = position;
  while (end < text.length && !isLineBreak(text[end])) end++;
  return end;
}

function nextLineStart(text: string, end: number): number {
  if (text.startsWith("\r\n", end)) return end + 2;
  return Math.min(end + 1, text.length);
}

function leadingSpace(text: string): number {
  return text.length - text.trimStart().length;
}

function trailingSpace(text: string): number {
  return text.length - text.trimEnd().length;
}

function renderedJSXText(value: string): string {
  const lines = value.split(/\r\n|[\n\r]/u);
  return lines
    .map((line, index) => {
      const start = index > 0 ? line.replace(/^[ \t]+/u, "") : line;
      return index < lines.length - 1 ? start.replace(/[ \t]+$/u, "") : start;
    })
    .filter((line) => line.length > 0)
    .join(" ");
}

function keepsRenderedText(text: string, container: JSXExpressionContainer, edit: Edit): boolean {
  const parent = container.parent;
  if (parent.type !== "JSXElement" && parent.type !== "JSXFragment") return true;
  const index = parent.children.indexOf(container);
  const previous = parent.children[index - 1];
  const next = parent.children[index + 1];
  const from = previous?.type === "JSXText" ? previous.start : edit.start;
  const to = next?.type === "JSXText" ? next.end : edit.end;
  const before =
    (previous?.type === "JSXText" ? renderedJSXText(previous.value) : "") +
    (next?.type === "JSXText" ? renderedJSXText(next.value) : "");
  const after = renderedJSXText(
    text.slice(from, edit.start) + edit.text + text.slice(edit.end, to),
  );
  return before === after;
}

function removal(text: string, start: number, end: number, jsx: boolean): Edit {
  const first = lineStart(text, start);
  const last = lineEnd(text, end);
  const before = text.slice(first, start);
  const after = text.slice(end, last);
  if (blankPattern.test(before) && blankPattern.test(after)) {
    return { start: first, end: nextLineStart(text, last), text: "" };
  }
  if (jsx) return { start, end, text: "" };
  if (blankPattern.test(after)) return { start: start - trailingSpace(before), end, text: "" };
  if (blankPattern.test(before)) return { start, end: end + leadingSpace(after), text: "" };
  const from = start - trailingSpace(before);
  const separator = lineBreakPattern.test(text.slice(from, end))
    ? "\n"
    : blankPattern.test(text[end] ?? "")
      ? ""
      : " ";
  return { start: from, end, text: separator };
}

function commentRuns(text: string, reported: readonly Comment[]): Comment[][] {
  const runs: Comment[][] = [];
  for (const comment of reported) {
    const run = runs.at(-1);
    const previous = run?.at(-1);
    if (run !== undefined && previous !== undefined) {
      if (blankPattern.test(text.slice(previous.end, comment.start))) {
        run.push(comment);
        continue;
      }
    }
    runs.push([comment]);
  }
  return runs;
}

function planEdits(
  text: string,
  comments: readonly Comment[],
  reported: readonly Comment[],
  containers: readonly JSXExpressionContainer[],
): Map<Comment, Edit> {
  const reportedSet = new Set(reported);
  const sorted = containers.toSorted((a, b) => a.start - b.start);
  const keepsComment = new Set<JSXExpressionContainer>();
  let index = 0;
  for (const comment of comments) {
    let container = sorted[index];
    while (container !== undefined && container.end <= comment.start) container = sorted[++index];
    if (container !== undefined && container.start < comment.start && !reportedSet.has(comment)) {
      keepsComment.add(container);
    }
  }

  const edits = new Map<Comment, Edit>();
  index = 0;
  for (const run of commentRuns(text, reported)) {
    const first = run[0];
    const last = run.at(-1);
    if (first === undefined || last === undefined) continue;
    let candidate = sorted[index];
    while (candidate !== undefined && candidate.end <= first.start) candidate = sorted[++index];
    const container =
      candidate !== undefined && candidate.start < first.start && last.end < candidate.end
        ? candidate
        : undefined;
    if (container !== undefined && !keepsComment.has(container)) {
      const edit = removal(text, container.start, container.end, true);
      if (keepsRenderedText(text, container, edit)) edits.set(first, edit);
      continue;
    }
    edits.set(first, removal(text, first.start, last.end, false));
  }
  return edits;
}

/** Ban code comments except tool directives, license headers, JSDoc on exported API, and SAFETY justifications. */
export const noCommentsRule = defineRule({
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: {
      description:
        "Disallow comments other than tool directives, license headers, JSDoc on exported API, and SAFETY justifications for type assertions.",
    },
    messages: {
      comment:
        "Remove this comment. Names, types, and tests carry intent; the commit message carries the why.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allow: {
            type: "array",
            items: { type: "string", minLength: 1 },
            uniqueItems: true,
          },
          safetyMarkers: {
            type: "array",
            items: { type: "string", minLength: 1 },
            minItems: 1,
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ allow: [], safetyMarkers: ["SAFETY"] }],
  },
  createOnce(context) {
    const matchersByOption = new Map<string, Matchers>();
    const members: Node[] = [];
    const assertions: TypeAssertion[] = [];
    const emptyContainers: JSXExpressionContainer[] = [];

    const addMember = (node: Node) => {
      members.push(node);
    };
    const addAssertion = (node: TypeAssertion) => {
      if (!isConstAssertion(node)) assertions.push(node);
    };

    return {
      before() {
        members.length = 0;
        assertions.length = 0;
        emptyContainers.length = 0;
      },
      JSXExpressionContainer(node) {
        if (node.expression.type === "JSXEmptyExpression") emptyContainers.push(node);
      },
      AccessorProperty: addMember,
      MethodDefinition: addMember,
      PropertyDefinition: addMember,
      TSAbstractAccessorProperty: addMember,
      TSAbstractMethodDefinition: addMember,
      TSAbstractPropertyDefinition: addMember,
      TSCallSignatureDeclaration: addMember,
      TSConstructSignatureDeclaration: addMember,
      TSEnumMember: addMember,
      TSIndexSignature: addMember,
      TSParameterProperty: addMember,
      TSMethodSignature: addMember,
      TSPropertySignature: addMember,
      TSAsExpression: addAssertion,
      TSTypeAssertion: addAssertion,
      "Program:exit"(program) {
        const { sourceCode } = context;
        const option: unknown = context.options[0];
        const optionKey = JSON.stringify(option ?? null);
        const matchers = matchersByOption.get(optionKey) ?? buildMatchers(option);
        matchersByOption.set(optionKey, matchers);

        const apiNodes = new Set<Node>();
        const declarationFile = declarationFilePattern.test(context.filename);
        collectApi(program.body, true, declarationFile, apiNodes);

        const allowed = new Set<number>();
        for (const node of apiNodes) {
          const doc = lastJSDocBefore(sourceCode, node);
          if (doc !== undefined) allowed.add(doc.start);
        }
        for (const member of members) {
          if (!isPublicApi(member, apiNodes)) continue;
          const doc = lastJSDocBefore(sourceCode, member);
          if (doc !== undefined) allowed.add(doc.start);
        }
        for (const assertion of assertions) {
          for (const comment of safetyCommentsFor(sourceCode, assertion, matchers.safety)) {
            allowed.add(comment.start);
          }
        }

        const headerEnd = program.body[0]?.start ?? program.end;
        const comments = sourceCode.getAllComments();
        const reported = comments.filter((comment) => {
          if (comment.type === "Shebang" || allowed.has(comment.start)) return false;
          if (isLicenseHeader(comment, headerEnd)) return false;
          const text = commentText(comment);
          if (directivePatterns.some((pattern) => pattern.test(text))) return false;
          return !matchers.allow.some((pattern) => pattern.test(text));
        });

        const edits = planEdits(sourceCode.text, comments, reported, emptyContainers);
        for (const comment of reported) {
          const edit = edits.get(comment);
          context.report({
            node: comment,
            messageId: "comment",
            ...(edit === undefined
              ? {}
              : { fix: (fixer) => fixer.replaceTextRange([edit.start, edit.end], edit.text) }),
          });
        }
      },
    };
  },
});
