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
const requiredSkillNames = ["yt-brainstorm", "yt-dispatch", "yt-plan", "yt-quickfix", "yt-review", "yt-test-browser", "yt-work"];
const productSkillNames = ["yt-brainstorm", "yt-plan"];
const requiredAgentNames = [
  "code-reviewer",
  "code-security-reviewer",
  "feasibility-reviewer",
  "implementation-conformity-reviewer",
  "learnings-researcher",
  "plan-reviewer",
  "repo-researcher",
  "scope-guardian",
  "security-reviewer",
  "unit-implementer",
];
const readOnlyAgentNames = requiredAgentNames.filter((name) => name !== "unit-implementer");

function readSkill(name) {
  const path = join(root, "skills", name, "SKILL.md");
  return { path, content: readFileSync(path, "utf8") };
}

function readAgent(name) {
  const path = join(root, "agents", `${name}.md`);
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

const workerBudgetContradictions = [
  // A budget-setting verb is contradictory unless the same directive explicitly omits the budget.
  /\b(?:set|add|give|assign|configure|pass)\b(?=[^\n.]{0,160}\b(?:turnBudget|turn budget)\b)(?![^\n.]{0,160}\b(?:without|omit|omitting|no|neither)\b)[^\n.]{0,160}\b(?:turnBudget|turn budget)\b/i,
  /\b(?:launch|run|invoke|call|start)\b(?=[^\n.]{0,160}\bworkers?\b)(?=[^\n.]{0,160}\b(?:turnBudget|turn budget)\b)(?![^\n.]{0,160}\b(?:without|omit|omitting|no|neither)\b)[^\n.]{0,160}\b(?:turnBudget|turn budget)\b/i,
  /\b(?:set|add|give|assign|configure|pass|launch|run|invoke|call|start)\b(?=[^\n.]{0,160}\bworkers?\b)(?=[^\n.]{0,160}\btoolBudget\b[^\n.]{0,80}\bhard\b|[^\n.]{0,160}\b(?:hard|count-based)\b[^\n.]{0,80}\b(?:toolBudget|tool budget)\b)(?![^\n.]{0,160}\b(?:without|omit|omitting|no|neither)\b)[^\n.]{0,240}/i,
];

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

test("package manifest exposes skills and exactly ten packaged agents", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

  assert.equal(manifest.private, true);
  assert.equal(manifest.version, "0.2.0");
  assert.deepEqual(manifest.pi, {
    skills: ["./skills"],
    subagents: { agents: ["./agents"] },
  });
  assert.equal(manifest.dependencies, undefined);
  assert.deepEqual(
    readdirSync(join(root, "agents")),
    requiredAgentNames.map((name) => `${name}.md`),
  );
});

test("packaged read-only agents have strict Pi discovery metadata and tool boundaries", () => {
  for (const name of readOnlyAgentNames) {
    const { content } = readAgent(name);
    const { values } = frontmatter(content);
    assert.deepEqual([...values.keys()], ["name", "description", "harness", "thinking", "tools"]);
    assert.equal(values.get("name"), name);
    assert.equal(values.get("harness"), "pi");
    assert.equal(values.get("thinking"), "low");
    assert.equal(values.get("tools"), "read, grep, find, ls");
    assertMatches(content, [
      /Stay read-only/i,
      /never edit or write files/i,
      /mutate Git or remote state/i,
      /spawn subagents/i,
    ], name);
    assert.doesNotMatch(values.get("tools"), /bash|edit|write|contact_supervisor/i);
  }

  const learnings = readAgent("learnings-researcher").content;
  assertMatches(learnings, [
    /only local repository files/i,
    /no web, session-history, persistent-memory, or external knowledge access/i,
    /never claim that those sources were checked/i,
  ], "learnings-researcher");
});

test("packaged unit implementer has strict discovery metadata and compliance prompt", () => {
  const content = readFileSync(join(root, "agents", "unit-implementer.md"), "utf8");
  const { raw, values } = frontmatter(content);

  assert.deepEqual([...values.keys()], [
    "name", "package", "description", "thinking", "systemPromptMode",
    "inheritProjectContext", "inheritSkills", "tools", "defaultContext", "acceptanceRole",
  ]);
  assert.equal(values.get("name"), "unit-implementer");
  assert.equal(values.get("package"), "pi-workflow");
  assert.equal(values.get("thinking"), "low");
  assert.equal(values.get("systemPromptMode"), "replace");
  assert.equal(values.get("inheritProjectContext"), "true");
  assert.equal(values.get("inheritSkills"), "false");
  assert.equal(values.get("defaultContext"), "fresh");
  assert.equal(values.get("acceptanceRole"), "writer");
  assert.equal(values.get("tools"), "read, grep, find, ls, bash, edit, write, contact_supervisor");
  for (const forbidden of ["model", "turnBudget", "toolBudget", "dependencies"]) assert.equal(values.has(forbidden), false);
  assertMatches(content, [
    /exactly one bounded, approved yt-work attempt/i,
    /current explicit unit packet and corrections.*artifact explicitly supplied.*repository context/is,
    /private compliance checklist/i,
    /Exact planned paths and artifact boundaries are mandatory unless.*optional/i,
    /test discovery patterns/i,
    /ordinary uncertainty or a minor plan mismatch.*smallest reversible option.*repository patterns/is,
    /record the choice and evidence/i,
    /Only when.*evidence cannot safely resolve.*contact_supervisor.*reason: "need_decision".*wait/is,
    /supervisor normally resolves.*without involving the user/is,
    /contact is unavailable.*stop.*blocked/is,
    /Never stage, commit, or push; mutate Git refs, remotes, or configuration; add or remove worktrees; modify a plan or PRD; or spawn subagents/i,
    /Distinguish failures that already existed.*baseline/is,
    /exclusive writer for the exact files assigned/i,
    /Do not write outside.*exact file-ownership boundary/is,
    /isolated detached worktree supplied as `working_dir`/i,
    /never access or modify a concurrent peer's worktree/i,
    /generated changes.*outside.*ownership boundary is a contract violation/is,
    /Never stage, commit, or push; mutate Git refs, remotes, or configuration; add or remove worktrees/i,
    /exact changed paths/i,
    /nothing was staged, committed, or pushed/i,
  ], "unit implementer");
  assert.doesNotMatch(raw, /model|turnBudget|toolBudget|runtime/i);
});

