import { execFileSync } from "node:child_process";
import { devNull } from "node:os";
import type { MatrixExecution } from "./types.js";
import { resolveRunnerE2ESource } from "./source.js";

/** The checked-out controller is authoritative, independently of workflow context. */
export function prepareHermesQualificationSource(
  executions: readonly MatrixExecution[],
  repositoryRoot: string,
  environment: NodeJS.ProcessEnv,
) {
  if (!executions.some(execution => execution.profile.qualificationCandidate === "hermes")) return null;
  const gitEnvironment: NodeJS.ProcessEnv = {
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: devNull,
    ...Object.fromEntries(["PATH", "SYSTEMROOT", "LANG"].flatMap(name =>
      environment[name] === undefined ? [] : [[name, environment[name]]])),
  };
  const git = (args: string[]) => {
    try {
      return execFileSync("git", ["-c", "core.fsmonitor=false", ...args], {
        cwd: repositoryRoot, env: gitEnvironment, encoding: "utf8",
        timeout: 10_000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    } catch {
      throw new Error("Hermes qualification needs readable Git source before credentials; use a clean checkout.");
    }
  };
  const sha = git(["rev-parse", "HEAD"]);
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Hermes qualification source SHA is invalid.");
  if (git(["status", "--porcelain", "--untracked-files=normal"])) {
    throw new Error("Hermes qualification needs a clean checkout before credentials; commit or remove source changes.");
  }
  const requestedSha = environment.PAPERCLIP_RUNNER_E2E_SOURCE_SHA?.trim();
  if (requestedSha && requestedSha !== sha) {
    throw new Error("Hermes qualification source SHA differs from the checked-out controller before credentials.");
  }
  const ref = git(["rev-parse", "--symbolic-full-name", "HEAD"]);
  if (git(["rev-parse", "HEAD"]) !== sha) throw new Error("Hermes qualification source changed during admission.");
  // These explicit values survive local-env loading and reach every child and
  // synthetic failure. A workflow's own GITHUB_SHA may identify another commit.
  environment.PAPERCLIP_RUNNER_E2E_SOURCE_SHA = sha;
  environment.PAPERCLIP_RUNNER_E2E_SOURCE_REF =
    (requestedSha && environment.PAPERCLIP_RUNNER_E2E_SOURCE_REF?.trim()) || ref;
  return { schema: "paperclip.hermes.e2e-source/v1", workingTreeClean: true,
    ...resolveRunnerE2ESource(null, environment) };
}
