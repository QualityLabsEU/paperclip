import { expect, it, vi } from "vitest";
import { verifyHermesCommandSandbox } from "./hermes-installation.js";

it("rejects a Linux host that has bubblewrap but denies namespaces", async () => {
  const execute = vi.fn(async () => { throw new Error("Creating new namespace failed: Operation not permitted"); });
  await expect(verifyHermesCommandSandbox("linux", execute)).rejects.toThrow("cannot safely run Hermes command tools");
  expect(execute).toHaveBeenCalledWith("/usr/bin/bwrap", expect.arrayContaining(["--unshare-pid", "--proc", "/proc"]));
});

it("probes the macOS process policy before admitting a provider", async () => {
  const execute = vi.fn(async () => {});
  await verifyHermesCommandSandbox("darwin", execute);
  expect(execute).toHaveBeenCalledWith("/usr/bin/sandbox-exec", expect.arrayContaining(["/usr/bin/true"]));
});
