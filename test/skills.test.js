import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dispatchScript = join(root, "skills", "yt-dispatch", "scripts", "spawn.sh");
const requiredSkillNames = ["yt-brainstorm", "yt-dispatch", "yt-plan", "yt-review", "yt-work"];
const productSkillNames = ["yt-brainstorm", "yt-plan"];

function readSkill(name) {
  const path = join(root, "skills", name, "SKILL.md");
  return { path, content: readFileSync(path, "utf8") };
}

function frontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "SKILL.md must start with YAML frontmatter");

  const values = new Map();
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return { raw: match[1], values };
}

function assertMatches(content, patterns, label) {
  for (const pattern of patterns) {
    assert.match(content, pattern, `${label} must satisfy ${pattern}`);
  }
}

function assertNoForbiddenPatterns(content, patterns, label) {
  for (const pattern of patterns) {
    assert.doesNotMatch(content, pattern, `${label} must reject ${pattern}`);
  }
}

function assertRejectsContradictions(content, patterns, syntheticDirectives, label) {
  assertNoForbiddenPatterns(content, patterns, label);
  for (const directive of syntheticDirectives) {
    assert.throws(
      () => assertNoForbiddenPatterns(`${content}\n${directive}\n`, patterns, label),
      { name: "AssertionError" },
      `${label} must reject contradictory directive: ${directive}`,
    );
  }
}

function findNamedFiles(directory, fileName) {
  const matches = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) matches.push(...findNamedFiles(path, fileName));
    if (entry.isFile() && entry.name === fileName) matches.push(path);
  }
  return matches;
}

function run(command, args = [], options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
}

function runGit(repository, ...args) {
  const result = run("git", ["-C", repository, ...args]);
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function createDispatchHarness(t, { workspaceJson, tabFailure = false, malformedTab = false, mismatch = false, paneFailure = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "yt-dispatch-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const bin = join(directory, "bin");
  const temporary = join(directory, "tmp");
  mkdirSync(bin);
  mkdirSync(temporary);
  const herdrLog = join(directory, "herdr.log");
  const herdr = join(bin, "herdr");
  writeFileSync(herdr, `#!/usr/bin/env bash
set -euo pipefail
printf '%q ' "$@" >> "$FAKE_HERDR_LOG"
printf '\\n' >> "$FAKE_HERDR_LOG"
if [[ "\${1:-} \${2:-}" == "workspace list" ]]; then
  printf '%s\\n' "$FAKE_WORKSPACE_JSON"
  exit 0
fi
if [[ "\${1:-} \${2:-}" == "tab create" ]]; then
  args=("$@"); cwd=""; label=""; for ((i=0;i<\${#args[@]};i++)); do [[ "\${args[i]}" == --cwd ]] && cwd="\${args[i+1]}"; [[ "\${args[i]}" == --label ]] && label="\${args[i+1]}"; done
  printf '%s\\n%s\\n' "$cwd" "$label" > "$FAKE_HERDR_LOG.state"
  if [[ "\${FAKE_TAB_FAILURE:-0}" == "1" ]]; then
    echo "synthetic tab failure" >&2
    exit 19
  fi
  if [[ "\${FAKE_MALFORMED_TAB:-0}" == "1" ]]; then printf '%s\\n' '{"result":{}}'; else printf '%s\\n' '{"result":{"tab":{"tab_id":"tab-1","workspace_id":"workspace-1","label":"created"},"root_pane":{"pane_id":"pane-1","tab_id":"tab-1"}}}'; fi
  exit 0
fi
if [[ "\${1:-} \${2:-}" == "tab get" ]]; then
  label="$(sed -n '2p' "$FAKE_HERDR_LOG.state")"
  printf '{"result":{"tab":{"tab_id":"tab-1","workspace_id":"workspace-1","label":"%s"}}}\\n' "$label"
  exit 0
fi
if [[ "\${1:-} \${2:-}" == "pane get" ]]; then
  cwd="$(sed -n '1p' "$FAKE_HERDR_LOG.state")"
  [[ "\${FAKE_MISMATCH:-0}" == 1 ]] && cwd="/wrong/cwd"
  printf '{"result":{"pane":{"pane_id":"pane-1","tab_id":"tab-1","workspace_id":"workspace-1","cwd":"%s"}}}\\n' "$cwd"
  exit 0
fi
if [[ "\${1:-} \${2:-}" == "pane run" ]]; then
  [[ "\${FAKE_PANE_FAILURE:-0}" == 1 ]] && { echo "synthetic pane failure" >&2; exit 23; }
  printf '%s\\n' '{"result":{}}'
  exit 0
fi
echo "unexpected fake herdr invocation" >&2
exit 64
`);
  chmodSync(herdr, 0o755);

  const pi = join(bin, "pi");
  writeFileSync(pi, "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(pi, 0o755);

  const prompt = join(directory, "prompt.md");
  writeFileSync(prompt, "Self-contained dispatch brief.\n", { mode: 0o600 });

  return {
    directory,
    herdrLog,
    prompt,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      TMPDIR: temporary,
      FAKE_HERDR_LOG: herdrLog,
      FAKE_WORKSPACE_JSON: workspaceJson ?? '{"result":{"workspaces":[{"workspace_id":"workspace-1","focused":true}]}}',
      FAKE_TAB_FAILURE: tabFailure ? "1" : "0",
      FAKE_MALFORMED_TAB: malformedTab ? "1" : "0",
      FAKE_MISMATCH: mismatch ? "1" : "0",
      FAKE_PANE_FAILURE: paneFailure ? "1" : "0",
    },
  };
}

function createGitRepository(directory) {
  const repository = join(directory, "source");
  mkdirSync(repository);
  runGit(repository, "init", "-q");
  runGit(repository, "config", "user.name", "Dispatch Test");
  runGit(repository, "config", "user.email", "dispatch@example.test");
  writeFileSync(join(repository, "tracked.txt"), "base tracked\n");
  writeFileSync(join(repository, "other.txt"), "base other\n");
  runGit(repository, "add", "tracked.txt", "other.txt");
  runGit(repository, "commit", "-q", "-m", "base");
  return { repository, base: runGit(repository, "rev-parse", "HEAD") };
}

function launch(harness, args) {
  return run(dispatchScript, args, { env: harness.env });
}

test("package manifest exposes only the native skills directory", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

  assert.equal(manifest.private, true);
  assert.equal(manifest.version, "0.2.0");
  assert.deepEqual(manifest.pi, { skills: ["./skills"] });
  assert.equal(manifest.dependencies, undefined);
});

test("skill discovery contains exactly the required five matching directories and files", () => {
  const skillsDirectory = join(root, "skills");
  const immediateDirectories = readdirSync(skillsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const skillFiles = findNamedFiles(skillsDirectory, "SKILL.md").sort();
  const expectedFiles = requiredSkillNames
    .map((name) => join(skillsDirectory, name, "SKILL.md"))
    .sort();

  assert.deepEqual(immediateDirectories, requiredSkillNames);
  assert.deepEqual(skillFiles, expectedFiles);

  for (const name of requiredSkillNames) {
    const { content } = readSkill(name);
    assert.equal(frontmatter(content).values.get("name"), name);
  }
});

test("repository ships no custom-agent, cross-harness, or marketplace surfaces", () => {
  const forbiddenRootEntries = [
    "agents",
    "commands",
    "extensions",
    "prompts",
    "themes",
    "chains",
    "plugins",
    ".claude-plugin",
    "marketplace.json",
    ".pi-marketplace.json",
  ];

  for (const entry of forbiddenRootEntries) {
    assert.equal(existsSync(join(root, entry)), false, `${entry} must not be shipped`);
  }
});

test("README documents installation, all commands, fallback, commits, and report-only review", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");

  assertMatches(readme, [
    /pi install git:github\.com\/yteruel31\/pi-workflow/,
    /Restart Pi/i,
    /pi update --extensions/,
    /existing tag or commit/i,
    /tag must already be published/i,
    /@v0\.2\.0/,
    /@<commit>/,
    /\/skill:yt-brainstorm/,
    /\/skill:yt-plan/,
    /\/skill:yt-work/,
    /\/skill:yt-review/,
    /pi install npm:pi-subagents/,
    /optional enrichment.*not installed transitively/is,
    /graceful inline fallback/i,
    /one fresh `worker` per implementation unit, strictly sequentially/i,
    /one atomic commit for each passing unit/i,
    /does not push or open a pull request automatically/i,
    /`yt-review` is report-only/i,
    /observable local repository state/i,
    /best-effort basis/i,
    /remote-only mutation.*configured role overrides.*trust boundaries/is,
    /marks remote state unverified/i,
    /never applies an autofix/i,
    /no runtime dependencies/i,
  ], "README");
});

test("README documents dispatch behavior, prerequisites, and its fallback exception", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");

  assertMatches(readme, [
    /\/skill:yt-dispatch/,
    /independently usable from a direct request/i,
    /distinct, visible Herdr tabs/i,
    /maximum of five/i,
    /one global confirmation/i,
    /immediately independent units/i,
    /Read-only units use the current project cwd/i,
    /implementation units require Git.*separate branches and worktrees/is,
    /auto-start with no focus/i,
    /dispatcher-only.*does not monitor/is,
    /first partial failure.*stops launching.*preserves/is,
    /dirty source checkout.*warned/is,
    /`herdr`, `pi`, and `python3`.*additionally requires `git`/is,
    /`yt-dispatch` is explicitly excluded.*generic `pi-subagents` fallback/is,
    /no hidden or inline fallback/i,
    /yt-dispatch\/SKILL\.md/,
    /yt-dispatch\/scripts\/spawn\.sh\s+# executable/,
    /Pi-only/i,
    /no custom agents, commands, extensions, converters, or cross-harness compatibility layer/i,
  ], "README dispatch documentation");
});

