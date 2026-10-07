import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { RunnerProfileFixture } from "./types.js";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const present = (value: unknown) => typeof value === "string" && value.trim().length > 0;

/** Grade public run/account/model metadata; a model's completion claim cannot supply it. */
export function gradeHermesApiConnection(input: {
  companyId: string; agentId: string; issueId: string; connectionId: string; provider: string; model: string;
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
    { id: "selected-managed-api-account", passed: account.connectionId === input.connectionId && account.provider === input.provider && account.method === "api_key" && account.mode === "responsible_user" },
    { id: "responsible-user-attribution", passed: present(run?.responsibleUserId) && account.responsibleUserId === run?.responsibleUserId },
    { id: "native-hermes-provider", passed: provider.kind === "acpx" && provider.agent === "hermes" && provider.model === input.model },
    { id: "exact-native-model", passed: identity.kind === "acpx" && identity.requestedModel === input.model && identity.effectiveModel === input.model },
  ];
}

/** Explicit authenticated catalog choices; none is a production default or live qualification. */
export const hermesApiConnectionChoices = [
  { provider: "anthropic", credential: "ANTHROPIC_API_KEY", model: "claude-haiku-4-5-20251001" },
  { provider: "openai", credential: "OPENAI_API_KEY", model: "gpt-5.6-luna" },
  { provider: "xai", credential: "XAI_API_KEY", model: "grok-4.7" },
  { provider: "google", credential: "GEMINI_API_KEY", model: "gemini-2.5-flash" },
] as const satisfies readonly { provider: string; credential: RunnerProfileFixture["credential"]; model: string }[];

export const hermesApiConnectionDefinitionDigest = createHash("sha256").update(
  ["hermes-api-connections.ts", "live-fixtures.ts", "harness-env.ts", "runner.spec.ts"]
    .map(file => readFileSync(new URL(`./${file}`, import.meta.url), "utf8")).join("\n"),
).digest("hex");
