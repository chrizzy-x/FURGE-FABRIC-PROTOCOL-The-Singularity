import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"]
    }
  },
  resolve: {
    alias: {
      "@ffp/shared-types": resolve(rootDir, "packages/shared-types/src/index.ts"),
      "@ffp/protocol-core": resolve(rootDir, "packages/protocol-core/src/index.ts"),
      "@ffp/consensus": resolve(rootDir, "packages/consensus/src/index.ts"),
      "@ffp/bridges": resolve(rootDir, "packages/bridges/src/index.ts"),
      "@ffp/tokenomics": resolve(rootDir, "packages/tokenomics/src/index.ts"),
      "@ffp/agent-node": resolve(rootDir, "packages/agent-node/src/index.ts"),
      "@ffp/sdk": resolve(rootDir, "packages/sdk/src/index.ts"),
      "@ffp/dev-tools": resolve(rootDir, "packages/dev-tools/src/index.ts")
    }
  }
});
