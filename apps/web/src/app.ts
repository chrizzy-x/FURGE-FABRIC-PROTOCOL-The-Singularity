type FfpConfig = {
  apiBaseUrl?: string;
  assetBaseUrl?: string;
};

type HealthResponse = {
  ok: boolean;
  service: string;
  persistence: string;
};

type SnapshotResponse = {
  startedAt: string;
  agents: Array<{ agentId: string; label: string; modelFamily: string; capabilities: string[]; reputation: number }>;
  proposals: Array<{ proposalId: string; subject: string; summary: string; status: string; proposerId: string; createdAt: string }>;
  blocks: Array<{ blockId: string; height: number; createdAt: string; proposal: { proposalId: string; subject: string }; result: { status: string; confidence: number } }>;
  auditTrail: Array<{ eventId: string; type: string; actorId: string; referenceId: string; createdAt: string }>;
  reputationEvents: Array<{ eventId: string; agentId: string; delta: number; createdAt: string }>;
  tokenAccounts: Array<{ accountId: string; ownerId: string; balance: number; nonce: number; ownerType: string }>;
  peers: Array<{ agentId: string; peerId: string; listenAddresses: string[] }>;
};

type TokenSupplyResponse = {
  tokenSymbol: string;
  maxSupply: number;
  mintedSupply: number;
  circulatingSupply: number;
  remainingSupply: number;
  currentReward: number;
  halvingInterval: number;
  nextHalvingAtBlock: number;
};

type TokenEventResponse = {
  eventId: string;
  kind: string;
  referenceId: string;
  initiatorId: string;
  amount: number;
  feeAmount: number;
  supplyAfter: number;
  createdAt: string;
};

type BridgeRunResponse = {
  runId: string;
  adapterId: string;
  requestId: string;
  status: string;
  consensusStatus: string;
  createdAt: string;
};

type FeeResponse = {
  feeEventId: string;
  amount: number;
  kind: string;
  payerId: string;
  payeeId?: string;
  referenceId: string;
  createdAt: string;
};

type OperatorSession = {
  username: string;
  role: "operator";
  issuedAt: string;
  expiresAt: string;
};

type OperatorLoginResponse = {
  token: string;
  session: OperatorSession;
};

type AssetManifest = {
  generatedAt: string;
  assets: Array<{
    id: string;
    name: string;
    category: string;
    sourcePath: string;
    distPath: string;
    checksum: string;
    size: number;
    r2ObjectKey: string;
    publicUrl: string;
  }>;
};

export {};

type DashboardState = {
  health?: HealthResponse;
  snapshot?: SnapshotResponse;
  tokenSupply?: TokenSupplyResponse;
  tokenEvents: TokenEventResponse[];
  bridgeRuns: BridgeRunResponse[];
  feeEvents: FeeResponse[];
  operatorSession?: OperatorSession;
  operatorToken?: string;
  manifest?: AssetManifest;
};

declare global {
  interface Window {
    FFP_CONFIG?: FfpConfig;
  }
}

const config: Required<FfpConfig> = {
  apiBaseUrl: (window.FFP_CONFIG?.apiBaseUrl ?? "http://127.0.0.1:3100").replace(/\/$/, ""),
  assetBaseUrl: (window.FFP_CONFIG?.assetBaseUrl ?? "./assets").replace(/\/$/, "")
};

const state: DashboardState = {
  tokenEvents: [],
  bridgeRuns: [],
  feeEvents: [],
  operatorToken: localStorage.getItem("ffp.operatorToken") ?? undefined
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing app root");
}

const appRoot = app;

void bootstrap();

async function bootstrap() {
  renderShell();
  wireNavigation();
  wireForms();
  await Promise.all([loadManifest(), refreshPublicData(), restoreOperatorSession()]);
}