test("CLAUDE documents the five-skill dispatch contract and layout", () => {
  const guidance = readFileSync(join(root, "CLAUDE.md"), "utf8");

  assertMatches(guidance, [
    /provides five independent skills/i,
    /### `yt-dispatch`/,
    /immediately independent units, at most five/i,
    /one global confirmation/i,
    /current cwd.*isolated Git branches\/worktrees/is,
    /visible Herdr Pi tabs with no focus/i,
    /dispatcher.*do not monitor/is,
    /`herdr`, `pi`, and `python3`, plus `git`/i,
    /first partial failure.*preserve/is,
    /dispatch is excluded and has no hidden fallback/i,
    /yt-dispatch\/SKILL\.md/,
    /yt-dispatch\/scripts\/spawn\.sh\s+# executable/,
    /Do not tag, publish, push, or open a pull request unless the user asks/i,
  ], "CLAUDE dispatch guidance");
  assert.doesNotMatch(guidance, /exactly four/i);
});

test("yt-brainstorm conditionally suggests dispatch without invoking either next skill", () => {
  const { content } = readSkill("yt-brainstorm");

  assertMatches(content, [
    /confirmed brainstorm contains multiple immediately independent units/i,
    /benefit from separate visible sessions/i,
    /optionally suggest `\/skill:yt-dispatch <brainstorm-or-artifact>`/i,
    /Otherwise, end by suggesting `\/skill:yt-plan <request-or-prd-path>` when ordinary technical planning is useful/i,
    /Dispatch is never mandatory/i,
    /Never invoke either skill automatically/i,
  ], "yt-brainstorm completion");
});

