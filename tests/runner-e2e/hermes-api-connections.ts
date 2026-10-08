import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import type { AiProviderRouting } from "../../packages/shared/src/ai-provider-routing.js";
import type { RunnerProfileFixture } from "./types.js";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const present = (value: unknown) => typeof value === "string" && value.trim().length > 0;
export const HERMES_API_CONNECTION_BUDGET_CENTS = 200;
export const isHermesConnectionSuite = (suiteId: string) =>
  suiteId === "hermes-api-connections" || suiteId === "hermes-bedrock-connections";
export const isHermesOpenRouterWorkflow = (execution: {
  suite: { id: string }; profile: { qualificationCandidate?: string; credential: string };
}) => execution.suite.id === "extended-harnesses"
  && execution.profile.qualificationCandidate === "hermes" && execution.profile.credential === "OPENROUTER_API_KEY";
export const hermesBedrockConnectionChoice = {
  credential: "AWS_BEARER_TOKEN_BEDROCK",
  model: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  routing: { kind: "bedrock", protocol: "bedrock", auth: "bearer", region: "us-east-1",
    models: [{ id: "us.anthropic.claude-haiku-4-5-20251001-v1:0" }] },
} as const satisfies { credential: RunnerProfileFixture["credential"]; model: string; routing: AiProviderRouting };

/** Establish the intended personal-account user independently, before a paid task. */
export async function captureHermesApiAccountOwner(input: {
  api: { get<T>(path: string): Promise<T> }; companyId: string; connectionId: string; provider: string;
  expectedRouting?: AiProviderRouting; expectedGrantId?: string;
}) {
  const listed = await input.api.get<{ currentUserId: string; connections: {
    id: string; companyId: string; provider: string; method: string; ownership: string; ownerUserId?: string; status: string;
    routing?: AiProviderRouting; grantId?: string;
  }[] }>(`/api/companies/${input.companyId}/ai-connections`);
  const matches = listed.connections.filter(connection => connection.id === input.connectionId);
  const selected = matches[0];
  return { expectedResponsibleUserId: selected?.ownerUserId ?? null,
    ...(input.expectedRouting ? { routing: { expected: input.expectedRouting, observed: selected?.routing ?? null } } : {}),
    checks: [
    { id: "selected-account-public-readback", passed: matches.length === 1 && selected?.companyId === input.companyId && selected.provider === input.provider && selected.method === "api_key" && selected.ownership === "personal" && selected.status === "connected" },
    { id: "authenticated-caller-known", passed: present(listed.currentUserId) },
    { id: "selected-account-owned-by-caller", passed: present(selected?.ownerUserId) && selected?.ownerUserId === listed.currentUserId },
    ...(input.expectedRouting ? [{ id: "selected-account-routing", passed: isDeepStrictEqual(selected?.routing, input.expectedRouting) }] : []),
    ...(input.expectedGrantId !== undefined ? [{ id: "selected-account-grant", passed: present(input.expectedGrantId) && selected?.grantId === input.expectedGrantId }] : []),
  ] };
}

/** Read both public budgets before creating the paid task. Unknown usage stays unknown. */
export async function captureHermesApiBudgets(input: {
  api: { get<T>(path: string): Promise<T> }; companyId: string; agentId: string;
}) {
  const [company, agent] = await Promise.all([
    input.api.get<{ id: string; budgetMonthlyCents: unknown }>(`/api/companies/${input.companyId}`),
    input.api.get<{ id: string; companyId: string; budgetMonthlyCents: unknown }>(`/api/agents/${input.agentId}`),
  ]);
  return { budgetMonthlyCents: HERMES_API_CONNECTION_BUDGET_CENTS, checks: [
    { id: "company-budget", passed: company.id === input.companyId && company.budgetMonthlyCents === HERMES_API_CONNECTION_BUDGET_CENTS },
    { id: "agent-budget", passed: agent.id === input.agentId && agent.companyId === input.companyId && agent.budgetMonthlyCents === HERMES_API_CONNECTION_BUDGET_CENTS },
  ] };
}