function renderShell() {
  appRoot.innerHTML = `
    <div class="site-shell">
      <header class="topbar">
        <div class="brandline">
          <div class="brandline-logo"><img id="brand-mark" alt="FURGE mark" /></div>
          <div class="brandline-copy">
            <span class="eyebrow">Layer 0 Production Release</span>
            <p class="brandline-title">FURGE FABRIC PROTOCOL; The Singularity</p>
          </div>
        </div>
        <nav class="topnav">
          <a href="#overview">Overview</a>
          <a href="#protocol">Protocol</a>
          <a href="#explorer">Explorer</a>
          <a href="#operator">Operator</a>
          <button id="refresh-button" type="button">Refresh Live State</button>
        </nav>
      </header>

      <section class="hero" id="overview">
        <article class="hero-card hero-copy">
          <span class="eyebrow">Deterministic agent coordination</span>
          <h1>Consensus, audit, and $FURGE on one Layer 0 runtime.</h1>
          <p>
            FURGE is the coordination substrate beneath higher chains and applications. This release ships the
            live protocol API, a public explorer, a protected operator console, immutable audit history, and
            the protocol-native $FURGE asset with scarcity-oriented issuance and fee settlement.
          </p>
          <div class="hero-actions">
            <a class="cta-primary" href="#explorer">Open Explorer</a>
            <a class="cta-secondary" href="#operator">Open Operator Console</a>
          </div>
        </article>

        <aside class="hero-card hero-grid">
          <div class="hero-logo-panel">
            <img class="hero-logo" id="brand-logo" alt="FURGE primary logo" />
            <p class="small">
              Branded release artifacts, topology diagrams, and screenshots are versioned in-repo and published
              through the production asset pipeline.
            </p>
          </div>
          <div class="stat-grid" id="hero-stats"></div>
        </aside>
      </section>

      <section class="section" id="protocol">
        <div class="section-header">
          <div>
            <h2>How the system works</h2>
            <p>
              Agents propose work, consensus evaluates with reputation weighting, finalized decisions become
              immutable blocks, and $FURGE records rewards, transfers, fees, and supply movement against the
              same durable protocol history.
            </p>
          </div>
        </div>
        <div class="docs-grid">
          <article class="panel">
            <h3>Layer 0 scope</h3>
            <p>
              This repository is the base protocol. It does not build marketplace products, metaverse chains,
              or domain-specific applications in this release. It ships the shared coordination engine those
              later layers would consume.
            </p>
            <ul class="list-inline">
              <li>Agent identity</li>
              <li>Reputation-weighted BFT consensus</li>
              <li>Immutable block chain</li>
              <li>Audited bridge execution</li>
              <li>Protocol-native $FURGE token</li>
              <li>Durable PostgreSQL + Redis runtime</li>
            </ul>
          </article>
          <article class="panel diagram-card">
            <h3>Protocol flow</h3>
            <p>Proposal, vote, finalize, reward, settle, and persist are all visible through the same runtime.</p>
            <img id="diagram-flow" alt="Protocol flow diagram" />
          </article>
        </div>
        <div class="protocol-grid" id="protocol-pillars"></div>
      </section>

      <section class="section" id="explorer">
        <div class="section-header">
          <div>
            <h2>Public explorer</h2>
            <p>
              Read-only production telemetry for health, agents, proposals, finalized blocks, bridges, fees,
              token accounts, token events, and audit history.
            </p>
          </div>
        </div>
        <div class="explorer-grid">
          <article class="panel">
            <h3>Network status</h3>
            <div id="network-status" class="status-line">Loading live runtime state...</div>
            <div class="table-wrap" id="agents-table"></div>
          </article>
          <article class="panel diagram-card">
            <h3>Runtime topology</h3>
            <p>The reference runtime keeps peers, consensus, persistence, and token settlement on one substrate.</p>
            <img id="diagram-topology" alt="Runtime topology diagram" />
          </article>
          <article class="panel">
            <h3>Proposals and blocks</h3>
            <div class="table-wrap" id="proposals-table"></div>
            <div class="table-wrap" id="blocks-table" style="margin-top: 16px;"></div>
          </article>
          <article class="panel">
            <h3>$FURGE supply and accounts</h3>
            <div id="token-supply-box" class="notice">Loading token supply...</div>
            <div class="table-wrap" id="token-accounts-table" style="margin-top: 16px;"></div>
          </article>
          <article class="panel">
            <h3>Bridge runs and fees</h3>
            <div class="table-wrap" id="bridge-runs-table"></div>
            <div class="table-wrap" id="fees-table" style="margin-top: 16px;"></div>
          </article>
          <article class="panel">
            <h3>Audit and token event trail</h3>
            <div class="table-wrap" id="audit-table"></div>
            <div class="table-wrap" id="token-events-table" style="margin-top: 16px;"></div>
          </article>
        </div>
      </section>

      <section class="section" id="operator">
        <div class="section-header">
          <div>
            <h2>Protected operator console</h2>
            <p>
              Write-path actions are protected. Use the operator session to submit proposals, trigger bridge
              execution, and settle token transfers without exposing mutation routes publicly.
            </p>
          </div>
        </div>
        <div class="operator-grid">
          <article class="panel">
            <h3>Operator session</h3>
            <div id="operator-session" class="status-line">Not signed in.</div>
            <form id="login-form" class="form-grid" style="margin-top: 16px;">
              <label>
                Username
                <input name="username" type="text" placeholder="operator" autocomplete="username" required />
              </label>
              <label>
                Password
                <input name="password" type="password" placeholder="operator" autocomplete="current-password" required />
              </label>
              <div class="form-actions">
                <button class="action-button primary" type="submit">Sign In</button>
                <button class="action-button secondary" id="logout-button" type="button">Sign Out</button>
              </div>
            </form>
            <p class="small">Local development defaults to <span class="mono">operator / operator</span> unless env credentials override it.</p>
          </article>
          <article class="panel">
            <h3>Write-path actions</h3>
            <div id="operator-response" class="response-box">No operator action executed yet.</div>
            <div class="docs-grid" style="margin-top: 16px;">
              <form id="proposal-form" class="form-grid panel" style="padding: 18px; margin: 0;">
                <h4>Submit proposal</h4>
                <label>
                  Subject
                  <input name="subject" type="text" placeholder="Promote new validator cohort" required />
                </label>
                <label>
                  Summary
                  <textarea name="summary" placeholder="Explain what the proposal changes and why." required></textarea>
                </label>
                <label>
                  Payload JSON
                  <textarea name="payload" required>{"scope":"protocol","action":"rotate-validator-set"}</textarea>
                </label>
                <button class="action-button primary" type="submit">Submit proposal</button>
              </form>

              <form id="bridge-form" class="form-grid panel" style="padding: 18px; margin: 0;">
                <h4>Execute bridge</h4>
                <label>
                  Adapter ID
                  <input name="adapterId" type="text" placeholder="http-sync" required />
                </label>
                <label>
                  Operation
                  <input name="operation" type="text" placeholder="POST /sync" required />
                </label>
                <label>
                  Requested by agent
                  <input name="requestedBy" type="text" placeholder="64-char agent id" required />
                </label>
                <label>
                  Payload JSON
                  <textarea name="payload" required>{"target":"network-state","mode":"audit"}</textarea>
                </label>
                <button class="action-button primary" type="submit">Execute bridge</button>
              </form>

              <form id="transfer-form" class="form-grid panel" style="padding: 18px; margin: 0;">
                <h4>Transfer $FURGE</h4>
                <label>
                  From agent
                  <input name="fromAgentId" type="text" placeholder="sender agent id" required />
                </label>
                <label>
                  To agent
                  <input name="toAgentId" type="text" placeholder="recipient agent id" required />
                </label>
                <label>
                  Amount
                  <input name="amount" type="number" min="0.000001" step="0.000001" placeholder="10" required />
                </label>
                <label>
                  Nonce
                  <input name="nonce" type="number" min="0" step="1" placeholder="0" required />
                </label>
                <label>
                  Memo
                  <input name="memo" type="text" placeholder="Operator settlement" />
                </label>
                <button class="action-button primary" type="submit">Settle transfer</button>
              </form>
            </div>
          </article>
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <div>
            <h2>Release surfaces</h2>
            <p>
              This production slice includes the API runtime, explorer, operator console, docs surface, and the
              versioned asset pipeline for logos, diagrams, screenshots, and deployment artifacts.
            </p>
          </div>
        </div>
        <div class="footer-grid">
          <article class="footer-card">
            <h3>API runtime</h3>
            <p>Render-hosted Fastify service with PostgreSQL persistence, Redis cache projection, operator auth, and protected mutation routes.</p>
          </article>
          <article class="footer-card">
            <h3>Web surface</h3>
            <p>Cloudflare Pages site with public explorer, protected operator console, docs, branding, and live protocol telemetry.</p>
          </article>
          <article class="footer-card">
            <h3>Asset pipeline</h3>
            <p>Repository-kept source assets with generated manifests and Cloudflare R2 publication for public media delivery.</p>
          </article>
        </div>
      </section>
    </div>
  `;

  renderHeroStats();
  renderProtocolPillars();
}

