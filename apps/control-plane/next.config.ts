import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@furge/shared-types",
    "@furge/protocol-core",
    "@furge/consensus",
    "@furge/chain-builder",
    "@furge/agent-node",
    "@furge/sdk",
    "@furge/bridges",
    "@furge/tokenomics",
    "@furge/marketplace",
    "@furge/metaverse",
    "@furge/dev-tools"
  ]
};

export default nextConfig;