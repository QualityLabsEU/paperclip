# Hermes native runner implementation

Status (updated 2026-10-07): implementation candidate; **not qualified**.
Branch: `codex/hermes-native-runner`.

## Accepted outcome

Run the pinned Hermes ACP agent through the existing Paperclip Runner/ACPX
boundary. Use existing Connections for models, credentials, subscriptions and
custom endpoints. Preserve incremental reasoning/text/tools, attachments,
native questions, explicit active steering, controller-owned queued work,
strict session recovery, per-agent memory/learned skills and Paperclip routines.
Keep the existing Hermes local/gateway adapters compatible.

## Delivery sequence

- [x] Built-in provider, reproducible provisioning, verified launch and shared connection projections.
- [x] Streaming, multimodal input, questions, steering, cancellation and strict restore implementation.
- [x] Managed memory/skills, per-turn lifecycle and real routine-service binding.
- [x] UI/configuration/contracts, documentation and package distribution.
- [x] Focused TS/Python tests and production-path macOS execution with a deterministic model server.
- [x] Complete final Rust/regression checks and resolve or classify failures.
- [ ] Browser acceptance, Linux/Daytona execution and connection-method qualification.
- [ ] Required repository checks and reviewable PR.

## Qualification evidence

Source baseline: Hermes `v2026.9.24`, commit
`f97608f178d1ffeca59860195ab7da295f7c8e5f`; ACPX `0.13.1`.
The native Hermes process has run through the real production runner against a
deterministic no-auth local HTTP model server. This proves the transport and
native callback path; it does not qualify a paid model, subscription, browser
journey or remote environment. Do not enable the production profile merely
because fixtures pass.

## Implemented scope

- Pinned Python 3.12.14, ACP SDK 0.9.0, MCP and provider extras from upstream's
  lockfile; uv 0.12.17 provisioning; byte-verified relocatable runtime; packaged
  bridge/provisioner and candidate provider-pack support. Both platform closures
  reproduce from fresh provisioning.
- `hermes_runner` projection through existing Connections, pools, account
  selection, ephemeral credential staging, refresh ownership and session
  compatibility. API, subscription, custom protocol and Bedrock projections
  have focused tests. Provider authentication is still unqualified live.
- Native execution v6 with backward parsing for v1–v5, authorized typed image
  and text attachments through TypeScript/Rust/sidecar, and bounded frames.
  Ordinary semantic-result limits remain unchanged.
- Native incremental reasoning/text/tool events, question forms, acknowledged
  active steering, controller-owned queued work, cancellation, strict history
  restore and compaction-head tracking. No SQLite polling or gateway daemon.
- Per-conversation runtime state, managed agent memory/learned skills,
  protected assigned skills, native tool middleware and child-process policy.
  macOS uses sandbox-exec; Linux requires working bubblewrap namespaces and
  rejects unsupported hosts before credential staging.
- Real self-assigned routine create/update/pause/resume with the existing
  service, revision checks, run-bound idempotency and activity publication.
  Native cron and gateway messaging are disabled.
- Pending Hermes choice in existing runner configuration; existing connection,
  model, permission and transcript components. Ten Product E2E candidate cells
  (five local, five Daytona) are registered but have not been run live.

## Evidence and outstanding release gates

The production-path native fixtures pass on macOS arm64: incremental reasoning
and text, image bytes at the selected endpoint, an actual terminal command,
native clarification, assigned MCP round trip, active steering, cancellation,
memory collection, process restart and missing-history rejection. The Rust PRP
fixture also verifies authorized image delivery and semantic task completion.
These tests use real Hermes and a simulated model endpoint.

The branch was rebased onto `03cf6a6ecb0caf5e6f9c4e6af87dc723e5e3bca2`.
Hermes uses the new shared ACP profile manifest. The shared extension fix also
updates Cursor's ACPX patch attestation and profile identity to revision 15;
the Cursor usage, delegation and model-selection package contracts pass.

Post-rebase checks:

| Check | Result |
| --- | --- |
| `pnpm -r typecheck` | Pass |
| `pnpm build` | Pass |
| Rust workspace suite | 651 passing test executions; two ignored |
| Runner ACPX/native contracts and control plane | 1,008 passed; seven skipped |
| Native server input, execution and file handoff | 639 passed |
| Connection projection and routine authority | 38 passed (14 connection, 24 authority) |
| ACP package contracts and provider-pack argument checks | 35 passed |
| Product E2E catalog/fixture support | 74 passed; live journeys not run |
| Native Hermes production-path fixtures | Two passed; deterministic model server |
| UI token gates | Pass |

Python bridge tests pass (15); the Python bridge bytes did not change in the
rebase. Transport coverage includes the unchanged ordinary semantic-result
bound and attachment-sized encrypted frames.

Before the rebase, full repository `pnpm test:run` ran with 15,612 passing, two failing and 91
skipped tests. Both failures pass on targeted reruns: the managed listener
failure was a port collision, and the complete 28-test legacy OpenClaw
comment-wake file passes. That wake file also passes against the original
source baseline. The aggregate invocation itself was not green; no product
change was made to hide either failure.

The clean npm consumer passes its contract checks and independently provisions
the same Hermes runtime hash. Both native fixtures then pass from that
installed package (not workspace imports). The candidate provider-pack
materializer also verifies the copied runtime. Both native execution targets
are still pending real model and product qualification.

Reproduced runtime closure SHA-256:

| Target | Closure digest |
| --- | --- |
| macOS arm64 | `898f2e80e11320b3abb68b7d521776fd71b015102c3caf8b2159f6726f35d746` |
| Linux amd64 | `619c2cf33f52f3db4aa0c8c7005b104c0562ba903f79fae0e46a835fd8cfd70d` |

Release blockers remain explicit:

1. Supply an authorized existing Connection/account for paid-model and
   subscription qualification. No provider or Daytona credentials were present
   in this execution context; the account-selection question is pending.
2. Qualify a Linux amd64 host with the required sandbox support, then actual
   Daytona. Docker's emulated Linux container rejected namespace setup. The
   implementation does not bypass protected-path or process isolation to pass.
3. Run the complete browser journeys and per-method connection matrix,
   including refresh/revocation/concurrent ownership, permission prompts,
   questions across reconnect, steering/queue/stop, remote recovery,
   cross-task learned skills, routine firing and cost attribution.
4. Obtain a green aggregate CI run and review the implementation before
   promoting the candidate. Default production selection remains disabled.

## Review handoff

The routine service binding is a separate eight-file commit on
`codex/hermes-routines`. The native integration is stacked on it on
`codex/hermes-native-runner`, within the 100-file review limit. Changes are
committed locally. The generated root lockfile is excluded as required by the
repository; the Daytona Dockerfile pins the twice-reproduced resolved lock.

Automatic approval review rejected the push and draft-PR creation because they
would publish externally beyond the authorized local implementation. No branch
was pushed and no PR was created. Publication requires user approval. The
Greptile workflow has not run; no review or CI success is claimed.

No Paperclip issue/run API context was supplied to this local Codex task, so
the implementation record stays in this repository rather than being attached
as an issue work product.
