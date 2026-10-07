# Hermes native runner implementation

Status (updated 2026-10-07): implementation candidate; **not qualified**.
Current branch: `codex/hermes-qualification`; stacked on
`codex/hermes-native-runner` and `codex/hermes-routines`.

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
- [x] Reviewable draft PR stack, green CI and fresh Greptile 5/5 on the implementation heads.
- [x] Complete the final local aggregate test invocation and classify its failures.
- [ ] Complete live release qualification.

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
  (five local, five Daytona) are registered. All five local cases have passing
  paid attempts across different heads; the complete release matrix has not passed.

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

Historical post-rebase checks (superseded where newer results appear below):

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

Historical pre-review runtime closure SHA-256:

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
4. Complete the full live qualification before promoting the candidate.
   Implementation CI and review are green; they do not replace live proof.
   Default production selection remains disabled.

## Review handoff

The routine service binding is a separate review on
`codex/hermes-routines`. The native integration is stacked on it on
`codex/hermes-native-runner`, within the 100-file review limit. Changes are
committed. The generated root lockfile is excluded as required by the
repository. The Daytona Dockerfile requires the caller to provide the SHA-256
of its resolved lock and verifies the copied lock before installing dependencies.

The user subsequently authorized release qualification and PR verification.
The routine PR is [#15434](https://github.com/paperclipai/paperclip/pull/15434).
The native integration is stacked in
[#15435](https://github.com/paperclipai/paperclip/pull/15435). Both are drafts;
their current implementation heads have green CI and fresh Greptile 5/5.
Qualification fixes use `codex/hermes-qualification`
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

| Historical review target | Closure digest |
| --- | --- |
| macOS arm64 | `4c89b24335e1869a9faba6996a4e82979337ee5f850d792ab41a838e79afdce3` |
| Linux amd64 | `f9919bd2e812e86e81ecd964d6e1961bb68f96e2154f816c554f31c4f1d78211` |

The qualification stack is
[#15436](https://github.com/paperclipai/paperclip/pull/15436). Runtime
qualification workflows, follow-up fixes and this implementation/evidence record
belong to that PR. The native runtime fixtures belong to #15435. Each review
remains below 100 files. The new shared ACPX
patch has an explicit Cursor profile revision 16, preserving historical
revision decoding. The Docker lock digest is twice reproduced; the root lock
file remains owned by the repository's lock bot.

### Current qualification record, 2026-10-07

Hermes remains **pending qualification**. All three draft implementation PRs
have passing CI and fresh Greptile 5/5 at these
heads: routines `3745f3c5a46bda7778ee132682d1b7ae23b088c1`, native
`6a7a006b0738558a4abb1c030f2b7b11f5afea2c`, and qualification
`09195bb8c8bc564eaa3f5061a7d6b5d685e708a4`. A later native review also found a
standalone image command without the required resolved-lock digest. Both image
guides were corrected in `0dea682031f8e35631faee7a05519ed4dce80d07`, their shell
syntax and checksum ordering were checked, and the addressed thread was
resolved. The qualification commits were rebased onto that fix. Subsequent
documentation heads require fresh checks and review before handoff.

Paid planning exposed two integration defects. Assigned plan-document and
task-title tools were rejected by the native read-only guard before the
controller could apply its task-mode authority. Structured MCP results also
appeared as `null` in the transcript. Assigned workflow tools now reach the
existing controller authorization and configured permission check; native
commands and file writes remain denied in planning mode. Tool results retain
their actual output. A pre-dispatch denial synthesizes a failed call using
Hermes's authoritative call ID exactly once, including overlapping calls.

Managed Hermes restoration now loads the validated native history without
emitting it again as new ACP transcript output. Paperclip owns the persisted
transcript. Standalone, non-negotiated ACP clients retain native history replay.
Missing or unreadable native history still fails restoration.

Current runtime closure SHA-256 (fresh provisioning reproduced both):

| Target | Closure digest |
| --- | --- |
| macOS arm64 | `970f0c48b905d17e616a3b75ef28d91a0e28afba8dbb3218628cd02b3b1e709c` |
| Linux amd64 | `15fc9631318d50a2aafa9c566410b4d486265fb3e58a7981fd0c2525a5fb8f7a` |

Current focused verification: 46 TypeScript permission/sandbox/configuration/
installation tests, 20 pinned Python bridge tests, and both native production
fixtures pass. The ACPX fixture additionally checks planning round trips,
visible write denials, strict cancellation recovery and missing-history
rejection. These fixtures use a deterministic model endpoint. The full Rust
workspace ran 652 passing test executions with two ignored. Repository
typecheck, build, protocol generation checks and UI token gates pass.

The local aggregate test invocation finished with 16,084 passing tests, one
failed test, 216 skipped tests and two failed suite setups. Both suite setups
failed during embedded PostgreSQL bootstrap before their assertions ran. The
real 40,000-file Git streaming test reached its existing five-minute deadline.
These failures remain failures of that invocation; focused reruns and green
sharded CI do not rewrite it as a pass.
The isolated rerun passed both database suites (eight tests). The Git fixture
still reached its five-minute deadline. Its test and shared Git implementation
are unchanged from the source baseline; Linux PR CI passes that coverage. The
local Git timeout remains an explicit verification limitation.

Paid browser attempts used the managed OpenRouter account and exact model
`deepseek/deepseek-v4-flash-0731`, on macOS arm64, through Chromium, the isolated
Paperclip server/database, Rust Runnerd, ACPX and native Hermes:

| Case | Passing campaign | Source provenance | Duration | Cleanup |
| --- | --- | --- | --- | --- |
| Hello/completion | `hermes-local-paid-20261007-first` | Report source null; observed checkout `2796b80a9` with image inputs in progress | 47.63 s | Pass |
| Question/resume | `hermes-local-paid-20261007-question-replay-fix-retry2` | Recorded `74b692bbd8c98bbeda4c39cf8327680245ac2cbf` | 106.90 s | Pass |
| File edit/validation | `hermes-local-paid-20261007-remaining-continuity` | Recorded `0ba0d75511cf9fdf1fa4b21d9e900503078f3620` | 122.28 s | Pass |
| Plan/approve/complete | `hermes-local-paid-20261007-plan-policy-fix` | Recorded `09195bb8c8bc564eaa3f5061a7d6b5d685e708a4` | 134.19 s | Pass |
| Structured question/controller restart/resume | `hermes-local-paid-20261007-restart-resource-retry` | Report source null: invocation used the wrong source-variable names; observed checkout `09195bb8c8bc564eaa3f5061a7d6b5d685e708a4` | 118.72 s | Pass |

All five registered local cases have passing attempts across multiple heads.
This is not a complete final-head campaign or the full requested release
matrix. The restart case proves persistence of the pending question across a
controller restart, submission of its answer, native session reuse, and task
completion. Its resumed run reported 64,166 input and 281 output tokens. The
planning completion run reported 62,268 input, 478 output and 37,888 cached
input tokens. Their interrupted first runs have incomplete usage receipts.
Cost remains unpriced; missing cost is not a zero-cost execution.

The preceding restart attempt failed during test-database bootstrap, before
any model request. Clearing only four confirmed user-owned, unattached,
56-byte shared-memory segments with dead creators allowed the unchanged test
to run. Earlier session-open timeout and transcript failures remain retained
in their own campaign results. No deadline or oracle was weakened.

Private numeric-only budget receipts show the qualification key's $5 hard
limit still has $4.559226202 remaining after these attempts. The shared-key
usage change is an aggregate ceiling, not exact attribution to individual
runs. Sanitized results remain under `tests/runner-e2e/results/`; private native
history, credentials and hidden reasoning are not published as artifacts.

The clean installed-package root/evals/testing conformance check passed on
`09195bb8c8bc564eaa3f5061a7d6b5d685e708a4`. It uses offline packed runtime
dependencies, including the reviewed ACPX patch, rather than unmodified
registry dependencies. The installed package's shipped provisioner reproduced
the current macOS closure. Both native fixtures passed from installed compiled
code, using the published release Runnerd artifact: 29.03 seconds for the Rust
path and 146.75 seconds for the ACPX path. Only fixture import locations and the
explicit Runnerd artifact path were adapted; assertions and deadlines stayed
unchanged. This is clean-package transport proof with a simulated model.

The protected paid workflow now provisions Python, bubblewrap, and the verified
Hermes closure only for an explicit Hermes selection, before credentials enter
the paid step. It must land on `master` before its trusted dispatch can run
paid Linux/Daytona campaigns. No paid remote campaign has been dispatched.
An available development host permits bubblewrap but is Linux arm64; it does
not satisfy the requested Linux amd64 target. The emulated local Linux amd64
container provides provisioning proof and still fails the namespace gate.

Outstanding release proof includes the other API providers, subscriptions,
custom protocols, Bedrock, real vision input, credential refresh/revocation and
concurrent ownership, live steering/queue/stop, lower permission modes,
cross-task memory/learned skills, routine firing and deduplication, and actual
Linux amd64/Daytona execution and restoration. Exact approved Connection names
and a compatible remote execution environment are still needed. The existing
standalone Hermes local/gateway adapters retain their contracts.

### Final-head campaign and startup follow-up, 2026-10-07

The campaign `hermes-local-paid-20261007-final-head` correctly recorded source
`a54d04785b62e2190f4e13647bf75ae510449d98` and passed **1/5** cases. It used
the same managed OpenRouter account, exact model and macOS browser/Runner path:

| Case | Result | Failure or limitation |
| --- | --- | --- |
| Hello/completion | Pass | Done, exact final answer and cleanup passed |
| Question/resume | Fail | `session.open` exceeded its 30-second command deadline; cleanup passed |
| Plan/approve/complete | Fail | Reasoning streamed but the 120-second turn deadline expired; cleanup passed |
| Structured question/restart/resume | Fail | The isolated server hit system `ENFILE`; cleanup failed |
| File edit/validation | Fail | Dispatch was interrupted after the resource failure; process-group cleanup identity was uncertain |

The file case's underlying task later reached success, but its independent
fixture oracle and cleanup did not pass. Its recorded failure is unchanged.
The owned launcher and remaining isolated server/database were retired with
verified exit. Failed private recovery roots remain preserved because their
original cleanup receipts failed. No additional paid campaign was launched.
The numeric budget receipt reports $4.539181805 remaining under the key's $5
limit; this is shared-key accounting, not exact per-run billed cost.

Credential-free production-host probes reproduced variable cold-start latency.
The first verified 445 MB runtime copy took 3.08 seconds. A complete admission
later took 33.69 seconds: 16.54 seconds for the verified private copy and 16.61
seconds for native initialization/ACP handshake. Its no-auth loopback endpoint
received only model/backend metadata probes, with no inference requests.
These measurements reproduce an admission deadline problem; they do not prove
the cause of the host's file-table exhaustion. The read-only host counter still
reported 461,999 open files against a 491,520 limit. No system limit was changed
and no unrelated process was stopped.

Hermes now has a separate 60-second native session-open deadline. The PRP
controller allows 75 seconds around cold admission, recovery, and later-turn
restoration. Ordinary commands and stop retain their prior deadlines, and the
post-acceptance turn-start event deadline remains 30 seconds. The 120-second
Product E2E turn oracle is unchanged. Focused regressions verify delayed startup,
ordinary-command timeout, fail-closed transport reuse and the finite outer
deadline. This addresses admission timing only; the paid planning timeout and
host resource failures still require a new passing campaign on a reliable host.

Startup verification passed seven TypeScript deadline regressions, the complete
193-test controller transport selection, 27 focused Rust session/transport test
executions, and the complete 655-execution Rust workspace suite (two ignored).
Runner TypeScript/Rust typechecks, verified entrypoint builds, release binary
build, workflow authority tests (14), and actionlint pass.
Both rebuilt native production fixtures also pass: 35.98 seconds through Rust
PRP/sidecar and 144.68 seconds through the ACPX host. They use the deterministic
no-auth model fixture and retain their original assertions and deadlines.

The new credential-free `Hermes Native Transport` PR workflow provisions the
pinned Linux amd64 closure and runs both production native fixtures on an
ephemeral Ubuntu host. Provider children receive an empty environment plus the
fixture PATH/home/opt-in flag. No paid environment or credentials are available.
It retains source/runtime provenance and fixture logs as CI artifacts while
excluding private native homes. Its actual execution result must be checked;
the workflow declaration alone is not Linux proof. The protected paid workflow
and its default-branch authorization remain unchanged by this addition.

The first Linux CI attempt provisioned the exact pinned closure and passed the
native ACPX fixture in 94.21 seconds, including native command tools, planning,
images, questions, controls, memory and strict recovery. The Rust fixture failed
before native launch because GitHub's Node interpreter was group-writable.
The workflow now removes only group/world write bits from its own interpreter,
matching the existing paid workflow's setup step. The launch verifier is
unchanged; both native fixtures must pass on a new attempt. The corresponding
ordinary PR run recorded a timeout in the unchanged chat retry denial-feedback
browser test, followed by simultaneous runner shutdowns across other jobs.
Their failures remain recorded and need fresh CI. Repository-wide typecheck
and build pass on startup runtime head `2cf45fa7ff52b08215c726cf10b7d8353e69892a`.

The three draft PRs had green CI and fresh Greptile 5/5 at routines
`3745f3c5a46bda7778ee132682d1b7ae23b088c1`, native
`0dea682031f8e35631faee7a05519ed4dce80d07`, and qualification
`a54d04785b62e2190f4e13647bf75ae510449d98`. That qualification CI initially
failed an unchanged signoff mock-heartbeat browser case; inspection and the
failed-job-only rerun passed. Startup changes require new checks and review.
Hermes remains pending qualification throughout.

### Linux transport proof and master synchronization, 2026-10-07

The follow-up credential-free Linux amd64 run
[37638866523](https://github.com/paperclipai/paperclip/actions/runs/37638866523)
passed both production native fixtures: Rust PRP/sidecar in 17.16 seconds and
ACPX/native in 88.01 seconds. Its
[evidence artifact](https://github.com/paperclipai/paperclip/actions/runs/37638866523/artifacts/11491541694)
records checkout merge SHA `12417c5b911c3102cba3247665e5ba94d632d9d1`, whose
parents are native head `0dea682031f8e35631faee7a05519ed4dce80d07` and
qualification head `689d0fa2cc2201f4643634f0fdb6da91922a7cc3`.
Ubuntu 22.04.5, Node 24.21.0, Python 3.12.14, ACP 0.9.0 and ACPX 0.13.1
reproduced the pinned Hermes Linux closure. No provider credentials or paid
model were used. This proves native transport on Linux; paid browser and
Daytona qualification remain outstanding.

The full ordinary PR run
[37638866778](https://github.com/paperclipai/paperclip/actions/runs/37638866778)
passed on that qualification head, including all browser shards, server and
workspace suites, typecheck, build, native runner checks and canary dry run.
Greptile reviewed that exact head at 5/5 with no open feedback. The first two
PRs also retained green CI and fresh 5/5 at their previously recorded heads.

Master then advanced with task monitors and Claude asset-path restoration,
creating a generated-contract conflict in the routines PR. The stack is being
replayed on master `083073703086dd699f3f2bfd852e56c7150c2d09` before any merge. Combined contracts retain both
live routine management and task monitors (46 live operations, 29 shared,
57 canonical); provider policy retains Claude authenticated asset paths and
Hermes authenticated run grants. Runtime closure pins and qualification
bridge bytes are unchanged. Fresh verification is required for the replayed
heads. Paid failures remain failures, and Hermes stays gated.

Local replay verification passed repository-wide typecheck and build, UI token
gates, 37 catalog/admission tests, and 658 Rust test executions with two ignored.
The routine/service and native authority selection passed 102 tests, with one
stale combined-tool count assertion failing. That assertion was corrected to
40 while retaining explicit membership checks for both operations; its isolated
real-database rerun passed. The full fresh PR CI and reviews remain required.

### Review follow-up and replayed Linux proof, 2026-10-07

The credential-free Linux run
[37642068493](https://github.com/paperclipai/paperclip/actions/runs/37642068493)
passed both native fixtures after master synchronization: Rust PRP/sidecar in
18.69 seconds and ACPX/native in 91.39 seconds. Its
[evidence artifact](https://github.com/paperclipai/paperclip/actions/runs/37642068493/artifacts/11492173396)
records checkout `98d8c1e30f2f69d48fad3ef0785c1adcd82b0ba3`, PR head
`96585ac7ff5a2bc8032ba5213fcd23b230815c20`, the same runtime versions and
pinned Linux closure, and no credentials. This remains transport proof only.

Fresh reviews on the replayed routines and native PRs returned 4/5 and found
three actionable issues. A native routine edit held its execution agent/issue
locks before waiting for the scheduler's routine lock. Routine locking now
uses NOWAIT and returns a retryable 409, rolling back the mutation receipt
before retry. The real scheduled-firing regression exercises contention,
agent-row access, receipt rollback, and exactly-once retry. Local PostgreSQL
failed to start before assertions in two bounded attempts; that regression
still requires a successful CI execution. Server TypeScript compilation passed.
The read-only host counter reported 466,103 files against a 491,520 limit;
the startup failures alone do not establish their cause. No paid macOS rerun
was launched.

The already-tested planning authority, native transcript and restore fixes
were moved into the core native PR so it works independently of the
qualification PR. Text attachments also now count JSON escaping and metadata
at admission, along with the combined message, against a 7 MiB encoded budget.
TypeScript and Rust reject over-budget content before active-turn state changes.
This preserves the 16 MiB encrypted frame limit. Verification passed 28 focused
TypeScript attachment/permission tests, two encrypted-frame tests carrying
accepted images and escaped documents, the Rust admission regression, and
Runner TypeScript compilation. The stack still needs fresh CI and review on
the resulting heads. No merge has occurred, and Hermes remains gated.

The complete affected native tool-authority suite subsequently passed all 26
tests with supported Node 24 and local PostgreSQL permissions. A negative proof
restored only the previous blocking lock temporarily: the concurrency regression
failed at its expected contention timeout. The committed NOWAIT fix was restored
with no remaining worktree changes. All 143 affected ACPX lifecycle tests and
the current generated profile, protocol, sidecar and surface checks also passed.

The qualification review at `c99b2c86748e06600d853adaf5a7483aa16ed8ca` returned
5/5 but noted a native CI trigger coverage gap. The credential-free workflow
now covers shared Runner sources, Rust and build manifests, dependency patches,
and shared workspace inputs. A glob-matching regression verifies those changes
trigger the native fixture. Paid workflow authorization is unchanged. This
follow-up requires another exact-head review and CI run.

### Cloud image and live Linux browser proof, 2026-10-07

The trigger-coverage fix passed fresh CI and Greptile 5/5 at qualification head
`575d3bb665e7eb848f1607797f27635aba2e27f5`. Routines
`f2c047d07147f710b40b2dffcb097a71676dc8f4` and native integration
`45f591120dc78a080f347f3d3e4ad4fd05a19993` also have green checks and fresh
5/5 reviews with no unresolved threads. No PR has been merged. Further fixture
changes require new exact-head checks and review.

The candidate image built successfully in AWS CodeBuild from
`8e31afda4ff3b4c0415bc26f8bb35cec17437741`, whose only change from the above
qualification head selects Hermes in the Dockerfile's candidate-pack default.
Its independently verified immutable digest is
`sha256:b8b8a3279e27a58d6cf5269b7e6480914f34bf036d74abb5d1e65b99996ccd6e`.
The build used a checksum-bound resolved lock, frozen dependencies, no provider
credentials, Python 3.12.14, ACP 0.9.0, ACPX 0.13.1 and the pinned Hermes release.
The image remains private and pending qualification. No local Docker build was
used; Docker Desktop was stopped again when another local process restarted it.

CodeBuild could build the image but its execution filesystem rejected native
bubblewrap with `Can't open source /: Function not implemented`. That failed
credential-free probe is retained. The same image passed its unmodified native
command policy on a disposable EC2 amd64 host, Amazon Linux kernel
`6.1.188-233.386.amzn2023.x86_64`. The qualifier ran as uid 1001 inside an
explicitly privileged cloud container: protected files remained hidden,
assigned skills remained read-only, and allowed workspace writes succeeded.
This establishes this EC2 host's compatibility; it does not qualify Daytona.

All five core Linux Product E2E cells passed through Chromium, an isolated Paperclip
server/database, Runnerd, ACPX, native Hermes and managed OpenRouter model
`deepseek/deepseek-v4-flash-0731`:

| Case | Campaign suffix | Duration | Native runs | Cleanup |
| --- | --- | --- | --- | --- |
| `hello-complete` | `71743c4f328f` | 72.351 seconds | 1 | Passed |
| `question-resume-complete` | `703f08761be6` | 133.251 seconds | 2 | Passed |
| `plan-approve-complete` | `8662152371fd` | 140.890 seconds | 2 | Passed |
| `structured-question-restart-resume` | `87eaa1dd7deb` | 137.277 seconds | 2 | Passed |
| `file-edit-validate` | `758fe67e2613` | 132.001 seconds | 1 | Passed |

All five results bind the exact image-source commit above. The catalog environment
is `local`, with a separately recorded AWS EC2 Linux execution host; these are
not Daytona/remote-target passes. The first case independently verified Done,
one final answer and a successful native run, with a reviewed final screenshot.
The second retained the question and final screenshots and verified the answer
and continuation. The third verified plan approval, continuation and completion,
with two reviewed screenshots. The fourth verified retained question state and
conversation continuation after a real controller restart, with three screenshots.
The file case checked the actual final file bytes and command validation, with
one screenshot. Runtime cost is not metered by that local catalog; external
EC2 cost is separate. Native token usage was available for the completion run
and one of the two runs in each question/approval/restart workflow. Model cost remains unpriced/incomplete, and
shared-key aggregate budget readings do not establish exact per-run cost.

The initial cloud browser attempt failed before server bootstrap because the
disposable controller lacked the compiled plugin SDK. It produced zero agent
runs, and its failed result and budget readings are retained. Setup now builds
the SDK and imports the server before model-credential handoff. Each live cell
has one attempt and no automatic retry. Secrets are passed only after verified
setup through a fresh job-bound encrypted exchange, without plaintext local
credential files. Private proof and campaign archives remain in the task's
restricted S3 evidence prefix with bounded retention; public source/docs contain
no credentials or raw provider traces.

The new explicit-only `hermes-api-connections` matrix declares ten API-account
completion cells with independently graded native account/model attribution.
Each permits one attempt and configures 200-cent company and agent budgets.
Public readback must verify both budgets and their scope before task creation;
unpriced usage stays unknown and does not become an exact billing receipt.
Authenticated OpenAI, Anthropic, xAI and Google catalog reads succeeded without
inference. Those discoveries and the new fixture calibration do not constitute
live provider qualification. The complete original release gates remain open:
the rest of the live controls, attachments, state/routines, credential lifecycle,
subscriptions/custom protocols/Bedrock and actual Daytona proof are still required.

The final API fixture support suite passed 1,833 Vitest tests (one skipped) and
all 128 companion Node assertions. Product E2E TypeScript and `git diff --check`
passed. The five verified encrypted cloud proofs are preserved; the disposable
EC2 instance was terminated and its unused role, instance profile and security
group removed. No local Docker was used. These fixture refinements require
fresh current-head CI and review; they do not complete release qualification.

Fresh review found that the paid workflow did not supply the new Google cells'
required Gemini key. The key is now mapped only when the selected matrix cell
requires it, and the workflow credential-boundary regression covers it. All 15
workflow tests and actionlint pass. Another current-head review and CI run are
required after this correction.

### Managed API account qualification, 2026-10-07

The Google credential mapping subsequently passed all 54 current-head CI checks
(two intentional skips) and fresh Greptile 5/5, with no open threads, at
`ffd6bbc1ebb10c1c8ef0db875bb88d733f64649d`. The following paid account cases
use that controller source and the previously verified image source
`8e31afda4ff3b4c0415bc26f8bb35cec17437741`. Independent tracked-source
comparison proves their production runtime and dependency sources identical;
the changes are qualification fixtures, documentation, workflow credential
mapping, and the image's explicit candidate selection. The runtime-source
fingerprint is `9d9e39d5390de779c619004ebbce55cc57d2c1aeefead36099903d7db1d3e26a`.

| Managed API account | Exact model | Campaign suffix | Result | Duration |
| --- | --- | --- | --- | --- |
| Anthropic | `claude-haiku-4-5-20251001` | `2d55c9944d84` | Passed | 53.780 s |
| OpenAI | `gpt-5.6-luna` | `4953bfa797ea` | Passed | 58.760 s |
| xAI | `grok-4.7` | `83fd6210c933` | Passed | 69.960 s |
| Google | `gemini-2.5-flash` | `ea98e1dd517f` | Failed | 52.511 s |

Each passing case independently verifies six public native-run account/model
checks, both scoped 200-cent budgets before task creation, one successful native
run, one final answer, and cleanup. Each has a reviewed final browser screenshot.
All run on the compatible EC2 Linux amd64 host with catalog environment `local`;
they do not qualify macOS or Daytona. Token receipts are available, but monetary
cost remains unpriced. The final screenshots show the existing budget policy
pausing the test agents after unpriced usage; reported zeros are not free runs.

xAI delivered 41 reasoning deltas and 22 assistant-text deltas before its native
terminal event. Its final screenshot renders a thought card above the answer.
These facts prove event delivery and final rendering, not incremental browser
render timing while the run is active. Raw reasoning is not published.

Google's authenticated catalog listed Gemini 2.5 Flash, but inference returned
404 because the account had not previously used that model. Google's
[access notice](https://ai.google.dev/gemini-api/docs/deprecations) confirms the
restriction. The failed browser attempt, provider error, missing usage, and
successful cleanup remain retained. Hermes made its native HTTP retry attempts
inside that single controller turn; the campaign did not dispatch a new paid
attempt. The fixture now selects `gemini-3.8-flash`, whose authenticated metadata
supports `generateContent`. That metadata is not a live qualification pass.
The model correction passed all 94 affected tests and Product E2E TypeScript;
it requires a new live attempt, fresh CI, and review.

Private proof and campaign archives remain encrypted in the task's restricted
S3 prefix. Credentials are supplied only through a fresh verified job-bound
encrypted handoff. Obsolete encrypted key transfers are removed after evidence
collection. No local Docker is used. Subscription/credential lifecycle, custom
protocols, Bedrock, the remaining interactions/state/routines, final macOS
campaign, clean distribution, and actual Daytona gates remain open. Hermes
continues to be pending qualification.

### API completion results and question-limit correction, 2026-10-07

The remaining API completion cases passed on the same verified AWS Linux image:

| Managed API account | Exact model | Controller source | Campaign suffix | Duration |
| --- | --- | --- | --- | --- |
| OpenRouter | `deepseek/deepseek-v4-flash-0731` | `ffd6bbc1ebb10c1c8ef0db875bb88d733f64649d` | `b530ea3f1d95` | 62.134 s |
| Google | `gemini-3.8-flash` | `f0dca1e1815f767a55e644d2eecc4cc91a166519` | `b819f9665567` | 60.466 s |

Both satisfy the same six native account/model checks, two pre-turn budget checks,
one successful native run, final-answer and cleanup assertions. Their final browser
screenshots were reviewed. Google's earlier 2.5 failure remains retained as a
separate provider/model attempt. All five selected API providers therefore have
completion evidence at those recorded sources; this does not establish the broader
release gates. The private campaign archives remain encrypted and the disposable
host was terminated. Its unused role, instance profile and security group were
removed. The qualification ledger reserves $17 of the authorized $25 cap, including
both Google attempts; reservations do not establish actual spend.

At `f0dca1e1815f767a55e644d2eecc4cc91a166519`, all 54 checks passed with two
intentional skips and fresh Greptile 5/5. A subsequent native-PR review identified
a question-limit mismatch: the canonical form accepted answers exceeding the
bridge's 65,536-character bound. Native commit
`de39c85a7` publishes the bound for text and custom answers and counts UTF-16 code
units consistently with canonical validation. All 21 pinned Python bridge tests,
11 affected TypeScript tests, runner TypeScript and diff checks passed. Boundary
coverage includes overlong answers and astral Unicode in all three answer modes.

The corrected bridge changes the verified runtime bytes. Fresh pinned macOS
provisioning verified closure
`690b3b84a543b04a47a6859969bd613ced61d68776d80b57c85ca424bde31829`.
The Linux closure pin is
`6166fadd24dae41b9fdfd994e6c7bc129e9317ed252b7dabdd777b691ab47771`,
derived by independently verifying every original pinned file and changing only
`bridge.py`. Fresh Linux provisioning/CI and the updated cloud image still require
verification. The earlier image digest and live results retain their original
sources and closure; they are not results for the corrected runtime. The stacked
qualification commits were replayed without changing their patches. Both updated
PR heads require fresh checks and review. Hermes remains pending qualification.

The subsequent qualification review found an independent-user evidence gap:
the original responsible-user check compared two run fields with each other.
That permits a consistent foreign user to pass. New fixture admission reads the
selected account and authenticated caller through the public Connections API
before creating a paid task, verifies company/account/provider/method/ownership
and connected status, and retains the expected owner. Both run fields must equal
that owner; missing, duplicate, foreign-owner and consistent-wrong-run-user cases
are calibrated as failures. The historical API results keep their original
grader provenance; they do not acquire this pre-turn owner receipt retroactively.
An additional assessment of the retained public task records independently
checks the immutable task creator, task responsible user and both run attribution
fields. All five successful API cases pass that comparison with zero provider
calls. This retained-task assessment remains separate from the new fixture's
pre-turn account-owner admission. The correction passed all 106 affected tests,
Product E2E TypeScript and diff checks.

The fresh Linux native CI attempt at the replayed head failed before provisioning
because GitHub returned HTTP 429 for the pinned source archive. No native fixture
or provider execution occurred. This is retained as a download infrastructure
failure; it is not evidence of a closure mismatch. The separate credential-free
AWS build continues against its recorded immutable source.

### Corrected cloud image and Bedrock fixture preparation, 2026-10-07

The corrected credential-free AWS build completed successfully in 11.73 minutes
at source `d389750b90787ea5240d0f8f4e92396a1d9d20a1`. Its immutable image digest is
`sha256:5f457b7aed4dc224c77125edb7b17fd1aedc9e7bad0a9ce92d454cecc660e767`.
The independent collected proof verifies fresh Linux closure
`6166fadd24dae41b9fdfd994e6c7bc129e9317ed252b7dabdd777b691ab47771`
and the original frozen dependency-lock SHA
`f5ee14ee77b1dc7771fe455d619c880fc64b1e62e40a15704addc9f7430e5c50`.
No provider credentials or local Docker were used. This proves the corrected
Linux distribution; it does not prove execution-host namespace compatibility,
browser behavior or Daytona. The ledger reserves $19 of the $25 cap after the
additional $2 cloud-build reservation; actual billing remains incomplete.

The new explicit-only `hermes-bedrock-connections` suite registers two pending
completion cells on local and Daytona. Read-only AWS discovery confirmed the
exact `us.anthropic.claude-haiku-4-5-20251001-v1:0` inference profile is active
in `us-east-1`. The fixture uses an ephemeral region-bound bearer, a public
personal Connections account and its explicitly selected grant. It verifies
the public account's owner, grant, region, protocol, authentication and model
catalog before task creation and after completion, and grades the actual native
run's selected account, grant and exact inference profile. The server inherits
no ambient AWS environment settings. It retains the existing 200-cent company
and agent budget admission and one-attempt policy. All 129 affected fixture and
catalog tests, Product E2E TypeScript, two-cell discovery and diff checks passed.
No Bedrock inference, credential refresh or Daytona execution is claimed from
this fixture preparation. Hermes remains pending qualification.