function wireNavigation() {
  const refreshButton = document.querySelector<HTMLButtonElement>("#refresh-button");
  refreshButton?.addEventListener("click", () => {
    void refreshPublicData();
  });
}

function wireForms() {
  const loginForm = document.querySelector<HTMLFormElement>("#login-form");
  const logoutButton = document.querySelector<HTMLButtonElement>("#logout-button");
  const proposalForm = document.querySelector<HTMLFormElement>("#proposal-form");
  const bridgeForm = document.querySelector<HTMLFormElement>("#bridge-form");
  const transferForm = document.querySelector<HTMLFormElement>("#transfer-form");

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    try {
      const result = await api<OperatorLoginResponse>("/auth/operator/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: String(formData.get("username") ?? ""),
          password: String(formData.get("password") ?? "")
        })
      });
      state.operatorToken = result.token;
      state.operatorSession = result.session;
      localStorage.setItem("ffp.operatorToken", result.token);
      renderOperatorSession();
      renderOperatorResponse(result);
    } catch (error) {
      renderOperatorResponse({ error: extractMessage(error) });
    }
  });

  logoutButton?.addEventListener("click", () => {
    state.operatorToken = undefined;
    state.operatorSession = undefined;
    localStorage.removeItem("ffp.operatorToken");
    renderOperatorSession();
    renderOperatorResponse({ ok: true, message: "Operator session cleared" });
  });

  proposalForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const formData = new FormData(proposalForm);
      const result = await api("/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: String(formData.get("subject") ?? ""),
          summary: String(formData.get("summary") ?? ""),
          payload: parseJsonField(formData.get("payload"), "proposal payload")
        })
      }, true);
      renderOperatorResponse(result);
      await refreshPublicData();
      proposalForm.reset();
    } catch (error) {
      renderOperatorResponse({ error: extractMessage(error) });
    }
  });

  bridgeForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const formData = new FormData(bridgeForm);
      const result = await api("/bridges/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adapterId: String(formData.get("adapterId") ?? ""),
          operation: String(formData.get("operation") ?? ""),
          requestedBy: String(formData.get("requestedBy") ?? ""),
          payload: parseJsonField(formData.get("payload"), "bridge payload")
        })
      }, true);
      renderOperatorResponse(result);
      await refreshPublicData();
    } catch (error) {
      renderOperatorResponse({ error: extractMessage(error) });
    }
  });

  transferForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const formData = new FormData(transferForm);
      const result = await api("/token/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAgentId: String(formData.get("fromAgentId") ?? ""),
          toAgentId: String(formData.get("toAgentId") ?? ""),
          amount: Number(formData.get("amount") ?? 0),
          nonce: Number(formData.get("nonce") ?? 0),
          memo: String(formData.get("memo") ?? "").trim() || undefined
        })
      }, true);
      renderOperatorResponse(result);
      await refreshPublicData();
    } catch (error) {
      renderOperatorResponse({ error: extractMessage(error) });
    }
  });
}

