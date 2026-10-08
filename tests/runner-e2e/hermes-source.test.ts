import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { devNull, tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { prepareHermesQualificationSource } from "./hermes-source.js";
import { resolveRunnerE2ESource } from "./source.js";
import type { MatrixExecution } from "./types.js";

const selected = [{ profile: { qualificationCandidate: "hermes" } }] as MatrixExecution[];
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function checkout() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hermes-source-test-"))); roots.push(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: "1" } }).trim();
  git("init", "-b", "qualification");
  writeFileSync(join(root, "source.txt"), "original\n");
  git("add", "source.txt");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "-c", "commit.gpgsign=false", "-c", `core.hooksPath=${devNull}`, "commit", "-m", "fixture");
  return { root, git, sha: git("rev-parse", "HEAD") };
}

describe("Hermes qualification controller source admission", () => {
  it("records the real checkout automatically in child/result provenance instead of a workflow SHA", () => {
    const f = checkout(); const env = { PATH: process.env.PATH, GITHUB_SHA: "b".repeat(40), GITHUB_REF: "refs/heads/master" };
    expect(prepareHermesQualificationSource(selected, f.root, env)).toMatchObject({ sha: f.sha, ref: "refs/heads/qualification", workingTreeClean: true });
    expect(resolveRunnerE2ESource(null, env)).toMatchObject({ sha: f.sha, ref: "refs/heads/qualification" });
  });
  it("preserves a requested target ref only after independently matching its SHA", () => {
    const f = checkout(); const env = { PATH: process.env.PATH, PAPERCLIP_RUNNER_E2E_SOURCE_SHA: f.sha, PAPERCLIP_RUNNER_E2E_SOURCE_REF: "refs/pull/123/merge" };
    expect(prepareHermesQualificationSource(selected, f.root, env)).toMatchObject({ sha: f.sha, ref: "refs/pull/123/merge" });
    expect(() => prepareHermesQualificationSource(selected, f.root, { ...env, PAPERCLIP_RUNNER_E2E_SOURCE_SHA: "a".repeat(40) })).toThrow("differs");
  });
  it("records detached HEAD instead of borrowing another workflow ref", () => {
    const f = checkout(); f.git("checkout", "--detach", f.sha);
    const env = { PATH: process.env.PATH, GITHUB_REF: "refs/heads/master" };
    expect(prepareHermesQualificationSource(selected, f.root, env)).toMatchObject({ sha: f.sha, ref: "HEAD" });
  });
  it.each(["tracked", "untracked"])("rejects %s source changes without returning a source receipt", kind => {
    const f = checkout(); writeFileSync(join(f.root, kind === "tracked" ? "source.txt" : "extra.txt"), "changed\n");
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH };
    expect(() => prepareHermesQualificationSource(selected, f.root, env)).toThrow("clean checkout before credentials");
    expect(env.PAPERCLIP_RUNNER_E2E_SOURCE_SHA).toBeUndefined();
  });
  it("does not run Git or alter provenance for other providers or missing selections", () => {
    const env = { PAPERCLIP_RUNNER_E2E_SOURCE_SHA: "existing" };
    expect(prepareHermesQualificationSource([], "/does-not-exist", env)).toBeNull();
    expect(prepareHermesQualificationSource([{ profile: { qualificationCandidate: "cursor" } }] as MatrixExecution[], "/does-not-exist", env)).toBeNull();
    expect(env).toEqual({ PAPERCLIP_RUNNER_E2E_SOURCE_SHA: "existing" });
  });
  it("ignores ambient Git redirection and keeps credentials out of the source receipt", () => {
    const f = checkout();
    const env = { PATH: process.env.PATH, GIT_DIR: "/does-not-exist", GIT_WORK_TREE: "/does-not-exist",
      OPENROUTER_API_KEY: "fixture-private-token", FUTURE_PROVIDER_API_KEY: "fixture-private-token" };
    const receipt = prepareHermesQualificationSource(selected, f.root, env);
    expect(receipt).toMatchObject({ sha: f.sha });
    expect(JSON.stringify(receipt)).not.toContain("fixture-private-token");
  });
  it("rejects unreadable source without accepting an operator-supplied SHA", () => {
    const env = { PATH: process.env.PATH, PAPERCLIP_RUNNER_E2E_SOURCE_SHA: "a".repeat(40) };
    expect(() => prepareHermesQualificationSource(selected, "/does-not-exist", env)).toThrow("readable Git source before credentials");
  });
});
