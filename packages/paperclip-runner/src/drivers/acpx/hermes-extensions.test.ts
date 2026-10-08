import { describe, expect, it } from "vitest";
import { createAcpxProfileExtensionAdapter, isHermesCommittedQuestionCompletion, validateAcpxRichEvent } from "./profile-extensions.js";

describe("Hermes native extensions", () => {
  const committed = { disposition: "applied", interaction: { id: "question", companyId: "company", issueId: "issue",
    sourceRunId: "run", kind: "ask_user_questions", status: "pending", continuationPolicy: "wake_assignee" } };
  const completion = { type: "tool_call", tag: "tool_call_update", status: "completed", title: "mcp__paperclip__request_human_input" };
  it("delays only the current run's structured committed question completion", () => {
    for (const rawOutput of [committed, JSON.stringify(committed), { result: committed },
      { result: JSON.stringify(committed) }, { result: "Saved", structuredContent: committed }]) {
      expect(isHermesCommittedQuestionCompletion({ ...completion, rawOutput }, "run")).toBe(true);
    }
    for (const event of [{ ...completion, title: "terminal", rawOutput: committed },
      { ...completion, status: "failed", rawOutput: committed }, { ...completion, tag: "tool_call", rawOutput: committed },
      { ...completion, rawOutput: "Saved a pending question" }, { ...completion, rawOutput: { ...committed, error: "denied" } },
      { ...completion, rawOutput: { result: { ...committed, error: "denied" } } },
      { ...completion, rawOutput: { ...committed, disposition: "rejected" } },
      ...["status", "kind", "continuationPolicy", "sourceRunId", "id", "companyId", "issueId"].map(key => ({
        ...completion, rawOutput: { ...committed, interaction: { ...committed.interaction, [key]: "" } },
      }))]) expect(isHermesCommittedQuestionCompletion(event, "run")).toBe(false);
    expect(isHermesCommittedQuestionCompletion({ ...completion, rawOutput: committed }, "other-run")).toBe(false);
    expect(isHermesCommittedQuestionCompletion({ ...completion, title: completion.title + ": Choose the color", rawOutput: committed }, "run")).toBe(true);
    expect(isHermesCommittedQuestionCompletion({ ...completion, title: completion.title + "_other", rawOutput: committed }, "run")).toBe(false);
  });
  const adapter = () => createAcpxProfileExtensionAdapter("hermes", { sessionId: "session", turnId: "turn", workspacePath: "/workspace" })!;
  it("keeps native child identities stable across start, progress and completion", async () => {
    const context = { version: 1, sessionId: "session", turnToken: "token", childId: "child", delegationId: "batch", model: "exact-model", summary: "Read source", status: "completed" };
    const events = await Promise.all(["subagent.start", "subagent.progress", "subagent.complete"].map(event => adapter().notification("_hermes/delegation", { ...context, event })));
    for (const event of events.flat()) validateAcpxRichEvent(event);
    expect(new Set(events.flat().map(event => event.itemId)).size).toBe(1);
    expect(events[2]?.[0]?.payload.status).toBe("completed");
    await expect(adapter().notification("_hermes/delegation", { ...context, event: "subagent.start", childId: "" })).rejects.toThrow();
  });
  it("returns exactly the canonical batch answer and supports cancellation", async () => {
    const result = await adapter().request("_hermes/ask_questions", { version: 1, sessionId: "session", turnToken: "token", input: {
      schema: "paperclip.question_set.v1", questions: [{ id: "q0", prompt: "Why?", required: true, answerMode: "text" }],
    } });
    if (!("input" in result)) throw new Error("Missing canonical question form");
    expect(result.input.cancel()).toEqual({ outcome: "cancelled" });
    expect(result.input.resolve({ action: "submit", response: { schema: "paperclip.question_response.v1", answers: { q0: { text: "Because" } } } })).toEqual({ outcome: "answered", answers: { q0: { text: "Because" } } });
  });
  it.each(["text", "single_select", "multi_select"])("enforces the native %s limit before returning an answer", async answerMode => {
    const result = await adapter().request("_hermes/ask_questions", { version: 1, sessionId: "session", turnToken: "token", input: {
      schema: "paperclip.question_set.v1", questions: [{ id: "q0", prompt: "Why?", required: true, answerMode,
        textValidation: { maxLength: 65_536 },
        ...(answerMode === "text" ? {} : { options: [{ id: "o0", label: "A" }], customAnswer: { enabled: true } }),
      }],
    } });
    if (!("input" in result)) throw new Error("Missing canonical question form");
    const response = (value: string) => ({ action: "submit" as const, response: { schema: "paperclip.question_response.v1" as const,
      answers: { q0: answerMode === "text" ? { text: value } : { customText: value } },
    } });
    expect(result.input.resolve(response("😀".repeat(32_768)))).toMatchObject({ outcome: "answered" });
    for (const value of ["x".repeat(65_537), "x".repeat(70_000), "😀".repeat(32_769)]) {
      expect(() => result.input.resolve(response(value))).toThrow("at most 65536 characters");
    }
  });
  it("preserves estimated-cost provenance without inventing billed cost", async () => {
    const events = await adapter().notification("_hermes/usage", { version: 1, sessionId: "session", tokens: "reported", cost: "estimated", estimatedUsd: 0.012 });
    events.forEach(validateAcpxRichEvent);
    expect(events[0]?.payload.category).toBe("hermes_usage_provenance");
    expect(JSON.stringify(events)).toContain("unverified");
  });
  it("passes structured billing to the owned accounting callback separately from display events", async () => {
    const receipts: unknown[] = [];
    const owned = createAcpxProfileExtensionAdapter("hermes", { sessionId: "session", turnId: "turn", workspacePath: "/workspace",
      onBilling: receipt => { receipts.push(receipt); } })!;
    const billing = { schema: "paperclip.usage.billing/v1", source: "provider_reported", biller: "openrouter", currency: "USD",
      complete: true, requestCount: 2, reportedRequestCount: 2, amountUsd: 0.0042, amountUsdExact: "0.004200000" };
    const events = await owned.notification("_hermes/usage", { version: 1, sessionId: "session", tokens: "reported", cost: "unavailable", billing });
    events.forEach(validateAcpxRichEvent);
    expect(receipts).toEqual([billing]);
    expect(events[0]?.payload.summary).toContain("OpenRouter reports");
    await expect(owned.notification("_hermes/usage", { version: 1, sessionId: "other", tokens: "reported", cost: "unavailable", billing })).rejects.toThrow();
    await expect(adapter().notification("_hermes/usage", { version: 1, sessionId: "session", tokens: "reported", cost: "unavailable", billing })).rejects.toThrow("not negotiated");
  });
});
