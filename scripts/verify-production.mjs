const apiBaseUrl = (process.env.FFP_PRODUCTION_API_BASE_URL ?? "").replace(/\/$/, "");
const webUrl = (process.env.FFP_PRODUCTION_WEB_URL ?? "").replace(/\/$/, "");

if (!apiBaseUrl) {
  throw new Error("FFP_PRODUCTION_API_BASE_URL must be set");
}

const health = await fetchJson(`${apiBaseUrl}/health`);
const snapshot = await fetchJson(`${apiBaseUrl}/snapshot`);
const tokenSupply = await fetchJson(`${apiBaseUrl}/token/supply`);
const tokenEvents = await fetchJson(`${apiBaseUrl}/token/events`);

const report = {
  checkedAt: new Date().toISOString(),
  apiBaseUrl,
  webUrl: webUrl || null,
  health,
  snapshot: {
    agents: snapshot.agents?.length ?? 0,
    proposals: snapshot.proposals?.length ?? 0,
    blocks: snapshot.blocks?.length ?? 0,
    auditEvents: snapshot.auditTrail?.length ?? 0
  },
  tokenSupply,
  tokenEventCount: Array.isArray(tokenEvents) ? tokenEvents.length : 0,
  web: null
};

if (webUrl) {
  const response = await fetch(webUrl, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Web verification failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  report.web = {
    status: response.status,
    containsTitle: html.includes("FURGE FABRIC PROTOCOL; The Singularity"),
    containsExplorer: html.includes("Public explorer"),
    containsOperator: html.includes("Protected operator console")
  };
}

console.log(`${JSON.stringify(report, null, 2)}\n`);

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${url} returned ${response.status} ${response.statusText}: ${message}`);
  }
  return response.json();
}
