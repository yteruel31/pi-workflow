# Pi Workflow

A small personal development workflow for [Pi](https://pi.dev), focused on moving from an idea to reviewed commits without heavy process or automatic review/fix loops.

> The repository is currently being bootstrapped. The package manifest is available; the workflow skills will be added in the next implementation units.

## Planned skills

| Skill | Purpose |
|---|---|
| `yt-brainstorm` | Clarify product intent and optionally capture a concise PRD. |
| `yt-plan` | Produce an implementation-ready plan from a request or optional artifact. |
| `yt-work` | Implement sequential units with native workers and parent-validated commits. |
| `yt-review` | Produce an adaptive, report-only implementation review. |

Each skill will remain directly usable without running the previous stage.

## Installation

Once the repository is published, install it globally from GitHub:

```bash
pi install git:github.com/yteruel31/pi-workflow
```

Restart Pi after installation.

Update installed Git packages with:

```bash
pi update --extensions
```

To pin the package, append a tag or commit, for example:

```bash
pi install git:github.com/yteruel31/pi-workflow@v0.1.0
```

## Development

The package uses Pi's native `pi.skills` manifest and has no runtime dependencies.

```bash
npm test
```

Dependency-free contract tests will be added alongside the skill files.
