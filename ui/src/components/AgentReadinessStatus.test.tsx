// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgentReadinessStatus } from "./AgentReadinessStatus";
const query = vi.hoisted(() => ({ data: [] as unknown[], isError: false, refetch: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => query }));
const render = () => renderToStaticMarkup(<AgentReadinessStatus agentId="fixture" companyId="company" agentStatus="idle" />);
describe("agent setup status", () => {
  it("shows setup, ready, and actionable failure without replacing employment status", () => {
    query.data = [{ state: "pending", label: "Preparing agent…", message: "Work will start when setup finishes." }];
    expect(render()).toContain("Preparing agent"); expect(render()).toContain("aria-live");
    query.data = [{ state: "ready", label: "Agent ready" }]; expect(render()).toContain("Agent ready");
    query.data = [{ state: "blocked", label: "Agent preparation failed", message: "Ask an administrator to reconcile it." }];
    expect(render()).toContain("Check again"); expect(render()).toContain("reconcile");
    query.data = []; expect(render()).toBe("");
    query.isError = true; expect(render()).toContain("Work remains queued"); expect(render()).toContain("Check again"); query.isError = false;
  });
});