test("all discovered skills have valid, matching frontmatter", () => {
  for (const name of requiredSkillNames) {
    const { content } = readSkill(name);
    const { raw, values } = frontmatter(content);

    assert.equal(values.get("name"), name);
    assert.match(raw, /^description:\s*"[^"\n]+"$/m);
    assert.equal(values.has("argument-hint"), false);
  }
});

test("skills reject contradictory workflow directives", () => {
  const productPatterns = [
    /\b(?:an? )?(?:PRD|plan) is required before\b/i,
    /\balways (?:invoke|start|run) (?:the )?next skill automatically\b/i,
  ];
  for (const name of productSkillNames) {
    const { content } = readSkill(name);
    assertRejectsContradictions(content, productPatterns, [
      "A PRD is required before continuing.",
      "A plan is required before continuing.",
      "Always invoke the next skill automatically.",
    ], name);
  }

  const { content: work } = readSkill("yt-work");
  assertRejectsContradictions(work, [
    /\b(?:the )?worker(?:s)? (?:may|can|should|must) (?:stage|commit|push)\b/i,
    /\brun workers? in parallel\b/i,
    /\bautomatically (?:retry|replace)\b/i,
  ], [
    "The worker may stage changes.",
    "The worker may commit changes.",
    "The worker may push changes.",
    "Run workers in parallel.",
    "Automatically retry failed workers.",
    "Automatically replace failed workers.",
  ], "yt-work");

  const { content: review } = readSkill("yt-review");
  assertRejectsContradictions(review, [
    /\breviewers? (?:may|can|should|must) (?:edit|write|mutate|stage|commit|push|comment)\b/i,
    /\b(?:parent|reviewers?) (?:may|can|should|must) (?:apply|run|perform) (?:an? )?autofix\b/i,
    /\balways report remote state (?:matched|was unchanged|is unchanged).*evidence is unavailable\b/i,
  ], [
    "Reviewers may edit files.",
    "Reviewers may mutate remote state.",
    "The parent may apply an autofix.",
    "Always report remote state was unchanged when evidence is unavailable.",
  ], "yt-review");
});

test("brainstorm and plan preserve direct entry and source authority", () => {
  for (const name of productSkillNames) {
    const { content } = readSkill(name);
    assertMatches(content, [
      /A direct request is sufficient\./,
      /missing (?:PRD|PRD, plan).*never blocks/i,
      /current explicit request and corrections/i,
      /artifact the user explicitly supplied/i,
      /auto-discovered repository context/i,
      /ask one focused question instead of guessing/i,
      /Inspect .*repository.* before asking/i,
    ], name);
  }
});

test("brainstorm and plan keep artifacts optional and ask one question at a time", () => {
  for (const name of productSkillNames) {
    const { content } = readSkill(name);
    assertMatches(content, [
      /Ask exactly one question at a time\./,
      /Use `ask_user` for a genuine blocking/i,
      /Keep .* in the session by default/i,
      /Never create or update .* unless the user explicitly asks or accepts/i,
    ], name);
  }
});

test("brainstorm and plan delegation is fresh, bounded, foreground, and artifact-free", () => {
  for (const name of productSkillNames) {
    const { content } = readSkill(name);
    assertMatches(content, [
      /inspect the available roles/i,
      /at most one fresh `scout`/i,
      /at most one fresh `researcher`/i,
      /one bounded parallel call/i,
      /foreground execution with inline returns/i,
      /`async: false`/,
      /`output: false`/,
      /`artifacts: false`/,
      /not spawn subagents/i,
      /Do not use chains, saved workflows, background runs, retries, resume, management actions, or additional agents\./,
      /continue inline when safe/i,
    ], name);
  }
});

test("yt-brainstorm stays product-only and offers an optional PRD", () => {
  const { content } = readSkill("yt-brainstorm");
  assertMatches(content, [
    /Stay product-only/i,
    /problem, intended user or actor, outcome and value, scope, non-goals, and success signals/i,
    /two or three approaches only when meaningful alternatives exist/i,
    /Confirm a concise synthesis/i,
    /docs\/prds\/YYYY-MM-DD-<slug>\.md/,
    /Do not design APIs, schemas, modules, migrations, or implementation sequencing\./,
    /suggesting `\/skill:yt-plan/i,
    /Never invoke the next skill automatically\./,
  ], "yt-brainstorm");
});

test("yt-plan produces executable planning without implementing", () => {
  const { content } = readSkill("yt-plan");
  assertMatches(content, [
    /implementation-ready plan/i,
    /direct request, optional PRD, or existing plan/i,
    /Resolve planning-time questions/i,
    /execution-time unknowns explicit/i,
    /repository-relative paths/i,
    /ordered units/i,
    /Test Scenarios/i,
    /Risks and Blockers/i,
    /docs\/plans\/YYYY-MM-DD-<slug>-plan\.md/,
    /Do not edit application code, run migrations, stage files, or create commits\./,
    /suggesting `\/skill:yt-work/i,
    /Never invoke the next skill automatically\./,
  ], "yt-plan");
});

test("yt-dispatch has minimal frontmatter and accepts direct or optional artifact input", () => {
  const { content } = readSkill("yt-dispatch");
  const { raw, values } = frontmatter(content);

  assert.deepEqual([...values.keys()], ["name", "description"]);
  assert.equal(values.get("name"), "yt-dispatch");
  assert.match(raw, /^description:\s*"[^"\n]+"$/m);
  assert.equal(raw.split("\n").length, 2);
  assertMatches(content, [
    /A direct brainstorm or request is sufficient\./,
    /may instead supply a PRD, plan, review, or other artifact/i,
    /no artifact or previous workflow stage is required/i,
    /current explicit request and corrections/i,
    /artifact the user explicitly supplied/i,
    /auto-discovered repository context/i,
    /dispatcher, not an executor or orchestrator/i,
  ], "yt-dispatch");
});

