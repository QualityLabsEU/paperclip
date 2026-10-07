import { describe, expect, it } from "vitest";
import { runnerMatrix, runnerSuites, suiteDefinitionHash } from "./catalog.js";
import { buildMatrixJobs, parseRunnerSelectors, selectRunnerExecutions } from "./selectors.js";
import { buildRunnerE2EProcessEnvironment } from "./harness-env.js";
import { captureHermesApiBudgets, gradeHermesApiConnection } from "./hermes-api-connections.js";

describe("Hermes managed API connection qualification", () => {
  const suite = runnerSuites.find(s => s.id === "hermes-api-connections")!;
  const cells = runnerMatrix.filter(e => e.suite.id === suite.id);
  it("declares ten bounded pending cells without adding scheduled paid work", () => {
    expect(cells).toHaveLength(10);
    expect(suite.manualOnly).toBe(true);
    expect(new Set(cells.map(e => e.environment.id))).toEqual(new Set(["local", "daytona"]));
    expect(cells.every(e => e.task.id === "hello-complete" && e.task.expectedRunCount === 1 && e.task.automaticRetryPolicy === "single_attempt")).toBe(true);
    expect(suite.definitionMetadata).toMatchObject({ qualification: "pending", accountMethod: "api_key", accountMode: "responsible_user", coverage: "api-account-native-completion-only", budgetMonthlyCents: 200, maximumAttemptsPerCell: 1 });
    expect(selectRunnerExecutions(parseRunnerSelectors(["--all"])).some(e => e.suite.id === suite.id)).toBe(false);
  });
  it.each([
    ["XAI_API_KEY", "grok-4.7"],
    ["GEMINI_API_KEY", "gemini-3.8-flash"],
  ])("pins the %s candidate and model in the operator admission", (credential, model) => {
    const cell = cells.find(e => e.profile.credential === credential)!;
    const env = buildRunnerE2EProcessEnvironment({ PAPERCLIP_RUNNER_ACPX_QUALIFICATION: "ambient" }, [cell]);
    expect(JSON.parse(env.PAPERCLIP_RUNNER_ACPX_QUALIFICATION!)).toEqual([{ agent: "hermes", model }]);
    expect(() => buildRunnerE2EProcessEnvironment({}, [{ ...cell, suite: { ...suite, manualOnly: false } }])).toThrow("explicit");
    expect(cells.every(e => e.profile.modelQualification.source === "candidate_runner_profile")).toBe(true);
    expect(buildMatrixJobs(cells).every(job => job.qualificationCandidate === "hermes")).toBe(true);
    expect(cells.every(e => e.profile.id.startsWith("runner-acpx-"))).toBe(true);
  });
  it("retains account-fixture source provenance in its historical definition", () => {
    expect(suite.definitionMetadata?.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(suiteDefinitionHash({ ...suite, definitionMetadata: { ...suite.definitionMetadata, sourceDigest: "changed-account-selection" } })).not.toBe(suiteDefinitionHash(suite));
  });
  const valid = {
    companyId: "company", agentId: "agent", issueId: "task", connectionId: "account", provider: "xai", model: "grok-4.7",
    runs: [{ companyId: "company", agentId: "agent", issueId: "task", status: "succeeded", runtimeMode: "native", responsibleUserId: "user",
      contextSnapshot: { aiConnection: { connectionId: "account", provider: "xai", method: "api_key", mode: "responsible_user", responsibleUserId: "user" } },
      runnerProfileJson: { nativeExecutionInput: { provider: { kind: "acpx", agent: "hermes", model: "grok-4.7" } },
        sessionCheckpoint: { providerIdentity: { kind: "acpx", requestedModel: "grok-4.7", effectiveModel: "grok-4.7" } } } }],
  };
  it("accepts independently observed account/model metadata", () => {
    expect(gradeHermesApiConnection(valid).every(check => check.passed)).toBe(true);
  });
  it.each(["valid", "company-budget", "agent-budget", "company-scope", "agent-scope", "agent-company"])("checks %s through public budget readback before a paid task", async fault => {
    const company = { id: "company", budgetMonthlyCents: fault === "company-budget" ? 0 : 200 };
    const agent = { id: "agent", companyId: "company", budgetMonthlyCents: fault === "agent-budget" ? 0 : 200 };
    if (fault === "company-scope") company.id = "foreign";
    if (fault === "agent-scope") agent.id = "foreign";
    if (fault === "agent-company") agent.companyId = "foreign";
    const paths: string[] = [];
    const receipt = await captureHermesApiBudgets({ companyId: "company", agentId: "agent", api: {
      async get<T>(url: string) { paths.push(url); return (url === "/api/companies/company" ? company : agent) as T; },
    } });
    expect(new Set(paths)).toEqual(new Set(["/api/companies/company", "/api/agents/agent"]));
    expect(receipt.checks.every(check => check.passed)).toBe(fault === "valid");
  });
  it.each(["company", "task", "account", "provider", "method", "user", "model", "harness", "missing", "extra-run"])("rejects %s evidence even with a successful answer", fault => {
    const wrong = structuredClone(valid), run = wrong.runs[0]!;
    if (fault === "company") run.companyId = "foreign";
    if (fault === "task") run.issueId = "foreign";
    if (fault === "account") run.contextSnapshot.aiConnection.connectionId = "foreign";
    if (fault === "provider") run.contextSnapshot.aiConnection.provider = "openai";
    if (fault === "method") run.contextSnapshot.aiConnection.method = "subscription";
    if (fault === "user") run.contextSnapshot.aiConnection.responsibleUserId = "foreign";
    if (fault === "model") run.runnerProfileJson.sessionCheckpoint.providerIdentity.effectiveModel = "foreign";
    if (fault === "harness") run.runnerProfileJson.nativeExecutionInput.provider.agent = "codex";
    if (fault === "missing") wrong.runs = [];
    if (fault === "extra-run") wrong.runs.push(structuredClone(run));
    expect(gradeHermesApiConnection(wrong).some(check => !check.passed)).toBe(true);
  });
});
