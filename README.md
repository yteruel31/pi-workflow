# Pi Workflow

A small, Pi-only development workflow for moving from an idea to reviewed commits without mandatory documents, heavy orchestration, or automatic review/fix loops.

## Install

Install the public Git package:

```bash
pi install git:github.com/yteruel31/pi-workflow
```

Restart Pi so it discovers the skills. Update installed Git packages with:

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
| `yt-work` | `/skill:yt-work` | Implement a request or plan as sequential, validated, committed units. |
| `yt-review` | `/skill:yt-review` | Review a patch, PR, branch, ref, or working tree and return one prioritized report. |

Every skill, including `yt-dispatch`, is independently usable from a direct request. PRDs and plans are optional context, not workflow gates. Brainstorm and plan keep their result in the current session by default and create or update an artifact only after explicit approval. A brainstorm may suggest dispatch only for multiple immediately independent units; ordinary technical planning still suggests `yt-plan`. Suggestions are optional, and no skill starts the next command automatically.

## Bounded delegation

When Pi's native subagent roles are available, the skills use a deliberately small delegation model:

- **Brainstorm and plan:** optionally use at most one local `scout` and one external `researcher` when their evidence would materially improve the result.
- **Work:** use exactly one fresh `worker` per implementation unit, strictly sequentially. The parent validates the diff and checks, then creates one atomic commit for each passing unit before starting the next.
- **Review:** select one to three fresh `reviewer` roles from semantic complexity and synthesize one report-only result.

[`pi-subagents`](https://www.npmjs.com/package/pi-subagents) is optional enrichment and is not installed transitively. To enable role delegation:

```bash
pi install npm:pi-subagents
```

Without the extension or a required role, brainstorm, plan, work, and review have a graceful inline fallback in the parent session and report reduced delegation or review confidence where relevant. `yt-dispatch` is explicitly excluded from this generic `pi-subagents` fallback: it has no hidden or inline fallback.

## Visible dispatch

`yt-dispatch` maps only immediately independent units to distinct, visible Herdr tabs, with a maximum of five per invocation. It shows the complete routing map and asks for one global confirmation before creating anything. Read-only units use the current project cwd with writes forbidden in the prompt and Pi's built-in tools restricted to `read,grep,find,ls`; project/runtime credentials and unobservable external model behavior remain trust boundaries. Implementation units require Git and receive separate branches and worktrees outside repository and registered-worktree roots, with symlinked parents rejected and checkout hooks disabled. Checkout filters and other repository Git configuration remain trusted prerequisites. A dirty source checkout is allowed but warned about because staged, unstaged, and untracked changes are not copied into worktrees created from `HEAD`.

After confirmation, independent Pi sessions auto-start with no focus. The originating session is dispatcher-only: it returns the tab/session mapping and does not monitor, collect, merge, or clean up their work. On the first partial failure it stops launching later units and preserves every tab, branch, and worktree already created. There is no automatic fallback.

Dispatch requires external commands `herdr`, `pi`, and `python3`; implementation dispatch additionally requires `git`. These tools are prerequisites, not package dependencies.

## Safety behavior

`yt-work` requires a Git repository and performs a Git preflight before editing. It records existing changes, refuses to proceed with pre-existing staged changes, and blocks ambiguous overlap with foreign work. Workers never stage or commit: the parent stages only unit-owned changes, validates them, and owns the atomic commit. The skill does not push or open a pull request automatically.

`yt-review` is report-only. It compares observable local repository state before and after reviewers and, when safe read APIs are available, re-queries live remote refs and target-specific PR metadata on a best-effort basis. It prohibits local or remote mutation, never applies an autofix, and stops with a contract-violation report when compared evidence changes. Remote-only mutation that available tools cannot observe and configured role overrides remain trust boundaries; the report marks remote state unverified instead of claiming enforcement when evidence is unavailable.

## Development

Node.js is needed only to run the dependency-free contract tests; the installed Pi package has no runtime dependencies.

```bash
npm test
npm pack --dry-run
```

Repository layout:

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
```

The package is exposed through `pi.skills: ["./skills"]`. It intentionally ships no custom agents, commands, extensions, converters, or cross-harness compatibility layer.

Licensed under the [MIT License](LICENSE).
