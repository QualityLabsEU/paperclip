# Runner defaults: staged delivery

Updated 2026-10-08.

## Outcome and ownership

Users choose a harness. New agents use Paperclip Runner where the harness and
execution target are qualified. Existing agents keep their recorded runner.
The task owns implementation, verification, review fixes, and reviewable PRs.
Merging and deployment require separate authorization.

The original implementation is preserved on `codex/default-agent-runner` at
`171d841295808ca185a258aaeb10b3dee68bb2b9`. Its public review is
[PR #15422](https://github.com/paperclipai/paperclip/pull/15422).
The user approved splitting that work into four useful steps:

1. Packaged runtime reliability and Codex prerequisites, without changing defaults.
2. Codex defaults across creation, onboarding, hiring, imports, and the UI.
3. Claude defaults and authentication.
4. The remaining supported harness defaults and provider-specific fixes.

## Current slice

Canonical branch: `codex/runner-packaging-prerequisites`.
Base: `71cd0a2621615182274a977d6cc969b9ab920b92`.
Canonical PR: [#15555](https://github.com/paperclipai/paperclip/pull/15555).
Its [checks](https://github.com/paperclipai/paperclip/pull/15555/checks) and
[commits](https://github.com/paperclipai/paperclip/pull/15555/commits) record the
tested candidate. Hosted results and final review disposition are recorded in
the PR description; local receipts alone do not close those gates.

This slice fixes the installed dependency graph, Codex executable resolution,
isolated browser login, Git install staging, and the release asset transfer needed
for Linux and macOS packages. It reuses the existing install sandbox, release
verification workflow, tests, and runner binary assembler.

It does not change agent defaults, the harness picker, provider qualification,
database schema, experimental feature policy, or existing agent configuration.
The large execution and setup changes stay in the later slices.

### Codex distribution correction, 2026-10-08

The user requested removal of pre-bundled Codex binaries from this PR.
Retain the pinned Codex JavaScript graph and let npm install the exact official
platform dependency for the consumer's host. Strip producer-host binaries from
the prepared package as well as the added cross-platform payloads. Docker images
still preinstall their own qualified runtime dependencies. Paperclip's own
runner release assets remain in scope.

Actual npm install testing exposed a collision with the unchanged legacy Codex
adapter. Move platform dependency declarations from the bundled wrapper metadata
to the published server manifest, preserving the wrapper code and patched bridge.
The existing installer checks must prove both native and legacy version selection,
and the runtime must still verify the selected executable's version and digest.
Direct/source runtimes retain their own dependency declarations. A CI credential
test fixture also reserves its ports before making its unchanged denial assertion.

Reopen packaging and installed-consumer verification for this correction.
The green checks at `36d9eb0c3c6b9ca5234432b97349dc7317cfa916` are historical;
they do not verify the changed dependency distribution. Reuse the existing
packaging tests and public npm consumer sandbox to prove an empty Codex binary
payload in Paperclip tarballs, host-only npm resolution, pinned execution, and
unchanged integrity checks. Record the final revision and hosted results in the
canonical PR description before handoff.

## Evidence and gates

| Gate | Status | Evidence |
| --- | --- | --- |
| Preserve original implementation | Passed | Original branch and commit above |
| Extract only first-slice behavior | Passed | 31 files; separate branch; independent packaging/release review |
| Installer and packaging tests | Passed | Existing installer suite: 26 tests; existing packaging suite: 24 tests |
| Login and transport controls | Passed | Login: 13/13; focused Codex/transport selection: 21 passed, 185 outside the focused filter |
| Release-transfer controls | Passed | Release workflow, transfer, and sandbox suites: 38/38; actionlint and Node/shell syntax checks passed |
| Token gates | Passed | All three commands in `check:token-gates` passed |
| Package and module contracts | Passed | Release package manifest and feature module boundary checks passed |
| Clean installed Codex version probe | Passed on initial candidate; final-head rerun required | Existing Linux npm consumer sandbox resolved and launched Codex 0.160.0, preserved consumer hooks, and made no provider calls |
| Initial hosted checks | 46 passed; one fixture timeout repaired | Candidate `6e5e20379449cfdfbd6ca5f6043492f91e698b62`; real issue-route bootstrap moved to a bounded suite hook, original agent denials unchanged, board control added; 3/3 local cases passed |
| Release review fixes | Local checks passed; hosted producer pending | Explicit status guards preserve release assembly with skipped lanes; static musl npm Linux daemon; 32/32 focused checks and original-source portability rejection control |
| Portable Linux producer | Hosted qualification | One bounded Linux-only dispatch of the existing release verifier; no local Rust/Docker build, providers, image build, or publication |
| Full checks and fresh review | Hosted qualification | Require green checks and fresh 5/5 review on the linked PR's final head |
| All-harness live onboarding and cloud qualification | Deferred | Owned by later slices; prior evidence does not prove this revision |

Heavy builds run in hosted CI. No local Docker or Rust build is planned.
No provider-backed runs or new disposable environments are needed for this
slice. The original $250 cost ceiling and cleanup obligations still apply.
Existing login credentials and running user previews must remain untouched.

The initial clean-install CI job checked out the candidate-equivalent merge tree
at `296097827eeb4005950134ec7f10ce4022706ef8`, then the normal release workflow
generated a lock-only producer commit at `3e1df4472b56f04ecb029008e47cd276afdb5c6d`.
The installed verifier reports that producer stamp. This is distinct from the
product source candidate; no lockfile is committed to this PR.

Focused test commands use Node 24 and a single worker: `node --test
--test-concurrency=1 scripts/acpx-patch-packaging.test.mjs` and, from `cli/`,
`node ../node_modules/vitest/vitest.mjs run src/__tests__/install-command.test.ts
--maxWorkers=1 --no-file-parallelism`. These tests include real offline npm pack
and installation controls; they do not claim a published release or provider task.

Next action: resolve the first PR's review and check failures on the final
candidate, then hand it off for human review. Start the Codex-default slice after
the user chooses to proceed. Merging and deployment remain outside this task.
