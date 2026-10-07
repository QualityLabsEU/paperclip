import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stageManagedHermesCredential } from "./hermes-credentials.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const environment = { PAPERCLIP_HERMES_AUTH_JSON_SECRET: JSON.stringify({ version: 1, providers: { "openai-codex": { access_token: "fixture-token" } } }) };

describe("Hermes credential cleanup after verified provider exit", () => {
  it.each(["refresh", "collection"])("scrubs credentials and releases ownership even when %s fails", async failure => {
    const home = await mkdtemp(join(tmpdir(), "hermes-credential-cleanup-")); roots.push(home);
    let failCollection = failure === "collection";
    const lease = await stageManagedHermesCredential({ agentHomeDirectory: home, environment,
      beforeRelease: async () => { if (failCollection) throw new Error("learned state rejected"); } });
    await mkdir(join(home, "logs"));
    await writeFile(join(home, "logs/native.log"), "private diagnostic fixture");
    if (failure === "refresh") await chmod(join(home, "auth.json"), 0o644);
    await expect(lease.close()).rejects.toThrow("Hermes state save or credential cleanup failed");
    await expect(readFile(join(home, "auth.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(home, "logs/native.log"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(home, ".paperclip-auth-cleanup-required"))).rejects.toMatchObject({ code: "ENOENT" });
    failCollection = false;
    await lease.close();
    const next = await stageManagedHermesCredential({ agentHomeDirectory: home, environment, retainRefresh: () => false });
    await lease.close();
    expect(await readFile(join(home, "auth.json"), "utf8")).toContain("fixture-token");
    await next.close();
    await expect(readFile(join(home, "auth.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
