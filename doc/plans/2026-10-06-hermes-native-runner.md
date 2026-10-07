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

1. Complete the paid Connection/account matrix. An OpenRouter qualification key
   and xAI API key are now available. Other API, subscription, custom endpoint,
   and Bedrock methods still need live qualification resources.
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
committed. The generated root lockfile is excluded as required by the
repository; the Daytona Dockerfile pins the twice-reproduced resolved lock.

The user subsequently authorized release qualification and PR verification.
The routine PR is [#15434](https://github.com/paperclipai/paperclip/pull/15434).
The native integration is stacked in
[#15435](https://github.com/paperclipai/paperclip/pull/15435). Both are drafts;
review and CI are running. Qualification fixes use `codex/hermes-qualification`
to retain the under-100-file limit for each review.

## Paid qualification, 2026-10-07

The first local OpenRouter `hello-complete` Product E2E attempt passed through
real Chromium, the isolated server/database, Runnerd, ACPX, native Hermes, and
the paid `deepseek/deepseek-v4-flash-0731` model. It saved one Done transition
and one final answer. Cleanup passed. Native usage reported 56,843 input tokens,
198 output tokens, and 2,560 cached input tokens; billed cost is unavailable.
The initial report has a null source field; the checkout was `2796b80a9` and
only image-identity inputs changed during that attempt. Later campaigns supply
the explicit source SHA and ref.

The next paid question/answer attempt reached the question, but continuation
failed: `run.attach requires the same settled ACPX provider profile and session`.
The saved provider was settled and its native history existed. Its managed
agent-file root changed for the new run, while Rust admitted that authenticated
grant rotation only for Cursor. Hermes now uses the same closed grant-rotation
policy; the cross-run test verifies preserved session identity, refreshed
paths/bindings, and rejected policy or same-run changes for both harnesses.
The campaign was stopped before more paid cases. Its in-flight Plan attempt
remains a failed interruption/cleanup record, not qualification proof.

The Daytona image identity now includes the Hermes provisioner, materializer,
and shared ACP profile manifest, and accepts an explicit Hermes candidate pack.
Eight image contract tests pass. This is packaging coverage, not a Linux or
Daytona live pass.

Private sanitized Product E2E evidence remains in the ignored results directory:
`hermes-local-paid-20261007-first` and
`hermes-local-paid-20261007-continuity` under `tests/runner-e2e/results/`.

No Paperclip issue/run API context was supplied to this local Codex task, so
the implementation record stays in this repository rather than being attached
as an issue work product.


### Review and recovery follow-up, 2026-10-07

The question rerun at `c22d1f422` successfully resumed and reached Done, but
failed the independent browser oracle: saved interruption text was prefixed to
the new answer. ACPX was emitting load/resume history as live turn events.
The dependency patch now retains those updates in the saved projection without
publishing them as new text or tool activity. Native history remains intact.
The additional cancellation/restore fixture also found an exact-route mismatch:
Hermes's HTTP client appended a slash to the recorded base URL. The bridge
accepts only that URL-path normalization while retaining exact model, provider,
protocol, query and the authoritative connection fingerprint checks.
The failed rerun evidence stays in
`tests/runner-e2e/results/hermes-local-paid-20261007-question-fix`.

Review fixes make credential cleanup run even when refresh or learned-file
collection fails. Once the credential fence is released, stale cleanup cannot
read a successor's credential. Unique reserved transfer files are validated and
removed before learned-state inventory; unfinished writes never become skills
or memories. The focused credential/state regressions pass.

Routine edits now remap open description annotations inside the mutation
transaction, with normal activity records. A real-database regression covers
description and timezone/schedule changes, idempotent replay, stale revisions,
and invalid schedule rollback without changes to annotations or receipts.
All 25 routine authority tests pass. Generated operation documentation and
catalog reconciliation expectations now reflect the real routine binding.

Fresh provisioning exposed build-specific uv installation paths in Python
sysconfig and the macOS library identity. The materializer normalizes those
paths and re-signs the changed macOS library with a deterministic ad-hoc
signature. Independently provisioned interpreter paths produce identical
closures; this is distribution proof, not live Linux sandbox qualification.

| Final target | Closure digest |
| --- | --- |
| macOS arm64 | `4c89b24335e1869a9faba6996a4e82979337ee5f850d792ab41a838e79afdce3` |
| Linux amd64 | `f9919bd2e812e86e81ecd964d6e1961bb68f96e2154f816c554f31c4f1d78211` |

The qualification stack is
[#15436](https://github.com/paperclipai/paperclip/pull/15436). Runtime
qualification fixtures and this implementation/evidence record belong to that
PR to keep the native integration review below 100 files. The new shared ACPX
patch has an explicit Cursor profile revision 16, preserving historical
revision decoding. The Docker lock digest is twice reproduced; the root lock
file remains owned by the repository's lock bot.
