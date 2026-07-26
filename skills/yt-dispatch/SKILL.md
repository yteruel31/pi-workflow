---
name: yt-dispatch
description: "Dispatch independent work units into visible Herdr Pi tabs without monitoring or collecting their results."
---

# YT Dispatch

Turn a request into bounded autonomous Pi sessions and return only the launch mapping. This skill is a dispatcher, not an executor or orchestrator of the launched work.

## Inputs and authority

A direct brainstorm or request is sufficient. The user may instead supply a PRD, plan, review, or other artifact, but no artifact or previous workflow stage is required.

Resolve scope in this order:

1. the user's current explicit request and corrections;
2. an artifact the user explicitly supplied;
3. relevant auto-discovered repository context.

Discovered context is evidence, not permission to widen scope. Ask one focused clarification before confirmation only when a material scope, dependency, mode, or safety fact cannot be resolved without guessing.

## Build the dispatch map

The main session owns dispatch planning. Extract coherent work units, their dependencies, and each unit's mode:

- **read-only** for investigation, analysis, research, or review that must not modify local or remote state;
- **implementation** for work that may edit files or create commits.

Classify a unit as dispatchable only when it is immediately independent: it has no dependency on another unit in this invocation and every external prerequisite is already satisfied. Do not dispatch a dependent unit in anticipation that another tab will finish first. List dependent or otherwise blocked units as **undispatched**, with the specific dependency or reason.

Dispatch at most five units in one invocation. If more than five independent candidates exist, leave the excess undispatched and explain that the invocation limit was reached. Never open more than five tabs.

For every dispatchable unit, the main session composes one autonomous, self-contained prompt. Do not make a launched session recover its assignment from chat history or an unstated artifact. Each prompt must include:

- the objective and expected output;
- only the relevant request, artifact, and repository context;
- precise scope and exclusions;
- settled decisions and satisfied dependencies;
- mode-specific safety constraints;
- enough validation guidance to work autonomously.

Never include secrets, credentials, tokens, authenticated URLs, or unrelated sensitive content. Redact sensitive values rather than copying them into a prompt.

## Route and isolate units

A read-only unit uses the current project's working directory. Its prompt must explicitly forbid edits and writes, staging, commits, pushes, remote mutations, and spawning further agents.

An implementation unit requires a Git repository and a dedicated isolated Git worktree on its own new branch. The branch may start from the source checkout's current `HEAD`. Use that worktree as the launched Pi session's cwd, and tell the session that it owns only its declared scope. Never run implementation work in the source checkout or share a worktree or branch between units.

Inspect staged, unstaged, and untracked source-checkout state before proposing implementation dispatch. A dirty source checkout does not by itself block isolated implementation dispatch, but the global confirmation must explicitly warn that its local staged, unstaged, and untracked changes are absent from worktrees created from `HEAD`. Do not copy, stash, commit, or otherwise transfer those changes automatically.

Verify the relevant prerequisites before dispatch. Missing Herdr or Pi stops all dispatch. Missing Git, an invalid Git checkout, or inability to create an isolated branch/worktree stops the affected implementation dispatch. Do not replace any missing prerequisite with a hidden process, native subagent, inline execution, or another fallback.

## Confirm once

Before creating any Herdr tab, worktree, or branch, show one global confirmation covering the entire proposed dispatch. Include for every candidate:

- unit ID and short tab title;
- mode and prompt summary;
- cwd, or the exact proposed worktree, branch, and base;
- dependencies and whether they are satisfied;
- dispatchable or undispatched status and reason.

Include the dirty-checkout warning when applicable. Ask for one confirmation of the complete map. Focused clarification may happen before this gate when genuinely required, but never replace, infer, or bypass confirmation and never ask for per-unit confirmations.

If the user declines or materially changes the map, create nothing. Rebuild and show one revised global confirmation when needed.

## Launch without orchestration

After explicit confirmation, create the required implementation branches and worktrees and immediately launch each dispatchable unit in a distinct, visible Herdr tab running an independent interactive Pi session with its self-contained prompt. Launch every tab with no focus so the user's active tab does not change. Do not use invisible or background sessions, native subagents, or a subagent fallback.

Process units in the confirmed order. If any branch, worktree, tab, or Pi launch fails, stop launching after that first partial failure. Preserve every tab, branch, and worktree already created, including resources created for the failed unit. Do not clean up, roll back, retry, replace, or continue with later units automatically.

## Return the launch mapping

After launch attempts, return only a concise mapping of each confirmed unit to one of:

- **success** — tab title, mode, cwd, and implementation worktree/branch/base when applicable;
- **failure** — the failed creation or launch step and preserved resources;
- **not launched** — dependency/limit/prerequisite reason, or because an earlier launch failed.

Once tabs are launched, do not monitor or poll them, wait for completion, collect outputs, synthesize results, coordinate follow-up, clean up worktrees, merge branches, push, or open a pull request. The launched sessions and their results remain user-controlled. Do not automatically invoke or suggest a next skill.
