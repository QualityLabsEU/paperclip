// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PluginUiContribution } from "@/api/plugins";
import { pluginsApi } from "@/api/plugins";
import { queryKeys } from "@/lib/queryKeys";
import { PluginLauncherOutlet, PluginLauncherProvider } from "./launchers";
import { _resetPluginModuleLoader, PluginSlotOutlet } from "./slots";

vi.mock("@/context/CompanyContext", () => ({ useCompany: () => ({ selectedCompany: null }) }));

const contribution: PluginUiContribution = {
  pluginId: "fixture", pluginKey: "fixture.sidebar", displayName: "Fixture", version: "1",
  uiEntryFile: "index.js", slots: [],
  launchers: [{
    id: "open", displayName: "Fixture launcher", placementZone: "sidebar",
    action: { type: "navigate", target: "/fixture" },
  }],
};
const context = { companyId: "company-1", companyPrefix: "PAP" };
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

async function render(errorBehavior?: "inline" | "hidden") {
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PluginLauncherProvider>
          <PluginSlotOutlet slotTypes={["sidebar"]} context={context} errorBehavior={errorBehavior} />
          <PluginLauncherOutlet placementZones={["sidebar"]} context={context} errorBehavior={errorBehavior} />
        </PluginLauncherProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  ));
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  vi.spyOn(pluginsApi, "listUiContributions").mockRejectedValue(new TypeError("Failed to fetch"));
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); client.clear(); _resetPluginModuleLoader();
  vi.restoreAllMocks();
});

it("shows inline errors by default when contributions fail to load", async () => {
  await render();
  await vi.waitFor(() => expect(container.textContent).toContain("unavailable"));
  expect(container.textContent).toContain("Plugin extensions unavailable: Failed to fetch");
  expect(container.textContent).toContain("Plugin launchers unavailable: Failed to fetch");
});

it("hides errors and keeps the last loaded launchers when errorBehavior is hidden", async () => {
  client.setQueryData(queryKeys.plugins.uiContributions, [contribution]);
  await render("hidden");
  await act(async () => { await client.refetchQueries({ queryKey: queryKeys.plugins.uiContributions }); });
  expect(client.getQueryState(queryKeys.plugins.uiContributions)?.status).toBe("error");
  expect(container.textContent).not.toContain("unavailable");
  expect(container.textContent).toContain("Fixture launcher");
});
