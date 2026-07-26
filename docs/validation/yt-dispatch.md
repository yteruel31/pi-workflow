# yt-dispatch validation evidence

This record separates deterministic validation and observed launcher behavior from model-driven workflow behavior.

## Static and package validation

- `npm test` passed: Node TAP reported 41 top-level tests and 43 tests including nested subtests, with 43 passed and 0 failed.
- Launcher tests use fake Herdr/Pi executables and real temporary Git repositories.
- Deterministic tests cover the dirty-source warning and exclusion from the isolated worktree, branch and path collisions, a missing workspace, and tab failure preserving the created worktree.
- `npm pack --dry-run` passed for version `0.2.0`; the package contained all five skills and the executable `skills/yt-dispatch/scripts/spawn.sh` launcher.
- `git diff --check` passed.
- The required commands resolved locally: `herdr`, `pi`, `python3`, and `git`.

## Live launcher smoke validation

The real bundled launcher was exercised against the focused Herdr workspace `w3`.

- A read-only launch created a distinct no-focus Herdr tab whose session cwd was `/home/yteruel/pi-workflow`, and returned a valid JSON mapping.
- An implementation launch used a temporary Git repository and an exact 40-character base commit. It created branch `yt-dispatch/smoke-isolated`, a new isolated worktree, and a distinct no-focus Herdr tab. The returned valid JSON mapping matched the confirmed base, branch, and worktree path.
- The tabs were observed with `herdr tab get`. Initial pane reads were empty, so this evidence does not establish that the model processed the prompt or became ready.
- Test tabs, the temporary worktree and branch, and the temporary repository were cleaned up manually after validation. This was test cleanup outside dispatcher behavior, not dispatcher rollback or lifecycle management.

## Residual live-validation gaps

The following model-driven behavior was not exercised live:

- Full `/skill:yt-dispatch` decomposition.
- One global confirmation before resource creation.
- Autonomous prompt quality.
- A maximum-five multi-tab run.
- Filtering of dependent units.
- Child completion.