test("skill discovery contains exactly the required seven matching directories and files", () => {
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

test("repository ships no extra cross-harness or marketplace surfaces", () => {
  const forbiddenRootEntries = [
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
    /pi install git:github\.com\/yteruel31\/pi-toolbox/,
    /pi install git:github\.com\/yteruel31\/pi-workflow/,
    /Both packages are required/i,
    /Restart Pi/i,
    /pi update --extensions/,
    /existing tag or commit/i,
    /tag must already be published/i,
    /@v0\.2\.0/,
    /@<commit>/,
    /\/skill:yt-brainstorm/,
    /\/skill:yt-plan/,
    /\/skill:yt-quickfix/,
    /\/skill:yt-work/,
    /\/skill:yt-review/,
    /`pi-toolbox` v1\.16\.0 or newer supplies `subagent_agents`, `subagent_spawn`, and `subagent_wait`/i,
    /Merge or install that provider release before this workflow change/i,
    /enforces their `tools` frontmatter allowlists/i,
    /provider must expose each profile's `tools` array in `subagent_agents`/i,
    /user\/project overrides and incompatible provider versions are rejected/i,
    /one fresh `unit-implementer` for each initial unit attempt/i,
    /Dependency-ready units with disjoint exact file ownership may run concurrently/i,
    /spawn the whole batch, wait once for all run IDs/i,
    /Independent bounded corrections use a fresh implementer in the same unit worktree while they make measurable progress/i,
    /exactly one packaged `code-reviewer`.*exactly one report.*one bounded pass/is,
    /unsupported timeout, turn-budget, and tool-budget parameters are never invented/i,
    /nine research\/review profiles are technically restricted to `read`, `grep`, `find`, and `ls`/i,
    /stops with a prerequisite or discovery error/i,
    /one atomic commit for each passing unit/i,
    /does not push or open a pull request automatically/i,
    /`yt-review` is report-only/i,
    /observable local repository state/i,
    /best-effort basis/i,
    /remote-only mutation.*configured role overrides.*trust boundaries/is,
    /marks remote state unverified/i,
    /never applies an autofix/i,
    /no npm runtime dependencies/i,
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
    /`yt-brainstorm` has one narrow confirmed handoff/i,
    /final confirmation explicitly warns.*dedicated Orca workspace.*normal interactive Pi.*installed `yt-plan`/is,
    /synthesis-only or PRD approval does not override/i,
    /All other suggestions remain optional/i,
    /no other skill starts the next command automatically/i,
    /Read-only units use the current project cwd/i,
    /implementation units require Git.*separate branches and worktrees/is,
    /auto-start with no focus/i,
    /dispatcher-only.*does not monitor/is,
    /first partial failure.*stops launching.*preserves/is,
    /dirty source checkout.*warned/is,
    /`herdr`, `pi`, and `python3`.*additionally requires `git`/is,
    /`yt-dispatch` remains separate from `pi-toolbox` delegation/is,
    /no hidden or inline fallback/i,
    /yt-dispatch\/SKILL\.md/,
    /yt-dispatch\/scripts\/spawn\.sh\s+# executable/,
    /Pi-only/i,
    /no commands, extensions, converters, or cross-harness compatibility layer/i,
  ], "README dispatch documentation");
});

test("README and CLAUDE document the narrow external Orca planning handoff", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const guidance = readFileSync(join(root, "CLAUDE.md"), "utf8");

  assertMatches(readme, [
    /one narrow confirmed handoff/i,
    /explicit consent.*refusal is respected/is,
    /Optional PRD persistence never delays/i,
    /separately installed Orca, Git, and Pi.*external prerequisites, not package dependencies/is,
    /canonical absolute Git identity rather than trusting UI selection/i,
    /inspects staged, unstaged, and untracked source status without copying dirty changes/i,
    /repository default base/i,
    /`ORCA_CLI_COMMAND`.*`orca-ide` rather than GNOME `orca`/is,
    /Verification is read-only.*does not install or reconfigure.*selected destination base or parent.*rather than assuming source-cwd settings apply/is,
    /separate destination section with the actual configured default or explicitly authorized base\/parent plus resolved destination ref\/commit/i,
    /one agent-first `worktree create.*<default-no-parent-or-authorized-selection>.*--agent pi --prompt.*--setup skip --json`/is,
    /workspace id\/path, startup terminal handle when known, and launch evidence/i,
    /stops without waiting, polling, collecting output, planning inline, implementing, invoking `yt-work`/i,
    /Partial resources are preserved.*without blind retries or duplicate sends/is,
    /trusted prerequisites.*`--setup skip` does not promise zero external effects/is,
  ], "README brainstorm handoff");

  assertMatches(guidance, [
    /except that `yt-brainstorm` launches one dedicated Orca `yt-plan` workspace.*explicitly consents/is,
    /warn that approval launches.*normal interactive Pi planning session/is,
    /never infer launch consent from synthesis-only or PRD approval/i,
    /external Orca, Git, and Pi prerequisites/i,
    /canonical repository explicitly.*inspect source status.*actual configured default base/is,
    /destination-applicable Pi discovery\/settings read-only without installing or reconfiguring/is,
    /source ref separately from the actual default or explicitly authorized destination base\/parent and resolved ref\/commit/i,
    /one agent-first Orca worktree create operation/i,
    /Preserve partial resources.*without retrying, monitoring, orchestrating, planning inline, implementing, or invoking `yt-work`/is,
  ], "CLAUDE brainstorm handoff");
});

