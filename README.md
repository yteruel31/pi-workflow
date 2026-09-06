# Pi Workflow

A small, Pi-only development workflow for moving from an idea to autonomously implemented, reviewed commits without mandatory documents or heavy orchestration.

## Install

Install the required `pi-toolbox` provider first, then the public workflow package:

```bash
pi install git:github.com/yteruel31/pi-toolbox
pi install git:github.com/yteruel31/pi-workflow
```

`pi-toolbox` v1.16.0 or newer supplies `subagent_agents`, `subagent_spawn`, and `subagent_wait`, discovers the packaged profiles, and enforces their `tools` frontmatter allowlists. Merge or install that provider release before this workflow change. Both packages are required for delegated workflow skills. The provider must expose each profile's `tools` array in `subagent_agents`; run `pi update --extensions` if an unpinned installation lacks that metadata.

Restart Pi so it discovers the tools, agents, and skills. Update installed Git packages with:

```bash
pi update --extensions
```

For reproducible installs, append an existing tag or commit to the source (a tag must already be published), for example:

```bash
pi install git:github.com/yteruel31/pi-workflow@v0.2.0
pi install git:github.com/yteruel31/pi-workflow@<commit>
```

## Skills

Use a skill naturally (for example, “brainstorm this feature with yt-brainstorm”) or invoke its Pi command directly:

| Skill | Pi command | Natural-language use |
|---|---|---|
| `yt-brainstorm` | `/skill:yt-brainstorm` | Clarify a product idea, compare meaningful options, and optionally capture a concise PRD. |
| `yt-dispatch` | `/skill:yt-dispatch` | Dispatch independent work into separate, visible Herdr Pi sessions. |
| `yt-plan` | `/skill:yt-plan` | Turn a direct request, optional PRD, or existing plan into ordered implementation units. |
| `yt-work` | `/skill:yt-work` | Implement a request or plan as dependency-ready, validated, committed units. |
| `yt-review` | `/skill:yt-review` | Review a patch, PR, branch, ref, or working tree and return one prioritized report. |
| `yt-test-browser` | `/skill:yt-test-browser` | Run a scenario or bounded exploratory browser smoke test against an already reachable web application. |

Every skill, including `yt-dispatch` and `yt-test-browser`, is independently usable from a direct request. PRDs and plans are optional context, not workflow gates. Brainstorm and plan keep their result in the current session by default and create or update an artifact only after explicit approval.

`yt-brainstorm` has one narrow confirmed handoff: its final confirmation explicitly warns that approval validates prerequisites, creates a dedicated Orca workspace, and launches a normal interactive Pi session into the installed `yt-plan` skill with the complete synthesis. It launches only after explicit consent; a refusal is respected, and synthesis-only or PRD approval does not override one. Optional PRD persistence never delays an approved handoff. All other suggestions remain optional: plan may suggest dispatch only for multiple immediately independent units, otherwise it suggests `yt-work`, and no other skill starts the next command automatically.

## Bounded delegation

With the required `pi-toolbox` provider, the skills use packaged named profiles and collect their background results with `subagent_wait`:

- **Brainstorm:** optionally use at most one `repo-researcher` and one local-only `learnings-researcher` when their evidence would materially improve product framing.
- **Plan evidence:** optionally use the same two research profiles. External documentation research remains a parent-session responsibility.
- **Plan review:** always use `plan-reviewer`, with adaptive `scope-guardian`, `feasibility-reviewer`, and `security-reviewer` profiles selected by semantic risk, never exceeding four concurrent runs.
- **Work:** build a dependency graph and use one fresh `unit-implementer` for each initial unit attempt. Dependency-ready units with disjoint exact file ownership may run concurrently only in separate parent-created detached temporary worktrees at one committed batch-base `HEAD`: spawn the whole batch, wait once for all run IDs, and prohibit parent mutation while any member is active. Overlapping or uncertain paths stay sequential. If safe isolation or decisive isolated validation is unavailable, the unit falls back to sequential execution in the primary worktree rather than hard-blocking. After every member settles and passing units validate in isolation, the parent materializes each complete owned-path result—including tracked edits/deletions, binaries, and owned untracked files—into an uncontaminated primary tree and creates one atomic commit for each passing unit in deterministic order; plain `git diff` must not omit untracked content, and later peer diffs remain isolated. Independent bounded corrections use a fresh implementer in the same unit worktree while they make measurable progress; a failed unit blocks only its dependents. Bounded packets define scope; unsupported timeout, turn-budget, and tool-budget parameters are never invented.
- **Review:** spawn exactly one packaged `code-reviewer`, wait exactly once, and synthesize exactly one report in one bounded pass across intent conformity, correctness, regressions, security-sensitive concerns, tests, and maintainability. Never run a second review after fixes or loop until clean.

