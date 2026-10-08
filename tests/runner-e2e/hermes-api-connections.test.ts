import { describe, expect, it } from "vitest";
import { runnerMatrix, runnerSuites, suiteDefinitionHash } from "./catalog.js";
import { buildMatrixJobs, parseRunnerSelectors, selectRunnerExecutions } from "./selectors.js";
import { buildRunnerE2EProcessEnvironment } from "./harness-env.js";
import { explicitlyRequestsFileOutput, explicitlyRequestsTaskDocumentOutput } from "../../server/src/services/native-runtime/native-deliverable-feedback.js";
import { captureHermesApiAccountOwner, captureHermesApiBudgets, captureHermesOpenRouterSettlement, gradeHermesApiConnection, isHermesOpenRouterWorkflow, isHermesConnectionSuite, HERMES_NATIVE_INTERACTION_SUITE, hasExactHermesNativeQuestionResponse, hasHermesNativeQuestionBatch, hermesNativeAnswerText } from "./hermes-api-connections.js";

describe("Hermes native browser questions", () => {
  const suite = runnerSuites.find(s => s.id === HERMES_NATIVE_INTERACTION_SUITE)!;
  const cells = runnerMatrix.filter(e => e.suite.id === suite.id);
  const questionSet = { schema: "paperclip.question_set.v1", questions: [
    { id: "q0", prompt: "Choose the fixture color", required: true, answerMode: "single_select",
      options: [{ id: "o0", label: "Cobalt (Recommended)" }, { id: "o1", label: "Amber" }], customAnswer: { enabled: true } },
    { id: "q1", prompt: "Choose the fixture targets", required: true, answerMode: "multi_select",
      options: [{ id: "o0", label: "Linux" }, { id: "o1", label: "Mac" }], customAnswer: { enabled: true } },
    { id: "q2", prompt: "Describe the fixture constraint", required: true, answerMode: "text" },
  ] };
  const response = { schema: "paperclip.question_response.v1", answers: {
    q0: { selectedOptionIds: ["o0"] }, q1: { selectedOptionIds: ["o0", "o1"], customText: "FreeBSD" }, q2: { text: "Reviewer constraint" },
  } };
  const event = (eventType: string, sourceSeq: number, payload: unknown) => ({
    runId: "run", protocolSchemaVersion: 1, payload: { prpEvent: {
      schema: "paperclip.prp.event.v1", schemaVersion: 1, runId: "run", turnId: "turn", eventType, sourceSeq, payload,
    } },
  });
  const native = (adapter = "acpx-runtime-sidecar") => [
    event("runtime_request.created", 2, { request: { requestId: "request", turnId: "turn", type: "input", status: "pending", input: questionSet,
      origin: { adapter, provider: "hermes", method: "_hermes/ask_questions" } } }),
    event("runtime_request.resolved", 3, { requestId: "request", turnId: "turn", action: "submit", response }),
  ];
  const grade = (events: unknown[]) => hasExactHermesNativeQuestionResponse({ events, runId: "run", turnId: "turn", requestId: "request", questionSet, response });
  it("declares only two explicit bounded single-attempt managed-account cells", () => {
    expect(cells).toHaveLength(2);
    expect(suite.manualOnly).toBe(true);
    expect(new Set(cells.map(cell => cell.environment.id))).toEqual(new Set(["local", "daytona"]));
    expect(cells.every(cell => cell.profile.qualificationCandidate === "hermes" && cell.task.flow === "native_question_completion"
      && cell.task.expectedRunCount === 1 && cell.task.automaticRetryPolicy === "single_attempt")).toBe(true);
    expect(suite.definitionMetadata).toMatchObject({ qualification: "pending", providerTurns: 1, maximumAttemptsPerCell: 1, budgetMonthlyCents: 200,
      lifecycle: "per-turn", nativeMethod: "_hermes/ask_questions", billing: "reported-cost-and-budget-health" });
    expect(isHermesConnectionSuite(suite.id)).toBe(true);
    expect(selectRunnerExecutions(parseRunnerSelectors(["--all"])).some(cell => cell.suite.id === suite.id)).toBe(false);
    expect(selectRunnerExecutions(parseRunnerSelectors(["--id", cells[0]!.id]))).toEqual([cells[0]]);
    expect(suite.definitionMetadata?.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
    const env = buildRunnerE2EProcessEnvironment({ PAPERCLIP_RUNNER_ACPX_QUALIFICATION: "ambient" }, [cells[0]!]);
    expect(JSON.parse(env.PAPERCLIP_RUNNER_ACPX_QUALIFICATION!)).toEqual([{ agent: "hermes", model: cells[0]!.profile.model }]);
    expect(() => buildRunnerE2EProcessEnvironment({}, [{ ...cells[0]!, suite: { ...suite, manualOnly: false } }])).toThrow("explicit");
    expect(() => buildRunnerE2EProcessEnvironment({}, [{ ...cells[0]!, profile: { ...cells[0]!.profile, qualificationCandidate: "pi" } }])).toThrow("explicit");
    const answer = hermesNativeAnswerText("fixture-1");
    expect(cells[0]!.task.buildPrompt("fixture-1")).not.toContain(answer);
    expect(cells[0]!.task.buildVisibleMarker("fixture-1")).toContain(answer);
  });
  it("admits a question-only objective through the production delivery guard without suppressing file requirements", () => {
    const prompt = cells[0]!.task.buildPrompt("fixture-guard");
    expect(explicitlyRequestsFileOutput(prompt)).toBe(false);
    expect(explicitlyRequestsTaskDocumentOutput(prompt)).toBe(false);
    expect(explicitlyRequestsFileOutput("Write a JSON file with the returned answers.")).toBe(true);
    expect(explicitlyRequestsTaskDocumentOutput("Write a document on this task with the returned answers.")).toBe(true);
  });
  it.each(["acpx-runtime", "acpx-runtime-sidecar"])("accepts a complete native delivery from %s", adapter => {
    expect(hasHermesNativeQuestionBatch(questionSet)).toBe(true);
    expect(grade(native(adapter))).toBe(true);
  });
  it.each(["missing", "no-created", "no-outcome", "duplicate-created", "duplicate-outcome", "second-request-other-id", "cancelled", "expired", "wrong-action", "wrong-answer",
    "wrong-answer-order", "wrong-input", "wrong-provider", "semantic-tool", "wrong-adapter", "wrong-type", "wrong-status", "wrong-request-turn",
    "wrong-event-turn", "wrong-outcome-turn", "foreign-row", "foreign-event", "wrong-schema", "wrong-version", "wrong-protocol", "wrong-order", "missing-sequence"])("rejects %s evidence", fault => {
    const rows = structuredClone(native()) as ReturnType<typeof native>;
    const created = rows[0]!.payload.prpEvent as Record<string, any>, resolved = rows[1]!.payload.prpEvent as Record<string, any>;
    const request = created.payload.request;
    if (fault === "missing") rows.length = 0;
    if (fault === "no-created") rows.splice(0, 1);
    if (fault === "no-outcome") rows.splice(1, 1);
    if (fault === "duplicate-created") rows.push(structuredClone(rows[0]!));
    if (fault === "duplicate-outcome") rows.push(structuredClone(rows[1]!));
    if (fault === "second-request-other-id") {
      const extra = structuredClone(rows[0]!);
      (extra.payload.prpEvent.payload as Record<string, any>).request.requestId = "different-request";
      rows.push(extra);
    }
    if (fault === "cancelled") resolved.eventType = "runtime_request.cancelled";
    if (fault === "expired") resolved.eventType = "runtime_request.expired";
    if (fault === "wrong-action") resolved.payload.action = "cancel";
    if (fault === "wrong-answer") resolved.payload.response.answers.q2.text = "Guessed answer";
    if (fault === "wrong-answer-order") resolved.payload.response.answers.q1.selectedOptionIds.reverse();
    if (fault === "wrong-input") request.input.questions[2].prompt = "Different question";
    if (fault === "wrong-provider") request.origin.provider = "cursor";
    if (fault === "semantic-tool") request.origin.method = "request_human_input";
    if (fault === "wrong-adapter") request.origin.adapter = "test-hook";
    if (fault === "wrong-type") request.type = "permission";
    if (fault === "wrong-status") request.status = "resolved";
    if (fault === "wrong-request-turn") request.turnId = "other";
    if (fault === "wrong-event-turn") resolved.turnId = "other";
    if (fault === "wrong-outcome-turn") resolved.payload.turnId = "other";
    if (fault === "foreign-row") rows[1]!.runId = "foreign";
    if (fault === "foreign-event") resolved.runId = "foreign";
    if (fault === "wrong-schema") resolved.schema = "made-up";
    if (fault === "wrong-version") resolved.schemaVersion = 2;
    if (fault === "wrong-protocol") rows[1]!.protocolSchemaVersion = 2;
    if (fault === "wrong-order") resolved.sourceSeq = 1;
    if (fault === "missing-sequence") delete resolved.sourceSeq;
    expect(grade(rows)).toBe(false);
  });
  it.each(["question-count", "mode", "id", "prompt", "required", "choices", "option-id", "option-label", "custom-disabled"])("rejects a changed native form: %s", fault => {
    const form = structuredClone(questionSet) as Record<string, any>;
    if (fault === "question-count") form.questions.pop();
    if (fault === "mode") form.questions[1].answerMode = "single_select";
    if (fault === "id") form.questions[0].id = "color";
    if (fault === "prompt") form.questions[0].prompt = "Choose something else";
    if (fault === "required") form.questions[0].required = false;
    if (fault === "choices") form.questions[1].options.pop();
    if (fault === "option-id") form.questions[0].options[0].id = "cobalt";
    if (fault === "option-label") form.questions[0].options[0].label = "Cobalt impostor";
    if (fault === "custom-disabled") form.questions[1].customAnswer.enabled = false;
    expect(hasHermesNativeQuestionBatch(form)).toBe(false);
  });
});

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
  it("requires accounting for every Hermes OpenRouter product workflow without widening other provider cells", () => {
    const workflow = runnerMatrix.filter(isHermesOpenRouterWorkflow);
    expect(workflow).toHaveLength(10);
    expect(new Set(workflow.map(cell => cell.task.id))).toEqual(new Set([
      "hello-complete", "question-resume-complete", "plan-approve-complete", "structured-question-restart-resume", "file-edit-validate",
    ]));
    expect(workflow.every(cell => cell.suite.definitionMetadata?.hermesBudgetMonthlyCents === 200)).toBe(true);
    expect(isHermesOpenRouterWorkflow({ ...workflow[0]!, profile: { ...workflow[0]!.profile, qualificationCandidate: "cursor" } })).toBe(false);
    expect(isHermesOpenRouterWorkflow({ ...workflow[0]!, profile: { ...workflow[0]!.profile, credential: "ANTHROPIC_API_KEY" } })).toBe(false);
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
    companyId: "company", agentId: "agent", issueId: "task", connectionId: "account", provider: "xai", model: "grok-4.7", expectedResponsibleUserId: "user",
    runs: [{ companyId: "company", agentId: "agent", issueId: "task", status: "succeeded", runtimeMode: "native", responsibleUserId: "user",
      contextSnapshot: { aiConnection: { connectionId: "account", provider: "xai", method: "api_key", mode: "responsible_user", responsibleUserId: "user" } },
      runnerProfileJson: { nativeExecutionInput: { provider: { kind: "acpx", agent: "hermes", model: "grok-4.7" } },
        sessionCheckpoint: { providerIdentity: { kind: "acpx", requestedModel: "grok-4.7", effectiveModel: "grok-4.7" } } } }],
  };
  it("accepts independently observed account/model metadata", () => {
    expect(gradeHermesApiConnection(valid).every(check => check.passed)).toBe(true);
  });
  it.each(["valid", "reported-zero", "company-scope", "agent-scope", "run-scope", "task-scope", "paused-agent", "paused-company", "pause-reason", "budget-changed",
    "pending", "missing-settlement", "missing-price", "estimated", "partial", "wrong-biller", "wrong-provenance", "mismatched-exact", "unknown-tokens"])("calibrates public OpenRouter settlement: %s", async fault => {
    const company: Record<string, unknown> = { id: "company", status: "active", budgetMonthlyCents: 200 };
    const agent: Record<string, unknown> = { id: "agent", companyId: "company", status: "idle", pauseReason: null, budgetMonthlyCents: 200 };
    const usage: Record<string, unknown> = { biller: "openrouter", billingType: "metered_api", costStatus: "reported", costUsd: 0.0042, costUsdExact: "0.004200000",
      inputTokens: 40, outputTokens: 10, accountingReceiptReady: true, pricingProvenance: { source: "provider_reported", version: "hermes-openrouter-wire/v1" } };
    const run: Record<string, unknown> = { id: "run", companyId: "company", agentId: "agent", issueId: "task", status: "succeeded", usageJson: usage,
      costAccountingPending: false, costAccountedAt: "2026-10-08T03:00:00Z" };
    if (fault === "reported-zero") { usage.costUsd = 0; usage.costUsdExact = "0.000000000"; }
    if (fault === "company-scope") company.id = "foreign";
    if (fault === "agent-scope") agent.companyId = "foreign";
    if (fault === "run-scope") run.agentId = "foreign";
    if (fault === "task-scope") run.issueId = "foreign";
    if (fault === "paused-agent") agent.status = "paused";
    if (fault === "paused-company") company.status = "paused";
    if (fault === "pause-reason") agent.pauseReason = "budget_unpriced";
    if (fault === "budget-changed") agent.budgetMonthlyCents = 0;
    if (fault === "pending") run.costAccountingPending = true;
    if (fault === "missing-settlement") delete run.costAccountedAt;
    if (fault === "missing-price") { usage.costUsd = null; usage.costUsdExact = null; }
    if (fault === "estimated") usage.costStatus = "estimated";
    if (fault === "partial") usage.costStatus = "unpriced";
    if (fault === "wrong-biller") usage.biller = "openai";
    if (fault === "wrong-provenance") usage.pricingProvenance = { source: "model_prices" };
    if (fault === "mismatched-exact") usage.costUsdExact = "0.040000000";
    if (fault === "unknown-tokens") delete usage.inputTokens;
    const paths: string[] = [];
    const receipt = await captureHermesOpenRouterSettlement({ companyId: "company", agentId: "agent", issueId: "task", runId: "run", api: {
      async get<T>(url: string) { paths.push(url); return (url === "/api/companies/company" ? company : url === "/api/agents/agent" ? agent : run) as T; },
    } });
    expect(new Set(paths)).toEqual(new Set(["/api/companies/company", "/api/agents/agent", "/api/heartbeat-runs/run"]));
    expect(receipt.checks.every(check => check.passed)).toBe(["valid", "reported-zero"].includes(fault));
  });
  it.each(["valid", "missing", "duplicate", "company", "provider", "method", "ownership", "status", "owner", "caller"])("establishes the expected user from public account readback: %s", async fault => {
    const account = { id: "account", companyId: "company", provider: "xai", method: "api_key", ownership: "personal", ownerUserId: "user", status: "connected" };
    if (fault === "company") account.companyId = "foreign";
    if (fault === "provider") account.provider = "foreign";
    if (fault === "method") account.method = "foreign";
    if (fault === "ownership") account.ownership = "foreign";
    if (fault === "status") account.status = "foreign";
    if (fault === "owner") account.ownerUserId = "foreign";
    const receipt = await captureHermesApiAccountOwner({ companyId: "company", connectionId: "account", provider: "xai", api: {
      async get<T>(url: string) {
        expect(url).toBe("/api/companies/company/ai-connections");
        return { currentUserId: fault === "caller" ? "" : "user", connections: fault === "missing" ? [] : fault === "duplicate" ? [account, account] : [account] } as T;
      },
    } });
    expect(receipt.checks.every(check => check.passed)).toBe(fault === "valid");
    if (fault === "valid") expect(receipt.expectedResponsibleUserId).toBe("user");
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
  it.each(["company", "task", "account", "provider", "method", "user", "consistent-foreign-user", "missing-expected-user", "model", "harness", "missing", "extra-run"])("rejects %s evidence even with a successful answer", fault => {
    const wrong = structuredClone(valid), run = wrong.runs[0]!;
    if (fault === "company") run.companyId = "foreign";
    if (fault === "task") run.issueId = "foreign";
    if (fault === "account") run.contextSnapshot.aiConnection.connectionId = "foreign";
    if (fault === "provider") run.contextSnapshot.aiConnection.provider = "openai";
    if (fault === "method") run.contextSnapshot.aiConnection.method = "subscription";
    if (fault === "user") run.contextSnapshot.aiConnection.responsibleUserId = "foreign";
    if (fault === "consistent-foreign-user") { run.responsibleUserId = "foreign"; run.contextSnapshot.aiConnection.responsibleUserId = "foreign"; }
    if (fault === "missing-expected-user") wrong.expectedResponsibleUserId = "";
    if (fault === "model") run.runnerProfileJson.sessionCheckpoint.providerIdentity.effectiveModel = "foreign";
    if (fault === "harness") run.runnerProfileJson.nativeExecutionInput.provider.agent = "codex";
    if (fault === "missing") wrong.runs = [];
    if (fault === "extra-run") wrong.runs.push(structuredClone(run));
    expect(gradeHermesApiConnection(wrong).some(check => !check.passed)).toBe(true);
  });
});
