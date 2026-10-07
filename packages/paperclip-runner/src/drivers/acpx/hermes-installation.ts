import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { verifyNativeAcpxInstallation, type VerifiedAcpxInstallation } from "./installation-integrity.js";
import { resolveRunnerProviderAssetsRoot } from "./provider-assets-root.js";
import type { QualifiedAcpxProfile } from "./qualified-profiles.js";

// Pins are produced by explicit provisioning and reviewed alongside the bridge.
// An unbuilt target has no admission pin; it must not inherit a different ABI.
export const HERMES_CLOSURES: Readonly<Record<string, string>> = Object.freeze({
  "darwin-arm64": "898f2e80e11320b3abb68b7d521776fd71b015102c3caf8b2159f6726f35d746",
  "linux-x64": "619c2cf33f52f3db4aa0c8c7005b104c0562ba903f79fae0e46a835fd8cfd70d",
});
export async function verifyHermesInstallation(profile: QualifiedAcpxProfile): Promise<VerifiedAcpxInstallation> {
  if (profile.agent !== "hermes" || profile.agentServerPackage !== "builtin:hermes-acp" || profile.agentServerVersion !== "1" || profile.agentRuntimePackage !== "native:hermes" || profile.agentRuntimeVersion !== "v2026.9.24") throw new Error("Hermes native profile identity mismatch");
  const platform = `${process.platform}-${process.arch}`;
  const expectedClosureSha256 = HERMES_CLOSURES[platform];
  if (!expectedClosureSha256) throw Object.assign(new Error(`Hermes ${platform} runtime is pending qualification; provision and verify its pinned Python distribution first`), { code: "HERMES_RUNTIME_UNAVAILABLE" });
  const distributionRoot = join(resolveRunnerProviderAssetsRoot(import.meta.url, "hermes"), platform);
  let installation: VerifiedAcpxInstallation;
  try {
    installation = await verifyNativeAcpxInstallation({
      distributionRoot, manifestPath: join(distributionRoot, "manifest.json"), expectedClosureSha256,
      executable: "python/bin/python3.12", pythonEntrypoint: "entry.py", fixedArguments: [],
    });
  } catch (error) {
    throw Object.assign(new Error(`Hermes runtime is unavailable or does not match the pinned distribution. Run scripts/provision-hermes.mjs for ${platform} before selecting Hermes.`, { cause: error }), { code: "HERMES_RUNTIME_UNAVAILABLE" });
  }
  await verifyHermesCommandSandbox();
  return Object.freeze({ ...installation, commandDigest: profile.commandDigest });
}

/** Probe the actual host before the runtime host stages any credential. */
export async function verifyHermesCommandSandbox(
  platform = process.platform,
  execute: (command: string, args: string[]) => Promise<unknown> = async (command, args) => {
    await promisify(execFile)(command, args, { timeout: 10_000, maxBuffer: 4_096,
      env: { PATH: "/usr/bin:/bin" }, windowsHide: true });
  },
): Promise<void> {
  try {
    if (platform === "darwin") {
      await execute("/usr/bin/sandbox-exec", ["-p", "(version 1) (allow default) (deny process-info*) (allow process-info* (target self))", "/usr/bin/true"]);
    } else if (platform === "linux") {
      await execute("/usr/bin/bwrap", ["--die-with-parent", "--unshare-pid", "--bind", "/", "/", "--proc", "/proc", "--", "/bin/true"]);
    } else {
      throw new Error("Unsupported platform");
    }
  } catch {
    throw Object.assign(new Error(platform === "linux"
      ? "Hermes setup requires /usr/bin/bwrap and a host that permits its user, mount and PID namespaces. This container cannot safely run Hermes command tools; use a compatible runner image/host before retrying."
      : "Hermes setup requires a supported macOS arm64 host with working /usr/bin/sandbox-exec."), { code: "HERMES_HOST_SANDBOX_UNAVAILABLE" });
  }
}
