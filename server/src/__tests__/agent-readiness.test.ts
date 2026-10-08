import { beforeEach, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import type { PluginWorkerManager } from "../services/plugin-worker-manager.js";
import { getAgentReadiness } from "../services/agent-readiness.js";

const registry = vi.hoisted(() => ({ listInstalled: vi.fn(), getConfig: vi.fn(), getCompanySettings: vi.fn() }));
vi.mock("../services/plugin-registry.js", () => ({ pluginRegistryService: () => registry }));
const agent = { id: "agent", companyId: "actual-company", createdAt: new Date("2020-01-01") };
const call = vi.fn();
const workers = { call } as unknown as PluginWorkerManager;
const limit = vi.fn(async () => [{ createdAt: new Date("2020-01-02") }]);
const db = { select: () => ({ from: () => ({ where: () => ({ limit }) }) }) } as unknown as Db;
beforeEach(() => {
  call.mockReset(); registry.getConfig.mockReset();
  registry.getCompanySettings.mockReset().mockResolvedValue(null);
  registry.listInstalled.mockResolvedValue([{ id: "provider", status: "ready", manifestJson: {
    capabilities: ["agents.readiness.provide"], agentReadiness: { dataKey: "status" },
  } }]);
  registry.getConfig.mockResolvedValue({});
});
it("uses the actual agent company and durable creation timestamp, accepting unmanaged agents", async () => {
  call.mockResolvedValue({ state: "pending", label: "Preparing agent" });
  expect(await getAgentReadiness(db, workers, agent)).toEqual([{ state: "pending", label: "Preparing agent" }]);
  expect(registry.getConfig).toHaveBeenCalledWith("provider", "actual-company");
  expect(call).toHaveBeenCalledWith("provider", "getData", {
    key: "status", companyId: "actual-company", params: { agentId: "agent", lifecycleCreatedAt: "2020-01-02T00:00:00.000Z" },
  }, 15_000);
  call.mockResolvedValue(null);
  expect(await getAgentReadiness(db, workers, agent)).toEqual([]);
});
it("does not invoke providers without company configuration or the readiness capability", async () => {
  registry.getConfig.mockResolvedValue(null);
  expect(await getAgentReadiness(db, workers, agent)).toEqual([]);
  registry.getConfig.mockResolvedValue({});
  registry.listInstalled.mockResolvedValue([{ manifestJson: { capabilities: [], agentReadiness: { dataKey: "status" } } }]);
  expect(await getAgentReadiness(db, workers, agent)).toEqual([]);
  expect(call).not.toHaveBeenCalled();
});
it("fails closed with a fixed message on worker outages and malformed results", async () => {
  for (const value of [{ state: "ready" }, { state: "unknown", label: "raw provider data" }]) {
    call.mockResolvedValue(value);
    expect(await getAgentReadiness(db, workers, agent)).toEqual([expect.objectContaining({ state: "unavailable", label: "Readiness status unavailable" })]);
  }
  call.mockRejectedValue(new Error("secret provider credentials"));
  expect(JSON.stringify(await getAgentReadiness(db, workers, agent))).not.toContain("credentials");
  expect(await getAgentReadiness(db, undefined, agent)).toEqual([expect.objectContaining({ state: "unavailable" })]);
});

it("ignores company-disabled providers without invoking them", async () => {
  registry.getCompanySettings.mockResolvedValue({ enabled: false });
  expect(await getAgentReadiness(db, workers, agent)).toEqual([]);
  expect(call).not.toHaveBeenCalled();
  expect(registry.getCompanySettings).toHaveBeenCalledWith("provider", "actual-company");
  registry.getCompanySettings.mockResolvedValue({ enabled: true });
  call.mockResolvedValue({ state: "ready", label: "Ready" });
  expect(await getAgentReadiness(db, workers, agent)).toEqual([{ state: "ready", label: "Ready" }]);
});
