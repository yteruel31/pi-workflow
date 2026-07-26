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