async function loadManifest() {
  try {
    const manifest = await fetchJson<AssetManifest>("./assets/manifests/asset-manifest.json", { cache: "no-store" });
    state.manifest = manifest;
    renderManifestAssets();
  } catch {
    renderManifestAssets();
  }
}

async function restoreOperatorSession() {
  if (!state.operatorToken) {
    renderOperatorSession();
    return;
  }

  try {
    state.operatorSession = await api<OperatorSession>("/auth/operator/me", { method: "GET" }, true);
  } catch {
    state.operatorToken = undefined;
    state.operatorSession = undefined;
    localStorage.removeItem("ffp.operatorToken");
  }

  renderOperatorSession();
}

async function refreshPublicData() {
  try {
    const [health, snapshot, tokenSupply, tokenEvents, bridgeRuns, feeEvents] = await Promise.all([
      api<HealthResponse>("/health"),
      api<SnapshotResponse>("/snapshot"),
      api<TokenSupplyResponse>("/token/supply"),
      api<TokenEventResponse[]>("/token/events"),
      api<BridgeRunResponse[]>("/bridges/runs"),
      api<FeeResponse[]>("/fees")
    ]);

    state.health = health;
    state.snapshot = snapshot;
    state.tokenSupply = tokenSupply;
    state.tokenEvents = tokenEvents;
    state.bridgeRuns = bridgeRuns;
    state.feeEvents = feeEvents;

    renderHeroStats();
    renderExplorer();
  } catch (error) {
    renderFetchFailure(extractMessage(error));
  }
}

