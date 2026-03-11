import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["packages/**/*.test.ts", "apps/api/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"]
    }
  },
  resolve: {
    alias: {
      "@furge/shared-types": resolve("packages/shared-types/src/index.ts"),
      "@furge/protocol-core": resolve("packages/protocol-core/src/index.ts"),
      "@furge/consensus": resolve("packages/consensus/src/index.ts"),
      "@furge/chain-builder": resolve("packages/chain-builder/src/index.ts"),
      "@furge/agent-node": resolve("packages/agent-node/src/index.ts"),
      "@furge/sdk": resolve("packages/sdk/src/index.ts"),
      "@furge/bridges": resolve("packages/bridges/src/index.ts"),
      "@furge/tokenomics": resolve("packages/tokenomics/src/index.ts"),
      "@furge/marketplace": resolve("packages/marketplace/src/index.ts"),
      "@furge/metaverse": resolve("packages/metaverse/src/index.ts"),
      "@furge/dev-tools": resolve("packages/dev-tools/src/index.ts")
    }
  }
});