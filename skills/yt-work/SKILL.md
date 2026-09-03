---
name: yt-work
description: "Implement a request or plan autonomously as dependency-ready units with parent-owned atomic commits."
---

# YT Work

Implement approved scope as small, validated, committed units. A direct implementation request is sufficient; a missing PRD, plan, or previous workflow stage never blocks work.

## Inputs, authority, and autonomy

Use this authority order:

1. the user's current explicit request and corrections;
2. an artifact the user explicitly supplied;
3. relevant auto-discovered repository context.

An explicit PRD or plan guides only the parts that do not conflict with the current request. Auto-discovered context is evidence, not new scope. Never silently modify a PRD or plan; record implementation deviations in the completion report unless the user explicitly authorizes an artifact update.

Once execution starts, the parent owns routine implementation decisions. Resolve ordinary uncertainty, implementer `need_decision` escalations, plan mismatches, failed checks, partial work, and correction needs autonomously from the request, artifact, and repository evidence. Do not relay routine choices to the user. Defer user contact to PR preparation unless a hard blocker requires user action or authority: an unsafe or irreversible action, credentials or permissions, an unresolved product decision, pre-existing staged or overlapping foreign work, an unavailable prerequisite, or a correction cycle that makes no measurable progress.

## Git preflight

A Git repository is required because every completed unit receives an atomic commit. Before editing:

1. capture the current `HEAD` and branch;
2. capture staged paths, unstaged paths, and untracked paths separately;
3. retain that snapshot as the foreign-change baseline for every unit.

If any pre-existing staged change exists, stop and report the hard blocker for user resolution. Do not unstage, stash, commit, or otherwise alter it automatically; in particular, never rewrite or revert it.

Use the current meaningful feature branch. Creating commits on a default branch such as `main` or `master` requires explicit user authority; absence of that authority is a hard blocker. Never switch or create a branch silently.

Unrelated unstaged or untracked changes may remain only when disjoint from the current unit's files and hunks. If they overlap or ownership is ambiguous, block before staging or committing and require user resolution. Never rewrite or revert foreign work.

## Build the unit map

Use ordered plan U-IDs when available. Otherwise derive the smallest coherent unit map from the direct request, with a goal, allowed paths, approach, and decisive verification for each unit. Build an explicit dependency graph, preserve deterministic unit-map/dependency order, and identify execution-time unknowns. Keep the map in the session unless the user explicitly asks to update an artifact.

A unit is dependency-ready only when all of its dependencies have passed and been committed. Continue through every ready unit; an ordinary first-pass imperfection is not a reason to stop the workflow.

## Run bounded implementer batches

Inspect available profiles with `subagent_agents`. Require `unit-implementer` to report `source: "package"`, `package: "pi-workflow"`, and the exact tools `read, grep, find, ls, bash, edit, write, contact_supervisor`; a higher-precedence override, missing `tools` metadata, or any mismatch must stop before mutation as an unavailable-prerequisite hard blocker. Never select the generic builtin `worker` or implement inline.

For each unit, run one fresh packaged implementer for the initial attempt. The parent may batch multiple dependency-ready independent units only when their declared exact file ownership is known and pairwise disjoint. File ownership is the concurrency boundary: hunk-level separation within one file is insufficient, and units with overlapping or uncertain paths remain sequential. Each active child exclusively owns its packet's paths even though other children may concurrently own different paths.

Immediately before a sequential attempt or ready batch, capture one common Git metadata snapshot: expected `HEAD`, current branch, the complete staged/index state, all local refs, and redacted remote configuration or URLs. Never retain credentials. Spawn the whole eligible batch with one `subagent_spawn` call per unit, then make exactly one `subagent_wait` call containing all returned run IDs. For a sequential attempt, that batch has one run ID. The parent must not edit, validate, stage, commit, or perform other work while any batch member is active; wait until the entire batch settles.

Call `subagent_spawn` with `agent: "unit-implementer"`, a concise attempt name, the trusted repository as `working_dir`, and a complete bounded packet. Do not invent unsupported context, output, artifact, timeout, turn-budget, or tool-budget parameters; packet scope is the delivery boundary.

