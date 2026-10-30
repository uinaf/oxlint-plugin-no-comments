import { defineConfig } from "vite-plus";

const stableShell = {
  env: ["CI", "NODE_ENV"],
  untrackedEnv: ["INIT_CWD", "SHLVL"],
};

const graphInputs = [
  ".node-version",
  "package.json",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "vite.config.ts",
];

export default defineConfig({
  run: {
    tasks: {
      format: {
        cache: {
          ...stableShell,
          input: [...graphInputs, ".github/**", "src/**", "test/**", "*.md", "*.json"],
        },
        command: "vp fmt --check",
      },
      lint: {
        cache: { ...stableShell, input: [...graphInputs, "src/**", "test/**/*.ts"] },
        command: "vp lint",
      },
      pack: {
        cache: { ...stableShell, input: [...graphInputs, "src/**"], output: ["dist/**"] },
        command: "vp pack",
      },
      test: {
        cache: {
          ...stableShell,
          input: [...graphInputs, "dist/**", "src/**", "test/**"],
          output: [],
        },
        command: "vp test run",
        dependsOn: ["pack"],
      },
      ready: {
        cache: false,
        command: 'node -e ""',
        dependsOn: ["format", "lint", "test"],
      },
    },
  },

  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", "test/fixtures/**"],
  },

  pack: {
    entry: ["src/index.ts"],
    platform: "node",
    format: ["esm"],
    fixedExtension: false,
    dts: false,
    sourcemap: false,
    deps: { onlyBundle: ["@oxlint/plugins"] },
  },

  fmt: {
    ignorePatterns: ["dist/**", "test/fixtures/**", "pnpm-lock.yaml"],
  },

  lint: {
    ignorePatterns: ["dist/**", "test/fixtures/**"],
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      { name: "uinaf", specifier: "./src/index.ts" },
    ],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "uinaf/no-comments": "error",
    },
    overrides: [
      {
        files: ["src/**", "test/no-comments.test.ts"],
        rules: { "vite-plus/prefer-vite-plus-imports": "off" },
      },
    ],
    options: { typeAware: true, typeCheck: true },
  },

  staged: {
    "*": "vp check --fix",
  },
});
