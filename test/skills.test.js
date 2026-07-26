import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillNames = ["yt-brainstorm", "yt-plan"];

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

test("U2 skills have valid, matching frontmatter", () => {
  for (const name of skillNames) {
    const { content } = readSkill(name);
    const { raw, values } = frontmatter(content);

    assert.equal(values.get("name"), name);
    assert.match(raw, /^description:\s*"[^"\n]+"$/m);
    assert.match(raw, /^argument-hint:\s*"[^"\n]+"$/m);
  }
});

test("both skills preserve direct entry and source authority", () => {
  for (const name of skillNames) {
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

test("both skills keep artifacts optional and ask one question at a time", () => {
  for (const name of skillNames) {
    const { content } = readSkill(name);
    assertMatches(content, [
      /Ask exactly one question at a time\./,
      /Use `ask_user` for a genuine blocking/i,
      /Keep .* in the session by default/i,
      /Never create or update .* unless the user explicitly asks or accepts/i,
    ], name);
  }
});

test("delegation is fresh, bounded, foreground, and artifact-free", () => {
  for (const name of skillNames) {
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
  assert.match(raw, /^argument-hint:\s*"[^"\n]+"$/m);
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
    /foreground execution with inline returns/i,
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
