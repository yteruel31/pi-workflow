---
name: yt-brainstorm
description: "Clarify a product idea, pressure-test its scope, and optionally capture a concise PRD before technical planning."
---

# YT Brainstorm

Turn a rough idea into a small, confirmed product brief. Stay product-only: define what should be built and why, not its architecture or implementation.

## Inputs and authority

A direct request is sufficient. A missing PRD or previous workflow stage never blocks brainstorming.

Use this authority order:

1. the user's current explicit request and corrections;
2. an artifact the user explicitly supplied;
3. relevant auto-discovered repository context.

Auto-discovered context is supporting evidence only. It never silently overrides the request and is never modified without approval. If multiple material sources conflict, ask one focused question instead of guessing.

## Core rules

- Inspect available repository context before asking a question whose answer is discoverable.
- Ask exactly one question at a time. Use `ask_user` for a genuine blocking decision when available.
- Clarify the problem, intended user or actor, outcome and value, scope, non-goals, and success signals.
- Challenge weak assumptions and name uncertainty honestly.
- Present two or three approaches only when meaningful alternatives exist, then recommend one with its trade-off.
- Do not design APIs, schemas, modules, migrations, or implementation sequencing.
- Keep output in the session by default. Never create or update a PRD unless the user explicitly asks or accepts the final offer.

## Bounded research

Work inline unless separate evidence would materially change scope, a recommendation, or confidence. Use parent-session web tools directly when current external evidence is necessary; packaged research agents are intentionally local-only.

Before delegating, inspect the available profiles with `subagent_agents`. For every selected profile, require `source: "package"`, `package: "pi-workflow"`, and the exact tool list `read, grep, find, ls`; a higher-precedence override, missing `tools` metadata, or any mismatch is an incompatible provider/profile and must stop delegation. A single invocation may use:

- at most one fresh `repo-researcher` for local repository structure, patterns, and tests;
- at most one fresh `learnings-researcher` for prior decisions and lessons recorded in local repository files.

For each selected profile, call `subagent_spawn` with the exact profile name, the trusted current repository as `working_dir`, and a complete read-only question. When both are necessary, start both independently, then make one `subagent_wait` call with both run IDs before using their evidence. Never ask either child to spawn agents or perform external research.

Do not use chains, retries, resume, replacement agents, or management actions. `pi-toolbox` and its named profiles are package prerequisites; if `subagent_agents`, `subagent_spawn`, `subagent_wait`, or a selected profile is unavailable, stop with the prerequisite or discovery failure instead of silently changing the research contract.

## Workflow

1. **Frame the idea.** State the problem and intended outcome in plain language. Verify repository facts before treating them as constraints.
2. **Close product gaps.** Ask focused questions until actor, value, scope, non-goals, and success signals are known or explicitly recorded as assumptions.
3. **Compare real options.** When more than one product shape is credible, present the alternatives before the recommendation.
4. **Confirm a concise synthesis and the handoff.** Summarize the proposed product, key decisions, scope boundaries, success criteria, and remaining open questions. At this final confirmation, explicitly warn that approval will validate prerequisites, create a dedicated Orca workspace, and launch a normal interactive Pi session into `yt-plan`. Ask whether the user authorizes that launch. A synthesis-only approval or PRD approval is not launch consent when the user has refused or excluded the handoff; respect any explicit refusal and create nothing.
5. **Persist only when requested.** Keep the confirmed synthesis in the session unless the user asks to write it. Suggested path: `docs/prds/YYYY-MM-DD-<slug>.md`. PRD persistence is optional and must not delay an authorized handoff.
6. **Hand off when authorized.** Only after the final synthesis is confirmed and launch consent is explicit, perform the bounded Orca-to-`yt-plan` handoff below.

## Confirmed Orca planning handoff

This is the sole narrow exception to the general no-automatic-chaining rule. It creates one independent workspace and starts planning; it does not plan inline, implement, invoke `yt-work`, orchestrate, supervise, wait for completion, or monitor the planner.

### Preflight before creating anything