Each initial or correction packet must include:

- unit ID, attempt purpose, goal, requirements, dependencies, exact allowed paths, and mandatory artifact boundaries;
- authority order: current explicit packet and corrections, explicitly supplied artifact, then repository context;
- the relevant diff, check evidence, or diagnosed defect for a correction attempt;
- instructions to read repository guidance and turn every goal, path, artifact, scenario, and command into a private compliance checklist;
- repository-pattern and test-discovery validation before editing;
- focused scenarios, verification commands, foreign-change baseline, and ownership boundaries;
- instructions to choose the smallest reversible repository-consistent option for ordinary uncertainty, record it, and escalate with `contact_supervisor` and `reason: "need_decision"` only when evidence cannot safely resolve the issue.

The parent answers child `need_decision` escalations itself whenever the request, artifact, or repository evidence resolves them, records the answer, and lets the child continue. The parent normally decides without involving the user. It contacts the user only for a listed hard blocker.

Tell every child it is the exclusive writer for its exact attempt-owned files while active and identify any concurrent peer ownership. It may edit only those files and run focused checks, but must never stage, commit, push, mutate refs, remotes, or Git configuration, modify a PRD or plan, or spawn subagents. It reports exact paths, checks, baseline failures, blockers, deviations, and confirmation that nothing was staged, committed, or pushed.

Do not use chains, resume, review loops, or management actions. `pi-toolbox`, `subagent_agents`, `subagent_spawn`, `subagent_wait`, and the `unit-implementer` profile are required; unavailable prerequisites are hard blockers before mutation.

## Parent validation and correction

After the whole batch settles, process its units in deterministic unit-map/dependency order. For each attempt:

1. first compare `HEAD`, branch, the complete staged/index state, local refs, and redacted remote configuration exactly with the common pre-batch snapshot, accounting only for parent commits already made while processing earlier settled members;
2. treat any metadata delta as a hard contract blocker: do not rewrite history or state, revert it, retry, replace the implementer, stage, or commit;
3. inspect status and diff against the packet and foreign-change baseline;
4. confirm no unrelated, unexplained, out-of-scope, pre-existing, or foreign change was absorbed or modified;
5. run decisive focused checks and inspect their output;
6. verify every changed hunk has unambiguous unit ownership.

Configured role overrides and remote-only actions are a trust boundary; disclose what cannot be observed.

For failed checks, partial implementation, plan mismatch, or out-of-scope work that does not involve foreign or Git-metadata mutation, diagnose the concrete defect and launch a fresh bounded correction attempt. Corrections for multiple independent failed units may form another batch only under the same dependency-ready and disjoint exact-file rules. A correction packet must narrow the issue and preserve approved work; it must never authorize rewriting or reverting foreign changes or unauthorized Git state. Compare each attempt with the previous one using concrete evidence such as fewer failing assertions, a smaller scope delta, or newly passing checks. Continue bounded corrections while measurable progress occurs. If an attempt makes no measurable progress, block that unit and its dependents rather than looping.

A failed unit blocks only its transitive dependents. Preserve its uncommitted changes without absorbing them into another unit; unrelated dependency-ready units may continue when their ownership remains disjoint.

## Parent-owned atomic commit

For each passing settled unit, commit separately in deterministic unit-map/dependency order:

1. stage only that unit's owned paths or hunks, leaving every other batch member's diff unstaged;
2. inspect the complete staged diff and staged path list;
3. confirm the index contains no pre-existing or unrelated change;
4. create one conventional atomic commit reflecting the unit goal;
5. inspect the resulting commit and verify it contains only that unit's changes;
6. compare the remaining working tree with the foreign-change baseline and expected uncommitted batch diffs before processing the next unit.

Never let a child create the commit. Never push or open a pull request unless the user separately requests it.

## Completion

After all units pass, summarize unit-to-commit mapping, checks, autonomous decisions and deviations, correction progress, and residual risks. On a hard blocker, report its evidence and required user action without starting later dependent work. Suggest `/skill:yt-review <range-or-target>` when useful, but never invoke it automatically.
