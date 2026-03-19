import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const buildScript = resolve(rootDir, "scripts/build-web.mjs");
const publishScript = resolve(rootDir, "scripts/publish-assets.mjs");
const tscPath = resolve(rootDir, "node_modules/typescript/lib/tsc.js");
const webTsconfig = resolve(rootDir, "apps/web/tsconfig.json");
const manifestPath = resolve(rootDir, "assets/manifests/asset-manifest.json");

describe.sequential("web build and asset publication", () => {
  test("generates the static site and asset manifest", { timeout: 20000 }, () => {
    execFileSync(process.execPath, [buildScript], {
      cwd: rootDir,
      env: {
        ...process.env,
        FFP_PUBLIC_API_BASE_URL: "http://127.0.0.1:3100",
        FFP_PUBLIC_ASSET_BASE_URL: "./assets"
      },
      stdio: "inherit"
    });

    execFileSync(process.execPath, [tscPath, "-p", webTsconfig], {
      cwd: rootDir,
      env: process.env,
      stdio: "inherit"
    });

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      assets: Array<{ id: string; publicUrl: string }>;
    };

    expect(existsSync(resolve(rootDir, "apps/web/dist/index.html"))).toBe(true);
    expect(existsSync(resolve(rootDir, "apps/web/dist/app.js"))).toBe(true);
    expect(existsSync(resolve(rootDir, "apps/web/dist/config.js"))).toBe(true);
    expect(manifest.assets.some((asset) => asset.id === "brand:logo-primary")).toBe(true);
    expect(manifest.assets.some((asset) => asset.id === "diagrams:runtime-topology")).toBe(true);
    expect(manifest.assets.every((asset) => asset.publicUrl.startsWith("./assets/"))).toBe(true);
  });

  test("rewrites manifest URLs in dry-run mode", { timeout: 10000 }, () => {
    execFileSync(process.execPath, [publishScript], {
      cwd: rootDir,
      env: {
        ...process.env,
        CLOUDFLARE_R2_DRY_RUN: "true",
        CLOUDFLARE_R2_PUBLIC_BASE_URL: "https://assets.example.com"
      },
      stdio: "inherit"
    });

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      publishedAt: string | null;
      assets: Array<{ publicUrl: string; publishedAt: string | null }>;
    };

    expect(manifest.publishedAt).toBeTruthy();
    expect(manifest.assets.every((asset) => asset.publicUrl.startsWith("https://assets.example.com/"))).toBe(true);
    expect(manifest.assets.every((asset) => Boolean(asset.publishedAt))).toBe(true);
  });
});