function renderManifestAssets() {
  setAssetImage("brand-mark", resolveAssetUrl("brand:logo-mark"));
  setAssetImage("brand-logo", resolveAssetUrl("brand:logo-primary"));
  setAssetImage("diagram-flow", resolveAssetUrl("diagrams:protocol-flow"));
  setAssetImage("diagram-topology", resolveAssetUrl("diagrams:runtime-topology"));
}

function renderHeroStats() {
  const target = document.querySelector<HTMLDivElement>("#hero-stats");
  if (!target) {
    return;
  }

  const cards = [
    { label: "Agents", value: state.snapshot?.agents.length ?? "--" },
    { label: "Finalized Blocks", value: state.snapshot?.blocks.length ?? "--" },
    { label: "$FURGE Circulating", value: formatToken(state.tokenSupply?.circulatingSupply) },
    { label: "Persistence", value: state.health?.persistence ?? "--" }
  ];

  target.innerHTML = cards
    .map(
      (entry) => `
        <div class="stat-card">
          <div class="stat-label">${escapeHtml(entry.label)}</div>
          <div class="stat-value">${escapeHtml(String(entry.value))}</div>
        </div>
      `
    )
    .join("");
}

function renderProtocolPillars() {
  const target = document.querySelector<HTMLDivElement>("#protocol-pillars");
  if (!target) {
    return;
  }

  const pillars = [
    {
      title: "Consensus and audit",
      body:
        "Reputation-weighted BFT consensus produces immutable finalized blocks and a queryable audit trail that remains aligned with agent identity and proposal history."
    },
    {
      title: "$FURGE monetary logic",
      body:
        "The protocol-native asset carries fixed-cap issuance, validator rewards, nonce-protected transfers, fee settlement, and deterministic supply accounting."
    },
    {
      title: "Durable runtime",
      body:
        "The same local network can run in memory or restore through PostgreSQL and Redis, which keeps protocol state recoverable across restarts."
    }
  ];

  target.innerHTML = pillars
    .map(
      (entry) => `
        <article class="panel protocol-pillar">
          <h3>${escapeHtml(entry.title)}</h3>
          <p>${escapeHtml(entry.body)}</p>
        </article>
      `
    )
    .join("");
}

