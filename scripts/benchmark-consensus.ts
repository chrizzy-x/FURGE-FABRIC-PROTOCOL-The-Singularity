import { performance } from "node:perf_hooks";
import { createReferenceLocalNetwork } from "../packages/dev-tools/src/index.ts";

const network = await createReferenceLocalNetwork();
const timings: number[] = [];

for (let index = 0; index < 5; index += 1) {
  const start = performance.now();
  await network.submitProposal({
    subject: `Benchmark run ${index + 1}`,
    summary: "Measure finalized consensus latency across the five-node reference network.",
    payload: { run: index + 1, category: "benchmark" },
    tags: ["consensus", "network"],
    expiresInMs: 6_000
  });
  timings.push(Number((performance.now() - start).toFixed(2)));
}

console.log(JSON.stringify({ averageMs: timings.reduce((sum, value) => sum + value, 0) / timings.length, timings }, null, 2));
await network.stop();
