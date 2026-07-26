# CLAUDE.md

## Repository purpose

`pi-workflow` is a small, public workflow package built specifically for the Pi coding agent. It provides five independent skills:

- `yt-brainstorm` — clarify a product idea without implementing it;
- `yt-dispatch` — launch independent units in separate visible Herdr Pi sessions;
- `yt-plan` — turn a request into an implementation-ready plan;
- `yt-work` — implement sequential units with one parent-owned commit per passing unit;
- `yt-review` — perform an adaptive, report-only review with one to three reviewers.

The package intentionally replaces heavier workflow systems with a simple cycle: brainstorm → plan → work → review, with dispatch available when independent work benefits from separate visible sessions. The order is suggested, never mandatory.

## Core product constraints

- Keep the repository Pi-native. Do not add Claude Code commands, custom agents, converters, marketplace infrastructure, or multi-harness compatibility layers.
- Every skill must accept a direct request. A PRD, plan, or previous workflow stage is always optional.
- Explicit user instructions take precedence over supplied artifacts; supplied artifacts take precedence over auto-discovered context.
- Skills may suggest a next step but must never invoke it automatically.
- Session output is the default. Create or update artifacts only when explicitly requested.
- `pi-subagents` is optional and is not installed transitively. Brainstorm, plan, work, and review preserve a graceful parent-session fallback; dispatch is excluded and has no hidden fallback.
- Keep the package dependency-free unless a dependency is clearly necessary and explicitly approved.

## Skill contracts

### `yt-brainstorm`

- Product framing only; do not plan implementation or edit code.
- Ask exactly one focused question at a time when clarification is needed.
- Use at most one foreground `scout` and one foreground `researcher`, only when their evidence materially improves the result.
- An optional PRD may be proposed or reused, never required or silently written.

### `yt-dispatch`

- Accept a direct request or optional artifact and dispatch only immediately independent units, at most five.
- Show one global confirmation before creating resources.
- Launch read-only work from the current cwd and implementation work in isolated Git branches/worktrees.
- Start separate visible Herdr Pi tabs with no focus; act only as dispatcher and do not monitor them.
- Require `herdr`, `pi`, and `python3`, plus `git` for implementation; do not use inline or subagent fallbacks.
- Stop on the first partial failure and preserve already-created tabs, branches, and worktrees.

### `yt-plan`

- Produce an implementation-ready plan without implementing it.
- Inspect repository context and relevant external evidence when useful.
- Use at most one foreground `scout` and one foreground `researcher`.
- Keep the plan in the session unless the user explicitly requests a file.

### `yt-work`

- Require a Git repository because each passing unit receives an atomic commit.
- Run exactly one fresh `worker` per implementation unit, strictly sequentially.
- The parent validates repository state, diff scope, and checks before committing.
- Workers must never stage, commit, push, modify planning artifacts, or spawn subagents.
- Stop on failed validation or contract violations. Do not retry, replace workers, or start correction loops automatically.
- Never push or open a pull request unless separately requested.

### `yt-review`

- Accept patches, PRs, branches or refs, and working-tree targets.
- Select one to three fresh reviewers based on semantic complexity and risk.
- Review is report-only: no edits, staging, commits, pushes, comments, labels, or autofixes.
- Detect observable local mutation and compare remote evidence only when safe read-only APIs are available.
- Treat configured role overrides and unobservable remote-only effects as trust boundaries.
- Return one deduplicated P0–P3 report and only suggest `yt-work` when fixes are useful.

## Repository layout

```text
skills/
  yt-brainstorm/SKILL.md
  yt-dispatch/SKILL.md
  yt-dispatch/scripts/spawn.sh  # executable
  yt-plan/SKILL.md
  yt-work/SKILL.md
  yt-review/SKILL.md
test/skills.test.js
docs/plans/
docs/validation/
package.json
README.md
LICENSE
```

`package.json` exports only `./skills` through `pi.skills`. Each skill directory is self-contained and has a `SKILL.md` whose frontmatter contains only a matching `name` and a concise `description`.

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
