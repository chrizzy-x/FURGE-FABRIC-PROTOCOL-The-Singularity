import { createHash, createHmac } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(rootDir, "assets/manifests/asset-manifest.json");
const distManifestPath = resolve(rootDir, "apps/web/dist/assets/manifests/asset-manifest.json");
const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID ?? "";
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? "";
const bucket = process.env.CLOUDFLARE_R2_BUCKET ?? "";
const publicBaseUrl = (process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL ?? process.env.FFP_PUBLIC_ASSET_BASE_URL ?? "").replace(/\/$/, "");
const dryRun = process.env.CLOUDFLARE_R2_DRY_RUN === "true";

if (!publicBaseUrl) {
  throw new Error("CLOUDFLARE_R2_PUBLIC_BASE_URL or FFP_PUBLIC_ASSET_BASE_URL must be set");
}

if (!dryRun && (!accountId || !accessKeyId || !secretAccessKey || !bucket)) {
  throw new Error("Missing Cloudflare R2 credentials or bucket configuration");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (!Array.isArray(manifest.assets)) {
  throw new Error("Asset manifest is invalid or has not been generated yet");
}

const publishedAt = new Date().toISOString();
for (const asset of manifest.assets) {
  const localFile = resolve(rootDir, "apps/web/dist", asset.distPath);
  const body = await readFile(localFile);
  if (!dryRun) {
    await uploadObject({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      objectKey: asset.r2ObjectKey,
      body,
      contentType: guessContentType(localFile)
    });
  }

  asset.publicUrl = `${publicBaseUrl}/${asset.r2ObjectKey}`;
  asset.publishedAt = publishedAt;
}

manifest.publishedAt = publishedAt;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(distManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      dryRun,
      assetCount: manifest.assets.length,
      bucket: bucket || null,
      publishedAt,
      publicBaseUrl
    },
    null,
    2
  )
);

async function uploadObject({ accountId, accessKeyId, secretAccessKey, bucket, objectKey, body, contentType }) {
  const method = "PUT";
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const canonicalUri = `/${encodePath(bucket)}/${objectKey.split("/").map(encodePath).join("/")}`;
  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`
  ].join("\n");
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n\n${signedHeaders}\n${payloadHash}`;
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;
  const signingKey = getSigningKey(secretAccessKey, dateStamp, "auto", "s3");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const response = await fetch(`https://${host}${canonicalUri}`, {
    method,
    headers: {
      "content-type": contentType,
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      authorization
    },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`R2 upload failed for ${objectKey}: ${response.status} ${response.statusText} ${text}`);
  }
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function getSigningKey(secretAccessKey, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

function encodePath(value) {
  return encodeURIComponent(value).replace(/[!*'()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function guessContentType(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".json":
      return "application/json";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
