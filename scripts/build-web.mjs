import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = resolve(rootDir, "apps/web");
const distDir = resolve(webDir, "dist");
const publicDir = resolve(webDir, "public");
const assetRootDir = resolve(rootDir, "assets");
const manifestDir = resolve(assetRootDir, "manifests");
const assetRoots = [resolve(assetRootDir, "brand"), resolve(assetRootDir, "diagrams"), resolve(assetRootDir, "screenshots")];
const manifestPath = resolve(manifestDir, "asset-manifest.json");
const distAssetDir = resolve(distDir, "assets");
const apiBaseUrl = process.env.FFP_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3100";
const assetBaseUrl = process.env.FFP_PUBLIC_ASSET_BASE_URL ?? "./assets";

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await cp(publicDir, distDir, { recursive: true });
await mkdir(distAssetDir, { recursive: true });
await mkdir(manifestDir, { recursive: true });

const manifestEntries = [];
for (const assetRoot of assetRoots) {
  await collectAssets(assetRoot, manifestEntries);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  publishedAt: null,
  assets: manifestEntries.sort((left, right) => left.id.localeCompare(right.id))
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await mkdir(resolve(distDir, "assets/manifests"), { recursive: true });
await writeFile(resolve(distDir, "assets/manifests/asset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(
  resolve(distDir, "config.js"),
  `window.FFP_CONFIG = ${JSON.stringify({ apiBaseUrl, assetBaseUrl }, null, 2)};\n`
);

async function collectAssets(root, manifestEntries) {
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const sourcePath = join(root, entry.name);
    if (entry.isDirectory()) {
      await collectAssets(sourcePath, manifestEntries);
      continue;
    }

    const contents = await readFile(sourcePath);
    const hash = createHash("sha256").update(contents).digest("hex").slice(0, 16);
    const rootRelative = relative(assetRootDir, sourcePath).replace(/\\/g, "/");
    const category = rootRelative.split("/")[0] ?? "misc";
    const name = entry.name.replace(extname(entry.name), "");
    const publishedFileName = `${name}-${hash}${extname(entry.name)}`;
    const objectKey = `${category}/${publishedFileName}`;
    const distPath = resolve(distDir, "assets", objectKey);

    await mkdir(dirname(distPath), { recursive: true });
    await cp(sourcePath, distPath);

    const info = await stat(sourcePath);
    manifestEntries.push({
      id: `${category}:${name}`,
      name,
      category,
      sourcePath: `assets/${rootRelative}`,
      distPath: `assets/${objectKey}`,
      checksum: hash,
      size: info.size,
      r2ObjectKey: objectKey,
      publicUrl: `${assetBaseUrl.replace(/\/$/, "")}/${objectKey}`,
      publishedAt: null
    });
  }
}