The nine research/review profiles are technically restricted to `read`, `grep`, `find`, and `ls` through their frontmatter. Before every spawn, skills require the selected catalog entry to come from package `pi-workflow` and to expose the exact expected tools; user/project overrides and incompatible provider versions are rejected. `unit-implementer` receives mutation tools but may never stage, commit, push, or mutate Git metadata. If the provider tools or a required profile is unavailable, the dependent skill stops with a prerequisite or discovery error instead of silently substituting a generic role or inline implementation. `yt-dispatch` remains separate from `pi-toolbox` delegation and has no hidden or inline fallback.

## Confirmed brainstorm-to-plan handoff

The brainstorm handoff requires separately installed Orca, Git, and Pi; they are external prerequisites, not package dependencies. It resolves the intended repository to its canonical absolute Git identity rather than trusting UI selection, inspects staged, unstaged, and untracked source status without copying dirty changes, checks Orca's configured default base and existing worktrees plus Git branch/path collisions, and uses a safe unique slug. Unless the user explicitly requests a guide-supported base or stacked relationship, current-ref context is informational and the new independent workspace starts from the repository default base.

Before creation, the skill resolves the correct Orca executable (including `ORCA_CLI_COMMAND`, and `orca-ide` rather than GNOME `orca` on Linux outside managed terminals), loads its live guide, checks/opens Orca, and verifies that the target normal Pi can discover an installed `yt-plan`. Verification is read-only: it does not install or reconfigure anything, and it evaluates discovery and Pi settings for the selected destination base or parent rather than assuming source-cwd settings apply. It uses `/skill:yt-plan <complete-brief>` when skill commands are enabled, or an explicit instruction to load the verified installed skill when supported; it never relies on an uncommitted source file. The complete prompt includes request, synthesis, product decisions and boundaries, criteria, questions, evidence, source cwd/ref/commit, and a separate destination section with the actual configured default or explicitly authorized base/parent plus resolved destination ref/commit. Artifact context is included inline, with provenance and source-only availability labeled.

Creation is one agent-first `worktree create --repo path:<absolute-repo> --name <slug> <default-no-parent-or-authorized-selection> --agent pi --prompt <literal-brief> --setup skip --json` operation. The brief is one literal argument, never interpolated as shell code, and excludes dirty changes, secrets, credentials, and auto-commit context. No second terminal or prompt send follows. The source session reports the workspace id/path, startup terminal handle when known, and launch evidence, then stops without waiting, polling, collecting output, planning inline, implementing, invoking `yt-work`, or claiming the plan finished. Partial resources are preserved and reported without blind retries or duplicate sends; bounded read-only listing is allowed only to resolve an ambiguous create result. Git filters/configuration and configured terminal commands remain trusted prerequisites, and `--setup skip` does not promise zero external effects.

## Visible dispatch

`yt-dispatch` maps only immediately independent units to distinct, visible Herdr tabs, with a maximum of five per invocation. It shows the complete routing map and asks for one global confirmation before creating anything. Read-only units use the current project cwd with writes forbidden in the prompt and Pi's built-in tools restricted to `read,grep,find,ls`; project/runtime credentials and unobservable external model behavior remain trust boundaries. Implementation units require Git and receive separate branches and worktrees outside repository and registered-worktree roots, with symlinked parents rejected and checkout hooks disabled. Checkout filters and other repository Git configuration remain trusted prerequisites. A dirty source checkout is allowed but warned about because staged, unstaged, and untracked changes are not copied into worktrees created from `HEAD`.

After confirmation, independent Pi sessions auto-start with no focus. The originating session is dispatcher-only: it returns the tab/session mapping and does not monitor, collect, merge, or clean up their work. On the first partial failure it stops launching later units and preserves every tab, branch, and worktree already created. There is no automatic fallback.

