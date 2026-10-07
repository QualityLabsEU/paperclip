import { describe, expect, it } from "vitest";
import { createAcpxProfileExtensionAdapter, validateAcpxRichEvent } from "./profile-extensions.js";

describe("Hermes native extensions", () => {
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
  it("preserves estimated-cost provenance without inventing billed cost", async () => {
    const events = await adapter().notification("_hermes/usage", { version: 1, sessionId: "session", tokens: "reported", cost: "estimated", estimatedUsd: 0.012 });
    events.forEach(validateAcpxRichEvent);
    expect(events[0]?.payload.category).toBe("hermes_usage_provenance");
    expect(JSON.stringify(events)).toContain("unverified");
  });
});
