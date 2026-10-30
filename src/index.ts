import { eslintCompatPlugin } from "@oxlint/plugins";

import { noCommentsRule } from "./rules/no-comments.ts";

/** Oxlint plugin that keeps intent in names, types, tests, and commit messages instead of comments. */
const plugin = eslintCompatPlugin({
  meta: { name: "uinaf" },
  rules: {
    "no-comments": noCommentsRule,
  },
});

export default plugin;
