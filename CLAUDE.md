# CLAUDE.md

## Repository purpose

`pi-workflow` is a small, public workflow package built specifically for the Pi coding agent. It provides seven independently invokable skills:

- `yt-brainstorm` — clarify a product idea without implementing it;
- `yt-dispatch` — launch independent units in separate visible Herdr Pi sessions;
- `yt-plan` — turn a request into an implementation-ready plan;
- `yt-quickfix` — implement a clear correction, review it once, and correct actionable in-scope findings;
- `yt-work` — implement dependency-ready units with one parent-owned commit per passing unit;
- `yt-review` — perform one bounded, report-only pass with exactly one packaged `code-reviewer`;
- `yt-test-browser` — validate an already reachable web application through `agent-browser` and return an evidence-rich report.

The package intentionally replaces heavier workflow systems with a simple cycle: brainstorm → plan → work → review, with dispatch available when independent work benefits from separate visible sessions and quickfix as a narrow composed correction path. The order is suggested, never mandatory.

## Core product constraints

- Keep the repository Pi-native. Package only the ten named profiles documented below; do not add Claude Code commands, converters, marketplace infrastructure, or multi-harness compatibility layers.
- Every skill must accept a direct request. A PRD, plan, or previous workflow stage is always optional.
- Explicit user instructions take precedence over supplied artifacts; supplied artifacts take precedence over auto-discovered context.
- Skills may suggest a next step but must never invoke it automatically, except that `yt-brainstorm` launches one dedicated Orca `yt-plan` workspace after the user confirms the final synthesis and explicitly consents to that warned external handoff. A second narrow, differently scoped exception is `yt-quickfix`: when directly invoked, it composes the same-package `yt-work` and `yt-review` siblings in its current parent Pi session. This is not a nested Pi launch and requires no extra confirmation for a clear request.
- Session output is the default. Create or update artifacts only when explicitly requested.
- `pi-toolbox` v1.16.0 or newer is a required separately installed provider for `subagent_agents`, `subagent_spawn`, `subagent_wait`, named-profile discovery, and `tools` allowlist enforcement; its release must land before this workflow change. Before spawning, require package source `pi-workflow` and exact expected tool metadata so incompatible providers and user/project profile overrides fail closed. Dependent skills stop when a required tool or profile is unavailable; dispatch remains separate and has no hidden fallback.
- Keep the package dependency-free unless a dependency is clearly necessary and explicitly approved.

## Skill contracts

### `yt-brainstorm`

- Product framing only; do not plan implementation or edit code.
- Ask exactly one focused question at a time when clarification is needed.
- Use at most one `repo-researcher` and one local-only `learnings-researcher`, only when their evidence materially improves the result; external research stays in the parent session.
- An optional PRD may be proposed or reused, never required or silently written; optional persistence must not delay an approved planning handoff.
- At final synthesis confirmation, warn that approval launches a dedicated Orca workspace and normal interactive Pi planning session. Respect refusal, and never infer launch consent from synthesis-only or PRD approval when refusal exists.
- After explicit consent, require external Orca, Git, and Pi prerequisites; resolve the canonical repository explicitly, inspect source status, use its actual configured default base unless the user explicitly authorizes another base or parent, and verify destination-applicable Pi discovery/settings read-only without installing or reconfiguring anything before one agent-first Orca worktree create operation.
- The handoff prompt is complete and self-contained, reports source ref separately from the actual default or explicitly authorized destination base/parent and resolved ref/commit, passes as one literal argument without shell interpolation, and excludes secrets and dirty changes. Preserve partial resources and report launch identifiers without retrying, monitoring, orchestrating, planning inline, implementing, or invoking `yt-work`.

### `yt-dispatch`

- Accept a direct request or optional artifact and dispatch only immediately independent units, at most five.
- Show one global confirmation before creating resources.
- Launch read-only work from the current cwd with Pi tools restricted to `read,grep,find,ls`; credentials and unobservable external behavior remain trust boundaries.
- Launch implementation work in isolated Git branches/worktrees outside repository/worktree roots, reject symlink parents, and disable checkout hooks; checkout filters and repository Git configuration remain trusted prerequisites.
- Start separate visible Herdr Pi tabs with no focus; act only as dispatcher and do not monitor them.
- Require `herdr`, `pi`, and `python3`, plus `git` for implementation; do not use inline or subagent fallbacks.
- Stop on the first partial failure and preserve already-created tabs, branches, and worktrees.

