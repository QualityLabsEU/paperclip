import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  agents,
  agentWakeupRequests,
  companies,
  createDb,
  heartbeatRuns,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { heartbeatService } from "../services/heartbeat.ts";
import { runningProcesses } from "../adapters/index.ts";

const mockReadiness = vi.hoisted(() => vi.fn(async (_db?: unknown, _workers?: unknown, _agent?: { id: string }) => [] as Array<{ state: string }>));
vi.mock("../services/agent-readiness.js", () => ({ getAgentReadiness: mockReadiness }));

const mockAdapterExecute = vi.hoisted(() =>
  vi.fn(async () => ({
    exitCode: 0,
    signal: null,
    timedOut: false,
    errorMessage: null,
    summary: "Queued-run claim isolation test run.",
    provider: "test",
    model: "test-model",
  })),
);

vi.mock("../adapters/index.ts", async () => {
  const actual = await vi.importActual<typeof import("../adapters/index.ts")>("../adapters/index.ts");
  return {
    ...actual,
    getServerAdapter: vi.fn(() => ({
      supportsLocalAgentJwt: false,
      execute: mockAdapterExecute,
    })),
  };
});

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres queued-run claim isolation tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("heartbeat queued-run claim isolation", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let heartbeat!: ReturnType<typeof heartbeatService>;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("heartbeat-queued-run-claim-isolation-");
    db = createDb(tempDb.connectionString);
    heartbeat = heartbeatService(db);
  }, 20_000);

  afterEach(async () => {
    await heartbeat.drainActiveRunExecutions();
    mockAdapterExecute.mockClear();
    mockReadiness.mockReset();
    mockReadiness.mockResolvedValue([]);
    runningProcesses.clear();
    // Executed runs write to many company-scoped tables; clear them all.
    await db.execute(sql`truncate table ${companies} cascade`);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function insertAgent() {
    const companyId = randomUUID();
    const agentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Claim Isolation Co",
      status: "active",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Claim Isolation Agent",
      role: "engineer",
      status: "idle",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {
        heartbeat: {
          enabled: true,
          intervalSec: 60,
          wakeOnDemand: true,
          maxConcurrentRuns: 1,
        },
      },
      permissions: {},
    });

    return { companyId, agentId };
  }

  async function insertQueuedRun(
    companyId: string,
    agentId: string,
    wake: Partial<typeof agentWakeupRequests.$inferInsert>,
    createdAt: Date,
  ) {
    const wakeupRequestId = randomUUID();
    const runId = randomUUID();

    await db.insert(agentWakeupRequests).values({
      id: wakeupRequestId,
      companyId,
      agentId,
      source: "on_demand",
      triggerDetail: "manual",
      status: "queued",
      runId,
      ...wake,
    });
    await db.insert(heartbeatRuns).values({
      id: runId,
      companyId,
      agentId,
      invocationSource: "on_demand",
      triggerDetail: "manual",
      status: "queued",
      wakeupRequestId,
      createdAt,
    });

    return { runId, wakeupRequestId };
  }

  // A queued-comment interrupt wake whose receipt cannot be verified. The run
  // identity check rejects it with a 403 every time the run is claimed.
  function insertUnverifiableInterruptRun(companyId: string, agentId: string, createdAt = new Date(Date.now() - 60_000)) {
    return insertQueuedRun(companyId, agentId, {
      reason: "issue_commented",
      idempotencyKey: `queued-comment-interrupt:${randomUUID()}`,
      requestedByActorType: "user",
      requestedByActorId: "board-user",
    }, createdAt);
  }

  // A system wake with no issue in a company without members. Its responsible
  // user cannot be resolved yet (422), but a user added later would fix that.
  function insertUnresolvableOwnerRun(companyId: string, agentId: string, createdAt = new Date(Date.now() - 60_000)) {
    return insertQueuedRun(companyId, agentId, {
      source: "automation",
      triggerDetail: "system",
      requestedByActorType: "system",
      requestedByActorId: "heartbeat_test",
    }, createdAt);
  }

  // A manual wake from a user. It resolves its identity from the receipt, so it
  // can always be claimed.
  function insertClaimableRun(companyId: string, agentId: string, createdAt = new Date()) {
    return insertQueuedRun(companyId, agentId, {
      requestedByActorType: "user",
      requestedByActorId: "board-user",
      payload: { manualUserWake: true },
    }, createdAt);
  }

  async function runStatus(runId: string) {
    return db
      .select({ status: heartbeatRuns.status, errorCode: heartbeatRuns.errorCode, error: heartbeatRuns.error })
      .from(heartbeatRuns)
      .where(sql`${heartbeatRuns.id} = ${runId}`)
      .then((rows) => rows[0] ?? null);
  }

  it("checks once per agent and lets healthy queues run while another readiness check waits", async () => {
    const slow = await insertAgent(); const healthy = await insertAgent();
    const first = await insertClaimableRun(slow.companyId, slow.agentId);
    const second = await insertClaimableRun(slow.companyId, slow.agentId);
    const running = await insertClaimableRun(healthy.companyId, healthy.agentId);
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    mockReadiness.mockImplementation(async (_db, _workers, agent) => {
      if (agent?.id === slow.agentId) { await waiting; return [{ state: "unavailable" }]; }
      return [{ state: "ready" }];
    });
    const recovery = heartbeat.resumeQueuedRuns();
    try {
      await vi.waitFor(() => expect(mockAdapterExecute).toHaveBeenCalledTimes(1));
      await heartbeat.drainActiveRunExecutions();
      expect(await runStatus(running.runId)).toMatchObject({ status: "succeeded" });
      expect(await runStatus(first.runId)).toMatchObject({ status: "queued" });
      expect(await runStatus(second.runId)).toMatchObject({ status: "queued" });
      expect(mockReadiness.mock.calls.filter(call => call[2]?.id === slow.agentId)).toHaveLength(1);
    } finally { release(); await recovery; }
  });

  it("bounds and coalesces recovery while scanning every page of held agents", async () => {
    for (let index = 0; index < 101; index++) {
      const agent = await insertAgent();
      await insertClaimableRun(agent.companyId, agent.agentId);
    }
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    let active = 0; let peak = 0;
    mockReadiness.mockImplementation(async () => {
      active++; peak = Math.max(peak, active);
      try { await waiting; return [{ state: "pending" }]; }
      finally { active--; }
    });
    const recovery = heartbeat.resumeQueuedRuns();
    try {
      await vi.waitFor(() => expect(mockReadiness).toHaveBeenCalledTimes(8));
      expect(heartbeat.resumeQueuedRuns()).toBe(recovery);
    } finally { release(); await recovery; }
    expect(peak).toBe(8);
    expect(mockReadiness).toHaveBeenCalledTimes(101);
    expect(new Set(mockReadiness.mock.calls.map(call => call[2]?.id)).size).toBe(101);
    expect(mockAdapterExecute).not.toHaveBeenCalled();
  }, 30_000);

  it("keeps the same run queued through setup and provider outage, then executes when ready", async () => {
    const { companyId, agentId } = await insertAgent();
    const { runId } = await insertClaimableRun(companyId, agentId);
    for (const state of ["pending", "unavailable", "blocked"]) {
      mockReadiness.mockResolvedValue([{ state }]);
      await heartbeat.resumeQueuedRuns();
      expect(await runStatus(runId)).toMatchObject({ status: "queued" });
      expect(mockAdapterExecute).not.toHaveBeenCalled();
    }
    mockReadiness.mockResolvedValue([{ state: "ready" }]);
    await heartbeat.resumeQueuedRuns();
    await heartbeat.drainActiveRunExecutions();
    expect(await runStatus(runId)).toMatchObject({ status: "succeeded" });
    expect(mockAdapterExecute).toHaveBeenCalledTimes(1);
  });

  it("cancels a queued run whose claim is rejected instead of failing recovery", async () => {
    const { companyId, agentId } = await insertAgent();
    const { runId, wakeupRequestId } = await insertUnverifiableInterruptRun(companyId, agentId);

    await expect(heartbeat.resumeQueuedRuns()).resolves.toBeUndefined();

    expect(await runStatus(runId)).toMatchObject({
      status: "cancelled",
      errorCode: "queued_run_claim_rejected",
      error: "Cancelled because the queued run cannot be claimed: Queued-message interrupt authority is unavailable",
    });
    const wakeup = await db
      .select({ status: agentWakeupRequests.status })
      .from(agentWakeupRequests)
      .where(sql`${agentWakeupRequests.id} = ${wakeupRequestId}`)
      .then((rows) => rows[0] ?? null);
    expect(wakeup).toMatchObject({ status: "cancelled" });

    // Recovery runs again on the next cycle and on every restart. The run must
    // stay settled instead of failing the claim loop again.
    await expect(heartbeat.resumeQueuedRuns()).resolves.toBeUndefined();
    expect(await runStatus(runId)).toMatchObject({ status: "cancelled" });
  });

  it("claims the agent's next queued run after a rejected one", async () => {
    const { companyId, agentId } = await insertAgent();
    const { runId: rejectedRunId } = await insertUnverifiableInterruptRun(companyId, agentId);
    const { runId: healthyRunId } = await insertClaimableRun(companyId, agentId);

    await expect(heartbeat.resumeQueuedRuns()).resolves.toBeUndefined();
    await heartbeat.drainActiveRunExecutions();

    expect(await runStatus(rejectedRunId)).toMatchObject({
      status: "cancelled",
      errorCode: "queued_run_claim_rejected",
    });
    expect(mockAdapterExecute).toHaveBeenCalledOnce();
    expect(await runStatus(healthyRunId)).toMatchObject({ status: "succeeded" });
  });

  it("keeps a recoverable rejection queued without blocking the runs behind it", async () => {
    const { companyId, agentId } = await insertAgent();
    const { runId: deferredRunId } = await insertUnresolvableOwnerRun(companyId, agentId);
    const { runId: healthyRunId } = await insertClaimableRun(companyId, agentId);

    await expect(heartbeat.resumeQueuedRuns()).resolves.toBeUndefined();
    await heartbeat.drainActiveRunExecutions();

    expect(await runStatus(deferredRunId)).toMatchObject({ status: "queued", errorCode: null });
    expect(mockAdapterExecute).toHaveBeenCalledOnce();
    expect(await runStatus(healthyRunId)).toMatchObject({ status: "succeeded" });
  });

  it("keeps processing other agents' queued runs after one agent's run is rejected", async () => {
    const first = await insertAgent();
    const second = await insertAgent();
    const { runId: rejectedRunId } = await insertUnverifiableInterruptRun(first.companyId, first.agentId);
    const { runId: healthyRunId } = await insertClaimableRun(second.companyId, second.agentId);

    await expect(heartbeat.resumeQueuedRuns()).resolves.toBeUndefined();
    await heartbeat.drainActiveRunExecutions();

    expect(await runStatus(rejectedRunId)).toMatchObject({ status: "cancelled" });
    expect(await runStatus(healthyRunId)).toMatchObject({ status: "succeeded" });
  });
});