test("README documents standalone report-only browser validation and its prerequisite", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");

  assertMatches(readme, [
    /\/skill:yt-test-browser/,
    /standalone, report-only skill/i,
    /reachable URL.*never launches an application server/is,
    /scenario takes priority.*bounded smoke test/is,
    /external Vercel `agent-browser` CLI.*not a package dependency/is,
    /npm install -g agent-browser.*agent-browser install/is,
    /user-prepared, explicitly identified session or profile/i,
    /private temporary directory outside the repository/i,
    /never invokes or automatically suggests another workflow skill/i,
    /yt-test-browser\/SKILL\.md/,
  ], "README browser documentation");
});

test("CLAUDE documents the seven-skill contracts and layout", () => {
  const guidance = readFileSync(join(root, "CLAUDE.md"), "utf8");

  assertMatches(guidance, [
    /provides seven independently invokable skills/i,
    /### `yt-dispatch`/,
    /immediately independent units, at most five/i,
    /one global confirmation/i,
    /current cwd.*isolated Git branches\/worktrees/is,
    /visible Herdr Pi tabs with no focus/i,
    /dispatcher.*do not monitor/is,
    /`herdr`, `pi`, and `python3`, plus `git`/i,
    /first partial failure.*preserve/is,
    /`pi-toolbox` v1\.16\.0 or newer.*release must land before this workflow change/is,
    /dispatch remains separate and has no hidden fallback/i,
    /yt-dispatch\/SKILL\.md/,
    /yt-dispatch\/scripts\/spawn\.sh\s+# executable/,
    /Do not invent unsupported timeout, turn-budget, tool-budget, context, output, or artifact parameters/i,
    /exactly ten profiles/i,
    /Do not tag, publish, push, or open a pull request unless the user asks/i,
    /### `yt-test-browser`/,
    /mandatory reachable URL.*never launch an application server/is,
    /bounded exploratory smoke test/i,
    /direct `agent-browser` binary.*external prerequisite/is,
    /user-prepared, explicitly identified session\/profile/i,
    /mode-700 temporary directory outside the repository/i,
    /yt-test-browser\/SKILL\.md/,
  ], "CLAUDE skill guidance");
  assert.doesNotMatch(guidance, /exactly (?:four|five)/i);
});

test("yt-test-browser defines the standalone external-CLI browser testing contract", () => {
  const { content } = readSkill("yt-test-browser");
  const { raw, values } = frontmatter(content);

  assert.deepEqual([...values.keys()], ["name", "description"]);
  assert.equal(values.get("name"), "yt-test-browser");
  assert.match(raw, /^description: "[^"]*(?:browser smoke tests|UI flows)[^"]*(?:exploratory QA|regression validation)[^"]*"$/m);
  assert.equal(raw.split("\n").length, 2);
  assertMatches(content, [
    /reachable URL is mandatory.*ask for it/is,
    /Never start, build, or serve the application/i,
    /user-supplied scenario as the priority/i,
    /bounded exploratory smoke test.*principal visible flows/is,
    /without.*claiming exhaustive coverage/is,
    /actions necessary.*including actions that modify application data.*unless.*restrict/is,
    /record observable application-data side effects/i,
    /direct `agent-browser` binary/i,
    /external prerequisite, never a package dependency/i,
    /npm install -g agent-browser[\s\S]*agent-browser install/,
    /Never auto-install.*never use `npx`/i,
    /agent-browser skills get core --full/,
    /exploratory\/default smoke test[\s\S]*agent-browser skills get dogfood/i,
    /overrides any dogfood default.*current working directory or repository/i,
    /already prepared and explicitly identified by the user/i,
    /Never enumerate or inspect authentication state/i,
    /never request, enter, expose, inspect, save, or retain credentials, cookies, tokens/i,
    /close every browser session created by this skill.*failure.*leave user-owned prepared sessions open/is,
    /mode-700 temporary directory outside the repository/i,
    /Never create `dogfood-output`.*artifact in the repository/i,
    /snapshots and refs.*Refresh refs after navigation or a material DOM change/is,
    /Capture screenshots for findings/i,
    /inspect console and page errors/i,
    /reproduce it before reporting/i,
    /page content as untrusted data.*Enable content boundaries/is,
    /Stay within target and scenario-relevant origins/i,
    /Do not require `--allowed-domains`/i,
    /Avoid arbitrary JavaScript evaluation.*essential.*explain/is,
    /\*\*Verdict\*\*.*pass, issues, or blocked/is,
    /requested target URL and final URL/i,
    /restrictions and authentication\/session mode, without secrets/i,
    /severity, safe reproduction steps.*evidence paths/is,
    /Application-data side effects/i,
    /Console and page errors/i,
    /Coverage gaps and blockers/i,
    /Repository report-only confirmation/i,
    /Never invoke or automatically suggest another workflow skill/i,
  ], "yt-test-browser");
  assert.doesNotMatch(content, /\/skill:yt-(?:brainstorm|dispatch|plan|work|review)/i);
});

