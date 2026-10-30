import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

type Comment = ESTree.Comment;
type Node = ESTree.Node;
type TypeAssertion = ESTree.TSAsExpression | ESTree.TSTypeAssertion;

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
  return comment.type === "Block"
    ? comment.value.replace(/^\s*\**\s*/u, "").trimEnd()
    : comment.value.trim();
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
  if ("id" in node && node.id !== null && node.id.type === "Identifier") return [node.id.name];
  return [];
}

function lastJSDocBefore(sourceCode: SourceCode, node: Node): Comment | undefined {
  return sourceCode.getCommentsBefore(node).findLast(isJSDoc);
}

function isAmbient(node: Node, declarationFile: boolean): boolean {
  if (declarationFile) return true;
  let current: Node | null = node;
  while (current !== null) {
    if (current.type === "TSModuleDeclaration" && current.declare) return true;
    current = current.parent;
  }
  return false;
}

function isPublicApi(member: Node, api: ReadonlySet<Node>, declarationFile: boolean): boolean {
  if (isPrivateMember(member)) return false;
  let previous = member;
  let current = member.parent;
  while (current !== null) {
    if (api.has(current)) return true;
    if (scopeBoundaryKinds.has(current.type) || isPrivateMember(current)) return false;
    if (current.type === "TSModuleBlock" && !isAmbient(current, declarationFile)) return false;
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

/** Ban code comments except tool directives, license headers, JSDoc on exported API, and SAFETY justifications. */
export const noCommentsRule = defineRule({
  meta: {
    type: "suggestion",
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
    const apiNodes = new Set<Node>();
    const members: Node[] = [];
    const assertions: TypeAssertion[] = [];
    const localExports = new Set<string>();

    const addMember = (node: Node) => {
      members.push(node);
    };
    const addAssertion = (node: TypeAssertion) => {
      if (!isConstAssertion(node)) assertions.push(node);
    };

    return {
      before() {
        apiNodes.clear();
        members.length = 0;
        assertions.length = 0;
        localExports.clear();
      },
      ExportNamedDeclaration(node) {
        if (node.declaration !== null) apiNodes.add(node);
        if (node.source !== null) return;
        for (const specifier of node.specifiers) {
          if (specifier.local.type === "Identifier") localExports.add(specifier.local.name);
        }
      },
      ExportDefaultDeclaration(node) {
        apiNodes.add(node);
        if (node.declaration.type === "Identifier") localExports.add(node.declaration.name);
      },
      TSExportAssignment(node) {
        apiNodes.add(node);
        if (node.expression.type === "Identifier") localExports.add(node.expression.name);
      },
      TSModuleBlock(node) {
        for (const statement of node.body) {
          if (declarationKinds.has(statement.type)) members.push(statement);
        }
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

        for (const statement of program.body) {
          if (!declarationKinds.has(statement.type)) continue;
          if (declaredNames(statement).some((name) => localExports.has(name))) {
            apiNodes.add(statement);
          }
        }

        const allowed = new Set<number>();
        for (const node of apiNodes) {
          const doc = lastJSDocBefore(sourceCode, node);
          if (doc !== undefined) allowed.add(doc.start);
        }
        const declarationFile = declarationFilePattern.test(context.filename);
        for (const member of members) {
          if (!isPublicApi(member, apiNodes, declarationFile)) continue;
          const doc = lastJSDocBefore(sourceCode, member);
          if (doc !== undefined) allowed.add(doc.start);
        }
        for (const assertion of assertions) {
          for (const comment of safetyCommentsFor(sourceCode, assertion, matchers.safety)) {
            allowed.add(comment.start);
          }
        }

        const headerEnd = program.body[0]?.start ?? program.end;
        for (const comment of sourceCode.getAllComments()) {
          if (comment.type === "Shebang" || allowed.has(comment.start)) continue;
          if (isLicenseHeader(comment, headerEnd)) continue;
          const text = commentText(comment);
          if (directivePatterns.some((pattern) => pattern.test(text))) continue;
          if (matchers.allow.some((pattern) => pattern.test(text))) continue;
          context.report({ node: comment, messageId: "comment" });
        }
      },
    };
  },
});
