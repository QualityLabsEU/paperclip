import { afterEach, describe, expect, it, vi } from "vitest";
import { issueExecutionPolicySchema } from "@paperclipai/shared";
import type { IssueExecutionPolicy } from "@paperclipai/shared";
import { buildExecutionPolicy, stageParticipantValues } from "./issue-execution-policy";

const AGENT_ID = "00000000-0000-4000-8000-000000000001";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Persisted monitor-only policies can omit fields supplied by schema defaults.
const monitorOnlyPolicy = {
  monitor: {
    nextCheckAt: "2026-10-08T16:00:00.000Z",
    notes: "Check pull request",
    scheduledBy: "assignee",
    kind: "external_service",
    serviceName: "github-pr",
    externalRef: "https://github.com/example/repo/pull/1",
    maxAttempts: 5,
  },
} as IssueExecutionPolicy;

describe("stageParticipantValues", () => {
  it.each(["review", "approval"] as const)("reads %s participants from a monitor-only policy", (stageType) => {
    expect(issueExecutionPolicySchema.safeParse(monitorOnlyPolicy).success).toBe(true);
    expect(stageParticipantValues(monitorOnlyPolicy, stageType)).toEqual([]);
  });
});

describe("buildExecutionPolicy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds review and approval stages to a monitor-only policy without losing its monitor", () => {
    const policy = buildExecutionPolicy({
      existingPolicy: monitorOnlyPolicy,
      reviewerValues: [`agent:${AGENT_ID}`],
      approverValues: ["user:local-board"],
    });

    expect(issueExecutionPolicySchema.safeParse(policy).success).toBe(true);
    expect(policy?.monitor).toEqual(monitorOnlyPolicy.monitor);
    expect(stageParticipantValues(policy, "review")).toEqual([`agent:${AGENT_ID}`]);
    expect(stageParticipantValues(policy, "approval")).toEqual(["user:local-board"]);
  });

  it("keeps a monitor-only policy when there are no review or approval stages", () => {
    expect(buildExecutionPolicy({
      existingPolicy: monitorOnlyPolicy,
      reviewerValues: [],
      approverValues: [],
    })).toEqual({
      mode: "normal",
      commentRequired: true,
      stages: [],
      monitor: monitorOnlyPolicy.monitor,
    });
  });

  it("generates schema-valid UUIDs when crypto.randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = index;
        }
        return bytes;
      },
    });

    const policy = buildExecutionPolicy({
      existingPolicy: null,
      reviewerValues: [`agent:${AGENT_ID}`],
      approverValues: ["user:local-board"],
    });

    expect(policy).not.toBeNull();
    expect(issueExecutionPolicySchema.safeParse(policy).success).toBe(true);
    expect(policy?.stages).toHaveLength(2);

    for (const stage of policy?.stages ?? []) {
      expect(stage.id).toMatch(UUID_PATTERN);
      expect(stage.participants).toHaveLength(1);
      expect(stage.participants[0]?.id).toMatch(UUID_PATTERN);
    }
  });
});