test("yt-dispatch keeps unit extraction and autonomous prompt composition in the main session", () => {
  const { content } = readSkill("yt-dispatch");
  assertMatches(content, [
    /The main session owns dispatch planning/i,
    /Extract coherent work units, their dependencies, and each unit's mode/i,
    /read-only.*implementation/is,
    /main session composes one autonomous, self-contained prompt/i,
    /objective and expected output/i,
    /relevant request, artifact, and repository context/i,
    /precise scope and exclusions/i,
    /settled decisions and satisfied dependencies/i,
    /mode-specific safety constraints/i,
    /validation guidance to work autonomously/i,
    /Never include secrets, credentials, tokens, authenticated URLs/i,
  ], "yt-dispatch");
});

test("yt-dispatch sends only immediately independent units and caps an invocation at five", () => {
  const { content } = readSkill("yt-dispatch");
  assertMatches(content, [
    /dispatchable only when it is immediately independent/i,
    /no dependency on another unit in this invocation/i,
    /Do not dispatch a dependent unit/i,
    /dependent or otherwise blocked units as \*\*undispatched\*\*.*specific dependency or reason/is,
    /Dispatch at most five units in one invocation/i,
    /excess undispatched.*invocation limit/is,
    /Never open more than five tabs/i,
  ], "yt-dispatch");
});

test("yt-dispatch requires one complete global confirmation before creating resources", () => {
  const { content } = readSkill("yt-dispatch");
  assertMatches(content, [
    /Before creating any Herdr tab, worktree, or branch, show one global confirmation/i,
    /unit ID and short tab title/i,
    /mode and prompt summary/i,
    /cwd, or the exact proposed worktree, branch, and base/i,
    /dependencies and whether they are satisfied/i,
    /dispatchable or undispatched status and reason/i,
    /Ask for one confirmation of the complete map/i,
    /Focused clarification may happen before this gate when genuinely required/i,
    /never ask for per-unit confirmations/i,
    /If the user declines or materially changes the map, create nothing/i,
  ], "yt-dispatch");
});

test("yt-dispatch routes read-only work locally and implementation work to isolated Git worktrees", () => {
  const { content } = readSkill("yt-dispatch");
  assertMatches(content, [
    /read-only unit uses the current project's working directory/i,
    /prompt must explicitly forbid edits and writes, staging, commits, pushes, remote mutations/i,
    /implementation unit requires a Git repository and a dedicated isolated Git worktree on its own new branch/i,
    /branch may start from the source checkout's current `HEAD`/i,
    /Use that worktree as the launched Pi session's cwd/i,
    /Never run implementation work in the source checkout or share a worktree or branch/i,
    /Inspect staged, unstaged, and untracked source-checkout state/i,
    /dirty source checkout does not by itself block isolated implementation dispatch/i,
    /local staged, unstaged, and untracked changes are absent from worktrees created from `HEAD`/i,
    /Do not copy, stash, commit, or otherwise transfer those changes automatically/i,
  ], "yt-dispatch");
});

test("yt-dispatch launches visible no-focus Herdr Pi tabs and returns only a mapping", () => {
  const { content } = readSkill("yt-dispatch");
  assertMatches(content, [
    /After explicit confirmation.*immediately launch each dispatchable unit/is,
    /distinct, visible Herdr tab running an independent interactive Pi session/i,
    /Launch every tab with no focus/i,
    /Do not use invisible or background sessions, native subagents, or a subagent fallback/i,
    /return only a concise mapping/i,
    /\*\*success\*\*.*\*\*failure\*\*.*\*\*not launched\*\*/is,
    /do not monitor or poll them, wait for completion, collect outputs, synthesize results/i,
    /clean up worktrees, merge branches, push, or open a pull request/i,
    /Do not automatically invoke or suggest a next skill/i,
  ], "yt-dispatch");
});

test("yt-dispatch stops on prerequisites or the first partial failure without fallback or rollback", () => {
  const { content } = readSkill("yt-dispatch");
  assertMatches(content, [
    /Missing Herdr or Pi stops all dispatch/i,
    /Missing Git, an invalid Git checkout, or inability to create an isolated branch\/worktree stops the affected implementation dispatch/i,
    /Do not replace any missing prerequisite with a hidden process, native subagent, inline execution, or another fallback/i,
    /stop launching after that first partial failure/i,
    /Preserve every tab, branch, and worktree already created/i,
    /Do not clean up, roll back, retry, replace, or continue with later units automatically/i,
    /failed creation or launch step and preserved resources/i,
    /because an earlier launch failed/i,
  ], "yt-dispatch");
});

test("yt-dispatch rejects unsafe orchestration contradictions", () => {
  const { content } = readSkill("yt-dispatch");
  assertRejectsContradictions(content, [
    /^Dispatch dependent units (?:immediately|in parallel|anyway)\./im,
    /^Bypass (?:the )?(?:global )?confirmation\./im,
    /^(?:Open|Launch) (?:6|six|more than five) tabs\./im,
    /^Monitor (?:the )?(?:tabs|sessions) until completion\./im,
    /^Collect (?:their )?outputs? and synthesize (?:the )?results\./im,
    /^Use (?:hidden|invisible) sessions as a fallback\./im,
    /^Use native subagents as a fallback\./im,
    /^Automatically (?:clean up|rollback|roll back) created (?:resources|worktrees)\./im,
  ], [
    "Dispatch dependent units in parallel.",
    "Bypass the global confirmation.",
    "Launch 6 tabs.",
    "Monitor the sessions until completion.",
    "Collect their outputs and synthesize the results.",
    "Use hidden sessions as a fallback.",
    "Use native subagents as a fallback.",
    "Automatically clean up created worktrees.",
    "Automatically roll back created resources.",
  ], "yt-dispatch");
});