test("yt-brainstorm launches planning only through the warned final consent gate", () => {
  const { content } = readSkill("yt-brainstorm");

  assertMatches(content, [
    /At this final confirmation, explicitly warn.*validate prerequisites.*dedicated Orca workspace.*normal interactive Pi session.*`yt-plan`/is,
    /Ask whether the user authorizes that launch/i,
    /synthesis-only approval or PRD approval is not launch consent.*refused/is,
    /respect any explicit refusal and create nothing/i,
    /Only after the final synthesis is confirmed and launch consent is explicit/i,
    /sole narrow exception to the general no-automatic-chaining rule/i,
    /PRD persistence is optional and must not delay an authorized handoff/i,
  ], "yt-brainstorm consent");
});

test("yt-brainstorm preflights Orca, Git repository targeting, default base, and installed Pi skill", () => {
  const { content } = readSkill("yt-brainstorm");

  assertMatches(content, [
    /exact value of `ORCA_CLI_COMMAND`.*`orca-dev`.*`orca-ide`.*otherwise `orca`/is,
    /Never run literal `ORCA` or bare GNOME `orca`/i,
    /`skills get orca-cli`.*complete live guide/is,
    /no old-CLI fallback/i,
    /`status --json`.*`open --json` once.*re-run `status --json`/is,
    /canonical absolute top-level path.*identity from Git metadata, remotes, source cwd, current ref, and commit/is,
    /Inspect staged, unstaged, and untracked source status.*source-only context.*without copying or summarizing dirty content/is,
    /Never target a repository through current UI selection or inference alone/i,
    /missing, ambiguous, not a valid checkout.*ask one focused question.*do not guess, clone, add, or switch/is,
    /`repo show --repo path:<canonical-absolute-repo> --json`.*actual configured default base/is,
    /`worktree list --repo path:<canonical-absolute-repo> --json`.*worktrees/is,
    /existing Git branches and checkout paths/i,
    /safe, short, collision-free slug/i,
    /Omit `--base-branch` by default/i,
    /Current source ref context is evidence.*never permission to stack/i,
    /`skills installed --json`.*actual target environment's installed skill discovery and Pi settings.*installed, usable `yt-plan`/is,
    /uncommitted or source-only.*is not proof/i,
    /selected destination base or parent, not merely settings inherited from the source cwd/i,
    /Do not install, update, enable, or reconfigure Pi, a skill, or destination settings/i,
    /`enableSkillCommands` is enabled for the destination.*`\/skill:yt-plan <arguments>`/is,
    /commands are disabled.*explicit initial instruction to load and follow that installed `yt-plan`/is,
  ], "yt-brainstorm preflight");
});

test("yt-brainstorm creates one agent-first planning workspace with a complete literal prompt", () => {
  const { content } = readSkill("yt-brainstorm");

  assertMatches(content, [
    /original user request and the final confirmed synthesis/i,
    /actor, problem, intended outcome and value/i,
    /every settled decision, scope item, non-goal, and success criterion/i,
    /assumptions, open questions, and relevant repository or external evidence/i,
    /canonical source repository, source cwd, current ref and commit.*staged, unstaged, or untracked source-only context/is,
    /separate destination section naming the actual configured default base and resolved destination ref and commit.*explicitly authorized base\/parent.*resolved destination ref and commit/is,
    /never describe the source ref as the destination selection/i,
    /substantive context from any authorized artifact inline/i,
    /label each artifact's provenance and destination availability.*source-only files/is,
    /read its checkout's repository guidance.*use only the installed `yt-plan`.*do no implementation.*session output.*without silently creating artifacts/is,
    /single literal argument.*begins `\/skill:yt-plan `/i,
    /one literal `--prompt` argv value/i,
    /Never interpolate it as shell code, use `eval`, or permit command, variable, glob, or newline expansion/i,
    /ORCA worktree create --repo path:<canonical-absolute-repo> --name <safe-slug> <base-or-parent-selection> --agent pi --prompt <complete-prompt-as-one-literal-argv> --setup skip --json/,
    /Use `--no-parent` for the default independent destination.*replace that selection only.*explicitly authorized/is,
    /Do not follow this command with `terminal create` or `terminal send`/i,
  ], "yt-brainstorm launch");
});

test("yt-brainstorm preserves partial handoffs and remains handoff-only", () => {
  const { content } = readSkill("yt-brainstorm");

  assertMatches(content, [
    /does not plan inline, implement, invoke `yt-work`, orchestrate, supervise, wait for completion, or monitor/i,
    /filters and repository Git configuration.*configured terminals.*trusted prerequisites/is,
    /`--setup skip`.*does not guarantee zero external effects/i,
    /Do not copy dirty tracked or untracked changes, secrets, credentials, or auto-commit context/i,
    /creation partially fails or its result is ambiguous, preserve every resource/i,
    /exact known identifiers, stage, and error/i,
    /Do not blindly retry, recreate the workspace, send the prompt again, remove anything, or clean up/i,
    /Read-only `worktree list`.*`terminal list` may be used once.*ambiguity recovery, not planner monitoring/is,
    /After a successful launch, perform no reads, waits, polling, orchestration, output collection, follow-up messages, or planner supervision/i,
    /complete `worktree.id`.*worktree path.*`startupTerminal.handle`.*launch evidence/is,
    /planning was launched, never that the plan finished/i,
  ], "yt-brainstorm partial failure");
});