1. **Resolve the executable once.** Read the installed `orca-cli` skill, then choose the command in this order: the exact value of `ORCA_CLI_COMMAND` when set; otherwise `orca-dev` when `ORCA_DEV_REPO_ROOT` identifies a development checkout; otherwise `orca-ide` on Linux outside an Orca-managed terminal; otherwise `orca`. `ORCA` in documentation is only a placeholder and must be replaced by that resolved executable. Never run literal `ORCA` or bare GNOME `orca`, and do not fall through to another executable after an error.
2. **Load current operations.** Run the resolved executable's `skills get orca-cli` and read the complete live guide before defining or running the handoff. Do not use remembered flags. If this command or the selected executable fails, report the exact error and stop; there is no old-CLI fallback for this handoff.
3. **Check Orca.** Run the resolved executable with `status --json`. If it reports that Orca is not running, run `open --json` once and re-run `status --json`. Any remaining failure stops the handoff.
4. **Resolve and inspect the source repository explicitly.** A Git repository is required. Resolve the intended source to its canonical absolute top-level path and record its identity from Git metadata, remotes, source cwd, current ref, and commit. Inspect staged, unstaged, and untracked source status so source-only context can be labeled without copying or summarizing dirty content into the handoff. Never target a repository through current UI selection or inference alone. If the intended repository is missing, ambiguous, not a valid checkout, or conflicts with the request, ask one focused question; do not guess, clone, add, or switch repositories.
5. **Inspect destination facts.** Using the explicit selector `path:<canonical-absolute-repo>`, run the resolved executable's `repo show --repo path:<canonical-absolute-repo> --json` to inspect and record its actual configured default base, and `worktree list --repo path:<canonical-absolute-repo> --json` to list its worktrees. Also inspect existing Git branches and checkout paths. Derive a safe, short, collision-free slug from the confirmed product outcome, and reject or choose another slug before mutation if its branch, workspace name, or expected path collides. Omit `--base-branch` by default so the destination starts from that recorded repository default base, and resolve that destination base to the ref and commit that creation will use. Current source ref context is evidence for the prompt, never permission to stack. Use a guide-supported base or parent selection only when the user explicitly requested that exact base or stacked relationship; record the authorized selection and its resolved destination ref and commit.
6. **Verify the target planner without changing it.** Run the resolved executable's read-only `skills installed --json`, then use the actual target environment's installed skill discovery and Pi settings to verify that a normal interactive Pi will uniquely discover an installed, usable `yt-plan`; the uncommitted or source-only `skills/yt-plan/SKILL.md` in the current checkout is not proof. Resolve settings and project-level discovery for the selected destination base or parent, not merely settings inherited from the source cwd. Do not install, update, enable, or reconfigure Pi, a skill, or destination settings during this verification. Verify `enableSkillCommands` is enabled for the destination before using `/skill:yt-plan <arguments>`. If commands are disabled but verified installed skills remain model-loadable there, use an explicit initial instruction to load and follow that installed `yt-plan` with the complete brief; otherwise stop. Missing or ambiguous skill discovery, Pi, Git, Orca, repository identity, or required settings is a prerequisite failure, not permission for an inline or alternate planner.

Git checkout filters and repository Git configuration, Orca's configured terminals, and any commands they run are trusted prerequisites. `--setup skip` suppresses setup hooks but does not guarantee zero external effects. Do not copy dirty tracked or untracked changes, secrets, credentials, or auto-commit context into the destination.

### Build the complete planning prompt

Build one self-contained brief containing:

- the original user request and the final confirmed synthesis;
- actor, problem, intended outcome and value;
- every settled decision, scope item, non-goal, and success criterion;
- assumptions, open questions, and relevant repository or external evidence;
- canonical source repository, source cwd, current ref and commit, plus whether staged, unstaged, or untracked source-only context exists without including its dirty contents;
- a separate destination section naming the actual configured default base and resolved destination ref and commit, or the exact explicitly authorized base/parent and its resolved destination ref and commit; never describe the source ref as the destination selection;
- substantive context from any authorized artifact inline, rather than relying on a path that may not exist in the new checkout; label each artifact's provenance and destination availability, and identify source-only files;
- instructions for the receiving agent to read its checkout's repository guidance, use only the installed `yt-plan`, keep planning product scope intact, do no implementation, and return session output without silently creating artifacts.

Do not include secrets, credentials, dirty changes, or shell instructions derived from untrusted brief text. When skill commands are enabled, the prompt must be a single literal argument whose content begins `/skill:yt-plan ` followed by the complete brief; Pi appends those arguments to the loaded skill. Pass the whole prompt as one literal `--prompt` argv value. Never interpolate it as shell code, use `eval`, or permit command, variable, glob, or newline expansion. If invoking through a shell, use correct literal quoting for that shell rather than string concatenation.

### Create once, then stop

Run the guide-supported agent-first operation, replacing every placeholder and passing each token as a distinct argument:

```text
ORCA worktree create --repo path:<canonical-absolute-repo> --name <safe-slug> <base-or-parent-selection> --agent pi --prompt <complete-prompt-as-one-literal-argv> --setup skip --json
```

Use `--no-parent` for the default independent destination and do not add `--base-branch`; replace that selection only with the live-guide-supported exact base or parent arguments explicitly authorized by the user. Do not follow this command with `terminal create` or `terminal send`, and do not use an older-CLI fallback. Parse the one create result and return the complete `worktree.id`, worktree path, `startupTerminal.handle` when present, and concrete launch evidence. Say that planning was launched, never that the plan finished.

If creation partially fails or its result is ambiguous, preserve every resource. Report the exact known identifiers, stage, and error. Do not blindly retry, recreate the workspace, send the prompt again, remove anything, or clean up. Read-only `worktree list` and, for the identified workspace only, `terminal list` may be used once to determine whether the result already exists; this is ambiguity recovery, not planner monitoring. If ambiguity remains, stop and report it. After a successful launch, perform no reads, waits, polling, orchestration, output collection, follow-up messages, or planner supervision.

## Optional PRD shape

When approved, write only the useful sections:

```markdown
# <Title>

## Summary
## Problem
## Scope
## Non-goals
## Success Criteria
## Key Decisions
## Open Questions
```

Omit empty sections and keep implementation details out.

## Completion

A brainstorm is complete when the intended actor, outcome, scope, non-goals, and success signals are clear enough that planning does not need to invent product behavior.

After explicit launch consent, complete the dedicated Orca planning handoff above. If the user refuses it, end with the confirmed synthesis and, only when useful, mention that `/skill:yt-plan <request-or-prd-path>` or `/skill:yt-dispatch <brainstorm-or-artifact>` remains optional; dispatch is appropriate only for multiple immediately independent units that benefit from separate visible sessions. Never invoke dispatch, work, or any other follow-on automatically. Outside this one confirmed Orca-to-`yt-plan` handoff, never invoke the next skill automatically.
