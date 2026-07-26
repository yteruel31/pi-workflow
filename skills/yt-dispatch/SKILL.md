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

A read-only unit uses the current project's working directory. Its prompt must explicitly forbid edits and writes, staging, commits, pushes, remote mutations, and spawning further agents. The launcher also restricts Pi's built-in tool surface to the mutation-free `read,grep,find,ls` allowlist. Project/runtime credentials and unobservable external model behavior remain trust boundaries; do not describe the allowlist as proof that all external effects are impossible.

An implementation unit requires a Git repository and a dedicated isolated Git worktree on its own new branch. Its physically resolved target must be outside the source top-level, Git common directory, and every registered worktree; symlinked parents and existing paths are rejected. The launcher disables Git hooks for worktree creation. Checkout filters and other repository Git configuration remain trusted prerequisites because Git may apply them while materializing a worktree. The branch may start from the source checkout's current `HEAD`. Use that worktree as the launched Pi session's cwd, and tell the session that it owns only its declared scope. Never run implementation work in the source checkout or share a worktree or branch between units.

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

After explicit confirmation, use only the launcher bundled with this skill. Resolve it from the directory containing this loaded `SKILL.md`; never use a home-directory skill or the user-scoped `herdr-pi-delegate` skill:

```bash
# SKILL_FILE is the absolute path of this loaded skills/yt-dispatch/SKILL.md.
SKILL_DIR="$(cd "$(dirname "$SKILL_FILE")" && pwd -P)"
SPAWN="$SKILL_DIR/scripts/spawn.sh"
```

Create each self-contained prompt as a mode-600 temporary file outside the repository, for example in a mode-700 directory made with `mktemp -d "${TMPDIR:-/tmp}/yt-dispatch-briefs.XXXXXXXX"`. Do not echo prompt content or place prompt files in the source checkout or an implementation worktree. The launcher securely copies each prompt under `${TMPDIR:-/tmp}/yt-dispatch-$(id -u)` and returns the copied path.

Process dispatchable units strictly sequentially in the confirmed order. For a read-only unit, invoke:

```bash
launch_args=(--mode read-only --title "$TITLE" --prompt-file "$PROMPT_FILE" --cwd "$SOURCE_CWD")
[[ -z "$WORKSPACE_ID" ]] || launch_args+=(--workspace "$WORKSPACE_ID")
"$SPAWN" "${launch_args[@]}"
```

For an implementation unit, pass the exact base, new branch, and absolute new worktree path from the confirmed map; the launcher creates the branch and worktree before launching:

```bash
launch_args=(--mode implementation --title "$TITLE" --prompt-file "$PROMPT_FILE"
  --cwd "$SOURCE_CWD" --base "$BASE_COMMIT" --branch "$BRANCH" --worktree "$WORKTREE")
[[ -z "$WORKSPACE_ID" ]] || launch_args+=(--workspace "$WORKSPACE_ID")
"$SPAWN" "${launch_args[@]}"
```

Pass the optional `--workspace` value as two ordinary array arguments only when it was selected; do not interpolate or evaluate user input. The bundled launcher always passes `--no-focus` to `herdr tab create`, observes the returned tab and pane with `herdr tab get` and `herdr pane get`, validates their workspace, label, cwd, and relationships before launching Pi, and emits one JSON mapping. Read-only launches use `pi --tools read,grep,find,ls --name ... @prompt-copy`; implementation launches use `pi --name ... @prompt-copy`. Launch every tab with no focus so the user's active tab does not change. It validates Herdr, Pi, Python, workspace availability, and mode-specific Git constraints; it never copies, stashes, or commits source changes.

Immediately launch each dispatchable unit in a distinct, visible Herdr tab running an independent interactive Pi session with its self-contained prompt. Do not use invisible or background sessions, native subagents, or a subagent fallback.

Capture and parse the launcher's single stdout JSON object even when it exits nonzero. Check `status`: on failure, report its stable `stage`, message, retained-resource booleans, known identifiers and paths, and observed values; on success, record its `workspace_id`, `tab_id`, `pane_id`, `title`, `mode`, `source_cwd`, `session_cwd`, and `prompt_path`, plus `base`, `branch`, and `worktree` for implementation. Treat a nonzero exit, malformed mapping, or mismatched confirmed value as the first failure and stop launching after that first partial failure. Preserve every tab, branch, and worktree already created, along with every copied prompt and resources created for the failed unit. Do not clean up, roll back, retry, replace, or continue with later units automatically.

## Return the launch mapping

After launch attempts, return only a concise mapping of each confirmed unit to one of:

- **success** — the launcher's tab title, mode, cwd, workspace/tab/pane identifiers, copied prompt path, and implementation worktree/branch/base when applicable;
- **failure** — the failed creation or launch step and preserved resources, identifying validation, worktree creation, tab creation, Pi launch, or mapping failure and every known retained resource;
- **not launched** — dependency/limit/prerequisite reason, or because an earlier launch failed.

Do not print prompt contents or invent identifiers missing from a failed launch. Once tabs are launched, do not monitor or poll them, wait for completion, collect outputs, synthesize results, coordinate follow-up, clean up worktrees, merge branches, push, or open a pull request. The launched sessions and their results remain user-controlled. Do not automatically invoke or suggest a next skill.