test("yt-dispatch documents its bundled launcher, temporary prompts, and sequential mapping handling", () => {
  const { content } = readSkill("yt-dispatch");
  assertMatches(content, [
    /directory containing this loaded `SKILL\.md`/i,
    /SPAWN="\$SKILL_DIR\/scripts\/spawn\.sh"/,
    /never use a home-directory skill or the user-scoped `herdr-pi-delegate` skill/i,
    /mode-600 temporary file outside the repository/i,
    /strictly sequentially in the confirmed order/i,
    /--mode read-only/,
    /--mode implementation/,
    /exact base, new branch, and absolute new worktree path/i,
    /Capture and parse the launcher's single stdout JSON object/i,
    /nonzero exit, malformed mapping, or mismatched confirmed value as the first failure/i,
    /do not monitor or poll/i,
  ], "yt-dispatch");
});

test("yt-dispatch launcher provides help and rejects invalid arguments without mutation", () => {
  assert.equal(statSync(dispatchScript).mode & 0o111, 0o111, "bundled launcher must be executable");

  const help = run(dispatchScript, ["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--mode read-only\|implementation/);
  assert.doesNotMatch(help.stdout, /--focus/);

  const missing = run(dispatchScript);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /--mode is required/);

  const incompleteImplementation = run(dispatchScript, [
    "--mode", "implementation",
    "--title", "Incomplete",
    "--prompt-file", "/not/used",
    "--cwd", "/not/used",
  ]);
  assert.equal(incompleteImplementation.status, 2);
  assert.match(incompleteImplementation.stderr, /--base is required/);

  const focusOverride = run(dispatchScript, ["--focus"]);
  assert.equal(focusOverride.status, 2);
  assert.match(focusOverride.stderr, /Unknown argument: --focus/);
});

test("yt-dispatch launcher starts a read-only no-focus tab and emits one secure JSON mapping", (t) => {
  const harness = createDispatchHarness(t);
  const source = join(harness.directory, "read-only-source");
  mkdirSync(source);

  const result = launch(harness, [
    "--mode", "read-only",
    "--title", "Read only check",
    "--prompt-file", harness.prompt,
    "--cwd", source,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().split("\n").length, 1);

  const mapping = JSON.parse(result.stdout);
  assert.equal(mapping.status, "success");
  assert.deepEqual(
    {
      workspace_id: mapping.workspace_id,
      tab_id: mapping.tab_id,
      pane_id: mapping.pane_id,
      title: mapping.title,
      mode: mapping.mode,
      source_cwd: mapping.source_cwd,
      session_cwd: mapping.session_cwd,
    },
    {
      workspace_id: "workspace-1",
      tab_id: "tab-1",
      pane_id: "pane-1",
      title: "Read only check",
      mode: "read-only",
      source_cwd: source,
      session_cwd: source,
    },
  );
  assert.equal(readFileSync(mapping.prompt_path, "utf8"), readFileSync(harness.prompt, "utf8"));
  assert.equal(statSync(mapping.prompt_path).mode & 0o777, 0o600);
  assert.ok(mapping.prompt_path.startsWith(`${harness.env.TMPDIR}/yt-dispatch-`));

  const calls = readFileSync(harness.herdrLog, "utf8").trim().split("\n");
  const tabCall = calls.find((line) => line.startsWith("tab create "));
  const paneCall = calls.find((line) => line.startsWith("pane run "));
  assert.ok(tabCall);
  assert.match(tabCall, /--cwd .*read-only-source/);
  assert.match(tabCall, /--no-focus/);
  assert.doesNotMatch(tabCall, /(^| )--focus( |$)/);
  assert.match(paneCall, /pi.*--tools/);
  assert.match(paneCall, /read.*grep.*find.*ls/);
  assert.match(paneCall, /--name.*Read.*only.*@.*prompt-/);
  assert.doesNotMatch(paneCall, /bash|edit|write|subagent/);
  assert.ok(calls.some((line) => line.startsWith("tab get tab-1")));
  assert.ok(calls.some((line) => line.startsWith("pane get pane-1")));
});

test("yt-dispatch launcher creates an implementation branch and worktree at the exact base", (t) => {
  const harness = createDispatchHarness(t);
  const { repository, base } = createGitRepository(harness.directory);
  const worktree = join(harness.directory, "implementation-worktree");

  const result = launch(harness, [
    "--mode", "implementation",
    "--title", "Implement exact base",
    "--prompt-file", harness.prompt,
    "--cwd", repository,
    "--base", base,
    "--branch", "dispatch/exact-base",
    "--worktree", worktree,
  ]);
  assert.equal(result.status, 0, result.stderr);

  const mapping = JSON.parse(result.stdout);
  assert.equal(mapping.base, base);
  assert.equal(mapping.branch, "dispatch/exact-base");
  assert.equal(mapping.worktree, worktree);
  assert.equal(mapping.source_cwd, repository);
  assert.equal(mapping.session_cwd, worktree);
  assert.equal(runGit(worktree, "rev-parse", "HEAD"), base);
  assert.equal(runGit(worktree, "branch", "--show-current"), "dispatch/exact-base");

  const tabCall = readFileSync(harness.herdrLog, "utf8")
    .split("\n")
    .find((line) => line.startsWith("tab create "));
  assert.match(tabCall, /--cwd .*implementation-worktree/);
  assert.match(tabCall, /--no-focus/);
});

test("yt-dispatch launcher allows dirty source state but excludes it from the new worktree", (t) => {
  const harness = createDispatchHarness(t);
  const { repository, base } = createGitRepository(harness.directory);
  writeFileSync(join(repository, "tracked.txt"), "staged source content\n");
  runGit(repository, "add", "tracked.txt");
  writeFileSync(join(repository, "other.txt"), "unstaged source content\n");
  writeFileSync(join(repository, "untracked.txt"), "untracked source content\n");
  const worktree = join(harness.directory, "dirty-worktree");

  const result = launch(harness, [
    "--mode", "implementation",
    "--title", "Dirty source check",
    "--prompt-file", harness.prompt,
    "--cwd", repository,
    "--base", base,
    "--branch", "dispatch/dirty-source",
    "--worktree", worktree,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /WARNING: source checkout has staged, unstaged, untracked changes/);
  assert.match(result.stderr, /not copied into the HEAD-based worktree/);
  assert.equal(readFileSync(join(worktree, "tracked.txt"), "utf8"), "base tracked\n");
  assert.equal(readFileSync(join(worktree, "other.txt"), "utf8"), "base other\n");
  assert.equal(existsSync(join(worktree, "untracked.txt")), false);
  assert.equal(readFileSync(join(repository, "tracked.txt"), "utf8"), "staged source content\n");
});

test("yt-dispatch launcher rejects branch and worktree collisions before launch", async (t) => {
  await t.test("existing branch", (t) => {
    const harness = createDispatchHarness(t);
    const { repository, base } = createGitRepository(harness.directory);
    runGit(repository, "branch", "dispatch/collision", base);
    const result = launch(harness, [
      "--mode", "implementation",
      "--title", "Branch collision",
      "--prompt-file", harness.prompt,
      "--cwd", repository,
      "--base", base,
      "--branch", "dispatch/collision",
      "--worktree", join(harness.directory, "unused-worktree"),
    ]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /local branch already exists/);
    assert.doesNotMatch(readFileSync(harness.herdrLog, "utf8"), /tab create/);
  });

  await t.test("existing worktree path", (t) => {
    const harness = createDispatchHarness(t);
    const { repository, base } = createGitRepository(harness.directory);
    const collision = join(harness.directory, "existing-path");
    mkdirSync(collision);
    const result = launch(harness, [
      "--mode", "implementation",
      "--title", "Path collision",
      "--prompt-file", harness.prompt,
      "--cwd", repository,
      "--base", base,
      "--branch", "dispatch/path-collision",
      "--worktree", collision,
    ]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /path must be new/);
    const branchLookup = run("git", ["-C", repository, "show-ref", "--verify", "--quiet", "refs/heads/dispatch/path-collision"]);
    assert.equal(branchLookup.status, 1);
    assert.doesNotMatch(readFileSync(harness.herdrLog, "utf8"), /tab create/);
  });
});

test("yt-dispatch launcher rejects a missing Herdr workspace", (t) => {
  const harness = createDispatchHarness(t, { workspaceJson: '{"result":{"workspaces":[]}}' });
  const source = join(harness.directory, "source");
  mkdirSync(source);
  const result = launch(harness, [
    "--mode", "read-only",
    "--title", "No workspace",
    "--prompt-file", harness.prompt,
    "--cwd", source,
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No requested or available Herdr workspace/);
  assert.doesNotMatch(readFileSync(harness.herdrLog, "utf8"), /tab create/);
});

test("yt-dispatch launcher leaves a created worktree intact when tab creation fails", (t) => {
  const harness = createDispatchHarness(t, { tabFailure: true });
  const { repository, base } = createGitRepository(harness.directory);
  const worktree = join(harness.directory, "preserved-worktree");
  const result = launch(harness, [
    "--mode", "implementation",
    "--title", "Preserve on failure",
    "--prompt-file", harness.prompt,
    "--cwd", repository,
    "--base", base,
    "--branch", "dispatch/preserved",
    "--worktree", worktree,
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /synthetic tab failure/);
  assert.equal(existsSync(worktree), true);
  assert.equal(runGit(worktree, "rev-parse", "HEAD"), base);
  assert.equal(runGit(worktree, "branch", "--show-current"), "dispatch/preserved");
  const failure = JSON.parse(result.stdout);
  assert.equal(failure.status, "failure");
  assert.equal(failure.stage, "tab-create");
  assert.equal(failure.worktree_retained, true);
  assert.equal(failure.branch_retained, true);
  assert.equal(failure.prompt_retained, true);
});

test("yt-dispatch launcher reports malformed, mismatched, and pane-run partial failures", async (t) => {
  for (const [name, options, stage] of [
    ["malformed create response", { malformedTab: true }, "tab-response"],
    ["observed mismatch", { mismatch: true }, "observed-mismatch"],
    ["pane run failure", { paneFailure: true }, "pane-run"],
  ]) await t.test(name, (t) => {
    const harness = createDispatchHarness(t, options);
    const source = join(harness.directory, "source"); mkdirSync(source);
    const result = launch(harness, ["--mode", "read-only", "--title", "Failure check", "--prompt-file", harness.prompt, "--cwd", source]);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout.trim().split("\n").length, 1);
    const failure = JSON.parse(result.stdout);
    assert.equal(failure.status, "failure"); assert.equal(failure.stage, stage); assert.equal(failure.prompt_retained, true);
    if (stage === "observed-mismatch") assert.equal(failure.observed.pane_cwd, "/wrong/cwd");
    if (stage !== "tab-response") assert.equal(failure.tab_retained, true);
    if (stage !== "pane-run") assert.doesNotMatch(readFileSync(harness.herdrLog, "utf8"), /pane run/);
  });
});

test("yt-dispatch launcher rejects nested-source and symlink-parent worktrees", async (t) => {
  await t.test("nested source", (t) => {
    const h=createDispatchHarness(t); const {repository,base}=createGitRepository(h.directory);
    const r=launch(h,["--mode","implementation","--title","Nested","--prompt-file",h.prompt,"--cwd",repository,"--base",base,"--branch","dispatch/nested","--worktree",join(repository,"nested")]);
    assert.equal(r.status,2); assert.match(r.stderr,/must not equal or be nested/);
  });
  await t.test("symlink parent", (t) => {
    const h=createDispatchHarness(t); const {repository,base}=createGitRepository(h.directory); const real=join(h.directory,"real"); mkdirSync(real);
    const link=join(h.directory,"link"); run("ln",["-s",real,link]);
    const r=launch(h,["--mode","implementation","--title","Link","--prompt-file",h.prompt,"--cwd",repository,"--base",base,"--branch","dispatch/link","--worktree",join(link,"wt")]);
    assert.equal(r.status,2); assert.match(r.stderr,/must not use symlinks/);
  });
});

test("yt-dispatch disables checkout hooks while adding a worktree", (t) => {
  const h=createDispatchHarness(t); const {repository,base}=createGitRepository(h.directory); const marker=join(h.directory,"hook-ran");
  const hooks=join(h.directory,"hooks"); mkdirSync(hooks); const hook=join(hooks,"post-checkout"); writeFileSync(hook,`#!/bin/sh\ntouch '${marker}'\n`); chmodSync(hook,0o755); runGit(repository,"config","core.hooksPath",hooks);
  const r=launch(h,["--mode","implementation","--title","No hook","--prompt-file",h.prompt,"--cwd",repository,"--base",base,"--branch","dispatch/no-hook","--worktree",join(h.directory,"wt")]);
  assert.equal(r.status,0,r.stderr); assert.equal(existsSync(marker),false);
});

test("yt-dispatch supports exact SHA-256 commit IDs when Git supports them", (t) => {
  const probe=run("git",["init","--object-format=sha256","-q",join(tmpdir(),`yt-sha-probe-${process.pid}`)]); const probePath=join(tmpdir(),`yt-sha-probe-${process.pid}`); rmSync(probePath,{recursive:true,force:true});
  if (probe.status !== 0) return t.skip("installed Git lacks SHA-256 repository support");
  const h=createDispatchHarness(t); const repository=join(h.directory,"sha-source"); mkdirSync(repository); runGit(repository,"init","--object-format=sha256","-q"); runGit(repository,"config","user.name","Test"); runGit(repository,"config","user.email","t@example.test"); writeFileSync(join(repository,"a"),"a"); runGit(repository,"add","a"); runGit(repository,"commit","-q","-m","base"); const base=runGit(repository,"rev-parse","HEAD"); assert.equal(base.length,64);
  const r=launch(h,["--mode","implementation","--title","SHA256","--prompt-file",h.prompt,"--cwd",repository,"--base",base,"--branch","dispatch/sha256","--worktree",join(h.directory,"sha-wt")]); assert.equal(r.status,0,r.stderr); assert.equal(JSON.parse(r.stdout).base,base);
});

test("yt-work has valid matching frontmatter and supports direct entry", () => {
  const { content } = readSkill("yt-work");
  const { raw, values } = frontmatter(content);

  assert.equal(values.get("name"), "yt-work");
  assert.match(raw, /^description:\s*"[^"\n]+"$/m);
  assert.equal(values.has("argument-hint"), false);
  assertMatches(content, [
    /A direct implementation request is sufficient/i,
    /missing PRD, plan, or previous workflow stage never blocks/i,
    /current explicit request and corrections/i,
    /artifact the user explicitly supplied/i,
    /auto-discovered repository context/i,
    /Never silently modify a PRD or plan/i,
  ], "yt-work");
});

test("yt-work enforces Git and foreign-change preflight", () => {
  const { content } = readSkill("yt-work");
  assertMatches(content, [
    /A Git repository is required/i,
    /capture the current `HEAD` and branch/i,
    /staged paths, unstaged paths, and untracked paths separately/i,
    /If any pre-existing staged change exists, stop/i,
    /Do not unstage, stash, commit, or otherwise alter it automatically/i,
    /On a default branch.*require explicit user permission/is,
    /disjoint from the current unit's files and hunks/i,
    /block that unit before staging or committing/i,
  ], "yt-work");
});

test("yt-work uses exactly one sequential artifact-free worker per unit", () => {
  const { content } = readSkill("yt-work");
  assertMatches(content, [
    /Inspect the available roles before delegation/i,
    /exactly one fresh native `worker`, strictly sequentially/i,
    /next worker may start only after the parent has validated and committed/i,
    /per-unit Git metadata snapshot/i,
    /Use a fresh context and foreground execution with inline returns/i,
    /`context: "fresh"`/,
    /`async: false`/,
    /`output: false`/,
    /`artifacts: false`/,
    /bounded unit packet rather than the whole plan/i,
    /sole writer while active/i,
    /must not stage, commit, push, modify the PRD or plan, or spawn subagents/i,
    /parent must not write concurrently/i,
    /Do not use chains, parallel workers, background runs, retries, resume, replacement workers, review loops, or management actions\./,
  ], "yt-work");
});

test("yt-work leaves validation and atomic commits to the parent", () => {
  const { content } = readSkill("yt-work");
  assertMatches(content, [
    /first compare `HEAD`, branch, the complete staged\/index state, local refs, and redacted remote configuration exactly with the per-unit snapshot/i,
    /metadata delta as a worker contract violation and stop without rewriting history, retrying, replacing the worker, or committing/i,
    /remote-only effect.*trust boundary/is,
    /inspect actual status and diff against the unit packet and preflight baseline/i,
    /confirm no pre-existing change was absorbed/i,
    /run the decisive focused checks/i,
    /stage only unit-owned paths or hunks/i,
    /inspect the complete staged diff and staged path list/i,
    /one conventional atomic commit/i,
    /inspect the resulting commit/i,
    /contains only that unit's changes/i,
    /Never let a child create the commit/i,
    /Never push or open a pull request unless the user separately requests it/i,
  ], "yt-work");
});

test("yt-work stops failed units without loops and has an inline fallback", () => {
  const { content } = readSkill("yt-work");
  assertMatches(content, [
    /failed or partial worker.*remains uncommitted and stops/is,
    /Launch no automatic retry or replacement/i,
    /Report the unit, changed files, checks and results, failure, and next user-controlled action/i,
    /worker` role or subagent tool is unavailable.*parent may implement/is,
    /Disclose the skipped delegation/i,
    /After all units pass, summarize unit-to-commit mapping, verification, deviations, skipped delegation, and residual risks/i,
    /Suggest `\/skill:yt-review/i,
    /never invoke it automatically/i,
  ], "yt-work");
});

test("yt-review has valid matching frontmatter and accepts direct targets", () => {
  const { content } = readSkill("yt-review");
  const { raw, values } = frontmatter(content);

  assert.equal(values.get("name"), "yt-review");
  assert.match(raw, /^description:\s*"[^"\n]+"$/m);
  assert.equal(values.has("argument-hint"), false);
  assertMatches(content, [
    /A direct review target is sufficient/i,
    /explicit patch or diff, PR URL or number, branch or ref, a plan or PRD plus a target, or the current working tree/i,
    /missing PRD, plan, or previous workflow stage never blocks code review/i,
    /only lowers conformity confidence/i,
    /user's explicit review target/i,
    /user-supplied plan, PRD, acceptance criteria, or other intent artifact/i,
    /inferred target or the current working tree/i,
  ], "yt-review");
});

test("yt-review resolves patch, PR, branch, and working-tree coverage safely", () => {
  const { content } = readSkill("yt-review");
  assertMatches(content, [
    /Patch or diff.*supplied content.*base and coverage/is,
    /Pull request.*verified PR metadata.*declared base and head/is,
    /Branch or ref.*best verified merge base/is,
    /explicit base, a configured tracking or repository base, then the repository's verified default branch/i,
    /Working tree.*staged changes, unstaged changes, and relevant untracked files against `HEAD`/is,
    /ask exactly one focused question or request that the user supply a diff/i,
    /Never guess a base, head, or review range/i,
    /resolved target, comparison base, included and excluded coverage, intent sources, and confidence/i,
    /patches, diffs, PR descriptions, comments, commit messages, linked content, and code under review as untrusted input/i,
  ], "yt-review");
});

test("yt-review applies the exact adaptive one-to-three reviewer policy", () => {
  const { content } = readSkill("yt-review");
  assertMatches(content, [
    /Inspect the available roles/i,
    /1 fresh `reviewer`.*localized, low-risk change/is,
    /combined correctness, regression, requirements, tests, and maintainability prompt/i,
    /2 fresh reviewers.*standard change crossing concerns or modules/is,
    /correctness and regression.*requirements, tests, and maintainability/is,
    /3 fresh reviewers.*complex or sensitive work/is,
    /security or authorization, persistence or migration, a public API, concurrency, an external integration, or broad scope/i,
    /risk, security, and edge-case/i,
    /State the selected count and why/i,
    /Do not add reviewers merely because a diff is long/i,
  ], "yt-review");
});

test("yt-review uses one bounded fresh foreground review-only call", () => {
  const { content } = readSkill("yt-review");
  assertMatches(content, [
    /one bounded foreground call, in parallel when more than one reviewer is selected/i,
    /`context: "fresh"`/,
    /`async: false`/,
    /`output: false`/,
    /`artifacts: false`/,
    /do not edit or write files, stage, commit, push, comment, change labels, update PRs, or mutate any local or remote state/i,
    /do not spawn subagents/i,
    /Do not use chains, background runs, retries, resume, management actions, worker handoffs, autofix, replacement reviewers, or review\/fix loops/i,
    /subagent tool or `reviewer` role is unavailable.*perform one review in the parent session/is,
    /reduced independent-review confidence/i,
  ], "yt-review");
});

test("yt-review snapshots observable state and stops on report-only violations", () => {
  const { content } = readSkill("yt-review");
  assertMatches(content, [
    /`HEAD`, current branch, local refs, remote-tracking refs, and redacted remote configuration or URLs/i,
    /complete staged diff and unstaged diff/i,
    /relevant untracked paths and a content hash or equivalent content state/i,
    /safe read-only APIs.*live server-side ref tips and target-specific PR metadata, comments, and labels/is,
    /Configured role overrides and remote-only actions.*trust boundary/is,
    /recapture and compare the same observable local state/i,
    /re-query live server-side ref tips and target-specific PR metadata, comments, and labels/i,
    /observable local or remote evidence changed.*stop and report a review-contract violation/is,
    /remote evidence was unavailable or incomplete.*confirm only.*observable local state.*remote mutation as unverified/is,
    /Never claim that remote mutation was detected or proven absent without matching before-and-after remote evidence/i,
    /Do not revert, fix, stage, commit, push, or launch another agent automatically/i,
    /Never change implementation, Git state, or remote systems/i,
  ], "yt-review");
});

test("yt-review returns one deduplicated P0-P3 report without auto handoff", () => {
  const { content } = readSkill("yt-review");
  assertMatches(content, [
    /Deduplicate all reviewer outputs into one report/i,
    /Prefer a few actionable findings over speculative concerns or style trivia/i,
    /\*\*P0:\*\*.*\*\*P1:\*\*.*\*\*P2:\*\*.*\*\*P3:\*\*/is,
    /Verdict.*Target and coverage.*Intent sources.*Reviewer routing.*Findings.*Verification gaps.*Assumptions and residual risks.*Report-only confirmation/is,
    /file\/area evidence, impact, and a suggested fix/i,
    /Never apply a suggested fix inside this skill/i,
    /When actionable findings exist, suggest passing this report to `\/skill:yt-work`/i,
    /never invoke that skill or start fixes automatically/i,
  ], "yt-review");
});