test("the Orca planning handoff does not alter other skill contracts", () => {
  for (const name of requiredSkillNames.filter((candidate) => candidate !== "yt-brainstorm")) {
    const { content } = readSkill(name);
    assert.doesNotMatch(content, /Confirmed Orca planning handoff|--agent pi --prompt/);
  }

  assertMatches(readSkill("yt-plan").content, [/Never invoke either skill automatically/i], "yt-plan unchanged chaining");
  assertMatches(readSkill("yt-test-browser").content, [/Never invoke or automatically suggest another workflow skill/i], "yt-test-browser unchanged chaining");
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
    /\brun workers? in parallel without exact file ownership\b/i,
    /\bautomatically replace\b/i,
  ], [
    "The worker may stage changes.",
    "The worker may commit changes.",
    "The worker may push changes.",
    "Run workers in parallel without exact file ownership.",
    "Automatically replace failed workers.",
  ], "yt-work");

  assertNoForbiddenPatterns(work, workerBudgetContradictions, "yt-work");
  assertNoForbiddenPatterns(
    `${work}\nConfigure the worker without a turnBudget.\n`,
    workerBudgetContradictions,
    "yt-work compliant budget omission",
  );
  for (const directive of [
    "Set the worker turnBudget to 40.",
    "Launch the worker with a turn budget of 40.",
    "Give the worker a hard toolBudget of 100.",
    "Configure the worker with a count-based tool budget.",
    "Launch the worker using { turnBudget: { maxTurns: 40 } }.",
    "Launch the worker using { toolBudget: { hard: 100 } }.",
  ]) {
    assert.throws(
      () => assertNoForbiddenPatterns(`${work}\n${directive}\n`, workerBudgetContradictions, "yt-work"),
      { name: "AssertionError" },
      `yt-work must reject contradictory budget directive: ${directive}`,
    );
  }

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

test("brainstorm and plan use bounded packaged research agents through pi-toolbox", () => {
  for (const name of productSkillNames) {
    const { content } = readSkill(name);
    assertMatches(content, [
      /inspect (?:the )?available profiles with `subagent_agents`/i,
      /at most one fresh `repo-researcher`/i,
      /at most one fresh `learnings-researcher`/i,
      /local-only/i,
      /`source: "package"`, `package: "pi-workflow"`/i,
      /exact tool list `read, grep, find, ls`/i,
      /higher-precedence override, missing `tools` metadata, or any mismatch/i,
      /`subagent_spawn`/,
      /trusted (?:current )?repository(?: as)? `working_dir`/i,
      /one `subagent_wait` call/i,
      /Do not use chains, retries, resume, replacement agents, or management actions/i,
      /`pi-toolbox`.*package prerequisite/is,
      /stop with the prerequisite or discovery failure/i,
    ], name);
    assert.doesNotMatch(content, /`scout`|`researcher`|async: false|output: false|artifacts: false/i);
  }
});

test("yt-plan reviews drafts with one mandatory and up to three adaptive profiles", () => {
  const { content } = readSkill("yt-plan");
  assertMatches(content, [
    /always run one fresh `plan-reviewer`/i,
    /`scope-guardian`.*scope expansion/is,
    /`feasibility-reviewer`.*cross-module/is,
    /`security-reviewer`.*auth/is,
    /at most four active runs/i,
    /one `subagent_wait` call for all review run IDs/i,
    /disclose skipped adaptive roles with a reason/i,
  ], "yt-plan specialized review");
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
    /`\/skill:yt-plan <request-or-prd-path>`.*optional/i,
    /Outside this one confirmed Orca-to-`yt-plan` handoff, never invoke the next skill automatically\./,
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
  ], "yt-plan");
});

