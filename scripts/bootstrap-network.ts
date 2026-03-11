import { createReferenceLocalNetwork } from "../packages/dev-tools/src/index.ts";

const network = await createReferenceLocalNetwork();
console.log(JSON.stringify(network.getSnapshot(), null, 2));
await network.stop();
