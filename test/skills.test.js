import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const requiredSkillNames = ["yt-brainstorm", "yt-plan", "yt-review", "yt-work"];
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

test("package manifest exposes only the native skills directory", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

  assert.equal(manifest.private, true);
  assert.deepEqual(manifest.pi, { skills: ["./skills"] });
  assert.equal(manifest.dependencies, undefined);
});

test("skill discovery contains exactly the required four matching directories and files", () => {
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
    /@v0\.1\.0/,
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