/** Observe settled billing and budget health before fixture cleanup pauses the agent. */
export async function captureHermesOpenRouterSettlement(input: {
  api: { get<T>(path: string): Promise<T> }; companyId: string; agentId: string; issueId: string; runId: string;
}) {
  const [company, agent, run] = await Promise.all([
    input.api.get<Record<string, unknown>>(`/api/companies/${input.companyId}`),
    input.api.get<Record<string, unknown>>(`/api/agents/${input.agentId}`),
    input.api.get<Record<string, unknown>>(`/api/heartbeat-runs/${input.runId}`),
  ]);
  const usage = record(run.usageJson), provenance = record(usage.pricingProvenance);
  const cost = usage.costUsd, exact = usage.costUsdExact;
  return { observation: {
    company: { id: company.id, status: company.status, pauseReason: company.pauseReason, budgetMonthlyCents: company.budgetMonthlyCents },
    agent: { id: agent.id, companyId: agent.companyId, status: agent.status, pauseReason: agent.pauseReason, budgetMonthlyCents: agent.budgetMonthlyCents },
    run: { id: run.id, companyId: run.companyId, agentId: run.agentId, issueId: run.issueId, status: run.status,
      costAccountingPending: run.costAccountingPending, costAccountedAt: run.costAccountedAt,
      usage: Object.fromEntries(["provider", "biller", "billingType", "costStatus", "costUsd", "costUsdExact", "inputTokens", "outputTokens", "accountingReceiptReady", "pricingProvenance"].map(key => [key, usage[key]])) },
  }, checks: [
    { id: "billing-observation-scope", passed: company.id === input.companyId && agent.id === input.agentId && agent.companyId === input.companyId
      && run.id === input.runId && run.companyId === input.companyId && run.agentId === input.agentId && run.issueId === input.issueId },
    { id: "settled-openrouter-reported-cost", passed: run.status === "succeeded" && run.costAccountingPending === false && present(run.costAccountedAt)
      && usage.accountingReceiptReady === true && usage.biller === "openrouter" && usage.billingType === "metered_api" && usage.costStatus === "reported"
      && provenance.source === "provider_reported" && provenance.version === "hermes-openrouter-wire/v1"
      && typeof cost === "number" && Number.isFinite(cost) && cost >= 0 && typeof exact === "string" && /^(0|[1-9][0-9]{0,6})\.[0-9]{9}$/.test(exact) && Number(exact) === cost
      && typeof usage.inputTokens === "number" && Number.isSafeInteger(usage.inputTokens) && usage.inputTokens >= 0
      && typeof usage.outputTokens === "number" && Number.isSafeInteger(usage.outputTokens) && usage.outputTokens >= 0 && usage.inputTokens + usage.outputTokens > 0 },
    { id: "budget-health-after-settlement", passed: company.status === "active" && agent.status === "idle" && agent.pauseReason === null
      && company.budgetMonthlyCents === HERMES_API_CONNECTION_BUDGET_CENTS && agent.budgetMonthlyCents === HERMES_API_CONNECTION_BUDGET_CENTS },
  ] };
}

/** Grade public run/account/model metadata; a model's completion claim cannot supply it. */
export function gradeHermesApiConnection(input: {
  companyId: string; agentId: string; issueId: string; connectionId: string; provider: string; model: string; expectedResponsibleUserId: string;
  accountMode?: "responsible_user" | "delegated"; expectedGrantId?: string;
  runs: readonly {
    companyId: string; agentId: string; status: string; runtimeMode?: string;
    issueId?: string | null; responsibleUserId?: string | null;
    contextSnapshot?: Record<string, unknown> | null; runnerProfileJson?: Record<string, unknown> | null;
  }[];
}) {
  const run = input.runs[0];
  const context = record(run?.contextSnapshot), account = record(context.aiConnection);
  const identity = record(record(record(run?.runnerProfileJson).sessionCheckpoint).providerIdentity);
  const provider = record(record(record(run?.runnerProfileJson).nativeExecutionInput).provider);
  return [
    { id: "one-successful-native-run", passed: input.runs.length === 1 && run?.status === "succeeded" && run.runtimeMode === "native" },
    { id: "company-agent-task-scope", passed: run?.companyId === input.companyId && run.agentId === input.agentId && run.issueId === input.issueId },
    { id: "selected-managed-api-account", passed: account.connectionId === input.connectionId && account.provider === input.provider && account.method === "api_key" && account.mode === (input.accountMode ?? "responsible_user") },
    ...(input.expectedGrantId !== undefined ? [{ id: "selected-managed-account-grant", passed: present(input.expectedGrantId) && account.grantId === input.expectedGrantId }] : []),
    { id: "responsible-user-attribution", passed: present(input.expectedResponsibleUserId) && run?.responsibleUserId === input.expectedResponsibleUserId && account.responsibleUserId === input.expectedResponsibleUserId },
    { id: "native-hermes-provider", passed: provider.kind === "acpx" && provider.agent === "hermes" && provider.model === input.model },
    { id: "exact-native-model", passed: identity.kind === "acpx" && identity.requestedModel === input.model && identity.effectiveModel === input.model },
  ];
}

/** Explicit authenticated catalog choices; none is a production default or live qualification. */
export const hermesApiConnectionChoices = [
  { provider: "anthropic", credential: "ANTHROPIC_API_KEY", model: "claude-haiku-4-5-20251001" },
  { provider: "openai", credential: "OPENAI_API_KEY", model: "gpt-5.6-luna" },
  { provider: "xai", credential: "XAI_API_KEY", model: "grok-4.7" },
  // Google restricts 2.5 models to prior users even when they appear in the catalog.
  // https://ai.google.dev/gemini-api/docs/deprecations
  { provider: "google", credential: "GEMINI_API_KEY", model: "gemini-3.8-flash" },
] as const satisfies readonly { provider: string; credential: RunnerProfileFixture["credential"]; model: string }[];

export const hermesApiConnectionDefinitionDigest = createHash("sha256").update(
  ["hermes-api-connections.ts", "live-fixtures.ts", "harness-env.ts", "runner.spec.ts"]
    .map(file => readFileSync(new URL(`./${file}`, import.meta.url), "utf8")).join("\n"),
).digest("hex");