function renderExplorer() {
  const status = document.querySelector<HTMLDivElement>("#network-status");
  if (status) {
    status.innerHTML = `
      <strong>${escapeHtml(state.health?.service ?? "ffp-layer-zero-api")}</strong><br />
      Runtime status: <span class="badge ${state.health?.ok ? "ok" : "error"}">${state.health?.ok ? "healthy" : "unavailable"}</span>
      <span class="small">Persistence: ${escapeHtml(state.health?.persistence ?? "unknown")}</span>
    `;
  }

  const snapshot = state.snapshot;
  if (!snapshot) {
    return;
  }

  renderTable(
    "#agents-table",
    ["Agent", "Model", "Capabilities", "Reputation"],
    snapshot.agents.slice(0, 8).map((agent) => [
      renderCode(agent.label, agent.agentId),
      agent.modelFamily,
      agent.capabilities.join(", "),
      String(agent.reputation)
    ])
  );

  renderTable(
    "#proposals-table",
    ["Proposal", "Status", "Proposer", "Created"],
    snapshot.proposals.slice(0, 8).map((proposal) => [
      `<strong>${escapeHtml(proposal.subject)}</strong><br /><span class="small mono">${escapeHtml(shortId(proposal.proposalId))}</span>`,
      renderBadge(proposal.status),
      `<span class="mono">${escapeHtml(shortId(proposal.proposerId))}</span>`,
      formatDate(proposal.createdAt)
    ])
  );

  renderTable(
    "#blocks-table",
    ["Height", "Proposal", "Result", "Created"],
    snapshot.blocks.slice(-8).reverse().map((block) => [
      String(block.height),
      `<strong>${escapeHtml(block.proposal.subject)}</strong><br /><span class="small mono">${escapeHtml(shortId(block.blockId))}</span>`,
      `${renderBadge(block.result.status)}<br /><span class="small">Confidence ${escapeHtml(block.result.confidence.toFixed(2))}</span>`,
      formatDate(block.createdAt)
    ])
  );

  if (state.tokenSupply) {
    const tokenSupplyBox = document.querySelector<HTMLDivElement>("#token-supply-box");
    if (tokenSupplyBox) {
      tokenSupplyBox.innerHTML = `
        <strong>${escapeHtml(state.tokenSupply.tokenSymbol)}</strong><br />
        Minted ${formatToken(state.tokenSupply.mintedSupply)} / Max ${formatToken(state.tokenSupply.maxSupply)}<br />
        Circulating ${formatToken(state.tokenSupply.circulatingSupply)}<br />
        Current reward ${formatToken(state.tokenSupply.currentReward)}<br />
        Next halving at block ${escapeHtml(String(state.tokenSupply.nextHalvingAtBlock))}
      `;
    }
  }

  renderTable(
    "#token-accounts-table",
    ["Owner", "Balance", "Nonce", "Account"],
    snapshot.tokenAccounts.slice(0, 8).map((account) => [
      renderCode(account.ownerType, account.ownerId),
      formatToken(account.balance),
      String(account.nonce),
      `<span class="mono">${escapeHtml(shortId(account.accountId))}</span>`
    ])
  );

  renderTable(
    "#bridge-runs-table",
    ["Adapter", "Status", "Consensus", "Created"],
    state.bridgeRuns.slice(-8).reverse().map((run) => [
      `<strong>${escapeHtml(run.adapterId)}</strong><br /><span class="small mono">${escapeHtml(shortId(run.runId))}</span>`,
      renderBadge(run.status),
      renderBadge(run.consensusStatus),
      formatDate(run.createdAt)
    ])
  );

  renderTable(
    "#fees-table",
    ["Kind", "Amount", "Payer", "Created"],
    state.feeEvents.slice(-8).reverse().map((fee) => [
      escapeHtml(fee.kind),
      formatToken(fee.amount),
      `<span class="mono">${escapeHtml(shortId(fee.payerId))}</span>`,
      formatDate(fee.createdAt)
    ])
  );

  renderTable(
    "#audit-table",
    ["Type", "Actor", "Reference", "Created"],
    snapshot.auditTrail.slice(-8).reverse().map((event) => [
      escapeHtml(event.type),
      `<span class="mono">${escapeHtml(shortId(event.actorId))}</span>`,
      `<span class="mono">${escapeHtml(shortId(event.referenceId))}</span>`,
      formatDate(event.createdAt)
    ])
  );

  renderTable(
    "#token-events-table",
    ["Kind", "Amount", "Fee", "Created"],
    state.tokenEvents.slice(-8).reverse().map((event) => [
      renderBadge(event.kind),
      formatToken(event.amount),
      formatToken(event.feeAmount),
      formatDate(event.createdAt)
    ])
  );
}