test("yt-plan conditionally suggests dispatch with yt-work as its optional fallback", () => {
  const { content } = readSkill("yt-plan");

  assertMatches(content, [
    /completed plan contains multiple immediately independent units/i,
    /benefit from separate visible sessions/i,
    /optionally suggest `\/skill:yt-dispatch <request-or-plan-path>`/i,
    /Otherwise, end by suggesting `\/skill:yt-work <request-or-plan-path>`/i,
    /Dispatch is never mandatory/i,
    /Never invoke either skill automatically/i,
  ], "yt-plan completion");
  assert.doesNotMatch(content, /^End by suggesting `\/skill:yt-work <request-or-plan-path>`\./m);
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

test("README and CLAUDE document seven skills and the narrow quickfix composition exception", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const guidance = readFileSync(join(root, "CLAUDE.md"), "utf8");

  assertMatches(readme, [
    /`yt-quickfix`.*`\/skill:yt-quickfix`/i,
    /narrow in-session composition exception/i,
    /same-package `yt-work` and `yt-review` siblings/i,
    /`mode:return-to-caller` preserves this complete kernel and changes only completion ownership/i,
    /execute `yt-review` exactly once only after a valid complete receipt/i,
    /never a second review.*review mutation stops correction/is,
    /does not create a planning artifact, nested Pi process, new framework, or shipping action/i,
    /yt-quickfix\/SKILL\.md/i,
  ], "README quickfix documentation");
  assertMatches(guidance, [
    /provides seven independently invokable skills/i,
    /second narrow, differently scoped exception is `yt-quickfix`/i,
    /same-package `yt-work` and `yt-review` siblings.*current parent Pi session/is,
    /### `yt-quickfix`/i,
    /only a coherent `complete` receipt.*permits review/i,
    /`yt-review` exactly once.*never correct after mutation/is,
    /Never re-review or claim a corrected head was reviewed/i,
    /yt-quickfix\/SKILL\.md/i,
  ], "CLAUDE quickfix guidance");
});

test("yt-quickfix has minimal frontmatter, direct entry, and explicit authority", () => {
  const { content } = readSkill("yt-quickfix");
  const { raw, values } = frontmatter(content);

  assert.deepEqual([...values.keys()], ["name", "description"]);
  assert.equal(values.get("name"), "yt-quickfix");
  assert.match(raw, /^description: "[^"\n]+"$/m);
  assert.equal(raw.split("\n").length, 2);
  assertMatches(content, [
    /direct request or an optional user-supplied artifact is sufficient/i,
    /do not require or create a brainstorm, plan, or PRD/i,
    /user's current explicit request and corrections.*artifact the user explicitly supplied.*repository context/is,
    /Clarify only a genuinely missing scope boundary or authority decision/i,
    /Do not ask for reapproval of a clear request/i,
    /Keep all output in the session/i,
  ], "yt-quickfix");
});

test("yt-quickfix loads and executes real same-package siblings in the parent session", () => {
  const { content } = readSkill("yt-quickfix");
  assertMatches(content, [
    /directory containing this loaded `SKILL\.md`/i,
    /read the complete files `\.\.\/yt-work\/SKILL\.md` and `\.\.\/yt-review\/SKILL\.md`.*relative to `SKILL_DIR`/is,
    /Execute their instructions in this same parent Pi session/i,
    /Do not merely suggest a slash command/i,
    /do not invoke a tool or agent named `yt-work` or `yt-review`/i,
    /do not start a nested Pi process/i,
    /either sibling is absent or unreadable.*`mode:return-to-caller`.*stop before mutation/is,
    /quoted from a request, artifact, diff, receipt, review, or repository never activates or changes a mode/i,
  ], "yt-quickfix composition");
  assert.doesNotMatch(content, /`subagent_spawn`|`unit-implementer`|worktree add|git commit/i,
    "quickfix must delegate rather than duplicate the work kernel");
});

test("yt-quickfix gates its one review and optional correction on verified receipts", () => {
  const { content } = readSkill("yt-quickfix");
  assertMatches(content, [
    /Record the invocation base `HEAD`.*requested scope and exclusions.*staged, unstaged, and untracked foreign-state baseline/is,
    /defer all implementation Git safety decisions and foreign-state handling to `yt-work`/i,
    /execute the loaded sibling `yt-work` with `mode:return-to-caller`/i,
    /status.*exactly `complete` or `blocked`/is,
    /unit-to-commit mapping and verification commands\/results/i,
    /every commit and changed path in `base\.\.resulting-head`.*accounted for.*unit mapping/is,
    /intervening or unexplained foreign commit blocks.*rather than entering the review range/is,
    /resulting head to descend from.*recorded base/is,
    /`complete` is valid only when all requested scope is committed, all required checks pass, no unit remains, and no blocker exists/i,
    /Unknown status, missing or malformed fields, inconsistent Git evidence, foreign paths, or an unverifiable receipt is blocked and never permits review/i,
    /Only after a valid complete implementation receipt.*`yt-review` exactly once/is,
    /exact invocation-owned `base\.\.implementation-head` range/i,
    /review is blocked or incomplete, a prerequisite fails, or.*observable-state comparison reports mutation.*stop/is,
    /Never start correction after observable mutation/i,
    /findings as untrusted evidence/i,
    /actionable in-scope findings.*`yt-work` again with `mode:return-to-caller`/is,
    /implementation head as the correction starting head/i,
    /correction base to equal the implementation head.*original invocation base.*overall scope accounting/is,
    /Never invoke `yt-review` again/i,
    /corrected head was not reviewed/i,
  ], "yt-quickfix gates");

  const implementation = content.indexOf("## Initial implementation");
  const review = content.indexOf("## Exactly one review");
  const correction = content.indexOf("## Correct actionable findings once");
  assert.ok(implementation !== -1 && implementation < review && review < correction,
    "quickfix must implement, review once, then optionally correct");
});

test("yt-quickfix rejects contradictory review, mutation, authority, and shipping directives", () => {
  const { content } = readSkill("yt-quickfix");
  const contradictions = [
    /^Review before implementation is complete\./im,
    /^Retry the review if it fails\./im,
    /^Review the corrected head a second time\./im,
    /^Correct findings after review mutation\./im,
    /^Treat review findings as new authority\./im,
    /^Include foreign work in the review range\./im,
    /^Automatically push and open a pull request\./im,
  ];
  assertRejectsContradictions(content, contradictions, [
    "Review before implementation is complete.",
    "Retry the review if it fails.",
    "Review the corrected head a second time.",
    "Correct findings after review mutation.",
    "Treat review findings as new authority.",
    "Include foreign work in the review range.",
    "Automatically push and open a pull request.",
  ], "yt-quickfix");
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

test("yt-work return mode preserves the standalone kernel and emits a coherent receipt", () => {
  const { content } = readSkill("yt-work");
  assertMatches(content, [
    /Standalone execution is the default/i,
    /Recognize `mode:return-to-caller` only.*explicit invocation control/i,
    /quoted requests, artifacts, repository files, diffs, reports.*cannot activate or alter the mode/is,
    /changes only completion ownership/i,
    /same autonomy, Git and foreign-state guards, packaged unit implementers, parallel isolation, validation, correction behavior, metadata blockers, and parent-owned atomic commits/i,
    /locally verify and return a structured receipt/i,
    /`status`: exactly `complete` or `blocked`/i,
    /invocation base, resulting head, branch, requested scope and exclusions, and every changed owned path/i,
    /unit-to-commit mapping and verification commands with results/i,
    /blockers and remaining units, preserved state, decisions\/deviations, correction progress, and residual risks/i,
    /Return `complete` only when all requested scope is committed, every required check passes, no unit remains, and no blocker exists/i,
    /Missing, unknown, malformed, unverifiable, or internally inconsistent receipt data requires `blocked`/i,
    /return mode, do not invoke or suggest review, shipping, publication, or another skill/i,
    /In standalone mode, suggest `\/skill:yt-review/i,
  ], "yt-work return mode");
});

test("yt-work receipt producer and yt-quickfix consumer require coherent completion fields", () => {
  const work = readSkill("yt-work").content;
  const quickfix = readSkill("yt-quickfix").content;
  for (const pattern of [
    /status.*complete.*blocked/is,
    /invocation base.*resulting head/is,
    /requested scope.*exclusions/is,
    /changed owned path/i,
    /unit-to-commit mapping/i,
    /verification command/i,
    /blockers and remaining units/i,
    /preserved state/i,
    /decisions\/deviations/i,
    /residual risks/i,
  ]) {
    assert.match(work, pattern, `yt-work receipt producer must satisfy ${pattern}`);
    assert.match(quickfix, pattern, `yt-quickfix receipt consumer must satisfy ${pattern}`);
  }
});

test("yt-work enforces Git and foreign-change preflight", () => {
  const { content } = readSkill("yt-work");
  assertMatches(content, [
    /A Git repository is required/i,
    /capture the current `HEAD` and branch/i,
    /staged paths, unstaged paths, and untracked paths separately/i,
    /If any pre-existing staged change exists, stop/i,
    /Do not unstage, stash, commit, or otherwise alter it automatically/i,
    /default branch.*requires explicit user authority/is,
    /disjoint from the current unit's files and hunks/i,
    /block before staging or committing/i,
  ], "yt-work");
});

test("yt-work batches only dependency-ready implementers with disjoint file ownership", () => {
  const { content } = readSkill("yt-work");
  assertMatches(content, [
    /Inspect available profiles with `subagent_agents`/i,
    /Require `unit-implementer` to report `source: "package"`, `package: "pi-workflow"`/i,
    /exact tools `read, grep, find, ls, bash, edit, write, contact_supervisor`/i,
    /Never select the generic builtin `worker` or implement inline/i,
    /Build an explicit dependency graph/i,
    /dependency-ready only when all of its dependencies have passed and been committed/i,
    /multiple dependency-ready independent units only when.*exact file ownership.*pairwise disjoint/is,
    /hunk-level separation within one file is insufficient/i,
    /overlapping or uncertain paths remain sequential/i,
    /private temporary parent directory outside the repository with mode 700/i,
    /one detached worktree per unit at that exact batch base/i,
    /core\.hooksPath=\/dev\/null.*worktree add --detach/i,
    /checkout filters and repository Git configuration remain trusted prerequisites/i,
    /safe worktree creation or decisive isolated validation is unavailable.*run it sequentially in the primary worktree/is,
    /snapshot each isolated worktree.*snapshot shared repository metadata/is,
    /trusted isolated worktree as `working_dir`/i,
    /Spawn the whole eligible batch.*one `subagent_spawn` call per unit/is,
    /exactly one `subagent_wait` call containing all returned run IDs/i,
    /must not edit, validate, stage, commit, or perform other work while any batch member is active/i,
    /exclusive writer for its exact attempt-owned files/i,
    /must never stage, commit, push, mutate refs, remotes, or Git configuration, modify a PRD or plan, or spawn subagents/i,
    /Do not invent unsupported context, output, artifact, timeout, turn-budget, or tool-budget parameters/i,
  ], "yt-work");
  assert.doesNotMatch(content, /pi-workflow\.unit-implementer|context: "fresh"|async: false|output: false|artifacts: false/i);
});

test("yt-work validates in isolation and serially integrates atomic commits", () => {
  const { content } = readSkill("yt-work");
  assertMatches(content, [
    /validate every member in its isolated worktree before integrating any member/i,
    /compare the isolated `HEAD`, complete index and status, and shared refs, worktree registrations/i,
    /metadata delta as a hard contract blocker.*do not rewrite history or state, revert it, retry, replace the implementer, stage, or commit/is,
    /remote-only actions are a trust boundary/is,
    /complete result.*tracked edits and deletions, binary changes, and owned untracked files/is,
    /plain `git diff` is insufficient because it omits untracked content/i,
    /check\/build-generated files outside ownership are contract violations/i,
    /decisive enough for integration/i,
    /complete binary-safe patch or equivalent materialization.*tracked edits and deletions, binary content, and owned untracked files/is,
    /never rely on plain `git diff`, which omits untracked content/i,
    /verify clean applicability.*apply the complete result mechanically/is,
    /inspect the complete staged diff and staged path list/i,
    /integration check in the now-uncontaminated primary worktree/i,
    /one conventional atomic commit/i,
    /prove that the commit reproduces the complete isolated unit result.*tracked edits and deletions, binary content, and owned untracked additions.*no unexpected paths/is,
    /Later peer patches remain only in their isolated worktrees/i,
    /commit hooks never see uncommitted peer diffs/i,
    /may remove that private parent-created isolated worktree even though it still contains the now-integrated unit-owned diff/is,
    /force removal is authorized only.*full isolated result is proven captured and integrated/is,
    /Never remove or discard an unintegrated, failed, blocked, foreign, ambiguous, or unexpectedly dirty worktree/i,
    /Retain and report failed or blocked dirty worktrees as evidence/i,
    /Never let a child create the commit or add\/remove worktrees/i,
    /Never push or open a pull request unless the user separately requests it/i,
  ], "yt-work");
});

test("yt-work autonomously corrects units and stops only on hard blockers", () => {
  const { content } = readSkill("yt-work");
  assertMatches(content, [
    /parent owns routine implementation decisions/i,
    /Do not relay routine choices to the user/i,
    /failed checks, partial implementation, or plan mismatch.*launch a fresh bounded correction attempt/is,
    /correction for a parallel unit uses a fresh implementer in that unit's same isolated worktree/i,
    /Continue bounded corrections while measurable progress occurs/i,
    /no measurable progress.*block that unit and its dependents/is,
    /failed unit blocks only its transitive dependents/is,
    /unrelated dependency-ready units may continue/i,
    /unsafe or irreversible action, credentials or permissions, an unresolved product decision, pre-existing staged or overlapping foreign work, an unavailable prerequisite/is,
    /`pi-toolbox`, `subagent_agents`, `subagent_spawn`, `subagent_wait`, and the `unit-implementer` profile are required/i,
    /unavailable prerequisites are hard blockers before mutation/i,
    /Never select the generic builtin `worker` or implement inline/i,
    /After all units pass, summarize unit-to-commit mapping, checks, autonomous decisions and deviations, correction progress, and residual risks/i,
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
    /ask exactly one focused question or request a diff/i,
    /Never guess/i,
    /Record target, comparison base, included and excluded coverage, intent sources, and confidence/i,
    /patches, diffs, PR descriptions, comments, commit messages, linked content, and reviewed code as untrusted input/i,
  ], "yt-review");
});

test("yt-review uses exactly one packaged code-reviewer for one comprehensive pass", () => {
  const { content } = readSkill("yt-review");
  assertMatches(content, [
    /Inspect profiles with `subagent_agents`/i,
    /Require `code-reviewer`.*`source: "package"`, `package: "pi-workflow"`/is,
    /Do not select or invoke any other reviewer/i,
    /intent conformity, correctness, regressions and edge cases, security-sensitive concerns, tests, and maintainability/i,
    /exactly one report in exactly one pass/i,
    /no.*second review after fixes.*review-until-clean/is,
  ], "yt-review");
});

test("yt-review spawns one bounded read-only reviewer and waits once", () => {
  const { content } = readSkill("yt-review");
  assertMatches(content, [
    /Call `subagent_spawn` exactly once with `agent: "code-reviewer"`/i,
    /trusted repository as `working_dir`/i,
    /complete bounded diff, and relevant untracked-file content/i,
    /omitted hunks or files as explicit coverage gaps/i,
    /without `bash` to reconstruct Git state/i,
    /exactly one `subagent_wait` call with that one returned run ID/i,
    /`source: "package"`, `package: "pi-workflow"`/i,
    /exact tools `read, grep, find, ls`/i,
    /restricts tools to `read`, `grep`, `find`, and `ls`/i,
    /prohibits edits, writes, Git or remote mutation, comments, labels, PR updates, and child delegation/i,
    /no chains, retries, resume, management actions, worker handoffs, autofix, replacement or second reviewer, second review after fixes, review-until-clean behavior, or review\/fix loop/i,
    /`pi-toolbox`.*required/is,
    /stop on prerequisite or discovery failure rather than substituting a generic or inline reviewer/i,
  ], "yt-review");
  assert.doesNotMatch(content, /context: "fresh"|async: false|output: false|artifacts: false|`reviewer` role/i);
});

test("yt-review snapshots observable state and stops on report-only violations", () => {
  const { content } = readSkill("yt-review");
  assertMatches(content, [
    /`HEAD`, current branch, local refs, remote-tracking refs, and redacted remote configuration or URLs/i,
    /complete staged and unstaged diffs/i,
    /relevant untracked paths plus content hashes or equivalent state/i,
    /safe read-only APIs.*live server-side ref tips and target-specific PR metadata, comments, and labels/is,
    /Configured role overrides and remote-only actions.*trust boundaries/is,
    /recapture and compare the same observable local state/i,
    /recapture the remote evidence/i,
    /observable local or remote evidence changed.*stop and report a review-contract violation/is,
    /remote evidence was unavailable or incomplete.*confirm only observable local state.*mark remote mutation unverified/is,
    /Never claim remote mutation was detected or absent without matching evidence/i,
    /Do not revert, fix, stage, commit, push, or launch another agent/i,
    /Never change implementation, Git state, or remote systems/i,
  ], "yt-review");
});

test("yt-review returns one deduplicated P0-P3 report without auto handoff", () => {
  const { content } = readSkill("yt-review");
  assertMatches(content, [
    /Synthesize the single reviewer output into exactly one report/i,
    /Prefer a few actionable findings over speculative concerns or style trivia/i,
    /\*\*P0:\*\*.*\*\*P1:\*\*.*\*\*P2:\*\*.*\*\*P3:\*\*/is,
    /Verdict.*Target and coverage.*Intent sources.*Review pass.*Findings.*Verification gaps.*Assumptions and residual risks.*Report-only confirmation/is,
    /file\/area evidence, impact, and suggested fix/i,
    /Never apply a fix/i,
    /When findings exist, suggest passing this report to `\/skill:yt-work`/i,
    /never invoke that skill, start fixes, or run another review automatically/i,
  ], "yt-review");
});