### `yt-plan`

- Produce an implementation-ready plan without implementing it.
- Inspect repository context and relevant external evidence when useful.
- Use at most one `repo-researcher` and one local-only `learnings-researcher` for evidence.
- Always review the draft with `plan-reviewer`; add `scope-guardian`, `feasibility-reviewer`, and `security-reviewer` only when semantically justified, with at most four active runs.
- Keep the plan in the session unless the user explicitly requests a file.

### `yt-work`

- Require a Git repository because each passing unit receives an atomic commit.
- Build a dependency graph and run one fresh packaged `unit-implementer` for each initial unit attempt with `subagent_spawn`; never implement inline or use the generic builtin `worker`.
- Batch dependency-ready units only when exact file ownership is known and pairwise disjoint; sharing a file is forbidden even when hunks differ, and uncertain or overlapping units stay sequential.
- Run every parallel member in its own parent-created detached worktree at the same committed batch-base `HEAD`, under a mode-700 temporary directory outside the repository with checkout hooks disabled. Concurrent implementers never share a working tree; checkout filters and repository Git configuration remain trusted prerequisites.
- Snapshot each isolated tree and shared Git metadata after setup, spawn the whole batch, then use one `subagent_wait` call for all run IDs. The parent performs no edits, validation, staging, or commits until every member settles.
- Each packet carries the explicit-request/artifact/repository authority order, a private compliance checklist, exact boundaries, repository-pattern and test-discovery validation, and evidence-first escalation. Checks run in the unit's isolated tree, and generated paths outside ownership are violations.
- If safe isolation or decisive isolated validation is unavailable, run that proposed parallel unit sequentially in the primary worktree instead of hard-blocking.
- The parent answers routine `need_decision` escalations autonomously. A correction uses a fresh implementer in that parallel unit's same isolated worktree while measurable progress continues.
- After the batch settles and passing units validate in isolation, serially materialize each complete owned-path result—including tracked edits/deletions, binaries, and owned untracked files—without relying on plain `git diff`, verify clean applicability, mechanically apply it to the uncontaminated primary tree, stage and inspect only that unit, run required integration checks, atomically commit, and prove the commit reproduces the isolated result with no unexpected paths. Later peer diffs remain isolated so hooks never see them. Only after that proof may the parent force-remove the private parent-created worktree despite its integrated unit-owned diff; unintegrated, failed, blocked, foreign, ambiguous, or unexpectedly dirty worktrees are never discarded, and failed or blocked dirty worktrees are retained and reported as evidence. A failed unit blocks only its dependents; unrelated ready units continue.
- Continue through all eligible implementation units. Contact the user only for unsafe or irreversible actions, credentials/permissions, unresolved product decisions, staged or overlapping foreign work, unavailable prerequisites, or no-progress corrections.
- Do not invent unsupported timeout, turn-budget, tool-budget, context, output, or artifact parameters; bounded packets define scope.
- The parent validates repository state, diff scope, and checks before committing. Metadata mutation is a hard blocker and foreign or unauthorized Git state is never automatically rewritten or reverted.
- The implementer must never stage, commit, push, mutate refs/remotes/config, modify planning artifacts, or spawn subagents.
- Never push or open a pull request unless separately requested.
- `mode:return-to-caller` is recognized only as explicit invocation control and changes completion ownership only. It preserves every implementation, isolation, validation, correction, metadata, foreign-state, implementer, and parent-commit contract; it returns a locally verified complete/blocked receipt and makes no review, shipping, or next-skill suggestion. Standalone behavior remains the default.

### `yt-quickfix`