function renderFetchFailure(message: string) {
  const status = document.querySelector<HTMLDivElement>("#network-status");
  if (status) {
    status.innerHTML = `<strong>Runtime fetch failed</strong><br /><span class="badge error">${escapeHtml(message)}</span>`;
  }
}

function renderOperatorSession() {
  const sessionBox = document.querySelector<HTMLDivElement>("#operator-session");
  if (!sessionBox) {
    return;
  }

  if (!state.operatorSession) {
    sessionBox.innerHTML = "<strong>Not signed in.</strong><br /><span class=\"small\">Public explorer remains available. Mutation routes require operator authentication.</span>";
    return;
  }

  sessionBox.innerHTML = `
    <strong>${escapeHtml(state.operatorSession.username)}</strong>
    <span class="badge operator">${escapeHtml(state.operatorSession.role)}</span><br />
    <span class="small">Issued ${formatDate(state.operatorSession.issuedAt)} | Expires ${formatDate(state.operatorSession.expiresAt)}</span>
  `;
}

function renderOperatorResponse(payload: unknown) {
  const target = document.querySelector<HTMLDivElement>("#operator-response");
  if (!target) {
    return;
  }

  target.innerHTML = `<pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`;
}

function renderTable(selector: string, headers: string[], rows: string[][]) {
  const target = document.querySelector<HTMLDivElement>(selector);
  if (!target) {
    return;
  }

  if (rows.length === 0) {
    target.innerHTML = '<div class="notice">No records available yet.</div>';
    return;
  }

  target.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
          .join("")}
      </tbody>
    </table>
  `;
}

function renderBadge(status: string) {
  const normalized = ["accepted", "healthy", "ok", "executed", "validated", "recovered", "operator"].includes(status)
    ? "accepted"
    : ["rejected", "failed", "error"].includes(status)
      ? "rejected"
      : "pending";
  return `<span class="badge ${normalized}">${escapeHtml(status)}</span>`;
}

function renderCode(label: string, fullValue: string) {
  return `<strong>${escapeHtml(label)}</strong><br /><span class="small mono">${escapeHtml(shortId(fullValue))}</span>`;
}

function setAssetImage(elementId: string, url?: string) {
  const element = document.querySelector<HTMLImageElement>(`#${elementId}`);
  if (!element || !url) {
    return;
  }

  element.src = url;
}

function resolveAssetUrl(assetId: string) {
  const entry = state.manifest?.assets.find((asset) => asset.id === assetId);
  if (!entry) {
    return undefined;
  }

  if (entry.publicUrl.startsWith("http://") || entry.publicUrl.startsWith("https://")) {
    return entry.publicUrl;
  }

  return entry.publicUrl.startsWith("./") ? entry.publicUrl : `./${entry.publicUrl}`;
}

function parseJsonField(value: FormDataEntryValue | null, label: string) {
  try {
    return JSON.parse(String(value ?? "{}"));
  } catch {
    throw new Error(`Invalid ${label} JSON`);
  }
}

async function api<T>(path: string, init: RequestInit = {}, requiresAuth = false) {
  const headers = new Headers(init.headers ?? {});
  if (requiresAuth) {
    if (!state.operatorToken) {
      throw new Error("Operator authentication required");
    }
    headers.set("Authorization", `Bearer ${state.operatorToken}`);
  }

  return fetchJson<T>(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers
  });
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Keep default message.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatToken(value: number | undefined) {
  if (value === undefined) {
    return "--";
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value);
}

function shortId(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function extractMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}


