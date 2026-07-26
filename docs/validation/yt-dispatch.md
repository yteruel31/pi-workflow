# yt-dispatch validation evidence

This record separates deterministic validation from model-driven workflow behavior.

## Static and package validation

- `npm test` passed: Node TAP reported 45 top-level tests and 52 tests including nested subtests, with 52 passed, 0 failed, and 0 skipped on this host.
- Launcher tests use realistic fake Herdr create/get responses, fake Pi, and real temporary Git repositories.
- Deterministic coverage includes structured success/failure JSON, retained resources after partial failures, malformed create responses, observed tab/pane mismatches, pane launch failure, and read-only `read,grep,find,ls` Pi tool enforcement.
- Worktree coverage includes dirty-source isolation, branch/path collisions, nested-source and symlink-parent rejection, disabled post-checkout hooks, and exact full SHA-1/SHA-256 commit IDs. The SHA-256 test skips explicitly when installed Git lacks support; it passed on this host.
- `npm pack --dry-run` passed for version `0.2.0`; 14 files were included and the launcher remained executable.
- `bash -n skills/yt-dispatch/scripts/spawn.sh` and `git diff --check` passed.

## Live launcher smoke

The post-review launcher was exercised against the real focused Herdr workspace `w3` in read-only mode. It created a distinct no-focus tab, validated the observed tab and pane workspace, relationship, label, and cwd, started Pi with the restricted `read,grep,find,ls` tool allowlist, and returned a structured `status: "success"` mapping. The temporary validation tab was then closed manually; this cleanup was outside dispatcher behavior. The smoke test did not wait for or claim model prompt completion.

## Trust boundaries and live-validation gaps

Read-only mode restricts Pi's built-in tools, but project/runtime credentials and unobservable external model behavior remain trust boundaries. Worktree creation disables Git hooks, while checkout filters and other repository Git configuration remain trusted prerequisites.

The following model-driven behavior was not exercised live:

- Full `/skill:yt-dispatch` decomposition and autonomous prompt quality.
- One global confirmation before resource creation.
- A maximum-five multi-tab run and filtering of dependent units.
- Child completion.