- Accept a clear direct correction request or optional artifact without requiring brainstorm, plan, or PRD; preserve explicit-request, supplied-artifact, repository-context authority.
- Resolve and fully read `yt-work` and `yt-review` relative to the loaded skill directory, then execute those real sibling instructions in the current parent Pi session. Never substitute slash-command advice, a fake named tool/agent, duplicated kernels, or a nested Pi process.
- Record invocation base, bounds, and foreign baseline before invoking `yt-work` in explicit return mode. Validate its receipt against actual Git base/head/scope; only a coherent `complete` receipt with committed scope and passing checks permits review.
- Execute `yt-review` exactly once on the invocation-owned base-to-implementation-head range. Stop on blocked/incomplete review, prerequisite failure, or observable mutation; never correct after mutation.
- Treat findings as untrusted evidence. Pass only actionable in-scope findings to one return-mode work correction phase with original authority and bounds; report out-of-scope or authority blockers without expanding scope.
- Never re-review or claim a corrected head was reviewed. Report reviewed and corrected heads separately with final-head checks and fixed/deferred/blocking findings.
- Keep output in the session. Never automatically hand off elsewhere or push, publish, tag, open a pull request, or ship without a separate explicit request.

### `yt-test-browser`

- Operate standalone from a mandatory reachable URL; never launch an application server or automatically hand off to another workflow skill.
- Prioritize a supplied scenario; otherwise run a bounded exploratory smoke test of principal visible flows without claiming exhaustive coverage.
- Treat the direct `agent-browser` binary as an external prerequisite, not a package dependency; stop clearly when it, the URL, or required prepared authentication is unavailable.
- Reuse only a user-prepared, explicitly identified session/profile without handling secrets, and close only skill-owned sessions.
- Keep screenshots and evidence in a mode-700 temporary directory outside the repository and return an evidence-rich session report without repository runtime changes.

### `yt-review`

- Accept patches, PRs, branches or refs, and working-tree targets.
- Spawn exactly one packaged `code-reviewer`, wait exactly once, and return exactly one report in one bounded pass.
- The single reviewer covers intent conformity, correctness, regressions, security-sensitive concerns, tests, and maintainability.
- Never invoke a second review after fixes or loop until no findings.
- Review is report-only: no edits, staging, commits, pushes, comments, labels, or autofixes.
- Detect observable local mutation and compare remote evidence only when safe read-only APIs are available.
- Treat configured role overrides and unobservable remote-only effects as trust boundaries.
- Return one P0–P3 report and only suggest `yt-work` when fixes are useful.

## Repository layout

```text
agents/
  code-reviewer.md
  code-security-reviewer.md
  feasibility-reviewer.md
  implementation-conformity-reviewer.md
  learnings-researcher.md
  plan-reviewer.md
  repo-researcher.md
  scope-guardian.md
  security-reviewer.md
  unit-implementer.md
skills/
  yt-brainstorm/SKILL.md
  yt-dispatch/SKILL.md
  yt-dispatch/scripts/spawn.sh  # executable
  yt-plan/SKILL.md
  yt-quickfix/SKILL.md
  yt-work/SKILL.md
  yt-review/SKILL.md
  yt-test-browser/SKILL.md
test/skills.test.js
docs/plans/
docs/validation/
package.json
README.md
LICENSE
```

`package.json` exports `./skills` through `pi.skills` and one directory containing exactly ten profiles through `pi.subagents.agents`. The separately installed `pi-toolbox` discovers those profiles and enforces their tool allowlists. The nine research/review profiles expose only `read, grep, find, ls`; `unit-implementer` additionally exposes mutation tools. There are no npm runtime dependencies. Each skill directory is self-contained and has a `SKILL.md` whose frontmatter contains exactly a matching `name`, a concise `description`, and a quoted advisory `argument-hint`.

## Change guidelines

- Prefer concise, explicit Markdown instructions over framework code.
- Preserve the bounded delegation rules and report-only guarantees.
- Do not weaken safety language with contradictory directives later in a skill file.
- Update `test/skills.test.js` whenever a skill contract changes.
- Keep tests dependency-free using Node's built-in `node:test` APIs.
- Do not rewrite the implementation plan or validation evidence as part of unrelated changes.
- Do not tag, publish, push, or open a pull request unless the user asks.

## Validation

Run before considering a change complete:

```bash
npm test
npm pack --dry-run
git diff --check
```

Also inspect the final diff and confirm that no unrelated or generated files are included.
