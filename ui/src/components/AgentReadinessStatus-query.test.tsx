// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { AgentReadinessStatus } from "./AgentReadinessStatus";
const getReadiness = vi.hoisted(() => vi.fn());
vi.mock("../api/agents", () => ({ agentsApi: { getReadiness } }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("refreshes a ready result and shows a later unavailable requirement", async () => {
  vi.useFakeTimers();
  getReadiness.mockResolvedValueOnce([{ state: "ready", label: "Ready to run" }])
    .mockResolvedValue([{ state: "unavailable", label: "Readiness unavailable", message: "Work remains queued." }]);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () => { root.render(<QueryClientProvider client={client}>
      <AgentReadinessStatus agentId="agent" companyId="company" agentStatus="idle" />
    </QueryClientProvider>); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(container.textContent).toContain("Ready to run");
    await act(async () => { await vi.advanceTimersByTimeAsync(30_001); });
    expect(getReadiness).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Readiness unavailable");
    expect(container.textContent).toContain("Work remains queued");
  } finally {
    await act(async () => root.unmount()); client.clear(); container.remove(); vi.useRealTimers();
  }
});
