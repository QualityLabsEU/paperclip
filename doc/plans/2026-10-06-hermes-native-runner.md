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
- [ ] Complete the final local aggregate test invocation and release qualification.

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
  (five local, five Daytona) are registered. Four local cases have passing paid
  attempts; the complete release matrix has not passed.

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
