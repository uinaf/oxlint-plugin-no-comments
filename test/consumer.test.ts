import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

interface Diagnostic {
  code: string;
  filename: string;
  labels: { span: { line: number } }[];
}

const root = fileURLToPath(new URL("..", import.meta.url));
const oxlint = fileURLToPath(new URL("../node_modules/.bin/oxlint", import.meta.url));

function lint(): Diagnostic[] {
  const result = spawnSync(
    oxlint,
    ["-c", "test/fixtures/consumer/.oxlintrc.json", "-f", "json", "test/fixtures/consumer"],
    { cwd: root, encoding: "utf8" },
  );
  expect(result.stderr).toBe("");
  const report: { diagnostics: Diagnostic[] } = JSON.parse(result.stdout);
  return report.diagnostics;
}

test("oxlint loads the published entry through jsPlugins and reports only banned comments", () => {
  const found = lint().map((diagnostic) => [
    diagnostic.filename,
    diagnostic.labels[0]?.span.line,
    diagnostic.code,
  ]);
  const banned = [1, 4, 6, 11, 12, 16, 18].map((line) => [
    "test/fixtures/consumer/banned.ts",
    line,
    "uinaf(no-comments)",
  ]);
  expect(found).toEqual(banned);
});
