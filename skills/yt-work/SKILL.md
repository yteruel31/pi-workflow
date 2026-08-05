---
name: yt-work
description: "Implement a request or plan as sequential units with one dedicated implementer and one parent-owned atomic commit per passing unit."
---

# YT Work

Implement approved scope as small, validated, committed units. A direct implementation request is sufficient; a missing PRD, plan, or previous workflow stage never blocks work.

## Inputs and authority

Use this authority order:

1. the user's current explicit request and corrections;
2. an artifact the user explicitly supplied;
3. relevant auto-discovered repository context.

An explicit PRD or plan guides only the parts that do not conflict with the current request. Auto-discovered context is evidence, not new scope. Never silently modify a PRD or plan: report implementation deviations in the session unless the user explicitly authorizes an artifact update.

Ask one focused question only when a material scope, architecture, branch, or safety decision cannot be resolved from the repository and request.

## Git preflight

A Git repository is required because every completed unit receives an atomic commit. Before editing:

1. capture the current `HEAD` and branch;
2. capture staged paths, unstaged paths, and untracked paths separately;
3. retain that snapshot as the foreign-change baseline for every unit.

If any pre-existing staged change exists, stop and ask the user to resolve it. Do not unstage, stash, commit, or otherwise alter it automatically.

Use the current meaningful feature branch. On a default branch such as `main` or `master`, require explicit user permission before creating commits. If the current branch is not an appropriate feature branch, ask one focused branch question rather than switching or creating a branch silently.

Unrelated unstaged or untracked changes may remain only when they are disjoint from the current unit's files and hunks. If they overlap or ownership is ambiguous, block that unit before staging or committing and ask the user to resolve the overlap.

## Build the unit map

Use ordered plan U-IDs when available. Otherwise derive the smallest coherent unit map from the direct request, with a goal, allowed paths, approach, and decisive verification for each unit. Preserve dependency order and identify any execution-time unknowns.

Do not require a plan artifact. Keep the map in the session unless the user explicitly asks to update an artifact.

## Run one implementer per unit

Inspect the available roles before delegation. For the current unit, select exactly the packaged runtime agent `pi-workflow.unit-implementer`; never select the generic builtin `worker` as a fallback. Run exactly one fresh implementer, strictly sequentially. The next implementer may start only after the parent has validated and committed the previous unit.

Immediately before launching each implementer, capture a per-unit Git metadata snapshot: expected `HEAD`, current branch, the complete staged/index state, all local refs, and redacted remote configuration or URLs. Never retain credentials in the snapshot.

Use a fresh context and foreground execution with inline returns: set `context: "fresh"`, `async: false`, `output: false`, and `artifacts: false`. For every mutation-capable implementer, omit `turnBudget` and omit any hard or count-based `toolBudget`. Turn and tool counts are not safe delivery boundaries: they can expire after implementation and checks complete, misclassifying completed work as a partial run. Keep execution bounded by the unit packet. A generous outer `timeoutMs` is allowed only as a wall-clock fail-safe, never as a mutation-safe completion or checkpoint boundary.

Send a bounded unit packet rather than the whole plan. Include:

- the unit ID, goal, requirements, dependencies, exact allowed paths, and mandatory artifact boundaries;
- the authority order: current explicit packet and corrections, explicitly supplied artifact, then repository context;
- instructions to read relevant repository guidance and translate every goal, allowed path, required artifact, test scenario, and verification command into a private compliance checklist before editing;
- the requirement to validate repository patterns, including test discovery, before editing;
- focused test scenarios and verification commands;
- the foreign-change baseline and explicit ownership boundaries;
- the escalation rule: no silent path rename, artifact consolidation or splitting, architecture substitution, skipped check, or scope widening; on conflict, a missing decision, impossible required verification, or any needed deviation, contact the supervisor with `reason: "need_decision"` before the divergent edit and wait, or stop blocked if contact is unavailable.

Tell the child that exact planned paths and artifact boundaries are mandatory unless explicitly optional and that it is the sole writer while active. It may edit unit-owned files and run focused checks, but it must not stage, commit, push, mutate refs, remotes, or Git configuration, modify the PRD or plan, or spawn subagents. It must perform required checks, distinguish baseline failures with evidence, and return exact changed paths, checks and results, blockers, deviations, and confirmation that nothing is staged.

The parent must not write concurrently with the implementer. Do not use chains, parallel implementers, background runs, retries, resume, replacement implementers, review loops, or management actions.

If the subagent tool or `pi-workflow.unit-implementer` is unavailable, the parent implements the current unit inline under the same packet, compliance checklist, escalation, validation, and commit gates. Disclose the skipped delegation. Never fall back to the generic builtin `worker`.

## Parent validation

After the implementer returns, the parent owns validation:

1. first compare `HEAD`, branch, the complete staged/index state, local refs, and redacted remote configuration exactly with the per-unit snapshot;
2. treat any metadata delta as an implementer contract violation and stop without rewriting history, retrying, replacing the implementer, or committing;
3. inspect actual status and diff against the unit packet and preflight baseline;
4. reject unrelated, unexplained, or out-of-scope edits;
5. confirm no pre-existing change was absorbed and no foreign change was modified;
6. run the decisive focused checks and inspect their output;
7. verify that every changed hunk has unambiguous unit ownership.

These local checks cannot prove that a configured implementer caused no remote-only effect. Configured role overrides and remote-only actions are a trust boundary; disclose that limitation rather than claiming remote absence.

A failed or partial implementer, ambiguous diff, foreign-change overlap, metadata contract violation, or failed validation remains uncommitted and stops the workflow at a checkpoint. Launch no automatic retry or replacement. Report the unit, changed files, checks and results, failure, and next user-controlled action.

## Parent-owned atomic commit

For a passing unit:

1. stage only unit-owned paths or hunks;
2. inspect the complete staged diff and staged path list;
3. confirm the index contains no pre-existing or unrelated change;
4. create one conventional atomic commit whose message reflects the unit goal;
5. inspect the resulting commit and verify it contains only that unit's changes;
6. compare the remaining working tree with the foreign-change baseline before starting the next implementer.

Never let a child create the commit. Never push or open a pull request unless the user separately requests it.

## Completion

After all units pass, summarize unit-to-commit mapping, verification, deviations, skipped delegation, and residual risks. Suggest `/skill:yt-review <range-or-target>` when review is useful, but never invoke it automatically.