Dispatch requires external commands `herdr`, `pi`, and `python3`; implementation dispatch additionally requires `git`. These tools are prerequisites, not package dependencies.

## Standalone browser validation

`yt-test-browser` is a standalone, report-only skill for UI flows, smoke testing, exploratory QA, and regression validation. It requires a reachable URL and never launches an application server or substitutes source inspection for browser testing. A supplied scenario takes priority; otherwise it performs a bounded smoke test of principal visible flows without claiming exhaustive coverage. Necessary application actions may change application data unless the user restricts them, and the report records observable side effects.

The skill requires the external Vercel `agent-browser` CLI, which is not a package dependency. Install it separately with `npm install -g agent-browser` followed by `agent-browser install`; the skill checks the direct binary and never auto-installs it or falls back to `npx`. Authentication may use only a user-prepared, explicitly identified session or profile; the skill never handles credentials, cookies, or tokens. Evidence is retained only in a private temporary directory outside the repository, and the session report includes findings, reproduction evidence, console/page errors, coverage gaps, and report-only confirmation. It never invokes or automatically suggests another workflow skill.

## Safety behavior

`yt-work` requires a Git repository and performs a Git preflight before editing. It records existing changes, refuses to proceed with pre-existing staged changes, and blocks ambiguous overlap with foreign work. The parent autonomously answers routine implementer escalations and corrects failed, partial, mismatched, or out-of-scope attempts while measurable progress continues. It may run dependency-ready units concurrently only with pairwise-disjoint exact file ownership and one detached worktree per child under a mode-700 temporary directory outside the repository; checkout hooks are disabled, while filters and repository Git configuration remain trusted prerequisites. Parent snapshots cover every isolated tree and shared metadata. Checks run in isolation, and generated paths outside ownership violate the contract. The parent remains idle during active batches, validates all passing units in isolation, then serially checks and mechanically applies one owned-path patch at a time before staging, integration checks, hooks, and deterministic atomic commits. Safe-isolation failures fall back to sequential primary-tree execution. After the parent proves that the commit reproduces the complete isolated result with no unexpected paths, it may force-remove only that private parent-created worktree despite its now-integrated unit-owned diff. Unintegrated, failed, blocked, foreign, ambiguous, or unexpectedly dirty worktrees are never discarded; failed or blocked dirty worktrees are retained and reported as evidence. Children never stage, commit, push, mutate Git metadata, or manage worktrees. A failure blocks only dependent units, so unrelated ready work can continue. User contact is reserved for unsafe or irreversible actions, credentials or permissions, unresolved product decisions, staged or overlapping foreign work, unavailable prerequisites, and no-progress correction cycles. The skill never rewrites foreign or unauthorized Git state and does not push or open a pull request automatically.

`yt-review` is report-only: a single-pass, single-`code-reviewer` skill. It compares observable local repository state before and after the reviewer and, when safe read APIs are available, re-queries live remote refs and target-specific PR metadata on a best-effort basis. It prohibits local or remote mutation, never applies an autofix, and stops with a contract-violation report when compared evidence changes. Remote-only mutation that available tools cannot observe and configured role overrides remain trust boundaries; the report marks remote state unverified instead of claiming enforcement when evidence is unavailable.

## Development

Node.js is needed only to run the dependency-free contract tests; the installed Pi package has no runtime dependencies.

```bash
npm test
npm pack --dry-run
```

Repository layout:

```text
agents/
  code-reviewer.md
  code-security-reviewer.md
  feasibility-reviewer.md
  implementation-conformity-reviewer.md
  learnings-researcher.md  # local repository evidence only
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
  yt-work/SKILL.md
  yt-review/SKILL.md
  yt-test-browser/SKILL.md
test/skills.test.js
docs/plans/
docs/validation/
package.json
```

The package exposes skills through `pi.skills: ["./skills"]` and all ten dedicated profiles through `pi.subagents.agents: ["./agents"]`. It ships no commands, extensions, converters, or cross-harness compatibility layer. Agent discovery and execution require the separately installed `pi-toolbox`; `pi-workflow` itself retains no npm runtime dependencies.

Licensed under the [MIT License](LICENSE).
