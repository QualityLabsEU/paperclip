import { resourceLifecycleEvents, type Db } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import { pluginAgentReadinessSchema, type PluginAgentReadiness } from "@paperclipai/shared";
import type { PluginWorkerManager } from "./plugin-worker-manager.js";
import { pluginRegistryService } from "./plugin-registry.js";

/** Provider state stays outside the tenant's agent row and is never persisted. */
export async function getAgentReadiness(db: Db, workers: PluginWorkerManager | undefined,
  agent: { id: string; companyId: string; createdAt?: Date | string }): Promise<PluginAgentReadiness[]> {
  const registry = pluginRegistryService(db);
  const providers = (await registry.listInstalled()).filter(plugin => plugin.manifestJson.agentReadiness &&
    plugin.manifestJson.capabilities.includes("agents.readiness.provide"));
  const result = await Promise.all(providers.map(async (plugin): Promise<PluginAgentReadiness | null> => {
    if (!await registry.getConfig(plugin.id, agent.companyId)) return null;
    try {
      if (!workers || plugin.status !== "ready") throw new Error("Provider unavailable");
      const creation = await db.select({ createdAt: resourceLifecycleEvents.createdAt }).from(resourceLifecycleEvents).where(and(
        eq(resourceLifecycleEvents.companyId, agent.companyId), eq(resourceLifecycleEvents.resourceType, "agent"),
        eq(resourceLifecycleEvents.resourceId, agent.id), eq(resourceLifecycleEvents.action, "create"),
      )).limit(1).then(rows => rows[0]);
      const lifecycleCreatedAt = creation?.createdAt ?? agent.createdAt;
      const value = await workers.call(plugin.id, "getData", {
        key: plugin.manifestJson.agentReadiness!.dataKey, companyId: agent.companyId, params: { agentId: agent.id, lifecycleCreatedAt: lifecycleCreatedAt ? new Date(lifecycleCreatedAt).toISOString() : null },
      }, 15_000);
      // A configured provider may decline agents it does not manage.
      if (value === null) return null;
      return pluginAgentReadinessSchema.parse(value);
    } catch {
      return { state: "unavailable", label: "Readiness status unavailable", message: "A readiness plugin could not confirm readiness. Work remains queued." };
    }
  }));
  return result.filter((value): value is PluginAgentReadiness => value !== null);
}
